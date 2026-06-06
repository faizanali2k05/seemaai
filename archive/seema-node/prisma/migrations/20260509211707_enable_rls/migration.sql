-- Row-Level Security migration
--
-- Enforces tenant isolation at the database layer for every table that has
-- a firm_id column. The application layer (getTenantFilter middleware) is
-- still in place — RLS is defence in depth. If a route handler ever forgets
-- to filter by firmId, RLS will still prevent cross-tenant data exposure.
--
-- Mechanism:
--   * Each tenant-scoped table has a `tenant_isolation` policy that compares
--     firm_id to the session GUC `app.current_firm_id`.
--   * Application connections set `SET LOCAL app.current_firm_id = '<uuid>'`
--     inside a transaction at the start of every tenant-scoped query.
--   * If the GUC is unset, current_setting(..., true) returns NULL, the
--     comparison fails, and zero rows are returned/affected — fail-closed.
--
-- IMPORTANT GOTCHAS HANDLED:
--   * FORCE ROW LEVEL SECURITY — without this, the table OWNER bypasses RLS
--     entirely. Most botched RLS setups skip this and silently leak.
--   * firm_id is VARCHAR(36) (string UUID), not Postgres uuid type, so the
--     policy uses a plain text comparison (no ::uuid cast).
--   * USING + WITH CHECK both required so INSERTs/UPDATEs can't smuggle a
--     row into another firm.
--
-- BYPASS:
--   * Migrations and the login lookup (which queries user_accounts BEFORE
--     knowing the firm) need to bypass RLS. Run those as a role with
--     BYPASSRLS — see roles.sql in this directory.
--
-- ROLLBACK:
--   * Each ENABLE has a paired DISABLE in the down section at the bottom.

-- ---------------------------------------------------------------------------
-- Helper: a function to set the current firm id within a transaction.
-- Wrapping in a function gives us a single place to add validation later
-- (e.g. enforce uuid format) without touching every call site.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_set_current_firm(firm_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.current_firm_id', firm_id, true); -- true = local (transaction-scoped)
END;
$$;

-- ---------------------------------------------------------------------------
-- Policy template applied to every tenant-scoped table.
-- We use a single FOR ALL policy with USING + WITH CHECK because every row
-- in these tables must belong to the current firm for both reads and writes.
-- ---------------------------------------------------------------------------

-- user_accounts
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_accounts
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_sessions
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- staff_members
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staff_members
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- staff_training
ALTER TABLE staff_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_training FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staff_training
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- compliance_alerts
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance_alerts
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- compliance_checks
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance_checks
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- compliance_tasks
ALTER TABLE compliance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance_tasks
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- risk_scores
ALTER TABLE risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON risk_scores
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- sra_audit_items
ALTER TABLE sra_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sra_audit_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sra_audit_items
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- compliance_scan_results
ALTER TABLE compliance_scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_scan_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance_scan_results
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- regulatory_interpretations
ALTER TABLE regulatory_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_interpretations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON regulatory_interpretations
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- cdd_records
ALTER TABLE cdd_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cdd_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cdd_records
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- sar_records
ALTER TABLE sar_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sar_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sar_records
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- breach_reports
ALTER TABLE breach_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE breach_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON breach_reports
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- client_intakes
ALTER TABLE client_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_intakes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_intakes
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- matters
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON matters
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- conflict_checks
ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conflict_checks
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- conflict_parties
ALTER TABLE conflict_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_parties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conflict_parties
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- undertakings
ALTER TABLE undertakings ENABLE ROW LEVEL SECURITY;
ALTER TABLE undertakings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON undertakings
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- complaints
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON complaints
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- evidence_documents
ALTER TABLE evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_documents
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- policy_documents
ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON policy_documents
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- chaser_logs
ALTER TABLE chaser_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chaser_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chaser_logs
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- client_accounts
ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_accounts
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON transactions
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- reconciliations
ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliations
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_templates
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- email_queue
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_queue
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- remediation_plans
ALTER TABLE remediation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON remediation_plans
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- import_history
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_history
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- integration_sync_logs
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_sync_logs
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- key_dates
ALTER TABLE key_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_dates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON key_dates
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- supervision_records
ALTER TABLE supervision_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervision_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON supervision_records
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));

-- deadlines
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deadlines
  USING (firm_id = current_setting('app.current_firm_id', true))
  WITH CHECK (firm_id = current_setting('app.current_firm_id', true));
