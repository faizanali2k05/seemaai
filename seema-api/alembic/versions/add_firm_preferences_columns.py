"""Add notification_preferences and firm_preferences columns to firms table.

Revision ID: a3f8d2e1b9c4
Revises: add_missing_fields
Create Date: 2026-04-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'a3f8d2e1b9c4'
down_revision = 'add_missing_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('firms', sa.Column('notification_preferences', sa.Text(), nullable=True))
    op.add_column('firms', sa.Column('firm_preferences', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('firms', 'firm_preferences')
    op.drop_column('firms', 'notification_preferences')
