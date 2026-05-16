-- Run this ONCE manually on your Postgres instance, BEFORE applying the
-- enable_rls migration. It creates two roles:
--
--   seema_admin   - owns the schema, runs migrations. BYPASSRLS so Prisma
--                   migrate can ENABLE/DISABLE policies and run DDL.
--   seema_app     - the role the application connects as at runtime.
--                   RLS is enforced for this role. ALL queries from the API
--                   pass through tenant_isolation policies.
--
-- After running this script:
--   1. Update DATABASE_URL in seema-node/.env (used by Prisma at runtime) to
--      use the seema_app role.
--   2. Set DIRECT_DATABASE_URL or a separate MIGRATE_DATABASE_URL using
--      seema_admin for `prisma migrate deploy`.
--   3. Run `prisma migrate deploy` (it will apply migration.sql in this dir).
--
-- WHY TWO ROLES:
--   Postgres bypasses RLS for table owners unless FORCE is set, AND for
--   superusers + roles with the BYPASSRLS attribute. Migrations need to
--   alter tables / drop policies / create new tables, so they need bypass.
--   The application must NOT run as a bypass role or RLS is meaningless.

-- ---------------------------------------------------------------------------
-- Replace these passwords before running. Use openssl rand -base64 32.
-- ---------------------------------------------------------------------------
\set admin_password 'CHANGE_ME_admin'
\set app_password 'CHANGE_ME_app'

-- Migration / DDL role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_admin') THEN
    CREATE ROLE seema_admin LOGIN PASSWORD :'admin_password' BYPASSRLS;
  END IF;
END $$;

-- Runtime application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_app') THEN
    CREATE ROLE seema_app LOGIN PASSWORD :'app_password';
  END IF;
END $$;

-- Make sure NEW objects created by seema_admin (new tables from future
-- migrations) automatically grant DML to seema_app, so you don't have to
-- remember to grant after every migration.
ALTER DEFAULT PRIVILEGES FOR ROLE seema_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seema_app;
ALTER DEFAULT PRIVILEGES FOR ROLE seema_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO seema_app;

-- Grant on existing tables (run AFTER the schema is migrated).
GRANT USAGE ON SCHEMA public TO seema_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seema_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seema_app;

-- The helper function we created in migration.sql needs to be callable.
GRANT EXECUTE ON FUNCTION app_set_current_firm(text) TO seema_app;
