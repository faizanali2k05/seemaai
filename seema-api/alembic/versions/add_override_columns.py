"""Add override_* columns to compliance_alerts, compliance_scan_results,
risk_scores, regulatory_interpretations.

These columns were declared in the Prisma schema (used by the Node API)
but never had a corresponding Alembic migration generated. The dashboard
daily-briefing endpoint failed at runtime because Prisma's generated
SQL referenced compliance_alerts.override_severity which didn't exist.

If the columns already exist in the database (because you applied the
manual ALTER TABLE block during the schema drift fix on 2026-05-10),
use `alembic stamp add_override_columns` instead of `alembic upgrade head`
to mark this revision applied without re-running the DDL.

Revision ID: add_override_columns
Revises: add_clio_columns
Create Date: 2026-05-10 16:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_override_columns'
down_revision = 'add_clio_columns'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # compliance_alerts
    op.add_column('compliance_alerts', sa.Column('override_severity', sa.String(20), nullable=True))
    op.add_column('compliance_alerts', sa.Column('override_action_required', sa.Text, nullable=True))
    op.add_column('compliance_alerts', sa.Column('override_notes', sa.Text, nullable=True))
    op.add_column('compliance_alerts', sa.Column('overridden_by', sa.String(36), nullable=True))
    op.add_column('compliance_alerts', sa.Column('overridden_at', sa.DateTime, nullable=True))

    # compliance_scan_results
    op.add_column('compliance_scan_results', sa.Column('override_status', sa.String(20), nullable=True))
    op.add_column('compliance_scan_results', sa.Column('override_recommendation', sa.Text, nullable=True))
    op.add_column('compliance_scan_results', sa.Column('override_notes', sa.Text, nullable=True))
    op.add_column('compliance_scan_results', sa.Column('overridden_by', sa.String(36), nullable=True))
    op.add_column('compliance_scan_results', sa.Column('overridden_at', sa.DateTime, nullable=True))

    # risk_scores
    op.add_column('risk_scores', sa.Column('override_overall_score', sa.Integer, nullable=True))
    op.add_column('risk_scores', sa.Column('override_notes', sa.Text, nullable=True))
    op.add_column('risk_scores', sa.Column('overridden_by', sa.String(36), nullable=True))
    op.add_column('risk_scores', sa.Column('overridden_at', sa.DateTime, nullable=True))

    # regulatory_interpretations
    op.add_column('regulatory_interpretations', sa.Column('override_applicability', sa.String(10), nullable=True))
    op.add_column('regulatory_interpretations', sa.Column('override_notes', sa.Text, nullable=True))
    op.add_column('regulatory_interpretations', sa.Column('override_action_items', sa.Text, nullable=True))
    op.add_column('regulatory_interpretations', sa.Column('overridden_by', sa.String(36), nullable=True))
    op.add_column('regulatory_interpretations', sa.Column('overridden_at', sa.DateTime, nullable=True))


def downgrade() -> None:
    op.drop_column('regulatory_interpretations', 'overridden_at')
    op.drop_column('regulatory_interpretations', 'overridden_by')
    op.drop_column('regulatory_interpretations', 'override_action_items')
    op.drop_column('regulatory_interpretations', 'override_notes')
    op.drop_column('regulatory_interpretations', 'override_applicability')
    op.drop_column('risk_scores', 'overridden_at')
    op.drop_column('risk_scores', 'overridden_by')
    op.drop_column('risk_scores', 'override_notes')
    op.drop_column('risk_scores', 'override_overall_score')
    op.drop_column('compliance_scan_results', 'overridden_at')
    op.drop_column('compliance_scan_results', 'overridden_by')
    op.drop_column('compliance_scan_results', 'override_notes')
    op.drop_column('compliance_scan_results', 'override_recommendation')
    op.drop_column('compliance_scan_results', 'override_status')
    op.drop_column('compliance_alerts', 'overridden_at')
    op.drop_column('compliance_alerts', 'overridden_by')
    op.drop_column('compliance_alerts', 'override_notes')
    op.drop_column('compliance_alerts', 'override_action_required')
    op.drop_column('compliance_alerts', 'override_severity')
