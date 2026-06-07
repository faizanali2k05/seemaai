"""Squashed initial schema — canonical ORM models + service helper tables.

This single migration REPLACES the previous, conflicting migration chain. The
old chain had two migrations (`c52dd6e4eb76_initial_schema` and
`7c68d3e3f1ec_add_all_compliance_tables`) that both `CREATE`d the same 10 tables,
so `alembic upgrade head` crashed on a fresh database and the app could not boot.

Approach (chosen for a fresh database with no data to preserve):
  1. Build the canonical schema directly from the SQLAlchemy models in `models/`
     via `Base.metadata.create_all` — guaranteed to match what the ORM/routers
     expect, with zero drift.
  2. Add the few tables that have NO ORM model but are read/written by the
     raw-SQL background services (`services/chase_engine.py`,
     `services/email_service.py`).

The previous migration files were moved to `archive/old-migrations/` for
reference. If you ever need to restore real data from an old database, see them.

Revision ID: 0001_squash_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_squash_initial"
down_revision = None
branch_labels = None
depends_on = None

# Tables with no ORM model, used only by raw SQL in the background services.
_HELPER_TABLES = [
    "email_settings",
    "staff_file_reviews",
    "supervision_schedule",
    "law_deadlines",
]


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Canonical schema straight from the ORM models. Importing the `models`
    #    package registers every table on Base.metadata.
    from database import Base
    import models  # noqa: F401  (populates Base.metadata)

    Base.metadata.create_all(bind=bind)

    existing = set(sa.inspect(bind).get_table_names())

    # 2. Service helper tables (created only if not already present).
    if "email_settings" not in existing:
        op.create_table(
            "email_settings",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("firm_id", sa.String(36), sa.ForeignKey("firms.id"),
                      nullable=False, index=True),
            sa.Column("from_email", sa.String(255)),
            sa.Column("from_name", sa.String(255)),
            sa.Column("enabled", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("auto_chase_training", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("auto_chase_reviews", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("auto_chase_cdd", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("chase_frequency_days", sa.Integer(), server_default=sa.text("7")),
            sa.Column("escalation_after_days", sa.Integer(), server_default=sa.text("21")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.UniqueConstraint("firm_id"),
        )

    if "staff_file_reviews" not in existing:
        op.create_table(
            "staff_file_reviews",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("firm_id", sa.String(36), sa.ForeignKey("firms.id"),
                      nullable=False, index=True),
            sa.Column("staff_id", sa.String(36)),
            sa.Column("case_id", sa.String(36)),
            sa.Column("reviewer_id", sa.String(36)),
            sa.Column("status", sa.String(20)),
            sa.Column("due_date", sa.String(20)),
            sa.Column("completed_at", sa.String(30)),
            sa.Column("findings", sa.Text()),
            sa.Column("score", sa.Integer()),
        )

    if "supervision_schedule" not in existing:
        op.create_table(
            "supervision_schedule",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("firm_id", sa.String(36), sa.ForeignKey("firms.id"),
                      nullable=False, index=True),
            sa.Column("staff_id", sa.String(36)),
            sa.Column("supervisor_id", sa.String(36)),
            sa.Column("frequency", sa.String(20)),
            sa.Column("next_due", sa.String(20)),
            sa.Column("last_completed", sa.String(30)),
            sa.Column("meeting_type", sa.String(50)),
            sa.Column("risk_level", sa.String(20)),
            sa.Column("notes", sa.Text()),
            sa.Column("status", sa.String(20)),
        )

    if "law_deadlines" not in existing:
        op.create_table(
            "law_deadlines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("firm_id", sa.String(36), sa.ForeignKey("firms.id"),
                      nullable=False, index=True),
            sa.Column("case_id", sa.String(36)),
            sa.Column("deadline_type", sa.String(100)),
            sa.Column("due_date", sa.String(20)),
            sa.Column("description", sa.Text()),
            sa.Column("status", sa.String(20)),
            sa.Column("priority", sa.String(20)),
            sa.Column("cpr_rule", sa.String(50)),
        )


def downgrade() -> None:
    for table in _HELPER_TABLES:
        op.drop_table(table)

    from database import Base
    import models  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())
