"""Add pack_deliveries table — tracks who sent which compliance pack to whom.

Background
----------
Today, the Audit Pack ("SRA Inspection Pack") and PII Renewal Pack pages
both produce a downloadable bundle the COLP saves and emails manually.
There's no record inside Seema of who sent what to whom, when, or whether
the email actually landed — which makes incident response and SRA
investigations needlessly painful ("we sent the broker our renewal pack
sometime in May, I think? Let me check Outlook…").

This migration adds `pack_deliveries` so the platform itself can mail
a pack on the COLP's behalf, attach the PDF, and audit the send. The
Node API enqueues a BullMQ email job which reads + updates rows here.

Schema
------
- pack_type            'sra_audit' | 'pii_renewal'
- recipient_email      str
- recipient_name       str (optional)
- message              text (optional cover note)
- sent_by_user_id      str (the COLP/user who hit Send)
- sent_at              timestamp (set on enqueue, not delivery)
- pack_snapshot_url    str (optional — if we persisted a copy of the PDF)
- status               'queued' | 'sent' | 'failed'
- failure_reason       text (populated on failure)

RLS
---
Tenant-scoped. Same `tenant_isolation` policy as every other firm-scoped
table — see 20260513_add_regulatory_acknowledgements.py for the
canonical pattern.

Revision ID: add_pack_deliveries
Revises: add_regulatory_acks
Create Date: 2026-05-13 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_pack_deliveries'
down_revision = 'add_regulatory_acks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pack_deliveries',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('pack_type', sa.String(length=32), nullable=False),
        sa.Column('recipient_email', sa.String(length=255), nullable=False),
        sa.Column('recipient_name', sa.String(length=255), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('sent_by_user_id', sa.String(length=36), nullable=False),
        sa.Column(
            'sent_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('pack_snapshot_url', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='queued'),
        sa.Column('failure_reason', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pack_deliveries_firm_id', 'pack_deliveries', ['firm_id'])
    op.create_index('ix_pack_deliveries_pack_type', 'pack_deliveries', ['pack_type'])
    op.create_index('ix_pack_deliveries_sent_at', 'pack_deliveries', ['sent_at'])

    # Row-Level Security — defence in depth, mirroring every other tenant
    # table. The Node route also filters by firm_id, but RLS guarantees
    # cross-tenant rows are invisible even if a future handler forgets.
    op.execute('ALTER TABLE pack_deliveries ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE pack_deliveries FORCE ROW LEVEL SECURITY')
    op.execute(
        """
        CREATE POLICY tenant_isolation ON pack_deliveries
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON pack_deliveries')
    op.drop_index('ix_pack_deliveries_sent_at', table_name='pack_deliveries')
    op.drop_index('ix_pack_deliveries_pack_type', table_name='pack_deliveries')
    op.drop_index('ix_pack_deliveries_firm_id', table_name='pack_deliveries')
    op.drop_table('pack_deliveries')
