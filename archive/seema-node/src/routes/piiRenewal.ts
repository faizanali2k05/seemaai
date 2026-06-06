import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import logger from '../utils/logger.js';

const router = Router();

// ---------------------------------------------------------------------------
// PII Renewal Evidence Pack
//
// Auto-assembles the long list of evidence a UK firm's professional
// indemnity insurer typically wants at renewal time. PII renewal is the
// single most painful annual exercise for UK law firms — insurers demand
// claims history, risk management posture, AML compliance, breaches,
// supervision records, training, etc. — and most firms scramble to assemble
// it from spreadsheets and emails. This endpoint produces a clean,
// deterministic JSON pack from the firm's compliance data.
//
// Returns an object shaped like (PIIPack):
//   {
//     generated_at, firm, staff, training, breaches, complaints, aml,
//     supervision, policies, risk_management, conflict_checks
//   }
// ---------------------------------------------------------------------------

function safeJsonParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// Extract first integer from a free-text PQE string like "12 PQE", "5 years".
function parsePqe(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  return Math.round((total / nums.length) * 10) / 10;
}

function daysBetween(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // pct, 1dp
}

router.post(
  '/compliance/pii-renewal-pack/generate',
  authenticate,
  requireRole('partner'),
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const [
        firm,
        activeStaffCount,
        traineeCount,
        staffList,
        trainingLast12m,
        trainingCompletedLast12m,
        trainingOverdue,
        amlTrainingTotal,
        amlTrainingCompleted,
        gdprTrainingTotal,
        gdprTrainingCompleted,
        breachesLast12m,
        openBreachesCount,
        complaintsLast12m,
        openComplaintsCount,
        cddTotal,
        cddCompleted,
        highRiskClients,
        pepFlagged,
        sarsLast12m,
        sarsPendingMlro,
        supervisionActive,
        supervisionOverdue,
        policies,
        policiesOverdue,
        latestRiskScore,
        latestScan,
        scanCategoryBreakdown,
        openAlerts,
        conflictsLast12m,
        conflictsFlagged,
        conflictsResolved,
      ] = await Promise.all([
        prisma.firm.findUnique({ where: { id: firmId } }),
        prisma.staffMember.count({ where: { firmId, status: 'active' } }),
        prisma.staffMember.count({
          where: { firmId, status: 'active', role: { contains: 'Trainee', mode: 'insensitive' } },
        }),
        prisma.staffMember.findMany({
          where: { firmId, status: 'active' },
          select: { id: true, name: true, role: true, pqe: true, sraId: true },
          orderBy: { name: 'asc' },
        }),
        prisma.staffTraining.count({
          where: { firmId, createdAt: { gte: twelveMonthsAgo } },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            status: 'completed',
            completedAt: { gte: twelveMonthsAgo },
          },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            status: { not: 'completed' },
            dueDate: { lt: now },
          },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            OR: [
              { title: { contains: 'AML', mode: 'insensitive' } },
              { courseName: { contains: 'AML', mode: 'insensitive' } },
            ],
          },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            status: 'completed',
            OR: [
              { title: { contains: 'AML', mode: 'insensitive' } },
              { courseName: { contains: 'AML', mode: 'insensitive' } },
            ],
          },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            OR: [
              { title: { contains: 'GDPR', mode: 'insensitive' } },
              { courseName: { contains: 'GDPR', mode: 'insensitive' } },
            ],
          },
        }),
        prisma.staffTraining.count({
          where: {
            firmId,
            status: 'completed',
            OR: [
              { title: { contains: 'GDPR', mode: 'insensitive' } },
              { courseName: { contains: 'GDPR', mode: 'insensitive' } },
            ],
          },
        }),
        prisma.breachReport.findMany({
          where: { firmId, reportedDate: { gte: twelveMonthsAgo } },
          orderBy: { reportedDate: 'desc' },
        }),
        prisma.breachReport.count({
          where: {
            firmId,
            OR: [
              { status: 'open' },
              { status: 'in_progress' },
              { status: 'investigating' },
            ],
          },
        }),
        prisma.complaint.findMany({
          where: { firmId, openedDate: { gte: twelveMonthsAgo } },
        }),
        prisma.complaint.count({
          where: {
            firmId,
            OR: [
              { status: 'open' },
              { status: 'in_progress' },
              { status: 'investigating' },
            ],
          },
        }),
        prisma.cddRecord.count({ where: { firmId } }),
        prisma.cddRecord.count({
          where: {
            firmId,
            OR: [{ status: 'verified' }, { status: 'completed' }],
          },
        }),
        prisma.cddRecord.count({
          where: {
            firmId,
            OR: [{ riskLevel: 'high' }, { riskLevel: 'very_high' }],
          },
        }),
        prisma.clientIntake.count({
          where: {
            firmId,
            OR: [{ pepScreening: 'flagged' }, { pepScreening: 'positive' }],
          },
        }),
        prisma.sarRecord.count({
          where: { firmId, reportDate: { gte: twelveMonthsAgo } },
        }),
        prisma.sarRecord.count({
          where: {
            firmId,
            OR: [{ status: 'pending' }, { status: 'pending_mlro' }, { status: 'open' }],
          },
        }),
        prisma.supervisionRecord.count({
          where: { firmId, status: 'active' },
        }),
        prisma.supervisionRecord.count({
          where: { firmId, nextDue: { lt: now } },
        }),
        prisma.policyDocument.findMany({
          where: { firmId },
          select: {
            id: true,
            title: true,
            category: true,
            version: true,
            status: true,
            lastReviewed: true,
            nextReview: true,
          },
          orderBy: { title: 'asc' },
        }),
        prisma.policyDocument.count({
          where: { firmId, nextReview: { lt: now } },
        }),
        prisma.riskScore.findFirst({
          where: { firmId, entityType: 'firm' },
          orderBy: { calculatedAt: 'desc' },
        }),
        prisma.complianceScanResult.findFirst({
          where: { firmId },
          orderBy: { scanDate: 'desc' },
        }),
        prisma.complianceScanResult.groupBy({
          by: ['category', 'status'],
          where: { firmId },
          _count: { _all: true },
        }),
        prisma.complianceAlert.groupBy({
          by: ['severity'],
          where: { firmId, status: 'open' },
          _count: { _all: true },
        }),
        prisma.conflictCheck.count({
          where: { firmId, createdAt: { gte: twelveMonthsAgo } },
        }),
        prisma.conflictCheck.count({
          where: {
            firmId,
            createdAt: { gte: twelveMonthsAgo },
            OR: [{ status: 'flagged' }, { status: 'conflict' }, { status: 'potential_conflict' }],
          },
        }),
        prisma.conflictCheck.count({
          where: {
            firmId,
            createdAt: { gte: twelveMonthsAgo },
            OR: [{ status: 'resolved' }, { status: 'cleared' }, { status: 'no_conflict' }],
          },
        }),
      ]);

      // ── Solicitor count: filter the staff list in-memory using our own
      //    case-insensitive role match (Solicitor, Partner, Associate, Consultant).
      const solicitorRolesPattern = /(solicitor|partner|associate|consultant)/i;
      const solicitorCount = staffList.filter((s) => s.role && solicitorRolesPattern.test(s.role)).length;

      // Average PQE across staff with a numeric value
      const pqeValues = staffList
        .map((s) => parsePqe(s.pqe))
        .filter((n): n is number => n !== null);
      const averagePqe = avg(pqeValues);

      // Breaches by severity
      const breachBySeverity: Record<string, number> = {};
      for (const b of breachesLast12m) {
        const key = (b.severity || 'unspecified').toLowerCase();
        breachBySeverity[key] = (breachBySeverity[key] || 0) + 1;
      }

      // Average breach resolution days (resolved only)
      const breachResolutionDays = breachesLast12m
        .map((b) => daysBetween(b.reportedDate ?? null, b.resolutionDate ?? null))
        .filter((n): n is number => n !== null);
      const averageBreachResolutionDays = avg(breachResolutionDays);

      // Complaint categories + resolution time
      const complaintsByCategory: Record<string, number> = {};
      for (const c of complaintsLast12m) {
        const key = (c.category || 'uncategorised').toLowerCase();
        complaintsByCategory[key] = (complaintsByCategory[key] || 0) + 1;
      }
      const complaintResolutionDays = complaintsLast12m
        .map((c) => daysBetween(c.openedDate ?? null, c.closedDate ?? null))
        .filter((n): n is number => n !== null);
      const averageComplaintResolutionDays = avg(complaintResolutionDays);
      const ombudsmanEscalations = complaintsLast12m.filter((c) =>
        ['escalated', 'ombudsman', 'legal_ombudsman'].includes((c.status || '').toLowerCase())
      ).length;

      // Compliance scan category breakdown — turn the groupBy into per-category pass/fail
      const scanByCategory: Record<string, { pass: number; fail: number; other: number }> = {};
      for (const row of scanCategoryBreakdown) {
        const cat = (row.category || 'uncategorised').toLowerCase();
        const stat = (row.status || '').toLowerCase();
        const bucket = scanByCategory[cat] || { pass: 0, fail: 0, other: 0 };
        if (stat === 'pass' || stat === 'passed' || stat === 'completed' || stat === 'compliant') {
          bucket.pass += row._count._all;
        } else if (stat === 'fail' || stat === 'failed' || stat === 'non_compliant') {
          bucket.fail += row._count._all;
        } else {
          bucket.other += row._count._all;
        }
        scanByCategory[cat] = bucket;
      }

      const alertsBySeverity: Record<string, number> = {};
      for (const row of openAlerts) {
        const key = (row.severity || 'unspecified').toLowerCase();
        alertsBySeverity[key] = (alertsBySeverity[key] || 0) + row._count._all;
      }

      const pack = {
        generated_at: now.toISOString(),

        firm: firm
          ? {
              id: firm.id,
              name: firm.name ?? null,
              sra_number: firm.sraNumber ?? null,
              address: firm.address ?? null,
              firm_size: firm.firmSize ?? null,
              practice_areas: safeJsonParse<string[]>(firm.practiceAreas, []),
              colp_name: firm.colpName ?? null,
              cofa_name: firm.cofaName ?? null,
              mlro_name: firm.mlroName ?? null,
              subscription_tier: firm.subscriptionTier ?? null,
              onboarding_status: firm.onboardingStatus ?? null,
              established_date: firm.createdAt ?? null,
            }
          : null,

        staff: {
          total_active: activeStaffCount,
          solicitor_count: solicitorCount,
          trainee_count: traineeCount,
          average_pqe: averagePqe,
          staff_list: staffList.map((s) => ({
            id: s.id,
            name: s.name ?? null,
            role: s.role ?? null,
            pqe: s.pqe ?? null,
            sra_id: s.sraId ?? null,
          })),
        },

        training: {
          total_last_12m: trainingLast12m,
          completed_last_12m: trainingCompletedLast12m,
          overdue_count: trainingOverdue,
          aml_completion_rate_pct: rate(amlTrainingCompleted, amlTrainingTotal),
          aml_total: amlTrainingTotal,
          aml_completed: amlTrainingCompleted,
          gdpr_completion_rate_pct: rate(gdprTrainingCompleted, gdprTrainingTotal),
          gdpr_total: gdprTrainingTotal,
          gdpr_completed: gdprTrainingCompleted,
        },

        breaches: {
          total_last_12m: breachesLast12m.length,
          open_count: openBreachesCount,
          by_severity: breachBySeverity,
          average_resolution_days: averageBreachResolutionDays,
          items: breachesLast12m.map((b) => ({
            id: b.id,
            title: b.title,
            severity: b.severity ?? null,
            status: b.status ?? null,
            reported_date: b.reportedDate ?? null,
            ico_deadline: b.icoDeadline ?? null,
            resolution_date: b.resolutionDate ?? null,
          })),
        },

        complaints: {
          total_last_12m: complaintsLast12m.length,
          open_count: openComplaintsCount,
          by_category: complaintsByCategory,
          average_resolution_days: averageComplaintResolutionDays,
          ombudsman_escalations: ombudsmanEscalations,
        },

        aml: {
          total_cdd_records: cddTotal,
          cdd_completion_rate_pct: rate(cddCompleted, cddTotal),
          cdd_completed: cddCompleted,
          high_risk_client_count: highRiskClients,
          pep_flagged_count: pepFlagged,
          sars_last_12m: sarsLast12m,
          sars_pending_mlro: sarsPendingMlro,
        },

        supervision: {
          active_count: supervisionActive,
          overdue_count: supervisionOverdue,
        },

        policies: {
          total_count: policies.length,
          overdue_for_review: policiesOverdue,
          items: policies.map((p) => ({
            id: p.id,
            title: p.title,
            category: p.category ?? null,
            version: p.version ?? null,
            status: p.status ?? null,
            last_reviewed: p.lastReviewed ?? null,
            next_review: p.nextReview ?? null,
          })),
        },

        risk_management: {
          latest_firm_risk_score: latestRiskScore
            ? {
                overall_score: latestRiskScore.overallScore ?? null,
                sra_score: latestRiskScore.sraScore ?? null,
                aml_score: latestRiskScore.amlScore ?? null,
                gdpr_score: latestRiskScore.gdprScore ?? null,
                calculated_at: latestRiskScore.calculatedAt ?? null,
              }
            : null,
          latest_scan_date: latestScan?.scanDate ?? null,
          scan_category_breakdown: scanByCategory,
          open_alerts_by_severity: alertsBySeverity,
        },

        conflict_checks: {
          total_last_12m: conflictsLast12m,
          flagged_count: conflictsFlagged,
          resolved_count: conflictsResolved,
        },
      };

      // Best-effort audit log — never blocks the response.
      try {
        await logAudit({
          firmId,
          userId: req.user!.userId,
          action: 'pii_renewal_pack_generated',
          entityType: 'pii_renewal_pack',
          entityId: 'generated',
        });
      } catch (auditErr) {
        logger.warn('Failed to write audit log for PII renewal pack', {
          err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      res.json(pack);
    } catch (err) {
      logger.error('Failed to generate PII renewal pack', {
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      res.status(500).json({
        error: true,
        message: 'Failed to generate PII renewal pack',
      });
    }
  }
);

export default router;
