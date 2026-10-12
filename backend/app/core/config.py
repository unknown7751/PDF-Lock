"""Runtime configuration, read from PDFLOCK_* environment variables."""

from __future__ import annotations

import tempfile
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PDFLOCK_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Upload limits (also advertised to the frontend via GET /api/config).
    max_file_size_mb: int = Field(50, ge=1, le=1024)
    max_total_size_mb: int = Field(200, ge=1, le=4096)
    max_files: int = Field(20, ge=1, le=200)
    max_pages: int = Field(2000, ge=1)

    # Job lifecycle.
    job_ttl_seconds: int = Field(900, ge=1)
    cleanup_interval_seconds: int = Field(30, ge=1)
    max_active_jobs: int = Field(25, ge=1)

    # Processing.
    max_concurrency: int = Field(3, ge=1, le=32)
    processing_timeout_seconds: int = Field(120, ge=1)

    # Storage. Defaults to <system temp>/pdflock-jobs (never a served directory).
    temp_root: Path | None = None
    min_free_disk_mb: int = Field(256, ge=0)

    # Comma-separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def max_file_size(self) -> int:
        return self.max_file_size_mb * MB

    @property
    def max_total_size(self) -> int:
        return self.max_total_size_mb * MB

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_temp_root(self) -> Path:
        return (self.temp_root or Path(tempfile.gettempdir()) / "pdflock-jobs").resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
