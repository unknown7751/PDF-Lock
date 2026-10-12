"""Job endpoints: create, inspect, stream, download, cancel, retry, delete."""

from __future__ import annotations

import asyncio
import errno
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError
from starlette.background import BackgroundTask

from app.core.errors import AppError
from app.core.security import looks_like_pdf
from app.schemas.jobs import JobManifest, JobSnapshot, RetryRequest
from app.services.job_manager import FILE_ID_RE, Job, JobManager
from app.services.zipper import build_zip

logger = logging.getLogger("pdflock.api")
router = APIRouter(prefix="/api/jobs", tags=["jobs"])

CHUNK = 1024 * 1024
_ERROR_RESPONSES = {
    404: {"description": "Not found"},
    410: {"description": "Job expired"},
}


def get_manager(request: Request) -> JobManager:
    return request.app.state.jobs


def _parse_manifest(raw: str) -> JobManifest:
    try:
        return JobManifest.model_validate_json(raw)
    except ValidationError as exc:
        # Report locations only: error `input` values could contain passwords.
        first = exc.errors(include_input=False, include_url=False, include_context=False)[0]
        where = ".".join(str(p) for p in first["loc"])
        raise AppError("invalid_manifest", "The batch description is invalid.", status=422,
                       hint=f"Problem near “{where}”.") from None


async def _save_upload(upload: UploadFile, dest: Path, max_size: int) -> tuple[int, str | None]:
    """Stream an upload to disk. Returns (bytes_seen, rejection_code | None)."""
    size = 0
    head = b""
    try:
        with dest.open("wb") as out:
            while chunk := await upload.read(CHUNK):
                if size == 0:
                    head = chunk[:1024]
                size += len(chunk)
                if size > max_size:
                    break
                out.write(chunk)
    except OSError as exc:
        dest.unlink(missing_ok=True)
        if exc.errno == errno.ENOSPC:
            raise AppError("storage_full", "The server ran out of temporary storage.", status=507,
                           hint="Try again in a few minutes.") from None
        raise
    code = None
    if size > max_size:
        code = "file_too_large"
    elif size == 0:
        code = "empty_file"
    elif not looks_like_pdf(head):
        code = "not_a_pdf"
    if code:
        dest.unlink(missing_ok=True)
    return size, code


@router.post("", status_code=202, response_model=JobSnapshot, responses=_ERROR_RESPONSES)
async def create_job(
    request: Request,
    manifest: str = Form(..., description="JSON batch description (see JobManifest)"),
    files: list[UploadFile] = File(..., description="PDFs, in the same order as manifest.files"),
    manager: JobManager = Depends(get_manager),
) -> JobSnapshot:
    settings = manager.settings
    parsed = _parse_manifest(manifest)
    if len(parsed.files) != len(files):
        raise AppError("file_count_mismatch", "The number of files doesn't match the batch description.", status=422)
    if len(files) > settings.max_files:
        raise AppError("too_many_files", f"You can process at most {settings.max_files} files at once.",
                       status=413, hint="Split your files into several batches.")
    if len({f.client_id for f in parsed.files}) != len(parsed.files):
        raise AppError("invalid_manifest", "Each file needs a unique client_id.", status=422)

    declared = request.headers.get("content-length")
    required = int(declared) if declared and declared.isdigit() else settings.max_file_size
    job = manager.allocate(parsed.operation, required)
    try:
        total = 0
        for upload, entry in zip(files, parsed.files):
            fs = manager.add_file(job, entry, upload.filename, parsed.name_suffix)
            size, rejection = await _save_upload(upload, fs.input_path, settings.max_file_size)
            fs.input_size = min(size, settings.max_file_size + 1) if rejection == "file_too_large" else size
            total += size
            if total > settings.max_total_size:
                raise AppError("payload_too_large", "The upload is larger than the allowed total size.",
                               status=413, hint="Upload fewer or smaller files.")
            if rejection:
                fs.fail(rejection)
    except BaseException:
        await manager.discard(job)
        raise
    manager.start(job)
    return job.snapshot()


@router.get("/{job_id}", response_model=JobSnapshot, responses=_ERROR_RESPONSES)
async def get_job(job_id: str, manager: JobManager = Depends(get_manager)) -> JobSnapshot:
    return (await manager.get(job_id)).snapshot()


@router.get("/{job_id}/events", responses=_ERROR_RESPONSES)
async def job_events(job_id: str, request: Request, manager: JobManager = Depends(get_manager)):
    """Server-Sent Events: a full snapshot on every change, then `done`."""
    job = await manager.get(job_id)

    async def stream():
        last = -1
        while True:
            if await request.is_disconnected():
                return
            if job.deleted:
                yield "event: gone\ndata: {}\n\n"
                return
            if job.version != last:
                last = job.version
                snap = job.snapshot()
                yield f"event: snapshot\ndata: {snap.model_dump_json()}\n\n"
                if snap.status in ("completed", "cancelled"):
                    yield "event: done\ndata: {}\n\n"
                    return
                await asyncio.sleep(0.1)  # coalesce bursts of progress updates
                continue
            await job.wait_change(last, 15)
            if job.version == last and not job.deleted:
                yield ": keep-alive\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _find_file(job: Job, file_id: str):
    fs = job.files.get(file_id) if FILE_ID_RE.fullmatch(file_id or "") else None
    if fs is None:
        raise AppError("file_not_found", "File not found in this job.", status=404)
    return fs


@router.get("/{job_id}/files/{file_id}/download", responses=_ERROR_RESPONSES)
async def download_file(job_id: str, file_id: str, manager: JobManager = Depends(get_manager)):
    job = await manager.get(job_id)
    fs = _find_file(job, file_id)
    if fs.status != "success":
        raise AppError("file_not_ready", "This file has no result to download.", status=409,
                       hint="Only successfully processed files can be downloaded.")
    if not fs.output_path.exists():
        raise AppError("file_not_found", "The result is no longer available.", status=404)
    return FileResponse(fs.output_path, media_type="application/pdf", filename=fs.output_name)


@router.get("/{job_id}/download-zip", responses=_ERROR_RESPONSES)
async def download_zip(job_id: str, manager: JobManager = Depends(get_manager)):
    job = await manager.get(job_id)
    if not any(f.status == "success" for f in job.files.values()):
        raise AppError("no_results", "There are no successful results to download.", status=409)
    try:
        archive = await asyncio.to_thread(build_zip, job)
    except Exception as exc:  # noqa: BLE001
        logger.error("zip failed for job %s: %s", job.id[:8], type(exc).__name__)
        raise AppError("zip_failed", "The ZIP archive couldn't be created.", status=500,
                       hint="Download the files individually, or try again.") from None
    suffix = "decrypted" if job.operation == "decrypt" else "protected"
    return FileResponse(
        archive,
        media_type="application/zip",
        filename=f"pdflock-{suffix}.zip",
        background=BackgroundTask(lambda: archive.unlink(missing_ok=True)),
    )


@router.post("/{job_id}/cancel", response_model=JobSnapshot, responses=_ERROR_RESPONSES)
async def cancel_job(job_id: str, manager: JobManager = Depends(get_manager)) -> JobSnapshot:
    """Stop unfinished files; finished results remain available until the job expires."""
    job = await manager.get(job_id)
    manager.cancel(job)
    return job.snapshot()


@router.post("/{job_id}/retry", response_model=JobSnapshot, status_code=202, responses=_ERROR_RESPONSES)
async def retry_files(job_id: str, body: RetryRequest, manager: JobManager = Depends(get_manager)) -> JobSnapshot:
    """Re-run failed/cancelled files with new passwords, without re-uploading."""
    job = await manager.get(job_id)
    manager.retry(job, body.files)
    return job.snapshot()


@router.delete("/{job_id}", status_code=204, responses=_ERROR_RESPONSES)
async def delete_job(job_id: str, manager: JobManager = Depends(get_manager)) -> Response:
    """Cancel everything in flight and delete all of the job's files immediately."""
    job = await manager.get(job_id)
    await manager.delete(job)
    return Response(status_code=204)
