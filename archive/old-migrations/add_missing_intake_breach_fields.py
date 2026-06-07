"""Add missing intake and breach fields for cascade logic.

Revision ID: add_missing_fields
Revises: c52dd6e4eb76
Create Date: 2025-04-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_missing_fields'
down_revision = 'c52dd6e4eb76'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add missing fields to client_intake
    op.add_column('client_intake', sa.Column('matter_type', sa.String(100), nullable=True))
    op.add_column('client_intake', sa.Column('assigned_fee_earner', sa.String(36), nullable=True))
    op.add_column('client_intake', sa.Column('client_reference', sa.String(100), nullable=True))
    op.add_column('client_intake', sa.Column('intake_date', sa.String(30), nullable=True))
    op.add_column('client_intake', sa.Column('conflict_check', sa.String(20), nullable=True, server_default='pending'))
    op.add_column('client_intake', sa.Column('risk_assessment', sa.Text(), nullable=True))

    # Add missing fields to breach_reports
    op.add_column('breach_reports', sa.Column('incident_date', sa.String(30), nullable=True))
    op.add_column('breach_reports', sa.Column('reported_to_ico', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column('breach_reports', sa.Column('report_reference', sa.String(100), nullable=True))


def downgrade() -> None:
    # Remove added columns from breach_reports
    op.drop_column('breach_reports', 'report_reference')
    op.drop_column('breach_reports', 'reported_to_ico')
    op.drop_column('breach_reports', 'incident_date')

    # Remove added columns from client_intake
    op.drop_column('client_intake', 'risk_assessment')
    op.drop_column('client_intake', 'conflict_check')
    op.drop_column('client_intake', 'intake_date')
    op.drop_column('client_intake', 'client_reference')
    op.drop_column('client_intake', 'assigned_fee_earner')
    op.drop_column('client_intake', 'matter_type')
