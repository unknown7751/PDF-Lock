"""HTTP-level tests: batches, mixed results, downloads, ZIP, cancellation, expiry, security."""

from __future__ import annotations

import io
import json
import logging
import threading
import time
import zipfile
from pathlib import Path

import pikepdf
import pytest

from app.services.worker import WorkerTimeout, run_in_subprocess
from tests.conftest import (
    OPEN_PW,
    OWNER_PW,
    WRONG_PW,
    Api,
    make_encrypted_pdf,
    make_pdf,
    page_text_streams,
)


def blob(path: Path) -> bytes:
    return path.read_bytes()


def by_client(snap: dict) -> dict:
    return {f["client_id"]: f for f in snap["files"]}


# ------------------------------------------------------------------ meta


def test_health_and_config_expose_limits(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    cfg = client.get("/api/config").json()
    assert cfg["max_files"] == 4 and cfg["max_file_size_bytes"] == 1024 * 1024
    assert "aes-256" in cfg["algorithms"]


def test_security_headers_and_cors(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["x-content-type-options"] == "nosniff"
    bad = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


# ------------------------------------------------------------------ encryption


def test_encrypt_batch_end_to_end_with_downloads_and_zip(api: Api, client, pdf_dir):
    a = make_pdf(pdf_dir / "invoice.pdf", pages=2)
    b = make_pdf(pdf_dir / "report.pdf", pages=3)
    snap = api.create("encrypt", [
        {"name": "invoice.pdf", "data": blob(a), "password": "pw-for-invoice-1", "client_id": "a"},
        {"name": "report.pdf", "data": blob(b), "password": "pw-for-report-22", "client_id": "b",
         "encrypt": {"algorithm": "aes-128"}},
    ])
    assert snap["status"] in {"queued", "processing"} and snap["counts"]["total"] == 2
    final = api.wait(snap["id"])
    files = by_client(final)
    assert final["counts"]["success"] == 2 and final["overall_progress"] == 1
    assert files["a"]["output_name"] == "invoice_protected.pdf"
    assert files["b"]["output_name"] == "report_protected.pdf"

    # Single download: real, encrypted, different passwords per file.
    r = client.get(files["a"]["download_url"])
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert "invoice_protected.pdf" in r.headers["content-disposition"]
    out = pdf_dir / "dl_a.pdf"
    out.write_bytes(r.content)
    with pikepdf.open(out, password="pw-for-invoice-1") as pdf:
        assert pdf.is_encrypted and pdf.encryption.R == 6 and len(pdf.pages) == 2
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(out, password="pw-for-report-22")

    # ZIP contains both, valid.
    z = client.get(final["zip_url"])
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        assert zf.testzip() is None
        assert sorted(zf.namelist()) == ["invoice_protected.pdf", "report_protected.pdf"]
        rep = pdf_dir / "dl_b.pdf"
        rep.write_bytes(zf.read("report_protected.pdf"))
    with pikepdf.open(rep, password="pw-for-report-22") as pdf:
        assert pdf.encryption.R == 4 and len(pdf.pages) == 3

    # The ZIP temp file is cleaned up after sending.
    job_dir = next((Path(client.app.state.jobs.storage.root)).iterdir())
    assert not list(job_dir.glob("*.zip"))


def test_encrypt_rejects_already_protected_but_completes_others(api: Api, pdf_dir):
    plain = make_pdf(pdf_dir / "plain.pdf")
    enc = make_encrypted_pdf(pdf_dir / "enc.pdf")
    snap = api.create("encrypt", [
        {"name": "plain.pdf", "data": blob(plain), "password": "new-pw-12345", "client_id": "ok"},
        {"name": "enc.pdf", "data": blob(enc), "password": "new-pw-12345", "client_id": "bad"},
    ])
    final = api.wait(snap["id"])
    files = by_client(final)
    assert files["ok"]["status"] == "success"
    assert files["bad"]["status"] == "failed" and files["bad"]["error"]["code"] == "already_encrypted"
    assert files["bad"]["error"]["hint"]


def test_custom_suffix_and_duplicate_filenames(api: Api, client, pdf_dir):
    data = blob(make_pdf(pdf_dir / "x.pdf"))
    snap = api.create("encrypt", [
        {"name": "report.pdf", "data": data, "password": "pw-one-12345", "client_id": "1"},
        {"name": "report.pdf", "data": data, "password": "pw-two-12345", "client_id": "2"},
        {"name": "REPORT.PDF", "data": data, "password": "pw-three-1234", "client_id": "3"},
    ], suffix="_locked")
    final = api.wait(snap["id"])
    names = sorted(f["output_name"] for f in final["files"])
    assert names == ["REPORT_locked (3).pdf", "report_locked (2).pdf", "report_locked.pdf"]
    with zipfile.ZipFile(io.BytesIO(client.get(final["zip_url"]).content)) as zf:
        assert sorted(zf.namelist()) == names


# ------------------------------------------------------------------ decryption


def test_decrypt_mixed_batch_is_independent(api: Api, client, pdf_dir):
    good = make_encrypted_pdf(pdf_dir / "good.pdf", pages=3)
    wrong = make_encrypted_pdf(pdf_dir / "wrong.pdf")
    plain = make_pdf(pdf_dir / "plain.pdf")
    corrupt = b"%PDF-1.7\nnot really a pdf\n%%EOF"
    snap = api.create("decrypt", [
        {"name": "good.pdf", "data": blob(good), "password": OPEN_PW, "client_id": "good"},
        {"name": "wrong.pdf", "data": blob(wrong), "password": WRONG_PW, "client_id": "wrong"},
        {"name": "plain.pdf", "data": blob(plain), "password": "anything", "client_id": "plain"},
        {"name": "corrupt.pdf", "data": corrupt, "password": "anything", "client_id": "corrupt"},
    ])
    final = api.wait(snap["id"])
    f = by_client(final)
    assert f["good"]["status"] == "success" and f["good"]["output_name"] == "good_decrypted.pdf"
    assert f["wrong"]["status"] == "failed" and f["wrong"]["error"]["code"] == "invalid_password"
    assert f["plain"]["status"] == "skipped" and f["plain"]["error"]["code"] == "not_encrypted"
    assert f["plain"]["download_url"] is None
    assert f["corrupt"]["status"] == "failed" and f["corrupt"]["error"]["code"] == "corrupt_pdf"
    c = final["counts"]
    assert (c["success"], c["failed"], c["skipped"], c["total"]) == (1, 2, 1, 4)

    out = pdf_dir / "dec.pdf"
    out.write_bytes(client.get(f["good"]["download_url"]).content)
    with pikepdf.open(out) as pdf:  # no password needed
        assert not pdf.is_encrypted and len(pdf.pages) == 3
    assert page_text_streams(out) == page_text_streams(good, OPEN_PW)

    # Failed / skipped files have no download; ZIP holds only the success.
    assert client.get(f"/api/jobs/{final['id']}/files/{f['wrong']['id']}/download").status_code == 409
    with zipfile.ZipFile(io.BytesIO(client.get(final["zip_url"]).content)) as zf:
        assert zf.namelist() == ["good_decrypted.pdf"]


def test_retry_failed_file_with_correct_password(api: Api, client, pdf_dir):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    snap = api.create("decrypt", [{"name": "e.pdf", "data": blob(enc), "password": WRONG_PW, "client_id": "e"}])
    final = api.wait(snap["id"])
    fid = final["files"][0]["id"]
    assert final["files"][0]["error"]["code"] == "invalid_password"

    r = client.post(f"/api/jobs/{final['id']}/retry", json={"files": [{"file_id": fid, "password": OPEN_PW}]})
    assert r.status_code == 202, r.text
    again = api.wait(final["id"])
    assert again["files"][0]["status"] == "success" and again["files"][0]["error"] is None


def test_retry_validation(api: Api, client, pdf_dir):
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    plain = make_pdf(pdf_dir / "p.pdf")
    snap = api.create("decrypt", [
        {"name": "e.pdf", "data": blob(enc), "password": OPEN_PW, "client_id": "ok"},
        {"name": "p.pdf", "data": blob(plain), "password": "x", "client_id": "plain"},
    ])
    final = api.wait(snap["id"])
    f = by_client(final)
    url = f"/api/jobs/{final['id']}/retry"
    # success/skipped files aren't retryable; unknown ids 404
    assert client.post(url, json={"files": [{"file_id": f["ok"]["id"], "password": "x"}]}).status_code == 409
    assert client.post(url, json={"files": [{"file_id": f["plain"]["id"], "password": "x"}]}).status_code == 409
    assert client.post(url, json={"files": [{"file_id": "nope", "password": "x"}]}).status_code == 404


def test_restricted_pdf_flow_over_api(api: Api, pdf_dir):
    from pikepdf import Permissions
    enc = make_encrypted_pdf(pdf_dir / "r.pdf", allow=Permissions(extract=False))
    snap = api.create("decrypt", [
        {"name": "r.pdf", "data": blob(enc), "password": OPEN_PW, "client_id": "user"},
        {"name": "r.pdf", "data": blob(enc), "password": OWNER_PW, "client_id": "owner"},
    ])
    f = by_client(api.wait(snap["id"]))
    assert f["user"]["error"]["code"] == "owner_password_required"
    assert f["owner"]["status"] == "success"


# ------------------------------------------------------------------ intake validation


def test_invalid_uploads_fail_individually(api: Api, pdf_dir):
    ok = blob(make_pdf(pdf_dir / "ok.pdf"))
    big = b"%PDF-1.7\n" + b"0" * (1024 * 1024 + 10)
    snap = api.create("encrypt", [
        {"name": "ok.pdf", "data": ok, "password": "pw-12345-ok", "client_id": "ok"},
        {"name": "notes.pdf", "data": b"hello, definitely not a pdf", "password": "pw-12345-ok", "client_id": "txt"},
        {"name": "empty.pdf", "data": b"", "password": "pw-12345-ok", "client_id": "empty"},
        {"name": "big.pdf", "data": big, "password": "pw-12345-ok", "client_id": "big"},
    ])
    f = by_client(api.wait(snap["id"]))
    assert f["ok"]["status"] == "success"
    assert f["txt"]["error"]["code"] == "not_a_pdf"
    assert f["empty"]["error"]["code"] == "empty_file"
    assert f["big"]["error"]["code"] == "file_too_large"


def test_too_many_files_rejected(api: Api, pdf_dir):
    data = blob(make_pdf(pdf_dir / "a.pdf"))
    items = [{"name": f"{i}.pdf", "data": data, "password": "pw-12345-ok"} for i in range(5)]
    manifest = {"operation": "encrypt", "files": [{"client_id": f"c{i}", "password": "pw-12345-ok"} for i in range(5)]}
    r = api.c.post("/api/jobs", data={"manifest": json.dumps(manifest)},
                   files=[("files", (it["name"], it["data"], "application/pdf")) for it in items])
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_many_files"
    assert not list(api.c.app.state.jobs.storage.root.iterdir())  # nothing left behind


def test_total_payload_cap_rejected_before_processing(api: Api):
    chunk = b"%PDF-1.7\n" + b"0" * (1024 * 1024 - 20)  # 4 x ~1 MB fits the file cap but exceeds 3 MB total
    manifest = {"operation": "encrypt", "files": [{"client_id": f"c{i}", "password": "pw-12345-ok"} for i in range(4)]}
    r = api.c.post("/api/jobs", data={"manifest": json.dumps(manifest)},
                   files=[("files", (f"{i}.pdf", chunk, "application/pdf")) for i in range(4)])
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


def test_malformed_requests_use_error_schema_and_never_echo_passwords(api: Api):
    secret = "S3cret-Value-Do-Not-Echo"
    r = api.c.post("/api/jobs", data={"manifest": json.dumps({"operation": "explode", "files": [
        {"client_id": "a", "password": secret}]})}, files=[("files", ("a.pdf", b"%PDF-1.7", "application/pdf"))])
    assert r.status_code == 422
    body = r.json()
    assert set(body["error"]) == {"code", "message", "hint"} and body["error"]["code"] == "invalid_manifest"
    assert secret not in r.text

    r = api.c.post("/api/jobs", data={"manifest": "{not json"}, files=[("files", ("a.pdf", b"%PDF-", "application/pdf"))])
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_manifest"

    r = api.c.post("/api/jobs", data={})  # missing parts -> FastAPI validation
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"

    mismatch = {"operation": "encrypt", "files": [{"client_id": "a", "password": "x"}, {"client_id": "b"}]}
    r = api.c.post("/api/jobs", data={"manifest": json.dumps(mismatch)},
                   files=[("files", ("a.pdf", b"%PDF-1.7", "application/pdf"))])
    assert r.status_code == 422 and r.json()["error"]["code"] == "file_count_mismatch"


# ------------------------------------------------------------------ lifecycle


def test_cancel_stops_pending_files_then_delete_cleans_up(settings, pdf_dir):
    from fastapi.testclient import TestClient
    from app.main import create_app

    settings = settings.model_copy(update={"max_concurrency": 1})
    with TestClient(create_app(settings)) as client:
        api = Api(client)
        data = blob(make_pdf(pdf_dir / "a.pdf", pages=5))
        items = [{"name": f"f{i}.pdf", "data": data, "password": f"pw-number-{i}-xx", "client_id": f"c{i}"}
                 for i in range(4)]
        snap = api.create("encrypt", items)
        r = client.post(f"/api/jobs/{snap['id']}/cancel")
        assert r.status_code == 200
        final = api.wait(snap["id"])
        assert final["status"] == "cancelled"
        c = final["counts"]
        assert c["cancelled"] >= 3 and c["queued"] == 0 and c["processing"] == 0
        cancelled = [f for f in final["files"] if f["status"] == "cancelled"]
        assert cancelled[0]["error"]["code"] == "cancelled" and cancelled[0]["download_url"] is None

        # Cancelled files can be retried afterwards.
        retry = client.post(f"/api/jobs/{snap['id']}/retry", json={"files": [
            {"file_id": cancelled[0]["id"], "password": "pw-retry-12345"}]})
        assert retry.status_code == 202
        assert api.wait(snap["id"])["counts"]["success"] >= 1

        job_dir = client.app.state.jobs.jobs[snap["id"]].dir
        assert job_dir.exists()
        assert client.delete(f"/api/jobs/{snap['id']}").status_code == 204
        assert not job_dir.exists()
        assert client.get(f"/api/jobs/{snap['id']}").status_code == 410
        assert not list(settings.resolved_temp_root.iterdir())


def test_expired_job_is_inaccessible_and_files_deleted(api: Api, client, pdf_dir):
    snap = api.create("encrypt", [{"name": "a.pdf", "data": blob(make_pdf(pdf_dir / "a.pdf")),
                                   "password": "pw-12345-ok"}])
    final = api.wait(snap["id"])
    fid = final["files"][0]["id"]
    job = client.app.state.jobs.jobs[snap["id"]]
    job_dir = job.dir
    assert client.get(final["files"][0]["download_url"]).status_code == 200

    job.expires_at = time.time() - 1  # simulate TTL elapsing
    for url in (f"/api/jobs/{snap['id']}", f"/api/jobs/{snap['id']}/files/{fid}/download"):
        r = client.get(url)
        assert r.status_code == 410 and r.json()["error"]["code"] == "job_expired"
    assert not job_dir.exists()
    assert client.get(f"/api/jobs/{snap['id']}/download-zip").status_code == 410


def test_sweeper_expires_idle_jobs(api: Api, client, pdf_dir):
    snap = api.create("encrypt", [{"name": "a.pdf", "data": blob(make_pdf(pdf_dir / "a.pdf")),
                                   "password": "pw-12345-ok"}])
    api.wait(snap["id"])
    manager = client.app.state.jobs
    job_dir = manager.jobs[snap["id"]].dir
    manager.jobs[snap["id"]].expires_at = time.time() - 1

    assert client.portal.call(manager.expire_due) == 1  # runs on the app's own event loop
    assert not job_dir.exists() and snap["id"] not in manager.jobs
    assert client.get(f"/api/jobs/{snap['id']}").status_code == 410


def test_unknown_and_malformed_job_ids_404(client):
    for jid in ("x" * 43, "short", "..%2F..%2Fetc", "%2e%2e"):
        r = client.get(f"/api/jobs/{jid}")
        assert r.status_code in (404,) and "error" in r.json()


def test_cross_job_file_access_is_blocked(api: Api, client, pdf_dir):
    data = blob(make_pdf(pdf_dir / "a.pdf"))
    a = api.wait(api.create("encrypt", [{"name": "a.pdf", "data": data, "password": "pw-12345-ok"}])["id"])
    b = api.wait(api.create("encrypt", [{"name": "b.pdf", "data": data, "password": "pw-12345-ok"}])["id"])
    a_file = a["files"][0]["id"]
    assert client.get(f"/api/jobs/{b['id']}/files/{a_file}/download").status_code == 404
    assert client.post(f"/api/jobs/{b['id']}/retry", json={"files": [{"file_id": a_file, "password": "x"}]}).status_code == 404


def test_path_traversal_filenames_and_ids(api: Api, client, pdf_dir, settings):
    data = blob(make_pdf(pdf_dir / "a.pdf"))
    evil_names = ["../../evil.pdf", "..\\..\\evil.pdf", "/etc/passwd.pdf", "C:\\Windows\\system32\\x.pdf",
                  "CON.pdf", "a\x00b.pdf", "....pdf"]
    snap = api.create("encrypt", [{"name": n, "data": data, "password": "pw-12345-ok", "client_id": f"c{i}"}
                                  for i, n in enumerate(evil_names[:4])])
    final = api.wait(snap["id"])
    for f in final["files"]:
        assert f["status"] == "success"
        assert "/" not in f["output_name"] and "\\" not in f["output_name"] and ".." not in f["output_name"]
    # Everything created lives inside the job directory; nothing escaped to the parent.
    root = settings.resolved_temp_root
    assert {p.name for p in root.parent.iterdir() if p.name == "evil.pdf"} == set()
    assert [p.name for p in root.iterdir()] == [snap["id"]]
    for fid in ("..", "../..", "%2e%2e%2f", "a" * 64):
        assert client.get(f"/api/jobs/{snap['id']}/files/{fid}/download").status_code == 404

    zip_names = zipfile.ZipFile(io.BytesIO(client.get(final["zip_url"]).content)).namelist()
    assert all("/" not in n and ".." not in n for n in zip_names)


def test_zip_without_results_is_conflict(api: Api, client):
    snap = api.create("decrypt", [{"name": "x.pdf", "data": b"%PDF-1.7\nbroken", "password": "pw"}])
    final = api.wait(snap["id"])
    assert final["zip_url"] is None
    r = client.get(f"/api/jobs/{final['id']}/download-zip")
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_results"


def test_zip_failure_returns_clean_error(api: Api, client, pdf_dir, monkeypatch):
    snap = api.create("encrypt", [{"name": "a.pdf", "data": blob(make_pdf(pdf_dir / "a.pdf")),
                                   "password": "pw-12345-ok"}])
    final = api.wait(snap["id"])

    def boom(job):
        raise OSError("disk exploded")

    monkeypatch.setattr("app.api.routes_jobs.build_zip", boom)
    r = client.get(final["zip_url"])
    assert r.status_code == 500 and r.json()["error"]["code"] == "zip_failed"
    assert "disk exploded" not in r.text


def test_server_sent_events_stream_snapshot_then_done(api: Api, client, pdf_dir):
    snap = api.create("encrypt", [{"name": "a.pdf", "data": blob(make_pdf(pdf_dir / "a.pdf")),
                                   "password": "pw-12345-ok"}])
    events = []
    with client.stream("GET", f"/api/jobs/{snap['id']}/events") as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        current = None
        for line in r.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
                events.append(current)
    assert events[-1] == "done" and "snapshot" in events


# ------------------------------------------------------------------ privacy


def test_passwords_never_reach_logs_or_responses(api: Api, client, pdf_dir, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "Sup3r-Secret-Value-9000"
    enc = make_encrypted_pdf(pdf_dir / "e.pdf")
    snap = api.create("decrypt", [{"name": "e.pdf", "data": blob(enc), "password": secret, "client_id": "e"}])
    final = api.wait(snap["id"])
    assert final["files"][0]["error"]["code"] == "invalid_password"
    assert secret not in json.dumps(final)
    assert secret not in caplog.text
    manager = client.app.state.jobs
    assert all(fs.password == "" and fs.encrypt_opts is None for fs in manager.jobs[snap["id"]].files.values())


# ------------------------------------------------------------------ worker


def test_worker_timeout_kills_subprocess(pdf_dir):
    src = make_pdf(pdf_dir / "a.pdf")
    task = {"operation": "encrypt", "src": str(src), "dst": str(pdf_dir / "o.pdf"), "password": "pw-12345-ok",
            "options": {}, "max_pages": 10}
    with pytest.raises(WorkerTimeout):
        run_in_subprocess(task, timeout=0.01, cancel_event=threading.Event())


def test_worker_cancel_event_aborts(pdf_dir):
    from app.services.worker import WorkerCancelled
    src = make_pdf(pdf_dir / "a.pdf")
    ev = threading.Event()
    ev.set()
    task = {"operation": "encrypt", "src": str(src), "dst": str(pdf_dir / "o.pdf"), "password": "pw-12345-ok",
            "options": {}, "max_pages": 10}
    with pytest.raises(WorkerCancelled):
        run_in_subprocess(task, timeout=30, cancel_event=ev)
