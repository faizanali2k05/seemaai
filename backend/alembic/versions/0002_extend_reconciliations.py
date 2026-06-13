"""Extend the reconciliations table for the full COFA reconciliation workflow.

Migration 0001 builds the schema from the ORM models via `create_all`. On a
FRESH database the `reconciliations` table is therefore already created WITH the
new columns (the model now declares them), so this migration must be a no-op
there. On an EXISTING database (e.g. the live VPS, or a local volume created
before these columns existed) the table has only the original columns, so we
ADD the missing ones.

Both cases are handled by inspecting the live columns and only adding what's
absent — making this migration safe to run on any database state.

Revision ID: 0002_extend_reconciliations
Revises: 0001_squash_initial
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_extend_reconciliations"
down_revision = "0001_squash_initial"
branch_labels = None
depends_on = None


# (column_name, SQLAlchemy type, server_default-or-None)
_NEW_COLUMNS = [
    ("period_label", sa.String(length=100), None),
    ("period_start", sa.DateTime(), None),
    ("period_end", sa.DateTime(), None),
    ("phase", sa.Integer(), sa.text("1")),
    ("client_money_held", sa.Numeric(15, 2), sa.text("0")),
    ("variance_total", sa.Numeric(15, 2), sa.text("0")),
    ("open_exceptions", sa.Integer(), sa.text("0")),
    ("aged_residuals", sa.Numeric(15, 2), sa.text("0")),
    ("accounts", sa.Text(), None),
    ("notes", sa.Text(), None),
    ("ai_report", sa.Text(), None),
    ("ai_report_generated_at", sa.DateTime(), None),
    ("signed_off_by", sa.String(length=255), None),
    ("signed_off_at", sa.DateTime(), None),
    ("updated_at", sa.DateTime(), sa.text("now()")),
]


def _existing_columns(bind) -> set:
    inspector = sa.inspect(bind)
    if "reconciliations" not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns("reconciliations")}


def upgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind)
    # If the table doesn't exist at all (shouldn't happen — 0001 creates it),
    # there's nothing to extend; the ORM create_all path will have built it.
    if not existing:
        return
    for name, type_, default in _NEW_COLUMNS:
        if name in existing:
            continue
        op.add_column(
            "reconciliations",
            sa.Column(name, type_, server_default=default, nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind)
    for name, _type, _default in reversed(_NEW_COLUMNS):
        if name in existing:
            op.drop_column("reconciliations", name)
