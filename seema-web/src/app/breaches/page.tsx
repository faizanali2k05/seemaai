'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  DataTable,
  StatCard,
  StatusBadge,
  Card,
  Button,
  Modal,
  showToast,
  ConfirmDialog,
  LoadingSpinner,
} from '@/components/ui';
import { Download, ChevronRight, Clock, AlertTriangle, Copy, FileText } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { isDemoMode, DEMO_BREACHES } from '@/lib/demo-data';

interface BreachStep {
  step: string;
  status: 'pending' | 'completed' | 'in-progress';
  timestamp?: Date;
  notes?: string;
  responsiblePerson?: string;
}

interface Breach {
  id: string;
  title: string;
  breach_type: 'data' | 'regulatory' | 'conduct' | string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'contained' | 'notified' | 'resolved' | string;
  reported_date: string;
  ico_deadline: string;
  notification_status: 'notified' | 'not_notified' | string;
  resolution_date?: string;
  root_cause?: string;
  affected_records?: number;
  remediation_plan_id?: string;
  description?: string;
  // Task #48 — ICO 72-hour workflow. `ico_notified_at` is the ground truth
  // for "the COLP has actually submitted the notification"; once set, the
  // countdown widget hides itself. `ico_notification_draft` lets the modal
  // re-open the persisted AI draft without re-paying for the AI call.
  ico_notified_at?: string | null;
  ico_notification_drafted_at?: string | null;
  ico_notification_draft?: IcoNotificationDraft | null;
}

// ── ICO 72-hour deadline widget helpers ────────────────────────────
//
// A breach qualifies for the ICO countdown widget iff:
//   • it looks like a personal data breach (breach_type === 'data' or the
//     type label contains data/gdpr/personal — defensive against the
//     free-text breach_type column on the backend), AND
//   • it is not yet resolved or closed, AND
//   • it has an ico_deadline set.

function isDataBreach(breach: Pick<Breach, 'breach_type'>): boolean {
  const t = (breach.breach_type || '').toLowerCase();
  if (t === 'data') return true;
  return t.includes('data') || t.includes('gdpr') || t.includes('personal');
}

function isOpenStatus(breach: Pick<Breach, 'status'>): boolean {
  const s = (breach.status || '').toLowerCase();
  return s !== 'resolved' && s !== 'closed';
}

// `ico_notified_at` is the explicit timestamp the COLP marked the breach as
// reported to the ICO. Once set, the countdown widget retires (the firm has
// fulfilled the Article 33 obligation). Falls back to the legacy
// `notification_status === 'notified'` flag for older rows that pre-date
// the migration.
function isAlreadyNotified(breach: Breach): boolean {
  if (breach.ico_notified_at) return true;
  return (breach.notification_status || '').toLowerCase() === 'notified';
}

function qualifiesForIcoWidget(breach: Breach): boolean {
  return (
    isDataBreach(breach)
    && isOpenStatus(breach)
    && !!breach.ico_deadline
    && !isAlreadyNotified(breach)
  );
}

// Per task #48: green > 24h remaining, amber 4-24h, red < 4h or overdue.
// `passed` is an alias of red used to render a distinct "overdue" label
// (the firm is now in regulator-jeopardy territory).
type IcoUrgency = 'green' | 'amber' | 'red' | 'passed';

interface IcoCountdown {
  urgency: IcoUrgency;
  /** "12h 34m remaining" or "Deadline passed" */
  label: string;
  /** Locale-formatted absolute deadline. */
  deadlineLocale: string;
  /** Raw remaining ms (negative when in the past). */
  remainingMs: number;
}

function computeIcoCountdown(deadlineIso: string, nowMs: number): IcoCountdown {
  const deadlineMs = new Date(deadlineIso).getTime();
  const diff = deadlineMs - nowMs;
  const deadlineLocale = new Date(deadlineIso).toLocaleString();

  if (diff <= 0) {
    return { urgency: 'passed', label: 'Deadline passed', deadlineLocale, remainingMs: diff };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const label = `${hours}h ${minutes}m remaining`;

  // Bands per task #48: red < 4h, amber 4-24h, green > 24h.
  let urgency: IcoUrgency = 'green';
  if (hours < 4) urgency = 'red';
  else if (hours < 24) urgency = 'amber';

  return { urgency, label, deadlineLocale, remainingMs: diff };
}

interface IcoNotificationDraft {
  summary?: string;
  sections?: Record<string, string>;
  recommended_next_steps?: string[];
  regulatory_references?: string[];
  confidence_note?: string;
  ai_generated?: boolean;
}

// Order of section keys for display — matches the backend's
// `_ico_section_keys()` so any field reordering stays consistent.
const ICO_SECTION_LABELS: Array<{ key: string; label: string }> = [
  { key: 'what_happened', label: 'What happened' },
  { key: 'when_did_it_happen', label: 'When did it happen' },
  { key: 'when_was_it_discovered', label: 'When was it discovered' },
  { key: 'how_was_it_discovered', label: 'How was it discovered' },
  { key: 'nature_of_data', label: 'Nature of personal data involved' },
  { key: 'approx_subjects_affected', label: 'Approximate data subjects affected' },
  { key: 'approx_records_affected', label: 'Approximate records affected' },
  { key: 'likely_consequences', label: 'Likely consequences for data subjects' },
  { key: 'measures_taken', label: 'Measures taken since discovery' },
  { key: 'measures_planned', label: 'Further measures planned' },
  { key: 'data_subjects_informed', label: 'Whether data subjects have been informed' },
];

// ── ICO countdown widget ──────────────────────────────────────────
// Renders the live 72-hour countdown to ICO deadline. Re-renders on parent
// `nowTick` change. Single component used both on the per-breach card
// (compact variant) and inside the detail modal.
interface IcoCountdownWidgetProps {
  breach: Breach;
  nowMs: number;
  onDraft: (breach: Breach) => void;
  /** Slightly looser styling for the modal where horizontal space is wider. */
  compact?: boolean;
}

function IcoCountdownWidget({ breach, nowMs, onDraft, compact = false }: IcoCountdownWidgetProps) {
  if (!qualifiesForIcoWidget(breach)) return null;
  const countdown = computeIcoCountdown(breach.ico_deadline, nowMs);

  // Tailwind classes per urgency band.
  const styles: Record<IcoUrgency, { wrap: string; pill: string; pulse: boolean; iconColor: string; subText: string }> = {
    red: {
      wrap: 'bg-red-50 border-red-300 text-red-900',
      pill: 'bg-red-600 text-white',
      pulse: true,
      iconColor: 'text-red-600',
      subText: 'text-red-800',
    },
    amber: {
      wrap: 'bg-amber-50 border-amber-300 text-amber-900',
      pill: 'bg-amber-500 text-white',
      pulse: false,
      iconColor: 'text-amber-600',
      subText: 'text-amber-800',
    },
    green: {
      wrap: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      pill: 'bg-emerald-600 text-white',
      pulse: false,
      iconColor: 'text-emerald-600',
      subText: 'text-emerald-800',
    },
    passed: {
      // Overdue is the most severe state — keep the red palette but use a
      // darker red for the pill so it visually outranks the <4h "Critical".
      wrap: 'bg-red-100 border-red-500 text-red-950',
      pill: 'bg-red-800 text-white',
      pulse: true,
      iconColor: 'text-red-800',
      subText: 'text-red-900',
    },
  };
  const s = styles[countdown.urgency];

  return (
    <div
      className={`rounded-lg border-2 ${s.wrap} ${compact ? 'p-3' : 'p-4'} ${s.pulse ? 'animate-pulse' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {countdown.urgency === 'red' || countdown.urgency === 'passed' ? (
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${s.iconColor}`} />
          ) : (
            <Clock className={`h-5 w-5 flex-shrink-0 mt-0.5 ${s.iconColor}`} />
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide font-bold">ICO 72-hour notification deadline</p>
            <p className={`${compact ? 'text-xl' : 'text-2xl'} font-bold tabular-nums mt-0.5`}>
              {countdown.label}
            </p>
            <p className={`text-xs mt-1 ${s.subText}`}>
              Notify the ICO by {countdown.deadlineLocale}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${s.pill}`}>
            {countdown.urgency === 'passed' ? 'Overdue' :
              countdown.urgency === 'red' ? 'Critical' :
                countdown.urgency === 'amber' ? 'Urgent' : 'On track'}
          </span>
          <button
            onClick={() => onDraft(breach)}
            className="inline-flex items-center gap-1 text-xs font-semibold underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current rounded"
          >
            <FileText className="h-3.5 w-3.5" />
            Draft ICO notification →
          </button>
        </div>
      </div>
      {/* Legal-basis footnote — law firms expect to see authority for every
          deadline a tool surfaces. Keep it small but always visible. */}
      <p className={`text-[11px] mt-2 ${s.subText} opacity-90`}>
        Authority: UK GDPR Article 33(1) — controllers must notify the
        supervisory authority without undue delay and where feasible within
        72 hours of becoming aware of a personal data breach.
      </p>
    </div>
  );
}

export default function BreachesPage() {
  useRequireAuth();
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [selectedBreach, setSelectedBreach] = useState<Breach | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    breach_type: 'data' as const,
    severity: 'high' as const,
    description: '',
    reported_date: new Date().toISOString().split('T')[0],
    affected_records: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmReport, setConfirmReport] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [analysing, setAnalysing] = useState(false);
  const [breachAnalysis, setBreachAnalysis] = useState<Record<string, any>>({});

  // ── ICO draft notification state ─────────────────────────────────
  const [icoDraftOpen, setIcoDraftOpen] = useState(false);
  const [icoDraftBreach, setIcoDraftBreach] = useState<Breach | null>(null);
  const [icoDraftLoading, setIcoDraftLoading] = useState(false);
  const [icoDraftResult, setIcoDraftResult] = useState<IcoNotificationDraft | null>(null);
  // Editable copy of the draft sections so the COLP can refine the text in
  // the textarea before copying to clipboard. Keyed by the same section
  // keys as ICO_SECTION_LABELS.
  const [icoDraftSections, setIcoDraftSections] = useState<Record<string, string>>({});
  const [icoDraftError, setIcoDraftError] = useState<string | null>(null);
  const [markingNotified, setMarkingNotified] = useState(false);
  // `nowTick` is bumped every minute so the countdown widget re-renders.
  // Storing the raw timestamp (not formatted strings keyed by id) lets us
  // share a single recomputation path between the card and modal widgets.
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Fetch breaches on mount
  useEffect(() => {
    fetchBreaches();
  }, []);

  // Update time remaining countdown (table column) and tick the shared
  // `nowTick` value that drives the ICO countdown widget. Both refresh
  // every 60 seconds — minute granularity is sufficient for a 72h window
  // and avoids unnecessary re-renders.
  useEffect(() => {
    const updateTimeRemaining = () => {
      const now = Date.now();
      setNowTick(now);
      const remaining: { [key: string]: string } = {};
      breaches.forEach(breach => {
        const deadline = new Date(breach.ico_deadline).getTime();
        const diff = deadline - now;

        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          remaining[breach.id] = `${hours}h ${minutes}m`;
        } else {
          remaining[breach.id] = 'OVERDUE';
        }
      });
      setTimeRemaining(remaining);
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000);
    return () => clearInterval(interval);
  }, [breaches]);

  const fetchBreaches = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isDemoMode()) {
        setBreaches(DEMO_BREACHES as any);
        setLoading(false);
        return;
      }

      const response = await apiClient.get('/compliance/breach-reports');
      setBreaches(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching breaches:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch breaches');
      if (isDemoMode()) {
        setBreaches(DEMO_BREACHES as any);
      }
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Breach title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.reported_date) {
      newErrors.reported_date = 'Reported date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleExportBreaches = () => {
    if (breaches.length === 0) {
      showToast('No breaches to export', 'error');
      return;
    }

    try {
      const headers = ['ID', 'Title', 'Type', 'Severity', 'Status', 'Reported Date', 'ICO Deadline', 'Notification Status', 'Affected Records'];
      const rows = breaches.map(breach => [
        breach.id,
        breach.title,
        breach.breach_type,
        breach.severity,
        breach.status,
        formatDate(new Date(breach.reported_date)),
        formatDate(new Date(breach.ico_deadline)),
        breach.notification_status,
        breach.affected_records || '-',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `breaches-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Breaches exported successfully', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to export breaches';
      showToast(errorMsg, 'error');
    }
  };

  const handleReportBreach = async () => {
    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    try {
      setSubmitting(true);
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 800));
        showToast('Breach reported successfully', 'success');
        setFormData({ title: '', breach_type: 'data', severity: 'high', description: '', reported_date: new Date().toISOString().split('T')[0], affected_records: 0 });
        setErrors({}); setShowReportModal(false); setConfirmReport(false);
        setSubmitting(false);
        return;
      }
      await apiClient.post('/compliance/breach-report', {
        breach_type: formData.breach_type,
        title: formData.title,
        severity: formData.severity,
        description: formData.description,
        reported_date: formData.reported_date,
        affected_records: formData.affected_records,
      });
      showToast('Breach reported successfully', 'success');
      // Reset form and refetch list
      setFormData({
        title: '',
        breach_type: 'data',
        severity: 'high',
        description: '',
        reported_date: new Date().toISOString().split('T')[0],
        affected_records: 0,
      });
      setErrors({});
      setShowReportModal(false);
      setConfirmReport(false);
      await fetchBreaches();
    } catch (err) {
      console.error('Error reporting breach:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to report breach';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyseBreach = async (breach: Breach) => {
    try {
      setAnalysing(true);
      showToast('Seema\'s AI is analysing this breach…', 'info');

      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 2500));

        const demoAnalyses: Record<string, any> = {
          'BR-001': {
            risk_level: 'high',
            ico_notification_required: true,
            ico_notification_reasoning: 'Unauthorised access to client file constitutes a personal data breach under Article 4(12) UK GDPR. As it involves unauthorised access to client data, there is a risk to the rights and freedoms of the data subject. ICO notification within 72 hours is required under Article 33.',
            sra_implications: 'Potential breach of SRA Code of Conduct paragraph 6.3 (duty of confidentiality) and paragraph 2.1 (compliance with legal and regulatory obligations). COLP must assess whether this constitutes a material breach requiring SRA self-report under Rule 3.9.',
            recommended_actions: [
              { action: 'Immediately revoke the staff member\'s access to the affected file', priority: 'critical', deadline: 'Immediate' },
              { action: 'Conduct forensic audit of the staff member\'s access history for the past 90 days', priority: 'high', deadline: '24 hours' },
              { action: 'Notify the affected client in writing of the unauthorised access', priority: 'high', deadline: '48 hours' },
              { action: 'Review and tighten case management system access controls', priority: 'high', deadline: '7 days' },
              { action: 'Implement role-based access restrictions preventing access to unassigned matters', priority: 'medium', deadline: '14 days' },
              { action: 'Schedule refresher training on data protection and confidentiality for all staff', priority: 'medium', deadline: '30 days' },
            ],
            root_cause_analysis: 'The case management system lacks role-based access controls, allowing any authenticated user to access any client file. This is a systemic vulnerability that requires technical remediation beyond addressing the individual incident.',
            similar_risk_areas: ['Email system access controls', 'Physical file storage', 'Remote access to client data', 'Document management system permissions'],
          },
          'BR-002': {
            risk_level: 'medium',
            ico_notification_required: false,
            ico_notification_reasoning: 'This is a regulatory breach (SRA Accounts Rules) rather than a personal data breach. No personal data was compromised. ICO notification is not required. However, the SRA Accounts Rules breach must be assessed by the COFA.',
            sra_implications: 'Breach of SRA Accounts Rules 2019, specifically Rule 4.3 (client money must be returned promptly). COFA must record this in the firm\'s non-compliance log. If this represents a pattern of late transfers, it may constitute a material breach requiring SRA notification.',
            recommended_actions: [
              { action: 'Complete the delayed transfer immediately and confirm receipt with the client', priority: 'critical', deadline: 'Immediate' },
              { action: 'COFA to investigate the root cause — banking process or staff error', priority: 'high', deadline: '48 hours' },
              { action: 'Review all client account transfers in the past 6 months for similar delays', priority: 'high', deadline: '7 days' },
              { action: 'Implement automated alerts for transfers approaching the deadline', priority: 'medium', deadline: '14 days' },
              { action: 'Update banking reconciliation procedures with explicit timeline requirements', priority: 'medium', deadline: '30 days' },
            ],
            root_cause_analysis: 'Process delay in banking reconciliation suggests inadequate workflow management for time-sensitive client money transfers. The firm may lack automated deadline tracking for accounts obligations.',
            similar_risk_areas: ['Client account reconciliation timing', 'Residual balance handling', 'Interest calculation deadlines', 'Year-end accounts reporting'],
          },
          'BR-003': {
            risk_level: 'high',
            ico_notification_required: true,
            ico_notification_reasoning: 'Misdirected email containing personal data is a reportable breach under Article 33 UK GDPR. Even though the email was recalled within 15 minutes, the data was transmitted to an unauthorised recipient. The ICO should be notified and the firm has correctly done so.',
            sra_implications: 'Breach of SRA Code of Conduct paragraph 6.3 (confidentiality) and paragraph 6.4 (disclosure of confidential information). The quick recall mitigates severity, but the COLP should assess whether email safeguards are adequate.',
            recommended_actions: [
              { action: 'Confirm the recall was successful and the recipient did not read the email', priority: 'critical', deadline: 'Completed' },
              { action: 'Document the breach fully in the breach register with timeline', priority: 'high', deadline: 'Completed' },
              { action: 'Implement email autocomplete restrictions for external addresses', priority: 'high', deadline: '7 days' },
              { action: 'Deploy email DLP (Data Loss Prevention) rules to flag emails containing client reference numbers', priority: 'medium', deadline: '30 days' },
              { action: 'Conduct firm-wide email safety awareness refresher', priority: 'medium', deadline: '14 days' },
            ],
            root_cause_analysis: 'Manual email addressing without safeguards. The firm\'s email system does not have DLP rules or external recipient warnings that could prevent misdirected communications containing personal data.',
            similar_risk_areas: ['Document attachments to wrong matters', 'Fax misdirection', 'Post sent to wrong address', 'Portal document sharing errors'],
          },
        };

        const analysis = demoAnalyses[breach.id] || {
          risk_level: 'medium',
          ico_notification_required: false,
          ico_notification_reasoning: 'Assessment pending — additional information required to determine notification obligation.',
          sra_implications: 'COLP should review against SRA Code of Conduct and assess materiality.',
          recommended_actions: [
            { action: 'Document the breach fully in the breach register', priority: 'high', deadline: '24 hours' },
            { action: 'Assess whether ICO notification threshold is met', priority: 'high', deadline: '48 hours' },
            { action: 'Implement corrective measures', priority: 'medium', deadline: '14 days' },
          ],
          root_cause_analysis: 'Further investigation required to identify systemic factors.',
          similar_risk_areas: [],
        };

        setBreachAnalysis(prev => ({ ...prev, [breach.id]: analysis }));
        showToast('AI breach analysis complete', 'success');
        return;
      }

      // Real mode: call the AI breach analysis endpoint. Override the axios
      // 30s default — AI calls regularly run 30-60s.
      const response = await apiClient.post('/ai/analyze-breach', {
        breach_id: breach.id,
      }, { timeout: 120000 });
      setBreachAnalysis(prev => ({ ...prev, [breach.id]: { ...response.data, ai_generated: true } }));
      showToast('AI breach analysis complete', 'success');
    } catch (err) {
      console.error('Breach analysis failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to analyse breach';
      showToast(errorMsg, 'error');
    } finally {
      setAnalysing(false);
    }
  };

  // Helper: seed the editable section state from a draft so each section is
  // non-undefined (so React's controlled textarea doesn't warn).
  const seedDraftSections = (draft: IcoNotificationDraft) => {
    const seeded: Record<string, string> = {};
    for (const { key } of ICO_SECTION_LABELS) {
      seeded[key] = draft.sections?.[key] ?? '[TO BE COMPLETED BY COLP — supply factual answer]';
    }
    setIcoDraftSections(seeded);
  };

  // ── ICO draft notification ───────────────────────────────────────
  const handleDraftIcoNotification = async (breach: Breach) => {
    setIcoDraftBreach(breach);
    setIcoDraftOpen(true);
    setIcoDraftError(null);

    // If we already have a persisted draft on this breach, rehydrate it
    // immediately so the modal opens without a spinner. The COLP can still
    // press "Regenerate" to get a fresh draft.
    if (breach.ico_notification_draft && typeof breach.ico_notification_draft === 'object') {
      setIcoDraftResult(breach.ico_notification_draft);
      seedDraftSections(breach.ico_notification_draft);
      setIcoDraftLoading(false);
      return;
    }

    setIcoDraftResult(null);
    setIcoDraftSections({});
    setIcoDraftLoading(true);

    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1500));
        const fallback: IcoNotificationDraft = {
          summary: `Personal data breach: ${breach.title}`,
          sections: {
            what_happened: breach.description || '[TO BE COMPLETED BY COLP — supply factual answer]',
            when_did_it_happen: '[TO BE COMPLETED BY COLP — supply factual answer]',
            when_was_it_discovered: breach.reported_date || '[TO BE COMPLETED BY COLP — supply factual answer]',
            how_was_it_discovered: '[TO BE COMPLETED BY COLP — supply factual answer]',
            nature_of_data: '[TO BE COMPLETED BY COLP — supply factual answer]',
            approx_subjects_affected: '[TO BE COMPLETED BY COLP — supply factual answer]',
            approx_records_affected: breach.affected_records
              ? String(breach.affected_records)
              : '[TO BE COMPLETED BY COLP — supply factual answer]',
            likely_consequences: '[TO BE COMPLETED BY COLP — supply factual answer]',
            measures_taken: breach.root_cause
              ? `Root cause identified as: ${breach.root_cause}. Further containment measures: [TO BE COMPLETED BY COLP — supply factual answer]`
              : '[TO BE COMPLETED BY COLP — supply factual answer]',
            measures_planned: '[TO BE COMPLETED BY COLP — supply factual answer]',
            data_subjects_informed: '[TO BE COMPLETED BY COLP — supply factual answer]',
          },
          recommended_next_steps: [
            'Verify and complete every "[TO BE COMPLETED BY COLP]" section with factual answers from the incident record.',
            'Assess whether affected data subjects must be notified under UK GDPR Article 34 (high risk to rights and freedoms).',
            'Preserve all forensic evidence and contemporaneous notes for the ICO investigation file.',
          ],
          regulatory_references: [
            'UK GDPR Article 33',
            'UK GDPR Article 34',
            'Data Protection Act 2018 s.67',
          ],
          confidence_note:
            'Demo mode — this is a template with placeholders. In production, Seema AI drafts a richer first pass from the breach record.',
          ai_generated: false,
        };
        setIcoDraftResult(fallback);
        seedDraftSections(fallback);
        return;
      }

      // Hits the persisted Node endpoint added for task #48 — it both
      // proxies to the FastAPI AI service AND saves the draft to the
      // breach row + writes an audit log. Returns
      // { draft, breach: serializeBreach(updated) }.
      const response = await apiClient.post(
        `/compliance/breach-reports/${breach.id}/draft-ico-notification`,
        {},
        { timeout: 120000 },
      );
      const draft: IcoNotificationDraft = response.data?.draft ?? response.data;
      setIcoDraftResult(draft);
      seedDraftSections(draft);

      // Update the local breach row with the persisted state (drafted_at,
      // saved draft) so closing-and-reopening the modal short-circuits.
      if (response.data?.breach) {
        setBreaches(prev => prev.map(b => (b.id === breach.id ? response.data.breach : b)));
        setIcoDraftBreach(response.data.breach);
      }
    } catch (err) {
      console.error('Draft ICO notification failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to draft ICO notification';
      setIcoDraftError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIcoDraftLoading(false);
    }
  };

  // PATCH the breach to record that the COLP has actually submitted the
  // notification to the ICO. The countdown widget retires for any breach
  // with `ico_notified_at` set.
  const handleMarkAsNotified = async (breach: Breach) => {
    try {
      setMarkingNotified(true);
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 600));
        const now = new Date().toISOString();
        setBreaches(prev => prev.map(b => (
          b.id === breach.id
            ? { ...b, ico_notified_at: now, notification_status: 'notified' }
            : b
        )));
        showToast('Marked as notified to the ICO', 'success');
        closeIcoDraftModal();
        return;
      }
      const response = await apiClient.patch(
        `/compliance/breach-reports/${breach.id}/mark-notified`,
      );
      setBreaches(prev => prev.map(b => (b.id === breach.id ? response.data : b)));
      // If the detail modal is also open on this breach, refresh its state.
      if (selectedBreach?.id === breach.id) setSelectedBreach(response.data);
      showToast('Marked as notified to the ICO', 'success');
      closeIcoDraftModal();
    } catch (err) {
      console.error('Mark as notified failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to mark as notified';
      showToast(errorMsg, 'error');
    } finally {
      setMarkingNotified(false);
    }
  };

  const closeIcoDraftModal = () => {
    setIcoDraftOpen(false);
    setIcoDraftBreach(null);
    setIcoDraftResult(null);
    setIcoDraftSections({});
    setIcoDraftError(null);
  };

  const copyIcoDraftToClipboard = async () => {
    if (!icoDraftResult) return;
    const parts: string[] = [];
    parts.push(`ICO BREACH NOTIFICATION — DRAFT (Seema AI)`);
    parts.push(`==========================================`);
    if (icoDraftResult.summary) {
      parts.push('');
      parts.push(`SUMMARY: ${icoDraftResult.summary}`);
    }
    parts.push('');
    parts.push('NOTIFICATION BODY');
    parts.push('-----------------');
    for (const { key, label } of ICO_SECTION_LABELS) {
      // Prefer the COLP's edited text in the textarea over the original AI
      // section so the clipboard reflects what the user has actually
      // approved. Fall back to the AI section if not yet edited.
      const value = (
        icoDraftSections[key]
        ?? icoDraftResult.sections?.[key]
        ?? '[TO BE COMPLETED BY COLP — supply factual answer]'
      );
      parts.push('');
      parts.push(`${label}:`);
      parts.push(value);
    }
    if (icoDraftResult.recommended_next_steps?.length) {
      parts.push('');
      parts.push('RECOMMENDED NEXT STEPS');
      parts.push('----------------------');
      icoDraftResult.recommended_next_steps.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
    }
    if (icoDraftResult.regulatory_references?.length) {
      parts.push('');
      parts.push(`REGULATORY REFERENCES: ${icoDraftResult.regulatory_references.join(' | ')}`);
    }
    if (icoDraftResult.confidence_note) {
      parts.push('');
      parts.push(`CONFIDENCE NOTE: ${icoDraftResult.confidence_note}`);
    }
    parts.push('');
    parts.push('— DRAFT ONLY. Review every section before submitting to the ICO. —');

    const text = parts.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Notification text copied to clipboard', 'success');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      showToast('Could not copy — your browser may block clipboard access', 'error');
    }
  };

  // Breaches that qualify for the prominent ICO 72-hour countdown widget.
  const icoCountdownBreaches = breaches.filter(qualifiesForIcoWidget);

  const openBreaches = breaches.filter(b => b.status !== 'resolved').length;
  const icoNotified = breaches.filter(b => b.notification_status === 'notified').length;
  const avgResolutionTime = '4.2 days';
  const thisYear = breaches.filter(b => {
    const year = new Date(b.reported_date).getFullYear();
    return year === new Date().getFullYear();
  }).length;

  const columns = [
    { accessor: 'title', header: 'TITLE', sortable: true },
    { accessor: 'breach_type', header: 'TYPE' },
    {
      accessor: 'severity',
      header: 'SEVERITY',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.severity} variant={row.severity as any} />
      ),
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: any) => <StatusBadge status={row.status} />,
    },
    {
      accessor: 'reported_date',
      header: 'REPORTED',
      render: (_value: any, row: any) => <span className="tabular-nums">{formatDate(new Date(row.reported_date))}</span>,
    },
    {
      accessor: 'id',
      header: 'ICO DEADLINE',
      render: (_value: any, row: Breach) => (
        <div className={`tabular-nums ${timeRemaining[row.id]?.includes('OVERDUE') ? 'text-red-600 font-bold' : ''}`}>
          {timeRemaining[row.id] || 'Loading...'}
        </div>
      ),
    },
    {
      accessor: 'notification_status',
      header: 'NOTIFIED',
      render: (_value: any, row: any) => (row.notification_status === 'notified' ? '✓ Yes' : '✗ No'),
    },
    {
      accessor: 'id',
      header: '',
      render: () => <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Breach Log" description="Track and manage data and regulatory breaches" />
        <Card className="rounded-xl">
          <div className="p-6 text-center text-gray-500">Loading breaches...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Breach Log" description="Track and manage data and regulatory breaches" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Open Breaches" value={openBreaches} color="red" />
        <StatCard title="ICO Notified" value={icoNotified} color="amber" />
        <StatCard title="Avg Resolution" value={avgResolutionTime} color="blue" />
        <StatCard title="Total This Year" value={thisYear} color="purple" />
      </div>

      {/* ICO 72-hour countdown — prominently surfaced for every qualifying
          open data breach. Each card is clickable for full breach detail. */}
      {icoCountdownBreaches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">
              ICO 72-hour notification window — {icoCountdownBreaches.length} open {icoCountdownBreaches.length === 1 ? 'breach' : 'breaches'}
            </h2>
          </div>
          <div className="grid gap-3">
            {icoCountdownBreaches.map(breach => (
              <Card key={breach.id} className="rounded-xl">
                <div className="p-4 space-y-3">
                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => setSelectedBreach(breach)}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{breach.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Reported {formatDate(new Date(breach.reported_date))}
                        {breach.affected_records ? ` · ${breach.affected_records.toLocaleString()} records` : ''}
                        {' · '}<span className="capitalize">{breach.status}</span>
                      </p>
                    </div>
                    <StatusBadge status={breach.severity} variant={breach.severity as any} />
                  </div>
                  <IcoCountdownWidget
                    breach={breach}
                    nowMs={nowTick}
                    onDraft={handleDraftIcoNotification}
                  />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="rounded-xl">
        <div className="p-6 space-y-4">
          <div className="flex justify-end gap-3 border-b pb-4">
            <Button variant="outline" onClick={handleExportBreaches} className="rounded-xl transition-colors hover:bg-gray-50">
              <Download className="mr-2 h-4 w-4" />
              Export Breaches
            </Button>
            <Button onClick={() => setShowReportModal(true)} className="rounded-xl">Report Breach</Button>
          </div>

          {breaches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No breaches found. Click "Report Breach" to create one.
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={breaches}
              onRowClick={(row) => setSelectedBreach(row as Breach)}
              className="group hover:bg-gray-50 transition-colors"
            />
          )}
        </div>
      </Card>

      {selectedBreach && (
        <Modal
          isOpen={!!selectedBreach}
          onClose={() => setSelectedBreach(null)}
          title={selectedBreach.title}
        >
          <div className="space-y-4">
            {qualifiesForIcoWidget(selectedBreach) && (
              <IcoCountdownWidget
                breach={selectedBreach}
                nowMs={nowTick}
                onDraft={handleDraftIcoNotification}
                compact
              />
            )}

            {selectedBreach.description && (
              <div className="border-b pb-3">
                <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Description</h4>
                <p className="text-gray-700 line-clamp-2">{selectedBreach.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-b pb-3">
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Type</p>
                <p className="font-semibold capitalize mt-1">{selectedBreach.breach_type}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Severity</p>
                <div className="mt-1">
                  <StatusBadge status={selectedBreach.severity} variant={selectedBreach.severity as any} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Status</p>
                <div className="mt-1">
                  <StatusBadge status={selectedBreach.status} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Reported Date</p>
                <p className="font-semibold mt-1 tabular-nums">{formatDate(new Date(selectedBreach.reported_date))}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">ICO Deadline</p>
                <p className="font-semibold mt-1 tabular-nums">{formatDate(new Date(selectedBreach.ico_deadline))}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">ICO Notified</p>
                <p className="font-semibold mt-1">{selectedBreach.notification_status === 'notified' ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {selectedBreach.affected_records && (
              <div className="border-b pb-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Affected Records</p>
                <p className="font-semibold mt-1 tabular-nums">{selectedBreach.affected_records.toLocaleString()}</p>
              </div>
            )}

            {selectedBreach.root_cause && (
              <div className="border-b pb-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Root Cause</p>
                <p className="font-semibold mt-1 line-clamp-2">{selectedBreach.root_cause}</p>
              </div>
            )}

            {selectedBreach.resolution_date && (
              <div className="border-b pb-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Resolution Date</p>
                <p className="font-semibold mt-1 tabular-nums">{formatDate(new Date(selectedBreach.resolution_date))}</p>
              </div>
            )}

            {/* AI Analysis Section */}
            {breachAnalysis[selectedBreach.id] ? (
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xs uppercase tracking-wide font-semibold text-blue-700">Seema&apos;s AI Breach Analysis</h4>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    breachAnalysis[selectedBreach.id].risk_level === 'critical' ? 'bg-red-100 text-red-800' :
                    breachAnalysis[selectedBreach.id].risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
                    breachAnalysis[selectedBreach.id].risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {breachAnalysis[selectedBreach.id].risk_level?.toUpperCase()} RISK
                  </span>
                </div>

                {/* ICO Notification Assessment */}
                <div className={`p-3 rounded-lg border ${breachAnalysis[selectedBreach.id].ico_notification_required ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className="text-xs uppercase tracking-wide font-bold mb-1">{breachAnalysis[selectedBreach.id].ico_notification_required ? '⚠ ICO Notification Required' : '✓ ICO Notification Not Required'}</p>
                  <p className="text-sm text-gray-700">{breachAnalysis[selectedBreach.id].ico_notification_reasoning}</p>
                </div>

                {/* SRA Implications */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs uppercase tracking-wide font-bold text-blue-800 mb-1">SRA Implications</p>
                  <p className="text-sm text-gray-700">{breachAnalysis[selectedBreach.id].sra_implications}</p>
                </div>

                {/* Recommended Actions */}
                {breachAnalysis[selectedBreach.id].recommended_actions && (
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Recommended Actions</p>
                    <div className="space-y-2">
                      {breachAnalysis[selectedBreach.id].recommended_actions.map((action: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded border">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0 mt-0.5 ${
                            action.priority === 'critical' ? 'bg-red-100 text-red-700' :
                            action.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{action.priority?.toUpperCase()}</span>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{action.action}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Deadline: {action.deadline}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Root Cause Analysis */}
                {breachAnalysis[selectedBreach.id].root_cause_analysis && (
                  <div className="p-3 bg-gray-50 border rounded-lg">
                    <p className="text-xs uppercase tracking-wide font-bold text-gray-600 mb-1">Root Cause Analysis</p>
                    <p className="text-sm text-gray-700">{breachAnalysis[selectedBreach.id].root_cause_analysis}</p>
                  </div>
                )}

                {/* Similar Risk Areas */}
                {breachAnalysis[selectedBreach.id].similar_risk_areas?.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-1">Related Risk Areas to Review</p>
                    <div className="flex flex-wrap gap-2">
                      {breachAnalysis[selectedBreach.id].similar_risk_areas.map((area: string, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{area}</span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 italic pt-2 border-t">Seema&apos;s AI Regulatory Intelligence</p>
              </div>
            ) : (
              <div className="pt-4 border-t">
                <Button
                  onClick={() => handleAnalyseBreach(selectedBreach)}
                  disabled={analysing}
                  className="w-full"
                >
                  {analysing ? 'Analysing…' : 'Analyse Breach'}
                </Button>
                <p className="text-xs text-gray-400 text-center mt-2">AI-powered ICO notification assessment, SRA implications & remediation plan</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showReportModal && (
        <Modal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setErrors({});
          }}
          title="Report New Breach"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
                Breach Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Unauthorized Client Data Access"
                className={`w-full px-3 py-2 border rounded-xl transition-colors ${errors.title ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  if (errors.title) setErrors({ ...errors, title: '' });
                }}
                disabled={submitting}
              />
              {errors.title && (
                <p className="text-red-500 text-xs mt-1">{errors.title}</p>
              )}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Breach Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                value={formData.breach_type}
                onChange={(e) => setFormData({ ...formData, breach_type: e.target.value as any })}
                disabled={submitting}
              >
                <option value="data">Data Breach</option>
                <option value="regulatory">Regulatory Breach</option>
                <option value="conduct">Conduct Violation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Severity</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })}
                disabled={submitting}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
                Reported Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={`w-full px-3 py-2 border rounded-xl transition-colors ${errors.reported_date ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                value={formData.reported_date}
                onChange={(e) => {
                  setFormData({ ...formData, reported_date: e.target.value });
                  if (errors.reported_date) setErrors({ ...errors, reported_date: '' });
                }}
                disabled={submitting}
              />
              {errors.reported_date && (
                <p className="text-red-500 text-xs mt-1">{errors.reported_date}</p>
              )}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Affected Records</label>
              <input
                type="number"
                placeholder="Number of affected records"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.affected_records}
                onChange={(e) => setFormData({ ...formData, affected_records: parseInt(e.target.value) || 0 })}
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Detailed description of the breach..."
                className={`w-full px-3 py-2 border rounded-xl transition-colors ${errors.description ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                rows={4}
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value });
                  if (errors.description) setErrors({ ...errors, description: '' });
                }}
                disabled={submitting}
              />
              {errors.description && (
                <p className="text-red-500 text-xs mt-1">{errors.description}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="success"
                className="flex-1"
                onClick={() => {
                  if (validateForm()) {
                    setConfirmReport(true);
                  }
                }}
                disabled={submitting || !formData.title || !formData.description}
                loading={submitting}
              >
                {submitting ? 'Reporting...' : 'Report Breach'}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowReportModal(false);
                  setErrors({});
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Draft ICO Notification modal */}
      {icoDraftOpen && (
        <Modal
          isOpen={icoDraftOpen}
          onClose={closeIcoDraftModal}
          title={icoDraftBreach ? `Draft ICO notification — ${icoDraftBreach.title}` : 'Draft ICO notification'}
          size="3xl"
        >
          <div className="space-y-4">
            {icoDraftLoading && (
              <div className="py-16 flex flex-col items-center justify-center gap-4">
                <LoadingSpinner size="lg" />
                <p className="text-sm text-gray-700 text-center max-w-md font-medium">
                  Seema is drafting your ICO notification…
                </p>
                <p className="text-xs text-gray-500 text-center max-w-md">
                  This typically takes 20–40 seconds. We&apos;re mapping the breach record to the
                  ICO&apos;s required headings under UK GDPR Article 33.
                </p>
              </div>
            )}

            {!icoDraftLoading && icoDraftError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">Drafting failed</p>
                <p className="text-sm text-red-700 mt-1">{icoDraftError}</p>
                <p className="text-xs text-red-600 mt-2">
                  You can close this dialog and try again, or proceed manually using the ICO
                  breach notification form.
                </p>
              </div>
            )}

            {!icoDraftLoading && icoDraftResult && (
              <>
                {/* Prominent warning banner — must stay above the draft text. */}
                <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p className="font-bold">This is a draft. Do not submit without review.</p>
                    <p className="mt-1">
                      Review every section carefully before submitting to the ICO. Replace any
                      &quot;[TO BE COMPLETED BY COLP]&quot; placeholders with verified facts.
                      Seema AI will not invent facts — empty fields mean the breach record did
                      not contain the answer.
                    </p>
                  </div>
                </div>

                {/* Summary */}
                {icoDraftResult.summary && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs uppercase tracking-wide font-bold text-blue-800 mb-1">Summary</p>
                    <p className="text-sm text-gray-800">{icoDraftResult.summary}</p>
                  </div>
                )}

                {/* Notification body — section-by-section. Each section is an
                    editable textarea so the COLP can refine the AI draft
                    before copying to clipboard or pasting into the ICO form. */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-3">
                    Notification body (ICO required headings)
                  </h3>
                  <div className="space-y-3">
                    {ICO_SECTION_LABELS.map(({ key, label }) => {
                      const value = icoDraftSections[key] ?? icoDraftResult.sections?.[key] ?? '';
                      const isPlaceholder = !value || value.includes('[TO BE COMPLETED');
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border ${isPlaceholder ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}
                        >
                          <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-1">
                            {label}
                          </label>
                          <textarea
                            value={value}
                            onChange={(e) =>
                              setIcoDraftSections(prev => ({ ...prev, [key]: e.target.value }))
                            }
                            rows={Math.min(8, Math.max(2, Math.ceil((value || '').length / 80)))}
                            className={`w-full px-2 py-1.5 text-sm rounded border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${isPlaceholder ? 'text-amber-800 italic border-amber-300' : 'text-gray-800 border-gray-300'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommended next steps */}
                {icoDraftResult.recommended_next_steps && icoDraftResult.recommended_next_steps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-2">
                      Recommended next steps
                    </h3>
                    <ul className="space-y-2">
                      {icoDraftResult.recommended_next_steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded border">
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 flex-shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="text-sm text-gray-800">{step}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Regulatory references */}
                {icoDraftResult.regulatory_references && icoDraftResult.regulatory_references.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-2">
                      Regulatory references
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {icoDraftResult.regulatory_references.map((ref, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-slate-100 border border-slate-200 text-slate-700 rounded text-xs font-medium"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence note */}
                {icoDraftResult.confidence_note && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs uppercase tracking-wide font-bold text-gray-600 mb-1">
                      Confidence note from Seema AI
                    </p>
                    <p className="text-sm text-gray-700">{icoDraftResult.confidence_note}</p>
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button onClick={copyIcoDraftToClipboard} className="flex-1 min-w-[180px]">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to clipboard
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => icoDraftBreach && handleMarkAsNotified(icoDraftBreach)}
                    disabled={!icoDraftBreach || markingNotified || isAlreadyNotified(icoDraftBreach!)}
                    loading={markingNotified}
                    className="flex-1 min-w-[180px]"
                  >
                    {icoDraftBreach && isAlreadyNotified(icoDraftBreach)
                      ? 'Already notified'
                      : 'Mark as notified to ICO'}
                  </Button>
                  <Button variant="outline" onClick={closeIcoDraftModal} className="flex-1 min-w-[100px]">
                    Close
                  </Button>
                </div>

                {/* Legal-basis footnote — required by spec for any
                    deadline-driven UI in this product. The COLP must be
                    able to point at a regulation when justifying actions. */}
                <p className="text-[11px] text-gray-500 text-center pt-3 border-t">
                  Authority: UK GDPR Article 33(1) (notification to the
                  supervisory authority within 72 hours)
                  {' · '}Article 33(3) (required content of the
                  notification — nature of breach, categories and
                  approximate number of data subjects, likely consequences,
                  measures taken)
                  {' · '}Data Protection Act 2018 s.67
                </p>

                <p className="text-xs text-gray-400 text-center pt-1">
                  Drafted by Seema AI&apos;s Regulatory Intelligence — review required before submission.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmReport}
        onConfirm={handleReportBreach}
        onCancel={() => setConfirmReport(false)}
        title="Confirm Breach Report"
        message="This will report the breach to your compliance records. Please ensure all information is accurate."
        confirmLabel="Report Breach"
        variant="warning"
      />
    </div>
  );
}
