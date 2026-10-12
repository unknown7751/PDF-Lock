"""PDFLock API application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import routes_jobs, routes_meta
from app.api.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.config import MB, Settings, get_settings
from app.core.errors import AppError
from app.services.job_manager import JobManager
from app.services.storage import JobStorage

logger = logging.getLogger("pdflock")


def _error(status: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message, "hint": hint}},
        status_code=status,
        headers={"Cache-Control": "no-store"},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        storage = JobStorage(settings.resolved_temp_root, settings.min_free_disk_mb * MB)
        manager = JobManager(settings, storage)
        app.state.jobs = manager
        await manager.start_background()
        yield
        await manager.shutdown()

    app = FastAPI(
        title="PDFLock API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # Middleware order: last added is outermost.
    body_cap = settings.max_total_size + 1 * MB + settings.max_files * 2048
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=body_cap)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
        allow_credentials=False,
    )

    app.include_router(routes_meta.router)
    app.include_router(routes_jobs.router)

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status, exc.code, exc.message, exc.hint)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo submitted values: they may include passwords.
        locs = [".".join(str(p) for p in e["loc"]) for e in exc.errors()][:3]
        return _error(422, "invalid_request", "The request was malformed.", "Check: " + ", ".join(locs))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return _error(exc.status_code, code, "The requested resource wasn't found." if exc.status_code == 404
                      else "The request couldn't be completed.")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled error: %s", type(exc).__name__)  # class only: no messages/tracebacks with data
        return _error(500, "internal_error", "Something went wrong on the server.", "Please try again.")

    return app


app = create_app()
