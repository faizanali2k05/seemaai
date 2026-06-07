"""Auto-chase engine — checks all firms for overdue items and triggers emails."""
import logging
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from config import get_settings

logger = logging.getLogger("seema.chase")


class ChaseEngine:
    """Scans all active firms for overdue compliance items and sends chase emails.

    Runs as a Celery task (daily at 9am). For each firm, checks:
    1. Overdue training
    2. Overdue file reviews
    3. Overdue CDD / client intakes
    4. Overdue supervision meetings

    Respects each firm's EmailSettings (auto_chase_training, auto_chase_reviews,
    auto_chase_cdd, chase_frequency_days, escalation_after_days).
    """

    def __init__(self):
        s = get_settings()
        # Celery tasks run synchronously — use sync engine
        sync_url = s.DATABASE_URL.replace("+asyncpg", "+psycopg2")
        self.engine = create_engine(sync_url)

    def run_all_firms(self) -> dict:
        """Run chase logic for every active firm. Returns summary stats."""
        from services.email_service import EmailService

        email_svc = EmailService()
        today = datetime.now().strftime("%Y-%m-%d")

        total_chasers = 0
        total_escalations = 0
        firms_processed = 0

        with self.engine.connect() as conn:
            firms = conn.execute(text("""
                SELECT f.id, f.name
                FROM firms f
                WHERE f.is_active = true
            """)).fetchall()

            for firm_id, firm_name in firms:
                # Load firm's email settings (or use defaults)
                settings = self._get_email_settings(conn, firm_id)

                if not settings["enabled"]:
                    continue

                firms_processed += 1

                # 1. Chase overdue training
                if settings["auto_chase_training"]:
                    count = self._chase_overdue_training(
                        conn, email_svc, firm_id, firm_name, today, settings
                    )
                    total_chasers += count

                # 2. Chase overdue file reviews
                if settings["auto_chase_reviews"]:
                    count = self._chase_overdue_reviews(
                        conn, email_svc, firm_id, firm_name, today, settings
                    )
                    total_chasers += count

                # 3. Chase incomplete CDD
                if settings["auto_chase_cdd"]:
                    count = self._chase_overdue_cdd(
                        conn, email_svc, firm_id, firm_name, today, settings
                    )
                    total_chasers += count

                # 4. Chase overdue supervision
                count = self._chase_overdue_supervision(
                    conn, email_svc, firm_id, firm_name, today, settings
                )
                total_chasers += count

            # Commit chaser log entries
            conn.commit()

        return {
            "firms_processed": firms_processed,
            "emails_sent": total_chasers,
            "escalations": total_escalations,
            "run_at": datetime.now().isoformat(),
        }

    # ── Email settings ───────────────────────────────────────────────

    def _get_email_settings(self, conn, firm_id: str) -> dict:
        """Get firm's email settings, falling back to defaults."""
        row = conn.execute(text("""
            SELECT enabled, auto_chase_training, auto_chase_reviews,
                   auto_chase_cdd, chase_frequency_days, escalation_after_days
            FROM email_settings
            WHERE firm_id = :fid
        """), {"fid": firm_id}).fetchone()

        if row:
            return {
                "enabled": row[0],
                "auto_chase_training": row[1],
                "auto_chase_reviews": row[2],
                "auto_chase_cdd": row[3],
                "chase_frequency_days": row[4] or 7,
                "escalation_after_days": row[5] or 21,
            }

        # Defaults
        return {
            "enabled": True,
            "auto_chase_training": True,
            "auto_chase_reviews": True,
            "auto_chase_cdd": True,
            "chase_frequency_days": 7,
            "escalation_after_days": 21,
        }

    # ── Chase: overdue training ──────────────────────────────────────

    def _chase_overdue_training(
        self, conn, email_svc, firm_id: str, firm_name: str, today: str, settings: dict
    ) -> int:
        """Find overdue training and send chases. Returns count sent."""
        chase_cutoff = (
            datetime.now() - timedelta(days=settings["chase_frequency_days"])
        ).isoformat()

        rows = conn.execute(text("""
            SELECT st.id, st.course_name, st.due_date,
                   sm.name, sm.email, sm.id as staff_id
            FROM staff_training st
            JOIN staff_members sm ON sm.id = st.staff_id AND sm.firm_id = st.firm_id
            WHERE st.firm_id = :fid
              AND st.status = 'pending'
              AND st.due_date < :today
              AND sm.email IS NOT NULL
              AND sm.status = 'active'
        """), {"fid": firm_id, "today": today}).fetchall()

        sent = 0
        for row in rows:
            training_id, title, due_date, staff_name, staff_email, staff_id = row

            # Check if we already chased recently
            if self._recently_chased(conn, firm_id, "training", training_id, chase_cutoff):
                continue

            days_overdue = (datetime.now() - datetime.strptime(due_date, "%Y-%m-%d")).days

            try:
                email_svc.send_training_chase(
                    to_email=staff_email,
                    to_name=staff_name,
                    training_title=title,
                    due_date=due_date,
                    days_overdue=days_overdue,
                    firm_name=firm_name,
                )

                # Check if escalation is needed
                escalated = days_overdue > settings["escalation_after_days"]

                self._log_chase(
                    conn, firm_id, "training", staff_id, staff_email, staff_name,
                    f"Training Overdue — {title}", days_overdue, escalated
                )
                sent += 1

                # If escalated, also email the COLP
                if escalated:
                    self._escalate_to_colp(
                        conn, email_svc, firm_id, firm_name,
                        f"Training escalation: {staff_name} — {title} ({days_overdue} days overdue)"
                    )

            except Exception as e:
                logger.error(f"Chase failed for training {training_id}: {e}")

        return sent

    # ── Chase: overdue file reviews ──────────────────────────────────

    def _chase_overdue_reviews(
        self, conn, email_svc, firm_id: str, firm_name: str, today: str, settings: dict
    ) -> int:
        """Find overdue file reviews and send chases."""
        chase_cutoff = (
            datetime.now() - timedelta(days=settings["chase_frequency_days"])
        ).isoformat()

        rows = conn.execute(text("""
            SELECT fr.id, fr.case_id, fr.due_date,
                   sm.name, sm.email, sm.id as staff_id
            FROM staff_file_reviews fr
            JOIN staff_members sm ON sm.id = fr.reviewer_id AND sm.firm_id = fr.firm_id
            WHERE fr.firm_id = :fid
              AND fr.status = 'pending'
              AND fr.due_date < :today
              AND sm.email IS NOT NULL
        """), {"fid": firm_id, "today": today}).fetchall()

        sent = 0
        for row in rows:
            review_id, case_id, due_date, reviewer_name, reviewer_email, staff_id = row

            if self._recently_chased(conn, firm_id, "file_review", review_id, chase_cutoff):
                continue

            days_overdue = (datetime.now() - datetime.strptime(due_date, "%Y-%m-%d")).days

            try:
                email_svc.send_file_review_chase(
                    to_email=reviewer_email,
                    to_name=reviewer_name,
                    case_ref=case_id or "Unknown",
                    due_date=due_date,
                    days_overdue=days_overdue,
                    firm_name=firm_name,
                )
                self._log_chase(
                    conn, firm_id, "file_review", staff_id, reviewer_email, reviewer_name,
                    f"File Review Overdue — {case_id}", days_overdue, False
                )
                sent += 1
            except Exception as e:
                logger.error(f"Chase failed for review {review_id}: {e}")

        return sent

    # ── Chase: incomplete CDD ────────────────────────────────────────

    def _chase_overdue_cdd(
        self, conn, email_svc, firm_id: str, firm_name: str, today: str, settings: dict
    ) -> int:
        """Find intakes with incomplete CDD and send chases."""
        chase_cutoff = (
            datetime.now() - timedelta(days=settings["chase_frequency_days"])
        ).isoformat()

        rows = conn.execute(text("""
            SELECT ci.id, ci.client_name, ci.created_at, ci.assigned_to,
                   sm.name, sm.email
            FROM client_intakes ci
            LEFT JOIN staff_members sm ON sm.id = ci.assigned_to AND sm.firm_id = ci.firm_id
            WHERE ci.firm_id = :fid
              AND ci.status IN ('pending', 'in_progress')
              AND ci.cdd_status IN ('pending', 'in_progress')
              AND sm.email IS NOT NULL
        """), {"fid": firm_id}).fetchall()

        sent = 0
        for row in rows:
            intake_id, client_name, created_at, assessed_by, staff_name, staff_email = row

            if self._recently_chased(conn, firm_id, "cdd", intake_id, chase_cutoff):
                continue

            if created_at:
                try:
                    intake_date = created_at[:10]
                    days_overdue = (
                        datetime.now() - datetime.strptime(intake_date, "%Y-%m-%d")
                    ).days
                except (ValueError, TypeError):
                    days_overdue = 0
            else:
                days_overdue = 0
                intake_date = "Unknown"

            try:
                email_svc.send_cdd_chase(
                    to_email=staff_email,
                    to_name=staff_name,
                    client_name=client_name or "Unknown Client",
                    intake_date=intake_date,
                    days_overdue=days_overdue,
                    firm_name=firm_name,
                )
                self._log_chase(
                    conn, firm_id, "cdd", assessed_by, staff_email, staff_name,
                    f"CDD Incomplete — {client_name}", days_overdue, False
                )
                sent += 1
            except Exception as e:
                logger.error(f"Chase failed for CDD {intake_id}: {e}")

        return sent

    # ── Chase: overdue supervision ───────────────────────────────────

    def _chase_overdue_supervision(
        self, conn, email_svc, firm_id: str, firm_name: str, today: str, settings: dict
    ) -> int:
        """Find overdue supervision meetings and remind supervisors."""
        rows = conn.execute(text("""
            SELECT ss.id, ss.next_due, ss.meeting_type,
                   supervisor.name as supervisor_name, supervisor.email as supervisor_email,
                   supervisee.name as supervisee_name
            FROM supervision_schedule ss
            JOIN staff_members supervisor ON supervisor.id = ss.supervisor_id AND supervisor.firm_id = ss.firm_id
            JOIN staff_members supervisee ON supervisee.id = ss.staff_id AND supervisee.firm_id = ss.firm_id
            WHERE ss.firm_id = :fid
              AND ss.status = 'active'
              AND ss.next_due < :today
              AND supervisor.email IS NOT NULL
        """), {"fid": firm_id, "today": today}).fetchall()

        sent = 0
        chase_cutoff = (
            datetime.now() - timedelta(days=settings["chase_frequency_days"])
        ).isoformat()

        for row in rows:
            sched_id, next_due, meeting_type, sup_name, sup_email, supervisee_name = row

            if self._recently_chased(conn, firm_id, "supervision", sched_id, chase_cutoff):
                continue

            try:
                email_svc.send_supervision_reminder(
                    to_email=sup_email,
                    to_name=sup_name,
                    supervisee_name=supervisee_name,
                    meeting_type=meeting_type or "Supervision",
                    due_date=next_due,
                    firm_name=firm_name,
                )
                self._log_chase(
                    conn, firm_id, "supervision", None, sup_email, sup_name,
                    f"Supervision Due — {supervisee_name}", 0, False
                )
                sent += 1
            except Exception as e:
                logger.error(f"Chase failed for supervision {sched_id}: {e}")

        return sent

    # ── Helpers ──────────────────────────────────────────────────────

    def _recently_chased(
        self, conn, firm_id: str, chaser_type: str, entity_id: str, cutoff: str
    ) -> bool:
        """Check if we've already sent a chase for this item recently."""
        result = conn.execute(text("""
            SELECT COUNT(*) FROM chaser_logs
            WHERE firm_id = :fid
              AND chaser_type = :ctype
              AND subject LIKE :entity_ref
              AND sent_at > :cutoff
        """), {
            "fid": firm_id,
            "ctype": chaser_type,
            "entity_ref": f"%{entity_id}%",
            "cutoff": cutoff,
        })
        return (result.scalar() or 0) > 0

    def _log_chase(
        self, conn, firm_id: str, chaser_type: str,
        staff_id: str, email: str, name: str,
        subject: str, days_overdue: int, escalated: bool,
    ):
        """Record the chase in the canonical `chaser_logs` table."""
        import uuid

        conn.execute(text("""
            INSERT INTO chaser_logs (id, firm_id, chaser_type, recipient,
                                     subject, status, sent_at, attempts)
            VALUES (:id, :fid, :ctype, :recipient, :subject, :status, now(), 1)
        """), {
            "id": str(uuid.uuid4()),
            "fid": firm_id,
            "ctype": chaser_type,
            "recipient": email,
            "subject": subject,
            "status": "escalated" if escalated else "sent",
        })

    def _escalate_to_colp(
        self, conn, email_svc, firm_id: str, firm_name: str, issue: str
    ):
        """Send escalation notice to the firm's COLP."""
        colp = conn.execute(text("""
            SELECT email FROM user_accounts
            WHERE firm_id = :fid AND role = 'colp' AND is_active = true
            LIMIT 1
        """), {"fid": firm_id}).fetchone()

        if colp:
            subject = f"Escalation — {firm_name}"
            body = f"""
            <h2 style="color:#dc3545;">Compliance Escalation</h2>
            <p>The following item has been overdue beyond the escalation threshold
            and requires your attention:</p>
            <div style="background:#fff3cd; padding:16px; border-radius:8px; margin:16px 0;
                        border-left:4px solid #ffc107;">
                <p style="margin:0;">{issue}</p>
            </div>
            <p>Please log in to Seema to review and take action.</p>
            """
            try:
                email_svc.send(colp[0], "COLP", subject, body)
            except Exception as e:
                logger.error(f"Escalation email failed for {firm_id}: {e}")
