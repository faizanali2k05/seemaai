"""Add all compliance tables

Revision ID: 7c68d3e3f1ec
Revises: a3f8d2e1b9c4
Create Date: 2026-04-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "7c68d3e3f1ec"
down_revision = "a3f8d2e1b9c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── user_accounts ──────────────────────────────────────────────
    op.create_table(
        "user_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("staff_id", sa.String(36), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("last_login", sa.DateTime, nullable=True),
        sa.Column("failed_login_attempts", sa.Integer, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── user_sessions ──────────────────────────────────────────────
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("token", sa.String(500), nullable=False, unique=True),
        sa.Column("refresh_token", sa.String(500), nullable=True, unique=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── staff_members ──────────────────────────────────────────────
    op.create_table(
        "staff_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("department", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'active'")),
        sa.Column("pqe", sa.String(50), nullable=True),
        sa.Column("sra_id", sa.String(50), nullable=True),
        sa.Column("start_date", sa.DateTime, nullable=True),
        sa.Column("last_training", sa.DateTime, nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── staff_training ─────────────────────────────────────────────
    op.create_table(
        "staff_training",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("staff_id", sa.String(36), nullable=False),
        sa.Column("staff_name", sa.String(255), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("training_type", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("due_date", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("cpd_hours", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── audit_logs ─────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── compliance_alerts ──────────────────────────────────────────
    op.create_table(
        "compliance_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("alert_type", sa.String(100), nullable=True),
        sa.Column("severity", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(50), server_default=sa.text("'open'")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("acknowledged_by", sa.String(36), nullable=True),
        sa.Column("resolved_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── compliance_scan_results ────────────────────────────────────
    op.create_table(
        "compliance_scan_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("scan_date", sa.DateTime, nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("check_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), server_default=sa.text("'pass'")),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("recommendation", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── regulatory_updates ─────────────────────────────────────────
    op.create_table(
        "regulatory_updates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("impact_level", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("published_date", sa.DateTime, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("regulatory_body", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'published'")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── cdd_records ────────────────────────────────────────────────
    op.create_table(
        "cdd_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_type", sa.String(100), nullable=True),
        sa.Column("cdd_level", sa.String(50), nullable=True),
        sa.Column("risk_level", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("id_verified", sa.Boolean, server_default=sa.text("false")),
        sa.Column("address_verified", sa.Boolean, server_default=sa.text("false")),
        sa.Column("sof_verified", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("nationality", sa.String(100), nullable=True),
        sa.Column("country_of_residence", sa.String(100), nullable=True),
        sa.Column("company_number", sa.String(50), nullable=True),
        sa.Column("date_of_birth", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── sar_records ────────────────────────────────────────────────
    op.create_table(
        "sar_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("matter_ref", sa.String(100), nullable=True),
        sa.Column("suspicion_type", sa.String(100), nullable=True),
        sa.Column("amount", sa.Numeric(15, 2), nullable=True),
        sa.Column("report_date", sa.DateTime, nullable=True),
        sa.Column("mlro_decision", sa.String(100), nullable=True),
        sa.Column("nca_filed", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default=sa.text("'submitted'")),
        sa.Column("grounds_for_suspicion", sa.Text, nullable=True),
        sa.Column("transaction_details", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── breach_reports ─────────────────────────────────────────────
    op.create_table(
        "breach_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("breach_type", sa.String(100), nullable=True),
        sa.Column("severity", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(50), server_default=sa.text("'open'")),
        sa.Column("reported_date", sa.DateTime, nullable=True),
        sa.Column("ico_deadline", sa.DateTime, nullable=True),
        sa.Column("notification_status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("affected_records", sa.Integer, server_default=sa.text("0")),
        sa.Column("root_cause", sa.Text, nullable=True),
        sa.Column("resolution_date", sa.DateTime, nullable=True),
        sa.Column("remediation_plan_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── client_intakes ─────────────────────────────────────────────
    op.create_table(
        "client_intakes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_email", sa.String(255), nullable=True),
        sa.Column("practice_area", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("conflict_check_status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("conflict_check_details", sa.Text, nullable=True),
        sa.Column("client_care_letter_sent", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("risk_level", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("risk_score", sa.Numeric(5, 2), server_default=sa.text("0")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("source_of_funds", sa.String(100), nullable=True),
        sa.Column("pep_screening", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("sanctions_check", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("cdd_status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── matters ────────────────────────────────────────────────────
    op.create_table(
        "matters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("matter_type", sa.String(100), nullable=False),
        sa.Column("reference", sa.String(50), nullable=True, unique=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'open'")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("risk_level", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("fee_estimate", sa.Numeric(15, 2), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── matter_items ───────────────────────────────────────────────
    op.create_table(
        "matter_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("matter_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_complete", sa.Boolean, server_default=sa.text("false")),
        sa.Column("order", sa.Numeric(5, 2), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── conflict_checks ────────────────────────────────────────────
    op.create_table(
        "conflict_checks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("matter_type", sa.String(100), nullable=True),
        sa.Column("parties", sa.Text, nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("conflict_type", sa.String(100), nullable=True),
        sa.Column("checked_by", sa.String(36), nullable=True),
        sa.Column("resolution", sa.Text, nullable=True),
        sa.Column("resolved_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── conflict_parties ───────────────────────────────────────────
    op.create_table(
        "conflict_parties",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("party_name", sa.String(255), nullable=False),
        sa.Column("party_type", sa.String(50), nullable=True),
        sa.Column("date_added", sa.DateTime, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── undertakings ───────────────────────────────────────────────
    op.create_table(
        "undertakings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("matter_ref", sa.String(100), nullable=True),
        sa.Column("given_to", sa.String(255), nullable=True),
        sa.Column("given_by", sa.String(255), nullable=True),
        sa.Column("given_date", sa.DateTime, nullable=True),
        sa.Column("due_date", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── complaints ─────────────────────────────────────────────────
    op.create_table(
        "complaints",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("complainant_name", sa.String(255), nullable=False),
        sa.Column("complainant_type", sa.String(100), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("priority", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(50), server_default=sa.text("'open'")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("opened_date", sa.DateTime, server_default=sa.func.now()),
        sa.Column("closed_date", sa.DateTime, nullable=True),
        sa.Column("resolution", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── evidence_documents ─────────────────────────────────────────
    op.create_table(
        "evidence_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("file_size", sa.Integer, server_default=sa.text("0")),
        sa.Column("uploaded_by", sa.String(36), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("review_date", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── policy_documents ───────────────────────────────────────────
    op.create_table(
        "policy_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'draft'")),
        sa.Column("version", sa.String(20), server_default=sa.text("'1.0'")),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("last_reviewed", sa.DateTime, nullable=True),
        sa.Column("next_review", sa.DateTime, nullable=True),
        sa.Column("owner", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── chaser_logs ────────────────────────────────────────────────
    op.create_table(
        "chaser_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("matter_ref", sa.String(100), nullable=True),
        sa.Column("chaser_type", sa.String(100), nullable=True),
        sa.Column("recipient", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("sent_at", sa.DateTime, nullable=True),
        sa.Column("response_at", sa.DateTime, nullable=True),
        sa.Column("attempts", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── client_accounts ────────────────────────────────────────────
    op.create_table(
        "client_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("account_name", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(50), nullable=True),
        sa.Column("balance", sa.Numeric(15, 2), server_default=sa.text("0")),
        sa.Column("status", sa.String(50), server_default=sa.text("'active'")),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("account_number", sa.String(50), nullable=True),
        sa.Column("sort_code", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── transactions ───────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("account_id", sa.String(36), nullable=False),
        sa.Column("date", sa.DateTime, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("type", sa.String(50), nullable=True),
        sa.Column("matter_ref", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── reconciliations ────────────────────────────────────────────
    op.create_table(
        "reconciliations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("period", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("reconciled_by", sa.String(36), nullable=True),
        sa.Column("discrepancies", sa.Text, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── email_templates ────────────────────────────────────────────
    op.create_table(
        "email_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── email_queue ────────────────────────────────────────────────
    op.create_table(
        "email_queue",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("template_id", sa.String(36), nullable=True),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("sent_at", sa.DateTime, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── remediation_plans ──────────────────────────────────────────
    op.create_table(
        "remediation_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("priority", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("due_date", sa.DateTime, nullable=True),
        sa.Column("steps", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── import_history ─────────────────────────────────────────────
    op.create_table(
        "import_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("import_type", sa.String(100), nullable=False),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("records_processed", sa.Integer, server_default=sa.text("0")),
        sa.Column("records_failed", sa.Integer, server_default=sa.text("0")),
        sa.Column("imported_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── integrations ───────────────────────────────────────────────
    op.create_table(
        "integrations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), server_default=sa.text("'active'")),
        sa.Column("config", sa.Text, nullable=True),
        sa.Column("last_sync", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── key_dates ──────────────────────────────────────────────────
    op.create_table(
        "key_dates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("date", sa.DateTime, nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── supervision_records ────────────────────────────────────────
    op.create_table(
        "supervision_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("staff_id", sa.String(36), nullable=False),
        sa.Column("staff_name", sa.String(255), nullable=True),
        sa.Column("supervisor", sa.String(255), nullable=True),
        sa.Column("frequency", sa.String(50), nullable=True),
        sa.Column("last_session", sa.DateTime, nullable=True),
        sa.Column("next_due", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("notes_count", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── deadlines ──────────────────────────────────────────────────
    op.create_table(
        "deadlines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("firm_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("due_date", sa.DateTime, nullable=False),
        sa.Column("priority", sa.String(50), server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(50), server_default=sa.text("'pending'")),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    tables = [
        "deadlines", "supervision_records", "key_dates", "integrations",
        "import_history", "remediation_plans", "email_queue", "email_templates",
        "reconciliations", "transactions", "client_accounts", "chaser_logs",
        "policy_documents", "evidence_documents", "complaints", "undertakings",
        "conflict_parties", "conflict_checks", "matter_items", "matters",
        "client_intakes", "breach_reports", "sar_records", "cdd_records",
        "regulatory_updates", "compliance_scan_results", "compliance_alerts",
        "audit_logs", "staff_training", "staff_members", "user_sessions",
        "user_accounts",
    ]
    for t in tables:
        op.drop_table(t)
