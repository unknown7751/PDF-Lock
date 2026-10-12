FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PDFLOCK_TEMP_ROOT=/tmp/pdflock-jobs

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 pdflock
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
USER pdflock

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"

# Jobs live in this process's memory, so run exactly ONE worker (see README → Deployment).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
