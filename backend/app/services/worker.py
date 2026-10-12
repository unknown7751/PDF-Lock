"""Per-file worker running in an isolated, killable subprocess.

Running qpdf/pikepdf out-of-process gives us hard timeouts and instant
cancellation (blocking C++ calls can't be interrupted inside a thread) and
keeps a crash on a hostile PDF from taking the API server down.

Passwords travel to the child over the spawn pipe (never on a command line)
and are dropped as soon as the task finishes.
"""

from __future__ import annotations

import logging
import multiprocessing as mp
import threading
import time
from pathlib import Path
from typing import Any, Callable

from app.core.errors import ProcessingError
from app.services.pdf_processor import EncryptOptions, decrypt_pdf, encrypt_pdf

logger = logging.getLogger("pdflock.worker")

_CTX = mp.get_context("spawn")


class WorkerCancelled(Exception):
    pass


class WorkerTimeout(Exception):
    pass


# ------------------------------------------------------------------ child side


def _child_main(conn: Any, task: dict[str, Any]) -> None:
    """Entry point executed in the subprocess. Sends progress + one result message."""
    last = {"pct": -10}

    def on_progress(pct: int) -> None:
        if pct >= 100 or pct - last["pct"] >= 5:
            last["pct"] = pct
            try:
                conn.send(("progress", int(pct)))
            except Exception:
                pass

    try:
        src, dst = Path(task["src"]), Path(task["dst"])
        if task["operation"] == "decrypt":
            outcome = decrypt_pdf(
                src, dst, task["password"], max_pages=task["max_pages"], progress=on_progress
            )
        else:
            outcome = encrypt_pdf(
                src,
                dst,
                task["password"],
                EncryptOptions(**task["options"]),
                max_pages=task["max_pages"],
                progress=on_progress,
            )
        conn.send(
            (
                "result",
                {
                    "status": outcome.status,
                    "page_count": outcome.page_count,
                    "warnings": outcome.warnings,
                    "error_code": outcome.error_code,
                },
            )
        )
    except ProcessingError as exc:
        conn.send(
            ("result", {"status": "failed", "code": exc.code, "message": exc.message, "hint": exc.hint})
        )
    except BaseException as exc:  # noqa: BLE001 - last line of defence, log class only
        try:
            conn.send(("result", {"status": "failed", "code": "internal_error"}))
        finally:
            logger.error("worker crashed: %s", type(exc).__name__)
    finally:
        task.clear()  # drop the password reference
        conn.close()


# ----------------------------------------------------------------- parent side


def run_in_subprocess(
    task: dict[str, Any],
    *,
    timeout: float,
    cancel_event: threading.Event,
    on_progress: Callable[[int], None] | None = None,
) -> dict[str, Any]:
    """Run one file task in a child process. Blocking; call via a worker thread.

    Returns the child's result dict. Raises WorkerCancelled / WorkerTimeout after
    killing the child.
    """
    parent_conn, child_conn = _CTX.Pipe(duplex=False)
    proc = _CTX.Process(target=_child_main, args=(child_conn, task), daemon=True)
    proc.start()
    child_conn.close()
    deadline = time.monotonic() + timeout
    result: dict[str, Any] | None = None
    try:
        while result is None:
            if cancel_event.is_set():
                raise WorkerCancelled()
            if time.monotonic() > deadline:
                raise WorkerTimeout()
            if parent_conn.poll(0.1):
                try:
                    kind, payload = parent_conn.recv()
                except EOFError:
                    break  # child died without a result
                if kind == "progress":
                    if on_progress:
                        on_progress(payload)
                else:
                    result = payload
            elif not proc.is_alive() and not parent_conn.poll(0):
                break
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join(5)
        parent_conn.close()
    if result is None:
        logger.error("worker exited without a result (exit code %s)", proc.exitcode)
        return {"status": "failed", "code": "internal_error"}
    return result
