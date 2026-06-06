"""Apply Row-Level Security policies + runtime grants. Runs after `alembic
upgrade head` on every API boot (see entrypoint.sh). Idempotent.

Why this exists
---------------
Tenant isolation is enforced at the database layer: every table that has a
`firm_id` column gets a `tenant_isolation` RLS policy comparing `firm_id` to
the per-transaction GUC `app.current_firm_id`. The application connects as the
non-privileged `seema_app` role, so even a route handler that forgets to
filter by firm cannot leak cross-tenant rows.

This is the FastAPI-stack equivalent of the original Prisma
`20260509211707_enable_rls` migration, but driven dynamically off the live
schema (whatever Alembic created) instead of a hardcoded table list — so it
stays correct as new tenant tables are added.

Run as the seema_admin (BYPASSRLS, schema owner) role via ADMIN_DATABASE_URL.
"""
import os
import sys

import psycopg2

# Tables that are intentionally NOT tenant-scoped (shared / system tables).
EXCLUDED_TABLES = {
    "firms",                 # the tenant table itself
    "regulatory_updates",    # shared regulatory feed (all firms)
    "sra_feed_log",          # system scraping log
    "alembic_version",       # migration bookkeeping
}


def _dsn() -> str:
    url = (
        os.environ.get("ADMIN_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or ""
    ).strip()
    if not url:
        sys.exit("apply_rls: ADMIN_DATABASE_URL / DATABASE_URL not set")
    # psycopg2 wants a plain libpq DSN — strip the SQLAlchemy async/sync driver.
    return (
        url.replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgresql+psycopg2://", "postgresql://")
    )


def main() -> None:
    conn = psycopg2.connect(_dsn())
    conn.autocommit = True
    cur = conn.cursor()

    # Helper function (single place to evolve validation later). Created/owned
    # by seema_admin so CREATE OR REPLACE on subsequent boots succeeds.
    cur.execute(
        """
        CREATE OR REPLACE FUNCTION app_set_current_firm(firm_id text)
        RETURNS void LANGUAGE plpgsql AS $fn$
        BEGIN
          PERFORM set_config('app.current_firm_id', firm_id, true);
        END;
        $fn$;
        """
    )

    # Every base table in public that has a firm_id column.
    cur.execute(
        """
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'firm_id'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name;
        """
    )
    tenant_tables = [r[0] for r in cur.fetchall() if r[0] not in EXCLUDED_TABLES]

    applied = 0
    for table in tenant_tables:
        # Enable + FORCE (FORCE so even the table owner is subject to RLS).
        cur.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY;')
        cur.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;')

        # Create the policy only if it doesn't already exist.
        cur.execute(
            """
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = %s
              AND policyname = 'tenant_isolation';
            """,
            (table,),
        )
        if cur.fetchone() is None:
            cur.execute(
                f"""
                CREATE POLICY tenant_isolation ON "{table}"
                  USING (firm_id = current_setting('app.current_firm_id', true))
                  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));
                """
            )
        applied += 1

    # Belt-and-suspenders runtime grants (default privileges already cover
    # tables created by seema_admin, but this also catches anything created
    # by another role and is safe to repeat).
    cur.execute("GRANT USAGE ON SCHEMA public TO seema_app;")
    cur.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seema_app;"
    )
    cur.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seema_app;")
    cur.execute("GRANT EXECUTE ON FUNCTION app_set_current_firm(text) TO seema_app;")

    cur.close()
    conn.close()
    print(f"apply_rls: tenant_isolation enforced on {applied} tables; grants applied.")


if __name__ == "__main__":
    main()
