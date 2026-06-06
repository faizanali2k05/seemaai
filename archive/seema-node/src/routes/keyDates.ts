import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeKeyDate(d: any) {
  return {
    id: d.id,
    title: d.title,
    date: d.date,
    category: d.category,
    status: d.status,
    assigned_to: d.assignedTo,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// Reference catalogs for the key-dates calculator. These are static UK legal
// reference data — they are NOT per-firm records, so we serve them straight
// from constants. (The previous version queried prisma.keyDate.findMany filtered
// by `category` which is a per-firm table for actual deadlines, so it always
// returned an empty list and the dropdowns rendered with no options.)
const LIMITATION_PERIODS = [
  { id: 'personal_injury', label: 'Personal injury', default_years: 3 },
  { id: 'contract', label: 'Contract (simple)', default_years: 6 },
  { id: 'contract_deed', label: 'Contract under deed', default_years: 12 },
  { id: 'tort', label: 'Tort (other than personal injury)', default_years: 6 },
  { id: 'negligence_latent', label: 'Negligence (latent damage)', default_years: 6 },
  { id: 'defamation', label: 'Defamation / slander', default_years: 1 },
  { id: 'judicial_review', label: 'Judicial review', default_years: 0 },
  { id: 'land_recovery', label: 'Recovery of land', default_years: 12 },
  { id: 'trust_property', label: 'Trust property recovery', default_years: 6 },
  { id: 'consumer_protection_act', label: 'Consumer Protection Act 1987', default_years: 3 },
  { id: 'fatal_accidents', label: 'Fatal Accidents Act claim', default_years: 3 },
  { id: 'product_liability', label: 'Product liability', default_years: 3 },
];

const PRE_ACTION_PROTOCOLS = [
  { id: 'personal_injury', label: 'Personal Injury' },
  { id: 'clinical_disputes', label: 'Clinical disputes' },
  { id: 'professional_negligence', label: 'Professional negligence' },
  { id: 'debt_claims', label: 'Debt claims' },
  { id: 'judicial_review', label: 'Judicial review' },
  { id: 'construction', label: 'Construction and engineering' },
  { id: 'defamation', label: 'Defamation' },
  { id: 'housing_disrepair', label: 'Housing disrepair' },
  { id: 'possession_claims', label: 'Possession claims by social landlords' },
  { id: 'low_value_rta', label: 'Low Value Personal Injury (RTA)' },
  { id: 'low_value_el_pl', label: 'Low Value Employer/Public Liability' },
  { id: 'dilapidation', label: 'Dilapidation of commercial property' },
];

// GET /compliance/key-dates/limitation-periods — Catalog of limitation periods
router.get('/compliance/key-dates/limitation-periods', authenticate, async (_req: Request, res: Response) => {
  res.json(LIMITATION_PERIODS);
});

// GET /compliance/key-dates/pre-action-protocols — Catalog of CPR pre-action protocols
router.get('/compliance/key-dates/pre-action-protocols', authenticate, async (_req: Request, res: Response) => {
  res.json(PRE_ACTION_PROTOCOLS);
});

// ─────────────────────────────────────────────────────────────────────────
//  Pure calculator endpoints
//
//  These POSTs are calculators only — they do not write to the database.
//  They take user input (a claim type + a date) and return the computed
//  limitation / CPR / pre-action deadline plus useful display fields. To
//  actually persist a result as a tracked deadline, the client should call
//  POST /compliance/key-dates/save with the chosen title + date.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

function urgencyOf(days: number): 'critical' | 'warning' | 'ok' | 'expired' {
  if (days < 0) return 'expired';
  if (days < 30) return 'critical';
  if (days < 180) return 'warning';
  return 'ok';
}

function addYears(date: Date, years: number): Date {
  const out = new Date(date);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

// POST /compliance/key-dates/limitation — Calculate limitation expiry
const limitationCalcSchema = z.object({
  claim_type: z.string(),
  date_of_cause: z.string(),
  claimant_is_minor: z.boolean().optional(),
  claimant_has_disability: z.boolean().optional(),
});

router.post('/compliance/key-dates/limitation', authenticate, async (req: Request, res: Response) => {
  const parsed = limitationCalcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const { claim_type, date_of_cause, claimant_is_minor, claimant_has_disability } = parsed.data;
  const period = LIMITATION_PERIODS.find((p) => p.id === claim_type);
  if (!period) {
    res.status(400).json({ error: true, message: `Unknown claim type: ${claim_type}` });
    return;
  }

  const cause = new Date(date_of_cause);
  if (Number.isNaN(cause.getTime())) {
    res.status(400).json({ error: true, message: 'Invalid date_of_cause' });
    return;
  }

  let expiry = addYears(cause, period.default_years);
  const notes: string[] = [];

  // Minors and persons under a disability: the Limitation Act 1980 typically
  // tolls the period until the disability ends. We surface this as a warning
  // rather than trying to model the full tolling rules.
  if (claimant_is_minor) {
    notes.push(
      'Claimant is a minor — limitation period typically does not begin to run until the claimant turns 18. Treat the expiry as indicative.',
    );
  }
  if (claimant_has_disability) {
    notes.push(
      'Claimant is under a disability — Limitation Act 1980 s.28 tolls the period until the disability ends. Treat the expiry as indicative.',
    );
  }

  const today = new Date();
  const daysRemaining = daysBetween(today, expiry);

  res.json({
    // The React page (LimitationResult interface) reads these keys:
    expiry_date: expiry.toISOString().split('T')[0],
    days_remaining: daysRemaining,
    urgency: urgencyOf(daysRemaining),
    statute_reference: `Limitation Act 1980 — ${period.label} (${period.default_years} year${period.default_years === 1 ? '' : 's'}).`,
    warnings: notes,
    // Plus the inputs/context (handy if the caller wants to display them)
    claim_type: period.id,
    claim_label: period.label,
    standard_period_years: period.default_years,
    date_of_cause,
  });
});

// POST /compliance/key-dates/cpr — Calculate CPR procedural deadlines
const cprCalcSchema = z.object({
  event_type: z.string(),
  event_date: z.string(),
});

// CPR rules — deadlines triggered from a procedural event. Days are calendar
// days unless otherwise noted (CPR r.2.8).
const CPR_RULES: Record<string, Array<{ label: string; days: number }>> = {
  claim_form_served: [
    { label: 'Acknowledgement of service due', days: 14 },
    { label: 'Defence due (if AoS filed)', days: 28 },
    { label: 'Default judgment risk (no AoS, no defence)', days: 14 },
  ],
  particulars_served: [
    { label: 'Defence due', days: 14 },
    { label: 'Acknowledgement of service due', days: 14 },
  ],
  defence_filed: [
    { label: 'Reply to defence (if any) due', days: 28 },
    { label: 'Allocation questionnaire (DQ) due (typical)', days: 21 },
  ],
  judgment_entered: [
    { label: 'Time to apply for permission to appeal', days: 21 },
  ],
  costs_order_made: [
    { label: 'Costs budget exchange (Precedent H)', days: 21 },
  ],
  disclosure_ordered: [
    { label: 'Disclosure list due (typical)', days: 28 },
  ],
};

router.post('/compliance/key-dates/cpr', authenticate, async (req: Request, res: Response) => {
  const parsed = cprCalcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const { event_type, event_date } = parsed.data;
  const event = new Date(event_date);
  if (Number.isNaN(event.getTime())) {
    res.status(400).json({ error: true, message: 'Invalid event_date' });
    return;
  }
  const rules = CPR_RULES[event_type] ?? [
    { label: 'Default response window', days: 28 },
  ];

  const today = new Date();
  // The React page (CprDeadline interface) reads step_name, cpr_rule,
  // deadline_date, description.
  const deadlines = rules.map((r) => {
    const date = addDays(event, r.days);
    const daysRemaining = daysBetween(today, date);
    return {
      step_name: r.label,
      cpr_rule: 'CPR Pt. 12 / r.10.3', // generic reference; per-event lookup TBD
      deadline_date: date.toISOString().split('T')[0],
      description: `Falls ${r.days} day${r.days === 1 ? '' : 's'} after ${event_type.replace(/_/g, ' ')}.`,
      days_remaining: daysRemaining,
      urgency: urgencyOf(daysRemaining),
    };
  });

  res.json({
    event_type,
    event_date,
    deadlines,
  });
});

// POST /compliance/key-dates/pre-action — Calculate CPR pre-action protocol deadlines
const preActionCalcSchema = z.object({
  protocol_type: z.string(),
  letter_sent_date: z.string(),
});

// CPR pre-action protocols — most use a 14-day acknowledgement and a longer
// substantive response window. Defaults below are the typical published periods.
const PROTOCOL_RESPONSE_DAYS: Record<string, { ack: number; response: number; notes?: string }> = {
  personal_injury: { ack: 21, response: 90 },
  clinical_disputes: { ack: 14, response: 120 },
  professional_negligence: { ack: 21, response: 90 },
  debt_claims: { ack: 14, response: 30, notes: 'Debt Pre-Action Protocol for business creditors and individual debtors.' },
  judicial_review: { ack: 14, response: 14 },
  construction: { ack: 14, response: 28 },
  defamation: { ack: 14, response: 14 },
  housing_disrepair: { ack: 20, response: 20 },
  possession_claims: { ack: 0, response: 0, notes: 'Pre-action steps required before a possession claim by a social landlord — no fixed deadline.' },
  low_value_rta: { ack: 15, response: 30 },
  low_value_el_pl: { ack: 30, response: 90 },
  dilapidation: { ack: 56, response: 56 },
};

router.post('/compliance/key-dates/pre-action', authenticate, async (req: Request, res: Response) => {
  const parsed = preActionCalcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const { protocol_type, letter_sent_date } = parsed.data;
  const protocol = PRE_ACTION_PROTOCOLS.find((p) => p.id === protocol_type);
  if (!protocol) {
    res.status(400).json({ error: true, message: `Unknown protocol type: ${protocol_type}` });
    return;
  }
  const rules = PROTOCOL_RESPONSE_DAYS[protocol_type] ?? { ack: 14, response: 90 };
  const sent = new Date(letter_sent_date);
  if (Number.isNaN(sent.getTime())) {
    res.status(400).json({ error: true, message: 'Invalid letter_sent_date' });
    return;
  }
  const today = new Date();
  const ackDate = addDays(sent, rules.ack);
  const responseDate = addDays(sent, rules.response);
  const ackDaysRemaining = daysBetween(today, ackDate);
  const responseDaysRemaining = daysBetween(today, responseDate);

  // The React page (PreActionStep interface) reads step_name, deadline_date,
  // days_remaining, urgency. We surface the acknowledgement deadline and
  // substantive response deadline as two steps.
  const steps = [
    {
      step_name: 'Acknowledgement of receipt',
      deadline_date: ackDate.toISOString().split('T')[0],
      days_remaining: ackDaysRemaining,
      urgency: urgencyOf(ackDaysRemaining),
    },
    {
      step_name: 'Substantive response',
      deadline_date: responseDate.toISOString().split('T')[0],
      days_remaining: responseDaysRemaining,
      urgency: urgencyOf(responseDaysRemaining),
    },
  ];

  res.json({
    protocol_type: protocol.id,
    protocol_label: protocol.label,
    letter_sent_date,
    steps,
    notes: rules.notes ?? `Standard ${rules.response}-day response window for the ${protocol.label} pre-action protocol.`,
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  Persistence — save a calculated result as a tracked key date
// ─────────────────────────────────────────────────────────────────────────

// POST /compliance/key-dates/save
//
// Persists a calculator result as a tracked deadline. We write into the
// `deadlines` table (NOT `key_dates`) because the user-facing Deadlines page
// reads from `deadlines` — saving to `key_dates` would silently disappear.
// The `category` field carries the source ('limitation' | 'cpr' | 'pre-action'
// | other) so the Deadlines page can distinguish them visually.
const saveKeyDateSchema = z.object({
  title: z.string(),
  date: z.string(),
  category: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  // snake_case (frontend)
  assigned_to: z.string().optional(),
  // camelCase (legacy)
  assignedTo: z.string().optional(),
});

router.post('/compliance/key-dates/save', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = saveKeyDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }
    const { title, date, category, status, priority } = parsed.data;
    const assignedTo = parsed.data.assigned_to ?? parsed.data.assignedTo ?? null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: true, message: 'Invalid date' });
      return;
    }

    // Priority defaults derived from category — limitation/CPR are typically
    // high-stakes; pre-action protocols are medium unless overridden.
    const defaultPriority = category === 'limitation' ? 'high'
      : category === 'cpr' ? 'high'
      : 'medium';

    const deadline = await prisma.deadline.create({
      data: {
        firmId,
        title,
        dueDate: d,
        category: category || 'other',
        status: status || 'pending',
        priority: priority || defaultPriority,
        assignedTo,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'deadline_saved_from_key_dates',
      entityType: 'deadline',
      entityId: deadline.id,
      metadata: { title, category: category || 'other', source: 'key_dates_calculator' },
    });

    // Return the deadline shape the frontend expects (snake_case).
    res.status(201).json({
      id: deadline.id,
      title: deadline.title,
      due_date: deadline.dueDate,
      priority: deadline.priority,
      category: deadline.category,
      status: deadline.status,
      assigned_to: deadline.assignedTo,
      created_at: deadline.createdAt,
      updated_at: deadline.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to save deadline' });
  }
});

export default router;
