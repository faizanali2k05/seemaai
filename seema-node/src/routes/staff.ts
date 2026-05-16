import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeStaff(s: any) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    department: s.department,
    status: s.status,
    sra_id: s.sraId,
    start_date: s.startDate,
    last_training: s.lastTraining ?? null,
    phone: s.phone ?? null,
    pqe: s.pqe ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// CPD categories — keep this list aligned with the alembic migration
// `add_cpd_fields_and_targets`. The dashboard UI also references it.
export const CPD_CATEGORIES = [
  'regulatory',
  'technical',
  'ethics',
  'business_skills',
  'other',
] as const;
export type CpdCategory = (typeof CPD_CATEGORIES)[number];

function serializeTraining(t: any) {
  return {
    id: t.id,
    staff_id: t.staffId,
    course_name: t.courseName,
    provider: t.provider,
    due_date: t.dueDate,
    completed_date: t.completedDate,
    completed_at: t.completedAt,
    cpd_hours: t.cpdHours,
    status: t.status,
    // CPD dashboard fields (added 2026-05-13).
    category: t.category ?? null,
    reflection_notes: t.reflectionNotes ?? null,
    evidence_url: t.evidenceUrl ?? null,
    training_type: t.trainingType ?? null,
    staff_name: t.staffName ?? null,
    title: t.title ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

// Staff fields are simple single-word names; no snake_case/camelCase split.
const staffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  department: z.string().min(1),
});

// Training schema accepts both snake_case (the React form sends this) and
// camelCase keys so the route doesn't 400 on the more common payload.
const trainingSchema = z.object({
  // snake_case (frontend)
  staff_id: z.string().uuid().optional(),
  course_name: z.string().min(1).optional(),
  due_date: z.string().min(1).optional(),
  cpd_hours: z.number().min(0).optional(),
  category: z.enum(CPD_CATEGORIES).optional(),
  reflection_notes: z.string().optional(),
  evidence_url: z.string().url().optional(),
  // camelCase (legacy)
  staffId: z.string().uuid().optional(),
  courseName: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  cpdHours: z.number().min(0).optional(),
  provider: z.string().min(1),
}).refine(
  (d) => Boolean(d.staff_id || d.staffId),
  { message: 'staff_id (or staffId) is required' },
).refine(
  (d) => Boolean(d.course_name || d.courseName),
  { message: 'course_name (or courseName) is required' },
).refine(
  (d) => Boolean(d.due_date || d.dueDate),
  { message: 'due_date (or dueDate) is required' },
).refine(
  (d) => d.cpd_hours !== undefined || d.cpdHours !== undefined,
  { message: 'cpd_hours (or cpdHours) is required' },
);

// GET /compliance/staff
router.get('/compliance/staff', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const staff = await prisma.staffMember.findMany({
      where: { firmId },
    });

    res.json(staff.map(serializeStaff));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch staff' });
  }
});

// POST /compliance/staff (admin only)
router.post('/compliance/staff', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = staffSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const member = await prisma.staffMember.create({
      data: {
        firmId,
        ...parsed.data,
        status: 'active',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'create_staff_member',
      entityType: 'staff_member',
      entityId: member.id,
      ipAddress: req.ip,
    });

    res.status(201).json(serializeStaff(member));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create staff member' });
  }
});

// PUT /compliance/staff/:staffId (admin only)
//
// Frontend sends snake_case (sra_id, start_date); older callers sent
// camelCase. Accept both — every field optional for partial updates.
const updateStaffSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  status: z.string().optional(),
  // snake_case (frontend)
  sra_id: z.string().optional(),
  start_date: z.string().optional(),
  // camelCase (legacy)
  sraId: z.string().optional(),
  startDate: z.string().optional(),
});

router.put('/compliance/staff/:staffId', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { staffId } = req.params as Record<string, string>;
    const parsed = updateStaffSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.department !== undefined) updateData.department = data.department;
    if (data.status !== undefined) updateData.status = data.status;
    const sraId = data.sra_id ?? data.sraId;
    if (sraId !== undefined) updateData.sraId = sraId;
    const startDate = data.start_date ?? data.startDate;
    if (startDate !== undefined) updateData.startDate = startDate;

    const member = await prisma.staffMember.update({
      where: { id: staffId, firmId },
      data: updateData,
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'update_staff_member',
      entityType: 'staff_member',
      entityId: staffId,
      ipAddress: req.ip,
    });

    res.json(serializeStaff(member));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to update staff member' });
  }
});

// GET /compliance/training
router.get('/compliance/training', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const training = await prisma.staffTraining.findMany({
      where: { firmId },
    });

    res.json(training.map(serializeTraining));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch training records' });
  }
});

// POST /compliance/training (admin only)
router.post('/compliance/training', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = trainingSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const cpdHoursRaw = parsed.data.cpd_hours ?? parsed.data.cpdHours;
    const createData: any = {
      firmId,
      staffId: (parsed.data.staff_id ?? parsed.data.staffId) as string,
      courseName: (parsed.data.course_name ?? parsed.data.courseName) as string,
      provider: parsed.data.provider,
      dueDate: (parsed.data.due_date ?? parsed.data.dueDate) as string,
      // staff_training.cpd_hours is `int` in Postgres — round here so a
      // 1.5h activity stored as 2 doesn't blow up the binary protocol
      // the way the older 22P03 bug did.
      cpdHours: cpdHoursRaw !== undefined ? Math.round(cpdHoursRaw) : undefined,
      status: 'pending',
      // Optional CPD-dashboard fields (added by alembic
      // add_cpd_fields_and_targets). Default category to `other` so
      // the dashboard banner can prompt for re-categorisation rather
      // than silently miscount. Typed `any` so this type-checks before
      // `prisma generate` re-runs.
      category: parsed.data.category ?? 'other',
      reflectionNotes: parsed.data.reflection_notes ?? null,
      evidenceUrl: parsed.data.evidence_url ?? null,
    };
    const record = await prisma.staffTraining.create({ data: createData });

    res.status(201).json(serializeTraining(record));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create training record' });
  }
});

// PATCH /compliance/training/:trainingId — used by the CPD dashboard for
// in-place edits (category, reflection notes, evidence url, hours).
const trainingPatchSchema = z.object({
  category: z.enum(CPD_CATEGORIES).optional(),
  reflection_notes: z.string().nullable().optional(),
  evidence_url: z.string().url().nullable().optional(),
  cpd_hours: z.number().min(0).optional(),
  completed_date: z.string().optional(),
  status: z.string().optional(),
});

router.patch('/compliance/training/:trainingId', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { trainingId } = req.params as Record<string, string>;
    const parsed = trainingPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    // Typed `any` so the new fields (category/reflectionNotes/evidenceUrl)
    // type-check before `prisma generate` re-runs against the alembic
    // `add_cpd_fields_and_targets` schema.
    const data: any = {};
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.reflection_notes !== undefined) data.reflectionNotes = parsed.data.reflection_notes;
    if (parsed.data.evidence_url !== undefined) data.evidenceUrl = parsed.data.evidence_url;
    if (parsed.data.cpd_hours !== undefined) data.cpdHours = Math.round(parsed.data.cpd_hours);
    if (parsed.data.completed_date !== undefined) data.completedDate = parsed.data.completed_date;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const record = await prisma.staffTraining.update({
      where: { id: trainingId, firmId },
      data,
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'update_training_record',
      entityType: 'staff_training',
      entityId: trainingId,
      ipAddress: req.ip,
    });

    res.json(serializeTraining(record));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to update training record' });
  }
});

// ---------------------------------------------------------------------------
// CPD dashboard
// ---------------------------------------------------------------------------
//
// GET /compliance/training/cpd-dashboard?year=YYYY
//
// Aggregates `staff_training` rows for the requested calendar year (default
// current) and joins them onto `staff_members`. The COLP needs to see, per
// staff member: total hours, breakdown by category, gap to firm-set target,
// and how many records are missing reflection notes.
//
// SRA context (post-2016 continuing competence): there is no fixed hours
// requirement, but firms set their own internal targets and track activity
// as evidence. We resolve the per-staff target by:
//   1. Looking up `firm_cpd_targets(firm_id, role, year)` if a row exists.
//   2. Otherwise falling back to the firm-wide default stored under
//      `firmPreferences.cpd_target_hours` (JSON).
//   3. Otherwise the historical 16-hour default.
const DEFAULT_CPD_TARGET_HOURS = 16;

router.get('/compliance/training/cpd-dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const yearParam = (req.query.year as string | undefined) ?? '';
    const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    // Cast to `any` for new model accesses so this file type-checks even
    // before `prisma generate` has been re-run after the
    // `add_cpd_fields_and_targets` alembic migration. Once the client is
    // regenerated, the cast is a no-op and the typed model is used.
    const prismaAny = prisma as any;
    const [staff, trainingRaw, targets, firm] = await Promise.all([
      prisma.staffMember.findMany({ where: { firmId } }),
      prisma.staffTraining.findMany({ where: { firmId } }),
      prismaAny.firmCpdTarget.findMany({ where: { firmId, year } }) as Promise<Array<{ role: string; targetHours: number | string }>>,
      prisma.firm.findUnique({ where: { id: firmId }, select: { firmPreferences: true } }),
    ]);
    const training: any[] = trainingRaw as any[];

    let firmDefaultTarget = DEFAULT_CPD_TARGET_HOURS;
    try {
      const prefs = firm?.firmPreferences ? JSON.parse(firm.firmPreferences) : {};
      if (typeof prefs.cpd_target_hours === 'number' && prefs.cpd_target_hours >= 0) {
        firmDefaultTarget = prefs.cpd_target_hours;
      }
    } catch {
      // Malformed preferences JSON — fall back to default. Logging the
      // parse error here would be noisy and the firm settings page already
      // surfaces invalid preferences elsewhere.
    }

    const targetForRole = (role: string | null | undefined): number => {
      if (role) {
        const match = targets.find((t) => t.role === role);
        if (match) return Number(match.targetHours);
      }
      return firmDefaultTarget;
    };

    // A record counts towards `year` if it was either completed in `year`
    // (preferred) or, lacking a completion timestamp, was created in
    // `year`. This mirrors how the existing Training Overview tab buckets
    // records and avoids "missing" recently-logged activities.
    const inYear = (t: any): boolean => {
      const completed: Date | null = t.completedAt ?? (t.completedDate ? new Date(t.completedDate) : null);
      const candidate: Date | null = completed ?? t.createdAt ?? null;
      if (!candidate) return false;
      const d = new Date(candidate);
      return d >= yearStart && d < yearEnd;
    };

    const trainingByStaff = new Map<string, any[]>();
    let uncategorisedCount = 0;
    for (const t of training) {
      if (!inYear(t)) continue;
      if (!t.category) uncategorisedCount += 1;
      const arr = trainingByStaff.get(t.staffId) ?? [];
      arr.push(t);
      trainingByStaff.set(t.staffId, arr);
    }

    const staffRows = staff.map((s) => {
      const records = trainingByStaff.get(s.id) ?? [];
      const totalHours = records.reduce((acc, r) => acc + (Number(r.cpdHours) || 0), 0);
      const hoursByCategory: Record<string, number> = {};
      for (const cat of CPD_CATEGORIES) hoursByCategory[cat] = 0;
      for (const r of records) {
        const cat = (r.category ?? 'other') as CpdCategory;
        hoursByCategory[cat] += Number(r.cpdHours) || 0;
      }
      const targetHours = targetForRole(s.role);
      const gapHours = Math.max(0, targetHours - totalHours);
      const missingReflections = records.filter((r) => !r.reflectionNotes || !r.reflectionNotes.trim()).length;

      const lastRecordTs = records.reduce<Date | null>((latest, r) => {
        const ts = r.completedAt ?? (r.completedDate ? new Date(r.completedDate) : r.createdAt);
        if (!ts) return latest;
        const d = new Date(ts);
        if (!latest || d > latest) return d;
        return latest;
      }, null);

      let status: 'on_track' | 'at_risk' | 'off_track' | 'no_records';
      if (records.length === 0) status = 'no_records';
      else if (totalHours >= targetHours) status = 'on_track';
      else if (totalHours >= targetHours * 0.5) status = 'at_risk';
      else status = 'off_track';

      return {
        staff_id: s.id,
        staff_name: s.name,
        role: s.role ?? null,
        total_hours: Number(totalHours.toFixed(2)),
        hours_by_category: Object.fromEntries(
          Object.entries(hoursByCategory).map(([k, v]) => [k, Number(v.toFixed(2))]),
        ),
        target_hours: Number(targetHours.toFixed(2)),
        gap_hours: Number(gapHours.toFixed(2)),
        records_count: records.length,
        missing_reflections: missingReflections,
        last_record_date: lastRecordTs ? lastRecordTs.toISOString().split('T')[0] : null,
        status,
      };
    });

    const totalFirmHours = staffRows.reduce((acc, s) => acc + s.total_hours, 0);
    const feeEarners = staffRows.filter((s) => {
      const r = (s.role ?? '').toLowerCase();
      return ['solicitor', 'partner', 'paralegal', 'trainee', 'fee_earner'].some((kw) => r.includes(kw));
    });
    const avgPerFeeEarner = feeEarners.length
      ? Number((feeEarners.reduce((a, s) => a + s.total_hours, 0) / feeEarners.length).toFixed(2))
      : 0;
    const onTrackPct = staffRows.length
      ? Math.round((staffRows.filter((s) => s.status === 'on_track').length / staffRows.length) * 100)
      : 0;

    res.json({
      year,
      firm_target_hours: firmDefaultTarget,
      uncategorised_records: uncategorisedCount,
      summary: {
        total_hours: Number(totalFirmHours.toFixed(2)),
        avg_per_fee_earner: avgPerFeeEarner,
        on_track_pct: onTrackPct,
        staff_count: staffRows.length,
      },
      staff: staffRows,
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to build CPD dashboard' });
  }
});

// ---------------------------------------------------------------------------
// Firm-wide CPD targets
// ---------------------------------------------------------------------------
// GET /compliance/training/cpd-targets — list per-role targets + the
// firm-wide default (read from firmPreferences.cpd_target_hours).
router.get('/compliance/training/cpd-targets', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const yearParam = (req.query.year as string | undefined) ?? '';
    const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();

    const prismaAny = prisma as any;
    const [targets, firm] = await Promise.all([
      prismaAny.firmCpdTarget.findMany({ where: { firmId, year } }) as Promise<Array<{ id: string; role: string; year: number; targetHours: number | string }>>,
      prisma.firm.findUnique({ where: { id: firmId }, select: { firmPreferences: true } }),
    ]);

    let defaultTarget = DEFAULT_CPD_TARGET_HOURS;
    try {
      const prefs = firm?.firmPreferences ? JSON.parse(firm.firmPreferences) : {};
      if (typeof prefs.cpd_target_hours === 'number') defaultTarget = prefs.cpd_target_hours;
    } catch {
      // ignore parse failure — see dashboard route for context
    }

    res.json({
      year,
      firm_target_hours: defaultTarget,
      role_targets: targets.map((t) => ({
        id: t.id,
        role: t.role,
        year: t.year,
        target_hours: Number(t.targetHours),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch CPD targets' });
  }
});

// PUT /compliance/training/cpd-targets — admin-only. Accepts either:
//   { firm_target_hours: 16 }                    -> stored on firm prefs
//   { role: 'solicitor', year: 2026, hours: 20 } -> upserted into firm_cpd_targets
const cpdTargetSchema = z.object({
  firm_target_hours: z.number().min(0).optional(),
  role: z.string().min(1).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  hours: z.number().min(0).optional(),
}).refine(
  (d) => d.firm_target_hours !== undefined || (d.role && d.year !== undefined && d.hours !== undefined),
  { message: 'Provide firm_target_hours OR (role, year, hours)' },
);

router.put('/compliance/training/cpd-targets', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = cpdTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    if (parsed.data.firm_target_hours !== undefined) {
      // Merge into firmPreferences JSON rather than overwriting it — other
      // routes (e.g. notification preferences) share the same column.
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { firmPreferences: true },
      });
      let prefs: Record<string, unknown> = {};
      try {
        prefs = firm?.firmPreferences ? JSON.parse(firm.firmPreferences) : {};
      } catch {
        prefs = {};
      }
      prefs.cpd_target_hours = parsed.data.firm_target_hours;
      await prisma.firm.update({
        where: { id: firmId },
        data: { firmPreferences: JSON.stringify(prefs) },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'set_firm_cpd_target',
        entityType: 'firm',
        entityId: firmId,
        ipAddress: req.ip,
      });
    }

    if (parsed.data.role && parsed.data.year !== undefined && parsed.data.hours !== undefined) {
      // Cast for the same reason as the dashboard route — the generated
      // client may not yet expose firmCpdTarget if `prisma generate` has
      // not been re-run. The upsert key uses the compound unique (firmId,
      // role, year) declared in schema.prisma.
      await (prisma as any).firmCpdTarget.upsert({
        where: {
          firmId_role_year: {
            firmId,
            role: parsed.data.role,
            year: parsed.data.year,
          },
        },
        update: { targetHours: parsed.data.hours },
        create: {
          firmId,
          role: parsed.data.role,
          year: parsed.data.year,
          targetHours: parsed.data.hours,
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'set_role_cpd_target',
        entityType: 'firm_cpd_target',
        entityId: `${parsed.data.role}-${parsed.data.year}`,
        ipAddress: req.ip,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to save CPD target' });
  }
});

// POST /compliance/training/:trainingId/complete
router.post('/compliance/training/:trainingId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { trainingId } = req.params as Record<string, string>;

    const today = new Date().toISOString().split('T')[0];

    const record = await prisma.staffTraining.update({
      where: { id: trainingId, firmId },
      data: {
        status: 'completed',
        completedDate: today,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'complete_training',
      entityType: 'staff_training',
      entityId: trainingId,
      ipAddress: req.ip,
    });

    res.json(serializeTraining(record));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete training' });
  }
});

// GET /admin/export/staff (admin only)
router.get('/admin/export/staff', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const staff = await prisma.staffMember.findMany({
      where: { firmId },
    });

    const headers = ['id', 'name', 'email', 'role', 'department', 'status', 'sraId', 'startDate'];
    const rows = staff.map((s) =>
      headers.map((h) => {
        const val = (s as Record<string, unknown>)[h];
        return val != null ? String(val) : '';
      }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="staff_export.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to export staff' });
  }
});

export default router;
