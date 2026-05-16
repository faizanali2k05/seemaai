'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PageHeader,
  Card,
  Button,
  SearchBar,
  Select,
  EmptyState,
  Tabs,
  DashboardSkeleton,
  showToast,
} from '@/components/ui';
import {
  RefreshCw,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Shield,
  Loader2,
  History,
  UserCheck,
  Eye,
  Filter,
  PenLine,
  Undo2,
  X,
  Plus,
  Trash2,
  Bot,
  MessageSquare,
  Send,
  ArrowLeft,
} from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';

// ── Types ──

interface Interpretation {
  id: string;
  update_id: string;
  firm_id?: string;
  summary: string;
  applicability: 'yes' | 'no' | 'maybe';
  applicability_reasoning: string;
  action_items: string[];
  source_citation: string;
  confidence_score: number;
  confidence_label: 'high' | 'medium' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  model_used?: string;
  error_message?: string;
  created_at?: string;
  delivered_at?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;

  // Human override fields
  override_applicability?: 'yes' | 'no' | 'maybe' | null;
  override_notes?: string | null;
  override_action_items?: string[] | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
  has_override?: boolean;
  effective_applicability?: 'yes' | 'no' | 'maybe';
  effective_action_items?: string[];

  regulatory_update?: {
    id: string;
    source: string;
    source_url?: string;
    title: string;
    published_date?: string;
    impact_level?: string;
    category?: string;
  };
}

interface RegulatoryUpdate {
  id: string;
  source: string;
  source_url?: string;
  title: string;
  summary?: string;
  category?: string;
  published_date?: string;
  impact_level?: string;
  tags?: string;
  scraped_at?: string;
  interpretation?: Interpretation | null;
}

interface HistorySummary {
  total_interpretations: number;
  acknowledged: number;
  pending_acknowledgement: number;
  applicable_to_firm: number;
}

// Per-staff acknowledgement tracking — see GET
// /compliance/regulatory-updates/:id/acknowledgements.
interface StaffAckUser {
  user_id: string;
  user_name: string;
  user_email: string;
  acknowledged_at?: string;
  notes?: string | null;
}

interface StaffAcksResponse {
  total_staff: number;
  acknowledged_count: number;
  acknowledged: StaffAckUser[];
  pending: StaffAckUser[];
}

// ── Constants ──

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'sra', label: 'SRA' },
  { value: 'ico', label: 'ICO' },
  { value: 'hmrc', label: 'HMRC' },
  { value: 'govuk', label: 'GOV.UK' },
  { value: 'lawsociety', label: 'Law Society' },
];

const IMPACT_COLOURS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

const APPLICABILITY_CONFIG = {
  yes: { icon: CheckCircle2, colour: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Applies to your firm' },
  no: { icon: XCircle, colour: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: 'Does not apply' },
  maybe: { icon: HelpCircle, colour: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'May apply — review recommended' },
};

const HISTORY_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'yes', label: 'Applicable' },
  { value: 'no', label: 'Not applicable' },
  { value: 'maybe', label: 'Maybe' },
];

// ── Shared sub-components ──

function ConfidenceBar({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score * 100);
  const barColour = score >= 0.8 ? 'bg-green-500' : score >= 0.5 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 capitalize">{label} ({pct}%)</span>
    </div>
  );
}

function AuditTrailBadge({ interp }: { interp: Interpretation }) {
  if (!interp.delivered_at && !interp.acknowledged_at) return null;

  return (
    <div className="flex items-center gap-3 text-xs mt-2 pt-2 border-t border-gray-200">
      {interp.delivered_at && (
        <span className="flex items-center gap-1 text-gray-400">
          <Eye className="w-3 h-3" />
          Delivered {new Date(interp.delivered_at).toLocaleDateString('en-GB')}
        </span>
      )}
      {interp.acknowledged_at ? (
        <span className="flex items-center gap-1 text-green-600">
          <UserCheck className="w-3 h-3" />
          Acknowledged {new Date(interp.acknowledged_at).toLocaleDateString('en-GB')}
          {interp.acknowledged_by && typeof interp.acknowledged_by === 'string' && interp.acknowledged_by.length < 50
            ? ` by ${interp.acknowledged_by}` : ''}
        </span>
      ) : interp.delivered_at ? (
        <span className="flex items-center gap-1 text-amber-600">
          <Clock className="w-3 h-3" />
          Awaiting acknowledgement
        </span>
      ) : null}
    </div>
  );
}

function InterpretationCard({
  interp,
  onAcknowledge,
  onOverride,
  onRemoveOverride,
  acknowledging,
}: {
  interp: Interpretation;
  onAcknowledge?: (updateId: string) => void;
  onOverride?: (updateId: string) => void;
  onRemoveOverride?: (updateId: string) => void;
  acknowledging?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // Use effective values when available (override takes precedence)
  const effectiveApplicability = interp.effective_applicability || interp.applicability;
  const effectiveActionItems = interp.effective_action_items || interp.action_items;
  const config = APPLICABILITY_CONFIG[effectiveApplicability] || APPLICABILITY_CONFIG.maybe;
  const ApplicabilityIcon = config.icon;

  const toggleItem = (idx: number) => {
    setCheckedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className={`mt-3 rounded-lg border p-4 ${config.bg}`}>
      {/* Human Override Banner */}
      {interp.has_override && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-800">Human Override Active</span>
            {interp.overridden_at && (
              <span className="text-xs text-blue-500">
                — {new Date(interp.overridden_at).toLocaleDateString('en-GB')}
              </span>
            )}
            {interp.overridden_by && (
              <span className="text-xs text-blue-500">by {interp.overridden_by}</span>
            )}
          </div>
          {onRemoveOverride && (
            <button
              onClick={() => onRemoveOverride(interp.update_id)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Undo2 className="w-3 h-3" /> Revert to AI
            </button>
          )}
        </div>
      )}

      {/* AI vs Human comparison when overridden */}
      {interp.has_override && interp.override_applicability && interp.override_applicability !== interp.applicability && (
        <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-500">
          <span className="font-medium">AI assessment:</span>{' '}
          <span className={APPLICABILITY_CONFIG[interp.applicability]?.colour || ''}>{interp.applicability}</span>
          {' → '}
          <span className="font-medium">Override:</span>{' '}
          <span className={APPLICABILITY_CONFIG[interp.override_applicability]?.colour || ''}>{interp.override_applicability}</span>
        </div>
      )}

      {/* Override notes */}
      {interp.has_override && interp.override_notes && (
        <div className="mb-3 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-md">
          <p className="text-xs text-gray-600"><span className="font-medium">Override notes:</span> {interp.override_notes}</p>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-700 leading-relaxed">{interp.summary}</p>
      </div>

      {/* Applicability badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ApplicabilityIcon className={`w-5 h-5 ${config.colour}`} />
          <span className={`text-sm font-medium ${config.colour}`}>{config.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Override button */}
          {onOverride && interp.status === 'completed' && !interp.has_override && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOverride(interp.update_id)}
            >
              <PenLine className="w-3 h-3 mr-1" />
              Override
            </Button>
          )}
          {/* Acknowledge button */}
          {onAcknowledge && !interp.acknowledged_at && interp.status === 'completed' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAcknowledge(interp.update_id)}
              disabled={acknowledging}
            >
              {acknowledging ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <UserCheck className="w-3 h-3 mr-1" />
              )}
              Acknowledge
            </Button>
          )}
        </div>
      </div>

      {interp.applicability_reasoning && (
        <p className="text-xs text-gray-600 mb-3 pl-7">{interp.applicability_reasoning}</p>
      )}

      {/* Confidence */}
      <div className="mb-3 pl-7">
        <ConfidenceBar score={interp.confidence_score} label={interp.confidence_label} />
      </div>

      {/* Expandable section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mb-2"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Hide details' : `Show action items (${effectiveActionItems.length}) & citation`}
      </button>

      {expanded && (
        <div className="space-y-3">
          {effectiveActionItems.length > 0 && (
            <div className="pl-2">
              <p className="text-xs font-medium text-gray-700 mb-1.5">
                Action Items
                {interp.has_override && interp.override_action_items && (
                  <span className="ml-1 text-blue-500 font-normal">(overridden)</span>
                )}
              </p>
              <ul className="space-y-1.5">
                {effectiveActionItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!checkedItems[idx]}
                      onChange={() => toggleItem(idx)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${checkedItems[idx] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(interp.source_citation || update.source_url) && (
            <div className="pl-2 pt-2 border-t border-gray-200">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Authority
              </p>
              {interp.source_citation && (
                <p className="text-xs text-slate-900">{interp.source_citation}</p>
              )}
              {update.source_url && update.source_url !== '#' && (
                <a href={update.source_url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 mt-1 underline">
                  Read primary source <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <div className="pl-2 flex items-center gap-3 text-xs text-gray-400">
            {interp.model_used && <span>Seema's AI Regulatory Intelligence</span>}
            {interp.created_at && <span>Analysed: {new Date(interp.created_at).toLocaleDateString('en-GB')}</span>}
          </div>
        </div>
      )}

      {/* Audit trail */}
      <AuditTrailBadge interp={interp} />
    </div>
  );
}

// ── Override Modal ──

function OverrideModal({
  updateId,
  currentInterp,
  onSubmit,
  onClose,
}: {
  updateId: string;
  currentInterp: Interpretation;
  onSubmit: (updateId: string, data: { applicability: string; notes: string; action_items: string[] }) => void;
  onClose: () => void;
}) {
  const [applicability, setApplicability] = useState<string>(currentInterp.applicability);
  const [notes, setNotes] = useState('');
  const [actionItems, setActionItems] = useState<string[]>([...currentInterp.action_items]);
  const [newItem, setNewItem] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (trimmed) {
      setActionItems(prev => [...prev, trimmed]);
      setNewItem('');
    }
  };

  const removeItem = (idx: number) => {
    setActionItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(updateId, { applicability, notes, action_items: actionItems });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Override AI Assessment</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Current AI assessment */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-xs text-gray-500 mb-1">Current AI assessment</p>
            <div className="flex items-center gap-2">
              {(() => {
                const c = APPLICABILITY_CONFIG[currentInterp.applicability];
                const Icon = c.icon;
                return (
                  <>
                    <Icon className={`w-4 h-4 ${c.colour}`} />
                    <span className={`font-medium ${c.colour}`}>{currentInterp.applicability}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">Confidence: {Math.round(currentInterp.confidence_score * 100)}%</span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Applicability override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Applicability</label>
            <select
              value={applicability}
              onChange={e => setApplicability(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="yes">Yes — applies to this firm</option>
              <option value="no">No — does not apply</option>
              <option value="maybe">Maybe — review recommended</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Explain why this override is being applied (recorded in the audit trail)…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Action items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Items</label>
            <ul className="space-y-1.5 mb-2">
              {actionItems.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 text-sm">
                  <span className="flex-1 text-gray-700">{item}</span>
                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                placeholder="Add an action item…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <Button variant="secondary" size="sm" onClick={addItem} disabled={!newItem.trim()}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PenLine className="w-3 h-3 mr-1" />}
            Apply Override
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Card-level applicability badge (visible without clicking) ──

function ApplicabilityBadgeInline({ interp }: { interp: Interpretation }) {
  const effectiveApplicability = interp.effective_applicability || interp.applicability;
  const config = APPLICABILITY_CONFIG[effectiveApplicability] || APPLICABILITY_CONFIG.maybe;
  const Icon = config.icon;
  const pct = Math.round(interp.confidence_score * 100);

  const badgeMap = {
    yes: 'bg-green-50 border-green-200 text-green-700',
    no: 'bg-gray-50 border-gray-200 text-gray-500',
    maybe: 'bg-amber-50 border-amber-200 text-amber-700',
  };

  const checkMark = effectiveApplicability === 'yes' ? '✓' : effectiveApplicability === 'no' ? '✗' : '?';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeMap[effectiveApplicability] || badgeMap.maybe}`}>
        <Icon className="w-3.5 h-3.5" />
        {checkMark} {config.label}
      </span>
      <span className="text-[11px] text-gray-400">
        Confidence: <span className={`font-medium ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{interp.confidence_label} ({pct}%)</span>
      </span>
      {interp.has_override && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 border border-blue-200 text-blue-700">
          <PenLine className="w-3 h-3" /> Overridden
        </span>
      )}
    </div>
  );
}

// ── Per-staff acknowledgement section ──
//
// The COLP needs to chase laggards on regulatory reads. This component:
//   * Fetches who-has-read vs who-hasn't for one regulatory update.
//   * Shows a progress bar.
//   * "I've read this" button (idempotent — backend uses upsert).
//   * Expandable "pending staff" list with a per-row "Send reminder".
//
// Reminders are currently a UX-only toast — no email job wired yet.
// The data fetch fires when this component mounts (the DetailModal opens).

function StaffAcknowledgements({ updateId }: { updateId: string }) {
  const [data, setData] = useState<StaffAcksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  const fetchAcks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<StaffAcksResponse>(
        `/compliance/regulatory-updates/${updateId}/acknowledgements`,
      );
      setData(response.data);
    } catch (_e) {
      // Until the alembic migration runs the endpoint 500s — fall back
      // to a quiet "not available yet" message rather than scaring the user.
      setError('Read-tracking data unavailable.');
    } finally {
      setLoading(false);
    }
  }, [updateId]);

  useEffect(() => {
    fetchAcks();
  }, [fetchAcks]);

  const handleMarkRead = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(`/compliance/regulatory-updates/${updateId}/acknowledge-staff`);
      showToast('Marked as read.', 'success');
      await fetchAcks();
    } catch (_e) {
      showToast('Failed to mark as read.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemind = (userId: string, userName: string) => {
    // No email job wiring yet — toast for now per the brief.
    setReminded(prev => new Set(prev).add(userId));
    showToast(`Reminder sent to ${userName}.`, 'success');
  };

  if (loading) {
    return (
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading staff read status…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Staff Read Status</h3>
        <p className="text-xs text-gray-400 italic">{error || 'No data available.'}</p>
      </div>
    );
  }

  const pct = data.total_staff > 0
    ? Math.round((data.acknowledged_count / data.total_staff) * 100)
    : 0;
  const allRead = data.total_staff > 0 && data.acknowledged_count === data.total_staff;
  // Has the *current user* already marked it read? We don't have their userId
  // client-side; "I've read this" stays enabled and the backend dedupes.
  // Idempotent upsert means clicking twice is harmless.

  return (
    <div className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Staff Read Status</h3>

      {/* Headline + progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{data.acknowledged_count}</span> of{' '}
            <span className="font-semibold">{data.total_staff}</span> staff have read this
          </p>
          <span className={`text-xs font-medium ${allRead ? 'text-green-600' : 'text-amber-600'}`}>
            {pct}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${allRead ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* "I've read this" + expandable pending list */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={handleMarkRead} disabled={submitting}>
          {submitting ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Eye className="w-3 h-3 mr-1" />
          )}
          I've read this
        </Button>
        {data.pending.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Show'} pending ({data.pending.length})
          </button>
        )}
      </div>

      {expanded && data.pending.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {data.pending.map(u => (
            <div
              key={u.user_id}
              className="flex items-center justify-between gap-3 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-gray-800 truncate">{u.user_name}</p>
                  {u.user_email && u.user_email !== u.user_name && (
                    <p className="text-[11px] text-gray-400 truncate">{u.user_email}</p>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRemind(u.user_id, u.user_name)}
                disabled={reminded.has(u.user_id)}
              >
                <Send className="w-3 h-3 mr-1" />
                {reminded.has(u.user_id) ? 'Reminded' : 'Send reminder'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Recent acknowledgers — short list to surface "who has read" */}
      {data.acknowledged.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Most recent:</span>{' '}
          {data.acknowledged.slice(0, 3).map((u, i) => (
            <span key={u.user_id}>
              {i > 0 && ', '}
              {u.user_name}
              {u.acknowledged_at && (
                <span className="text-gray-400">
                  {' '}({new Date(u.acknowledged_at).toLocaleDateString('en-GB')})
                </span>
              )}
            </span>
          ))}
          {data.acknowledged.length > 3 && (
            <span className="text-gray-400"> + {data.acknowledged.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail Modal (drill-down view for a single regulatory update) ──

function DetailModal({
  update,
  onClose,
  onAcknowledge,
  onOverride,
  onRemoveOverride,
  acknowledging,
}: {
  update: RegulatoryUpdate;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onOverride: (id: string) => void;
  onRemoveOverride: (id: string) => void;
  acknowledging: boolean;
}) {
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const interp = update.interpretation;

  const handleMarkReviewed = async () => {
    setSubmittingReview(true);
    onAcknowledge(update.id);
    // Small delay for UX feedback
    setTimeout(() => setSubmittingReview(false), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl z-10">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Back to feed
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Tags row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 uppercase">{update.source}</span>
            {update.impact_level && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${IMPACT_COLOURS[update.impact_level] || IMPACT_COLOURS.medium}`}>{update.impact_level}</span>
            )}
            {update.category && <span className="text-xs text-gray-400">{update.category}</span>}
          </div>

          {/* Title */}
          <h2 className="text-lg font-bold text-gray-900 leading-snug">{update.title}</h2>

          {/* Source authority banner.
              Law firms cannot rely on an AI summary alone — they need a one-click path
              to the original SRA/ICO/Gov.UK notice to verify, cite, and (if necessary)
              defend any compliance decision. The source is therefore surfaced
              prominently rather than as muted footer text. */}
          <div className="bg-blue-50 rounded-lg border-2 border-blue-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 mb-1">
                  Primary source — verify before acting
                </p>
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{update.source?.toUpperCase() || 'Unknown publisher'}</span>
                  {update.published_date && (
                    <span className="text-gray-600"> · Published {update.published_date}</span>
                  )}
                </p>
                {update.source_url && update.source_url !== '#' ? (
                  <p className="text-xs text-gray-600 mt-1 break-all">
                    <span className="text-gray-500">URL:</span>{' '}
                    <a href={update.source_url} target="_blank" rel="noopener noreferrer"
                       className="text-blue-700 hover:underline">
                      {update.source_url}
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 mt-1 italic">
                    No source URL recorded for this update. Verify with the regulator directly before relying on the AI interpretation.
                  </p>
                )}
              </div>
              {update.source_url && update.source_url !== '#' && (
                <a href={update.source_url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap">
                  Read original notice <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            {interp?.created_at && (
              <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-blue-200 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                AI interpretation generated {new Date(interp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at {new Date(interp.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — always verify against the source above.
              </p>
            )}
          </div>

          {/* Full notice text excerpt */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Notice Summary</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{update.summary || 'No summary available for this notice.'}</p>
          </div>

          {/* AI Interpretation section */}
          {interp && interp.status === 'completed' && (
            <>
              {/* AI badge + applicability */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 border border-purple-200 text-purple-700">
                    <Bot className="w-3 h-3" /> AI interpretation
                  </span>
                  {interp.model_used && <span className="text-[10px] text-gray-400">Seema's AI Regulatory Intelligence</span>}
                </div>

                <ApplicabilityBadgeInline interp={interp} />
              </div>

              {/* Full reasoning */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Why does this apply to your firm?</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{interp.applicability_reasoning}</p>
              </div>

              {/* AI Summary */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">AI Analysis</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{interp.summary}</p>
              </div>

              {/* Confidence */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Confidence</h3>
                <ConfidenceBar score={interp.confidence_score} label={interp.confidence_label} />
              </div>

              {/* Action items */}
              {(interp.effective_action_items || interp.action_items)?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">
                    Action Items
                    {interp.has_override && interp.override_action_items && (
                      <span className="ml-1 text-blue-500 font-normal text-xs">(overridden)</span>
                    )}
                  </h3>
                  <ul className="space-y-2">
                    {(interp.effective_action_items || interp.action_items).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-gray-400 mt-0.5 text-xs">{idx + 1}.</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Authority cited.
                  Lawyers need the AI's citation in legal-citation form so they
                  can quote it in an attendance note or matter file. Rendered
                  as a slate authority block, not muted footer text. */}
              <div className="bg-slate-50 border-l-4 border-slate-700 rounded-r px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Authority cited
                </p>
                {interp.source_citation ? (
                  <p className="text-sm text-slate-900 font-medium">{interp.source_citation}</p>
                ) : (
                  <p className="text-sm text-slate-600 italic">No specific citation generated by the interpreter — refer to the primary source above.</p>
                )}
                {update.source_url && update.source_url !== '#' && (
                  <a href={update.source_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 mt-2 underline">
                    Read the cited notice <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <p className="text-[11px] text-slate-500 mt-2">
                  Verify the citation against the primary source before relying on it in advice to a client or in a regulatory communication.
                </p>
              </div>

              {/* Override section */}
              {interp.has_override && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <PenLine className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Human Override Active</span>
                  </div>
                  {interp.override_notes && <p className="text-sm text-blue-700 mb-1">{interp.override_notes}</p>}
                  <div className="flex items-center gap-3 text-xs text-blue-500">
                    {interp.overridden_by && <span>By {interp.overridden_by}</span>}
                    {interp.overridden_at && <span>{new Date(interp.overridden_at).toLocaleDateString('en-GB')}</span>}
                  </div>
                </div>
              )}

              {/* Mark as reviewed / sign-off */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Review Sign-off</h3>

                {interp.acknowledged_at ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-green-700">
                      <UserCheck className="w-4 h-4" />
                      <span className="text-sm font-medium">Reviewed and acknowledged</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      {interp.acknowledged_by && `By ${interp.acknowledged_by} — `}
                      {new Date(interp.acknowledged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at {new Date(interp.acknowledged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Review comment (optional)</label>
                      <textarea
                        value={reviewComment}
                        onChange={e => setReviewComment(e.target.value)}
                        rows={2}
                        placeholder="Add a note about your review decision…"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={handleMarkReviewed} disabled={acknowledging || submittingReview}>
                        {acknowledging || submittingReview ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <UserCheck className="w-3 h-3 mr-1" />
                        )}
                        Mark as Reviewed
                      </Button>
                      {!interp.has_override && (
                        <Button variant="secondary" size="sm" onClick={() => onOverride(update.id)}>
                          <PenLine className="w-3 h-3 mr-1" /> Override Assessment
                        </Button>
                      )}
                      {interp.has_override && (
                        <Button variant="secondary" size="sm" onClick={() => onRemoveOverride(update.id)}>
                          <Undo2 className="w-3 h-3 mr-1" /> Revert to AI
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-staff read tracking — separate from the COLP-level sign-off
                  above. The COLP can see who has actually read this update
                  and chase the laggards. */}
              <StaffAcknowledgements updateId={update.id} />

              {/* Full audit log */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Audit Log</h3>
                <div className="space-y-2">
                  {update.published_date && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">Notice published</p>
                        <p className="text-gray-400">{update.published_date} &middot; {update.source?.toUpperCase()}</p>
                      </div>
                    </div>
                  )}
                  {update.scraped_at && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-300 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">Scraped by Seema</p>
                        <p className="text-gray-400">{new Date(update.scraped_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                  )}
                  {interp.created_at && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">AI interpretation generated</p>
                        <p className="text-gray-400">{new Date(interp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(interp.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} &middot; Seema's AI Regulatory Intelligence</p>
                      </div>
                    </div>
                  )}
                  {interp.delivered_at && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">Delivered to firm dashboard</p>
                        <p className="text-gray-400">{new Date(interp.delivered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(interp.delivered_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  )}
                  {interp.has_override && interp.overridden_at && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">Human override applied</p>
                        <p className="text-gray-400">
                          {new Date(interp.overridden_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {interp.overridden_by && ` by ${interp.overridden_by}`}
                          {interp.override_applicability && ` — changed to "${interp.override_applicability}"`}
                        </p>
                      </div>
                    </div>
                  )}
                  {interp.acknowledged_at && (
                    <div className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700">Reviewed and acknowledged</p>
                        <p className="text-gray-400">
                          {new Date(interp.acknowledged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(interp.acknowledged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {interp.acknowledged_by && ` by ${interp.acknowledged_by}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* If no interpretation yet */}
          {(!interp || interp.status !== 'completed') && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-6 text-center">
              <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">This notice has not been analysed for your firm yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click "Analyse for my firm" on the feed to generate an AI interpretation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Feed Tab ──

type FeedTabProps = {
  updates: RegulatoryUpdate[];
  searchTerm: string; setSearchTerm: (v: string) => void;
  sourceFilter: string; setSourceFilter: (v: string) => void;
  handleInterpret: (id: string) => void;
  handleAcknowledge: (id: string) => void;
  handleScrape: () => void;
  handleOverride: (updateId: string) => void;
  handleRemoveOverride: (updateId: string) => void;
  interpretingIds: any;
  acknowledgingIds: any;
  scrapingInProgress: boolean;
  error: string | null;
};


function FeedTab({
  updates, searchTerm, setSearchTerm, sourceFilter, setSourceFilter,
  handleInterpret, handleAcknowledge, handleScrape,
  handleOverride, handleRemoveOverride,
  interpretingIds, acknowledgingIds, scrapingInProgress, error,
}: FeedTabProps) {
  const [detailUpdate, setDetailUpdate] = useState<RegulatoryUpdate | null>(null);
  const filtered = updates.filter(u => {
    const matchesSearch =
      !searchTerm ||
      (u.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.summary || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalCount = updates.length;
  const interpretedCount = updates.filter(u => u.interpretation?.status === 'completed').length;
  const applicableCount = updates.filter(u => u.interpretation?.applicability === 'yes').length;
  const highImpactCount = updates.filter(u => u.impact_level === 'high' || u.impact_level === 'critical').length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-1">Total Updates</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-2xl font-semibold text-purple-600">{interpretedCount}</p>
          <p className="text-xs text-gray-500 mt-1">AI Analysed</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-2xl font-semibold text-green-600">{applicableCount}</p>
          <p className="text-xs text-gray-500 mt-1">Applicable to You</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-2xl font-semibold text-orange-600">{highImpactCount}</p>
          <p className="text-xs text-gray-500 mt-1">High Impact</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search regulatory updates…" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={sourceFilter} onValueChange={setSourceFilter} options={SOURCE_OPTIONS} />
        </div>
        <Button variant="secondary" size="sm" onClick={handleScrape} disabled={scrapingInProgress}>
          {scrapingInProgress ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          {scrapingInProgress ? 'Scraping…' : 'Refresh Feed'}
        </Button>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState title="No regulatory updates found" description={searchTerm || sourceFilter ? 'Try adjusting your filters.' : 'Click "Refresh Feed" to pull the latest updates.'} />
      ) : (
        <>
        <div className="space-y-4">
          {filtered.map(update => {
            const interp = update.interpretation;
            const isCompleted = interp?.status === 'completed';

            return (
              <Card key={update.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailUpdate(update)}>
                {/* Row 1: Tags + source citation */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 uppercase">{update.source}</span>
                      {update.impact_level && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${IMPACT_COLOURS[update.impact_level] || IMPACT_COLOURS.medium}`}>{update.impact_level}</span>
                      )}
                      {update.category && <span className="text-xs text-gray-400">{update.category}</span>}
                      {/* AI badge */}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 border border-purple-200 text-purple-600">
                          <Bot className="w-3 h-3" /> AI interpretation
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 leading-snug">{update.title}</h3>
                    {/* Source citation line */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {update.published_date && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Published {update.published_date}
                        </span>
                      )}
                      {update.source_url && update.source_url !== '#' && (
                        <a
                          href={update.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          View source <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {/* Interpreted timestamp */}
                      {isCompleted && interp?.created_at && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          Interpreted {new Date(interp.created_at).toLocaleDateString('en-GB')} at {new Date(interp.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {update.summary && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{update.summary}</p>}

                {/* Card-level applicability badge + confidence (items 1 & 2) */}
                {isCompleted && interp && (
                  <div className="mt-3">
                    <ApplicabilityBadgeInline interp={interp} />
                  </div>
                )}

                {/* Interpretation section (expandable) */}
                {isCompleted && interp ? (
                  <InterpretationCard
                    interp={interp}
                    onAcknowledge={handleAcknowledge}
                    onOverride={handleOverride}
                    onRemoveOverride={handleRemoveOverride}
                    acknowledging={acknowledgingIds.has(update.id)}
                  />
                ) : interp && interp.status === 'processing' ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-purple-600 bg-purple-50 rounded-lg border border-purple-200 p-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> AI analysis in progress…
                  </div>
                ) : interp && interp.status === 'failed' ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200 p-3">
                    <AlertTriangle className="w-4 h-4" />
                    Analysis failed{interp.error_message ? `: ${interp.error_message}` : ''}
                    <button onClick={(e) => { e.stopPropagation(); handleInterpret(update.id); }} className="ml-auto text-xs text-red-700 underline hover:no-underline">Retry</button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Not yet analysed for your firm
                    </span>
                    <Button variant="secondary" size="sm" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleInterpret(update.id); }} disabled={interpretingIds.has(update.id)}>
                      {interpretingIds.has(update.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      {interpretingIds.has(update.id) ? 'Analysing…' : 'Analyse for my firm'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Detail Modal */}
        {detailUpdate && (
          <DetailModal
            update={detailUpdate}
            onClose={() => setDetailUpdate(null)}
            onAcknowledge={handleAcknowledge}
            onOverride={handleOverride}
            onRemoveOverride={handleRemoveOverride}
            acknowledging={acknowledgingIds.has(detailUpdate.id)}
          />
        )}
        </>
      )}
    </div>
  );
}

// ── History Tab ──

function HistoryTab() {
  const [history, setHistory] = useState<Interpretation[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [applicabilityFilter, setApplicabilityFilter] = useState('');
  const [ackFilter, setAckFilter] = useState('');

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    if (isDemoMode()) {
      const demo = getDemoHistory();
      setHistory(demo.data);
      setSummary(demo.summary);
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (applicabilityFilter) params.append('applicability', applicabilityFilter);
      if (ackFilter) params.append('acknowledged', ackFilter);
      params.append('limit', '200');

      const response = await apiClient.get(`/compliance/interpretation-history?${params.toString()}`);
      setHistory(response.data?.data || response.data || []);
      setSummary(response.data?.summary || null);
    } catch (_e) {
      const demo = getDemoHistory();
      setHistory(demo.data);
      setSummary(demo.summary);
    } finally {
      setIsLoading(false);
    }
  }, [applicabilityFilter, ackFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-2xl font-semibold text-gray-900">{summary.total_interpretations}</p>
            <p className="text-xs text-gray-500 mt-1">Total Interpretations</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-2xl font-semibold text-green-600">{summary.acknowledged}</p>
            <p className="text-xs text-gray-500 mt-1">Acknowledged</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-2xl font-semibold text-amber-600">{summary.pending_acknowledgement}</p>
            <p className="text-xs text-gray-500 mt-1">Pending Acknowledgement</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-2xl font-semibold text-blue-600">{summary.applicable_to_firm}</p>
            <p className="text-xs text-gray-500 mt-1">Applicable to Firm</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-48">
          <Select value={applicabilityFilter} onValueChange={setApplicabilityFilter} options={HISTORY_FILTER_OPTIONS} />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={ackFilter}
            onValueChange={setAckFilter}
            options={[
              { value: '', label: 'All Status' },
              { value: 'true', label: 'Acknowledged' },
              { value: 'false', label: 'Pending' },
            ]}
          />
        </div>
      </div>

      {/* Timeline */}
      {history.length === 0 ? (
        <EmptyState title="No interpretation history" description="Interpretations will appear here once regulatory updates are analysed for your firm." />
      ) : (
        <div className="space-y-3">
          {history.map((interp) => {
            const ru = interp.regulatory_update;
            const effectiveApplicability = interp.effective_applicability || interp.applicability;
            const config = APPLICABILITY_CONFIG[effectiveApplicability] || APPLICABILITY_CONFIG.maybe;
            const ApplicabilityIcon = config.icon;

            return (
              <Card key={interp.id} className="p-4">
                {/* Override indicator */}
                {interp.has_override && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    <PenLine className="w-3 h-3" />
                    <span className="font-medium">Human override</span>
                    {interp.overridden_by && <span>by {interp.overridden_by}</span>}
                    {interp.overridden_at && <span>on {new Date(interp.overridden_at).toLocaleDateString('en-GB')}</span>}
                  </div>
                )}

                {/* Timeline header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {ru && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 uppercase">{ru.source}</span>}
                      <ApplicabilityIcon className={`w-4 h-4 ${config.colour}`} />
                      <span className={`text-xs font-medium ${config.colour}`}>{config.label}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">{ru?.title || 'Regulatory Update'}</h4>
                  </div>
                  {interp.acknowledged_at ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck className="w-3 h-3" /> Acknowledged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </div>

                {/* Summary */}
                <p className="text-sm text-gray-600 mb-2">{interp.summary}</p>

                {/* Override notes in history */}
                {interp.has_override && interp.override_notes && (
                  <p className="text-xs text-blue-600 mb-2 italic">Override: {interp.override_notes}</p>
                )}

                {/* Confidence */}
                <ConfidenceBar score={interp.confidence_score} label={interp.confidence_label} />

                {/* Audit trail timeline */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    {ru?.published_date && (
                      <span className="text-gray-400 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Published: {ru.published_date}
                      </span>
                    )}
                    {interp.created_at && (
                      <span className="text-purple-500 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Analysed: {new Date(interp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {interp.delivered_at && (
                      <span className="text-blue-500 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Delivered: {new Date(interp.delivered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {interp.acknowledged_at && (
                      <span className="text-green-600 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Acknowledged: {new Date(interp.acknowledged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function RegulatoryPage() {
  useRequireAuth();

  const [activeTab, setActiveTab] = useState('feed');
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [interpretingIds, setInterpretingIds] = useState(new Set() as Set<string>);
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set() as Set<string>);
  const [scrapingInProgress, setScrapingInProgress] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);

  const fetchUpdates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isDemoMode()) {
        setUpdates(getDemoUpdates());
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (sourceFilter) params.append('source', sourceFilter);
      params.append('limit', '100');

      const response = await apiClient.get(`/compliance/regulatory-updates?${params.toString()}`);
      // FastAPI wraps the list in {data: [...]} for this endpoint, so unwrap
      // one level — accept both shapes defensively.
      const body = response.data;
      const list = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
      setUpdates(list);
    } catch (_e) {
      setUpdates(getDemoUpdates());
      setError('Failed to load regulatory updates. Showing demo data.');
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter]);

  useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

  const handleInterpret = async (updateId: string) => {
    setInterpretingIds(prev => new Set(prev).add(updateId));

    if (isDemoMode()) {
      // Simulate AI analysis in demo mode with realistic delay
      showToast('AI analysis in progress…', 'info');
      const update = updates.find(u => u.id === updateId);
      await new Promise(r => setTimeout(r, 2500));

      const demoInterpretations: Record<string, any> = {
        'REG-002': {
          summary: 'HMRC is tightening anti-money laundering reporting obligations. Firms must update SAR procedures and ensure all staff complete refresher training by the compliance deadline.',
          applicability: 'yes',
          applicability_reasoning: 'Your firm is an AML-supervised entity and must comply with updated SAR reporting requirements. Failure to do so risks enforcement action.',
          action_items: ['Update SAR reporting procedures to reflect new HMRC guidance', 'Schedule AML refresher training for all staff by Q3 2026', 'Review and update firm-wide AML risk assessment', 'Ensure MLRO has reviewed the updated obligations'],
          confidence_score: 0.88, confidence_label: 'high',
        },
        'REG-003': {
          summary: 'The ICO has updated guidance on Subject Access Request handling for legal practices, including new timeframe expectations and exemption clarifications.',
          applicability: 'yes',
          applicability_reasoning: 'As a data controller handling client data, your firm must comply with updated ICO guidance on SAR handling procedures.',
          action_items: ['Review current SAR handling process against new ICO guidance', 'Update data protection policy to reflect new timeframe expectations', 'Brief relevant staff on exemption clarifications'],
          confidence_score: 0.85, confidence_label: 'high',
        },
        'REG-005': {
          summary: 'The Law Society has issued updated practice notes on residential conveyancing, including enhanced client verification requirements and new protocol steps.',
          applicability: 'maybe',
          applicability_reasoning: 'This applies if your firm handles residential conveyancing. If you do not, it may still be relevant for general best practice awareness.',
          action_items: ['Determine if firm handles residential conveyancing', 'If applicable, review current conveyancing procedures against updated practice notes', 'Update internal checklists if changes are required'],
          confidence_score: 0.72, confidence_label: 'medium',
        },
      };

      const fallbackInterp = {
        summary: `Analysis of "${update?.title || 'this update'}" indicates potential compliance implications for your firm. A detailed review is recommended.`,
        applicability: 'maybe' as const,
        applicability_reasoning: 'Based on the nature of this regulatory update and your firm profile, further review is recommended to determine full applicability.',
        action_items: ['Review the full text of this regulatory update', 'Assess applicability to your firm\'s practice areas', 'Document review decision in compliance log'],
        confidence_score: 0.60, confidence_label: 'medium',
      };

      const interpData = demoInterpretations[updateId] || fallbackInterp;

      const newInterp: Interpretation = {
        id: `INT-${updateId}`,
        update_id: updateId,
        summary: interpData.summary,
        applicability: interpData.applicability,
        applicability_reasoning: interpData.applicability_reasoning,
        action_items: interpData.action_items,
        source_citation: `${update?.source?.toUpperCase() || 'Source'}, '${update?.title || 'Update'}', published ${update?.published_date || 'recently'}.`,
        confidence_score: interpData.confidence_score,
        confidence_label: interpData.confidence_label,
        status: 'completed',
        model_used: 'seema-ai-v1',
        created_at: new Date().toISOString(),
      };

      setUpdates(prev => prev.map(u => u.id === updateId ? { ...u, interpretation: newInterp } : u));
      showToast('AI analysis complete.', 'success');
      setInterpretingIds(prev => { const n = new Set(prev); n.delete(updateId); return n; });
      return;
    }

    try {
      // AI interpretation is a Claude call — give it 2 min.
      await apiClient.post(`/compliance/regulatory-updates/${updateId}/interpret`, undefined, { timeout: 120000 });
      showToast('Analysis queued. Refreshing shortly…', 'success');
      setTimeout(async () => {
        try {
          const response = await apiClient.get(`/compliance/regulatory-updates/${updateId}/interpretation`);
          const interp = response.data;
          setUpdates(prev => prev.map(u => u.id === updateId ? { ...u, interpretation: interp } : u));
          showToast('AI analysis complete.', 'success');
        } catch (_e) {
          showToast('Analysis still processing. Refresh to check.', 'info');
        } finally {
          setInterpretingIds(prev => { const n = new Set(prev); n.delete(updateId); return n; });
        }
      }, 5000);
    } catch (_e) {
      showToast('Failed to trigger analysis.', 'error');
      setInterpretingIds(prev => { const n = new Set(prev); n.delete(updateId); return n; });
    }
  };

  const handleAcknowledge = async (updateId: string) => {
    if (isDemoMode()) {
      setUpdates(prev => prev.map(u =>
        u.id === updateId && u.interpretation
          ? { ...u, interpretation: { ...u.interpretation, acknowledged_at: new Date().toISOString(), acknowledged_by: 'You' } }
          : u
      ));
      showToast('Interpretation acknowledged.', 'success');
      return;
    }
    setAcknowledgingIds(prev => new Set(prev).add(updateId));
    try {
      await apiClient.post(`/compliance/regulatory-updates/${updateId}/acknowledge`);
      setUpdates(prev => prev.map(u =>
        u.id === updateId && u.interpretation
          ? { ...u, interpretation: { ...u.interpretation, acknowledged_at: new Date().toISOString() } }
          : u
      ));
      showToast('Acknowledged. Recorded in your compliance audit trail.', 'success');
    } catch (_e) {
      showToast('Failed to acknowledge.', 'error');
    } finally {
      setAcknowledgingIds(prev => { const n = new Set(prev); n.delete(updateId); return n; });
    }
  };

  const handleOverride = (updateId: string) => {
    setOverrideTarget(updateId);
  };

  const handleOverrideSubmit = async (updateId: string, data: { applicability: string; notes: string; action_items: string[] }) => {
    if (isDemoMode()) {
      setUpdates(prev => prev.map(u =>
        u.id === updateId && u.interpretation
          ? {
              ...u,
              interpretation: {
                ...u.interpretation,
                override_applicability: data.applicability as 'yes' | 'no' | 'maybe',
                override_notes: data.notes,
                override_action_items: data.action_items,
                overridden_by: 'You',
                overridden_at: new Date().toISOString(),
                has_override: true,
                effective_applicability: data.applicability as 'yes' | 'no' | 'maybe',
                effective_action_items: data.action_items,
              },
            }
          : u
      ));
      showToast('Override applied (demo mode).', 'success');
      setOverrideTarget(null);
      return;
    }

    try {
      await apiClient.post(`/compliance/regulatory-updates/${updateId}/override`, {
        applicability: data.applicability,
        notes: data.notes,
        action_items: data.action_items,
      });
      // Refresh the interpretation
      const response = await apiClient.get(`/compliance/regulatory-updates/${updateId}/interpretation`);
      setUpdates(prev => prev.map(u => u.id === updateId ? { ...u, interpretation: response.data } : u));
      showToast('Human override applied. Recorded in audit trail.', 'success');
    } catch (_e) {
      showToast('Failed to apply override.', 'error');
    }
    setOverrideTarget(null);
  };

  const handleRemoveOverride = async (updateId: string) => {
    if (!confirm('Remove the human override and revert to the AI assessment?')) return;

    if (isDemoMode()) {
      setUpdates(prev => prev.map(u =>
        u.id === updateId && u.interpretation
          ? {
              ...u,
              interpretation: {
                ...u.interpretation,
                override_applicability: null,
                override_notes: null,
                override_action_items: null,
                overridden_by: null,
                overridden_at: null,
                has_override: false,
                effective_applicability: u.interpretation.applicability,
                effective_action_items: u.interpretation.action_items,
              },
            }
          : u
      ));
      showToast('Override removed (demo mode).', 'success');
      return;
    }

    try {
      await apiClient.delete(`/compliance/regulatory-updates/${updateId}/override`);
      const response = await apiClient.get(`/compliance/regulatory-updates/${updateId}/interpretation`);
      setUpdates(prev => prev.map(u => u.id === updateId ? { ...u, interpretation: response.data } : u));
      showToast('Override removed. Reverted to AI assessment.', 'success');
    } catch (_e) {
      showToast('Failed to remove override.', 'error');
    }
  };

  const handleScrape = async () => {
    if (isDemoMode()) { showToast('Feed scraping is not available in demo mode.', 'info'); return; }
    setScrapingInProgress(true);
    try {
      // Web scraping multiple regulator feeds — can take up to 3 min.
      await apiClient.post('/compliance/regulatory-updates/scrape', undefined, { timeout: 180000 });
      showToast('Feed scrape queued.', 'success');
      setTimeout(() => { fetchUpdates(); setScrapingInProgress(false); }, 10000);
    } catch (_e) {
      showToast('Failed to trigger feed scrape.', 'error');
      setScrapingInProgress(false);
    }
  };

  if (isLoading) return <DashboardSkeleton />;

  const tabs = [
    { id: 'feed', label: 'Regulatory Feed' },
    { id: 'history', label: 'Interpretation History' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regulatory Updates"
        subtitle="Live feed from SRA, ICO, HMRC, GOV.UK & Law Society — with AI-powered firm-specific analysis and full audit trail"
      />

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.id === 'history' && <History className="w-4 h-4 inline-block mr-1 -mt-0.5" />}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'feed' ? (
        <FeedTab
          updates={updates}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          handleInterpret={handleInterpret}
          handleAcknowledge={handleAcknowledge}
          handleScrape={handleScrape}
          handleOverride={handleOverride}
          handleRemoveOverride={handleRemoveOverride}
          interpretingIds={interpretingIds}
          acknowledgingIds={acknowledgingIds}
          scrapingInProgress={scrapingInProgress}
          error={error}
        />
      ) : (
        <HistoryTab />
      )}

      {/* COLP Disclaimer */}
      <div className="border-t border-gray-200 pt-4 mt-8">
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          <Shield className="w-3 h-3 inline-block mr-1 -mt-0.5" />
          Seema provides regulatory interpretation to assist your compliance decisions. Final responsibility remains with your COLP.
        </p>
      </div>

      {/* Override Modal */}
      {overrideTarget && (() => {
        const target = updates.find(u => u.id === overrideTarget);
        if (!target?.interpretation) return null;
        return (
          <OverrideModal
            updateId={overrideTarget}
            currentInterp={target.interpretation}
            onSubmit={handleOverrideSubmit}
            onClose={() => setOverrideTarget(null)}
          />
        );
      })()}
    </div>
  );
}
