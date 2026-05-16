"""Add supervision_sessions table + cadence_days column on supervision_records.

Background
----------
The existing `supervision_records` table tracks the *register* of
supervisor/supervisee relationships and a single `last_session` /
`next_due` pair. The SRA Code of Conduct for Firms, Rule 3 expects
firms to maintain evidence that supervision *actually happens* —
which means a per-session log with date, duration, topics discussed,
action items, and an acknowledgement that the supervisee saw it.

This migration adds `supervision_sessions` as a child of
`supervision_records` and adds a `cadence_days` column on
`supervision_records` so each relationship can declare its own
overdue threshold (e.g. 30 for monthly, 90 for quarterly). The
existing `frequency` string is kept for back-compat with the
schedule modal but `cadence_days` is the source of truth for the
"overdue" calculation used by the daily reminder cron.

RLS
---
Tenant-scoped table. RLS enabled with the standard `tenant_isolation`
policy that compares `firm_id` to the session GUC `app.current_firm_id`
— same pattern as regulatory_acknowledgements (see
20260513_add_regulatory_acknowledgements.py).

Revision ID: add_supervision_sessions
Revises: add_regulatory_acks
Create Date: 2026-05-13 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_supervision_sessions'
down_revision = 'add_regulatory_acks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. cadence_days on the existing register. Nullable so existing rows
    #    don't need backfill — the overdue query falls back to a default
    #    derived from `frequency` if cadence_days is NULL.
    op.add_column(
        'supervision_records',
        sa.Column('cadence_days', sa.Integer(), nullable=True),
    )

    # 2. supervision_sessions — the actual log of meetings that happened.
    op.create_table(
        'supervision_sessions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('relationship_id', sa.String(length=36), nullable=False),
        sa.Column('session_date', sa.DateTime(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('topics_discussed', sa.Text(), nullable=True),
        sa.Column('action_items', sa.Text(), nullable=True),
        sa.Column('supervisee_acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_user_id', sa.String(length=36), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_supervision_sessions_firm_id',
        'supervision_sessions',
        ['firm_id'],
    )
    op.create_index(
        'ix_supervision_sessions_relationship_id',
        'supervision_sessions',
        ['relationship_id'],
    )
    op.create_index(
        'ix_supervision_sessions_session_date',
        'supervision_sessions',
        ['session_date'],
    )

    # Row-Level Security — defence in depth.
    # The application also filters by firm_id, but RLS guarantees that even
    # if a route handler forgets, cross-tenant rows are invisible.
    op.execute(
        'ALTER TABLE supervision_sessions ENABLE ROW LEVEL SECURITY'
    )
    op.execute(
        'ALTER TABLE supervision_sessions FORCE ROW LEVEL SECURITY'
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation ON supervision_sessions
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON supervision_sessions')
    op.drop_index('ix_supervision_sessions_session_date', table_name='supervision_sessions')
    op.drop_index('ix_supervision_sessions_relationship_id', table_name='supervision_sessions')
    op.drop_index('ix_supervision_sessions_firm_id', table_name='supervision_sessions')
    op.drop_table('supervision_sessions')
    op.drop_column('supervision_records', 'cadence_days')
