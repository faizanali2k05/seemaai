#!/bin/bash
# ---------------------------------------------------------------------------
# Postgres bootstrap — runs ONCE, automatically, the first time the database
# volume is initialised (Docker copies this into /docker-entrypoint-initdb.d).
#
# Creates the two roles the application needs:
#   seema_admin  - owns schema `public`, runs Alembic migrations, used by the
#                  API for pre-auth/cross-tenant work (login, registration,
#                  regulatory ingestion). Has BYPASSRLS.
#   seema_app    - runtime role for tenant-scoped queries. RLS IS enforced:
#                  every query must run with `app.current_firm_id` set, else it
#                  returns zero rows (fail-closed).
#
# Passwords come from the environment (docker-compose.yml -> db.environment ->
# root .env). You never edit them by hand — deploy/scripts/generate-secrets.*
# fills them with random values.
# ---------------------------------------------------------------------------
set -e

: "${SEEMA_APP_PASSWORD:?SEEMA_APP_PASSWORD must be set for the db container}"
: "${SEEMA_ADMIN_PASSWORD:?SEEMA_ADMIN_PASSWORD must be set for the db container}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_admin') THEN
        CREATE ROLE seema_admin LOGIN PASSWORD '${SEEMA_ADMIN_PASSWORD}' BYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_app') THEN
        CREATE ROLE seema_app LOGIN PASSWORD '${SEEMA_APP_PASSWORD}';
      END IF;
    END
    \$\$;

    ALTER SCHEMA public OWNER TO seema_admin;
    GRANT ALL ON SCHEMA public TO seema_admin;
    GRANT USAGE ON SCHEMA public TO seema_app;

    ALTER DEFAULT PRIVILEGES FOR ROLE seema_admin IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seema_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE seema_admin IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO seema_app;
EOSQL

echo "seema_admin + seema_app roles created."
