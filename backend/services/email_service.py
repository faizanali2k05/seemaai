"""SendGrid email service for Seema — training chasers, breach alerts, digests."""
import logging
from datetime import datetime, timedelta
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent
from config import get_settings

logger = logging.getLogger("seema.email")
settings = get_settings()


class EmailService:
    """Handles all outbound email via SendGrid."""

    def __init__(self):
        self.client = SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        self.from_email = Email(settings.EMAIL_FROM, settings.EMAIL_FROM_NAME)

    # ── Core send ────────────────────────────────────────────────────

    def send(self, to_email: str, to_name: str, subject: str, body: str) -> dict:
        """Send a single HTML email."""
        message = Mail(
            from_email=self.from_email,
            to_emails=To(to_email, to_name),
            subject=subject,
            html_content=self._wrap_template(body),
        )
        try:
            response = self.client.send(message)
            logger.info(f"Email sent to {to_email} — status {response.status_code}")
            return {"status": "sent", "status_code": response.status_code}
        except Exception as e:
            logger.error(f"SendGrid error sending to {to_email}: {e}")
            raise

    # ── Training chase email ─────────────────────────────────────────

    def send_training_chase(
        self,
        to_email: str,
        to_name: str,
        training_title: str,
        due_date: str,
        days_overdue: int,
        firm_name: str,
    ) -> dict:
        """Send a training completion reminder."""
        urgency = "URGENT: " if days_overdue > 14 else ""
        subject = f"{urgency}Training Overdue — {training_title}"

        body = f"""
        <h2 style="color:#1a1a2e;">Training Reminder</h2>
        <p>Dear {to_name},</p>
        <p>Your training <strong>"{training_title}"</strong> was due on
        <strong>{due_date}</strong> and is now <strong>{days_overdue} day(s) overdue</strong>.</p>
        <p>Please complete this training as soon as possible. Non-completion may be
        escalated to your supervisor and recorded in the firm's compliance records.</p>
        <div style="background:#f8f9fa; padding:16px; border-radius:8px; margin:16px 0;">
            <p style="margin:0;"><strong>Firm:</strong> {firm_name}</p>
            <p style="margin:0;"><strong>Training:</strong> {training_title}</p>
            <p style="margin:0;"><strong>Due date:</strong> {due_date}</p>
            <p style="margin:0;"><strong>Days overdue:</strong> {days_overdue}</p>
        </div>
        <p>If you have already completed this training, please log it in Seema or
        contact your COLP.</p>
        """
        return self.send(to_email, to_name, subject, body)

    # ── File review chase email ──────────────────────────────────────

    def send_file_review_chase(
        self,
        to_email: str,
        to_name: str,
        case_ref: str,
        due_date: str,
        days_overdue: int,
        firm_name: str,
    ) -> dict:
        """Send a file review completion reminder."""
        subject = f"File Review Overdue — {case_ref}"

        body = f"""
        <h2 style="color:#1a1a2e;">File Review Reminder</h2>
        <p>Dear {to_name},</p>
        <p>Your file review for case <strong>{case_ref}</strong> was due on
        <strong>{due_date}</strong> and is now <strong>{days_overdue} day(s) overdue</strong>.</p>
        <p>Please complete the review at your earliest convenience. The SRA expects
        firms to maintain regular file review schedules as part of ongoing competence
        and supervision obligations.</p>
        <div style="background:#f8f9fa; padding:16px; border-radius:8px; margin:16px 0;">
            <p style="margin:0;"><strong>Firm:</strong> {firm_name}</p>
            <p style="margin:0;"><strong>Case:</strong> {case_ref}</p>
            <p style="margin:0;"><strong>Due date:</strong> {due_date}</p>
        </div>
        """
        return self.send(to_email, to_name, subject, body)

    # ── CDD / Client intake chase ────────────────────────────────────

    def send_cdd_chase(
        self,
        to_email: str,
        to_name: str,
        client_name: str,
        intake_date: str,
        days_overdue: int,
        firm_name: str,
    ) -> dict:
        """Send a CDD / client due-diligence completion reminder."""
        urgency = "URGENT: " if days_overdue > 7 else ""
        subject = f"{urgency}CDD Incomplete — {client_name}"

        body = f"""
        <h2 style="color:#1a1a2e;">Client Due Diligence Reminder</h2>
        <p>Dear {to_name},</p>
        <p>The client due diligence for <strong>{client_name}</strong> (intake date
        {intake_date}) remains incomplete after <strong>{days_overdue} day(s)</strong>.</p>
        <p>Under the Money Laundering Regulations 2017, CDD must be completed before
        establishing a business relationship. Please finalise the CDD or escalate
        any concerns to your MLRO immediately.</p>
        <div style="background:#fff3cd; padding:16px; border-radius:8px; margin:16px 0; border-left:4px solid #ffc107;">
            <p style="margin:0;"><strong>AML Risk:</strong> Incomplete CDD is a regulatory breach.</p>
        </div>
        """
        return self.send(to_email, to_name, subject, body)

    # ── Breach notification alert ────────────────────────────────────

    def send_breach_alert(
        self,
        to_email: str,
        to_name: str,
        breach_title: str,
        breach_category: str,
        reported_at: str,
        ico_deadline: str,
        firm_name: str,
    ) -> dict:
        """Send an urgent breach notification to the COLP/DPO."""
        subject = f"URGENT: Data Breach Reported — {breach_title}"

        body = f"""
        <h2 style="color:#dc3545;">Data Breach Alert</h2>
        <p>Dear {to_name},</p>
        <p>A data breach has been reported in Seema that requires your immediate attention.</p>
        <div style="background:#f8d7da; padding:16px; border-radius:8px; margin:16px 0; border-left:4px solid #dc3545;">
            <p style="margin:0;"><strong>Breach:</strong> {breach_title}</p>
            <p style="margin:0;"><strong>Category:</strong> {breach_category}</p>
            <p style="margin:0;"><strong>Reported:</strong> {reported_at}</p>
            <p style="margin:0;"><strong>ICO 72h deadline:</strong> {ico_deadline}</p>
        </div>
        <p>Under UK GDPR Article 33, personal data breaches must be reported to the
        ICO within <strong>72 hours</strong> of becoming aware of the breach, unless
        it is unlikely to result in a risk to individuals' rights and freedoms.</p>
        <p><strong>Actions required:</strong></p>
        <ol>
            <li>Assess the breach severity and likelihood of risk to individuals</li>
            <li>Decide whether ICO notification is required</li>
            <li>If notifiable, submit via the ICO breach reporting tool</li>
            <li>Document all decisions and reasoning in Seema</li>
        </ol>
        """
        return self.send(to_email, to_name, subject, body)

    # ── Supervision reminder ─────────────────────────────────────────

    def send_supervision_reminder(
        self,
        to_email: str,
        to_name: str,
        supervisee_name: str,
        meeting_type: str,
        due_date: str,
        firm_name: str,
    ) -> dict:
        """Remind a supervisor that a supervision meeting is due."""
        subject = f"Supervision Due — {supervisee_name}"

        body = f"""
        <h2 style="color:#1a1a2e;">Supervision Meeting Reminder</h2>
        <p>Dear {to_name},</p>
        <p>Your scheduled <strong>{meeting_type}</strong> supervision meeting with
        <strong>{supervisee_name}</strong> is due on <strong>{due_date}</strong>.</p>
        <p>Effective supervision is a core requirement under the SRA Standards and
        Regulations. Please ensure the meeting is completed and notes recorded in Seema.</p>
        """
        return self.send(to_email, to_name, subject, body)

    # ── Weekly digest ────────────────────────────────────────────────

    def send_weekly_digests(self) -> dict:
        """Send weekly compliance summary to all COLPs.

        In production this queries each firm's data to build a personalised digest.
        Returns summary of how many were sent.
        """
        # This runs inside a Celery task — use synchronous DB access
        from sqlalchemy import create_engine, text
        from config import get_settings

        s = get_settings()
        sync_url = s.DATABASE_URL.replace("+asyncpg", "+psycopg2")
        engine = create_engine(sync_url)

        firms_notified = 0

        with engine.connect() as conn:
            # Get all active firms with their COLP user
            rows = conn.execute(text("""
                SELECT f.id, f.name, ua.email, ua.id as user_id
                FROM firms f
                JOIN user_accounts ua ON ua.firm_id = f.id AND ua.role = 'colp' AND ua.is_active = true
                WHERE f.is_active = true
            """)).fetchall()

            for row in rows:
                firm_id, firm_name, colp_email, user_id = row

                # Gather stats for the past week
                stats = self._gather_weekly_stats(conn, firm_id)

                subject = f"Seema Weekly Digest — {firm_name}"
                body = self._build_digest_body(firm_name, stats)

                try:
                    self.send(colp_email, "COLP", subject, body)
                    firms_notified += 1
                except Exception as e:
                    logger.error(f"Failed to send digest to {colp_email}: {e}")

        return {"firms_notified": firms_notified}

    def _gather_weekly_stats(self, conn, firm_id: str) -> dict:
        """Gather compliance stats for the past 7 days."""
        week_ago = (datetime.now() - timedelta(days=7)).isoformat()

        stats = {}

        # Overdue training count
        result = conn.execute(text("""
            SELECT COUNT(*) FROM staff_training
            WHERE firm_id = :fid AND status = 'pending' AND due_date < :today
        """), {"fid": firm_id, "today": datetime.now().strftime("%Y-%m-%d")})
        stats["overdue_training"] = result.scalar() or 0

        # Open breaches
        result = conn.execute(text("""
            SELECT COUNT(*) FROM breach_reports
            WHERE firm_id = :fid AND status NOT IN ('closed', 'resolved')
        """), {"fid": firm_id})
        stats["open_breaches"] = result.scalar() or 0

        # New regulatory updates
        result = conn.execute(text("""
            SELECT COUNT(*) FROM regulatory_updates
            WHERE published_date > :week_ago
        """), {"week_ago": (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")})
        stats["new_regulatory_updates"] = result.scalar() or 0

        # Overdue file reviews
        result = conn.execute(text("""
            SELECT COUNT(*) FROM staff_file_reviews
            WHERE firm_id = :fid AND status = 'pending' AND due_date < :today
        """), {"fid": firm_id, "today": datetime.now().strftime("%Y-%m-%d")})
        stats["overdue_file_reviews"] = result.scalar() or 0

        # Overdue supervision
        result = conn.execute(text("""
            SELECT COUNT(*) FROM supervision_schedule
            WHERE firm_id = :fid AND status = 'active' AND next_due < :today
        """), {"fid": firm_id, "today": datetime.now().strftime("%Y-%m-%d")})
        stats["overdue_supervision"] = result.scalar() or 0

        # Pending intakes (CDD incomplete)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM client_intakes
            WHERE firm_id = :fid AND status IN ('pending', 'in_progress')
        """), {"fid": firm_id})
        stats["pending_intakes"] = result.scalar() or 0

        return stats

    def _build_digest_body(self, firm_name: str, stats: dict) -> str:
        """Build the weekly digest HTML body."""
        # Determine overall health
        critical = stats["open_breaches"] + stats["overdue_training"]
        if critical > 5:
            health_color, health_text = "#dc3545", "Needs Attention"
        elif critical > 0:
            health_color, health_text = "#ffc107", "Fair"
        else:
            health_color, health_text = "#28a745", "Good"

        return f"""
        <h2 style="color:#1a1a2e;">Weekly Compliance Digest</h2>
        <p>Here's your compliance summary for <strong>{firm_name}</strong> this week.</p>

        <div style="background:{health_color}; color:white; padding:16px; border-radius:8px; text-align:center; margin:16px 0;">
            <h3 style="margin:0; color:white;">Compliance Health: {health_text}</h3>
        </div>

        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
            <tr style="background:#f8f9fa;">
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>Overdue Training</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="color:{'#dc3545' if stats['overdue_training'] > 0 else '#28a745'}; font-size:18px; font-weight:bold;">
                        {stats['overdue_training']}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>Open Breaches</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="color:{'#dc3545' if stats['open_breaches'] > 0 else '#28a745'}; font-size:18px; font-weight:bold;">
                        {stats['open_breaches']}
                    </span>
                </td>
            </tr>
            <tr style="background:#f8f9fa;">
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>Overdue File Reviews</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="font-size:18px; font-weight:bold;">{stats['overdue_file_reviews']}</span>
                </td>
            </tr>
            <tr>
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>Overdue Supervision</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="font-size:18px; font-weight:bold;">{stats['overdue_supervision']}</span>
                </td>
            </tr>
            <tr style="background:#f8f9fa;">
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>Pending Client Intakes</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="font-size:18px; font-weight:bold;">{stats['pending_intakes']}</span>
                </td>
            </tr>
            <tr>
                <td style="padding:12px; border:1px solid #dee2e6;"><strong>New Regulatory Updates</strong></td>
                <td style="padding:12px; border:1px solid #dee2e6; text-align:center;">
                    <span style="font-size:18px; font-weight:bold;">{stats['new_regulatory_updates']}</span>
                </td>
            </tr>
        </table>

        <p>Log in to <a href="https://seemaai.co.uk">Seema</a> for full details and to action any items.</p>
        <p style="color:#6c757d; font-size:12px;">This is an automated digest from Seema Compliance Platform.
        To adjust frequency, visit Settings → Email in your Seema dashboard.</p>
        """

    # ── Deadline reminders ───────────────────────────────────────────

    def send_deadline_reminders(self) -> dict:
        """Send reminders for deadlines due in the next 7 days."""
        from sqlalchemy import create_engine, text

        s = get_settings()
        sync_url = s.DATABASE_URL.replace("+asyncpg", "+psycopg2")
        engine = create_engine(sync_url)

        reminders_sent = 0
        today = datetime.now().strftime("%Y-%m-%d")
        week_ahead = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")

        with engine.connect() as conn:
            # Law deadlines approaching
            rows = conn.execute(text("""
                SELECT ld.description, ld.due_date, ld.priority,
                       f.name as firm_name, ua.email
                FROM law_deadlines ld
                JOIN firms f ON f.id = ld.firm_id
                JOIN user_accounts ua ON ua.firm_id = ld.firm_id AND ua.role = 'colp' AND ua.is_active = true
                WHERE ld.due_date BETWEEN :today AND :week_ahead
                  AND ld.status != 'completed'
            """), {"today": today, "week_ahead": week_ahead}).fetchall()

            for row in rows:
                desc, due_date, priority, firm_name, email = row
                urgency = "URGENT: " if priority == "high" else ""
                subject = f"{urgency}Deadline Approaching — {desc[:50]}"
                body = f"""
                <h2 style="color:#1a1a2e;">Deadline Reminder</h2>
                <p>The following deadline is approaching:</p>
                <div style="background:#f8f9fa; padding:16px; border-radius:8px; margin:16px 0;">
                    <p style="margin:0;"><strong>Deadline:</strong> {desc}</p>
                    <p style="margin:0;"><strong>Due date:</strong> {due_date}</p>
                    <p style="margin:0;"><strong>Priority:</strong> {priority}</p>
                    <p style="margin:0;"><strong>Firm:</strong> {firm_name}</p>
                </div>
                """
                try:
                    self.send(email, "COLP", subject, body)
                    reminders_sent += 1
                except Exception as e:
                    logger.error(f"Failed to send deadline reminder: {e}")

        return {"reminders_sent": reminders_sent}

    # ── HTML template wrapper ────────────────────────────────────────

    def _wrap_template(self, body_html: str) -> str:
        """Wrap email body in branded Seema template."""
        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family:Arial, Helvetica, sans-serif; background:#f5f5f5;">
  <div style="max-width:600px; margin:0 auto; background:white;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding:24px; text-align:center;">
      <h1 style="color:white; margin:0; font-size:24px; letter-spacing:1px;">SEEMA</h1>
      <p style="color:#a0aec0; margin:4px 0 0; font-size:12px;">Compliance Intelligence Platform</p>
    </div>

    <!-- Body -->
    <div style="padding:24px 32px;">
      {body_html}
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fa; padding:16px 32px; text-align:center; border-top:1px solid #dee2e6;">
      <p style="color:#6c757d; font-size:11px; margin:0;">
        Seema Compliance Platform — Keeping UK law firms SRA-ready.<br>
        <a href="https://seemaai.co.uk" style="color:#4a6cf7;">seemaai.co.uk</a> |
        <a href="mailto:support@seemaai.co.uk" style="color:#4a6cf7;">support@seemaai.co.uk</a>
      </p>
      <p style="color:#adb5bd; font-size:10px; margin:8px 0 0;">
        You are receiving this email because your firm uses Seema for compliance management.
        To adjust email preferences, visit Settings in your Seema dashboard.
      </p>
    </div>
  </div>
</body>
</html>"""
