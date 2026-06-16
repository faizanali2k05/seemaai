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
  ConfirmDialog,
  LoadingSpinner,
  EmptyState,
  showToast,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_UNDERTAKINGS } from '@/lib/demo-data';
import apiClient from '@/lib/api';
import { formatDate } from '@/lib/utils/format';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowDownRight,
  ArrowUpLeft,
} from 'lucide-react';

interface UndertakingsStats {
  total: number;
  outstanding: number;
  overdue: number;
  breached: number;
  fulfilled: number;
}

interface Undertaking {
  id: string;
  direction: 'given' | 'received';
  description: string;
  client_name?: string;
  matter_ref?: string;
  given_to?: string;
  received_from?: string;
  due_date: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: 'outstanding' | 'fulfilled' | 'breached' | 'discharged' | 'expired';
  conditions?: string;
  financial_value?: number;
  created_at: string;
  updated_at: string;
}

interface UndertakingsData {
  stats: UndertakingsStats;
  undertakings: Undertaking[];
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'outstanding':
      return 'bg-yellow-100 text-yellow-900';
    case 'fulfilled':
      return 'bg-green-100 text-green-900';
    case 'breached':
      return 'bg-red-100 text-red-900';
    case 'discharged':
      return 'bg-gray-100 text-gray-900';
    case 'expired':
      return 'bg-orange-100 text-orange-900';
    default:
      return 'bg-gray-100 text-gray-900';
  }
}

function getRiskLevelVariant(
  level: string,
): 'low' | 'medium' | 'high' | 'critical' {
  return (level as 'low' | 'medium' | 'high' | 'critical') || 'low';
}

function truncateText(text: string, maxLength: number = 50): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Map the real undertakings API rows to the shape the table renders. The backend
// model has no direction / risk_level / received_from / financial_value columns and
// stores status as "pending" rather than "outstanding".
function normalizeUndertakings(data: unknown): Undertaking[] {
  if (!Array.isArray(data)) return [];
  return data.map((u: any) => {
    const status = u.status === 'pending' ? 'outstanding' : u.status;
    return {
      ...u,
      direction: u.direction || (u.given_to ? 'given' : 'received'),
      risk_level: u.risk_level || 'medium',
      received_from: u.received_from ?? u.given_by ?? undefined,
      client_name: u.client_name ?? undefined,
      financial_value: u.financial_value ?? undefined,
      status,
      due_date: u.due_date || '',
      created_at: u.created_at || '',
      updated_at: u.updated_at || u.created_at || '',
    } as Undertaking;
  });
}

export default function UndertakingsPage() {
  useRequireAuth();

  const [data, setData] = useState<UndertakingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedUndertaking, setSelectedUndertaking] =
    useState<Undertaking | null>(null);

  // Register Modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    direction: '' as 'given' | 'received' | '',
    description: '',
    client_name: '',
    matter_ref: '',
    given_to: '',
    received_from: '',
    due_date: '',
    conditions: '',
    financial_value: '',
    risk_level: 'medium' as 'low' | 'medium' | 'high' | 'critical',
  });
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerLoading, setRegisterLoading] = useState(false);

  // Fulfil Modal state
  const [showFulfilModal, setShowFulfilModal] = useState<string | null>(null);
  const [fulfilForm, setFulfilForm] = useState({
    evidence_ref: '',
    notes: '',
  });
  const [fulfilLoading, setFulfilLoading] = useState(false);

  // Breach Confirm state
  const [breachConfirm, setBreachConfirm] = useState<string | null>(null);
  const [breachForm, setBreaformState] = useState({
    breach_notes: '',
    remediation_plan: '',
  });
  const [breachErrors, setBreachErrors] = useState<Record<string, string>>({});
  const [breachLoading, setBreachLoading] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [directionFilter, statusFilter]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Demo mode fallback
      if (isDemoMode()) {
        const demoUndertakings = DEMO_UNDERTAKINGS as any[];
        const demoStats: UndertakingsStats = {
          total: demoUndertakings.length,
          outstanding: demoUndertakings.filter(u => u.status === 'outstanding').length,
          overdue: 0,
          breached: demoUndertakings.filter(u => u.status === 'breached').length,
          fulfilled: demoUndertakings.filter(u => u.status === 'fulfilled').length,
        };
        setData({ stats: demoStats, undertakings: demoUndertakings });
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (directionFilter) params.append('direction', directionFilter);
      if (statusFilter) params.append('status', statusFilter);
      const url =
        `/compliance/undertakings?${params.toString()}` ||
        '/compliance/undertakings';
      const response = await apiClient.get(url);
      const responseData = response.data as any;
      if (responseData && responseData.stats) {
        setData({ ...responseData, undertakings: normalizeUndertakings(responseData.undertakings) });
      } else if (Array.isArray(responseData)) {
        // Real API returns a bare array with no direction/risk_level/received_from/
        // financial_value, and status "pending" (page expects "outstanding").
        const undertakings = normalizeUndertakings(responseData);
        const stats: UndertakingsStats = {
          total: undertakings.length,
          outstanding: undertakings.filter((u) => u.status === 'outstanding').length,
          overdue: 0,
          breached: undertakings.filter((u) => u.status === 'breached').length,
          fulfilled: undertakings.filter((u) => u.status === 'fulfilled').length,
        };
        setData({ stats, undertakings });
      } else {
        setData({ stats: { total: 0, outstanding: 0, overdue: 0, breached: 0, fulfilled: 0 }, undertakings: [] });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load undertakings';
      setError(errorMsg);
      console.error('Error fetching undertakings:', err);
      if (isDemoMode()) {
        const demoUndertakings = DEMO_UNDERTAKINGS as any[];
        const demoStats: UndertakingsStats = {
          total: demoUndertakings.length,
          outstanding: demoUndertakings.filter(u => u.status === 'outstanding').length,
          overdue: 0,
          breached: demoUndertakings.filter(u => u.status === 'breached').length,
          fulfilled: demoUndertakings.filter(u => u.status === 'fulfilled').length,
        };
        setData({ stats: demoStats, undertakings: demoUndertakings });
      }
      showToast(errorMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const validateRegisterForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!registerForm.direction) errors.direction = 'Direction is required';
    if (!registerForm.description.trim()) {
      errors.description = 'Description is required and must be exact wording';
    }
    if (!registerForm.due_date) errors.due_date = 'Due date is required';
    if (
      registerForm.direction === 'given' &&
      !registerForm.given_to?.trim()
    ) {
      errors.given_to = 'Given To field is required for given undertakings';
    }
    if (
      registerForm.direction === 'received' &&
      !registerForm.received_from?.trim()
    ) {
      errors.received_from =
        'Received From field is required for received undertakings';
    }

    setRegisterErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegisterUndertaking = async () => {
    if (!validateRegisterForm()) return;

    try {
      setRegisterLoading(true);
      const payload = {
        direction: registerForm.direction,
        description: registerForm.description,
        client_name: registerForm.client_name || null,
        matter_ref: registerForm.matter_ref || null,
        given_to:
          registerForm.direction === 'given' ? registerForm.given_to : null,
        received_from:
          registerForm.direction === 'received'
            ? registerForm.received_from
            : null,
        due_date: registerForm.due_date,
        conditions: registerForm.conditions || null,
        financial_value: registerForm.financial_value
          ? parseFloat(registerForm.financial_value)
          : null,
        risk_level: registerForm.risk_level,
      };

      await apiClient.post('/compliance/undertakings', payload);
      showToast('Undertaking registered successfully', 'success');
      setShowRegisterModal(false);
      setRegisterForm({
        direction: '' as 'given' | 'received' | '',
        description: '',
        client_name: '',
        matter_ref: '',
        given_to: '',
        received_from: '',
        due_date: '',
        conditions: '',
        financial_value: '',
        risk_level: 'medium',
      });
      await fetchData();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to register undertaking';
      showToast(errorMsg, 'error');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleFulfilUndertaking = async (id: string) => {
    try {
      setFulfilLoading(true);
      await apiClient.post(`/compliance/undertakings/${id}/fulfil`, {
        evidence_ref: fulfilForm.evidence_ref || null,
        notes: fulfilForm.notes || null,
      });
      showToast('Undertaking fulfilled successfully', 'success');
      setShowFulfilModal(null);
      setFulfilForm({ evidence_ref: '', notes: '' });
      await fetchData();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to fulfil undertaking';
      showToast(errorMsg, 'error');
    } finally {
      setFulfilLoading(false);
    }
  };

  const validateBreachForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!breachForm.breach_notes.trim()) {
      errors.breach_notes = 'Breach notes are required';
    }

    setBreachErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleReportBreach = async (id: string) => {
    if (!validateBreachForm()) return;

    try {
      setBreachLoading(true);
      await apiClient.post(`/compliance/undertakings/${id}/breach`, {
        breach_notes: breachForm.breach_notes,
        remediation_plan: breachForm.remediation_plan || null,
      });
      showToast('Breach reported successfully', 'success');
      setBreachConfirm(null);
      setBreaformState({ breach_notes: '', remediation_plan: '' });
      await fetchData();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to report breach';
      showToast(errorMsg, 'error');
    } finally {
      setBreachLoading(false);
    }
  };

  const filteredUndertakings = (data?.undertakings || []).filter((u) => {
    const matchesDirection =
      !directionFilter || u.direction === directionFilter;
    const matchesStatus = !statusFilter || u.status === statusFilter;
    return matchesDirection && matchesStatus;
  });

  const columns = [
    {
      accessor: 'direction',
      header: 'Direction',
      render: (_value: any, row: Undertaking) => (
        <div className="flex items-center gap-2">
          {row.direction === 'given' ? (
            <ArrowUpLeft className="w-4 h-4 text-blue-600" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-green-600" />
          )}
          <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-900">
            {row.direction === 'given' ? 'Given' : 'Received'}
          </span>
        </div>
      ),
    },
    {
      accessor: 'description',
      header: 'Description',
      render: (_value: any, row: Undertaking) => (
        <span title={row.description}>{truncateText(row.description)}</span>
      ),
    },
    {
      accessor: 'client_name',
      header: 'Client / Matter',
      render: (_value: any, row: Undertaking) => (
        <div className="text-sm">
          {row.client_name && <div className="font-medium">{row.client_name}</div>}
          {row.matter_ref && <div className="text-gray-500">{row.matter_ref}</div>}
        </div>
      ),
    },
    {
      accessor: 'given_to',
      header: 'Given To / Received From',
      render: (_value: any, row: Undertaking) => (
        <span>{row.given_to || row.received_from || '-'}</span>
      ),
    },
    {
      accessor: 'due_date',
      header: 'Due Date',
      render: (_value: any, row: Undertaking) => formatDate(row.due_date),
    },
    {
      accessor: 'risk_level',
      header: 'Risk Level',
      render: (_value: any, row: Undertaking) => (
        <StatusBadge
          status={getRiskLevelVariant(row.risk_level)}
          variant={getRiskLevelVariant(row.risk_level)}
        />
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: Undertaking) => (
        <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(row.status)}`}>
          {(row.status || '').charAt(0).toUpperCase() + (row.status || '').slice(1)}
        </div>
      ),
    },
    {
      accessor: 'id',
      header: 'Actions',
      sortable: false,
      render: (_value: any, row: Undertaking) => (
        <div className="flex gap-2">
          {row.status === 'outstanding' && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFulfilModal(row.id);
                }}
              >
                Fulfil
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setBreachConfirm(row.id);
                }}
              >
                Report Breach
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 p-8">
        <PageHeader
          title="Undertakings Register"
          description="Manage and track undertakings given and received"
        />
        <Card className="p-8 flex justify-center rounded-xl">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        title="Undertakings Register"
        description="Manage and track undertakings given and received"
      />

      {/* Stats Row */}
      {data?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard
            title="Total Undertakings"
            value={(data.stats.total ?? 0).toString()}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <StatCard
            title="Outstanding"
            value={(data.stats.outstanding ?? 0).toString()}
            icon={<Clock className="h-5 w-5" />}
            color="amber"
          />
          <StatCard
            title="Overdue"
            value={(data.stats.overdue ?? 0).toString()}
            icon={<AlertTriangle className="h-5 w-5" />}
            color="orange"
          />
          <StatCard
            title="Breached"
            value={(data.stats.breached ?? 0).toString()}
            icon={<AlertTriangle className="h-5 w-5" />}
            color="red"
          />
          <StatCard
            title="Fulfilled"
            value={(data.stats.fulfilled ?? 0).toString()}
            icon={<CheckCircle className="h-5 w-5" />}
            color="green"
          />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filter Buttons and Register Button */}
      <Card className="p-6 space-y-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setDirectionFilter('');
                setStatusFilter('');
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !directionFilter && !statusFilter
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>

            <button
              onClick={() => setStatusFilter('outstanding')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'outstanding'
                  ? 'bg-yellow-100 text-yellow-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Outstanding
            </button>

            <button
              onClick={() => setStatusFilter('fulfilled')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'fulfilled'
                  ? 'bg-green-100 text-green-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Fulfilled
            </button>

            <button
              onClick={() => setStatusFilter('breached')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'breached'
                  ? 'bg-red-100 text-red-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Breached
            </button>

            <button
              onClick={() => setDirectionFilter('given')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                directionFilter === 'given'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Given
            </button>

            <button
              onClick={() => setDirectionFilter('received')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                directionFilter === 'received'
                  ? 'bg-green-100 text-green-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Received
            </button>
          </div>

          <Button
            variant="primary"
            onClick={() => setShowRegisterModal(true)}
          >
            Register Undertaking
          </Button>
        </div>
      </Card>

      {/* Data Table */}
      {data && filteredUndertakings.length > 0 ? (
        <Card className="overflow-hidden rounded-xl">
          <DataTable
            columns={columns}
            data={filteredUndertakings}
            onRowClick={(row) => setSelectedUndertaking(row as Undertaking)}
            emptyStateTitle="No undertakings found"
            emptyStateDescription="No undertakings match your current filters."
          />
        </Card>
      ) : (
        <EmptyState
          icon={CheckCircle}
          title="No Undertakings"
          description="No undertakings found. Register one to get started."
        />
      )}

      {/* Register Modal */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Register Undertaking"
        actions={[
          { label: 'Cancel', variant: 'outline', onClick: () => setShowRegisterModal(false), disabled: registerLoading },
          { label: 'Register', variant: 'primary', onClick: handleRegisterUndertaking, loading: registerLoading },
        ]}
      >
        <div className="space-y-4">
          <Select
            label="Direction"
            options={[
              { value: 'given', label: 'Given' },
              { value: 'received', label: 'Received' },
            ]}
            value={registerForm.direction}
            onChange={(e) =>
              setRegisterForm({
                ...registerForm,
                direction: e.target.value as 'given' | 'received',
              })
            }
            error={registerErrors.direction}
            placeholder="Select direction"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (exact wording) <span className="text-red-600">*</span>
            </label>
            <textarea
              value={registerForm.description}
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  description: e.target.value,
                })
              }
              placeholder="Enter the exact wording of the undertaking"
              rows={4}
              className={`w-full px-4 py-2 border rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                registerErrors.description
                  ? 'border-red-600 focus:ring-red-600'
                  : 'border-gray-300'
              }`}
            />
            {registerErrors.description && (
              <p className="text-sm text-red-600 mt-1">
                {registerErrors.description}
              </p>
            )}
          </div>

          <Input
            label="Client Name"
            value={registerForm.client_name}
            onChange={(e) =>
              setRegisterForm({
                ...registerForm,
                client_name: e.target.value,
              })
            }
            placeholder="Optional"
          />

          <Input
            label="Matter Reference"
            value={registerForm.matter_ref}
            onChange={(e) =>
              setRegisterForm({ ...registerForm, matter_ref: e.target.value })
            }
            placeholder="Optional"
          />

          {registerForm.direction === 'given' && (
            <Input
              label="Given To"
              value={registerForm.given_to}
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  given_to: e.target.value,
                })
              }
              error={registerErrors.given_to}
              placeholder="Required"
            />
          )}

          {registerForm.direction === 'received' && (
            <Input
              label="Received From"
              value={registerForm.received_from}
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  received_from: e.target.value,
                })
              }
              error={registerErrors.received_from}
              placeholder="Required"
            />
          )}

          <Input
            label="Due Date"
            type="date"
            value={registerForm.due_date}
            onChange={(e) =>
              setRegisterForm({
                ...registerForm,
                due_date: e.target.value,
              })
            }
            error={registerErrors.due_date}
          />

          <Select
            label="Risk Level"
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
            value={registerForm.risk_level}
            onChange={(e) =>
              setRegisterForm({
                ...registerForm,
                risk_level: e.target.value as
                  | 'low'
                  | 'medium'
                  | 'high'
                  | 'critical',
              })
            }
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conditions
            </label>
            <textarea
              value={registerForm.conditions}
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  conditions: e.target.value,
                })
              }
              placeholder="Optional conditions or notes"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <Input
            label="Financial Value"
            type="number"
            step="0.01"
            value={registerForm.financial_value}
            onChange={(e) =>
              setRegisterForm({
                ...registerForm,
                financial_value: e.target.value,
              })
            }
            placeholder="Optional"
          />
        </div>
      </Modal>

      {/* Fulfil Modal */}
      <Modal
        isOpen={!!showFulfilModal}
        onClose={() => setShowFulfilModal(null)}
        title="Fulfil Undertaking"
        actions={[
          { label: 'Cancel', variant: 'outline', onClick: () => setShowFulfilModal(null), disabled: fulfilLoading },
          { label: 'Fulfil', variant: 'success', onClick: () => { if (showFulfilModal) handleFulfilUndertaking(showFulfilModal); }, loading: fulfilLoading },
        ]}
      >
        <div className="space-y-4">
          <Input
            label="Evidence Reference"
            value={fulfilForm.evidence_ref}
            onChange={(e) =>
              setFulfilForm({
                ...fulfilForm,
                evidence_ref: e.target.value,
              })
            }
            placeholder="Optional reference to evidence"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={fulfilForm.notes}
              onChange={(e) =>
                setFulfilForm({
                  ...fulfilForm,
                  notes: e.target.value,
                })
              }
              placeholder="Optional notes on fulfilment"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </Modal>

      {/* Breach Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!breachConfirm}
        onConfirm={() => {
          if (breachConfirm) {
            handleReportBreach(breachConfirm);
          }
        }}
        onCancel={() => setBreachConfirm(null)}
        title="Report Breach"
        message="You are about to report a breach of this undertaking. This action cannot be undone. Please provide breach notes and optional remediation plan."
        confirmLabel="Report Breach"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Breach Form Modal */}
      <Modal
        isOpen={!!breachConfirm}
        onClose={() => setBreachConfirm(null)}
        title="Report Breach"
        actions={[
          { label: 'Cancel', variant: 'outline', onClick: () => { setBreachConfirm(null); setBreaformState({ breach_notes: '', remediation_plan: '' }); }, disabled: breachLoading },
          { label: 'Report Breach', variant: 'danger', onClick: () => { if (breachConfirm) handleReportBreach(breachConfirm); }, loading: breachLoading },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Breach Notes <span className="text-red-600">*</span>
            </label>
            <textarea
              value={breachForm.breach_notes}
              onChange={(e) =>
                setBreaformState({
                  ...breachForm,
                  breach_notes: e.target.value,
                })
              }
              placeholder="Describe the breach and circumstances"
              rows={4}
              className={`w-full px-4 py-2 border rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${
                breachErrors.breach_notes
                  ? 'border-red-600 focus:ring-red-600'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {breachErrors.breach_notes && (
              <p className="text-sm text-red-600 mt-1">
                {breachErrors.breach_notes}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remediation Plan
            </label>
            <textarea
              value={breachForm.remediation_plan}
              onChange={(e) =>
                setBreaformState({
                  ...breachForm,
                  remediation_plan: e.target.value,
                })
              }
              placeholder="Optional remediation plan to address the breach"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </Modal>

      {/* Detail View Modal */}
      {selectedUndertaking && (
        <Modal
          isOpen={!!selectedUndertaking}
          onClose={() => setSelectedUndertaking(null)}
          title="Undertaking Details"
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Direction</h4>
              <p className="text-gray-900">
                {selectedUndertaking.direction === 'given'
                  ? 'Given'
                  : 'Received'}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
              <p className="text-gray-900">{selectedUndertaking.description}</p>
            </div>

            {selectedUndertaking.client_name && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Client Name
                </h4>
                <p className="text-gray-900">{selectedUndertaking.client_name}</p>
              </div>
            )}

            {selectedUndertaking.matter_ref && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Matter Reference
                </h4>
                <p className="text-gray-900">{selectedUndertaking.matter_ref}</p>
              </div>
            )}

            {selectedUndertaking.given_to && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Given To</h4>
                <p className="text-gray-900">{selectedUndertaking.given_to}</p>
              </div>
            )}

            {selectedUndertaking.received_from && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Received From
                </h4>
                <p className="text-gray-900">
                  {selectedUndertaking.received_from}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Due Date</h4>
              <p className="text-gray-900">
                {formatDate(selectedUndertaking.due_date)}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Status</h4>
              <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedUndertaking.status)}`}>
                {(selectedUndertaking.status || '')
                  .charAt(0)
                  .toUpperCase() + (selectedUndertaking.status || '').slice(1)}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Risk Level</h4>
              <StatusBadge
                status={getRiskLevelVariant(selectedUndertaking.risk_level)}
                variant={getRiskLevelVariant(selectedUndertaking.risk_level)}
              />
            </div>

            {selectedUndertaking.conditions && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Conditions
                </h4>
                <p className="text-gray-900">
                  {selectedUndertaking.conditions}
                </p>
              </div>
            )}

            {selectedUndertaking.financial_value && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Financial Value
                </h4>
                <p className="text-gray-900">
                  £{selectedUndertaking.financial_value.toLocaleString(
                    'en-GB',
                    { minimumFractionDigits: 2 },
                  )}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Created</h4>
              <p className="text-gray-900">
                {formatDate(selectedUndertaking.created_at)}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Updated</h4>
              <p className="text-gray-900">
                {formatDate(selectedUndertaking.updated_at)}
              </p>
            </div>

            {selectedUndertaking.status === 'outstanding' && (
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <Button
                  variant="success"
                  onClick={() => {
                    setSelectedUndertaking(null);
                    setShowFulfilModal(selectedUndertaking.id);
                  }}
                  className="flex-1"
                >
                  Fulfil
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setSelectedUndertaking(null);
                    setBreachConfirm(selectedUndertaking.id);
                  }}
                  className="flex-1"
                >
                  Report Breach
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
