"""Health and configuration endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.jobs import LimitsResponse

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config", response_model=LimitsResponse)
async def config(request: Request) -> LimitsResponse:
    s = request.app.state.jobs.settings
    return LimitsResponse(
        max_file_size_bytes=s.max_file_size,
        max_total_size_bytes=s.max_total_size,
        max_files=s.max_files,
        max_pages=s.max_pages,
        job_ttl_seconds=s.job_ttl_seconds,
        processing_timeout_seconds=s.processing_timeout_seconds,
        algorithms=["aes-256", "aes-128"],
    )
