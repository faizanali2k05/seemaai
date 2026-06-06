"""Merge the four sibling feature-migration heads created on 2026-05-13.

Background
----------
Five feature migrations landed in parallel on 2026-05-13 (tasks #48-52):
  * add_breach_ico_fields            (#48 — Breach ICO countdown)
  * add_sra_return_responses         (#49 — SRA Return quick-fill)
  * add_pack_deliveries              (#50 — Audit/PII send-to-recipient)
  * add_cpd_fields_and_targets       (#51 — CPD dashboard;
                                            chained off add_breach_ico_fields)
  * add_supervision_sessions         (#52 — Supervision session log)

All five descend from `add_regulatory_acks`, but no-one merged them back
together. That leaves four outstanding heads:
    add_cpd_fields_and_targets, add_sra_return_responses,
    add_pack_deliveries, add_supervision_sessions

This no-op merge unifies them so `alembic upgrade head` resolves to a
single revision. Pattern matches `merge_branched_heads.py` and the
multi-parent down_revision in `add_regulatory_acks`.

Revision ID: merge_feature_heads_2026_05_13
Revises: add_cpd_fields_and_targets, add_sra_return_responses,
         add_pack_deliveries, add_supervision_sessions
Create Date: 2026-05-13 23:00:00.000000
"""
from alembic import op  # noqa: F401  (kept for consistency with other merge migrations)
import sqlalchemy as sa  # noqa: F401


revision = 'merge_feature_heads_2026_05_13'
down_revision = (
    'add_cpd_fields_and_targets',
    'add_sra_return_responses',
    'add_pack_deliveries',
    'add_supervision_sessions',
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op — this is a merge revision only. All feature DDL is in the
    # parent revisions.
    pass


def downgrade() -> None:
    pass
