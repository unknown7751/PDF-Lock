"""Pydantic models for the public API (requests and responses)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr

Operation = Literal["encrypt", "decrypt"]
FileStatus = Literal["queued", "processing", "success", "failed", "skipped", "cancelled"]
JobStatus = Literal["queued", "processing", "completed", "cancelled"]


# ------------------------------------------------------------------ requests


class EncryptSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    algorithm: Literal["aes-256", "aes-128"] = "aes-256"
    owner_password: SecretStr | None = Field(default=None, max_length=256, repr=False)
    allow_print: bool = True
    allow_copy: bool = True
    allow_edit: bool = True


class ManifestFile(BaseModel):
    """Per-file instructions. Matches the uploaded part with the same index."""

    model_config = ConfigDict(extra="forbid")

    client_id: str = Field(min_length=1, max_length=64, pattern=r"^[\w\-.]+$")
    # Existing password (decrypt) or new password (encrypt). Never logged or echoed.
    password: SecretStr = Field(default=SecretStr(""), max_length=1024, repr=False)
    encrypt: EncryptSettings | None = None


class JobManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: Operation
    # Suffix appended to each output name ("" keeps the original name).
    name_suffix: str | None = Field(default=None, max_length=64)
    files: list[ManifestFile] = Field(min_length=1, max_length=500)


class RetryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9]+$")
    password: SecretStr = Field(default=SecretStr(""), max_length=1024, repr=False)
    encrypt: EncryptSettings | None = None


class RetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: list[RetryItem] = Field(min_length=1, max_length=500)


# ----------------------------------------------------------------- responses


class ErrorInfo(BaseModel):
    code: str
    message: str
    hint: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorInfo


class FileResult(BaseModel):
    id: str
    client_id: str
    original_name: str
    input_size: int
    status: FileStatus
    # 0-100 when the engine reports real progress, otherwise null (indeterminate).
    progress: int | None = None
    page_count: int | None = None
    output_name: str | None = None
    output_size: int | None = None
    download_url: str | None = None
    error: ErrorInfo | None = None
    warnings: list[str] = []


class JobCounts(BaseModel):
    total: int
    queued: int
    processing: int
    success: int
    failed: int
    skipped: int
    cancelled: int


class JobSnapshot(BaseModel):
    id: str
    operation: Operation
    status: JobStatus
    created_at: float
    expires_at: float
    counts: JobCounts
    overall_progress: float  # 0..1
    zip_url: str | None = None
    files: list[FileResult]


class LimitsResponse(BaseModel):
    max_file_size_bytes: int
    max_total_size_bytes: int
    max_files: int
    max_pages: int
    job_ttl_seconds: int
    processing_timeout_seconds: int
    algorithms: list[str]
