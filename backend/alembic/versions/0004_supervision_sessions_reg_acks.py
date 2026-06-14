"""Add supervision_sessions + regulatory_acknowledgements tables and CPD columns.

Idempotent like 0002/0003: on a FRESH database, 0001's `create_all` already
builds these (the models are registered), so this only creates/adds what's
absent on an EXISTING database. Both new tables carry firm_id, so
scripts/apply_rls.py enforces tenant isolation on them automatically.

Revision ID: 0004_supervision_sessions_reg_acks
Revises: 0003_extend_breach_reports
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_supervision_sessions_reg_acks"
down_revision = "0003_extend_breach_reports"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _cols(bind, table) -> set:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _tables(bind)

    if "supervision_sessions" not in tables:
        op.create_table(
            "supervision_sessions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("firm_id", sa.String(length=36), nullable=False),
            sa.Column("relationship_id", sa.String(length=36), nullable=False),
            sa.Column("session_date", sa.DateTime()),
            sa.Column("duration_minutes", sa.Integer()),
            sa.Column("topics_discussed", sa.Text()),
            sa.Column("action_items", sa.Text()),
            sa.Column("supervisee_acknowledged_at", sa.DateTime()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if "regulatory_acknowledgements" not in tables:
        op.create_table(
            "regulatory_acknowledgements",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("firm_id", sa.String(length=36), nullable=False),
            sa.Column("update_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36)),
            sa.Column("staff_name", sa.String(length=255)),
            sa.Column("acknowledged_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    st = _cols(bind, "staff_training")
    if st:
        if "cpd_category" not in st:
            op.add_column("staff_training", sa.Column("cpd_category", sa.String(length=50), nullable=True))
        if "reflection_notes" not in st:
            op.add_column("staff_training", sa.Column("reflection_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    st = _cols(bind, "staff_training")
    if "reflection_notes" in st:
        op.drop_column("staff_training", "reflection_notes")
    if "cpd_category" in st:
        op.drop_column("staff_training", "cpd_category")
    tables = _tables(bind)
    if "regulatory_acknowledgements" in tables:
        op.drop_table("regulatory_acknowledgements")
    if "supervision_sessions" in tables:
        op.drop_table("supervision_sessions")
