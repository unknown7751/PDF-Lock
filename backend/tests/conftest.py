"""Shared fixtures. All PDFs are generated here; all passwords are test-only values."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pikepdf
import pytest
from fastapi.testclient import TestClient
from pikepdf import Dictionary, Encryption, Name, Permissions

from app.core.config import Settings
from app.main import create_app

OPEN_PW = "test-open-pw-1"
OWNER_PW = "test-owner-pw-2"
WRONG_PW = "definitely-wrong-pw"


def make_pdf(path: Path, pages: int = 2, title: str = "PDFLock Test Document") -> Path:
    pdf = pikepdf.new()
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    for i in range(pages):
        page = pdf.add_blank_page(page_size=(612, 792))
        page.Resources = Dictionary(Font=Dictionary(F1=font))
        page.Contents = pdf.make_stream(f"BT /F1 24 Tf 72 700 Td (PDFLock page {i + 1}) Tj ET".encode())
    pdf.docinfo["/Title"] = title
    pdf.docinfo["/Author"] = "Test Author"
    pdf.save(path)
    return path


def make_encrypted_pdf(
    path: Path,
    user: str = OPEN_PW,
    owner: str = OWNER_PW,
    pages: int = 2,
    allow: Permissions | None = None,
    R: int = 6,
) -> Path:
    plain = make_pdf(path.with_suffix(".plain.pdf"), pages)
    with pikepdf.open(plain) as pdf:
        pdf.save(path, encryption=Encryption(user=user, owner=owner, R=R, allow=allow or Permissions(
            modify_assembly=True)))
    plain.unlink()
    return path


def page_text_streams(path: Path, password: str = "") -> list[bytes]:
    with pikepdf.open(path, password=password) as pdf:
        return [bytes(p.Contents.read_bytes()) for p in pdf.pages]


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        temp_root=tmp_path / "jobs",
        max_file_size_mb=1,
        max_total_size_mb=3,
        max_files=4,
        job_ttl_seconds=60,
        processing_timeout_seconds=60,
        cleanup_interval_seconds=3600,
        min_free_disk_mb=0,
        max_concurrency=3,
        cors_origins="http://localhost:5173",
    )


@pytest.fixture
def client(settings: Settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def pdf_dir(tmp_path: Path) -> Path:
    d = tmp_path / "pdfs"
    d.mkdir()
    return d


class Api:
    """Thin helper around TestClient for the job endpoints."""

    def __init__(self, client: TestClient):
        self.c = client

    def create(self, operation: str, items: list[dict], suffix: str | None = None, expect: int = 202):
        """items: {name, data, password?, encrypt?, client_id?}"""
        manifest = {
            "operation": operation,
            "files": [
                {
                    "client_id": it.get("client_id", f"c{i}"),
                    "password": it.get("password", ""),
                    **({"encrypt": it["encrypt"]} if "encrypt" in it else {}),
                }
                for i, it in enumerate(items)
            ],
        }
        if suffix is not None:
            manifest["name_suffix"] = suffix
        files = [("files", (it["name"], it["data"], "application/pdf")) for it in items]
        r = self.c.post("/api/jobs", data={"manifest": json.dumps(manifest)}, files=files)
        assert r.status_code == expect, r.text
        return r.json()

    def wait(self, job_id: str, timeout: float = 90.0) -> dict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            snap = self.c.get(f"/api/jobs/{job_id}").json()
            if snap["status"] in ("completed", "cancelled"):
                return snap
            time.sleep(0.15)
        raise AssertionError("job did not finish in time")


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)
