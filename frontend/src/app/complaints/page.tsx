'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth, useClientMatterOptions } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  DataTable,
  StatCard,
  StatusBadge,
  Card,
  Button,
  Modal,
  Input,
  Select,
  showToast,
  LoadingSpinner,
  EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Eye,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';

interface ComplaintStats {
  total: number;
  open: number;
  upheld: number;
  leo_escalated: number;
  sra_reportable: number;
  overdue_acknowledgement: number;
}

interface Complaint {
  id: string;
  complainant_name: string;
  complainant_email: string;
  complainant_phone: string;
  complainant_type: 'client' | 'former_client' | 'opposing_party' | 'third_party' | 'regulator';
  category: 'service_quality' | 'costs' | 'delay' | 'communication' | 'confidentiality' | 'conflict' | 'other';
  description: string;
  date_received: string;
  date_of_incident: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'escalated';
  acknowledged_date: string | null;
  acknowledged_by: string | null;
  outcome: 'upheld' | 'partially_upheld' | 'not_upheld' | 'withdrawn' | null;
  response_summary: string | null;
  remedy_offered: string | null;
  remedy_amount: number | null;
  root_cause: string | null;
  lessons_learned: string | null;
  sra_reportable: boolean;
  assigned_investigator: string | null;
  created_at: string;
  updated_at: string;
}

interface LogComplaintFormData {
  complainant_name: string;
  complainant_email: string;
  complainant_phone: string;
  complainant_type: string;
  category: string;
  description: string;
  date_received: string;
  date_of_incident: string;
  priority: string;
}

interface ResolveComplaintFormData {
  outcome: string;
  response_summary: string;
  remedy_offered: string;
  remedy_amount: string;
  root_cause: string;
  lessons_learned: string;
  sra_reportable: boolean;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-red-100 text-red-900';
    case 'acknowledged':
      return 'bg-yellow-100 text-yellow-900';
    case 'investigating':
      return 'bg-blue-100 text-blue-900';
    case 'resolved':
      return 'bg-green-100 text-green-900';
    case 'escalated':
      return 'bg-orange-100 text-orange-900';
    default:
      return 'bg-gray-100 text-gray-900';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-100 text-red-900';
    case 'high':
      return 'bg-orange-100 text-orange-900';
    case 'medium':
      return 'bg-yellow-100 text-yellow-900';
    case 'low':
      return 'bg-gray-100 text-gray-900';
    default:
      return 'bg-gray-100 text-gray-900';
  }
}

function isOverdueAcknowledgement(dateReceived: string): boolean {
  const receivedDate = new Date(dateReceived);
  const today = new Date();
  const daysPassedMs = today.getTime() - receivedDate.getTime();
  const daysPassed = daysPassedMs / (1000 * 60 * 60 * 24);
  // Business days: exclude weekends (2 business days = typically 2-4 calendar days depending on weekends)
  // For simplicity, checking if more than 4 calendar days have passed
  return daysPassed > 4;
}

export default function ComplaintsPage() {
  useRequireAuth();

  // DB-driven combobox option list (client / complainant names)
  const { clientNames } = useClientMatterOptions();

  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Modal states
  const [isLogComplaintOpen, setIsLogComplaintOpen] = useState(false);
  const [isResolveComplaintOpen, setIsResolveComplaintOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);

  // Form states
  const [logComplaintForm, setLogComplaintForm] = useState<LogComplaintFormData>({
    complainant_name: '',
    complainant_email: '',
    complainant_phone: '',
    complainant_type: '',
    category: '',
    description: '',
    date_received: new Date().toISOString().split('T')[0],
    date_of_incident: '',
    priority: 'medium',
  });

  const [resolveComplaintForm, setResolveComplaintForm] = useState<ResolveComplaintFormData>({
    outcome: '',
    response_summary: '',
    remedy_offered: '',
    remedy_amount: '',
    root_cause: '',
    lessons_learned: '',
    sra_reportable: false,
  });

  const [logComplaintErrors, setLogComplaintErrors] = useState<Partial<LogComplaintFormData>>({});
  const [isSubmittingLogComplaint, setIsSubmittingLogComplaint] = useState(false);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [statusFilter, categoryFilter]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch stats
      const statsRes = await apiClient.get('/compliance/complaints/stats');
      setStats(statsRes.data);

      // Fetch complaints with filters
      let url = '/compliance/complaints';
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const complaintsRes = await apiClient.get(url);
      setComplaints(Array.isArray(complaintsRes.data) ? complaintsRes.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaints');
      console.error('Error fetching complaints:', err);
      showToast('Failed to load complaints data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const validateLogComplaintForm = (): boolean => {
    const errors: Partial<LogComplaintFormData> = {};

    if (!logComplaintForm.complainant_name.trim()) {
      errors.complainant_name = 'Complainant name is required';
    }
    if (!logComplaintForm.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!logComplaintForm.complainant_type) {
      errors.complainant_type = 'Complainant type is required';
    }
    if (!logComplaintForm.category) {
      errors.category = 'Category is required';
    }

    setLogComplaintErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogComplaint = async () => {
    if (!validateLogComplaintForm()) return;

    try {
      setIsSubmittingLogComplaint(true);

      const payload = {
        ...logComplaintForm,
        remedy_amount: logComplaintForm.priority ? undefined : null,
      };

      const response = await apiClient.post('/compliance/complaints', payload);

      if (response) {
        showToast('Complaint logged successfully', 'success');
        setIsLogComplaintOpen(false);
        setLogComplaintForm({
          complainant_name: '',
          complainant_email: '',
          complainant_phone: '',
          complainant_type: '',
          category: '',
          description: '',
          date_received: new Date().toISOString().split('T')[0],
          date_of_incident: '',
          priority: 'medium',
        });
        setLogComplaintErrors({});
        await fetchData();
      }
    } catch (err) {
      showToast('Failed to log complaint', 'error');
    } finally {
      setIsSubmittingLogComplaint(false);
    }
  };

  const handleAcknowledgeComplaint = async (complaintId: string) => {
    try {
      setIsAcknowledging(complaintId);
      const response = await apiClient.post(
        `/compliance/complaints/${complaintId}/acknowledge`,
        {}
      );

      if (response) {
        showToast('Complaint acknowledged', 'success');
        await fetchData();
      }
    } catch (err) {
      showToast('Failed to acknowledge complaint', 'error');
    } finally {
      setIsAcknowledging(null);
    }
  };

  const handleResolveComplaint = async () => {
    if (!selectedComplaint) return;

    try {
      setIsSubmittingResolve(true);

      const payload = {
        outcome: resolveComplaintForm.outcome,
        response_summary: resolveComplaintForm.response_summary,
        remedy_offered: resolveComplaintForm.remedy_offered,
        remedy_amount: resolveComplaintForm.remedy_amount
          ? parseFloat(resolveComplaintForm.remedy_amount)
          : null,
        root_cause: resolveComplaintForm.root_cause,
        lessons_learned: resolveComplaintForm.lessons_learned,
        sra_reportable: resolveComplaintForm.sra_reportable,
      };

      const response = await apiClient.post(
        `/compliance/complaints/${selectedComplaint.id}/resolve`,
        payload
      );

      if (response) {
        showToast('Complaint resolved', 'success');
        setIsResolveComplaintOpen(false);
        setSelectedComplaint(null);
        setResolveComplaintForm({
          outcome: '',
          response_summary: '',
          remedy_offered: '',
          remedy_amount: '',
          root_cause: '',
          lessons_learned: '',
          sra_reportable: false,
        });
        await fetchData();
      }
    } catch (err) {
      showToast('Failed to resolve complaint', 'error');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const filteredComplaints = complaints.filter((complaint) => {
    if (statusFilter && complaint.status !== statusFilter) return false;
    if (categoryFilter && complaint.category !== categoryFilter) return false;
    return true;
  });

  const tableColumns = [
    {
      header: 'Complainant',
      accessor: 'complainant_name',
      sortable: true,
    },
    {
      header: 'Type',
      accessor: 'complainant_type',
      sortable: true,
      render: (value: string) =>
        (value || '').charAt(0).toUpperCase() + (value || '').slice(1).replace('_', ' '),
    },
    {
      header: 'Category',
      accessor: 'category',
      sortable: true,
      render: (value: string) =>
        (value || '').charAt(0).toUpperCase() + (value || '').slice(1).replace('_', ' '),
    },
    {
      header: 'Date Received',
      accessor: 'date_received',
      sortable: true,
      render: (value: string) => formatDate(value),
    },
    {
      header: 'Acknowledged',
      accessor: 'acknowledged_date',
      sortable: true,
      render: (value: string) =>
        value ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-gray-400" />
        ),
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (value: string) => (
        <div
          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
            value
          )}`}
        >
          {(value || '').charAt(0).toUpperCase() + (value || '').slice(1)}
        </div>
      ),
    },
    {
      header: 'Priority',
      accessor: 'priority',
      sortable: true,
      render: (value: string) => (
        <div
          className={`inline-flex px-3 py-1 rounded text-xs font-medium ${getPriorityColor(
            value
          )}`}
        >
          {(value || '').charAt(0).toUpperCase() + (value || '').slice(1)}
        </div>
      ),
    },
    {
      header: 'Outcome',
      accessor: 'outcome',
      sortable: true,
      render: (value: string) => (value ? value.replace('_', ' ') : '-'),
    },
    {
      header: 'Actions',
      accessor: 'id',
      sortable: false,
      render: (value: string, row: Complaint) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedComplaint(row);
              setIsDetailViewOpen(true);
            }}
            className="text-xs"
          >
            <Eye className="w-4 h-4" />
          </Button>

          {row.status === 'open' && !row.acknowledged_date && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAcknowledgeComplaint(row.id)}
              disabled={isAcknowledging === row.id}
              className="text-xs"
            >
              {isAcknowledging === row.id ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
          )}

          {row.status !== 'resolved' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedComplaint(row);
                setIsResolveComplaintOpen(true);
              }}
              className="text-xs"
            >
              Resolve
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-8">
      {/* DB-driven combobox suggestions (free text still allowed). */}
      <datalist id="complaints-client-options">
        {clientNames.map((name) => (
          <option key={`client-${name}`} value={name} />
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <PageHeader
          title="Complaints Handling"
          description="Manage and track client complaints"
        />
        <Button
          onClick={() => setIsLogComplaintOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Log Complaint
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <StatCard
            title="Total Complaints"
            value={stats.total}
            icon={<FileText className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            title="Open"
            value={stats.open}
            icon={<AlertCircle className="w-5 h-5" />}
            color="red"
          />
          <StatCard
            title="Upheld"
            value={stats.upheld}
            icon={<CheckCircle className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            title="LeO Escalated"
            value={stats.leo_escalated}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="orange"
          />
          <StatCard
            title="SRA Reportable"
            value={stats.sra_reportable}
            icon={<FileText className="w-5 h-5" />}
            color="orange"
          />
          <StatCard
            title="Overdue Ack."
            value={stats.overdue_acknowledgement}
            icon={<Clock className="w-5 h-5" />}
            color={stats.overdue_acknowledgement > 0 ? 'red' : 'green'}
          />
        </div>
      )}

      {/* Filters */}
      <Card className="rounded-xl p-6 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-900 mb-4 uppercase tracking-wide">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Status"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'open', label: 'Open' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'investigating', label: 'Investigating' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'escalated', label: 'Escalated' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            label="Category"
            options={[
              { value: '', label: 'All Categories' },
              { value: 'service_quality', label: 'Service Quality' },
              { value: 'costs', label: 'Costs' },
              { value: 'delay', label: 'Delay' },
              { value: 'communication', label: 'Communication' },
              { value: 'confidentiality', label: 'Confidentiality' },
              { value: 'conflict', label: 'Conflict' },
              { value: 'other', label: 'Other' },
            ]}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />
        </div>
      </Card>

      {/* Complaints Table */}
      <DataTable
        columns={tableColumns as any}
        data={filteredComplaints}
        pageSize={10}
        loading={isLoading}
        emptyStateTitle="No complaints"
        emptyStateDescription="No complaints found matching your filters."
        onRowClick={(row) => {
          setSelectedComplaint(row);
          setIsDetailViewOpen(true);
        }}
      />

      {/* Log Complaint Modal */}
      <Modal
        isOpen={isLogComplaintOpen}
        onClose={() => {
          setIsLogComplaintOpen(false);
          setLogComplaintForm({
            complainant_name: '',
            complainant_email: '',
            complainant_phone: '',
            complainant_type: '',
            category: '',
            description: '',
            date_received: new Date().toISOString().split('T')[0],
            date_of_incident: '',
            priority: 'medium',
          });
          setLogComplaintErrors({});
        }}
        title="Log New Complaint"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <Input
            label="Complainant Name *"
            list="complaints-client-options"
            value={logComplaintForm.complainant_name}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                complainant_name: e.target.value,
              })
            }
            error={logComplaintErrors.complainant_name as string}
            placeholder="Full name"
          />

          <Input
            label="Complainant Email"
            type="email"
            value={logComplaintForm.complainant_email}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                complainant_email: e.target.value,
              })
            }
            placeholder="email@example.com"
          />

          <Input
            label="Complainant Phone"
            value={logComplaintForm.complainant_phone}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                complainant_phone: e.target.value,
              })
            }
            placeholder="+44 (0) 20 1234 5678"
          />

          <Select
            label="Complainant Type *"
            options={[
              { value: '', label: 'Select type...' },
              { value: 'client', label: 'Client' },
              { value: 'former_client', label: 'Former Client' },
              { value: 'opposing_party', label: 'Opposing Party' },
              { value: 'third_party', label: 'Third Party' },
              { value: 'regulator', label: 'Regulator' },
            ]}
            value={logComplaintForm.complainant_type}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                complainant_type: e.target.value,
              })
            }
            error={logComplaintErrors.complainant_type as string}
          />

          <Select
            label="Category *"
            options={[
              { value: '', label: 'Select category...' },
              { value: 'service_quality', label: 'Service Quality' },
              { value: 'costs', label: 'Costs' },
              { value: 'delay', label: 'Delay' },
              { value: 'communication', label: 'Communication' },
              { value: 'confidentiality', label: 'Confidentiality' },
              { value: 'conflict', label: 'Conflict' },
              { value: 'other', label: 'Other' },
            ]}
            value={logComplaintForm.category}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                category: e.target.value,
              })
            }
            error={logComplaintErrors.category as string}
          />

          <div className="form-group border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1 uppercase tracking-wide">
              Description *
            </label>
            <textarea
              value={logComplaintForm.description}
              onChange={(e) =>
                setLogComplaintForm({
                  ...logComplaintForm,
                  description: e.target.value,
                })
              }
              className="w-full px-4 py-2 border border-[#e2e5ed] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition-colors"
              rows={4}
              placeholder="Detailed description of the complaint"
            />
            {logComplaintErrors.description && (
              <p className="text-sm text-[#dc2626] mt-1">
                {logComplaintErrors.description}
              </p>
            )}
          </div>

          <Input
            label="Date Received"
            type="date"
            value={logComplaintForm.date_received}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                date_received: e.target.value,
              })
            }
          />

          <Input
            label="Date of Incident"
            type="date"
            value={logComplaintForm.date_of_incident}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                date_of_incident: e.target.value,
              })
            }
          />

          <Select
            label="Priority"
            options={[
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            value={logComplaintForm.priority}
            onChange={(e) =>
              setLogComplaintForm({
                ...logComplaintForm,
                priority: e.target.value,
              })
            }
          />
        </div>
      </Modal>

      {/* Resolve Complaint Modal */}
      {selectedComplaint && (
        <Modal
          isOpen={isResolveComplaintOpen}
          onClose={() => {
            setIsResolveComplaintOpen(false);
            setResolveComplaintForm({
              outcome: '',
              response_summary: '',
              remedy_offered: '',
              remedy_amount: '',
              root_cause: '',
              lessons_learned: '',
              sra_reportable: false,
            });
          }}
          title={`Resolve Complaint - ${selectedComplaint.complainant_name}`}
          className="max-w-2xl"
        >
          <div className="space-y-4">
            <Select
              label="Outcome *"
              options={[
                { value: '', label: 'Select outcome...' },
                { value: 'upheld', label: 'Upheld' },
                { value: 'partially_upheld', label: 'Partially Upheld' },
                { value: 'not_upheld', label: 'Not Upheld' },
                { value: 'withdrawn', label: 'Withdrawn' },
              ]}
              value={resolveComplaintForm.outcome}
              onChange={(e) =>
                setResolveComplaintForm({
                  ...resolveComplaintForm,
                  outcome: e.target.value,
                })
              }
            />

            <div className="form-group border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1 uppercase tracking-wide">
                Response Summary
              </label>
              <textarea
                value={resolveComplaintForm.response_summary}
                onChange={(e) =>
                  setResolveComplaintForm({
                    ...resolveComplaintForm,
                    response_summary: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border border-[#e2e5ed] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition-colors"
                rows={3}
                placeholder="Summary of the investigation and response"
              />
            </div>

            <Input
              label="Remedy Offered"
              value={resolveComplaintForm.remedy_offered}
              onChange={(e) =>
                setResolveComplaintForm({
                  ...resolveComplaintForm,
                  remedy_offered: e.target.value,
                })
              }
              placeholder="Description of remedy"
            />

            <Input
              label="Remedy Amount (£)"
              type="number"
              value={resolveComplaintForm.remedy_amount}
              onChange={(e) =>
                setResolveComplaintForm({
                  ...resolveComplaintForm,
                  remedy_amount: e.target.value,
                })
              }
              placeholder="0.00"
            />

            <div className="form-group">
              <label className="block text-sm font-medium text-gray-700 mb-1 uppercase tracking-wide">
                Root Cause
              </label>
              <textarea
                value={resolveComplaintForm.root_cause}
                onChange={(e) =>
                  setResolveComplaintForm({
                    ...resolveComplaintForm,
                    root_cause: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border border-[#e2e5ed] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition-colors"
                rows={2}
                placeholder="Root cause analysis"
              />
            </div>

            <div className="form-group">
              <label className="block text-sm font-medium text-gray-700 mb-1 uppercase tracking-wide">
                Lessons Learned
              </label>
              <textarea
                value={resolveComplaintForm.lessons_learned}
                onChange={(e) =>
                  setResolveComplaintForm({
                    ...resolveComplaintForm,
                    lessons_learned: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border border-[#e2e5ed] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition-colors"
                rows={2}
                placeholder="Lessons learned and actions taken"
              />
            </div>

            <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <input
                type="checkbox"
                id="sra_reportable"
                checked={resolveComplaintForm.sra_reportable}
                onChange={(e) =>
                  setResolveComplaintForm({
                    ...resolveComplaintForm,
                    sra_reportable: e.target.checked,
                  })
                }
                className="rounded border-[#e2e5ed]"
              />
              <label htmlFor="sra_reportable" className="text-sm text-gray-700 cursor-pointer">
                This complaint is SRA Reportable
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail View Modal */}
      {selectedComplaint && (
        <Modal
          isOpen={isDetailViewOpen}
          onClose={() => {
            setIsDetailViewOpen(false);
            setSelectedComplaint(null);
          }}
          title={`Complaint Details - ${selectedComplaint.complainant_name}`}
          className="max-w-3xl"
        >
          <div className="space-y-6">
            {/* Complainant Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
                <p className="text-sm text-gray-900 mt-1 line-clamp-2">{selectedComplaint.complainant_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-sm text-gray-900 mt-1 line-clamp-2">
                  {selectedComplaint.complainant_email || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</p>
                <p className="text-sm text-gray-900 mt-1 tabular-nums">
                  {selectedComplaint.complainant_phone || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</p>
                <p className="text-sm text-gray-900 mt-1">
                  {selectedComplaint.complainant_type.replace('_', ' ')}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-xs font-semibold text-gray-900 mb-4 uppercase tracking-wide">Complaint Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {selectedComplaint.category.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={selectedComplaint.status as any}>
                      {selectedComplaint.status.replace('_', ' ')}
                    </StatusBadge>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</p>
                  <div className="mt-1">
                    <StatusBadge status={selectedComplaint.priority as any}>
                      {selectedComplaint.priority}
                    </StatusBadge>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date Received</p>
                  <p className="text-sm text-gray-900 mt-1 tabular-nums">
                    {formatDate(selectedComplaint.date_received)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date of Incident</p>
                  <p className="text-sm text-gray-900 mt-1 tabular-nums">
                    {selectedComplaint.date_of_incident
                      ? formatDate(selectedComplaint.date_of_incident)
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Acknowledged</p>
                  <p className="text-sm text-gray-900 mt-1 tabular-nums">
                    {selectedComplaint.acknowledged_date
                      ? formatDate(selectedComplaint.acknowledged_date)
                      : 'Not yet'}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</p>
              <p className="text-sm text-gray-900 mt-2 whitespace-pre-wrap line-clamp-2">
                {selectedComplaint.description}
              </p>
            </div>

            {/* Resolution Details */}
            {selectedComplaint.outcome && (
              <div className="border-t border-gray-200 pt-6">
                <h4 className="text-xs font-semibold text-gray-900 mb-4 uppercase tracking-wide">Resolution Details</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outcome</p>
                    <p className="text-sm text-gray-900 mt-1">
                      {selectedComplaint.outcome.replace('_', ' ')}
                    </p>
                  </div>
                  {selectedComplaint.response_summary && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Response Summary</p>
                      <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap line-clamp-2">
                        {selectedComplaint.response_summary}
                      </p>
                    </div>
                  )}
                  {selectedComplaint.remedy_offered && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remedy Offered</p>
                      <p className="text-sm text-gray-900 mt-1 line-clamp-2">
                        {selectedComplaint.remedy_offered}
                      </p>
                    </div>
                  )}
                  {selectedComplaint.remedy_amount && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Remedy Amount</p>
                      <p className="text-sm text-gray-900 mt-1 tabular-nums">
                        £{selectedComplaint.remedy_amount.toLocaleString('en-GB', {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  )}
                  {selectedComplaint.root_cause && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Root Cause</p>
                      <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap line-clamp-2">
                        {selectedComplaint.root_cause}
                      </p>
                    </div>
                  )}
                  {selectedComplaint.sra_reportable && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                      <p className="text-sm text-orange-900">
                        <strong>SRA Reportable:</strong> This complaint has been marked as
                        reportable to the SRA.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Acknowledgement Warning */}
            {!selectedComplaint.acknowledged_date &&
              isOverdueAcknowledgement(selectedComplaint.date_received) && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-900">
                    <strong>Warning:</strong> This complaint is overdue for acknowledgement (should
                    have been acknowledged within 2 business days).
                  </p>
                </div>
              )}
          </div>
        </Modal>
      )}
    </div>
  );
}
