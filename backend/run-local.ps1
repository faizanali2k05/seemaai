# ============================================================================
# Seema API — LOCAL run helper (no Docker).
#
# Prerequisites (one-time):
#   1. PostgreSQL installed and running locally, with a database called `seema`.
#   2. A Python 3.11 (or 3.12) virtual environment created in backend\.venv:
#         py -3.11 -m venv .venv
#         .\.venv\Scripts\Activate.ps1
#         pip install -r requirements.txt
#
# Then just run:   .\run-local.ps1
#
# EDIT the password below to match the password you set for the `postgres`
# superuser when you installed PostgreSQL.
# ============================================================================

# --- EDIT THIS LINE: put your real postgres password in place of CHANGE_ME ---
$PgPassword = "CHANGE_ME"

$DbUrl = "postgresql+asyncpg://postgres:$PgPassword@localhost:5432/seema"

$env:APP_ENV            = "development"
$env:DATABASE_URL       = $DbUrl
$env:ADMIN_DATABASE_URL = $DbUrl          # login/registration need this set
$env:JWT_SECRET_KEY     = "local-dev-secret-do-not-use-in-prod"
$env:REDIS_URL          = "redis://localhost:6379/0"   # only used if you run Celery
# $env:ANTHROPIC_API_KEY = "sk-ant-..."   # uncomment to enable AI features

# Activate the venv if it isn't already.
if (-not $env:VIRTUAL_ENV) {
    if (Test-Path ".\.venv\Scripts\Activate.ps1") {
        . .\.venv\Scripts\Activate.ps1
    } else {
        Write-Host "No .venv found. Create it first:  py -3.11 -m venv .venv" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Applying database migrations (alembic upgrade head)..." -ForegroundColor Cyan
alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed. Check that PostgreSQL is running and the password is correct." -ForegroundColor Red
    exit 1
}

# NOTE: We intentionally SKIP scripts\apply_rls.py for local single-user testing.
# Row-Level Security needs the seema_app / seema_admin roles, which only the
# Docker stack creates. Running as the postgres superuser bypasses RLS, which is
# fine for local smoke-testing (tenant isolation is enforced on the VPS).

Write-Host "Starting API on http://localhost:8000 ..." -ForegroundColor Green
uvicorn main:app --reload --port 8000
