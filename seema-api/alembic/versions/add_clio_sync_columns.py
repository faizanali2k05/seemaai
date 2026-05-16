"""Add Clio integration / sync columns to matters, client_intakes, staff_members.

These columns were added to the SQLAlchemy models earlier (see
seema-api/models/matters.py lines 24-31) but never had a corresponding
Alembic migration generated. This migration codifies the change.

If the columns already exist in the database (as they will if you applied
the manual ALTER TABLE block during the Prisma/Alembic schema-authority
transition on 2026-05-09), use `alembic stamp add_clio_columns` instead
of `alembic upgrade head` to mark this revision applied without re-running
the DDL.

Revision ID: add_clio_columns
Revises: add_missing_fields
Create Date: 2026-05-09 22:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_clio_columns'
down_revision = 'add_missing_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # matters: Clio integration / sync fields
    op.add_column('matters', sa.Column('external_ref', sa.String(100), nullable=True))
    op.add_column('matters', sa.Column('source', sa.String(50), nullable=True))
    op.add_column('matters', sa.Column('title', sa.String(255), nullable=True))
    op.add_column('matters', sa.Column('description', sa.Text, nullable=True))
    op.add_column('matters', sa.Column('practice_area', sa.String(100), nullable=True))
    op.add_column('matters', sa.Column('client_id', sa.String(36), nullable=True))
    op.add_column('matters', sa.Column('open_date', sa.String(20), nullable=True))
    op.add_column('matters', sa.Column('close_date', sa.String(20), nullable=True))
    op.create_index('ix_matters_external_ref', 'matters', ['external_ref'])

    # client_intakes: Clio sync fields
    op.add_column('client_intakes', sa.Column('external_ref', sa.String(100), nullable=True))
    op.add_column('client_intakes', sa.Column('source', sa.String(50), nullable=True))
    op.add_column('client_intakes', sa.Column('client_phone', sa.String(50), nullable=True))
    op.add_column('client_intakes', sa.Column('client_type', sa.String(50), nullable=True))
    op.add_column('client_intakes', sa.Column('company_name', sa.String(255), nullable=True))

    # staff_members: Clio sync fields
    op.add_column('staff_members', sa.Column('external_ref', sa.String(100), nullable=True))
    op.add_column('staff_members', sa.Column('source', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('staff_members', 'source')
    op.drop_column('staff_members', 'external_ref')
    op.drop_column('client_intakes', 'company_name')
    op.drop_column('client_intakes', 'client_type')
    op.drop_column('client_intakes', 'client_phone')
    op.drop_column('client_intakes', 'source')
    op.drop_column('client_intakes', 'external_ref')
    op.drop_index('ix_matters_external_ref', table_name='matters')
    op.drop_column('matters', 'close_date')
    op.drop_column('matters', 'open_date')
    op.drop_column('matters', 'client_id')
    op.drop_column('matters', 'practice_area')
    op.drop_column('matters', 'description')
    op.drop_column('matters', 'title')
    op.drop_column('matters', 'source')
    op.drop_column('matters', 'external_ref')
