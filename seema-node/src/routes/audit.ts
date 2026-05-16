import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeAuditLog(l: any) {
  return {
    id: l.id,
    user_id: l.userId,
    user_name: l.userName ?? null,
    action: l.action,
    entity_type: l.entityType,
    entity_id: l.entityId,
    ip_address: l.ipAddress,
    details: l.details ?? null,
    metadata: l.metadata,
    created_at: l.createdAt,
  };
}

function serializeScanResult(r: any) {
  return {
    id: r.id,
    scan_date: r.scanDate,
    category: r.category,
    check_name: r.checkName,
    status: r.status,
    details: r.details,
    recommendation: r.recommendation,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

// GET /compliance/audit-trail — List audit logs for firm
router.get('/compliance/audit-trail', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const logs = await prisma.auditLog.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs.map(serializeAuditLog));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch audit trail' });
  }
});

// GET /compliance/audit-trail/summary — Count by action type, grouped by entityType
router.get('/compliance/audit-trail/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const summary = await prisma.auditLog.groupBy({
      by: ['entityType'],
      where: { firmId },
      _count: { action: true },
    });

    const formatted = summary.map((item) => ({
      entity_type: item.entityType,
      count: item._count.action,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch audit summary' });
  }
});

// GET /compliance/audit-reports — List compliance scan results (report proxy)
router.get('/compliance/audit-reports', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const reports = await prisma.complianceScanResult.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports.map(serializeScanResult));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch audit reports' });
  }
});

// POST /compliance/generate-audit-report — Create scan result as report placeholder
router.post('/compliance/generate-audit-report', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const report = await prisma.complianceScanResult.create({
      data: {
        firmId,
        scanDate: new Date(),
        category: req.body.category || 'audit_report',
        checkName: req.body.title || 'Generated Audit Report',
        status: 'completed',
        details: req.body.details || 'Audit report generated on demand',
        recommendation: req.body.recommendation || null,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'audit_report_generated',
      entityType: 'compliance_scan_result',
      entityId: report.id,
    });

    res.status(201).json(serializeScanResult(report));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to generate audit report' });
  }
});

export default router;
