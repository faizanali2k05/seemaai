/**
 * Demo mode — realistic mock data for "Harrison Morgan Solicitors LLP".
 *
 * Activation: any time the auth token is the literal string `demo-token`.
 * This token is set ONLY by the "Try demo mode" button on the login page.
 * Real auth flows (real login, register, refresh) NEVER produce this token,
 * so a real signed-in firm will never see this data.
 *
 * Every page already branches on `isDemoMode()` and short-circuits before
 * any API call. Demo write actions mutate React state in-memory only — never
 * persist, never hit a real endpoint.
 *
 * Field shapes here mirror exactly what each consuming page expects, so the
 * UI renders the same way it would with a real backend response.
 */

// ── Activation guard ─────────────────────────────────────────────────────────
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('accessToken') === 'demo-token';
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date();
const daysFromNow = (n: number): string => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};
const daysFromNowDate = (n: number): string => daysFromNow(n).split('T')[0];

const DEMO_FIRM_ID = 'demo-firm-001';
const DEMO_FIRM_NAME = 'Harrison Morgan Solicitors LLP';

// ── Staff roster (used by /staff, /supervision, /chasers, briefings) ─────────
export const DEMO_STAFF = [
  { id: 'staff-001', name: 'Sarah Chen',         email: 'sarah.chen@harrisonmorgan.co.uk',     role: 'colp',        department: 'Compliance',    status: 'active', joined_date: '2019-03-15', last_supervision: daysFromNowDate(-25), next_supervision_due: daysFromNowDate(35), training_compliance: 100 },
  { id: 'staff-002', name: 'James Whitfield',    email: 'james.whitfield@harrisonmorgan.co.uk', role: 'cofa',        department: 'Accounts',      status: 'active', joined_date: '2017-08-01', last_supervision: daysFromNowDate(-15), next_supervision_due: daysFromNowDate(45), training_compliance: 100 },
  { id: 'staff-003', name: 'Priya Patel',        email: 'priya.patel@harrisonmorgan.co.uk',    role: 'partner',     department: 'Conveyancing',  status: 'active', joined_date: '2016-01-10', last_supervision: daysFromNowDate(-90), next_supervision_due: daysFromNowDate(-3),  training_compliance: 92  },
  { id: 'staff-004', name: 'Daniel Okafor',      email: 'daniel.okafor@harrisonmorgan.co.uk',  role: 'solicitor',   department: 'Litigation',    status: 'active', joined_date: '2021-06-22', last_supervision: daysFromNowDate(-45), next_supervision_due: daysFromNowDate(15), training_compliance: 75  },
  { id: 'staff-005', name: 'Emma Robertson',     email: 'emma.robertson@harrisonmorgan.co.uk', role: 'solicitor',   department: 'Family',        status: 'active', joined_date: '2020-11-04', last_supervision: daysFromNowDate(-100),next_supervision_due: daysFromNowDate(-12), training_compliance: 60  },
  { id: 'staff-006', name: 'Michael Chen',       email: 'michael.chen@harrisonmorgan.co.uk',   role: 'solicitor',   department: 'Commercial',    status: 'active', joined_date: '2022-02-14', last_supervision: daysFromNowDate(-30), next_supervision_due: daysFromNowDate(60), training_compliance: 100 },
  { id: 'staff-007', name: 'Hannah Lewis',       email: 'hannah.lewis@harrisonmorgan.co.uk',   role: 'paralegal',   department: 'Conveyancing',  status: 'active', joined_date: '2023-09-01', last_supervision: daysFromNowDate(-20), next_supervision_due: daysFromNowDate(70), training_compliance: 88  },
  { id: 'staff-008', name: 'Tom Bradley',        email: 'tom.bradley@harrisonmorgan.co.uk',    role: 'admin',       department: 'Operations',    status: 'active', joined_date: '2018-04-30', last_supervision: daysFromNowDate(-40), next_supervision_due: daysFromNowDate(50), training_compliance: 100 },
];

// ── Dashboard ────────────────────────────────────────────────────────────────
export const DEMO_DASHBOARD_STATS = {
  total_staff: DEMO_STAFF.length,
  open_alerts: 4,
  critical_alerts: 1,
  pending_tasks: 7,
  pending_intake: 3,
  open_breaches: 2,
};

export const DEMO_DASHBOARD_BRIEFING = {
  date: today().toISOString(),
  overdue_training: [
    { staff_id: 'staff-005', staff_name: 'Emma Robertson', title: 'AML Annual Refresher 2026', due_date: daysFromNowDate(-12), training_type: 'aml' },
    { staff_id: 'staff-004', staff_name: 'Daniel Okafor',  title: 'Data Protection & UK GDPR', due_date: daysFromNowDate(-3),  training_type: 'gdpr' },
  ],
  overdue_reviews: [
    { staff_id: 'staff-005', staff_name: 'Emma Robertson', case_id: 'M-2026-0142', due_date: daysFromNowDate(-7) },
  ],
  overdue_supervision: [
    { staff_id: 'staff-003', staff_name: 'Priya Patel',    next_due: daysFromNowDate(-3),  frequency: 'quarterly' },
    { staff_id: 'staff-005', staff_name: 'Emma Robertson', next_due: daysFromNowDate(-12), frequency: 'monthly'   },
  ],
  open_breaches: [
    { id: 'breach-001', title: 'Client account discrepancy — £4,200 unallocated', severity: 'high',     status: 'open' },
    { id: 'breach-002', title: 'Missed AML CDD review for high-risk client',       severity: 'critical', status: 'contained' },
  ],
  high_risk_intakes: [
    { id: 'intake-101', client_name: 'Apex Holdings Ltd',          risk_level: 'high', risk_score: 78 },
    { id: 'intake-102', client_name: 'Marlow Property Partners',   risk_level: 'high', risk_score: 71 },
    { id: 'intake-103', client_name: 'V. Konstantinov (PEP flag)', risk_level: 'high', risk_score: 84 },
  ],
  pending_regulatory_updates: [
    { id: 'reg-001', title: 'SRA Standards & Regulations — 2026 amendments',      source: 'SRA', impact_level: 'high',   published_date: daysFromNowDate(-4) },
    { id: 'reg-002', title: 'ICO guidance on AI-assisted client communications', source: 'ICO', impact_level: 'medium', published_date: daysFromNowDate(-9) },
  ],
  upcoming_deadlines: [
    { id: 'd-1', title: 'SRA Annual Return submission',         due_date: daysFromNowDate(18), priority: 'high',     assigned_to: 'Sarah Chen' },
    { id: 'd-2', title: 'PII renewal evidence pack',            due_date: daysFromNowDate(45), priority: 'medium',   assigned_to: 'James Whitfield' },
    { id: 'd-3', title: 'Limitation: Henderson v. Norwich BS',  due_date: daysFromNowDate(7),  priority: 'critical', assigned_to: 'Daniel Okafor' },
  ],
};

export const DEMO_DASHBOARD_FULL = DEMO_DASHBOARD_BRIEFING;

// ── Alerts (page expects: alert_type, acknowledged_by, status, severity) ─────
export const DEMO_ALERTS = [
  { id: 'alert-001', title: 'Critical: AML CDD overdue',         alert_type: 'aml',        category: 'aml',        severity: 'critical', status: 'open',         description: 'Marlow Property Partners — CDD review was due 5 days ago.',  created_at: daysFromNow(-5),  acknowledged_by: null,           assigned_to: 'Sarah Chen' },
  { id: 'alert-002', title: 'Client account variance',           alert_type: 'accounts',   category: 'accounts',   severity: 'high',     status: 'investigating',description: '£4,200 unallocated in client suspense ledger.',               created_at: daysFromNow(-2),  acknowledged_by: 'James Whitfield', assigned_to: 'James Whitfield' },
  { id: 'alert-003', title: 'Overdue file review',                alert_type: 'supervision',category: 'supervision',severity: 'medium',   status: 'open',         description: 'M-2026-0142 — supervisor sign-off pending 7 days.',            created_at: daysFromNow(-7),  acknowledged_by: null,           assigned_to: 'Priya Patel' },
  { id: 'alert-004', title: 'Regulatory update requires action', alert_type: 'regulatory', category: 'regulatory', severity: 'medium',   status: 'open',         description: 'SRA Standards 2026 — interpret & disseminate to staff.',      created_at: daysFromNow(-4),  acknowledged_by: null,           assigned_to: 'Sarah Chen' },
  { id: 'alert-005', title: 'Training overdue',                   alert_type: 'training',   category: 'training',   severity: 'high',     status: 'acknowledged', description: 'Emma Robertson — AML refresher 12 days past due.',            created_at: daysFromNow(-14), acknowledged_by: 'Sarah Chen',   assigned_to: 'Sarah Chen' },
];

// ── Breaches (page expects: ico_deadline, breach_type, status open|contained|notified|resolved) ──
export const DEMO_BREACHES = [
  { id: 'breach-001', title: 'Client account discrepancy — £4,200 unallocated', description: 'Suspense ledger reconciliation flagged £4,200 with no matching client matter. Investigation under SRA Accounts Rules 8.1.', breach_type: 'regulatory', severity: 'high',     status: 'open',      reported_date: daysFromNowDate(-3),  ico_deadline: daysFromNow(11),  notification_status: 'not_notified', affected_records: 0,    root_cause: null,                                        sra_reportable: true,  remediation_plan_id: 'rem-002' },
  { id: 'breach-002', title: 'Missed AML CDD review',                            description: 'Marlow Property Partners — annual CDD refresh missed due date. Caught at file audit.',                                       breach_type: 'regulatory', severity: 'critical', status: 'contained', reported_date: daysFromNowDate(-1),  ico_deadline: daysFromNow(13),  notification_status: 'notified',     affected_records: 1,    root_cause: 'Chase system disabled during system migration.', sra_reportable: true,  remediation_plan_id: 'rem-001' },
  { id: 'breach-003', title: 'Late filing — Court Form N244',                    description: 'Henderson v. Norwich BS — application notice filed 1 day late due to fee-earner annual leave handover gap.',              breach_type: 'conduct',    severity: 'medium',   status: 'resolved',  reported_date: daysFromNowDate(-22), ico_deadline: daysFromNow(-14), notification_status: 'not_notified', affected_records: 0,    root_cause: 'Annual leave handover gap.',                  sra_reportable: false, remediation_plan_id: null,         resolution_date: daysFromNow(-10) },
  { id: 'breach-004', title: 'Conflict-check skipped on conveyancing matter',    description: 'M-2026-0098 — onboarding bypassed conflict screening. No actual conflict identified. Process strengthened.',             breach_type: 'conduct',    severity: 'medium',   status: 'resolved',  reported_date: daysFromNowDate(-40), ico_deadline: daysFromNow(-30), notification_status: 'not_notified', affected_records: 0,    root_cause: 'Onboarding workflow misconfiguration.',        sra_reportable: false, remediation_plan_id: null,         resolution_date: daysFromNow(-20) },
];

// ── Undertakings ─────────────────────────────────────────────────────────────
export const DEMO_UNDERTAKINGS = [
  { id: 'und-001', direction: 'given',    description: 'To discharge first-charge mortgage on completion of M-2026-0142 (Henderson sale)', due_date: daysFromNowDate(7),  status: 'outstanding', given_to: 'Norwich Building Society',         given_by: 'Daniel Okafor', matter_ref: 'M-2026-0142', counterparty: 'Norwich Building Society', amount: 245000, currency: 'GBP', created_at: daysFromNow(-14) },
  { id: 'und-002', direction: 'given',    description: 'To register restriction at HMLR within 21 days of completion',                      due_date: daysFromNowDate(21), status: 'outstanding', given_to: 'Land Registry',                    given_by: 'Priya Patel',   matter_ref: 'M-2026-0098', counterparty: 'Land Registry',           amount: null,    currency: null,  created_at: daysFromNow(-7)  },
  { id: 'und-003', direction: 'received', description: 'To provide signed transfer documents within 14 days',                               due_date: daysFromNowDate(2),  status: 'outstanding', given_to: null,                              given_by: 'Roberts & Co Solicitors', matter_ref: 'M-2026-0156', counterparty: 'Roberts & Co Solicitors', amount: null, currency: null, created_at: daysFromNow(-12) },
  { id: 'und-004', direction: 'given',    description: 'To pay agreed settlement of £85,000 within 28 days',                                due_date: daysFromNowDate(-2), status: 'breached',     given_to: 'Hartwell Insurance Group',         given_by: 'Daniel Okafor', matter_ref: 'M-2025-0871', counterparty: 'Hartwell Insurance Group',amount: 85000, currency: 'GBP', created_at: daysFromNow(-30), breach_reason: 'Client funds clearance delay — undertaking extended to client; remediation in progress.' },
  { id: 'und-005', direction: 'given',    description: 'To file Defence by 28-day deadline',                                                due_date: daysFromNowDate(-15),status: 'fulfilled',    given_to: 'Court of England & Wales',         given_by: 'Daniel Okafor', matter_ref: 'M-2026-0023', counterparty: 'Court of England & Wales',amount: null, currency: null, created_at: daysFromNow(-43), fulfilled_date: daysFromNow(-15) },
  { id: 'und-006', direction: 'received', description: 'Buyer to transfer 10% deposit within 7 days of exchange',                            due_date: daysFromNowDate(-30),status: 'fulfilled',    given_to: null,                              given_by: 'Whitehall Conveyancing LLP', matter_ref: 'M-2025-0944', counterparty: 'Whitehall Conveyancing LLP', amount: 38500, currency: 'GBP', created_at: daysFromNow(-37), fulfilled_date: daysFromNow(-30) },
];

// ── Matters ──────────────────────────────────────────────────────────────────
export const DEMO_MATTERS = [
  { id: 'matter-001', matter_ref: 'M-2026-0142', client_name: 'Eleanor Henderson',           matter_type: 'conveyancing', fee_earner: 'Daniel Okafor', status: 'open',   created_at: daysFromNow(-21) },
  { id: 'matter-002', matter_ref: 'M-2026-0098', client_name: 'Marlow Property Partners',    matter_type: 'commercial',   fee_earner: 'Michael Chen',  status: 'open',   created_at: daysFromNow(-44) },
  { id: 'matter-003', matter_ref: 'M-2026-0156', client_name: 'Apex Holdings Ltd',           matter_type: 'commercial',   fee_earner: 'Michael Chen',  status: 'open',   created_at: daysFromNow(-9)  },
  { id: 'matter-004', matter_ref: 'M-2026-0023', client_name: 'Carter v. Whitestone Co.',    matter_type: 'litigation',   fee_earner: 'Daniel Okafor', status: 'open',   created_at: daysFromNow(-67) },
  { id: 'matter-005', matter_ref: 'M-2026-0211', client_name: 'Walker (matrimonial)',        matter_type: 'family',       fee_earner: 'Emma Robertson',status: 'open',   created_at: daysFromNow(-3)  },
  { id: 'matter-006', matter_ref: 'M-2025-0944', client_name: 'Whitehall Sale Completion',   matter_type: 'conveyancing', fee_earner: 'Priya Patel',   status: 'closed', created_at: daysFromNow(-90) },
  { id: 'matter-007', matter_ref: 'M-2025-0871', client_name: 'Hartwell Settlement',         matter_type: 'litigation',   fee_earner: 'Daniel Okafor', status: 'open',   created_at: daysFromNow(-100)},
  { id: 'matter-008', matter_ref: 'M-2026-0177', client_name: 'R v. Patel (criminal)',       matter_type: 'criminal',     fee_earner: 'Daniel Okafor', status: 'open',   created_at: daysFromNow(-11) },
];

// ── Conflicts (page expects: parties as "X vs Y" string + flagged_parties) ──
export const DEMO_CONFLICTS = [
  { id: 'cc-001', parties: 'Apex Holdings Ltd vs Bridgewater Partners',  client_name: 'Apex Holdings Ltd',    matter_ref: 'M-2026-0156', status: 'flagged', risk_level: 'medium', flagged_parties: [{ name: 'Apex Holdings Ltd',  reason: 'Previously acted for opposing party in 2023 (M-2023-0445).' }], checked_by: 'Sarah Chen',  checked_at: daysFromNow(-9),  resolution: null },
  { id: 'cc-002', parties: 'Eleanor Henderson vs Norwich Building Society', client_name: 'Eleanor Henderson', matter_ref: 'M-2026-0142', status: 'cleared', risk_level: 'low',    flagged_parties: [],                                                                                                                                                checked_by: 'Daniel Okafor', checked_at: daysFromNow(-21), resolution: 'No conflict identified — proceed.' },
  { id: 'cc-003', parties: 'Marlow Property Partners vs J. Marlow (personal)', client_name: 'Marlow Property Partners', matter_ref: 'M-2026-0098', status: 'flagged', risk_level: 'high', flagged_parties: [{ name: 'Marlow Property Partners', reason: 'Director (J. Marlow) is a current client on personal matter M-2025-0688.' }], checked_by: 'Sarah Chen', checked_at: daysFromNow(-44), resolution: null },
  { id: 'cc-004', parties: 'V. Konstantinov vs (intake — no opposing party)', client_name: 'V. Konstantinov', matter_ref: 'INTAKE-103', status: 'pending', risk_level: 'unknown', flagged_parties: [],                                                                                                                                                  checked_by: 'Sarah Chen',  checked_at: daysFromNow(-1),  resolution: null },
];

export const DEMO_CONFLICT_STATS = { total_checks: 47, flagged: 3, cleared: 42, pending: 2 };

// ── Complaints (page expects: client_name, category, description, received_date, severity, status, assigned_to) ──
export const DEMO_COMPLAINTS = [
  { id: 'comp-001', client_name: 'Mrs J. Henderson',          category: 'service_delay',   description: 'Delay in completion correspondence',           severity: 'medium', status: 'open',                received_date: daysFromNowDate(-10), assigned_to: 'Sarah Chen',     matter_ref: 'M-2026-0142', sla_due: daysFromNowDate(11),  escalated: false, channel: 'email',  outcome: null,    resolution: null },
  { id: 'comp-002', client_name: 'Mr A. Patel',                category: 'fee_dispute',     description: 'Fee dispute on conveyancing transaction',     severity: 'high',   status: 'investigating',       received_date: daysFromNowDate(-22), assigned_to: 'Priya Patel',     matter_ref: 'M-2025-0944', sla_due: daysFromNowDate(-1),  escalated: false, channel: 'phone',  outcome: null,    resolution: null },
  { id: 'comp-003', client_name: 'Hartwell Insurance Group',   category: 'service_quality', description: 'Service level breach',                          severity: 'high',   status: 'escalated_to_lego',   received_date: daysFromNowDate(-44), assigned_to: 'Sarah Chen',      matter_ref: 'M-2025-0871', sla_due: daysFromNowDate(-30), escalated: true,  channel: 'letter', outcome: null,    resolution: null },
  { id: 'comp-004', client_name: 'Mr T. Brennan',              category: 'communication',   description: 'Lack of responsiveness',                       severity: 'low',    status: 'closed',              received_date: daysFromNowDate(-90), assigned_to: 'Daniel Okafor',   matter_ref: 'M-2025-0712', sla_due: daysFromNowDate(-60), escalated: false, channel: 'email',  outcome: 'upheld',resolution: 'Apology letter sent, fee waiver of £150 offered and accepted.' },
  { id: 'comp-005', client_name: 'Walker (matrimonial)',       category: 'communication',   description: 'Communication frequency',                      severity: 'low',    status: 'closed',              received_date: daysFromNowDate(-65), assigned_to: 'Emma Robertson',  matter_ref: 'M-2025-0820', sla_due: daysFromNowDate(-35), escalated: false, channel: 'phone',  outcome: 'partially_upheld', resolution: 'Weekly update schedule agreed.' },
  { id: 'comp-006', client_name: 'Anonymous (intake form)',    category: 'service_quality', description: 'Unhappy with intake interview tone',           severity: 'low',    status: 'closed',              received_date: daysFromNowDate(-72), assigned_to: 'Sarah Chen',      matter_ref: null,           sla_due: daysFromNowDate(-42), escalated: false, channel: 'web',    outcome: 'not_upheld', resolution: 'Feedback shared with team. Training scheduled.' },
];

export const DEMO_COMPLAINT_STATS = { total: 6, open: 2, escalated_to_lego: 1, closed: 3, avg_resolution_days: 18 };

// ── AML — CDD & SAR ──────────────────────────────────────────────────────────
export const DEMO_AML_STATS = { total_cdd: 47, pending_review: 5, high_risk: 8, sars_filed_ytd: 2, sars_pending_mlro: 1, pep_matches: 1, sanctions_hits: 0 };

export const DEMO_CDD_RECORDS = [
  { id: 'cdd-001', client_name: 'Apex Holdings Ltd',           client_type: 'corporate', cdd_level: 'enhanced', risk_level: 'high',   status: 'incomplete', id_verified: true,  address_verified: true,  sof_verified: false, nationality: 'UK',     country_of_residence: 'United Kingdom', date_of_birth: '',          company_number: '12345678', pep_flag: false, sanctions_flag: false, source_of_funds: 'Corporate revenue',     countries_of_concern: [],          created_at: daysFromNow(-9),  updated_at: daysFromNow(-1),  reviewer: 'Sarah Chen' },
  { id: 'cdd-002', client_name: 'Marlow Property Partners',    client_type: 'corporate', cdd_level: 'enhanced', risk_level: 'high',   status: 'verified',   id_verified: true,  address_verified: true,  sof_verified: true,  nationality: 'UK',     country_of_residence: 'United Kingdom', date_of_birth: '',          company_number: '87654321', pep_flag: false, sanctions_flag: false, source_of_funds: 'Property portfolio',    countries_of_concern: [],          created_at: daysFromNow(-44), updated_at: daysFromNow(-44), reviewer: 'Sarah Chen' },
  { id: 'cdd-003', client_name: 'V. Konstantinov',             client_type: 'individual',cdd_level: 'enhanced', risk_level: 'high',   status: 'incomplete', id_verified: true,  address_verified: false, sof_verified: false, nationality: 'BY',     country_of_residence: 'United Kingdom', date_of_birth: '1971-04-12', company_number: '',         pep_flag: true,  sanctions_flag: false, source_of_funds: 'Inheritance',           countries_of_concern: ['RU','BY'], created_at: daysFromNow(-1),  updated_at: daysFromNow(-1),  reviewer: 'Sarah Chen' },
  { id: 'cdd-004', client_name: 'Eleanor Henderson',           client_type: 'individual',cdd_level: 'standard', risk_level: 'low',    status: 'verified',   id_verified: true,  address_verified: true,  sof_verified: true,  nationality: 'UK',     country_of_residence: 'United Kingdom', date_of_birth: '1962-09-03', company_number: '',         pep_flag: false, sanctions_flag: false, source_of_funds: 'Salary & savings',      countries_of_concern: [],          created_at: daysFromNow(-21), updated_at: daysFromNow(-21), reviewer: 'Daniel Okafor' },
  { id: 'cdd-005', client_name: 'Walker matrimonial',          client_type: 'individual',cdd_level: 'standard', risk_level: 'medium', status: 'verified',   id_verified: true,  address_verified: true,  sof_verified: true,  nationality: 'UK',     country_of_residence: 'United Kingdom', date_of_birth: '1978-12-19', company_number: '',         pep_flag: false, sanctions_flag: false, source_of_funds: 'Joint marital assets',  countries_of_concern: [],          created_at: daysFromNow(-3),  updated_at: daysFromNow(-3),  reviewer: 'Emma Robertson' },
];

export const DEMO_SAR_RECORDS = [
  { id: 'sar-001', subject: 'Apex Holdings Ltd — unusual transaction pattern', client_name: 'Apex Holdings Ltd', status: 'pending_mlro_review', filed_at: null,             created_at: daysFromNow(-2),  filer: 'Sarah Chen',     mlro_decision: null,        nca_reference: null,           narrative: 'Three large round-sum transfers to offshore accounts inconsistent with declared business activity.' },
  { id: 'sar-002', subject: 'V. Konstantinov — PEP source-of-funds concern',   client_name: 'V. Konstantinov',   status: 'submitted',           filed_at: daysFromNow(-30), created_at: daysFromNow(-32), filer: 'Sarah Chen',     mlro_decision: 'submit',    nca_reference: 'NCA-2026-04-1142', narrative: 'PEP-flagged client — inheritance documentation incomplete and inconsistent with declared assets.' },
  { id: 'sar-003', subject: 'Cash deposit £18,500 — anonymous source',          client_name: 'Anonymous receipt', status: 'closed',              filed_at: daysFromNow(-85), created_at: daysFromNow(-87), filer: 'James Whitfield',mlro_decision: 'no_submit', nca_reference: null,           narrative: 'Source clarified post-investigation — legitimate property sale proceeds. No SAR submitted.' },
];

// ── Accounts (page expects: client_account_balance top-level + nested data) ──
export const DEMO_ACCOUNTS = {
  client_account_balance: 2_847_320,
  office_account_balance: 184_250,
  designated_balance: 350_000,
  suspense_balance: 4_200,
  last_recon_date: daysFromNowDate(-2),
  open_variances: 1,
  recons_this_quarter: 12,
  stats: { client_balance: 2_847_320, office_balance: 184_250, suspense_balance: 4_200, last_recon_date: daysFromNowDate(-2), open_variances: 1, recons_this_quarter: 12 },
  accounts: [
    { id: 'acc-001', name: 'Client Account — Barclays',     type: 'client',     balance: 2_847_320, currency: 'GBP', sort_code: '20-12-34', last_recon: daysFromNowDate(-2), status: 'reconciled' },
    { id: 'acc-002', name: 'Office Account — Barclays',     type: 'office',     balance: 184_250,   currency: 'GBP', sort_code: '20-12-34', last_recon: daysFromNowDate(-2), status: 'reconciled' },
    { id: 'acc-003', name: 'Designated Deposit — Apex',     type: 'designated', balance: 350_000,   currency: 'GBP', sort_code: '20-12-34', last_recon: daysFromNowDate(-2), status: 'reconciled' },
    { id: 'acc-004', name: 'Suspense Ledger',                type: 'suspense',  balance: 4_200,     currency: 'GBP', sort_code: '20-12-34', last_recon: daysFromNowDate(-2), status: 'variance' },
  ],
  reconciliations: [
    { id: 'rec-001', period_end: daysFromNowDate(-2),  status: 'cofa_signoff_pending', client_balance: 2_847_320, office_balance: 184_250, variance: 4_200, prepared_by: 'James Whitfield', prepared_at: daysFromNow(-1),  signed_off_by: null,           signed_off_at: null },
    { id: 'rec-002', period_end: daysFromNowDate(-32), status: 'signed_off',           client_balance: 2_790_445, office_balance: 178_900, variance: 0,     prepared_by: 'James Whitfield', prepared_at: daysFromNow(-31), signed_off_by: 'James Whitfield', signed_off_at: daysFromNow(-30) },
    { id: 'rec-003', period_end: daysFromNowDate(-62), status: 'signed_off',           client_balance: 2_654_180, office_balance: 196_700, variance: 0,     prepared_by: 'James Whitfield', prepared_at: daysFromNow(-61), signed_off_by: 'James Whitfield', signed_off_at: daysFromNow(-60) },
  ],
};

export const DEMO_ACCOUNT_TRANSACTIONS = [
  { id: 'tx-001', date: daysFromNowDate(-1), description: 'Henderson — sale proceeds in',                amount: 245_000,  type: 'credit', matter_ref: 'M-2026-0142', balance_after: 2_847_320 },
  { id: 'tx-002', date: daysFromNowDate(-2), description: 'Norwich BS — mortgage redemption out',         amount: -198_400, type: 'debit',  matter_ref: 'M-2026-0142', balance_after: 2_602_320 },
  { id: 'tx-003', date: daysFromNowDate(-3), description: 'Apex — designated deposit',                    amount: 350_000,  type: 'credit', matter_ref: 'M-2026-0156', balance_after: 2_800_720 },
  { id: 'tx-004', date: daysFromNowDate(-5), description: 'Suspense — unallocated receipt',                amount: 4_200,    type: 'credit', matter_ref: null,            balance_after: 2_450_720 },
];

// ── Evidence (page expects: evidence_type, verified, description) ────────────
export const DEMO_EVIDENCE = [
  { id: 'ev-001', title: 'AML Policy v3.2 — board-approved',          evidence_type: 'policy',     description: 'Board-approved AML policy aligned with MLR 2017 (as amended).',     verified: true,  uploaded_by: 'Sarah Chen',     uploaded_at: daysFromNow(-30), file_type: 'pdf',  size_bytes: 482_300, verified_by: 'Sarah Chen',     verified_at: daysFromNow(-30), tags: ['aml','policy','board-approved'] },
  { id: 'ev-002', title: 'PII Certificate 2026',                      evidence_type: 'insurance',  description: 'Professional Indemnity Insurance certificate, £3M cover.',          verified: true,  uploaded_by: 'James Whitfield', uploaded_at: daysFromNow(-60), file_type: 'pdf',  size_bytes: 198_400, verified_by: 'James Whitfield', verified_at: daysFromNow(-60), tags: ['pii','insurance'] },
  { id: 'ev-003', title: 'Client account reconciliation — March 2026',evidence_type: 'accounts',   description: 'Monthly client account reconciliation, COFA-signed.',                verified: true,  uploaded_by: 'James Whitfield', uploaded_at: daysFromNow(-30), file_type: 'pdf',  size_bytes: 312_800, verified_by: 'James Whitfield', verified_at: daysFromNow(-30), tags: ['accounts','reconciliation','sra'] },
  { id: 'ev-004', title: 'Staff training register — Q1 2026',         evidence_type: 'training',   description: 'AML, GDPR, and SRA training register with completion certificates.',verified: true,  uploaded_by: 'Sarah Chen',     uploaded_at: daysFromNow(-45), file_type: 'xlsx', size_bytes: 87_200,  verified_by: 'Sarah Chen',     verified_at: daysFromNow(-45), tags: ['training','aml','gdpr'] },
  { id: 'ev-005', title: 'Henderson — completion statement',          evidence_type: 'matter',     description: 'Completion statement for M-2026-0142 (Henderson sale).',             verified: false, uploaded_by: 'Daniel Okafor',  uploaded_at: daysFromNow(-1),  file_type: 'pdf',  size_bytes: 124_900, verified_by: null,             verified_at: null,             tags: ['matter','M-2026-0142'] },
  { id: 'ev-006', title: 'COLP attestation — Sarah Chen',              evidence_type: 'governance', description: 'Annual COLP attestation under SRA reporting requirements.',          verified: true,  uploaded_by: 'Sarah Chen',     uploaded_at: daysFromNow(-90), file_type: 'pdf',  size_bytes: 98_400,  verified_by: 'Sarah Chen',     verified_at: daysFromNow(-90), tags: ['governance','colp'] },
];

// ── Chasers ──────────────────────────────────────────────────────────────────
export const DEMO_CHASERS = [
  { id: 'chase-001', recipient_id: 'staff-005', recipient_name: 'Emma Robertson', recipient_email: 'emma.robertson@harrisonmorgan.co.uk', subject: 'Overdue: AML Annual Refresher 2026',     status: 'pending',      chase_type: 'training',    created_at: daysFromNow(-12), last_sent: daysFromNow(-1), acknowledged_at: null,           escalated: false, escalation_count: 1, response: null },
  { id: 'chase-002', recipient_id: 'staff-004', recipient_name: 'Daniel Okafor',  recipient_email: 'daniel.okafor@harrisonmorgan.co.uk',  subject: 'Overdue: Data Protection & UK GDPR',     status: 'acknowledged', chase_type: 'training',    created_at: daysFromNow(-3),  last_sent: daysFromNow(-3), acknowledged_at: daysFromNow(-1), escalated: false, escalation_count: 0, response: 'Will complete by Friday.' },
  { id: 'chase-003', recipient_id: 'staff-003', recipient_name: 'Priya Patel',    recipient_email: 'priya.patel@harrisonmorgan.co.uk',    subject: 'Overdue: Quarterly supervision session', status: 'pending',      chase_type: 'supervision', created_at: daysFromNow(-3),  last_sent: daysFromNow(0),  acknowledged_at: null,           escalated: true,  escalation_count: 2, response: null },
  { id: 'chase-004', recipient_id: 'staff-005', recipient_name: 'Emma Robertson', recipient_email: 'emma.robertson@harrisonmorgan.co.uk', subject: 'Overdue: File review M-2026-0142',      status: 'pending',      chase_type: 'review',      created_at: daysFromNow(-7),  last_sent: daysFromNow(-2), acknowledged_at: null,           escalated: false, escalation_count: 1, response: null },
];

// ── Compliance scan (page expects: id, scanned_at, score, categories[]) ──────
export const DEMO_SCAN_RESULTS = {
  id: 'scan-2026-04',
  scanned_at: daysFromNow(-1),
  score: 87,
  total_issues: 5,
  categories: [
    { name: 'AML',         status: 'pass',    count: 0, issues: [] },
    { name: 'Supervision', status: 'fail',    count: 2, issues: ['Priya Patel — quarterly session 3 days overdue', 'Emma Robertson — monthly session 12 days overdue'] },
    { name: 'Accounts',    status: 'fail',    count: 1, issues: ['Suspense ledger — £4,200 unallocated more than 5 days'] },
    { name: 'Training',    status: 'warning', count: 2, issues: ['Emma Robertson — AML refresher overdue', 'Daniel Okafor — GDPR training overdue'] },
    { name: 'GDPR',        status: 'pass',    count: 0, issues: [] },
    { name: 'Governance',  status: 'pass',    count: 0, issues: [] },
    { name: 'Conflicts',   status: 'pass',    count: 0, issues: [] },
  ],
};

export const DEMO_COMPLIANCE_CHECKS = [
  { id: 'check-aml',         check_type: 'aml',         name: 'AML CDD coverage',                       status: 'pass', score: 94,  last_run: daysFromNow(-1), issues: 0, severity: 'ok' },
  { id: 'check-supervision', check_type: 'supervision', name: 'Supervision schedule adherence',         status: 'fail', score: 72,  last_run: daysFromNow(-1), issues: 2, severity: 'medium' },
  { id: 'check-accounts',    check_type: 'accounts',    name: 'Client account reconciliation cadence', status: 'fail', score: 88,  last_run: daysFromNow(-1), issues: 1, severity: 'high' },
  { id: 'check-training',    check_type: 'training',    name: 'Staff training completeness',           status: 'fail', score: 79,  last_run: daysFromNow(-1), issues: 2, severity: 'medium' },
  { id: 'check-gdpr',        check_type: 'gdpr',        name: 'UK GDPR data-handling controls',         status: 'pass', score: 96,  last_run: daysFromNow(-1), issues: 0, severity: 'ok' },
  { id: 'check-evidence',    check_type: 'governance',  name: 'Evidence vault — required attestations',status: 'pass', score: 100, last_run: daysFromNow(-1), issues: 0, severity: 'ok' },
  { id: 'check-conflicts',   check_type: 'conflicts',   name: 'Conflict checks completed at intake',    status: 'pass', score: 100, last_run: daysFromNow(-1), issues: 0, severity: 'ok' },
];

export const DEMO_RISK_SCORES = {
  overall: 87,
  by_category: [
    { category: 'AML',         score: 94 },
    { category: 'Supervision', score: 72 },
    { category: 'Accounts',    score: 88 },
    { category: 'Training',    score: 79 },
    { category: 'GDPR',        score: 96 },
    { category: 'Governance',  score: 100 },
  ],
  trend: [
    { date: daysFromNowDate(-180), score: 68 },
    { date: daysFromNowDate(-150), score: 72 },
    { date: daysFromNowDate(-120), score: 75 },
    { date: daysFromNowDate(-90),  score: 78 },
    { date: daysFromNowDate(-60),  score: 82 },
    { date: daysFromNowDate(-30),  score: 85 },
    { date: daysFromNowDate(0),    score: 87 },
  ],
};

// ── SRA Return ───────────────────────────────────────────────────────────────
export const DEMO_SRA_RETURN = {
  reporting_period: '2025-04-01 to 2026-03-31',
  status: 'draft',
  firm_id: DEMO_FIRM_ID,
  firm_name: DEMO_FIRM_NAME,
  sra_number: '654321',
  sections: {
    firm_details:        { complete: true,  fields: 18, completed: 18 },
    work_areas:          { complete: true,  fields: 12, completed: 12 },
    fees_and_finance:    { complete: false, fields: 22, completed: 19 },
    insurance:           { complete: true,  fields: 8,  completed: 8  },
    money_laundering:    { complete: true,  fields: 14, completed: 14 },
    diversity:           { complete: false, fields: 9,  completed: 6  },
    complaints:          { complete: true,  fields: 6,  completed: 6  },
  },
  total_fields: 89,
  completed_fields: 83,
  validation_errors: 2,
  warnings: 1,
  due_date: daysFromNowDate(18),
  last_saved: daysFromNow(-1),
};

// ── SRA Audit pack ───────────────────────────────────────────────────────────
export const DEMO_SRA_AUDIT_ITEMS = [
  { id: 'audit-1', category: 'AML',         title: 'AML Policy & Risk Assessment',                 status: 'complete',    evidence_count: 4,  last_updated: daysFromNow(-30), required: true },
  { id: 'audit-2', category: 'AML',         title: 'CDD records — sample of 25 files',             status: 'complete',    evidence_count: 25, last_updated: daysFromNow(-7),  required: true },
  { id: 'audit-3', category: 'Accounts',    title: 'Client account reconciliations (12 months)',  status: 'in_progress', evidence_count: 11, last_updated: daysFromNow(-2),  required: true },
  { id: 'audit-4', category: 'Training',    title: 'Staff training register & certificates',       status: 'in_progress', evidence_count: 22, last_updated: daysFromNow(-5),  required: true },
  { id: 'audit-5', category: 'Supervision', title: 'Supervision logs (12 months)',                 status: 'gap',         evidence_count: 8,  last_updated: daysFromNow(-15), required: true },
  { id: 'audit-6', category: 'Complaints',  title: 'Complaints register & resolution evidence',    status: 'complete',    evidence_count: 6,  last_updated: daysFromNow(-10), required: true },
  { id: 'audit-7', category: 'Governance',  title: 'COLP/COFA attestations',                       status: 'complete',    evidence_count: 2,  last_updated: daysFromNow(-90), required: true },
  { id: 'audit-8', category: 'PII',         title: 'PII certificate & policy schedule',            status: 'complete',    evidence_count: 1,  last_updated: daysFromNow(-60), required: true },
];

// ── Audit trail (page expects: user_name, entity_type, entity_id, details) ──
export const DEMO_AUDIT_TRAIL = [
  { id: 'log-001', timestamp: daysFromNow(-3),  user_name: 'Sarah Chen',     action: 'Created',  entity_type: 'breach',          entity_id: 'breach-001', details: 'Reported high-severity breach: Client account discrepancy.' },
  { id: 'log-002', timestamp: daysFromNow(-30), user_name: 'James Whitfield', action: 'Approved', entity_type: 'reconciliation',  entity_id: 'rec-002',    details: 'COFA sign-off on March 2026 reconciliation.' },
  { id: 'log-003', timestamp: daysFromNow(-2),  user_name: 'Sarah Chen',     action: 'Created',  entity_type: 'sar',             entity_id: 'sar-001',    details: 'New SAR drafted: Apex Holdings — unusual transaction pattern.' },
  { id: 'log-004', timestamp: daysFromNow(-21), user_name: 'Daniel Okafor',  action: 'Created',  entity_type: 'matter',          entity_id: 'matter-001', details: 'Opened matter M-2026-0142 (Henderson conveyancing).' },
  { id: 'log-005', timestamp: daysFromNow(-30), user_name: 'Sarah Chen',     action: 'Updated',  entity_type: 'policy',          entity_id: 'policy-001', details: 'Published AML Policy v3.2.' },
  { id: 'log-006', timestamp: daysFromNow(-7),  user_name: 'Priya Patel',    action: 'Created',  entity_type: 'undertaking',     entity_id: 'und-002',    details: 'Registered undertaking to HMLR for matter M-2026-0098.' },
  { id: 'log-007', timestamp: daysFromNow(-12), user_name: 'Sarah Chen',     action: 'Updated',  entity_type: 'user',            entity_id: 'staff-007',  details: 'Changed role from admin to paralegal.' },
  { id: 'log-008', timestamp: daysFromNow(-1),  user_name: 'system',         action: 'Executed', entity_type: 'compliance_scan', entity_id: 'scan-2026-04', details: 'Automated daily compliance scan — score 87/100.' },
];

export const DEMO_AUDIT_TRAIL_SUMMARY = { total_events: 1_247, events_today: 12, events_this_week: 84, by_category: { auth: 320, compliance: 412, accounts: 188, admin: 167, system: 160 } };

// ── Audit reports ────────────────────────────────────────────────────────────
export const DEMO_AUDIT_REPORTS = [
  { id: 'rep-001', title: 'Q1 2026 Compliance Audit',           type: 'quarterly',  status: 'finalized', period: '2026-01-01 to 2026-03-31', generated_at: daysFromNow(-25), generated_by: 'Sarah Chen',      size_bytes: 2_840_000, format: 'pdf', sections: 8 },
  { id: 'rep-002', title: 'AML Annual Review 2025/26',          type: 'annual',     status: 'finalized', period: '2025-04-01 to 2026-03-31', generated_at: daysFromNow(-12), generated_by: 'Sarah Chen',      size_bytes: 1_920_000, format: 'pdf', sections: 6 },
  { id: 'rep-003', title: 'PII Renewal Evidence Pack',          type: 'ad_hoc',     status: 'draft',     period: '2025-04-01 to 2026-03-31', generated_at: daysFromNow(-2),  generated_by: 'James Whitfield', size_bytes: 0,         format: 'pdf', sections: 4 },
];

// ── Regulatory updates ───────────────────────────────────────────────────────
export const DEMO_REGULATORY_UPDATES = [
  { id: 'reg-001', title: 'SRA Standards & Regulations — 2026 amendments',         source: 'SRA',     impact_level: 'high',   published_date: daysFromNow(-4),  description: 'New rules on AI-assisted client communications, increased CDD obligations for property work, and revised reporting cadence for material breaches.', regulatory_body: 'Solicitors Regulation Authority',  acknowledged: false, override_reasoning: null,  url: 'https://www.sra.org.uk/' },
  { id: 'reg-002', title: 'ICO guidance on AI-assisted client communications',     source: 'ICO',     impact_level: 'medium', published_date: daysFromNow(-9),  description: 'Updated guidance on transparency obligations when using AI to draft client correspondence under UK GDPR Article 22.',                                regulatory_body: "Information Commissioner's Office", acknowledged: false, override_reasoning: null, url: 'https://ico.org.uk/' },
  { id: 'reg-003', title: 'Law Society practice note: Sanctions screening',         source: 'LawSoc', impact_level: 'medium', published_date: daysFromNow(-18), description: 'Updated practice note clarifying expectations for ongoing sanctions screening across the matter lifecycle.',                                       regulatory_body: 'The Law Society',                  acknowledged: true,  override_reasoning: null, url: 'https://www.lawsociety.org.uk/' },
  { id: 'reg-004', title: 'HMRC Trust Registration — extended deadlines',           source: 'gov.uk', impact_level: 'low',    published_date: daysFromNow(-25), description: 'HMRC has extended Trust Registration Service deadlines for express trusts created in Q4 2025.',                                                  regulatory_body: 'HM Revenue & Customs',             acknowledged: true,  override_reasoning: 'Not applicable to firm — no trust work.', url: 'https://www.gov.uk/' },
  { id: 'reg-005', title: 'SRA Accounts Rules — variance reporting clarification', source: 'SRA',     impact_level: 'high',   published_date: daysFromNow(-32), description: 'Clarification on COFA reporting obligations when client account variances are identified mid-month rather than at reconciliation.',              regulatory_body: 'Solicitors Regulation Authority',  acknowledged: true,  override_reasoning: null, url: 'https://www.sra.org.uk/' },
];

export const DEMO_INTERPRETATION_HISTORY = [
  { id: 'int-001', regulatory_update_id: 'reg-003', interpreted_at: daysFromNow(-15), interpreted_by: 'AI + Sarah Chen', summary: 'Sanctions screening must continue throughout matter lifecycle, not just at intake. Affects 4 internal processes.', actions_recommended: 3, actions_completed: 3 },
  { id: 'int-002', regulatory_update_id: 'reg-005', interpreted_at: daysFromNow(-30), interpreted_by: 'AI + Sarah Chen', summary: 'COFA must report mid-month variances >£500 to SRA within 5 working days.',                                  actions_recommended: 2, actions_completed: 2 },
];

// ── Key dates ────────────────────────────────────────────────────────────────
export const DEMO_KEY_DATES = [
  { id: 'kd-001', title: 'Limitation: Henderson v. Norwich BS',           matter_ref: 'M-2026-0142', deadline_type: 'limitation',  due_date: daysFromNowDate(7),  urgency: 'critical', assigned_to: 'Daniel Okafor', notes: 'Tort claim — 6-year limitation, expires next week.' },
  { id: 'kd-002', title: 'Defence filing — Carter v. Whitestone',          matter_ref: 'M-2026-0023', deadline_type: 'cpr',         due_date: daysFromNowDate(14), urgency: 'warning',  assigned_to: 'Daniel Okafor', notes: 'CPR 15.4 — 28 days from acknowledgement.' },
  { id: 'kd-003', title: 'Pre-action protocol response — Brennan complaint',matter_ref: null,        deadline_type: 'pre_action',  due_date: daysFromNowDate(35), urgency: 'ok',       assigned_to: 'Sarah Chen',    notes: 'Professional negligence pre-action protocol.' },
  { id: 'kd-004', title: 'SRA Annual Return',                              matter_ref: null,         deadline_type: 'regulatory',  due_date: daysFromNowDate(18), urgency: 'warning',  assigned_to: 'Sarah Chen',    notes: 'Annual return submission window closes.' },
];

// ── Remediation ──────────────────────────────────────────────────────────────
export const DEMO_REMEDIATION = [
  { id: 'rem-001', title: 'Strengthen AML CDD chase cadence',         status: 'in_progress', priority: 'high',   created_at: daysFromNow(-12), completed_steps: 3, total_steps: 5, owner: 'Sarah Chen',     trigger: 'breach-002', steps: [
    { id: 'step-1a', description: 'Review current chase frequency settings',           completed: true,  completed_at: daysFromNow(-11) },
    { id: 'step-1b', description: 'Re-enable automated CDD chase workflow',            completed: true,  completed_at: daysFromNow(-11) },
    { id: 'step-1c', description: 'Backfill missed reviews from last 90 days',         completed: true,  completed_at: daysFromNow(-7)  },
    { id: 'step-1d', description: 'Update AML SOP v3.3 with chase cadence requirement',completed: false, completed_at: null },
    { id: 'step-1e', description: 'Brief MLRO on new cadence and report to board',     completed: false, completed_at: null },
  ]},
  { id: 'rem-002', title: 'Resolve client account suspense variance', status: 'in_progress', priority: 'high',   created_at: daysFromNow(-3),  completed_steps: 1, total_steps: 4, owner: 'James Whitfield', trigger: 'breach-001', steps: [
    { id: 'step-2a', description: 'Trace receipt to source bank',     completed: true,  completed_at: daysFromNow(-2) },
    { id: 'step-2b', description: 'Match to open matter',             completed: false, completed_at: null },
    { id: 'step-2c', description: 'Allocate or refund within 5 days', completed: false, completed_at: null },
    { id: 'step-2d', description: 'COFA sign-off and audit log',      completed: false, completed_at: null },
  ]},
  { id: 'rem-003', title: 'Supervision schedule — Priya & Emma',     status: 'completed',   priority: 'medium', created_at: daysFromNow(-30), completed_steps: 3, total_steps: 3, owner: 'Sarah Chen',     trigger: 'check-supervision', steps: [
    { id: 'step-3a', description: 'Schedule overdue sessions',       completed: true, completed_at: daysFromNow(-20) },
    { id: 'step-3b', description: 'Conduct sessions',                completed: true, completed_at: daysFromNow(-2)  },
    { id: 'step-3c', description: 'Document outcomes and follow-up', completed: true, completed_at: daysFromNow(-1)  },
  ]},
];

// ── Supervision (page expects: supervisor_id) ────────────────────────────────
export const DEMO_SUPERVISION = [
  { id: 'sup-001', staff_id: 'staff-003', staff_name: 'Priya Patel',    supervisor_id: 'staff-001', supervisor_name: 'Sarah Chen', frequency: 'quarterly', last_session: daysFromNow(-90),  next_due: daysFromNow(-3),  status: 'overdue',   notes: 'Last session covered AML CDD process improvements.' },
  { id: 'sup-002', staff_id: 'staff-005', staff_name: 'Emma Robertson', supervisor_id: 'staff-001', supervisor_name: 'Sarah Chen', frequency: 'monthly',   last_session: daysFromNow(-100), next_due: daysFromNow(-12), status: 'overdue',   notes: 'Family law file management review needed.' },
  { id: 'sup-003', staff_id: 'staff-004', staff_name: 'Daniel Okafor',  supervisor_id: 'staff-001', supervisor_name: 'Sarah Chen', frequency: 'monthly',   last_session: daysFromNow(-45),  next_due: daysFromNow(15),  status: 'scheduled', notes: '' },
  { id: 'sup-004', staff_id: 'staff-006', staff_name: 'Michael Chen',   supervisor_id: 'staff-001', supervisor_name: 'Sarah Chen', frequency: 'quarterly', last_session: daysFromNow(-30),  next_due: daysFromNow(60),  status: 'on_track',  notes: '' },
  { id: 'sup-005', staff_id: 'staff-007', staff_name: 'Hannah Lewis',   supervisor_id: 'staff-003', supervisor_name: 'Priya Patel', frequency: 'monthly',  last_session: daysFromNow(-20),  next_due: daysFromNow(10),  status: 'on_track',  notes: 'Trainee — extra mentoring schedule.' },
];

export const DEMO_SUPERVISION_OVERDUE = DEMO_SUPERVISION.filter(s => s.status === 'overdue');

// ── Training ─────────────────────────────────────────────────────────────────
export const DEMO_TRAINING = [
  { id: 'tr-001', staff_id: 'staff-005', staff_name: 'Emma Robertson', training_type: 'aml',                  title: 'AML Annual Refresher 2026',  status: 'overdue',     due_date: daysFromNowDate(-12), completed_at: null },
  { id: 'tr-002', staff_id: 'staff-004', staff_name: 'Daniel Okafor',  training_type: 'gdpr',                 title: 'Data Protection & UK GDPR',  status: 'overdue',     due_date: daysFromNowDate(-3),  completed_at: null },
  { id: 'tr-003', staff_id: 'staff-001', staff_name: 'Sarah Chen',     training_type: 'aml',                  title: 'AML Annual Refresher 2026',  status: 'completed',   due_date: daysFromNowDate(120), completed_at: daysFromNow(-15) },
  { id: 'tr-004', staff_id: 'staff-002', staff_name: 'James Whitfield',training_type: 'sra_accounts',         title: 'SRA Accounts Rules 2025',    status: 'completed',   due_date: daysFromNowDate(80),  completed_at: daysFromNow(-5)  },
  { id: 'tr-005', staff_id: 'staff-003', staff_name: 'Priya Patel',    training_type: 'conveyancing_quality', title: 'CQS Annual Update',          status: 'in_progress', due_date: daysFromNowDate(20),  completed_at: null },
];

// ── Policies (page expects: policy_type, status: Published|Draft|Under Review) ──
export const DEMO_POLICIES = [
  { id: 'policy-001', title: 'AML Policy',                            policy_type: 'AML',         category: 'aml',         version: 'v3.2', status: 'Published',    last_review: daysFromNowDate(-30),  next_review: daysFromNowDate(335), owner: 'Sarah Chen',     approved_by: 'Board', approved_at: daysFromNow(-30)  },
  { id: 'policy-002', title: 'Data Protection & UK GDPR Policy',       policy_type: 'GDPR',        category: 'gdpr',        version: 'v2.1', status: 'Published',    last_review: daysFromNowDate(-90),  next_review: daysFromNowDate(275), owner: 'Sarah Chen',     approved_by: 'Board', approved_at: daysFromNow(-90)  },
  { id: 'policy-003', title: 'Conflict of Interest Policy',           policy_type: 'Conflicts',   category: 'conflicts',   version: 'v1.4', status: 'Published',    last_review: daysFromNowDate(-180), next_review: daysFromNowDate(185), owner: 'Sarah Chen',     approved_by: 'Board', approved_at: daysFromNow(-180) },
  { id: 'policy-004', title: 'Complaints Handling Procedure',          policy_type: 'Complaints', category: 'complaints',  version: 'v2.0', status: 'Published',    last_review: daysFromNowDate(-150), next_review: daysFromNowDate(215), owner: 'Sarah Chen',     approved_by: 'Board', approved_at: daysFromNow(-150) },
  { id: 'policy-005', title: 'Client Account Operating Procedure',     policy_type: 'Accounts',   category: 'accounts',    version: 'v3.0', status: 'Published',    last_review: daysFromNowDate(-60),  next_review: daysFromNowDate(305), owner: 'James Whitfield',approved_by: 'Board', approved_at: daysFromNow(-60)  },
  { id: 'policy-006', title: 'Information Security Policy',            policy_type: 'Security',   category: 'security',    version: 'v2.3', status: 'Under Review', last_review: daysFromNowDate(-365), next_review: daysFromNowDate(0),   owner: 'Sarah Chen',     approved_by: null,    approved_at: null },
  { id: 'policy-007', title: 'Remote Working & BYOD Policy',           policy_type: 'Security',   category: 'security',    version: 'v1.0', status: 'Draft',        last_review: null,                  next_review: daysFromNowDate(30),  owner: 'Sarah Chen',     approved_by: null,    approved_at: null },
];

export const DEMO_POLICY_VERSIONS = [
  { id: 'pv-001', policy_id: 'policy-001', version: 'v3.2', published_at: daysFromNow(-30),  published_by: 'Sarah Chen', changes: 'Added AI-assisted CDD obligations; tightened source-of-funds for property work.' },
  { id: 'pv-002', policy_id: 'policy-001', version: 'v3.1', published_at: daysFromNow(-200), published_by: 'Sarah Chen', changes: 'Sanctions list ongoing-screening clarification.' },
  { id: 'pv-003', policy_id: 'policy-001', version: 'v3.0', published_at: daysFromNow(-365), published_by: 'Sarah Chen', changes: 'Major revision aligned with MLR 2017 (as amended).' },
];

// ── Notifications (NotificationBell) ─────────────────────────────────────────
export const DEMO_NOTIFICATIONS = {
  notifications: [
    { id: 'n-001', type: 'aml',         severity: 'critical', title: 'Critical AML alert — Marlow CDD overdue', entity_id: 'cdd-002', entity_type: 'case',        created_at: daysFromNow(-1)  },
    { id: 'n-002', type: 'regulatory',  severity: 'high',     title: 'New SRA Standards 2026 amendments',        entity_id: 'reg-001', entity_type: 'case',        created_at: daysFromNow(-4)  },
    { id: 'n-003', type: 'accounts',    severity: 'medium',   title: 'Reconciliation pending COFA sign-off',     entity_id: 'rec-001', entity_type: 'case',        created_at: daysFromNow(-1)  },
    { id: 'n-004', type: 'training',    severity: 'high',     title: 'Emma Robertson — AML refresher overdue',   entity_id: 'staff-005', entity_type: 'staff',     created_at: daysFromNow(-10) },
    { id: 'n-005', type: 'system',      severity: 'low',      title: 'Compliance scan complete — score 87/100',  entity_id: 'scan-2026-04', entity_type: 'case',   created_at: daysFromNow(-1)  },
  ],
  total: 5,
};

// ── Intake ───────────────────────────────────────────────────────────────────
export const DEMO_INTAKES = [
  { id: 'intake-101', client_name: 'Apex Holdings Ltd',            risk_level: 'high',   risk_score: 78, status: 'pending_review', created_at: daysFromNow(-9),  referred_by: 'Direct',          matter_type: 'commercial',     pep_flag: false, assigned_to: 'Sarah Chen',  cdd_status: 'in_progress' },
  { id: 'intake-102', client_name: 'Marlow Property Partners',     risk_level: 'high',   risk_score: 71, status: 'in_progress',    created_at: daysFromNow(-44), referred_by: 'Existing client', matter_type: 'commercial',     pep_flag: false, assigned_to: 'Sarah Chen',  cdd_status: 'completed' },
  { id: 'intake-103', client_name: 'V. Konstantinov (PEP flag)',   risk_level: 'high',   risk_score: 84, status: 'pending_review', created_at: daysFromNow(-1),  referred_by: 'Walk-in',          matter_type: 'private_client', pep_flag: true,  assigned_to: 'Sarah Chen',  cdd_status: 'in_progress' },
  { id: 'intake-104', client_name: 'Walker (matrimonial)',         risk_level: 'medium', risk_score: 42, status: 'cleared',        created_at: daysFromNow(-3),  referred_by: 'Referral',         matter_type: 'family',         pep_flag: false, assigned_to: 'Emma Robertson', cdd_status: 'completed' },
  { id: 'intake-105', client_name: 'Eleanor Henderson',            risk_level: 'low',    risk_score: 18, status: 'cleared',        created_at: daysFromNow(-21), referred_by: 'Direct',           matter_type: 'conveyancing',   pep_flag: false, assigned_to: 'Daniel Okafor',  cdd_status: 'completed' },
];

// ── Deadlines ────────────────────────────────────────────────────────────────
export const DEMO_DEADLINES = [
  { id: 'd-001', title: 'SRA Annual Return',                    due_date: daysFromNowDate(18), priority: 'high',     assigned_to: 'Sarah Chen',     category: 'regulatory', matter_ref: null,           status: 'open' },
  { id: 'd-002', title: 'PII renewal evidence pack',            due_date: daysFromNowDate(45), priority: 'medium',   assigned_to: 'James Whitfield', category: 'governance', matter_ref: null,           status: 'open' },
  { id: 'd-003', title: 'Limitation: Henderson v. Norwich BS',  due_date: daysFromNowDate(7),  priority: 'critical', assigned_to: 'Daniel Okafor',  category: 'matter',     matter_ref: 'M-2026-0142',  status: 'open' },
  { id: 'd-004', title: 'Defence filing — Carter v. Whitestone',due_date: daysFromNowDate(14), priority: 'high',     assigned_to: 'Daniel Okafor',  category: 'matter',     matter_ref: 'M-2026-0023',  status: 'open' },
  { id: 'd-005', title: 'Q2 board compliance briefing',         due_date: daysFromNowDate(28), priority: 'medium',   assigned_to: 'Sarah Chen',     category: 'governance', matter_ref: null,           status: 'open' },
];

// ── Case compliance ──────────────────────────────────────────────────────────
export const DEMO_CASE_COMPLIANCE = {
  case_id: 'M-2026-0142',
  matter_ref: 'M-2026-0142',
  client_name: 'Eleanor Henderson',
  fee_earner: 'Daniel Okafor',
  matter_type: 'conveyancing',
  compliance_score: 92,
  checks: [
    { id: 'cc-1', name: 'Conflict check completed',                status: 'pass' },
    { id: 'cc-2', name: 'CDD on file',                              status: 'pass' },
    { id: 'cc-3', name: 'Source-of-funds verified',                 status: 'pass' },
    { id: 'cc-4', name: 'Engagement letter signed',                 status: 'pass' },
    { id: 'cc-5', name: 'File review within last 60 days',          status: 'fail' },
    { id: 'cc-6', name: 'Undertakings registered',                  status: 'pass' },
  ],
  open_issues: 1,
  last_review: daysFromNow(-7),
  next_review_due: daysFromNow(-7),
};

// ── Staff Portal (page expects: staff{user_id,name,role,department,access_token}, training, tasks, chasers) ──
export const DEMO_STAFF_PORTAL = {
  staff: {
    user_id: 'staff-005',
    name: 'Emma Robertson',
    email: 'emma.robertson@harrisonmorgan.co.uk',
    role: 'solicitor',
    department: 'Family',
    access_token: 'demo-token',
  },
  training: [
    { id: 'tr-001', title: 'AML Annual Refresher 2026', training_type: 'aml',  status: 'overdue',     due_date: daysFromNowDate(-12), assigned_at: daysFromNow(-100) },
    { id: 'tr-006', title: 'GDPR Annual Refresher',     training_type: 'gdpr', status: 'in_progress', due_date: daysFromNowDate(20),  assigned_at: daysFromNow(-30)  },
  ],
  tasks: [
    { id: 'task-1', title: 'Complete file review for M-2026-0142', priority: 'high',   due_date: daysFromNowDate(-7), status: 'overdue', assigned_at: daysFromNow(-14) },
    { id: 'task-2', title: 'Submit monthly supervision notes',     priority: 'medium', due_date: daysFromNowDate(3),  status: 'open',    assigned_at: daysFromNow(-5)  },
  ],
  chasers: [
    { id: 'chase-001', subject: 'Overdue: AML Annual Refresher 2026', status: 'pending', created_at: daysFromNow(-12), last_sent: daysFromNow(-1) },
  ],
};

// ── Settings (firm + billing + sub-objects) ─────────────────────────────────
export const DEMO_FIRM_SETTINGS = {
  firm_id: DEMO_FIRM_ID,
  firm_name: DEMO_FIRM_NAME,
  sra_number: '654321',
  registered_address: '24 Chancery Lane, London, WC2A 1NF',
  primary_contact_email: 'compliance@harrisonmorgan.co.uk',
  primary_contact_phone: '020 7946 1234',
  colp_id: 'staff-001',
  cofa_id: 'staff-002',
  practice_areas: ['conveyancing', 'litigation', 'family', 'criminal', 'commercial'],
  staff_count: DEMO_STAFF.length,
  partner_count: 1,
  founded_year: 2014,
};

export const DEMO_SUBSCRIPTION = {
  plan: 'pro',
  plan_label: 'Seema Pro',
  status: 'active',
  current_period_start: daysFromNow(-15),
  current_period_end: daysFromNow(15),
  seats_purchased: 10,
  seats_used: DEMO_STAFF.length,
  monthly_amount: 49900,
  currency: 'GBP',
  next_invoice_amount: 49900,
  next_invoice_date: daysFromNow(15),
};

export const DEMO_BILLING_HISTORY = [
  { id: 'inv-001', date: daysFromNow(-15),  amount: 49900, currency: 'GBP', status: 'paid', invoice_number: 'INV-2026-04' },
  { id: 'inv-002', date: daysFromNow(-45),  amount: 49900, currency: 'GBP', status: 'paid', invoice_number: 'INV-2026-03' },
  { id: 'inv-003', date: daysFromNow(-75),  amount: 49900, currency: 'GBP', status: 'paid', invoice_number: 'INV-2026-02' },
  { id: 'inv-004', date: daysFromNow(-105), amount: 49900, currency: 'GBP', status: 'paid', invoice_number: 'INV-2026-01' },
];

export const DEMO_PAYMENT_METHODS = [
  { id: 'pm-001', type: 'card', brand: 'visa',       last4: '4242', exp_month: 8,  exp_year: 2028, is_default: true  },
  { id: 'pm-002', type: 'card', brand: 'mastercard', last4: '5555', exp_month: 11, exp_year: 2027, is_default: false },
];

export const DEMO_NOTIFICATION_PREFS = {
  email_critical: true, email_daily_digest: true, email_weekly_summary: true,
  in_app_critical: true, in_app_mentions: true, in_app_assignments: true,
  sms_critical: false,
};

export const DEMO_PREFERENCES = {
  timezone: 'Europe/London', date_format: 'DD/MM/YYYY', language: 'en-GB', theme: 'light', dashboard_default_tab: 'briefing',
};

export const DEMO_SETTINGS = {
  firm: DEMO_FIRM_SETTINGS,
  subscription: DEMO_SUBSCRIPTION,
  billing: DEMO_BILLING_HISTORY,
  payment_methods: DEMO_PAYMENT_METHODS,
  notification_prefs: DEMO_NOTIFICATION_PREFS,
  preferences: DEMO_PREFERENCES,
};

// ── Auth sessions (Security page + Settings tab) ─────────────────────────────
export const DEMO_AUTH_SESSIONS = [
  { id: 'sess-001', device: 'MacBook Pro — Chrome',  ip: '192.0.2.10', location: 'London, UK', last_active: daysFromNow(0),   current: true,  created_at: daysFromNow(-1)  },
  { id: 'sess-002', device: 'iPhone 15 — Safari',    ip: '192.0.2.11', location: 'London, UK', last_active: daysFromNow(-1),  current: false, created_at: daysFromNow(-30) },
  { id: 'sess-003', device: 'iPad — Safari',         ip: '192.0.2.10', location: 'London, UK', last_active: daysFromNow(-7),  current: false, created_at: daysFromNow(-60) },
];

// ── Email queue & templates ──────────────────────────────────────────────────
export const DEMO_EMAIL_TEMPLATES = [
  { id: 'tmpl-001', name: 'Training overdue chase',           category: 'training',    subject: 'Action required: Overdue training — {{title}}',           updated_at: daysFromNow(-30),  body: 'Hi {{recipient_name}},\n\nYour training "{{title}}" was due on {{due_date}} and is now {{days_overdue}} days overdue. Please complete it by end of week.' },
  { id: 'tmpl-002', name: 'Supervision reminder',             category: 'supervision', subject: 'Supervision session scheduled — {{date}}',                  updated_at: daysFromNow(-60),  body: 'Hi {{recipient_name}},\n\nYour next supervision session is scheduled for {{date}}. Please prepare your matter list.' },
  { id: 'tmpl-003', name: 'CDD chase to client',              category: 'aml',         subject: 'Action needed: Identity verification — {{client_name}}',  updated_at: daysFromNow(-90),  body: 'Dear {{client_name}},\n\nWe still need the following documents to complete our verification process: {{documents}}.' },
  { id: 'tmpl-004', name: 'Complaint acknowledgement',        category: 'complaints',  subject: 'We have received your complaint',                            updated_at: daysFromNow(-180), body: 'Dear {{complainant_name}},\n\nWe have received your complaint and are investigating. We will respond within 8 weeks.' },
  { id: 'tmpl-005', name: 'Reconciliation sign-off request', category: 'accounts',    subject: 'COFA sign-off needed: {{period}} reconciliation',           updated_at: daysFromNow(-45),  body: 'Hi {{cofa_name}},\n\nThe {{period}} reconciliation is ready for sign-off.' },
];

export const DEMO_EMAIL_QUEUE = [
  { id: 'eq-001', recipient: 'emma.robertson@harrisonmorgan.co.uk', subject: 'Action required: Overdue training — AML Annual Refresher 2026', template_id: 'tmpl-001', status: 'queued', created_at: daysFromNow(0),  scheduled_for: daysFromNow(0)  },
  { id: 'eq-002', recipient: 'priya.patel@harrisonmorgan.co.uk',    subject: 'Supervision session — overdue',                                  template_id: 'tmpl-002', status: 'queued', created_at: daysFromNow(0),  scheduled_for: daysFromNow(0)  },
  { id: 'eq-003', recipient: 'james.whitfield@harrisonmorgan.co.uk',subject: 'COFA sign-off needed: March 2026 reconciliation',                template_id: 'tmpl-005', status: 'sent',   created_at: daysFromNow(-1), scheduled_for: daysFromNow(-1) },
  { id: 'eq-004', recipient: 'apex.finance@apexholdings.example',   subject: 'Action needed: Identity verification — Apex Holdings Ltd',       template_id: 'tmpl-003', status: 'sent',   created_at: daysFromNow(-9), scheduled_for: daysFromNow(-9) },
  { id: 'eq-005', recipient: 'mrs.henderson@example.com',           subject: 'We have received your complaint',                                template_id: 'tmpl-004', status: 'sent',   created_at: daysFromNow(-10),scheduled_for: daysFromNow(-10)},
];

export const DEMO_EMAIL_QUEUE_STATS = { queued: 2, sent_today: 6, sent_this_week: 24, failed: 0 };

export const DEMO_EMAIL_SETTINGS = {
  smtp_host: 'smtp.harrisonmorgan.co.uk',
  smtp_port: 587,
  smtp_user: 'compliance@harrisonmorgan.co.uk',
  smtp_secure: true,
  from_address: 'compliance@harrisonmorgan.co.uk',
  reply_to_address: 'info@harrisonmorgan.co.uk',
  from_name: 'Harrison Morgan Compliance',
  auto_chaser_enabled: true,
  chaser_frequency_days: 7,
};

// ── Users (admin) ────────────────────────────────────────────────────────────
export const DEMO_USERS = DEMO_STAFF.map(s => ({
  id: s.id,
  full_name: s.name,
  email: s.email,
  role: s.role,
  department: s.department,
  is_active: s.status === 'active',
  last_login_at: daysFromNow(-1),
  created_at: s.joined_date,
}));

// ── Import history (data-management) ─────────────────────────────────────────
export const DEMO_IMPORT_HISTORY = [
  { id: 'imp-001', source: 'Clio',     entity: 'matters',  records: 412,  status: 'completed', started_at: daysFromNow(-30), finished_at: daysFromNow(-30), errors: 0  },
  { id: 'imp-002', source: 'Clio',     entity: 'contacts', records: 1834, status: 'completed', started_at: daysFromNow(-30), finished_at: daysFromNow(-30), errors: 3  },
  { id: 'imp-003', source: 'CSV',      entity: 'staff',    records: 8,    status: 'completed', started_at: daysFromNow(-90), finished_at: daysFromNow(-90), errors: 0  },
  { id: 'imp-004', source: 'Xero',     entity: 'invoices', records: 247,  status: 'partial',   started_at: daysFromNow(-7),  finished_at: daysFromNow(-7),  errors: 12 },
];

// ── Clio integration ─────────────────────────────────────────────────────────
export const DEMO_CLIO_STATUS  = { connected: true, connected_at: daysFromNow(-30), last_sync: daysFromNow(-1), sync_status: 'healthy' };
export const DEMO_CLIO_HISTORY = [
  { id: 'cs-001', sync_type: 'matters',  status: 'completed', started_at: daysFromNow(-1), finished_at: daysFromNow(-1), records_synced: 8,  errors: 0 },
  { id: 'cs-002', sync_type: 'contacts', status: 'completed', started_at: daysFromNow(-1), finished_at: daysFromNow(-1), records_synced: 14, errors: 0 },
  { id: 'cs-003', sync_type: 'matters',  status: 'completed', started_at: daysFromNow(-2), finished_at: daysFromNow(-2), records_synced: 4,  errors: 0 },
];
