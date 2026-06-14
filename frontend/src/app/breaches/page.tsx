'use client';

/**
 * Breach Logs — the firm's breach register and 8-phase reporting workflow.
 *
 * Wired to /compliance/breach-reports: list, create, advance through the
 * workflow (triage/classification, notifications, investigation), draft the SRA
 * report with AI, and record the COLP sign-off. Each breach auto-creates a
 * linked remediation plan. SRA Code for Firms para 3.9 / Code for Solicitors 7.7.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';
import {
  Shield, Plus, X, Check, Loader2, Sparkles,
  Download, ChevronRight,
} from 'lucide-react';

// ── Types ──
interface Breach {
  id: string;
  breach_ref: string | null;
  title: string;
  description: string | null;
  breach_type: string | null;
  severity: string;
  status: string;
  classification: string | null;
  tracks: string[];
  phase: number;
  reported_date: string | null;
  detected_at: string | null;
  ico_deadline: string | null;
  notification_status: string | null;
  affected_records: number | null;
  root_cause: string | null;
  remediation_plan_id: string | null;
  workflow_data: Record<string, any>;
  sra_report_draft: string | null;
  sra_report_drafted_at: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const PHASES = [
  'Initial response', 'Triage & classify', 'Notifications', 'Investigation',
  'SRA report', 'Submission', 'Response & remediation', 'Close',
];

const SRA_INDICATORS = [
  'Involves or suggests dishonesty',
  'Sexual misconduct, violence, or discrimination',
  'Loss of confidential client information',
  'Significant breach of the SRA Accounts Rules',
  'Risk of harm to clients, the public, or the administration of justice',
  'Misleading or attempting to mislead the SRA, court, or clients',
  'Persistent, repeated, or systemic behaviour',
  'Failure of risk-management systems and controls',
  'Insolvency-related events',
  'Criminal convictions, charges, or cautions',
  'Failure of management or governance of the firm',
];

const NOTIFY_PARTIES = [
  'Affected client(s)', 'PII broker', 'ICO / DP partner', 'Managing partners',
  'COFA', 'External regulatory counsel', 'Legal Ombudsman', 'NCA / HMRC',
];

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function severityPill(sev: string) {
  const m: Record<string, string> = {
    critical: 'bg-red-100 text-red-800', high: 'bg-red-100 text-red-800',
    serious: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800',
    minor: 'bg-amber-100 text-amber-800', low: 'bg-gray-100 text-gray-700',
  };
  return m[sev?.toLowerCase()] || 'bg-gray-100 text-gray-700';
}
function statusPill(status: string) {
  const m: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800', investigating: 'bg-amber-100 text-amber-800',
    reported: 'bg-emerald-100 text-emerald-800', resolved: 'bg-gray-100 text-gray-600',
    closed: 'bg-gray-100 text-gray-600', archived: 'bg-gray-100 text-gray-600',
  };
  return m[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
}

function icoCountdown(deadline?: string | null): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (isNaN(ms)) return null;
  if (ms <= 0) return { label: 'ICO deadline passed', urgent: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { label: `${h}h ${m}m to ICO deadline`, urgent: h < 24 };
}

export default function BreachesPage() {
  useRequireAuth();
  const user = useAuthStore((s) => s.user);

  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const [detail, setDetail] = useState<Breach | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBreach, setWizardBreach] = useState<Breach | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/compliance/breach-reports');
      const list: Breach[] = Array.isArray(res.data) ? res.data : [];
      setBreaches(list);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load breaches');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const kpis = useMemo(() => {
    const open = breaches.filter((b) => ['open', 'investigating'].includes(b.status)).length;
    const triage = breaches.filter((b) => !b.classification && b.status === 'open').length;
    const seriousOpen = breaches.filter((b) => b.classification === 'serious' && !['reported', 'closed', 'resolved'].includes(b.status)).length;
    const year = String(new Date().getFullYear());
    const reportedYtd = breaches.filter((b) => b.status === 'reported' && (b.reported_date || '').includes(year)).length;
    const icoOpen = breaches.filter((b) => icoCountdown(b.ico_deadline) && !b.signed_off_at && ['open', 'investigating'].includes(b.status)).length;
    return [
      { lbl: 'Open breaches', val: String(open), tone: '' },
      { lbl: 'Pending triage', val: String(triage), tone: triage ? 'text-amber-600' : '' },
      { lbl: 'Serious — open', val: String(seriousOpen), tone: seriousOpen ? 'text-red-600' : '' },
      { lbl: 'ICO clock running', val: String(icoOpen), tone: icoOpen ? 'text-amber-600' : '' },
      { lbl: 'Reported YTD', val: String(reportedYtd), tone: '' },
      { lbl: 'Total logged', val: String(breaches.length), tone: '' },
    ];
  }, [breaches]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'triage': return breaches.filter((b) => !b.classification && b.status === 'open');
      case 'investigating': return breaches.filter((b) => b.status === 'open' && b.phase >= 2 && b.phase < 6);
      case 'serious': return breaches.filter((b) => b.classification === 'serious' && !['reported', 'closed', 'resolved'].includes(b.status));
      case 'reported': return breaches.filter((b) => b.status === 'reported');
      case 'closed': return breaches.filter((b) => ['closed', 'resolved', 'archived'].includes(b.status));
      default: return breaches;
    }
  }, [breaches, tab]);

  const tabs = [
    { id: 'all', label: 'All', count: breaches.length },
    { id: 'triage', label: 'Pending triage', count: breaches.filter((b) => !b.classification && b.status === 'open').length },
    { id: 'investigating', label: 'Investigating', count: breaches.filter((b) => b.status === 'open' && b.phase >= 2 && b.phase < 6).length },
    { id: 'serious', label: 'Serious → SRA', count: breaches.filter((b) => b.classification === 'serious' && !['reported', 'closed', 'resolved'].includes(b.status)).length },
    { id: 'reported', label: 'Reported', count: breaches.filter((b) => b.status === 'reported').length },
    { id: 'closed', label: 'Closed', count: breaches.filter((b) => ['closed', 'resolved', 'archived'].includes(b.status)).length },
  ];

  const exportCsv = () => {
    const rows = [['Ref', 'Title', 'Type', 'Severity', 'Classification', 'Status', 'Detected', 'ICO deadline']];
    breaches.forEach((b) => rows.push([
      b.breach_ref || b.id, b.title, b.breach_type || '', b.severity, b.classification || '',
      b.status, fmtDate(b.detected_at), fmtDate(b.ico_deadline),
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `breach-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
  };

  const openNew = () => { setWizardBreach(null); setWizardOpen(true); };
  const openExisting = (b: Breach) => { setWizardBreach(b); setWizardOpen(true); setDetail(null); };

  const urgent = useMemo(() => {
    const cands = breaches
      .filter((b) => ['open', 'investigating'].includes(b.status) && b.ico_deadline && !b.signed_off_at)
      .sort((a, b) => new Date(a.ico_deadline!).getTime() - new Date(b.ico_deadline!).getTime());
    return cands[0] || null;
  }, [breaches]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-seema-text-primary flex items-center gap-2">
            <Shield className="h-6 w-6 text-seema-primary" /> Breach Logs
          </h1>
          <p className="text-sm text-seema-text-secondary mt-1">
            SRA reporting and internal log · <span className="text-purple-600 font-medium">Code for Firms para 3.9</span> ·{' '}
            <span className="text-purple-600 font-medium">Code for Solicitors para 7.7</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button onClick={exportCsv} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50">
            <Download size={15} /> Export log (CSV)
          </button>
          <button onClick={openNew} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
            <Plus size={16} /> Log new breach
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.lbl} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wide text-seema-text-muted font-medium">{k.lbl}</p>
            <p className={`text-2xl font-semibold mt-1.5 text-seema-sidebar-bg ${k.tone}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Alert strip */}
      {urgent && (() => {
        const c = icoCountdown(urgent.ico_deadline);
        return (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-wrap items-center gap-4">
            <div className="h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold flex-shrink-0">!</div>
            <div className="flex-1 min-w-[200px] text-sm text-red-900">
              <strong>{urgent.breach_ref || 'Breach'} — ICO clock running.</strong> {urgent.title}.
            </div>
            {c && <div className={`text-sm font-semibold px-3 py-1 rounded-md border bg-white ${c.urgent ? 'text-red-700 border-red-300' : 'text-amber-700 border-amber-300'}`}>{c.label}</div>}
            <button onClick={() => openExisting(urgent)} className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Open</button>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-seema-sidebar-bg text-seema-sidebar-bg font-semibold' : 'border-transparent text-seema-text-muted hover:text-seema-text-primary'}`}>
            {t.label}
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${tab === t.id ? 'bg-seema-sidebar-bg text-white' : 'bg-gray-100 text-gray-600'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {['Ref / Source', 'Detected', 'Summary', 'Tracks', 'Severity', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-wide text-seema-text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-seema-text-muted">Loading breaches…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-seema-text-muted">No breaches in this view. Click “Log new breach” to start.</td></tr>
              ) : filtered.map((b) => (
                <tr key={b.id} onClick={() => setDetail(b)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3"><div className="font-semibold text-seema-sidebar-bg">{b.breach_ref || '—'}</div><div className="text-[11px] text-seema-text-muted">{b.breach_type || 'breach'}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(b.detected_at)}</td>
                  <td className="px-4 py-3"><div className="font-medium text-seema-text-primary line-clamp-2 max-w-md">{b.title}</div></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(b.tracks || []).map((t) => (
                        <span key={t} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${t === 'ICO' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'}`}>{t}</span>
                      ))}
                      {(!b.tracks || b.tracks.length === 0) && <span className="text-seema-text-muted">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${severityPill(b.classification || b.severity)}`}>{b.classification || b.severity}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill(b.status)}`}>{b.status}{b.phase ? ` · P${b.phase}` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <DetailPanel breach={detail} onClose={() => setDetail(null)} onContinue={() => openExisting(detail)} />}
      {wizardOpen && (
        <BreachWizard
          initial={wizardBreach}
          colpName={(user as any)?.name || 'COLP'}
          onClose={() => { setWizardOpen(false); load(); }}
          onSaved={(b) => { setWizardBreach(b); setBreaches((prev) => { const i = prev.findIndex((x) => x.id === b.id); if (i === -1) return [b, ...prev]; const c = [...prev]; c[i] = b; return c; }); }}
          setError={setError}
        />
      )}
    </div>
  );
}

/* ──────────────── Detail slide-panel ──────────────── */
function DetailPanel({ breach, onClose, onContinue }: { breach: Breach; onClose: () => void; onContinue: () => void }) {
  const wf = breach.workflow_data || {};
  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-seema-sidebar-bg line-clamp-2">{breach.title}</h3>
            <p className="text-[11px] text-seema-text-muted font-mono mt-0.5">{breach.breach_ref} · detected {fmtDateTime(breach.detected_at)}</p>
            <div className="flex gap-1 mt-2 flex-wrap">
              {(breach.tracks || []).map((t) => <span key={t} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${t === 'ICO' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'}`}>{t}</span>)}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill(breach.status)}`}>{breach.status} · P{breach.phase}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-200 text-seema-text-muted"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          <Section title="Facts">
            <Grid rows={[
              ['Type', breach.breach_type || '—'],
              ['Severity', breach.classification || breach.severity],
              ['Detected', fmtDateTime(breach.detected_at)],
              ['Affected records', breach.affected_records != null ? String(breach.affected_records) : '—'],
              ['ICO deadline', fmtDateTime(breach.ico_deadline)],
              ['Root cause', breach.root_cause || '—'],
            ]} />
          </Section>
          {breach.description && <Section title="Description"><p className="text-seema-text-primary leading-relaxed">{breach.description}</p></Section>}
          {Array.isArray(wf.notifications) && wf.notifications.length > 0 && (
            <Section title="Notifications">
              <div className="space-y-1">
                {wf.notifications.map((n: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-gray-100 py-1">
                    <span>{n.party}</span><span className={n.done ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{n.done ? '✓ Done' : 'Pending'}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {breach.sra_report_draft && (
            <Section title="SRA report draft">
              <pre className="whitespace-pre-wrap font-sans text-[13px] bg-gray-50 border border-gray-200 rounded-md p-3 max-h-64 overflow-y-auto">{breach.sra_report_draft}</pre>
            </Section>
          )}
          {breach.remediation_plan_id && (
            <Section title="Remediation">
              <a href="/remediation" className="text-seema-primary font-medium inline-flex items-center gap-1">Linked remediation plan <ChevronRight size={14} /></a>
            </Section>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button onClick={onContinue} className="px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover inline-flex items-center gap-2">Continue workflow <ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h5 className="text-[11px] uppercase tracking-wide text-seema-text-muted font-semibold mb-2">{title}</h5>{children}</div>;
}
function Grid({ rows }: { rows: [string, string][] }) {
  return <div className="grid grid-cols-[120px_1fr] gap-1.5">{rows.map(([k, v]) => (<div key={k} className="contents"><div className="text-seema-text-muted">{k}</div><div className="text-seema-text-primary font-medium">{v}</div></div>))}</div>;
}

/* ──────────────── 8-phase wizard ──────────────── */
function BreachWizard({ initial, colpName, onClose, onSaved, setError }: {
  initial: Breach | null;
  colpName: string;
  onClose: () => void;
  onSaved: (b: Breach) => void;
  setError: (s: string | null) => void;
}) {
  const [breach, setBreach] = useState<Breach | null>(initial);
  const [phase, setPhase] = useState(initial?.phase || 1);
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const wf = breach?.workflow_data || {};
  const [title, setTitle] = useState(initial?.title || '');
  const [breachType, setBreachType] = useState(initial?.breach_type || 'data');
  const [severity, setSeverity] = useState(initial?.severity || 'medium');
  const [detectedAt, setDetectedAt] = useState(initial?.detected_at ? initial.detected_at.slice(0, 16) : '');
  const [description, setDescription] = useState(initial?.description || '');
  const [affected, setAffected] = useState(initial?.affected_records != null ? String(initial.affected_records) : '0');

  const [classification, setClassification] = useState(initial?.classification || '');
  const [tracks, setTracks] = useState<string[]>(initial?.tracks || []);
  const [indicators, setIndicators] = useState<string[]>(wf.indicators || []);
  const [colpReasoning, setColpReasoning] = useState(wf.colp_reasoning || '');

  const [notifications, setNotifications] = useState<{ party: string; done: boolean }[]>(
    wf.notifications || NOTIFY_PARTIES.map((p) => ({ party: p, done: false }))
  );
  const [rootCause, setRootCause] = useState(initial?.root_cause || '');
  const [findings, setFindings] = useState(wf.findings || '');
  const [report, setReport] = useState<string | null>(initial?.sra_report_draft || null);
  const [signName, setSignName] = useState(initial?.signed_off_by || colpName);
  const [submitMethod, setSubmitMethod] = useState(wf.submit_method || 'email');
  const [lessons, setLessons] = useState(wf.lessons || '');

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const saveAndNext = async (next: number) => {
    setBusy(true); setError(null);
    try {
      let saved = breach;
      if (phase === 1) {
        const payload: any = {
          title: title.trim() || 'Untitled breach',
          breach_type: breachType,
          severity,
          detected_at: detectedAt ? new Date(detectedAt).toISOString() : undefined,
          description,
          affected_records: parseInt(affected, 10) || 0,
          phase: 2,
          workflow_data: { phase1: { description } },
        };
        if (!breach) {
          const res = await apiClient.post('/compliance/breach-report', payload);
          saved = res.data;
        } else {
          const res = await apiClient.patch(`/compliance/breach-reports/${breach.id}`, payload);
          saved = res.data;
        }
      } else if (breach) {
        const patch: any = { phase: next };
        if (phase === 2) {
          patch.classification = classification || null;
          patch.tracks = tracks;
          patch.workflow_data = { indicators, colp_reasoning: colpReasoning };
        } else if (phase === 3) {
          patch.workflow_data = { notifications };
          patch.notification_status = notifications.every((n) => n.done) ? 'completed' : 'pending';
        } else if (phase === 4) {
          patch.root_cause = rootCause;
          patch.workflow_data = { findings };
        } else if (phase === 6) {
          patch.workflow_data = { submit_method: submitMethod };
        } else if (phase === 8) {
          patch.status = 'closed';
          patch.workflow_data = { lessons };
        }
        const res = await apiClient.patch(`/compliance/breach-reports/${breach.id}`, patch);
        saved = res.data;
      }
      if (saved) { setBreach(saved); onSaved(saved); }
      setPhase(next);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    } finally { setBusy(false); }
  };

  const generateReport = async () => {
    if (!breach) { setError('Create the breach first (complete phase 1).'); return; }
    setAiLoading(true); setError(null);
    try {
      const res = await apiClient.post(`/compliance/breach-reports/${breach.id}/sra-report`, undefined, { timeout: 120000 });
      setReport(res.data?.report?.content || null);
      if (res.data?.breach) { setBreach(res.data.breach); onSaved(res.data.breach); }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not generate the SRA report');
    } finally { setAiLoading(false); }
  };

  const signOff = async () => {
    if (!breach) return;
    setBusy(true); setError(null);
    try {
      const res = await apiClient.post(`/compliance/breach-reports/${breach.id}/sign-off`, { signed_off_by: signName.trim(), confirm: true });
      setBreach(res.data); onSaved(res.data); setPhase(6);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Sign-off failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-seema-sidebar-bg/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{breach ? `Breach ${breach.breach_ref}` : 'Log a breach'}</h2>
            <p className="text-xs text-seema-text-muted">{breach ? 'Auto-saving each phase' : 'Phase 1 creates the record'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-200 text-seema-text-muted"><X size={22} /></button>
        </div>

        {/* Phase nav */}
        <div className="flex gap-1 px-6 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto">
          {PHASES.map((p, i) => {
            const n = i + 1; const active = n === phase; const done = n < phase;
            return (
              <button key={p} onClick={() => breach && setPhase(n)} disabled={!breach && n > 1}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs whitespace-nowrap flex-shrink-0 border ${active ? 'bg-white border-seema-sidebar-bg text-seema-sidebar-bg font-semibold' : 'border-transparent text-seema-text-muted hover:bg-white disabled:opacity-40'}`}>
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-seema-sidebar-bg text-white' : 'bg-gray-200 text-seema-text-muted'}`}>{done ? '✓' : n}</span>
                {n} · {p}
              </button>
            );
          })}
        </div>

        {/* Phase content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {phase === 1 && (
            <Phase title="Phase 1 · Initial response" sub="Capture detection, the facts, and containment. Completing this phase creates the breach record.">
              <FieldGrid>
                <Field label="Breach title *"><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" placeholder="e.g. Email with client records sent to wrong recipient" /></Field>
                <Field label="Type"><select value={breachType} onChange={(e) => setBreachType(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100">{['data', 'client money', 'confidentiality', 'aml', 'conflict', 'supervision', 'undertaking', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
                <Field label="Severity"><select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100">{['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
                <Field label="Detected at"><input type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" /></Field>
                <Field label="Affected records / subjects"><input type="number" min="0" value={affected} onChange={(e) => setAffected(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" /></Field>
              </FieldGrid>
              <Field label="What happened (factual)"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 min-h-[100px]" placeholder="Factual account only — avoid blame at this stage." /></Field>
            </Phase>
          )}

          {phase === 2 && (
            <Phase title="Phase 2 · Triage & classify" sub="Apply the SRA's serious-breach indicators and decide. The COLP reasoning is what an SRA inspector reads first.">
              <Field label="SRA serious-breach indicators (tick all that apply)">
                <div className="space-y-1.5">
                  {SRA_INDICATORS.map((ind) => (
                    <label key={ind} className={`flex items-start gap-2 p-2 rounded-md border text-sm cursor-pointer ${indicators.includes(ind) ? 'bg-purple-50 border-purple-300' : 'bg-white border-gray-200'}`}>
                      <input type="checkbox" checked={indicators.includes(ind)} onChange={() => toggle(indicators, ind, setIndicators)} className="mt-0.5" />
                      <span>{ind}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <FieldGrid>
                <Field label="COLP classification *">
                  <select value={classification} onChange={(e) => setClassification(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100">
                    <option value="">— select —</option>
                    <option value="serious">Serious → report to SRA (Code 3.9)</option>
                    <option value="minor">Minor → log only</option>
                    <option value="not_breach">Not a breach → close with reasoning</option>
                  </select>
                </Field>
                <Field label="Tracks engaged">
                  <div className="flex gap-2 pt-1.5">
                    {['ICO', 'SRA'].map((t) => (
                      <button key={t} type="button" onClick={() => toggle(tracks, t, setTracks)} className={`px-3 py-1.5 rounded-md text-sm font-medium border ${tracks.includes(t) ? (t === 'ICO' ? 'bg-teal-100 text-teal-800 border-teal-300' : 'bg-purple-100 text-purple-800 border-purple-300') : 'bg-white text-seema-text-muted border-gray-300'}`}>{t}{tracks.includes(t) ? ' ✓' : ''}</button>
                    ))}
                  </div>
                </Field>
              </FieldGrid>
              <Field label="COLP reasoning"><textarea value={colpReasoning} onChange={(e) => setColpReasoning(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 min-h-[90px]" placeholder="Why this classification — cite the indicators that apply." /></Field>
            </Phase>
          )}

          {phase === 3 && (
            <Phase title="Phase 3 · Notifications" sub="Notify the right parties in the right order. Tick when each is done.">
              <div className="space-y-2">
                {notifications.map((n, i) => (
                  <label key={n.party} className={`flex items-center justify-between p-3 rounded-md border text-sm cursor-pointer ${n.done ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200'}`}>
                    <span className="font-medium text-seema-text-primary">{n.party}</span>
                    <span className="flex items-center gap-2">
                      <span className={n.done ? 'text-emerald-700' : 'text-amber-600'}>{n.done ? 'Done' : 'Pending'}</span>
                      <input type="checkbox" checked={n.done} onChange={() => setNotifications((prev) => prev.map((x, j) => j === i ? { ...x, done: !x.done } : x))} />
                    </span>
                  </label>
                ))}
              </div>
            </Phase>
          )}

          {phase === 4 && (
            <Phase title="Phase 4 · Investigation" sub="Establish what happened, why, and whether it can recur. Feeds the SRA report.">
              <FieldGrid>
                <Field label="Primary root cause"><select value={rootCause} onChange={(e) => setRootCause(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100">{['', 'Human error', 'System gap', 'Training gap', 'Supervision failure', 'Control absent', 'Deliberate non-compliance', 'Third-party failure', 'Unknown — investigating'].map((r) => <option key={r} value={r}>{r || '— select —'}</option>)}</select></Field>
              </FieldGrid>
              <Field label="Findings summary"><textarea value={findings} onChange={(e) => setFindings(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 min-h-[120px]" placeholder="What the investigation established." /></Field>
            </Phase>
          )}

          {phase === 5 && (
            <Phase title="Phase 5 · SRA report" sub="The AI drafts a 15-section report; the COLP reviews, edits, and signs.">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <p className="text-sm text-seema-text-muted">Code for Firms para 3.9 report. Saved against this breach.</p>
                <button disabled={aiLoading || !breach} onClick={generateReport} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 disabled:opacity-60">
                  {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{report ? 'Regenerate report' : 'Generate SRA report (AI)'}
                </button>
              </div>
              {report && <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-50 border border-gray-200 rounded-md p-4 max-h-[360px] overflow-y-auto mb-4">{report}</pre>}
              {breach?.signed_off_at ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 text-sm text-emerald-800 flex items-center gap-2"><Check size={18} /> Signed off by <strong>{breach.signed_off_by}</strong> on {fmtDateTime(breach.signed_off_at)}.</div>
              ) : (
                <div className="bg-seema-sidebar-bg text-white rounded-lg p-5">
                  <h4 className="font-semibold mb-2 text-sm">COLP electronic sign-off</h4>
                  <input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="COLP full name" className="w-full sm:w-80 px-3 py-2 rounded-md text-seema-text-primary text-sm mb-3" />
                  <p className="text-xs text-white/80 mb-4">I confirm I have reviewed this report and that the facts stated are true to the best of my knowledge, and I authorise its submission to the SRA.</p>
                  <div className="flex justify-end">
                    <button disabled={busy || !report || !signName.trim()} onClick={signOff} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"><Check size={16} /> Sign and continue</button>
                  </div>
                </div>
              )}
            </Phase>
          )}

          {phase === 6 && (
            <Phase title="Phase 6 · Submission" sub="Choose how the signed report is submitted to the SRA.">
              <Field label="Submission method">
                <select value={submitMethod} onChange={(e) => setSubmitMethod(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100">
                  <option value="email">Email — report@sra.org.uk (recommended)</option>
                  <option value="mysra">mySRA portal upload</option>
                  <option value="letter">Letter — recorded delivery</option>
                  <option value="phone">Phone first + written follow-up</option>
                </select>
              </Field>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">After submitting to the SRA, record the acknowledgement and case-officer details in Phase 7.</div>
            </Phase>
          )}

          {phase === 7 && (
            <Phase title="Phase 7 · Response & remediation" sub="Track the SRA's response and run remediation in parallel.">
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm space-y-2">
                <p>Remediation is tracked in the linked plan. {breach?.remediation_plan_id ? <a href="/remediation" className="text-seema-primary font-medium">Open /remediation →</a> : 'A remediation plan was created with this breach.'}</p>
                <p className="text-seema-text-muted">Record the SRA acknowledgement date, reference, case officer and outcome here as they arrive.</p>
              </div>
            </Phase>
          )}

          {phase === 8 && (
            <Phase title="Phase 8 · Close & learn" sub="Close once the SRA is finished, remediation is delivered, and lessons are captured.">
              <Field label="Lessons learned / what we'll do differently"><textarea value={lessons} onChange={(e) => setLessons(e.target.value)} className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 min-h-[120px]" /></Field>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Continuing past this phase sets the breach status to <strong>Closed</strong>. The record remains on the breach log for inspection (6-year retention).</div>
            </Phase>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs text-seema-text-muted">{breach ? `${breach.breach_ref} · phase ${phase}/8` : 'New breach'}</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <button disabled={busy || phase <= 1} onClick={() => setPhase(Math.max(1, phase - 1))} className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50">← Back</button>
            {phase < 8 ? (
              <button disabled={busy} onClick={() => saveAndNext(phase + 1)} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} Save & continue →
              </button>
            ) : (
              <button disabled={busy} onClick={async () => { await saveAndNext(8); onClose(); }} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Close breach
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Phase({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (<div><h3 className="text-lg font-semibold mb-1">{title}</h3><p className="text-sm text-seema-text-muted mb-5">{sub}</p><div className="space-y-4">{children}</div></div>);
}
function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="block text-xs font-medium text-seema-text-muted uppercase tracking-wide mb-1.5">{label}</label>{children}</div>);
}
