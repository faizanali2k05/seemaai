"""Widen client_phone, add Clio external_ref to financial/deadline tables, and
create clio_activities + clio_bills.

A Clio contact's phone field can hold a free-text, multi-number string
(e.g. "44 7733384030 (applicant) - 44 7938243059 (James Hindmarch)") that
overflows VARCHAR(50) and aborts the whole contact sync with
asyncpg StringDataRightTruncationError. Widen the column so real Clio data fits.

This revision also wires the expanded Clio sync: external_ref (+ index) and
source columns on client_accounts / transactions / deadlines so bank-account,
bank-transaction and calendar syncs can upsert idempotently, plus new
clio_activities and clio_bills tables for Clio data with no existing home.

Idempotent like 0002/0003/0004: on a FRESH database, 0001's `create_all`
already builds these (the models are registered), so this only creates/adds what
is absent on an EXISTING database. All new tables carry firm_id, so
scripts/apply_rls.py enforces tenant isolation on them automatically.

Revision ID: 0005_widen_client_phone
Revises: 0004_supervision_reg_acks
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_widen_client_phone"
down_revision = "0004_supervision_reg_acks"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _cols(bind, table) -> set:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _col(bind, table, name):
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return None
    for c in insp.get_columns(table):
        if c["name"] == name:
            return c
    return None


def _add_clio_cols(bind, table: str) -> None:
    """Add external_ref (+ index) and source to an existing tenant table."""
    cols = _cols(bind, table)
    if not cols:
        return
    if "external_ref" not in cols:
        op.add_column(table, sa.Column("external_ref", sa.String(length=100), nullable=True))
        op.create_index(f"ix_{table}_external_ref", table, ["external_ref"])
    if "source" not in cols:
        op.add_column(table, sa.Column("source", sa.String(length=50), nullable=True))


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Widen client_intakes.client_phone -> 255 (only if still narrower).
    col = _col(bind, "client_intakes", "client_phone")
    if col is not None:
        length = getattr(col["type"], "length", None)
        if length is not None and length < 255:
            op.alter_column(
                "client_intakes",
                "client_phone",
                type_=sa.String(length=255),
                existing_type=sa.String(length=length),
                existing_nullable=True,
            )

    # 2. Clio integration columns on existing financial/deadline tables.
    _add_clio_cols(bind, "client_accounts")
    _add_clio_cols(bind, "transactions")
    _add_clio_cols(bind, "deadlines")

    # 3. New tables for Clio data with no existing home.
    tables = _tables(bind)
    if "clio_activities" not in tables:
        op.create_table(
            "clio_activities",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("firm_id", sa.String(length=36), nullable=False),
            sa.Column("external_ref", sa.String(length=100)),
            sa.Column("source", sa.String(length=50), server_default="clio"),
            sa.Column("activity_type", sa.String(length=50)),
            sa.Column("date", sa.DateTime()),
            sa.Column("quantity", sa.Numeric(12, 2)),
            sa.Column("total", sa.Numeric(15, 2)),
            sa.Column("note", sa.Text()),
            sa.Column("matter_ref", sa.String(length=100)),
            sa.Column("matter_external_ref", sa.String(length=100)),
            sa.Column("user_name", sa.String(length=255)),
            sa.Column("billed", sa.String(length=20)),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_clio_activities_firm_id", "clio_activities", ["firm_id"])
        op.create_index("ix_clio_activities_external_ref", "clio_activities", ["external_ref"])
        op.create_index("ix_clio_activities_matter_external_ref", "clio_activities", ["matter_external_ref"])

    if "clio_bills" not in tables:
        op.create_table(
            "clio_bills",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("firm_id", sa.String(length=36), nullable=False),
            sa.Column("external_ref", sa.String(length=100)),
            sa.Column("source", sa.String(length=50), server_default="clio"),
            sa.Column("number", sa.String(length=100)),
            sa.Column("state", sa.String(length=50)),
            sa.Column("total", sa.Numeric(15, 2)),
            sa.Column("balance", sa.Numeric(15, 2)),
            sa.Column("issued_at", sa.DateTime()),
            sa.Column("due_at", sa.DateTime()),
            sa.Column("client_name", sa.String(length=255)),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_clio_bills_firm_id", "clio_bills", ["firm_id"])
        op.create_index("ix_clio_bills_external_ref", "clio_bills", ["external_ref"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = _tables(bind)
    if "clio_bills" in tables:
        op.drop_table("clio_bills")
    if "clio_activities" in tables:
        op.drop_table("clio_activities")

    for table in ("deadlines", "transactions", "client_accounts"):
        cols = _cols(bind, table)
        if "source" in cols:
            op.drop_column(table, "source")
        if "external_ref" in cols:
            try:
                op.drop_index(f"ix_{table}_external_ref", table_name=table)
            except Exception:
                pass
            op.drop_column(table, "external_ref")

    # Narrowing client_phone back to 50 could truncate live data; no-op.
