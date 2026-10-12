"""Isolated per-job temporary directories (kept outside any served path)."""

from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path

logger = logging.getLogger("pdflock.storage")

# secrets.token_urlsafe(32) always yields 43 chars of this alphabet.
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
MARKER = ".pdflock-job"


class JobStorage:
    def __init__(self, root: Path, min_free_bytes: int = 0) -> None:
        self.root = root
        self.min_free_bytes = min_free_bytes
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.root, 0o700)
        except OSError:
            pass

    # ------------------------------------------------------------------ space
    def free_bytes(self) -> int:
        return shutil.disk_usage(self.root).free

    def has_room_for(self, required: int) -> bool:
        return self.free_bytes() >= required + self.min_free_bytes

    # --------------------------------------------------------------- lifecycle
    def create(self, job_id: str) -> Path:
        if not JOB_ID_RE.fullmatch(job_id):
            raise ValueError("invalid job id")
        job_dir = self.root / job_id
        (job_dir / "in").mkdir(parents=True)
        (job_dir / "out").mkdir()
        (job_dir / MARKER).touch()
        try:
            os.chmod(job_dir, 0o700)
        except OSError:
            pass
        return job_dir

    def remove(self, job_dir: Path) -> bool:
        """Delete a job directory. Refuses anything that isn't a direct child of root."""
        try:
            resolved = job_dir.resolve()
        except OSError:
            return False
        if resolved.parent != self.root or not JOB_ID_RE.fullmatch(resolved.name):
            logger.error("refusing to delete unexpected path")
            return False
        shutil.rmtree(resolved, ignore_errors=True)
        return not resolved.exists()

    def sweep_stale(self) -> int:
        """Remove leftover job directories from a previous (crashed) run."""
        removed = 0
        for child in self.root.iterdir():
            if child.is_dir() and JOB_ID_RE.fullmatch(child.name) and (child / MARKER).exists():
                if self.remove(child):
                    removed += 1
        return removed
