#!/bin/bash
set -e

echo "=== Seema API starting ==="

# Wait for database to be ready (retry up to 30 seconds)
MAX_RETRIES=15
RETRY=0
until python -c "
from sqlalchemy import create_engine, text
import os
url = os.environ.get('DATABASE_URL', '').replace('+asyncpg', '')
engine = create_engine(url)
with engine.connect() as conn:
    conn.execute(text('SELECT 1'))
print('Database ready')
" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: Database not ready after ${MAX_RETRIES} attempts"
        exit 1
    fi
    echo "Waiting for database... (attempt $RETRY/$MAX_RETRIES)"
    sleep 2
done

# Run migrations
echo "Running database migrations..."
alembic upgrade head

echo "Starting Seema API server..."
exec gunicorn main:app \
    --bind 0.0.0.0:8000 \
    --workers ${API_WORKERS:-4} \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --access-logfile - \
    --error-logfile -
