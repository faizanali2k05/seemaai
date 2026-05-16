'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  Card,
  Button,
  Modal,
  StatusBadge,
  StatCard,
  LoadingSpinner,
  EmptyState,
  showToast,
  Tabs,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { isDemoMode, DEMO_CONFLICTS } from '@/lib/demo-data';
import { formatDate } from '@/lib/utils/format';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Plus,
  Search,
  X,
  ChevronRight,
} from 'lucide-react';

interface ConflictStats {
  total_checks: number;
  pending: number;
  conflicts_found: number;
  parties_in_register: number;
}

interface MatterMatch {
  matter_ref: string;
  matter_type: string;
  status: string | null;
  client_name: string;
  created_at: string | null;
}

interface IntakeMatch {
  client_name: string;
  company_name: string | null;
  status: string | null;
  created_at: string | null;
}

interface PartyMatch {
  party_name: string;
  party_type: string | null;
  date_added: string | null;
}

interface ConflictCheckResult {
  id?: string;
  status?: string;
  clear?: boolean;
  conflict_found: boolean;
  matches?: {
    matters: MatterMatch[];
    intakes: IntakeMatch[];
    parties: PartyMatch[];
    clio_contacts: unknown[];
  };
  clio_integration_connected?: boolean;
  summary?: string;
}

interface ConflictCheck {
  id: string;
  client_name: string;
  opposing_party?: string;
  matter_type: string;
  status: 'clear' | 'conflict_found' | 'pending' | 'waiver_granted';
  checked_at: string;
  result?: ConflictCheckResult;
}

interface Party {
  id: string;
  party_name: string;
  party_type: 'client' | 'opposing_party' | 'related_party' | 'witness' | 'beneficiary';
  matter_id?: string;
  party_role?: string;
}

type TabType = 'checks' | 'parties';

export default function ConflictsPage() {
  useRequireAuth();

  // Stats
  const [stats, setStats] = useState<ConflictStats | null>(null);

  // Conflict Checks
  const [conflictChecks, setConflictChecks] = useState<ConflictCheck[]>([]);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkFormData, setCheckFormData] = useState({
    client_name: '',
    opposing_party: '',
    related_parties: '',
    matter_type: '',
    matter_description: '',
  });
  const [checkResult, setCheckResult] = useState<ConflictCheckResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resolveCheckId, setResolveCheckId] = useState<string | null>(null);
  const [resolveFormData, setResolveFormData] = useState({
    resolution_notes: '',
    waiver_obtained: false,
    information_barrier: false,
  });

  // Parties Register
  const [parties, setParties] = useState<Party[]>([]);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [showAddPartyModal, setShowAddPartyModal] = useState(false);
  const [partyFormData, setPartyFormData] = useState({
    party_name: '',
    party_type: 'client' as Party['party_type'],
    matter_id: '',
    party_role: '',
  });

  // Loading & Errors
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [isAddingParty, setIsAddingParty] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('checks');

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Demo mode fallback
      if (isDemoMode()) {
        const demoChecks = DEMO_CONFLICTS.map(c => ({
          id: c.id,
          client_name: c.parties.split(' vs ')[0] || 'Unknown',
          opposing_party: c.parties.split(' vs ')[1] || undefined,
          matter_type: 'General',
          status: c.status as 'clear' | 'conflict_found' | 'pending' | 'waiver_granted',
          checked_at: c.checked_at,
          result: c.status === 'flagged' ? { clear: false, conflict_found: true } : { clear: true, conflict_found: false },
        }));
        setConflictChecks(demoChecks);
        setStats({
          total_checks: demoChecks.length,
          pending: demoChecks.filter(c => c.status === 'pending').length,
          conflicts_found: demoChecks.filter(c => c.status === 'conflict_found' || (c.status as string) === 'flagged').length,
          parties_in_register: 5,
        });
        setIsLoading(false);
        return;
      }

      const [statsRes, checksRes] = await Promise.allSettled([
        apiClient.get('/compliance/conflicts/stats'),
        apiClient.get('/compliance/conflicts'),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }

      if (checksRes.status === 'fulfilled') {
        setConflictChecks(Array.isArray(checksRes.value.data) ? checksRes.value.data : []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conflict data';
      setError(message);
      console.error('Error fetching conflicts:', err);
      if (isDemoMode()) {
        const demoChecks = DEMO_CONFLICTS.map(c => ({
          id: c.id,
          client_name: c.parties.split(' vs ')[0] || 'Unknown',
          opposing_party: c.parties.split(' vs ')[1] || undefined,
          matter_type: 'General',
          status: c.status as 'clear' | 'conflict_found' | 'pending' | 'waiver_granted',
          checked_at: c.checked_at,
          result: c.status === 'flagged' ? { clear: false, conflict_found: true } : { clear: true, conflict_found: false },
        }));
        setConflictChecks(demoChecks);
      }
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchParties = async (query?: string) => {
    try {
      const url = query
        ? `/compliance/conflicts/parties?search=${encodeURIComponent(query)}`
        : '/compliance/conflicts/parties';
      const response = await apiClient.get(url);
      setParties(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load parties';
      showToast(message, 'error');
    }
  };

  // Handle running a conflict check
  const handleRunCheck = async () => {
    if (!checkFormData.client_name.trim()) {
      showToast('Client name is required', 'error');
      return;
    }

    try {
      setIsRunningCheck(true);
      const result = await apiClient.post(
        '/compliance/conflicts/check',
        {
          client_name: checkFormData.client_name,
          opposing_party: checkFormData.opposing_party || undefined,
          related_parties: checkFormData.related_parties
            ? checkFormData.related_parties.split(',').map((p) => p.trim())
            : undefined,
          matter_type: checkFormData.matter_type || undefined,
          matter_description: checkFormData.matter_description || undefined,
        },
      );

      const resultData = result.data as any;
      setCheckResult(resultData);
      setShowResultModal(true);

      // Refresh checks and stats
      const [statsRes, checksRes] = await Promise.allSettled([
        apiClient.get('/compliance/conflicts/stats'),
        apiClient.get('/compliance/conflicts'),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
      if (checksRes.status === 'fulfilled') {
        setConflictChecks(Array.isArray(checksRes.value.data) ? checksRes.value.data : []);
      }

      showToast(
        resultData?.conflict_found
          ? 'Conflict of interest identified'
          : 'No conflicts found',
        resultData?.conflict_found ? 'warning' : 'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run conflict check';
      showToast(message, 'error');
    } finally {
      setIsRunningCheck(false);
    }
  };

  // Handle resolving a conflict
  const handleResolveConflict = async (checkId: string) => {
    try {
      setIsResolvingConflict(true);

      // Demo mode: update local state
      if (isDemoMode()) {
        setConflictChecks(conflictChecks.map(c =>
          c.id === checkId ? { ...c, status: 'clear' as const } : c
        ));
        showToast('Conflict resolved successfully', 'success');
        setResolveCheckId(null);
        setResolveFormData({
          resolution_notes: '',
          waiver_obtained: false,
          information_barrier: false,
        });
        return;
      }

      await apiClient.post(`/compliance/conflicts/${checkId}/resolve`, {
        resolution_notes: resolveFormData.resolution_notes,
        waiver_obtained: resolveFormData.waiver_obtained,
        information_barrier: resolveFormData.information_barrier,
      });

      showToast('Conflict resolved successfully', 'success');
      setResolveCheckId(null);
      setResolveFormData({
        resolution_notes: '',
        waiver_obtained: false,
        information_barrier: false,
      });

      // Refresh data
      const checksRes = await apiClient.get('/compliance/conflicts');
      setConflictChecks(Array.isArray(checksRes.data) ? checksRes.data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve conflict';
      showToast(message, 'error');
    } finally {
      setIsResolvingConflict(false);
    }
  };

  // Handle adding a party
  const handleAddParty = async () => {
    if (!partyFormData.party_name.trim()) {
      showToast('Party name is required', 'error');
      return;
    }

    try {
      setIsAddingParty(true);
      await apiClient.post('/compliance/conflicts/parties', {
        party_name: partyFormData.party_name,
        party_type: partyFormData.party_type,
        matter_id: partyFormData.matter_id || undefined,
        party_role: partyFormData.party_role || undefined,
      });

      showToast('Party added successfully', 'success');
      setShowAddPartyModal(false);
      setPartyFormData({
        party_name: '',
        party_type: 'client',
        matter_id: '',
        party_role: '',
      });

      // Refresh parties
      await fetchParties();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add party';
      showToast(message, 'error');
    } finally {
      setIsAddingParty(false);
    }
  };

  // Handle search in parties
  const handlePartySearch = (query: string) => {
    setPartySearchQuery(query);
    if (query.trim()) {
      fetchParties(query);
    } else {
      fetchParties();
    }
  };

  // Reset form and close modal
  const closeCheckModal = () => {
    setShowCheckModal(false);
    setCheckFormData({
      client_name: '',
      opposing_party: '',
      related_parties: '',
      matter_type: '',
      matter_description: '',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        title="Conflict of Interest Checker"
        description="Manage conflict checks, maintain the parties register, and track resolutions"
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Checks"
          value={stats?.total_checks?.toString() ?? '0'}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending"
          value={stats?.pending?.toString() ?? '0'}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Conflicts Found"
          value={stats?.conflicts_found?.toString() ?? '0'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Parties in Register"
          value={stats?.parties_in_register?.toString() ?? '0'}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Tabs */}
      <Card className="overflow-hidden rounded-xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('checks')}
                className={`px-4 py-2 font-medium border-b-2 transition ${
                  activeTab === 'checks'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Conflict Checks
              </button>
              <button
                onClick={() => {
                  setActiveTab('parties');
                  fetchParties();
                }}
                className={`px-4 py-2 font-medium border-b-2 transition ${
                  activeTab === 'parties'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Parties Register
              </button>
            </div>
            <Button
              onClick={() =>
                activeTab === 'checks'
                  ? setShowCheckModal(true)
                  : setShowAddPartyModal(true)
              }
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'checks' ? 'Run Conflict Check' : 'Add Party'}
            </Button>
          </div>
        </div>

        {/* Conflict Checks Tab */}
        {activeTab === 'checks' && (
          <div className="p-6">
            {conflictChecks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Client Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Opposing Party
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Matter Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Checked At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictChecks.map((check) => (
                      <tr key={check.id} className="group border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {check.client_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 line-clamp-2">
                          {check.opposing_party || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {check.matter_type || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={check.status} label={formatStatusLabel(check.status)} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                          {formatDate(check.checked_at)}
                        </td>
                        <td className="px-6 py-4">
                          {check.status === 'conflict_found' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResolveCheckId(check.id)}
                              className="text-xs"
                            >
                              Resolve
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle}
                title="No conflict checks"
                description="Run your first conflict check to get started"
              />
            )}
          </div>
        )}

        {/* Parties Register Tab */}
        {activeTab === 'parties' && (
          <div className="p-6">
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search parties..."
                  value={partySearchQuery}
                  onChange={(e) => handlePartySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {parties.length > 0 ? (
              <div className="space-y-2">
                {parties.map((party) => (
                  <div
                    key={party.id}
                    className="group flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900 line-clamp-2">{party.party_name}</h3>
                        <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full whitespace-nowrap">
                          {formatPartyType(party.party_type)}
                        </span>
                      </div>
                      {party.party_role && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">Role: {party.party_role}</p>
                      )}
                      {party.matter_id && (
                        <p className="text-xs text-gray-500 mt-1 tabular-nums">Matter: {party.matter_id}</p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No parties found"
                description={
                  partySearchQuery
                    ? 'Try adjusting your search'
                    : 'Add your first party to the register'
                }
              />
            )}
          </div>
        )}
      </Card>

      {/* Run Conflict Check Modal */}
      <Modal
        isOpen={showCheckModal}
        onClose={closeCheckModal}
        title="Run Conflict Check"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Client Name *
            </label>
            <input
              type="text"
              value={checkFormData.client_name}
              onChange={(e) =>
                setCheckFormData({ ...checkFormData, client_name: e.target.value })
              }
              placeholder="e.g., Acme Corporation"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Opposing Party
            </label>
            <input
              type="text"
              value={checkFormData.opposing_party}
              onChange={(e) =>
                setCheckFormData({ ...checkFormData, opposing_party: e.target.value })
              }
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Related Parties (comma-separated)
            </label>
            <input
              type="text"
              value={checkFormData.related_parties}
              onChange={(e) =>
                setCheckFormData({ ...checkFormData, related_parties: e.target.value })
              }
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Matter Type
            </label>
            <select
              value={checkFormData.matter_type}
              onChange={(e) =>
                setCheckFormData({ ...checkFormData, matter_type: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">Select type...</option>
              <option value="litigation">Litigation</option>
              <option value="transaction">Transaction</option>
              <option value="advisory">Advisory</option>
              <option value="employment">Employment</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Matter Description
            </label>
            <textarea
              value={checkFormData.matter_description}
              onChange={(e) =>
                setCheckFormData({
                  ...checkFormData,
                  matter_description: e.target.value,
                })
              }
              placeholder="Optional details about the matter"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={closeCheckModal} disabled={isRunningCheck}>
              Cancel
            </Button>
            <Button onClick={handleRunCheck} disabled={isRunningCheck}>
              {isRunningCheck ? 'Checking...' : 'Run Check'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Conflict Check Result Modal */}
      <Modal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          closeCheckModal();
        }}
        title={checkResult?.conflict_found ? 'Conflict Found' : 'No Conflicts'}
      >
        <div className="space-y-4">
          {checkResult?.conflict_found ? (
            <>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-semibold">
                  Conflict of interest identified
                </p>
                {checkResult.summary && (
                  <p className="text-sm text-red-600 mt-1">{checkResult.summary}</p>
                )}
              </div>

              {checkResult.matches?.matters && checkResult.matches.matters.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Prior Matters ({checkResult.matches.matters.length})
                  </h4>
                  <div className="space-y-2">
                    {checkResult.matches.matters.map((m, idx) => (
                      <div
                        key={`matter-${idx}`}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {m.client_name}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Ref: {m.matter_ref} &middot; Type: {m.matter_type}
                        </div>
                        <div className="text-xs text-gray-600">
                          Status: {m.status ?? '-'}
                          {m.created_at && (
                            <> &middot; Opened: {formatDate(m.created_at)}</>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {checkResult.matches?.intakes && checkResult.matches.intakes.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Prior Intakes ({checkResult.matches.intakes.length})
                  </h4>
                  <div className="space-y-2">
                    {checkResult.matches.intakes.map((i, idx) => (
                      <div
                        key={`intake-${idx}`}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {i.client_name}
                          {i.company_name && (
                            <span className="text-gray-600 font-normal">
                              {' '}
                              ({i.company_name})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Status: {i.status ?? '-'}
                          {i.created_at && (
                            <> &middot; Submitted: {formatDate(i.created_at)}</>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {checkResult.matches?.parties && checkResult.matches.parties.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Conflict Parties ({checkResult.matches.parties.length})
                  </h4>
                  <div className="space-y-2">
                    {checkResult.matches.parties.map((p, idx) => (
                      <div
                        key={`party-${idx}`}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {p.party_name}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Type: {p.party_type ?? '-'}
                          {p.date_added && (
                            <> &middot; Added: {formatDate(p.date_added)}</>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {checkResult.clio_integration_connected && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Clio scan: not yet implemented. Connected Clio contacts will be
                    searched in a future release.
                  </p>
                </div>
              )}

              <p className="text-sm text-gray-600">
                This matter cannot proceed unless a conflict waiver is obtained or an
                information barrier is established.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700 font-semibold">
                  No conflicts detected
                </p>
                <p className="text-sm text-green-600 mt-1">
                  {checkResult?.summary ??
                    'Searched prior matters, client intakes, and the conflict parties register. No matches found.'}
                </p>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Sources scanned:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Prior matters (matters.client_name)</li>
                  <li>Client intakes (client name + company name)</li>
                  <li>Conflict parties register</li>
                  {checkResult?.clio_integration_connected && (
                    <li>Clio contacts (not yet implemented)</li>
                  )}
                </ul>
              </div>
              <p className="text-sm text-gray-600">You may proceed with this matter.</p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <Button
              onClick={() => {
                setShowResultModal(false);
                closeCheckModal();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Resolve Conflict Modal */}
      {resolveCheckId && (
        <Modal
          isOpen={!!resolveCheckId}
          onClose={() => setResolveCheckId(null)}
          title="Resolve Conflict"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution Notes *
              </label>
              <textarea
                value={resolveFormData.resolution_notes}
                onChange={(e) =>
                  setResolveFormData({
                    ...resolveFormData,
                    resolution_notes: e.target.value,
                  })
                }
                placeholder="Describe how this conflict will be resolved..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resolveFormData.waiver_obtained}
                  onChange={(e) =>
                    setResolveFormData({
                      ...resolveFormData,
                      waiver_obtained: e.target.checked,
                    })
                  }
                  className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Waiver obtained from client(s)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resolveFormData.information_barrier}
                  onChange={(e) =>
                    setResolveFormData({
                      ...resolveFormData,
                      information_barrier: e.target.checked,
                    })
                  }
                  className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Information barrier established</span>
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => setResolveCheckId(null)}
                disabled={isResolvingConflict}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (resolveCheckId) {
                    handleResolveConflict(resolveCheckId);
                  }
                }}
                disabled={isResolvingConflict || !resolveFormData.resolution_notes.trim()}
              >
                {isResolvingConflict ? 'Resolving...' : 'Mark Resolved'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Party Modal */}
      <Modal
        isOpen={showAddPartyModal}
        onClose={() => {
          setShowAddPartyModal(false);
          setPartyFormData({
            party_name: '',
            party_type: 'client',
            matter_id: '',
            party_role: '',
          });
        }}
        title="Add Party to Register"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Party Name *
            </label>
            <input
              type="text"
              value={partyFormData.party_name}
              onChange={(e) =>
                setPartyFormData({ ...partyFormData, party_name: e.target.value })
              }
              placeholder="e.g., Smith & Associates Ltd"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Party Type
            </label>
            <select
              value={partyFormData.party_type}
              onChange={(e) =>
                setPartyFormData({
                  ...partyFormData,
                  party_type: e.target.value as Party['party_type'],
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="client">Client</option>
              <option value="opposing_party">Opposing Party</option>
              <option value="related_party">Related Party</option>
              <option value="witness">Witness</option>
              <option value="beneficiary">Beneficiary</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Matter ID
            </label>
            <input
              type="text"
              value={partyFormData.matter_id}
              onChange={(e) =>
                setPartyFormData({ ...partyFormData, matter_id: e.target.value })
              }
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Party Role
            </label>
            <input
              type="text"
              value={partyFormData.party_role}
              onChange={(e) =>
                setPartyFormData({ ...partyFormData, party_role: e.target.value })
              }
              placeholder="e.g., Defendant, Plaintiff"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddPartyModal(false);
                setPartyFormData({
                  party_name: '',
                  party_type: 'client',
                  matter_id: '',
                  party_role: '',
                });
              }}
              disabled={isAddingParty}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddParty}
              disabled={isAddingParty || !partyFormData.party_name.trim()}
            >
              {isAddingParty ? 'Adding...' : 'Add Party'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Helper functions
function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    clear: 'Clear',
    conflict_found: 'Conflict Found',
    pending: 'Pending',
    waiver_granted: 'Waiver Granted',
  };
  return labels[status] || status;
}

function formatPartyType(type: string): string {
  const labels: Record<string, string> = {
    client: 'Client',
    opposing_party: 'Opposing Party',
    related_party: 'Related Party',
    witness: 'Witness',
    beneficiary: 'Beneficiary',
  };
  return labels[type] || type;
}
