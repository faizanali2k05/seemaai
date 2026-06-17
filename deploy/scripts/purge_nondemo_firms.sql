-- ============================================================================
-- Purge ALL firms EXCEPT demo@seemaai.co.uk.
--
-- DESTRUCTIVE — permanently deletes every other firm and all of its data across
-- every table that has a firm_id column. The demo firm is derived from the login
-- email (no hard-coded id), and the script ABORTS if that login is missing so it
-- can never wipe everything by accident. Runs in one transaction.
--
-- Run on the VPS:
--   cd /opt/seema
--   docker compose exec -T db psql -U seema -d seema < deploy/scripts/purge_nondemo_firms.sql
-- ============================================================================
BEGIN;

DO $$
DECLARE
  r          record;
  demo_firm  text;
BEGIN
  SELECT firm_id INTO demo_firm
  FROM user_accounts
  WHERE email = 'demo@seemaai.co.uk'
  ORDER BY created_at
  LIMIT 1;

  IF demo_firm IS NULL THEN
    RAISE EXCEPTION 'demo@seemaai.co.uk not found — aborting so nothing is deleted';
  END IF;
  RAISE NOTICE 'Keeping firm %, deleting all OTHER firms and their data', demo_firm;

  -- Bypass FK ordering/triggers for a clean cross-table purge (superuser only,
  -- transaction-local so it resets on COMMIT).
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Delete every other firm's rows from each table that carries a firm_id.
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'firm_id' AND table_schema = 'public'
  LOOP
    EXECUTE format('DELETE FROM %I WHERE firm_id <> %L', r.table_name, demo_firm);
  END LOOP;

  -- Finally the firms table itself.
  EXECUTE format('DELETE FROM firms WHERE id <> %L', demo_firm);
END $$;

COMMIT;

-- Sanity check — should print 1 firm + the demo login only.
SELECT 'firms_remaining' AS info, count(*) AS n FROM firms;
SELECT email, role FROM user_accounts ORDER BY created_at;
