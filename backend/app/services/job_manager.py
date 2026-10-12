"""In-memory job registry and batch runner.

Jobs live only in memory (nothing is written to a database). Each file is
processed independently in a killable subprocess, with bounded concurrency, so
one bad PDF never stops the rest of the batch.
"""

from __future__ import annotations

import asyncio
import logging
import re
import secrets
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.core.errors import AppError, file_error_info
from app.core.security import safe_stem, sanitize_suffix
from app.schemas.jobs import (
    EncryptSettings,
    ErrorInfo,
    FileResult,
    JobCounts,
    JobSnapshot,
    ManifestFile,
    RetryItem,
)
from app.services.storage import JOB_ID_RE, JobStorage
from app.services.worker import WorkerCancelled, WorkerTimeout, run_in_subprocess

logger = logging.getLogger("pdflock.jobs")

DEFAULT_SUFFIX = {"decrypt": "_decrypted", "encrypt": "_protected"}
TERMINAL = {"success", "failed", "skipped", "cancelled"}
IN_FLIGHT = {"queued", "processing"}
FILE_ID_RE = re.compile(r"^[A-Za-z0-9]{1,32}$")


@dataclass
class FileState:
    id: str
    client_id: str
    original_name: str
    output_name: str
    input_path: Path
    output_path: Path
    input_size: int = 0
    status: str = "queued"
    progress: int | None = None
    page_count: int | None = None
    output_size: int | None = None
    error: dict | None = None
    warnings: list[str] = field(default_factory=list)
    # Secrets: held in memory only while the file is waiting/processing.
    password: str = ""
    encrypt_opts: dict | None = None

    def wipe_secrets(self) -> None:
        self.password = ""
        self.encrypt_opts = None

    def fail(self, code: str, message: str | None = None, hint: str | None = None) -> None:
        self.status = "failed" if code != "cancelled" else "cancelled"
        self.error = file_error_info(code, message, hint)
        self.progress = None
        self.wipe_secrets()


class Job:
    def __init__(self, job_id: str, operation: str, directory: Path, ttl: int) -> None:
        self.id = job_id
        self.operation = operation
        self.dir = directory
        self.files: dict[str, FileState] = {}
        self.created_at = time.time()
        self.expires_at = self.created_at + ttl
        self.cancel_event = threading.Event()
        self.cancel_requested = False
        self.deleted = False
        self.version = 0
        self.tasks: set[asyncio.Task] = set()
        self._waiters: list[asyncio.Future] = []
        self._used_names: set[str] = set()

    # ---------------------------------------------------------------- change feed
    def bump(self) -> None:
        self.version += 1
        waiters, self._waiters = self._waiters, []
        for fut in waiters:
            if not fut.done():
                fut.set_result(None)

    async def wait_change(self, last_version: int, timeout: float) -> None:
        if self.version != last_version or self.deleted:
            return
        fut = asyncio.get_running_loop().create_future()
        self._waiters.append(fut)
        try:
            await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            pass

    # ------------------------------------------------------------------- derived
    @property
    def in_flight(self) -> bool:
        return any(f.status in IN_FLIGHT for f in self.files.values())

    @property
    def status(self) -> str:
        if self.in_flight:
            return "processing" if any(f.status == "processing" for f in self.files.values()) or any(
                f.status in TERMINAL for f in self.files.values()
            ) else "queued"
        return "cancelled" if self.cancel_requested else "completed"

    def counts(self) -> JobCounts:
        tally = {k: 0 for k in ("queued", "processing", "success", "failed", "skipped", "cancelled")}
        for f in self.files.values():
            tally[f.status] += 1
        return JobCounts(total=len(self.files), **tally)

    def overall_progress(self) -> float:
        if not self.files:
            return 1.0
        done = 0.0
        for f in self.files.values():
            if f.status in TERMINAL:
                done += 1
            elif f.status == "processing" and f.progress is not None:
                done += min(f.progress, 99) / 100
        return round(done / len(self.files), 4)

    def snapshot(self) -> JobSnapshot:
        base = f"/api/jobs/{self.id}"
        files = []
        for f in self.files.values():
            files.append(
                FileResult(
                    id=f.id,
                    client_id=f.client_id,
                    original_name=f.original_name,
                    input_size=f.input_size,
                    status=f.status,  # type: ignore[arg-type]
                    progress=f.progress,
                    page_count=f.page_count,
                    output_name=f.output_name if f.status == "success" else None,
                    output_size=f.output_size,
                    download_url=f"{base}/files/{f.id}/download" if f.status == "success" else None,
                    error=ErrorInfo(**f.error) if f.error else None,
                    warnings=list(f.warnings),
                )
            )
        counts = self.counts()
        return JobSnapshot(
            id=self.id,
            operation=self.operation,  # type: ignore[arg-type]
            status=self.status,  # type: ignore[arg-type]
            created_at=self.created_at,
            expires_at=self.expires_at,
            counts=counts,
            overall_progress=self.overall_progress(),
            zip_url=f"{base}/download-zip" if counts.success else None,
            files=files,
        )


class JobManager:
    def __init__(self, settings: Settings, storage: JobStorage) -> None:
        self.settings = settings
        self.storage = storage
        self.jobs: dict[str, Job] = {}
        self.gone: OrderedDict[str, None] = OrderedDict()
        self._sem = asyncio.Semaphore(settings.max_concurrency)
        self._leftover_dirs: list[Path] = []
        self._sweeper: asyncio.Task | None = None

    # ------------------------------------------------------------------ lifecycle
    async def start_background(self) -> None:
        self.storage.sweep_stale()
        self._sweeper = asyncio.create_task(self._sweep_loop())

    async def shutdown(self) -> None:
        if self._sweeper:
            self._sweeper.cancel()
        for job in list(self.jobs.values()):
            await self._remove(job, reason="shutdown")

    async def _sweep_loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.cleanup_interval_seconds)
            try:
                await self.expire_due()
            except Exception as exc:  # keep the sweeper alive
                logger.error("sweeper error: %s", type(exc).__name__)

    async def expire_due(self) -> int:
        now = time.time()
        due = [j for j in list(self.jobs.values()) if j.expires_at <= now and not j.in_flight]
        for job in due:
            await self._remove(job, reason="expired")
        for path in list(self._leftover_dirs):
            if self.storage.remove(path):
                self._leftover_dirs.remove(path)
        return len(due)

    async def _remove(self, job: Job, *, reason: str) -> None:
        job.deleted = True
        job.cancel_event.set()
        self.jobs.pop(job.id, None)
        self.gone[job.id] = None
        while len(self.gone) > 2000:
            self.gone.popitem(last=False)
        for fs in job.files.values():
            fs.wipe_secrets()
        job.bump()
        if job.tasks:
            await asyncio.wait(list(job.tasks), timeout=15)
        if not self.storage.remove(job.dir):
            self._leftover_dirs.append(job.dir)
        job.bump()
        logger.info("job %s removed (%s)", job.id[:8], reason)

    # --------------------------------------------------------------------- lookup
    async def get(self, job_id: str) -> Job:
        if JOB_ID_RE.fullmatch(job_id or ""):
            job = self.jobs.get(job_id)
            if job:
                if job.expires_at <= time.time() and not job.in_flight:
                    await self._remove(job, reason="expired")
                    raise AppError("job_expired", "This job has expired and its files were deleted.", status=410,
                                   hint="Upload the files again to start a new job.")
                return job
            if job_id in self.gone:
                raise AppError("job_expired", "This job has expired or was deleted.", status=410,
                               hint="Upload the files again to start a new job.")
        raise AppError("job_not_found", "Job not found.", status=404)

    # --------------------------------------------------------------------- intake
    def allocate(self, operation: str, required_bytes: int) -> Job:
        if len(self.jobs) >= self.settings.max_active_jobs:
            raise AppError("server_busy", "The server is busy right now.", status=503,
                           hint="Please try again in a minute.")
        if not self.storage.has_room_for(required_bytes * 3):
            raise AppError("storage_full", "The server doesn't have enough temporary storage.", status=507,
                           hint="Try again in a few minutes or with fewer files.")
        job_id = secrets.token_urlsafe(32)
        job = Job(job_id, operation, self.storage.create(job_id), self.settings.job_ttl_seconds)
        self.jobs[job_id] = job
        return job

    def add_file(self, job: Job, entry: ManifestFile, filename: str | None, suffix: str | None) -> FileState:
        file_id = secrets.token_hex(8)
        stem = safe_stem(filename)
        out_suffix = sanitize_suffix(suffix, DEFAULT_SUFFIX[job.operation])
        out_stem = f"{stem}{out_suffix}"
        candidate, n = f"{out_stem}.pdf", 1
        while candidate.casefold() in job._used_names:  # duplicate filenames get " (2)", " (3)" ...
            n += 1
            candidate = f"{out_stem} ({n}).pdf"
        job._used_names.add(candidate.casefold())

        fs = FileState(
            id=file_id,
            client_id=entry.client_id,
            original_name=f"{stem}.pdf",
            output_name=candidate,
            input_path=job.dir / "in" / f"{file_id}.pdf",
            output_path=job.dir / "out" / f"{file_id}.pdf",
            password=entry.password.get_secret_value(),
            encrypt_opts=_options_dict(entry.encrypt) if job.operation == "encrypt" else None,
        )
        job.files[file_id] = fs
        return fs

    def start(self, job: Job, file_ids: list[str] | None = None) -> None:
        job.expires_at = time.time() + self.settings.job_ttl_seconds
        ids = file_ids if file_ids is not None else list(job.files)
        logger.info("job %s started: %s x%d", job.id[:8], job.operation, len(ids))
        for fid in ids:
            fs = job.files[fid]
            if fs.status != "queued":
                continue
            task = asyncio.create_task(self._process_file(job, fs))
            job.tasks.add(task)
            task.add_done_callback(job.tasks.discard)
        job.bump()

    async def discard(self, job: Job) -> None:
        """Abort a job that failed during intake."""
        await self._remove(job, reason="intake-failed")

    # ----------------------------------------------------------------- processing
    async def _process_file(self, job: Job, fs: FileState) -> None:
        try:
            async with self._sem:
                if fs.status != "queued" or job.cancel_event.is_set():
                    if fs.status == "queued":
                        fs.fail("cancelled")
                        job.bump()
                    return
                fs.status, fs.progress = "processing", None
                job.bump()
                await self._run_one(job, fs)
        except asyncio.CancelledError:
            fs.fail("cancelled")
            raise
        finally:
            fs.wipe_secrets()
            self._finish_if_done(job)

    async def _run_one(self, job: Job, fs: FileState) -> None:
        loop = asyncio.get_running_loop()
        task: dict[str, Any] = {
            "operation": job.operation,
            "src": str(fs.input_path),
            "dst": str(fs.output_path),
            "password": fs.password,
            "options": fs.encrypt_opts,
            "max_pages": self.settings.max_pages,
        }

        def on_progress(pct: int) -> None:
            loop.call_soon_threadsafe(self._set_progress, job, fs, pct)

        result: dict[str, Any]
        try:
            result = await asyncio.to_thread(
                run_in_subprocess,
                task,
                timeout=self.settings.processing_timeout_seconds,
                cancel_event=job.cancel_event,
                on_progress=on_progress,
            )
        except WorkerCancelled:
            result = {"status": "failed", "code": "cancelled"}
        except WorkerTimeout:
            result = {"status": "failed", "code": "processing_timeout"}
        except Exception as exc:  # noqa: BLE001
            logger.error("job %s file error: %s", job.id[:8], type(exc).__name__)
            result = {"status": "failed", "code": "internal_error"}
        finally:
            task.clear()
            fs.wipe_secrets()

        self._apply_result(fs, result)
        job.bump()

    def _set_progress(self, job: Job, fs: FileState, pct: int) -> None:
        if fs.status == "processing" and not job.deleted:
            fs.progress = max(0, min(100, pct))
            job.bump()

    def _apply_result(self, fs: FileState, result: dict[str, Any]) -> None:
        status = result.get("status")
        if status == "success" and fs.output_path.exists():
            fs.status, fs.progress, fs.error = "success", 100, None
            fs.page_count = result.get("page_count")
            fs.warnings = list(result.get("warnings") or [])
            fs.output_size = fs.output_path.stat().st_size
            return
        _unlink(fs.output_path)  # never leave partial output behind
        fs.progress = None
        if status == "skipped":
            fs.status = "skipped"
            fs.error = file_error_info(result.get("error_code") or "not_encrypted")
            fs.page_count = result.get("page_count")
        else:
            fs.fail(result.get("code") or "internal_error", result.get("message"), result.get("hint"))

    def _finish_if_done(self, job: Job) -> None:
        if not job.deleted and not job.in_flight:
            job.expires_at = time.time() + self.settings.job_ttl_seconds
            job.bump()

    # -------------------------------------------------------------- user actions
    def cancel(self, job: Job) -> None:
        """Stop queued/running files; finished results stay downloadable."""
        job.cancel_requested = True
        job.cancel_event.set()
        for fs in job.files.values():
            if fs.status == "queued":
                fs.fail("cancelled")
        job.bump()

    def retry(self, job: Job, items: list[RetryItem]) -> None:
        seen: set[str] = set()
        targets: list[tuple[FileState, RetryItem]] = []
        for item in items:
            fs = job.files.get(item.file_id) if FILE_ID_RE.fullmatch(item.file_id) else None
            if fs is None:
                raise AppError("file_not_found", "File not found in this job.", status=404)
            if item.file_id in seen:
                continue
            seen.add(item.file_id)
            if fs.status in IN_FLIGHT:
                raise AppError("already_processing", "This file is already being processed.", status=409)
            if fs.status not in ("failed", "cancelled"):
                raise AppError("not_retryable", "Only failed or cancelled files can be retried.", status=409)
            targets.append((fs, item))

        if job.cancel_event.is_set():
            if job.in_flight:  # previous run still shutting down
                raise AppError("already_processing", "The previous run is still stopping.", status=409,
                               hint="Wait a moment and retry.")
            job.cancel_event = threading.Event()
            job.cancel_requested = False

        for fs, item in targets:
            _unlink(fs.output_path)
            fs.status, fs.progress, fs.error, fs.warnings = "queued", None, None, []
            fs.output_size = None
            fs.password = item.password.get_secret_value()
            fs.encrypt_opts = _options_dict(item.encrypt) if job.operation == "encrypt" else None
        self.start(job, [fs.id for fs, _ in targets])

    async def delete(self, job: Job) -> None:
        await self._remove(job, reason="deleted")


def _options_dict(settings: EncryptSettings | None) -> dict:
    s = settings or EncryptSettings()
    return {
        "algorithm": s.algorithm,
        "owner_password": s.owner_password.get_secret_value() if s.owner_password else None,
        "allow_print": s.allow_print,
        "allow_copy": s.allow_copy,
        "allow_edit": s.allow_edit,
    }


def _unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
