-- RLS smoke test
--
-- Run this against your Postgres database AFTER applying:
--   1. roles.sql  (creates seema_admin + seema_app)
--   2. migration.sql  (enables RLS + policies)
--
-- Expected behaviour proves four things:
--   A. With NO firm context set, seema_app sees zero rows  (fail-closed)
--   B. With firm A set, seema_app sees only firm A's rows
--   C. With firm B set, seema_app sees only firm B's rows
--   D. seema_admin sees all rows regardless of GUC (BYPASSRLS works)
--
-- How to run (assuming your db container is named seema-db-1):
--   docker compose exec -T db psql -U seema_admin -d seema < smoke_test.sql
--
-- If any check fails, RLS is NOT correctly protecting your data.

\echo ''
\echo '=========================================='
\echo 'RLS SMOKE TEST'
\echo '=========================================='

-- Set up two test firms with one matter each.
SET ROLE seema_admin;

INSERT INTO firms (id, name, sra_number)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Firm A', 'TESTA001')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO firms (id, name, sra_number)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Test Firm B', 'TESTB001')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO matters (id, firm_id, client_name, matter_type, status)
  VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-Client-1', 'litigation', 'open')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO matters (id, firm_id, client_name, matter_type, status)
  VALUES ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B-Client-1', 'litigation', 'open')
  ON CONFLICT (id) DO NOTHING;

\echo ''
\echo '--- A. seema_app with NO firm context (expect 0 rows) ---'
SET ROLE seema_app;
SELECT count(*) AS visible_rows FROM matters;

\echo ''
\echo '--- B. seema_app scoped to firm A (expect 1 row, A-Client-1) ---'
SELECT set_config('app.current_firm_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SELECT id, client_name, firm_id FROM matters;

\echo ''
\echo '--- C. seema_app scoped to firm B (expect 1 row, B-Client-1) ---'
SELECT set_config('app.current_firm_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
SELECT id, client_name, firm_id FROM matters;

\echo ''
\echo '--- D. seema_app trying to INSERT into wrong firm (expect ERROR) ---'
SELECT set_config('app.current_firm_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
-- This MUST fail with a row-level security policy violation:
INSERT INTO matters (id, firm_id, client_name, matter_type, status)
  VALUES ('33333333-3333-3333-3333-333333333333',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'CROSS-TENANT-INJECTION', 'litigation', 'open');

\echo ''
\echo '--- E. seema_admin (BYPASSRLS) sees all rows (expect 2+ rows) ---'
RESET ROLE;
SET ROLE seema_admin;
SELECT count(*) AS total_rows FROM matters
  WHERE id IN ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222');

\echo ''
\echo '--- Cleanup ---'
DELETE FROM matters WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
DELETE FROM firms WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

\echo ''
\echo '=========================================='
\echo 'EXPECTED OUTPUT SUMMARY'
\echo '=========================================='
\echo 'A. visible_rows = 0'
\echo 'B. 1 row, client_name = A-Client-1'
\echo 'C. 1 row, client_name = B-Client-1'
\echo 'D. ERROR: new row violates row-level security policy'
\echo 'E. total_rows = 2'
\echo 'If any of those does not match, RLS is broken — DO NOT deploy.'
