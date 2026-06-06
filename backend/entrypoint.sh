#!/bin/bash
# Seema API container entrypoint.
#   1. Wait for Postgres to accept connections (as seema_admin).
#   2. Run Alembic migrations  -> creates/updates the schema.
#   3. Apply RLS policies + grants (idempotent).
#   4. Launch the API server.
#
# Only the `api` service runs this. The celery worker/beat services override
# the container command, so they skip migrations (they wait for `api` to be
# healthy first — see docker-compose.yml).
set -e

echo "=== Seema API starting ==="

# 1. Wait for the database -----------------------------------------------------
python - <<'PY'
import os, sys, time
from sqlalchemy import create_engine, text

url = (os.environ.get("ADMIN_DATABASE_URL") or os.environ.get("DATABASE_URL") or "")
url = url.replace("+asyncpg", "+psycopg2")  # sync driver for the readiness probe
if not url:
    sys.exit("FATAL: ADMIN_DATABASE_URL / DATABASE_URL not set")

for attempt in range(1, 31):
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database ready.")
        break
    except Exception as exc:
        print(f"Waiting for database... ({attempt}/30): {exc}")
        time.sleep(2)
else:
    sys.exit("FATAL: database not ready after 60s")
PY

# 2. Migrations ----------------------------------------------------------------
echo "Running database migrations (alembic upgrade head)..."
alembic upgrade head

# 3. Row-Level Security + grants ----------------------------------------------
echo "Applying RLS policies and runtime grants..."
python scripts/apply_rls.py

# 4. Serve ---------------------------------------------------------------------
echo "Starting Seema API server on :8000 ..."
exec gunicorn main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers "${API_WORKERS:-2}" \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --access-logfile - \
    --error-logfile -
