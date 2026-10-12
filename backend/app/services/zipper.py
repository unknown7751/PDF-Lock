"""Build a ZIP of a job's successful results."""

from __future__ import annotations

import secrets
import zipfile
from pathlib import Path

from app.services.job_manager import Job


def build_zip(job: Job) -> Path:
    """Write results-<random>.zip into the job directory and return its path.

    Raises FileNotFoundError / OSError / zipfile.BadZipFile on failure; the
    partial archive is removed before the error propagates.
    """
    target = job.dir / f"results-{secrets.token_hex(6)}.zip"
    try:
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
            for fs in job.files.values():
                if fs.status == "success":
                    # arcname comes from server-sanitised, de-duplicated output names
                    zf.write(fs.output_path, arcname=fs.output_name)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return target
