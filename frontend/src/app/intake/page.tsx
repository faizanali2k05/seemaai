'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  DataTable,
  Button,
  Modal,
  DashboardSkeleton,
  EmptyState,
  SearchBar,
  StatusBadge,
  showToast,
  ConfirmDialog,
} from '@/components/ui';
import { ChevronRight, Check } from 'lucide-react';
import { useRequireAuth, useClientMatterOptions } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { formatDate, riskBadgeColor } from '@/lib/utils/format';
import type { ClientIntake, PracticeArea, RiskLevel } from '@/lib/types';
import { isDemoMode, DEMO_INTAKES } from '@/lib/demo-data';

interface IntakeItem extends ClientIntake {
  risk_level?: RiskLevel;
  pep_flag?: boolean;
  assigned_to?: string;
  cdd_status?: 'not_started' | 'in_progress' | 'completed';
  conflict_check?: string;
  assigned_fee_earner?: string;
  [key: string]: any;
}

interface CDDChecklist {
  id_verification: boolean;
  source_of_funds: boolean;
  source_of_wealth: boolean;
  sanctions_check: boolean;
  pep_screening: boolean;
  edd_required: boolean;
}

export default function IntakePage() {
  useRequireAuth();
  const api = apiClient;

  // DB-driven combobox option list (client names)
  const { clientNames } = useClientMatterOptions();

  const [intakeList, setIntakeList] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // When a PMS integration is connected (Clio etc.), intakes sync in from
  // the PMS and we hide the "New Intake" button to avoid dual entry.
  const [pmsConnected, setPmsConnected] = useState(false);
  const [pmsName, setPmsName] = useState('your PMS');
  useEffect(() => {
    apiClient
      .get('/integrations/clio/status')
      .then((r) => {
        const data = r.data as any;
        if (data?.connected === true || data?.status === 'connected') {
          setPmsConnected(true);
          setPmsName('Clio');
        }
      })
      .catch(() => { /* no integration available — leave defaults */ });
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pepFilter, setPepFilter] = useState('all');
  const [showNewIntakeModal, setShowNewIntakeModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [intakeForm, setIntakeForm] = useState({
    clientName: '',
    matterType: '',
    riskLevel: 'medium',
    sourceOfFunds: '',
    pepScreening: false,
    assignedSolicitor: '',
  });
  const [intakeErrors, setIntakeErrors] = useState<Record<string, string>>({});
  const [selectedIntake, setSelectedIntake] = useState<IntakeItem | null>(null);
  const [cddChecklist, setCddChecklist] = useState<CDDChecklist>({
    id_verification: false,
    source_of_funds: false,
    source_of_wealth: false,
    sanctions_check: false,
    pep_screening: false,
    edd_required: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [intakeToReject, setIntakeToReject] = useState<IntakeItem | null>(null);
  const [showAssessDialog, setShowAssessDialog] = useState(false);
  const [assessmentData, setAssessmentData] = useState({
    risk_assessment: 'medium',
    notes: '',
  });

  const fetchIntakeList = async () => {
    try {
      const response = await api.get('/compliance/intake');
      const data = response.data;
      setIntakeList(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intake data');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isDemoMode()) {
          setIntakeList(DEMO_INTAKES as any);
          setLoading(false);
          return;
        }

        const response = await api.get('/compliance/intake');
        const data = response.data;
        setIntakeList(Array.isArray(data) ? data : []);
      } catch (err) {
        // Fall back to demo data on error
        if (isDemoMode()) {
          setIntakeList(DEMO_INTAKES as any);
        }
        setError(err instanceof Error ? err.message : 'Failed to load intake data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [api]);

  const filteredIntake = intakeList.filter((intake) => {
    const matchesSearch = (intake.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'all' || intake.risk_level === riskFilter;
    const matchesStatus = statusFilter === 'all' || intake.status === statusFilter;
    const matchesPep = pepFilter === 'all' || (pepFilter === 'yes' ? intake.pep_flag : !intake.pep_flag);

    return matchesSearch && matchesRisk && matchesStatus && matchesPep;
  });

  const columns = [
    { accessor: 'client_name', header: 'CLIENT NAME', sortable: true },
    { accessor: 'matter_type', header: 'MATTER TYPE', sortable: true },
    { accessor: 'conflict_check', header: 'CONFLICT CHECK', sortable: true },
    { accessor: 'risk_assessment', header: 'RISK ASSESSMENT', sortable: true },
    { accessor: 'assigned_fee_earner', header: 'FEE EARNER', sortable: true },
    { accessor: 'intake_date', header: 'DATE', sortable: true },
    { accessor: 'status', header: 'STATUS', sortable: true },
    {
      accessor: 'id',
      header: '',
      render: () => <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />,
    },
  ];

  const handleDetailModal = (intake: IntakeItem) => {
    setSelectedIntake(intake);
    setShowDetailModal(true);
  };

  const toggleChecklistItem = (key: keyof CDDChecklist) => {
    setCddChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleCreateIntake = async () => {
    // Validation
    if (!intakeForm.clientName.trim()) {
      setIntakeErrors({ ...intakeErrors, clientName: 'Client name is required' });
      return;
    }
    if (!intakeForm.matterType) {
      setIntakeErrors({ ...intakeErrors, matterType: 'Matter type is required' });
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        client_name: intakeForm.clientName.trim(),
        matter_type: intakeForm.matterType,
        assigned_fee_earner: intakeForm.assignedSolicitor || undefined,
        client_reference: intakeForm.sourceOfFunds || undefined,
      };

      await api.post('/compliance/intake', payload);

      showToast('Intake created successfully', 'success');

      // Reset form and close modal
      setIntakeForm({
        clientName: '',
        matterType: '',
        riskLevel: 'medium',
        sourceOfFunds: '',
        pepScreening: false,
        assignedSolicitor: '',
      });
      setIntakeErrors({});
      setShowNewIntakeModal(false);

      // Refresh list
      await fetchIntakeList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create intake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveIntake = async (id: string) => {
    try {
      setIsSubmitting(true);

      if (isDemoMode()) {
        // Update local state in demo mode
        setIntakeList(intakeList.map(intake =>
          intake.id === id ? { ...intake, status: 'approved' } : intake
        ));
        showToast('Intake approved — matter checklist created', 'success');
        setShowDetailModal(false);
        setSelectedIntake(null);
        return;
      }

      await api.post(`/compliance/intake/${id}/approve`, {});

      showToast('Intake approved — matter checklist created', 'success');

      setShowDetailModal(false);
      setSelectedIntake(null);
      await fetchIntakeList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to approve intake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectIntake = async () => {
    if (!intakeToReject) return;
    if (!rejectReason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      if (isDemoMode()) {
        // Update local state in demo mode
        setIntakeList(intakeList.map(intake =>
          intake.id === intakeToReject.id ? { ...intake, status: 'rejected' } : intake
        ));
        showToast('Intake rejected', 'success');
        setShowRejectDialog(false);
        setRejectReason('');
        setIntakeToReject(null);
        setShowDetailModal(false);
        setSelectedIntake(null);
        return;
      }

      await api.post(`/compliance/intake/${intakeToReject.id}/reject`, {
        reason: rejectReason.trim(),
      });

      showToast('Intake rejected', 'success');

      setShowRejectDialog(false);
      setRejectReason('');
      setIntakeToReject(null);
      setShowDetailModal(false);
      setSelectedIntake(null);
      await fetchIntakeList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject intake', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssessRisk = async () => {
    if (!selectedIntake) return;

    try {
      setIsSubmitting(true);
      await api.post(`/compliance/intake/${selectedIntake.id}/assess`, {
        risk_assessment: assessmentData.risk_assessment,
        notes: assessmentData.notes || undefined,
      });

      showToast('Risk assessment added', 'success');

      setShowAssessDialog(false);
      setAssessmentData({ risk_assessment: 'medium', notes: '' });
      await fetchIntakeList();

      // Refresh selected intake
      const response = await api.get(`/compliance/intake/${selectedIntake.id}`);
      setSelectedIntake(response.data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assess risk', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRejectDialog = (intake: IntakeItem) => {
    setIntakeToReject(intake);
    setRejectReason('');
    setShowRejectDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="CDD Risk Review"
          description="Risk-score and CDD-track clients flowing in from your PMS. Run conflict checks and apply enhanced due diligence where the risk warrants it."
        />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Client Intake & CDD"
        description="Manage client onboarding and due diligence"
      />

      {/* DB-driven combobox suggestions (free text still allowed). */}
      <datalist id="intake-client-options">
        {clientNames.map((name) => (
          <option key={`client-${name}`} value={name} />
        ))}
      </datalist>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* If a PMS integration is connected, intakes flow in from the PMS
          and we discourage manual creation. The button is hidden; a notice
          explains where new intakes come from. */}
      <div className="mb-6 flex items-center justify-between">
        {pmsConnected ? (
          <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>Intakes are synced from <strong>{pmsName}</strong>. New intakes you create there will appear here automatically.</span>
          </div>
        ) : (
          <Button onClick={() => setShowNewIntakeModal(true)}>
            New Intake
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4 bg-white p-4 rounded-xl border border-gray-100">
        <div className="border-b pb-4">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-gray-900 mb-3">Search & Filter</h3>
          <SearchBar
            placeholder="Search by client name..."
            value={searchTerm}
            onChange={setSearchTerm}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Risk Level Filter */}
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Risk Level</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <option value="all">All Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* PEP Flag Filter */}
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">PEP Flag</label>
            <select
              value={pepFilter}
              onChange={(e) => setPepFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <option value="all">All</option>
              <option value="yes">Flagged</option>
              <option value="no">Not Flagged</option>
            </select>
          </div>
        </div>
      </div>

      {/* Intake Table */}
      {filteredIntake.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-gray-100">
          <DataTable
            columns={columns}
            data={filteredIntake.map((intake) => ({
              ...intake,
              matter_type: (intake.practice_area || '').toUpperCase().replace(/_/g, ' '),
              conflict_check: intake.conflict_check_status || intake.conflict_check || '-',
              risk_assessment: intake.risk_level ? (
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${riskBadgeColor(intake.risk_level)}`}>
                  {intake.risk_level.charAt(0).toUpperCase() + intake.risk_level.slice(1)}
                </span>
              ) : (
                '-'
              ),
              assigned_fee_earner: intake.assigned_to || intake.assigned_fee_earner || '-',
              intake_date: <span className="tabular-nums">{formatDate(intake.created_at)}</span>,
            }))}
            onRowClick={(row) => handleDetailModal(row as IntakeItem)}
            className="group hover:bg-gray-50 transition-colors"
          />
        </div>
      ) : (
        <EmptyState
          title="No client intakes"
          description="No intake records match your filters. Create a new intake to get started."
          icon="inbox"
        />
      )}

      {/* New Intake Modal */}
      <Modal
        isOpen={showNewIntakeModal}
        onClose={() => {
          setShowNewIntakeModal(false);
          setIntakeForm({ clientName: '', matterType: '', riskLevel: 'medium', sourceOfFunds: '', pepScreening: false, assignedSolicitor: '' });
          setIntakeErrors({});
        }}
        title="Create New Intake"
        actions={[
          { label: 'Cancel', onClick: () => {
            setShowNewIntakeModal(false);
            setIntakeForm({ clientName: '', matterType: '', riskLevel: 'medium', sourceOfFunds: '', pepScreening: false, assignedSolicitor: '' });
            setIntakeErrors({});
          }},
          { label: 'Create Intake', onClick: handleCreateIntake, variant: 'primary', disabled: !intakeForm.clientName.trim() || !intakeForm.matterType || isSubmitting, loading: isSubmitting },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="intake-client-options"
              className={`w-full px-3 py-2 border rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                intakeErrors.clientName ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter client name"
              value={intakeForm.clientName}
              onChange={(e) => {
                setIntakeForm({ ...intakeForm, clientName: e.target.value });
                if (intakeErrors.clientName) setIntakeErrors({ ...intakeErrors, clientName: '' });
              }}
            />
            {intakeErrors.clientName && (
              <p className="text-red-500 text-xs mt-1">{intakeErrors.clientName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
              Matter Type <span className="text-red-500">*</span>
            </label>
            <select
              className={`w-full px-3 py-2 border rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                intakeErrors.matterType ? 'border-red-500' : 'border-gray-300'
              }`}
              value={intakeForm.matterType}
              onChange={(e) => {
                setIntakeForm({ ...intakeForm, matterType: e.target.value });
                if (intakeErrors.matterType) setIntakeErrors({ ...intakeErrors, matterType: '' });
              }}
            >
              <option value="">Select practice area</option>
              <option value="conveyancing">Conveyancing</option>
              <option value="litigation">Litigation</option>
              <option value="corporate">Corporate</option>
              <option value="employment">Employment</option>
              <option value="family">Family</option>
              <option value="probate">Probate</option>
              <option value="ip">IP</option>
            </select>
            {intakeErrors.matterType && (
              <p className="text-red-500 text-xs mt-1">{intakeErrors.matterType}</p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Risk Level</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={intakeForm.riskLevel}
              onChange={(e) => setIntakeForm({ ...intakeForm, riskLevel: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Source of Funds</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Employment, Investment"
              value={intakeForm.sourceOfFunds}
              onChange={(e) => setIntakeForm({ ...intakeForm, sourceOfFunds: e.target.value })}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
              <input
                type="checkbox"
                className="rounded"
                checked={intakeForm.pepScreening}
                onChange={(e) => setIntakeForm({ ...intakeForm, pepScreening: e.target.checked })}
              />
              <span className="text-sm font-medium text-gray-700">PEP Screening Required</span>
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Assigned Solicitor</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={intakeForm.assignedSolicitor}
              onChange={(e) => setIntakeForm({ ...intakeForm, assignedSolicitor: e.target.value })}
            >
              <option value="">Select solicitor</option>
              <option value="solicitor1">John Smith</option>
              <option value="solicitor2">Jane Doe</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Intake Detail Modal */}
      {selectedIntake && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedIntake(null);
          }}
          title={`${selectedIntake.client_name} - CDD Checklist`}
          actions={[
            { label: 'Close', onClick: () => {
              setShowDetailModal(false);
              setSelectedIntake(null);
            }},
            ...(selectedIntake.status === 'pending_review' ? [
              { label: 'Assess Risk', onClick: () => setShowAssessDialog(true), variant: 'secondary' as const },
              { label: 'Reject', onClick: () => openRejectDialog(selectedIntake), variant: 'secondary' as const, disabled: isSubmitting },
              { label: 'Approve', onClick: () => handleApproveIntake(selectedIntake.id), variant: 'primary' as const, disabled: isSubmitting, loading: isSubmitting },
            ] : []),
          ]}
        >
          <div className="space-y-4">
            <div className="border-b pb-4">
              <h4 className="text-sm uppercase tracking-wide font-semibold text-gray-900 mb-3">Client Information</h4>
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Name</p>
                  <p className="font-medium text-sm mt-1">{selectedIntake.client_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Matter Type</p>
                  <p className="font-medium text-sm mt-1">{(selectedIntake.practice_area || '').toUpperCase().replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Risk Level</p>
                  <p className="font-medium text-sm mt-1">{selectedIntake.risk_level}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={selectedIntake.status as any} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b pb-4">
              <h4 className="text-sm uppercase tracking-wide font-semibold text-gray-900 mb-3">Due Diligence Checklist</h4>
              <div className="space-y-2">
                {Object.entries(cddChecklist).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={() => toggleChecklistItem(key as keyof CDDChecklist)}
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700 flex-1">
                      {key
                        .split('_')
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ')}
                    </span>
                    {value && <Check className="h-4 w-4 text-green-600" />}
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">CDD Completion: {Math.round((Object.values(cddChecklist).filter(Boolean).length / Object.keys(cddChecklist).length) * 100)}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(Object.values(cddChecklist).filter(Boolean).length / Object.keys(cddChecklist).length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRejectDialog}
        title="Reject Intake"
        message="Please provide a reason for rejecting this intake."
        onConfirm={handleRejectIntake}
        onCancel={() => {
          setShowRejectDialog(false);
          setRejectReason('');
          setIntakeToReject(null);
        }}
        confirmLabel="Reject"
        cancelLabel="Cancel"
        isDestructive
        isLoading={isSubmitting}
      >
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter rejection reason..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
        />
      </ConfirmDialog>

      {/* Risk Assessment Dialog */}
      {showAssessDialog && (
        <Modal
          isOpen={showAssessDialog}
          onClose={() => {
            setShowAssessDialog(false);
            setAssessmentData({ risk_assessment: 'medium', notes: '' });
          }}
          title="Add Risk Assessment"
          actions={[
            { label: 'Cancel', onClick: () => {
              setShowAssessDialog(false);
              setAssessmentData({ risk_assessment: 'medium', notes: '' });
            }},
            { label: 'Save Assessment', onClick: handleAssessRisk, variant: 'primary', disabled: isSubmitting, loading: isSubmitting },
          ]}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">
                Risk Level <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={assessmentData.risk_assessment}
                onChange={(e) => setAssessmentData({ ...assessmentData, risk_assessment: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Notes</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add any assessment notes..."
                value={assessmentData.notes}
                onChange={(e) => setAssessmentData({ ...assessmentData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
