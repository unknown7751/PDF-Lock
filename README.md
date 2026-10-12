# PDFLock

Encrypt and decrypt PDFs **in bulk** from a polished, animated web app. React + TypeScript frontend, FastAPI backend, and real PDF encryption through [qpdf](https://qpdf.sourceforge.io/) (via `pikepdf`).

> **Privacy model, stated plainly:** PDFLock processes files **on its server**, not in your browser. Selected PDFs are uploaded to the PDFLock backend, processed, and deleted automatically. They are never sent to third parties. See [Security & privacy](#security--privacy).

## Features

- **Decrypt** (remove password protection with the correct password) and **Encrypt** (AES-256 by default, AES-128 for legacy readers).
- **Multi-PDF queue**: drag & drop, browse, add more later, remove one, clear all. Duplicate warnings, size/count limits (set by the backend), non-PDF and malformed files rejected.
- **Two password modes** per operation — individual passwords per file, or **"Use the same password for all PDFs"** with per-file override. Switching modes never loses what you typed. Decrypt and Encrypt keep separate password state, so a shared password never leaks across operations.
- **Encryption options**: algorithm, owner password, print/copy/edit permissions, strength meter, cryptographically random password generator, confirmation field and optional confirmation dialog.
- **Independent processing**: one wrong password or corrupt file never stops the batch. Live progress over Server-Sent Events (polling fallback), cancel, retry failed files, per-file download and ZIP download, completion summary (*"12 files processed — 10 successful, 2 need attention."*).
- **Dark (default) and light themes**, persisted, with smooth transitions; Framer Motion animations that respect `prefers-reduced-motion`.
- **Accessible**: keyboard operable (tabs, dropzone, dialogs, accordion), labelled fields, status text never relies on colour alone, live-region announcements, 44px touch targets.

## Repository layout

```
.
├── backend/                 FastAPI + pikepdf
│   ├── app/
│   │   ├── api/             routes_jobs.py, routes_meta.py, middleware.py
│   │   ├── core/            config.py, errors.py, security.py (filename sanitising)
│   │   ├── schemas/         Pydantic models (requests + responses)
│   │   ├── services/        pdf_processor.py (engine), worker.py (subprocess isolation),
│   │   │                    job_manager.py, storage.py, zipper.py
│   │   └── main.py          app factory, CORS, error handlers
│   ├── tests/               pytest (engine + HTTP + security)
│   └── requirements*.txt
├── frontend/                React 19 + Vite + Tailwind v4 + motion
│   └── src/
│       ├── components/      Navbar, HeroSection, PDFDropzone, PDFFileCard, PasswordInput, …
│       ├── features/        decryption/, encryption/, batch-processing/ (Workspace)
│       ├── hooks/           useTheme, useFileQueue, usePasswordConfig, useBatchJob, useJobStream
│       ├── lib/             api client, zod schemas, pdf-lib pre-check, password utils
│       └── types/, styles/, test/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start (local development)

Prerequisites: **Python 3.12** and **Node.js ≥ 20.19** (developed with Node 26 / npm 11).

### 1. Backend (terminal 1)

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

API docs: <http://127.0.0.1:8000/api/docs> · health: <http://127.0.0.1:8000/api/health>

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` (including the SSE stream) to `http://127.0.0.1:8000`, so no CORS setup is needed locally. Use `VITE_DEV_API_TARGET` to point the proxy elsewhere.

### 3. Production build

```bash
cd frontend
npm run build      # type-checks, then builds to frontend/dist
npm run preview    # serves the build on :4173 with the same /api proxy
```

## Tests

```bash
# Backend — 62 tests (engine, HTTP API, security, lifecycle)
cd backend
pytest

# Frontend — 87 tests (Vitest + React Testing Library)
cd frontend
npm test
npm run typecheck
```

All test PDFs are **generated** by the tests with **test-only passwords**; no real documents or credentials are used.

What the suites cover: multi-file selection/removal; shared vs individual password modes and switching; password validation; encrypting an unprotected PDF; decrypting with the correct password; rejecting a wrong password; corrupt PDFs; mixed-success batches; per-file and ZIP downloads; cancellation and cleanup; retry; expired-job access; path-traversal attempts; duplicate filenames; light/dark theme and persistence; SSE → polling fallback; passwords never reaching storage, URLs, logs or responses.

## Docker

```bash
cp .env.example .env     # optional: adjust limits
docker compose up --build
```

Open <http://localhost:8080>. nginx serves the UI and proxies `/api` to the backend, which is not exposed publicly. Job files live on a RAM-backed `tmpfs`, the containers run read-only with all capabilities dropped, and a strict Content-Security-Policy is applied.

> The Docker files were written to follow the layout above but **have not been built or run on the machine this project was developed on** (Docker isn't installed there). Treat the first `docker compose up --build` as part of your verification.

## Configuration

All backend options are environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Meaning |
|---|---|---|
| `PDFLOCK_MAX_FILE_SIZE_MB` | 50 | Max size of one PDF |
| `PDFLOCK_MAX_TOTAL_SIZE_MB` | 200 | Max size of one upload request |
| `PDFLOCK_MAX_FILES` | 20 | Max files per batch |
| `PDFLOCK_MAX_PAGES` | 2000 | Max pages per document |
| `PDFLOCK_JOB_TTL_SECONDS` | 900 | Lifetime of a finished batch before its files are deleted |
| `PDFLOCK_MAX_CONCURRENCY` | 3 | Files processed in parallel (bounded memory) |
| `PDFLOCK_PROCESSING_TIMEOUT_SECONDS` | 120 | Per-file hard timeout (worker is killed) |
| `PDFLOCK_MAX_ACTIVE_JOBS` | 25 | Concurrent jobs before the server answers 503 |
| `PDFLOCK_MIN_FREE_DISK_MB` | 256 | Refuse new jobs below this free space (507) |
| `PDFLOCK_TEMP_ROOT` | `<tmp>/pdflock-jobs` | Job storage (never a served directory) |
| `PDFLOCK_CORS_ORIGINS` | `http://localhost:5173,…` | Allowed browser origins |

The UI reads the limits from `GET /api/config`, so it always matches the server.

## API

All errors use one envelope: `{"error": {"code": "...", "message": "...", "hint": "..."}}`.

| Method & path | Purpose |
|---|---|
| `POST /api/jobs` | Create a batch. `multipart/form-data`: `manifest` (JSON: `operation`, `name_suffix`, per-file `client_id`/`password`/`encrypt` options) + `files` (same order). Returns `202` + snapshot. Passwords are in the body only. |
| `GET /api/jobs/{id}` | Snapshot: per-file status, progress (`null` when indeterminate), errors, download URLs |
| `GET /api/jobs/{id}/events` | Server-Sent Events: `snapshot` on every change, then `done` |
| `GET /api/jobs/{id}/files/{file_id}/download` | One processed PDF |
| `GET /api/jobs/{id}/download-zip` | All successful results as a ZIP |
| `POST /api/jobs/{id}/cancel` | Stop unfinished files; finished results stay downloadable |
| `POST /api/jobs/{id}/retry` | Re-run failed/cancelled files with new passwords (no re-upload) |
| `DELETE /api/jobs/{id}` | Cancel everything and delete the job's files immediately |
| `GET /api/config`, `GET /api/health` | Limits for the UI; liveness |

Per-file error codes: `invalid_password`, `password_required`, `not_encrypted`, `already_encrypted`, `owner_password_required`, `unsupported_encryption`, `corrupt_pdf`, `not_a_pdf`, `empty_file`, `file_too_large`, `too_many_pages`, `invalid_options`, `processing_timeout`, `storage_full`, `cancelled`, `internal_error`.

## How it works

- **Engine**: `pikepdf` 9.11 (bundles qpdf 12.2). Encrypt = AES-256 (R6) or AES-128 (R4) with user/owner passwords and permission flags. Decrypt = open with the supplied password and re-save without encryption. Every result is **re-opened and verified** (decrypted output opens without a password; encrypted output requires the new one) before it's reported as a success. The qpdf `progress` callback provides genuine per-file progress; where there is none, the UI shows an honest indeterminate bar.
- **Isolation**: each file runs in its own **spawned subprocess**. That gives hard timeouts, instant cancellation (blocking C++ calls can't be interrupted inside a thread), and keeps a crash on a hostile PDF away from the API. Passwords reach the child over the spawn pipe, never a command line, and no shell is ever involved.
- **Jobs** live in memory only (no database). Each has an isolated directory with server-generated file names; client file names are used only for display and sanitised output names (path components, control characters and reserved device names stripped; duplicates become `name (2).pdf`).
- **Frontend pre-check**: `pdf-lib` (lazy-loaded) reads the structure in the browser to flag already-protected / unprotected files before upload. It cannot encrypt, so all encryption happens on the server. The server is always the source of truth.

## Security & privacy

- PDFs are **uploaded to the server** for processing; they are deleted when the batch expires (`PDFLOCK_JOB_TTL_SECONDS`), is cleared, is cancelled, or on server shutdown/restart (stale directories are swept at startup). Closing the tab also sends a best-effort delete.
- Passwords: in request bodies only; held in server memory just while queued/processing, then wiped; never in URLs, job ids, logs, error messages, databases, or browser storage. Only the theme name is stored in `localStorage`.
- Job ids are 256-bit random capabilities (`secrets.token_urlsafe(32)`); files are looked up by registry, never by user-supplied paths, so cross-job access and path traversal are not possible. There is **no user authentication** in this version — anyone holding a job id can access that job.
- Validation: body-size cap before spooling, per-file size limit, `%PDF-` signature check, structural validation by qpdf, page limit, request validation with Pydantic (error responses never echo submitted values).
- **Design decisions you may not expect**
  - PDFLock **never cracks or bypasses** passwords. Empty passwords are rejected even for PDFs that technically open without one, so restrictions can't be stripped that way.
  - Removing usage restrictions (print/copy/edit) requires the **owner** password: if a PDF is restricted and you supply only the open password, that file fails with `owner_password_required`.
  - Permission restrictions need a separate owner password; the UI and API both enforce it. Restrictions are honoured by compliant readers only and are **not** a substitute for a strong password.
  - Re-saving can invalidate **digital signatures**; PDFLock warns when it detects one.
  - Legacy RC4 encryption is intentionally not offered.
- Responses carry `nosniff`, `no-store`, `no-referrer` and `X-Frame-Options`; the nginx config adds a strict CSP. Fonts are self-hosted (no third-party requests).

## Deployment notes

- **Use HTTPS.** Without TLS, files and passwords cross the network in clear text.
- Run **one** uvicorn worker: job state is in process memory. To scale out, use sticky routing by job id (or replace `JobManager` with a shared store).
- Add rate limiting (e.g. at the reverse proxy) before exposing this publicly; the app bounds concurrency and active jobs but does not rate-limit clients.
- Keep `PDFLOCK_TEMP_ROOT` on a private path (the Docker setup uses a `tmpfs`).

## Troubleshooting

- **`ImportError … Application Control policy has blocked this file` (Windows):** Smart App Control / WDAC can block native extensions it hasn't seen widely. The versions pinned in `backend/requirements.txt` (`pikepdf 9.11.0`, `pydantic 2.12.5`) were verified to load on a machine with Smart App Control enforced; very new releases of those packages did not. If you hit this with other versions, pin to the versions in `requirements.txt`.
- **UI says it can't reach the server:** start the backend (`uvicorn app.main:app --port 8000`) or set `VITE_DEV_API_TARGET`.
- **A file shows "Not eligible":** the browser pre-check found it's already protected (on the Encrypt tab) or not protected (on Decrypt). Move to the other tab or remove it.

## Known limitations

- No authentication or per-user accounts; in-memory job store (single process).
- Large files are limited by `PDFLOCK_MAX_FILE_SIZE_MB`; the in-browser pre-check is skipped above 25 MB.
- Certificate-based (public-key) PDF encryption is not supported.
- The Docker setup is untested on the development machine (see above).
