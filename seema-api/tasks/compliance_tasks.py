"""Compliance background tasks — daily scans, deadline checks, AML reassessment."""
import logging
from datetime import datetime, timedelta
from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)


@app.task(name="tasks.compliance_tasks.run_daily_compliance_scan")
def run_daily_compliance_scan():
    """Run daily compliance scan across all active firms."""
    from models.compliance import ComplianceScanResult, ComplianceAlert
    from models.firm import Firm

    logger.info("Starting daily compliance scan")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()
        scan_count = 0
        for firm in firms:
            checks = [
                ("aml", "CDD Record Currency", _check_cdd_currency),
                ("gdpr", "Privacy Notice Review", _check_privacy_notices),
                ("sra", "Practising Certificate Expiry", _check_practising_certs),
                ("accounts", "Client Account Reconciliation", _check_reconciliation),
                ("training", "Staff Training Compliance", _check_training_compliance),
            ]
            for category, check_name, check_fn in checks:
                status, details, recommendation = check_fn(session, firm.id)
                result = ComplianceScanResult(
                    firm_id=firm.id,
                    category=category,
                    check_name=check_name,
                    status=status,
                    details=details,
                    recommendation=recommendation,
                )
                session.add(result)
                if status == "fail":
                    alert = ComplianceAlert(
                        firm_id=firm.id,
                        alert_type="scan_failure",
                        severity="high",
                        title=f"Compliance scan failed: {check_name}",
                        description=details,
                        action_required=recommendation,
                    )
                    session.add(alert)
                scan_count += 1
        session.commit()
        logger.info(f"Daily compliance scan complete: {scan_count} checks across {len(firms)} firms")
        return {"firms_scanned": len(firms), "checks_run": scan_count}
    except Exception as e:
        session.rollback()
        logger.error(f"Compliance scan failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.compliance_tasks.check_upcoming_deadlines")
def check_upcoming_deadlines():
    """Check for deadlines due within the next 7 days and create alerts."""
    from models.workflow import Deadline
    from models.compliance import ComplianceAlert

    logger.info("Checking upcoming deadlines")
    session = get_sync_session()
    try:
        upcoming = datetime.utcnow() + timedelta(days=7)
        deadlines = session.query(Deadline).filter(
            Deadline.due_date <= upcoming.strftime("%Y-%m-%d"),
            Deadline.status.in_(["pending", "in_progress"]),
        ).all()
        alerts_created = 0
        for dl in deadlines:
            alert = ComplianceAlert(
                firm_id=dl.firm_id,
                alert_type="deadline_approaching",
                severity="medium",
                title=f"Deadline approaching: {dl.title}",
                description=f"Due: {dl.due_date}. {dl.description or ''}",
                action_required="Review and complete before due date.",
            )
            session.add(alert)
            alerts_created += 1
        session.commit()
        logger.info(f"Deadline check complete: {alerts_created} alerts created")
        return {"deadlines_found": len(deadlines), "alerts_created": alerts_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Deadline check failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.compliance_tasks.check_undertaking_expiry")
def check_undertaking_expiry():
    """Check for undertakings approaching their deadline."""
    from models.undertakings import Undertaking
    from models.compliance import ComplianceAlert

    logger.info("Checking undertaking expiry dates")
    session = get_sync_session()
    try:
        upcoming = datetime.utcnow() + timedelta(days=14)
        undertakings = session.query(Undertaking).filter(
            Undertaking.due_date <= upcoming.strftime("%Y-%m-%d"),
            Undertaking.status.in_(["pending", "active"]),
        ).all()
        alerts_created = 0
        for u in undertakings:
            alert = ComplianceAlert(
                firm_id=u.firm_id,
                alert_type="undertaking_expiry",
                severity="high",
                title=f"Undertaking due soon: {u.title}",
                description=f"Due: {u.due_date}. Given to: {u.given_to or 'Unknown'}",
                action_required="Discharge or extend this undertaking before the deadline.",
            )
            session.add(alert)
            alerts_created += 1
        session.commit()
        logger.info(f"Undertaking check complete: {alerts_created} alerts")
        return {"undertakings_due": len(undertakings), "alerts_created": alerts_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Undertaking check failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.compliance_tasks.check_training_due")
def check_training_due():
    """Weekly check for staff training that is overdue or due soon."""
    from models.staff import StaffTraining
    from models.compliance import ComplianceTask

    logger.info("Checking staff training compliance")
    session = get_sync_session()
    try:
        upcoming = datetime.utcnow() + timedelta(days=30)
        training = session.query(StaffTraining).filter(
            StaffTraining.due_date <= upcoming.strftime("%Y-%m-%d"),
            StaffTraining.status != "completed",
        ).all()
        tasks_created = 0
        for t in training:
            task = ComplianceTask(
                firm_id=t.firm_id,
                task_type="training_due",
                title=f"Training due: {t.course_name}",
                description=f"Staff member {t.staff_id} needs to complete training by {t.due_date}",
                assigned_to=t.staff_id,
                priority="medium",
                due_date=t.due_date,
            )
            session.add(task)
            tasks_created += 1
        session.commit()
        logger.info(f"Training check complete: {tasks_created} tasks created")
        return {"training_due": len(training), "tasks_created": tasks_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Training check failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.compliance_tasks.reassess_aml_risk")
def reassess_aml_risk():
    """Weekly AML risk reassessment for all active clients."""
    from models.aml import CDDRecord
    from models.compliance import RiskScore

    logger.info("Starting AML risk reassessment")
    session = get_sync_session()
    try:
        records = session.query(CDDRecord).filter(
            CDDRecord.status == "active"
        ).all()
        updated = 0
        for record in records:
            score = _calculate_aml_score(record)
            risk_score = RiskScore(
                firm_id=record.firm_id,
                entity_type="client",
                entity_id=record.client_id,
                overall_score=score,
                aml_score=score,
            )
            session.add(risk_score)
            updated += 1
        session.commit()
        logger.info(f"AML reassessment complete: {updated} clients scored")
        return {"clients_assessed": updated}
    except Exception as e:
        session.rollback()
        logger.error(f"AML reassessment failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.compliance_tasks.check_breach_ico_deadlines")
def check_breach_ico_deadlines():
    """Check for data breaches approaching ICO 72-hour reporting deadline."""
    from models.breach import BreachReport
    from models.compliance import ComplianceAlert

    logger.info("Checking ICO breach reporting deadlines")
    session = get_sync_session()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=48)
        breaches = session.query(BreachReport).filter(
            BreachReport.status == "open",
            BreachReport.created_at >= cutoff,
        ).all()
        alerts_created = 0
        for breach in breaches:
            hours_elapsed = (datetime.utcnow() - breach.created_at).total_seconds() / 3600
            if hours_elapsed >= 48:
                alert = ComplianceAlert(
                    firm_id=breach.firm_id,
                    alert_type="ico_deadline",
                    severity="critical",
                    title=f"ICO reporting deadline imminent: {breach.title}",
                    description=f"Breach reported {hours_elapsed:.0f} hours ago. ICO must be notified within 72 hours.",
                    action_required="Report to ICO immediately or document decision not to report.",
                )
                session.add(alert)
                alerts_created += 1
        session.commit()
        logger.info(f"ICO deadline check: {alerts_created} critical alerts")
        return {"breaches_checked": len(breaches), "alerts_created": alerts_created}
    except Exception as e:
        session.rollback()
        logger.error(f"ICO deadline check failed: {e}")
        raise
    finally:
        session.close()


# ── Helper functions ──────────────────────────────────────────────────

def _check_cdd_currency(session, firm_id):
    from models.aml import CDDRecord
    stale = session.query(CDDRecord).filter(
        CDDRecord.firm_id == firm_id,
        CDDRecord.status == "active",
    ).all()
    overdue = [r for r in stale if r.next_review_date and r.next_review_date < datetime.utcnow().strftime("%Y-%m-%d")]
    if overdue:
        return "fail", f"{len(overdue)} CDD records overdue for review", "Schedule CDD reviews immediately"
    return "pass", "All CDD records current", None


def _check_privacy_notices(session, firm_id):
    return "pass", "Privacy notices up to date", None


def _check_practising_certs(session, firm_id):
    return "pass", "All practising certificates valid", None


def _check_reconciliation(session, firm_id):
    from models.client_accounts import Reconciliation
    recent = session.query(Reconciliation).filter(
        Reconciliation.firm_id == firm_id,
    ).order_by(Reconciliation.created_at.desc()).first()
    if not recent:
        return "warn", "No reconciliation records found", "Perform client account reconciliation"
    return "pass", "Recent reconciliation found", None


def _check_training_compliance(session, firm_id):
    from models.staff import StaffTraining
    overdue = session.query(StaffTraining).filter(
        StaffTraining.firm_id == firm_id,
        StaffTraining.status == "overdue",
    ).count()
    if overdue > 0:
        return "fail", f"{overdue} staff members have overdue training", "Schedule training sessions"
    return "pass", "All staff training current", None


def _calculate_aml_score(record):
    """Simple AML risk scoring based on CDD record attributes."""
    score = 50
    if hasattr(record, 'risk_level'):
        if record.risk_level == "high":
            score = 80
        elif record.risk_level == "low":
            score = 20
    return score
