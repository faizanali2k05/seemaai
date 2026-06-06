"""Add ICO notification draft + notified-at columns to breach_reports.

Background
----------
Task #48 surfaces a 72-hour ICO notification countdown for every open
personal-data breach (UK GDPR Article 33) and lets the COLP/DPO generate
an AI-drafted notification letter. To support that workflow we need to
persist:

  * `ico_notification_draft`        — the AI-generated draft body
                                       (serialised JSON of the structured
                                       sections returned by Seema AI).
  * `ico_notification_drafted_at`   — when the draft was last regenerated;
                                       lets the UI show "Drafted 3m ago"
                                       and triggers a re-draft when the
                                       breach record changes after.
  * `ico_notified_at`               — the timestamp the COLP marked the
                                       breach as actually notified to the
                                       ICO. Distinct from
                                       `notification_status` (which is a
                                       free-text label) so we can compute
                                       compliance accurately.

All three columns are nullable — existing rows have not been notified and
do not have a draft yet.

This table is tenant-scoped and already has RLS enabled (see the initial
RLS migration); no policy work needed here — the new columns inherit the
existing `tenant_isolation` policy.

Revision ID: add_breach_ico_fields
Revises: add_regulatory_acks
Create Date: 2026-05-13 13:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_breach_ico_fields'
# Chain off the current head — `add_regulatory_acks` (added on 2026-05-13).
# After this lands, `alembic heads` should report this revision as the
# only head. Verify with `docker compose exec api alembic heads` before
# adding the next migration.
down_revision = 'add_regulatory_acks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All nullable — existing breach rows have neither a draft nor a
    # confirmed notification timestamp yet.
    op.add_column(
        'breach_reports',
        sa.Column('ico_notification_draft', sa.Text(), nullable=True),
    )
    op.add_column(
        'breach_reports',
        sa.Column('ico_notification_drafted_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'breach_reports',
        sa.Column('ico_notified_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('breach_reports', 'ico_notified_at')
    op.drop_column('breach_reports', 'ico_notification_drafted_at')
    op.drop_column('breach_reports', 'ico_notification_draft')
