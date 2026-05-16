"""Reporting tasks — monthly reports, evidence and policy review reminders."""
import logging
from datetime import datetime, timedelta
from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)


@app.task(name="tasks.reporting_tasks.generate_monthly_compliance_report")
def generate_monthly_compliance_report():
    """Generate monthly compliance report for all active firms."""
    from models.firm import Firm
    from models.compliance import ComplianceAlert, ComplianceScanResult

    logger.info("Generating monthly compliance reports")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()
        reports_generated = 0
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)

        for firm in firms:
            alerts_count = session.query(ComplianceAlert).filter(
                ComplianceAlert.firm_id == firm.id,
                ComplianceAlert.created_at >= month_start,
            ).count()
            scans_count = session.query(ComplianceScanResult).filter(
                ComplianceScanResult.firm_id == firm.id,
                ComplianceScanResult.created_at >= month_start,
            ).count()
            # TODO: generate PDF report and store in evidence documents
            logger.info(f"Report for {firm.name}: {alerts_count} alerts, {scans_count} scans")
            reports_generated += 1

        session.commit()
        logger.info(f"Monthly reports generated: {reports_generated}")
        return {"reports_generated": reports_generated}
    except Exception as e:
        session.rollback()
        logger.error(f"Monthly report generation failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.reporting_tasks.check_evidence_review_dates")
def check_evidence_review_dates():
    """Check for evidence documents due for review."""
    from models.evidence import EvidenceDocument
    from models.compliance import ComplianceTask

    logger.info("Checking evidence review dates")
    session = get_sync_session()
    try:
        upcoming = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")
        documents = session.query(EvidenceDocument).filter(
            EvidenceDocument.next_review_date <= upcoming,
            EvidenceDocument.status == "active",
        ).all()
        tasks_created = 0
        for doc in documents:
            task = ComplianceTask(
                firm_id=doc.firm_id,
                task_type="evidence_review",
                title=f"Evidence review due: {doc.title}",
                description=f"Document '{doc.title}' is due for review by {doc.next_review_date}",
                priority="medium",
                due_date=doc.next_review_date,
            )
            session.add(task)
            tasks_created += 1
        session.commit()
        logger.info(f"Evidence review check: {tasks_created} tasks created")
        return {"documents_due": len(documents), "tasks_created": tasks_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Evidence review check failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.reporting_tasks.check_policy_review_dates")
def check_policy_review_dates():
    """Check for policy documents due for review."""
    from models.policies import PolicyDocument
    from models.compliance import ComplianceTask

    logger.info("Checking policy review dates")
    session = get_sync_session()
    try:
        upcoming = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")
        policies = session.query(PolicyDocument).filter(
            PolicyDocument.next_review_date <= upcoming,
            PolicyDocument.status == "active",
        ).all()
        tasks_created = 0
        for policy in policies:
            task = ComplianceTask(
                firm_id=policy.firm_id,
                task_type="policy_review",
                title=f"Policy review due: {policy.title}",
                description=f"Policy '{policy.title}' is due for review by {policy.next_review_date}",
                priority="high",
                due_date=policy.next_review_date,
            )
            session.add(task)
            tasks_created += 1
        session.commit()
        logger.info(f"Policy review check: {tasks_created} tasks created")
        return {"policies_due": len(policies), "tasks_created": tasks_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Policy review check failed: {e}")
        raise
    finally:
        session.close()
