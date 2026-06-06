import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the SRA reporting year window covering `today`.
 * The UK regulatory year runs 1 April → 31 March. If we're in or after April
 * the current window started this April; otherwise it started last April.
 */
function getReportingPeriod(today = new Date()): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // 0-indexed; April = 3
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-04-01 to ${startYear + 1}-03-31`;
}

/**
 * Due date: 31 October following the reporting period end (i.e. 31 Oct after
 * the next 31 March). For window 2026-04-01 → 2027-03-31 the due date is
 * 2027-10-31.
 */
function getDueDate(today = new Date()): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  // Period end is `${startYear + 1}-03-31`. Due date is 31 Oct of that same year.
  const due = new Date(Date.UTC(startYear + 1, 9, 31));
  return due.toISOString().split('T')[0];
}

/** Best-effort parse of firmPreferences JSON. Returns {} on any failure. */
function parseFirmPrefs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Best-effort parse of a JSON-encoded array of strings. Returns [] on failure. */
function parsePracticeAreas(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map(x => x.trim());
    }
    return [];
  } catch {
    return [];
  }
}

/** True iff the value is non-null, non-empty after trim. */
function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  return true;
}

type Section = {
  complete: boolean;
  fields: number;
  completed: number;
  missing: string[];
};

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /compliance/sra-return — Build structured SRA return from real firm data.
router.get('/compliance/sra-return', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

    // One big Promise.all for the firm + every aggregate the sections need.
    const [
      firm,
      matterCount,
      clientAccountCount,
      transactionCount,
      recentReconciliationCount,
      amlPolicyCount,
      cddCount,
      sarCount,
      totalStaffCount,
      amlTrainedStaffIds,
      complaints,
      latestMatter,
      latestClientAccount,
      latestStaffMember,
    ] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId } }),
      prisma.matter.count({ where: { firmId } }),
      prisma.clientAccount.count({ where: { firmId } }),
      prisma.transaction.count({ where: { firmId } }),
      prisma.reconciliation.count({
        where: {
          firmId,
          status: 'completed',
          completedAt: { gte: sixMonthsAgo },
        },
      }),
      prisma.policyDocument.count({
        where: {
          firmId,
          category: { contains: 'aml', mode: 'insensitive' },
        },
      }),
      prisma.cddRecord.count({ where: { firmId } }),
      prisma.sarRecord.count({ where: { firmId } }),
      prisma.staffMember.count({ where: { firmId } }),
      // Distinct staff who completed an AML training in the last 12 months.
      prisma.staffTraining.findMany({
        where: {
          firmId,
          status: 'completed',
          completedAt: { gte: twelveMonthsAgo },
          OR: [
            { courseName: { contains: 'AML', mode: 'insensitive' } },
            { courseName: { contains: 'anti-money', mode: 'insensitive' } },
            { title: { contains: 'AML', mode: 'insensitive' } },
            { title: { contains: 'anti-money', mode: 'insensitive' } },
          ],
        },
        select: { staffId: true },
        distinct: ['staffId'],
      }),
      prisma.complaint.findMany({
        where: { firmId, openedDate: { gte: twelveMonthsAgo } },
        select: {
          status: true,
          category: true,
          openedDate: true,
          closedDate: true,
          resolution: true,
        },
      }),
      prisma.matter.findFirst({
        where: { firmId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      prisma.clientAccount.findFirst({
        where: { firmId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      prisma.staffMember.findFirst({
        where: { firmId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    const prefs = parseFirmPrefs(firm.firmPreferences);
    const practiceAreas = parsePracticeAreas(firm.practiceAreas);

    // ── firm_details ──────────────────────────────────────────────────────────
    const firmDetailFields: Array<{ key: string; value: unknown }> = [
      { key: 'name',            value: firm.name },
      { key: 'sra_number',      value: firm.sraNumber },
      { key: 'address',         value: firm.address },
      { key: 'postcode',        value: firm.postcode },
      { key: 'phone',           value: firm.phone },
      { key: 'email',           value: firm.email },
      { key: 'website',         value: firm.website },
      { key: 'colp_name',       value: firm.colpName },
      { key: 'cofa_name',       value: firm.cofaName },
      { key: 'mlro_name',       value: firm.mlroName },
      { key: 'firm_size',       value: firm.firmSize },
      { key: 'practice_areas',  value: practiceAreas.length > 0 ? practiceAreas : null },
    ];
    const firmDetailsMissing = firmDetailFields.filter(f => !present(f.value)).map(f => f.key);
    const firmDetails: Section = {
      complete: firmDetailsMissing.length === 0,
      fields: firmDetailFields.length,
      completed: firmDetailFields.length - firmDetailsMissing.length,
      missing: firmDetailsMissing,
    };

    // ── work_areas ────────────────────────────────────────────────────────────
    // Fields = max(parsed practice areas length, 1). Completed = parsed length.
    // Section is only complete if matter count > 0 AND practice_areas non-empty.
    const workAreaFields = Math.max(practiceAreas.length, 1);
    const workAreaCompleted = practiceAreas.length;
    const workAreaComplete = matterCount > 0 && practiceAreas.length > 0;
    const workAreaMissing: string[] = [];
    if (matterCount === 0) workAreaMissing.push('matters');
    if (practiceAreas.length === 0) workAreaMissing.push('practice_areas');
    const workAreas: Section = {
      complete: workAreaComplete,
      fields: workAreaFields,
      completed: workAreaCompleted,
      missing: workAreaMissing,
    };

    // ── fees_and_finance ─────────────────────────────────────────────────────
    const feesChecks = [
      { key: 'has_client_account',       complete: clientAccountCount > 0 },
      { key: 'has_transactions',         complete: transactionCount > 0 },
      { key: 'has_recent_reconciliation', complete: recentReconciliationCount > 0 },
    ];
    const feesMissing = feesChecks.filter(c => !c.complete).map(c => c.key);
    const feesAndFinance: Section = {
      complete: feesMissing.length === 0,
      fields: feesChecks.length,
      completed: feesChecks.length - feesMissing.length,
      missing: feesMissing,
    };

    // ── insurance ────────────────────────────────────────────────────────────
    const insuranceKeys = [
      'pii_insurer',
      'pii_policy_number',
      'pii_expiry_date',
      'pii_sum_insured',
    ];
    const insuranceKeyToField: Record<string, string> = {
      pii_insurer: 'insurer_name',
      pii_policy_number: 'policy_number',
      pii_expiry_date: 'expiry_date',
      pii_sum_insured: 'sum_insured',
    };
    const insuranceMissing = insuranceKeys
      .filter(k => !present(prefs[k]))
      .map(k => insuranceKeyToField[k]);
    const insurance: Section = {
      complete: insuranceMissing.length === 0,
      fields: insuranceKeys.length,
      completed: insuranceKeys.length - insuranceMissing.length,
      missing: insuranceMissing,
    };

    // ── money_laundering ─────────────────────────────────────────────────────
    const amlTrainedCount = amlTrainedStaffIds.length;
    const amlTrainingRate = totalStaffCount > 0
      ? (amlTrainedCount / totalStaffCount) * 100
      : 0;
    const amlChecks = [
      { key: 'has_mlro',                 complete: present(firm.mlroName) },
      { key: 'has_aml_policy',           complete: amlPolicyCount > 0 },
      { key: 'has_cdd_records',          complete: cddCount > 0 },
      { key: 'has_recent_sars',          complete: sarCount > 0 },
      { key: 'aml_training_completion',  complete: totalStaffCount > 0 && amlTrainingRate >= 80 },
    ];
    const amlMissing = amlChecks.filter(c => !c.complete).map(c => c.key);
    const moneyLaundering: Section = {
      complete: amlMissing.length === 0,
      fields: amlChecks.length,
      completed: amlChecks.length - amlMissing.length,
      missing: amlMissing,
    };

    // ── diversity ────────────────────────────────────────────────────────────
    const diversityFields = [
      'gender_breakdown',
      'ethnicity_breakdown',
      'age_breakdown',
      'disability_breakdown',
    ];
    const diversityCompleted = prefs['diversity_survey_completed'] === true;
    const diversity: Section = {
      complete: diversityCompleted,
      fields: diversityFields.length,
      completed: diversityCompleted ? diversityFields.length : 0,
      missing: diversityCompleted ? [] : diversityFields,
    };

    // ── complaints ───────────────────────────────────────────────────────────
    // All 3 fields are always "completed" — the count itself is the answer.
    // Even zero complaints is a valid, complete report.
    const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000;
    const complaintCount = complaints.length;
    const resolvedWithin8wks = complaints.filter(c => {
      if (!c.openedDate || !c.closedDate) return false;
      return c.closedDate.getTime() - c.openedDate.getTime() <= EIGHT_WEEKS_MS;
    }).length;
    const ombudsmanReferrals = complaints.filter(c => {
      const status = (c.status || '').toLowerCase();
      const category = (c.category || '').toLowerCase();
      return status.includes('ombudsman') || category === 'legal_ombudsman';
    }).length;
    const complaintsSection: Section = {
      complete: true,
      fields: 3,
      completed: 3,
      missing: [],
    };

    const sections = {
      firm_details: firmDetails,
      work_areas: workAreas,
      fees_and_finance: feesAndFinance,
      insurance,
      money_laundering: moneyLaundering,
      diversity,
      complaints: complaintsSection,
    };

    const totalFields = Object.values(sections).reduce((a, s) => a + s.fields, 0);
    const completedFields = Object.values(sections).reduce((a, s) => a + s.completed, 0);

    // Validation errors: sections with no progress at all (complete=false AND completed=0).
    // Warnings: partially filled sections (complete=false AND completed>0).
    let validationErrors = 0;
    let warnings = 0;
    for (const s of Object.values(sections)) {
      if (!s.complete) {
        if (s.completed === 0) validationErrors += 1;
        else warnings += 1;
      }
    }

    // last_saved = newest updatedAt across firm + the latest matter/client account/staff member.
    const candidates: Array<Date | null | undefined> = [
      firm.updatedAt,
      latestMatter?.updatedAt,
      latestClientAccount?.updatedAt,
      latestStaffMember?.updatedAt,
    ];
    const validDates = candidates.filter((d): d is Date => d instanceof Date);
    const lastSaved = validDates.length > 0
      ? new Date(Math.max(...validDates.map(d => d.getTime())))
      : null;

    res.json({
      reporting_period: getReportingPeriod(now),
      status: 'draft',
      firm_id: firm.id,
      firm_name: firm.name,
      sra_number: firm.sraNumber,
      colp_name: firm.colpName,
      cofa_name: firm.cofaName,
      sections,
      total_fields: totalFields,
      completed_fields: completedFields,
      validation_errors: validationErrors,
      warnings,
      due_date: getDueDate(now),
      last_saved: lastSaved,
      // Useful extras the frontend may display alongside the complaints section.
      complaints_summary: {
        complaint_count: complaintCount,
        complaints_resolved_within_8wks: resolvedWithin8wks,
        ombudsman_referrals: ombudsmanReferrals,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch SRA return' });
  }
});

// PUT /compliance/sra-return — Update firm SRA return edits
router.put('/compliance/sra-return', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const updated = await prisma.firm.update({
      where: { id: firmId },
      data: {
        sraReturnEdits: JSON.stringify(req.body),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'sra_return_updated',
      entityType: 'firm',
      entityId: firmId,
    });

    res.json({ success: true, sraReturnEdits: updated.sraReturnEdits });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to update SRA return' });
  }
});

// POST /compliance/sra-return/export — Export SRA return as CSV
router.post('/compliance/sra-return/export', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [firm, auditItems] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId } }),
      prisma.sraAuditItem.findMany({
        where: { firmId },
        orderBy: { category: 'asc' },
      }),
    ]);

    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    const csvRows: string[] = ['Category,Item Name,Status,Description,Last Reviewed'];
    for (const item of auditItems) {
      const row = [
        item.category || '',
        item.itemName || '',
        item.status ?? '',
        (item.description || '').replace(/,/g, ';').replace(/\n/g, ' '),
        item.lastReviewed || '',
      ].join(',');
      csvRows.push(row);
    }
    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sra-return-${firm.sraNumber}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to export SRA return' });
  }
});

// POST /compliance/sra-return/export-pdf — PDF export placeholder
router.post('/compliance/sra-return/export-pdf', authenticate, async (_req: Request, res: Response) => {
  try {
    res.json({
      message: 'PDF generation is handled by the FastAPI service',
      endpoint: '/api/compliance/sra-return/export-pdf',
      status: 'not_implemented_here',
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to export PDF' });
  }
});

// POST /compliance/sra-return/submit — Submit SRA return
router.post('/compliance/sra-return/submit', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'sra_return_submitted',
      entityType: 'firm',
      entityId: firmId,
      metadata: { submittedAt: new Date().toISOString() },
    });

    res.json({ success: true, message: 'SRA return submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to submit SRA return' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Section quick-fill responses (Task #49)
// ─────────────────────────────────────────────────────────────────────────────
// The COLP walks through each section in the stepper modal and either:
//   - Accepts the auto-filled value           → status='accepted'
//   - Overrides with their own value + reason → status='overridden'
//   - Skips the section with a reason          → status='skipped'
//
// Persistence keyed on (firmId, returnYear, sectionKey) so the COLP can
// close the modal and resume later. Backed by `sra_return_responses`
// (created by the alembic migration `add_sra_return_responses`).

const VALID_STATUSES = new Set(['accepted', 'overridden', 'skipped']);

function parseReturnYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

function serialiseResponse(r: {
  id: string;
  sectionKey: string;
  status: string;
  value: string | null;
  notes: string | null;
  completedBy: string | null;
  completedAt: Date;
}) {
  return {
    id: r.id,
    section_key: r.sectionKey,
    status: r.status,
    value: r.value,
    notes: r.notes,
    completed_by: r.completedBy,
    completed_at: r.completedAt,
  };
}

// GET /compliance/sra-return/:year/responses — list saved per-section answers
router.get(
  '/compliance/sra-return/:year/responses',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const returnYear = parseReturnYear(req.params.year as string | undefined);
      if (returnYear === null) {
        res.status(400).json({ error: true, message: 'Invalid return year' });
        return;
      }

      const [rows, finalisation] = await Promise.all([
        prisma.sraReturnResponse.findMany({
          where: { firmId, returnYear },
          orderBy: { sectionKey: 'asc' },
        }),
        prisma.sraReturnFinalisation.findUnique({
          where: { firmId_returnYear: { firmId, returnYear } },
        }),
      ]);

      res.json({
        return_year: returnYear,
        responses: rows.map(serialiseResponse),
        finalised_at: finalisation?.finalisedAt ?? null,
        finalised_by: finalisation?.finalisedBy ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to fetch SRA return responses' });
    }
  },
);

// PUT /compliance/sra-return/:year/responses/:sectionKey — upsert one answer
router.put(
  '/compliance/sra-return/:year/responses/:sectionKey',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: true, message: 'User context missing' });
        return;
      }

      const returnYear = parseReturnYear(req.params.year as string | undefined);
      if (returnYear === null) {
        res.status(400).json({ error: true, message: 'Invalid return year' });
        return;
      }
      const sectionKey = (req.params.sectionKey as string | undefined)?.trim();
      if (!sectionKey) {
        res.status(400).json({ error: true, message: 'Missing section key' });
        return;
      }

      const body = req.body ?? {};
      const status = typeof body.status === 'string' ? body.status : '';
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({
          error: true,
          message: 'status must be one of accepted | overridden | skipped',
        });
        return;
      }
      const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
      // Audit trail: regulator-facing return — the COLP must justify any
      // deviation from the auto-filled value.
      if ((status === 'overridden' || status === 'skipped') && !notes) {
        res.status(400).json({
          error: true,
          message: `notes are required when status is '${status}'`,
        });
        return;
      }

      // value: store as TEXT — JSON-encode anything that isn't already a string.
      let value: string | null = null;
      if (body.value !== undefined && body.value !== null) {
        value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);
      }

      const row = await prisma.sraReturnResponse.upsert({
        where: {
          firmId_returnYear_sectionKey: { firmId, returnYear, sectionKey },
        },
        create: {
          firmId,
          returnYear,
          sectionKey,
          status,
          value,
          notes: notes || null,
          completedBy: userId,
        },
        update: {
          status,
          value,
          notes: notes || null,
          completedBy: userId,
          completedAt: new Date(),
        },
      });

      await logAudit({
        firmId,
        userId,
        action: `sra_return_section_${status}`,
        entityType: 'sra_return_response',
        entityId: row.id,
        metadata: { sectionKey, returnYear },
      });

      res.json({ success: true, response: serialiseResponse(row) });
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to save SRA return response' });
    }
  },
);

// POST /compliance/sra-return/:year/finalise — mark the return as final
router.post(
  '/compliance/sra-return/:year/finalise',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: true, message: 'User context missing' });
        return;
      }

      const returnYear = parseReturnYear(req.params.year as string | undefined);
      if (returnYear === null) {
        res.status(400).json({ error: true, message: 'Invalid return year' });
        return;
      }

      const responses = await prisma.sraReturnResponse.findMany({
        where: { firmId, returnYear },
        orderBy: { sectionKey: 'asc' },
      });

      const summary = {
        total: responses.length,
        accepted: responses.filter(r => r.status === 'accepted').length,
        overridden: responses.filter(r => r.status === 'overridden').length,
        skipped: responses.filter(r => r.status === 'skipped').length,
        sections: responses.map(r => ({
          section_key: r.sectionKey,
          status: r.status,
          value: r.value,
          notes: r.notes,
        })),
      };

      const finalised = await prisma.sraReturnFinalisation.upsert({
        where: { firmId_returnYear: { firmId, returnYear } },
        create: {
          firmId,
          returnYear,
          finalisedBy: userId,
          summaryJson: JSON.stringify(summary),
        },
        update: {
          finalisedBy: userId,
          finalisedAt: new Date(),
          summaryJson: JSON.stringify(summary),
        },
      });

      await logAudit({
        firmId,
        userId,
        action: 'sra_return_finalised',
        entityType: 'sra_return_finalisation',
        entityId: finalised.id,
        metadata: { returnYear, ...summary },
      });

      res.json({
        success: true,
        finalised_at: finalised.finalisedAt,
        finalised_by: finalised.finalisedBy,
        summary,
        // This product does not actually submit to mySRA — the COLP must
        // file the finalised return on the regulator's portal directly.
        next_step_url: 'https://my.sra.org.uk',
        next_step_text: 'Submit this to mySRA at https://my.sra.org.uk',
      });
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to finalise SRA return' });
    }
  },
);

export default router;
