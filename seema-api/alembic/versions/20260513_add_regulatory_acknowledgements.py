"""Add regulatory_acknowledgements junction table for per-staff read tracking.

Background
----------
Today, `regulatory_interpretations.acknowledged_at` + `acknowledged_by`
record a single acknowledger — the COLP-level sign-off. The COLP also
needs visibility into "which staff have read this regulatory update vs
which haven't" so they can chase the laggards.

This migration adds `regulatory_acknowledgements` (firm_id, update_id,
user_id, acknowledged_at, notes) as an N:M junction. The existing
single-acknowledger columns are untouched.

This migration ALSO merges the two outstanding Alembic heads
(`merge_heads_2026_05` and `add_override_columns`) so `alembic upgrade
head` stays unambiguous after this file lands.

RLS
---
This is a tenant-scoped table. RLS is enabled with the standard
`tenant_isolation` policy that compares `firm_id` to the session GUC
`app.current_firm_id` — same pattern as every other tenant-scoped
table (see prisma/migrations/20260509211707_enable_rls/migration.sql).

Revision ID: add_regulatory_acks
Revises: merge_heads_2026_05, add_override_columns
Create Date: 2026-05-13 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_regulatory_acks'
# Merge both outstanding heads — otherwise `alembic upgrade head` errors
# with "Multiple head revisions are present".
down_revision = ('merge_heads_2026_05', 'add_override_columns')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'regulatory_acknowledgements',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('update_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column(
            'acknowledged_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'firm_id', 'update_id', 'user_id',
            name='uq_regulatory_acks_firm_update_user',
        ),
    )
    op.create_index(
        'ix_regulatory_acks_firm_id',
        'regulatory_acknowledgements',
        ['firm_id'],
    )
    op.create_index(
        'ix_regulatory_acks_update_id',
        'regulatory_acknowledgements',
        ['update_id'],
    )

    # Row-Level Security — defence in depth.
    # The application also filters by firm_id, but RLS guarantees that even
    # if a route handler forgets, cross-tenant rows are invisible.
    # See prisma/migrations/20260509211707_enable_rls/migration.sql for the
    # canonical pattern used across the codebase.
    op.execute(
        'ALTER TABLE regulatory_acknowledgements ENABLE ROW LEVEL SECURITY'
    )
    op.execute(
        'ALTER TABLE regulatory_acknowledgements FORCE ROW LEVEL SECURITY'
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation ON regulatory_acknowledgements
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )


def downgrade() -> None:
    # Drop policy first — Postgres won't let you drop a table that still has
    # policies attached without CASCADE, and we'd rather be explicit.
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON regulatory_acknowledgements')
    op.drop_index('ix_regulatory_acks_update_id', table_name='regulatory_acknowledgements')
    op.drop_index('ix_regulatory_acks_firm_id', table_name='regulatory_acknowledgements')
    op.drop_table('regulatory_acknowledgements')
