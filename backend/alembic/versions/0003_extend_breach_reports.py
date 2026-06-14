"""Extend breach_reports for the full 8-phase breach register workflow.

Adds the columns that back the breach register (reference, phase, classification,
tracks, per-phase workflow_data JSON, AI SRA report draft, COLP sign-off). Like
0002 this is idempotent: on a fresh DB migration 0001's create_all already built
the columns from the ORM model, so we only ADD the ones that are missing.

Revision ID: 0003_extend_breach_reports
Revises: 0002_extend_reconciliations
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_extend_breach_reports"
down_revision = "0002_extend_reconciliations"
branch_labels = None
depends_on = None


_NEW_COLUMNS = [
    ("breach_ref", sa.String(length=40), None),
    ("phase", sa.Integer(), sa.text("1")),
    ("classification", sa.String(length=50), None),
    ("tracks", sa.Text(), None),
    ("detected_at", sa.DateTime(), None),
    ("workflow_data", sa.Text(), None),
    ("sra_report_draft", sa.Text(), None),
    ("sra_report_drafted_at", sa.DateTime(), None),
    ("signed_off_by", sa.String(length=255), None),
    ("signed_off_at", sa.DateTime(), None),
]


def _existing_columns(bind) -> set:
    inspector = sa.inspect(bind)
    if "breach_reports" not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns("breach_reports")}


def upgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind)
    if not existing:
        return
    for name, type_, default in _NEW_COLUMNS:
        if name in existing:
            continue
        op.add_column(
            "breach_reports",
            sa.Column(name, type_, server_default=default, nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind)
    for name, _type, _default in reversed(_NEW_COLUMNS):
        if name in existing:
            op.drop_column("breach_reports", name)
