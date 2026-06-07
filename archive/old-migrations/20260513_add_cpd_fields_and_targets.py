"""Add CPD-tracking columns to staff_training and a firm_cpd_targets table.

Background
----------
Task #51 surfaces a per-staff CPD hours dashboard for the COLP. The SRA's
post-2016 continuing competence regime no longer mandates a fixed 16-hour
CPD requirement, but most firms still set their own internal target and
track activity by category. To support the dashboard we need:

  * `staff_training.category`         — one of `regulatory`, `technical`,
                                        `ethics`, `business_skills`,
                                        `other`. Existing rows default to
                                        `other` and the UI shows a banner
                                        prompting the COLP to recategorise.
  * `staff_training.reflection_notes` — free-text reflection the
                                        practitioner enters after each
                                        learning activity. Required by the
                                        SRA's "reflect on your practice"
                                        principle even though hours are
                                        not.
  * `staff_training.evidence_url`     — optional URL pointing to an upload
                                        (certificate, attendance proof,
                                        etc.). Stored as a varchar; the
                                        actual file lives in object
                                        storage.

We also add a `firm_cpd_targets` table so the firm can set per-role
internal target hours per year (e.g. "16h for solicitors, 12h for
paralegals, 6h for admin"). This is a tenant-scoped table and gets the
standard RLS treatment.

NOTE on the down_revision
-------------------------
The brief asked for `down_revision = 'add_regulatory_acks'`, but
`add_breach_ico_fields` already chains off that revision and is the
current head. Chaining this migration directly off `add_regulatory_acks`
would create a second head and break `alembic upgrade head`. We chain off
`add_breach_ico_fields` instead — same intent, no branching.

RLS
---
`firm_cpd_targets` is tenant-scoped. RLS is enabled with the standard
`tenant_isolation` policy that compares `firm_id` to the session GUC
`app.current_firm_id` — same pattern as
prisma/migrations/20260509211707_enable_rls/migration.sql and
20260513_add_regulatory_acknowledgements.py.

`staff_training` is already RLS-protected — the new columns inherit the
existing policy.

Revision ID: add_cpd_fields_and_targets
Revises: add_breach_ico_fields
Create Date: 2026-05-13 14:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_cpd_fields_and_targets'
down_revision = 'add_breach_ico_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- staff_training: CPD-specific columns -----------------------------
    # All nullable. Existing rows have no category, no reflection, no
    # evidence — the UI surfaces "X uncategorised records" so the COLP
    # can backfill via the quick-edit flow.
    op.add_column(
        'staff_training',
        sa.Column('category', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'staff_training',
        sa.Column('reflection_notes', sa.Text(), nullable=True),
    )
    op.add_column(
        'staff_training',
        sa.Column('evidence_url', sa.String(length=512), nullable=True),
    )
    op.create_index(
        'ix_staff_training_category',
        'staff_training',
        ['firm_id', 'category'],
    )

    # ---- firm_cpd_targets ------------------------------------------------
    # One row per (firm, role, year). The dashboard endpoint joins on
    # role so different staff cohorts can have different targets.
    op.create_table(
        'firm_cpd_targets',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('firm_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=100), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('target_hours', sa.Numeric(6, 2), nullable=False),
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
        sa.UniqueConstraint(
            'firm_id', 'role', 'year',
            name='uq_firm_cpd_targets_firm_role_year',
        ),
    )
    op.create_index(
        'ix_firm_cpd_targets_firm_id',
        'firm_cpd_targets',
        ['firm_id'],
    )

    # Row-Level Security — defence in depth.
    # See prisma/migrations/20260509211707_enable_rls/migration.sql for the
    # canonical pattern used across the codebase.
    op.execute(
        'ALTER TABLE firm_cpd_targets ENABLE ROW LEVEL SECURITY'
    )
    op.execute(
        'ALTER TABLE firm_cpd_targets FORCE ROW LEVEL SECURITY'
    )
    op.execute(
        """
        CREATE POLICY tenant_isolation ON firm_cpd_targets
          USING (firm_id = current_setting('app.current_firm_id', true))
          WITH CHECK (firm_id = current_setting('app.current_firm_id', true))
        """
    )


def downgrade() -> None:
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON firm_cpd_targets')
    op.drop_index('ix_firm_cpd_targets_firm_id', table_name='firm_cpd_targets')
    op.drop_table('firm_cpd_targets')

    op.drop_index('ix_staff_training_category', table_name='staff_training')
    op.drop_column('staff_training', 'evidence_url')
    op.drop_column('staff_training', 'reflection_notes')
    op.drop_column('staff_training', 'category')
