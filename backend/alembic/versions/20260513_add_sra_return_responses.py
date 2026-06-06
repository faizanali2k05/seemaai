"""Add sra_return_responses table for COLP section-by-section quick-fill answers.

Background
----------
Task #45 implemented "SRA Annual Return auto-fill from real data" — the
GET /compliance/sra-return endpoint now returns each section pre-filled
with values pulled from matters / AML / staff / etc.

Task #49 (this migration) adds the persistence layer for the COLP-facing
"walk through return" stepper modal. The COLP steps through each section
and either Accepts the auto-filled value, Overrides it (with a reason),
or Skips it (with a reason). Each decision is stored as one row.

Schema
------
Composite key: (firm_id, return_year, section_key)
  - firm_id: tenant
  - return_year: integer YYYY of the reporting period start (e.g. 2026
    for the 2026-04-01 to 2027-03-31 SRA window)
  - section_key: stable id like 'firm_details', 'insurance', 'aml', etc.

Per-row state:
  - status: 'accepted' | 'overridden' | 'skipped'
  - value: the value as the COLP wants it submitted (TEXT — JSON-encoded
    when the field is structured)
  - notes: required for 'overridden' and 'skipped' (audit trail — the
    COLP must justify any deviation from the auto-filled value)
  - completed_at: timestamp when the decision was last saved
  - completed_by: user_id of the COLP who saved the decision

Plus a parallel `sra_return_finalisations` row per (firm_id, return_year)
that records when the COLP marked the whole return as final.

RLS
---
Standard tenant_isolation policy on firm_id — same canonical pattern as
20260513_add_regulatory_acknowledgements.

Revision ID: add_sra_return_responses
Revises: add_regulatory_acks
Create Date: 2026-05-13 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_sra_return_responses'
down_revision = 'add_regulatory_acks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── sra_return_responses ─────────────────────────────────────────────
    op.create_table(
        'sra_return_responses',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('return_year', sa.Integer(), nullable=False),
        sa.Column('section_key', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('completed_by', sa.String(length=36), nullable=True),
        sa.Column(
            'completed_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'firm_id', 'return_year', 'section_key',
            name='uq_sra_return_responses_firm_year_section',
        ),
    )
    op.create_index(
        'ix_sra_return_responses_firm_id',
        'sra_return_responses',
        ['firm_id'],
    )
    op.create_index(
        'ix_sra_return_responses_firm_year',
        'sra_return_responses',
        ['firm_id', 'return_year'],
    )

    op.execute(
        'ALTER TABLE sra_return_responses ENABLE ROW LEVEL SECURITY'
    )
    op.execute(
        'ALTER TABLE sra_return_responses FORCE ROW LEVEL SECURITY'
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation ON sra_return_responses
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )

    # ── sra_return_finalisations ─────────────────────────────────────────
    # One row per (firm_id, return_year) once the COLP finalises.
    op.create_table(
        'sra_return_finalisations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('return_year', sa.Integer(), nullable=False),
        sa.Column('finalised_by', sa.String(length=36), nullable=True),
        sa.Column(
            'finalised_at',
            sa.DateTime(),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('summary_json', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'firm_id', 'return_year',
            name='uq_sra_return_finalisations_firm_year',
        ),
    )
    op.create_index(
        'ix_sra_return_finalisations_firm_id',
        'sra_return_finalisations',
        ['firm_id'],
    )

    op.execute(
        'ALTER TABLE sra_return_finalisations ENABLE ROW LEVEL SECURITY'
    )
    op.execute(
        'ALTER TABLE sra_return_finalisations FORCE ROW LEVEL SECURITY'
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation ON sra_return_finalisations
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON sra_return_finalisations')
    op.drop_index('ix_sra_return_finalisations_firm_id', table_name='sra_return_finalisations')
    op.drop_table('sra_return_finalisations')

    op.execute('DROP POLICY IF EXISTS tenant_isolation ON sra_return_responses')
    op.drop_index('ix_sra_return_responses_firm_year', table_name='sra_return_responses')
    op.drop_index('ix_sra_return_responses_firm_id', table_name='sra_return_responses')
    op.drop_table('sra_return_responses')
