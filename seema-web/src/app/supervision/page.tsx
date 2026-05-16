'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, StatCard, StatusBadge, Button, Modal, EmptyState, showToast } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { isDemoMode, DEMO_SUPERVISION, DEMO_STAFF } from '@/lib/demo-data';

// SRA Code of Conduct for Firms, Rule 3 — supervision arrangements.
// https://www.sra.org.uk/solicitors/standards-regulations/code-conduct-firms/
//
// Rule 3 doesn't fix a cadence; firms commit to monthly 1:1s for trainees
// and quarterly for qualified solicitors. The cadence_days column on the
// supervision_records table makes the per-relationship threshold explicit
// so the daily reminder cron can detect overdue rows.

interface SupervisionRelationship {
  id: string;
  staff_id: string;
  staff_name: string | null;
  supervisor: string | null;
  frequency: string | null;
  cadence_days: number | null;
  next_due: string | null;
  last_session: string | null;
  notes_count: number;
  status: string | null;
}

interface SupervisionSession {
  id: string;
  relationship_id: string;
  session_date: string;
  duration_minutes: number | null;
  topics_discussed: string | null;
  action_items: string | null;
  supervisee_acknowledged_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

type Tab = 'register' | 'sessions';

const DEFAULT_CADENCE: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

function cadenceFor(r: SupervisionRelationship): number {
  if (r.cadence_days && r.cadence_days > 0) return r.cadence_days;
  return DEFAULT_CADENCE[(r.frequency ?? '').toLowerCase()] ?? 30;
}

interface RowStatus {
  status: 'on_track' | 'amber' | 'red' | 'never';
  daysSince: number | null;
}

function statusFor(r: SupervisionRelationship): RowStatus {
  if (!r.last_session) return { status: 'never', daysSince: null };
  const last = new Date(r.last_session).getTime();
  const daysSince = Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24));
  const overdueBy = daysSince - cadenceFor(r);
  if (overdueBy <= 0) return { status: 'on_track', daysSince };
  if (overdueBy <= 7) return { status: 'amber', daysSince };
  return { status: 'red', daysSince };
}

function StatusPill({ status }: { status: RowStatus['status'] }) {
  const map: Record<RowStatus['status'], { label: string; className: string }> = {
    on_track: { label: 'On track', className: 'bg-green-100 text-green-800' },
    amber: { label: 'Overdue ≤7d', className: 'bg-amber-100 text-amber-800' },
    red: { label: 'Overdue >7d', className: 'bg-red-100 text-red-800' },
    never: { label: 'No sessions', className: 'bg-gray-100 text-gray-800' },
  };
  const cfg = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

export default function SupervisionPage() {
  useRequireAuth();

  const [tab, setTab] = useState<Tab>('register');
  const [relationships, setRelationships] = useState<SupervisionRelationship[]>([]);
  const [allSessions, setAllSessions] = useState<SupervisionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view + log modal
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [relSessions, setRelSessions] = useState<SupervisionSession[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({
    session_date: new Date().toISOString().slice(0, 10),
    duration_minutes: 30,
    topics_discussed: '',
    action_items: '',
  });

  // Sessions-tab filters
  const [filterSupervisor, setFilterSupervisor] = useState('');
  const [filterSupervisee, setFilterSupervisee] = useState('');

  const loadRelationships = useCallback(async () => {
    if (isDemoMode()) {
      const staffLookup: Record<string, string> = {};
      DEMO_STAFF.forEach((s) => {
        staffLookup[s.id] = s.name;
      });
      const transformed: SupervisionRelationship[] = DEMO_SUPERVISION.map((s: any) => ({
        id: s.id,
        staff_id: s.staff_id,
        staff_name: staffLookup[s.staff_id] || `Staff ${s.staff_id}`,
        supervisor: staffLookup[s.supervisor_id] || `Supervisor ${s.supervisor_id}`,
        frequency: s.frequency ?? 'monthly',
        cadence_days: null,
        next_due: s.next_due ?? null,
        last_session: s.last_session ?? null,
        notes_count: 0,
        status: s.status ?? null,
      }));
      setRelationships(transformed);
      return;
    }

    const res = await apiClient.get('/compliance/supervision');
    const data = Array.isArray(res?.data) ? res.data : [];
    setRelationships(data);
  }, []);

  const loadAllSessions = useCallback(async () => {
    if (isDemoMode()) {
      setAllSessions([]);
      return;
    }
    try {
      const res = await apiClient.get('/compliance/supervision/sessions');
      setAllSessions(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setAllSessions([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadRelationships(), loadAllSessions()]);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load supervision data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadRelationships, loadAllSessions]);

  const loadRelSessions = useCallback(async (relId: string) => {
    if (isDemoMode()) {
      setRelSessions([]);
      return;
    }
    try {
      const res = await apiClient.get(`/compliance/supervision/relationships/${relId}/sessions`);
      setRelSessions(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setRelSessions([]);
    }
  }, []);

  useEffect(() => {
    if (selectedRelId) void loadRelSessions(selectedRelId);
  }, [selectedRelId, loadRelSessions]);

  const handleLogSession = async () => {
    if (!selectedRelId) return;
    try {
      await apiClient.post(
        `/compliance/supervision/relationships/${selectedRelId}/sessions`,
        {
          session_date: new Date(logForm.session_date).toISOString(),
          duration_minutes: Number(logForm.duration_minutes) || undefined,
          topics_discussed: logForm.topics_discussed || undefined,
          action_items: logForm.action_items || undefined,
        }
      );
      showToast('Supervision session logged', 'success');
      setShowLogModal(false);
      setLogForm({
        session_date: new Date().toISOString().slice(0, 10),
        duration_minutes: 30,
        topics_discussed: '',
        action_items: '',
      });
      await Promise.all([loadRelSessions(selectedRelId), loadRelationships(), loadAllSessions()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log session', 'error');
    }
  };

  const handleAcknowledge = async (sessionId: string) => {
    try {
      await apiClient.patch(`/compliance/supervision/sessions/${sessionId}/acknowledge`, {});
      showToast('Session acknowledged', 'success');
      if (selectedRelId) await loadRelSessions(selectedRelId);
      await loadAllSessions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to acknowledge', 'error');
    }
  };

  // Stats
  const counts = relationships.reduce(
    (acc, r) => {
      const s = statusFor(r).status;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    { on_track: 0, amber: 0, red: 0, never: 0 } as Record<RowStatus['status'], number>
  );
  const overdueTotal = counts.amber + counts.red + counts.never;

  const selected = selectedRelId ? relationships.find((r) => r.id === selectedRelId) ?? null : null;

  // Filter sessions tab
  const filteredSessions = allSessions.filter((s) => {
    const rel = relationships.find((r) => r.id === s.relationship_id);
    if (!rel) return true;
    if (filterSupervisor && !((rel.supervisor ?? '').toLowerCase().includes(filterSupervisor.toLowerCase()))) return false;
    if (filterSupervisee && !((rel.staff_name ?? '').toLowerCase().includes(filterSupervisee.toLowerCase()))) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader title="Supervision" description="Loading..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Supervision"
        description="SRA Code of Conduct for Firms, Rule 3 — supervision arrangements."
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="On track" value={counts.on_track.toString()} color="green" />
        <StatCard title="Overdue ≤7d" value={counts.amber.toString()} color="amber" />
        <StatCard title="Overdue >7d" value={counts.red.toString()} color="red" />
        <StatCard title="No sessions yet" value={counts.never.toString()} color="amber" />
      </div>

      {selected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedRelId(null)}
                className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <h2 className="text-lg font-semibold">
                {selected.staff_name} ← {selected.supervisor}
              </h2>
              <StatusPill status={statusFor(selected).status} />
            </div>
            <Button onClick={() => setShowLogModal(true)}>Log new session</Button>
          </div>
          <div className="p-6">
            {relSessions.length === 0 ? (
              <EmptyState title="No sessions logged" description="Click 'Log new session' to record the first one." />
            ) : (
              <div className="space-y-3">
                {relSessions.map((s) => (
                  <div key={s.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="font-semibold tabular-nums">{formatDate(new Date(s.session_date))}</div>
                        {s.duration_minutes && (
                          <div className="text-sm text-gray-600 mt-1">{s.duration_minutes} minutes</div>
                        )}
                        {s.topics_discussed && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase">Topics</div>
                            <div className="text-sm whitespace-pre-wrap">{s.topics_discussed}</div>
                          </div>
                        )}
                        {s.action_items && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase">Action items</div>
                            <div className="text-sm whitespace-pre-wrap">{s.action_items}</div>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {s.supervisee_acknowledged_at ? (
                          <StatusBadge status="success" label="Acknowledged" />
                        ) : (
                          <Button variant="secondary" onClick={() => handleAcknowledge(s.id)}>
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200 px-6 pt-4">
              <div className="flex gap-6">
                <button
                  onClick={() => setTab('register')}
                  className={`pb-3 px-1 border-b-2 text-sm font-medium ${
                    tab === 'register'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Register ({relationships.length})
                </button>
                <button
                  onClick={() => setTab('sessions')}
                  className={`pb-3 px-1 border-b-2 text-sm font-medium ${
                    tab === 'sessions'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Sessions ({allSessions.length})
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div className="p-6">
                {overdueTotal > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                    {overdueTotal} relationship{overdueTotal === 1 ? '' : 's'} overdue or with no sessions logged. The daily reminder digest is sent at 08:00.
                  </div>
                )}
                {relationships.length === 0 ? (
                  <EmptyState title="No supervision register" description="No supervisor/supervisee relationships defined yet." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-500 border-b">
                        <th className="text-left py-2 px-2">Supervisee</th>
                        <th className="text-left py-2 px-2">Supervisor</th>
                        <th className="text-left py-2 px-2">Cadence</th>
                        <th className="text-left py-2 px-2">Last session</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {relationships.map((r) => {
                        const s = statusFor(r);
                        return (
                          <tr
                            key={r.id}
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setSelectedRelId(r.id)}
                          >
                            <td className="py-3 px-2">{r.staff_name ?? '-'}</td>
                            <td className="py-3 px-2">{r.supervisor ?? '-'}</td>
                            <td className="py-3 px-2 tabular-nums">{cadenceFor(r)} days</td>
                            <td className="py-3 px-2 tabular-nums">
                              {r.last_session ? `${formatDate(new Date(r.last_session))} (${s.daysSince}d ago)` : '—'}
                            </td>
                            <td className="py-3 px-2"><StatusPill status={s.status} /></td>
                            <td className="py-3 px-2 text-right">
                              <ChevronRight className="w-4 h-4 inline text-gray-400" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'sessions' && (
              <div className="p-6">
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={filterSupervisor}
                    onChange={(e) => setFilterSupervisor(e.target.value)}
                    placeholder="Filter by supervisor"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={filterSupervisee}
                    onChange={(e) => setFilterSupervisee(e.target.value)}
                    placeholder="Filter by supervisee"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                {filteredSessions.length === 0 ? (
                  <EmptyState title="No sessions" description="No supervision sessions match the current filters." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-500 border-b">
                        <th className="text-left py-2 px-2">Date</th>
                        <th className="text-left py-2 px-2">Supervisee</th>
                        <th className="text-left py-2 px-2">Supervisor</th>
                        <th className="text-left py-2 px-2">Duration</th>
                        <th className="text-left py-2 px-2">Acknowledged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSessions.map((s) => {
                        const rel = relationships.find((r) => r.id === s.relationship_id);
                        return (
                          <tr key={s.id} className="border-b">
                            <td className="py-2 px-2 tabular-nums">{formatDate(new Date(s.session_date))}</td>
                            <td className="py-2 px-2">{rel?.staff_name ?? '-'}</td>
                            <td className="py-2 px-2">{rel?.supervisor ?? '-'}</td>
                            <td className="py-2 px-2">{s.duration_minutes ? `${s.duration_minutes} min` : '-'}</td>
                            <td className="py-2 px-2">
                              {s.supervisee_acknowledged_at ? (
                                <span className="text-green-700 text-xs">Yes</span>
                              ) : (
                                <span className="text-gray-500 text-xs">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log supervision session">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session date</label>
            <input
              type="date"
              value={logForm.session_date}
              onChange={(e) => setLogForm({ ...logForm, session_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min={0}
              value={logForm.duration_minutes}
              onChange={(e) => setLogForm({ ...logForm, duration_minutes: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topics discussed</label>
            <textarea
              value={logForm.topics_discussed}
              onChange={(e) => setLogForm({ ...logForm, topics_discussed: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action items</label>
            <textarea
              value={logForm.action_items}
              onChange={(e) => setLogForm({ ...logForm, action_items: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowLogModal(false)}>Cancel</Button>
            <Button onClick={handleLogSession}>Save session</Button>
          </div>
        </div>
      </Modal>

      <p className="text-xs text-gray-500 mt-6">
        Source: SRA Code of Conduct for Firms, Rule 3 —{' '}
        <a
          href="https://www.sra.org.uk/solicitors/standards-regulations/code-conduct-firms/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          sra.org.uk
        </a>
      </p>
    </div>
  );
}
