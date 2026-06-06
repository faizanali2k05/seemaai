import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeImportHistory(l: any) {
  // Prisma model uses recordsProcessed/recordsFailed; expose both spellings
  // since older callers / frontend may have used "rows_*".
  return {
    id: l.id,
    import_type: l.importType,
    filename: l.filename,
    status: l.status,
    imported_by: l.importedBy,
    records_processed: l.recordsProcessed ?? 0,
    records_failed: l.recordsFailed ?? 0,
    rows_processed: l.recordsProcessed ?? 0,
    rows_failed: l.recordsFailed ?? 0,
    created_at: l.createdAt,
  };
}

// GET /admin/import-logs — List import history for firm
router.get('/admin/import-logs', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const logs = await prisma.importHistory.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs.map(serializeImportHistory));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch import logs' });
  }
});

// POST /admin/import/staff — CSV import placeholder for staff
router.post('/admin/import/staff', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const importLog = await prisma.importHistory.create({
      data: {
        firmId,
        importType: 'staff',
        filename: req.body.filename || 'staff_import.csv',
        status: 'pending',
        importedBy: req.user!.userId,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'staff_import_initiated',
      entityType: 'import_history',
      entityId: importLog.id,
    });

    res.status(201).json({
      message: 'Staff import initiated',
      importId: importLog.id,
      status: 'pending',
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to initiate staff import' });
  }
});

// POST /admin/import/alerts — Import placeholder for alerts
router.post('/admin/import/alerts', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const importLog = await prisma.importHistory.create({
      data: {
        firmId,
        importType: 'alerts',
        filename: req.body.filename || 'alerts_import.csv',
        status: 'pending',
        importedBy: req.user!.userId,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'alerts_import_initiated',
      entityType: 'import_history',
      entityId: importLog.id,
    });

    res.status(201).json({
      message: 'Alerts import initiated',
      importId: importLog.id,
      status: 'pending',
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to initiate alerts import' });
  }
});

// POST /admin/import/compliance-items — Import placeholder for compliance items
router.post('/admin/import/compliance-items', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const importLog = await prisma.importHistory.create({
      data: {
        firmId,
        importType: 'compliance_items',
        filename: req.body.filename || 'compliance_items_import.csv',
        status: 'pending',
        importedBy: req.user!.userId,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'compliance_items_import_initiated',
      entityType: 'import_history',
      entityId: importLog.id,
    });

    res.status(201).json({
      message: 'Compliance items import initiated',
      importId: importLog.id,
      status: 'pending',
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to initiate compliance items import' });
  }
});

// POST /admin/clear-demo-data — Delete all records for firmId (dangerous)
router.post('/admin/clear-demo-data', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { confirm } = req.body;

    if (confirm !== 'DELETE_ALL_DATA') {
      res.status(400).json({
        error: true,
        message: 'Confirmation required. Send { "confirm": "DELETE_ALL_DATA" } to proceed.',
      });
      return;
    }

    // Delete all firm-scoped records in order to avoid FK issues
    await prisma.$transaction([
      prisma.chaserLog.deleteMany({ where: { firmId } }),
      prisma.emailQueueItem.deleteMany({ where: { firmId } }),
      prisma.emailTemplate.deleteMany({ where: { firmId } }),
      prisma.staffTraining.deleteMany({ where: { firmId } }),
      prisma.complianceTask.deleteMany({ where: { firmId } }),
      prisma.complianceAlert.deleteMany({ where: { firmId } }),
      prisma.complianceCheck.deleteMany({ where: { firmId } }),
      prisma.complianceScanResult.deleteMany({ where: { firmId } }),
      prisma.supervisionRecord.deleteMany({ where: { firmId } }),
      prisma.remediationPlan.deleteMany({ where: { firmId } }),
      prisma.deadline.deleteMany({ where: { firmId } }),
      prisma.keyDate.deleteMany({ where: { firmId } }),
      prisma.policyDocument.deleteMany({ where: { firmId } }),
      prisma.sraAuditItem.deleteMany({ where: { firmId } }),
      prisma.riskScore.deleteMany({ where: { firmId } }),
      prisma.breachReport.deleteMany({ where: { firmId } }),
      prisma.complaint.deleteMany({ where: { firmId } }),
      prisma.undertaking.deleteMany({ where: { firmId } }),
      prisma.conflictCheck.deleteMany({ where: { firmId } }),
      prisma.conflictParty.deleteMany({ where: { firmId } }),
      prisma.cddRecord.deleteMany({ where: { firmId } }),
      prisma.sarRecord.deleteMany({ where: { firmId } }),
      prisma.clientIntake.deleteMany({ where: { firmId } }),
      prisma.matter.deleteMany({ where: { firmId } }),
      prisma.evidenceDocument.deleteMany({ where: { firmId } }),
      prisma.transaction.deleteMany({ where: { firmId } }),
      prisma.clientAccount.deleteMany({ where: { firmId } }),
      prisma.reconciliation.deleteMany({ where: { firmId } }),
      prisma.importHistory.deleteMany({ where: { firmId } }),
      prisma.staffMember.deleteMany({ where: { firmId } }),
      prisma.regulatoryInterpretation.deleteMany({ where: { firmId } }),
      prisma.auditLog.deleteMany({ where: { firmId } }),
    ]);

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'demo_data_cleared',
      entityType: 'firm',
      entityId: firmId,
    });

    res.json({ success: true, message: 'All demo data cleared for firm' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to clear demo data' });
  }
});

export default router;
