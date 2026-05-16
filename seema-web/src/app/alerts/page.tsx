'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  ComplianceFlowNav,
  DataTable,
  StatCard,
  StatusBadge,
  Card,
  Button,
  Modal,
  SearchBar,
  DashboardSkeleton,
  showToast,
  ConfirmDialog,
} from '@/components/ui';
import { ChevronRight } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks';
import { Alert, AlertStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { isDemoMode, DEMO_ALERTS } from '@/lib/demo-data';

interface BackendAlert {
  id: string;
  title: string;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: AlertStatus;
  description: string;
  case_id?: string;
  acknowledged_by?: string;
  resolved_by?: string;
  created_at: string;
}

// Map backend alert to UI Alert type
function mapBackendAlert(backendAlert: BackendAlert): Alert {
  return {
    id: backendAlert.id,
    title: backendAlert.title,
    category: backendAlert.alert_type,
    severity: backendAlert.severity,
    status: backendAlert.status,
    description: backendAlert.description,
    created: new Date(backendAlert.created_at),
    assignedTo: backendAlert.acknowledged_by || backendAlert.resolved_by || 'Unassigned',
    timeline: [
      { action: 'Created', timestamp: new Date(backendAlert.created_at), user: 'System' },
    ],
  };
}

export default function AlertsPage() {
  useRequireAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{type: 'resolve' | 'escalate', id: string} | null>(null);

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isDemoMode()) {
        const mappedAlerts = DEMO_ALERTS.map(alert => ({
          id: alert.id,
          title: alert.title,
          category: alert.alert_type,
          severity: alert.severity,
          status: alert.status,
          description: alert.description,
          created: new Date(alert.created_at),
          assignedTo: alert.acknowledged_by || 'Unassigned',
          timeline: [
            { action: 'Created', timestamp: new Date(alert.created_at), user: 'System' },
          ],
        }));
        setAlerts(mappedAlerts);
        setIsLoading(false);
        return;
      }

      const response = await apiClient.get('/compliance/alerts');
      const mappedAlerts = response.data.map(mapBackendAlert);
      setAlerts(mappedAlerts);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to load alerts.');
      if (isDemoMode()) {
        const mappedAlerts = DEMO_ALERTS.map(alert => ({
          id: alert.id,
          title: alert.title,
          category: alert.alert_type,
          severity: alert.severity,
          status: alert.status,
          description: alert.description,
          created: new Date(alert.created_at),
          assignedTo: alert.acknowledged_by || 'Unassigned',
          timeline: [
            { action: 'Created', timestamp: new Date(alert.created_at), user: 'System' },
          ],
        }));
        setAlerts(mappedAlerts);
        setError('Failed to load alerts. Showing demo data.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = (alert.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = !severityFilter || alert.severity === severityFilter;
    const matchesStatus = !statusFilter || alert.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  const handleAcknowledge = async (id: string) => {
    try {
      if (isDemoMode()) {
        // Update local state in demo mode
        setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'acknowledged' as AlertStatus } : a));
        showToast('Alert acknowledged successfully', 'success');
        setSelectedAlert(null);
        return;
      }

      await apiClient.post(`/compliance/alerts/${id}/acknowledge`);
      showToast('Alert acknowledged successfully', 'success');
      await fetchAlerts();
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      showToast('Failed to acknowledge alert. Please try again.', 'error');
      setError('Failed to acknowledge alert. Please try again.');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      if (isDemoMode()) {
        // Update local state in demo mode
        setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'resolved' as AlertStatus } : a));
        showToast('Alert resolved successfully', 'success');
        setSelectedAlert(null);
        setConfirmAction(null);
        return;
      }

      await apiClient.post(`/compliance/alerts/${id}/resolve`);
      showToast('Alert resolved successfully', 'success');
      await fetchAlerts();
    } catch (err) {
      console.error('Error resolving alert:', err);
      showToast('Failed to resolve alert. Please try again.', 'error');
      setError('Failed to resolve alert. Please try again.');
    }
  };

  const handleEscalate = async (id: string) => {
    try {
      if (isDemoMode()) {
        // Update local state in demo mode
        setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'open' as AlertStatus } : a));
        showToast('Alert escalated successfully', 'success');
        setSelectedAlert(null);
        setConfirmAction(null);
        return;
      }

      await apiClient.post(`/compliance/alerts/${id}/escalate`);
      showToast('Alert escalated successfully', 'success');
      await fetchAlerts();
    } catch (err) {
      console.error('Error escalating alert:', err);
      showToast('Failed to escalate alert. Please try again.', 'error');
      setError('Failed to escalate alert. Please try again.');
    }
  };

  const columns = [
    { accessor: 'title', header: 'TITLE', sortable: true },
    { accessor: 'category', header: 'CATEGORY' },
    {
      accessor: 'severity',
      header: 'SEVERITY',
      render: (_value: any, row: any) => (
        <StatusBadge
          status={row.severity as 'critical' | 'high' | 'medium' | 'low'}
          variant={row.severity}
        />
      ),
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: any) => <StatusBadge status={row.status} />,
    },
    {
      accessor: 'created',
      header: 'CREATED',
      render: (_value: any, row: any) => <span className="tabular-nums">{formatDate(row.created)}</span>,
    },
    { accessor: 'assignedTo', header: 'ASSIGNED TO' },
    {
      accessor: 'id',
      header: '',
      render: () => <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Alerts" description="Manage and respond to compliance issues" />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance Alerts" description="Manage and respond to compliance issues" />
      <ComplianceFlowNav />

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Critical" value={counts.critical} color="red" />
        <StatCard title="High" value={counts.high} color="orange" />
        <StatCard title="Medium" value={counts.medium} color="amber" />
        <StatCard title="Low" value={counts.low} color="green" />
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Card className="rounded-xl">
        <div className="p-6 space-y-4">
          <div className="border-b pb-4">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-gray-900 mb-4">Search & Filter</h3>
            <SearchBar placeholder="Search alerts..." value={searchTerm} onChange={setSearchTerm} />
          </div>

          <div className="flex gap-4">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {alerts.length === 0 ? 'No alerts found.' : 'No alerts match your filters.'}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredAlerts}
              onRowClick={(row) => setSelectedAlert(row as Alert)}
              className="group hover:bg-gray-50 transition-colors"
            />
          )}
        </div>
      </Card>

      {selectedAlert && (
        <Modal
          isOpen={!!selectedAlert}
          onClose={() => {
            setSelectedAlert(null);
            setConfirmAction(null);
          }}
          title={selectedAlert.title}
        >
          <div className="space-y-4">
            <div className="border-b pb-3">
              <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Description</h4>
              <p className="text-gray-700 line-clamp-2">{selectedAlert.description}</p>
            </div>

            <div className="border-b pb-3">
              <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Category</h4>
              <p className="text-gray-700">{selectedAlert.category}</p>
            </div>

            <div className="border-b pb-3">
              <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Severity</h4>
              <StatusBadge
                status={selectedAlert.severity as 'critical' | 'high' | 'medium' | 'low'}
                variant={selectedAlert.severity}
              />
            </div>

            <div className="border-b pb-3">
              <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Status</h4>
              <StatusBadge status={selectedAlert.status} />
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide font-semibold text-gray-600 mb-2">Created</h4>
              <p className="text-gray-700 tabular-nums">{formatDate(selectedAlert.created)}</p>
            </div>

            <div className="flex gap-2">
              {selectedAlert.status !== 'resolved' && (
                <>
                  {selectedAlert.status === 'open' && (
                    <Button onClick={() => handleAcknowledge(selectedAlert.id)} loading={false} disabled={false}>
                      Acknowledge
                    </Button>
                  )}
                  <Button onClick={() => setConfirmAction({type: 'resolve', id: selectedAlert.id})} variant="success" loading={false} disabled={false}>
                    Resolve
                  </Button>
                  <Button onClick={() => setConfirmAction({type: 'escalate', id: selectedAlert.id})} variant="warning" loading={false} disabled={false}>
                    Escalate
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!confirmAction}
        onConfirm={() => {
          if (confirmAction?.type === 'resolve') {
            handleResolve(confirmAction.id);
          } else if (confirmAction?.type === 'escalate') {
            handleEscalate(confirmAction.id);
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
        title={confirmAction?.type === 'resolve' ? 'Resolve Alert' : 'Escalate Alert'}
        message={confirmAction?.type === 'resolve'
          ? 'This will mark the alert as resolved.'
          : 'This will escalate the alert for further action.'}
        confirmLabel={confirmAction?.type === 'resolve' ? 'Resolve' : 'Escalate'}
        variant={confirmAction?.type === 'resolve' ? 'success' : 'warning'}
      />
    </div>
  );
}
