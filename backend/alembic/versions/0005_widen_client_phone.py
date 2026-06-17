"""Widen client_intakes.client_phone from VARCHAR(50) to VARCHAR(255).

A Clio contact's phone field can hold a free-text, multi-number string
(e.g. "44 7733384030 (applicant) - 44 7938243059 (James Hindmarch)") that
overflows VARCHAR(50) and aborts the whole contact sync with
asyncpg StringDataRightTruncationError. Widen the column so real Clio data
fits. Idempotent: only alters if the column is still narrower than 255.

Revision ID: 0005_widen_client_phone
Revises: 0004_supervision_reg_acks
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_widen_client_phone"
down_revision = "0004_supervision_reg_acks"
branch_labels = None
depends_on = None


def _col(bind, table, name):
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return None
    for c in insp.get_columns(table):
        if c["name"] == name:
            return c
    return None


def upgrade() -> None:
    bind = op.get_bind()
    col = _col(bind, "client_intakes", "client_phone")
    if col is None:
        return
    length = getattr(col["type"], "length", None)
    if length is not None and length < 255:
        op.alter_column(
            "client_intakes",
            "client_phone",
            type_=sa.String(length=255),
            existing_type=sa.String(length=length),
            existing_nullable=True,
        )


def downgrade() -> None:
    # Narrowing back to 50 could truncate live data; intentionally a no-op.
    pass
