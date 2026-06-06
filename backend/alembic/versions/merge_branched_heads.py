"""Merge branched Alembic heads.

Two prior migrations both declared the initial_schema (c52dd6e4eb76) as
their down_revision, creating parallel branches. As of today there are
two heads: add_clio_columns and 7c68d3e3f1ec. This no-op merge migration
unifies them so `alembic upgrade head` works on a fresh DB without
ambiguity.

Revision ID: merge_heads_2026_05
Revises: add_clio_columns, 7c68d3e3f1ec
Create Date: 2026-05-09 23:30:00.000000
"""
from alembic import op  # noqa: F401  (kept for consistency with other revisions)
import sqlalchemy as sa  # noqa: F401


revision = 'merge_heads_2026_05'
down_revision = ('add_clio_columns', '7c68d3e3f1ec')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
