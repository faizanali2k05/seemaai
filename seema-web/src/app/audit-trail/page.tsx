'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DataTable, Card, Button, EmptyState } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_AUDIT_TRAIL } from '@/lib/demo-data';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { ChevronRight } from 'lucide-react';

interface AuditEvent {
  id: string;
  timestamp: Date;
  user: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'export' | 'view';
  entityType: string;
  entity: string;
  ipAddress: string;
  details: string;
  userRole?: string;
}

interface BackendAuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  user_email: string;
  details: string;
  ip_address: string;
  timestamp: string;
}

type ActionFilter = 'all' | 'create' | 'update' | 'delete' | 'login' | 'export' | 'view';
type ViewMode = 'table' | 'timeline';

export default function AuditTrailPage() {
  useRequireAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<ActionFilter>('all');
  const [filterUser, setFilterUser] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch audit trail data
  useEffect(() => {
    const fetchAuditData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Demo mode fallback
        if (isDemoMode()) {
          const transformedEvents: AuditEvent[] = DEMO_AUDIT_TRAIL.map(event => ({
            id: event.id,
            timestamp: new Date(event.timestamp),
            user: event.user_name,
            action: (event.action.toLowerCase() as AuditEvent['action']),
            entityType: event.entity_type,
            entity: event.entity_id,
            ipAddress: '192.168.1.100',
            details: event.details,
          }));
          setAuditEvents(transformedEvents);
          setLoading(false);
          return;
        }

        const [eventsResult, summaryResult] = await Promise.allSettled([
          apiClient.get('/compliance/audit-trail'),
          apiClient.get('/compliance/audit-trail/summary'),
        ]);

        if (eventsResult.status === 'fulfilled' && eventsResult.value) {
          const backendEvents: BackendAuditEvent[] = eventsResult.value.data || [];

          // Transform backend data to frontend format
          const transformedEvents: AuditEvent[] = backendEvents.map(event => ({
            id: event.id,
            timestamp: new Date(event.timestamp),
            user: event.user_email,
            action: (event.action.toLowerCase() as AuditEvent['action']),
            entityType: event.entity_type,
            entity: event.entity_id,
            ipAddress: event.ip_address,
            details: event.details,
          }));

          setAuditEvents(transformedEvents);
        } else {
          setError('Failed to fetch audit events');
          // Fallback to demo data only if in demo mode
          if (isDemoMode()) {
            const transformedEvents: AuditEvent[] = DEMO_AUDIT_TRAIL.map(event => ({
              id: event.id,
              timestamp: new Date(event.timestamp),
              user: event.user_name,
              action: (event.action.toLowerCase() as AuditEvent['action']),
              entityType: event.entity_type,
              entity: event.entity_id,
              ipAddress: '192.168.1.100',
              details: event.details,
            }));
            setAuditEvents(transformedEvents);
          }
        }
      } catch (err) {
        console.error('Error fetching audit trail data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching audit trail data');
        // Fallback to demo data only if in demo mode
        if (isDemoMode()) {
          const transformedEvents: AuditEvent[] = DEMO_AUDIT_TRAIL.map(event => ({
            id: event.id,
            timestamp: new Date(event.timestamp),
            user: event.user_name,
            action: (event.action.toLowerCase() as AuditEvent['action']),
            entityType: event.entity_type,
            entity: event.entity_id,
            ipAddress: '192.168.1.100',
            details: event.details,
          }));
          setAuditEvents(transformedEvents);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAuditData();
  }, []);

  const filteredEvents = auditEvents.filter(event => {
    const matchesSearch =
      searchQuery === '' ||
      (event.user || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.entity || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.details || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = filterAction === 'all' || event.action === filterAction;
    const matchesUser = filterUser === '' || event.user === filterUser;
    const matchesEntityType = filterEntityType === '' || event.entityType === filterEntityType;

    return matchesSearch && matchesAction && matchesUser && matchesEntityType;
  });

  const columns = [
    { accessor: 'timestamp', header: 'Timestamp', width: '15%' },
    { accessor: 'user', header: 'User', width: '12%' },
    { accessor: 'action', header: 'Action', width: '10%' },
    { accessor: 'entityType', header: 'Entity Type', width: '15%' },
    { accessor: 'entity', header: 'Entity', width: '12%' },
    { accessor: 'ipAddress', header: 'IP Address', width: '12%' },
    { accessor: 'details', header: 'Details', width: '24%' },
  ];

  const getActionColor = (action: AuditEvent['action']) => {
    switch (action) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-purple-100 text-purple-800';
      case 'export':
        return 'bg-orange-100 text-orange-800';
      case 'view':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatEventData = (events: AuditEvent[]) =>
    events.map(event => ({
      ...event,
      timestamp: formatDateTime(event.timestamp),
      action: (
        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getActionColor(event.action)}`}>
          {(event.action || '').charAt(0).toUpperCase() + (event.action || '').slice(1)}
        </span>
      ),
    }));

  const uniqueUsers = Array.from(new Set(auditEvents.map(e => e.user)));
  const uniqueEntityTypes = Array.from(new Set(auditEvents.map(e => e.entityType)));

  const handleExportCSV = () => {
    if (filteredEvents.length === 0) {
      alert('No events to export');
      return;
    }

    const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity', 'IP Address', 'Details'];
    const rows = filteredEvents.map(event => [
      formatDate(event.timestamp) + ' ' + formatDateTime(event.timestamp),
      event.user,
      event.action,
      event.entityType,
      event.entity,
      event.ipAddress,
      event.details,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${formatDate(new Date())}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Audit Trail"
        description="Immutable log of all system activities and user actions for compliance and security"
      />

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Search by user, entity, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('table')}
                className="flex-1"
              >
                Table View
              </Button>
              <Button
                variant={viewMode === 'timeline' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('timeline')}
                className="flex-1"
              >
                Timeline View
              </Button>
              <Button variant="secondary" onClick={handleExportCSV}>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value as ActionFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="export">Export</option>
              <option value="view">View</option>
            </select>

            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">All Users</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>

            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">All Entity Types</option>
              {uniqueEntityTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600">Loading audit trail data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <DataTable columns={columns} data={formatEventData(filteredEvents)} />
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEvents.map((event, idx) => (
                  <div key={event.id} className="group p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className={`w-3 h-3 rounded-full mt-2 flex-shrink-0 ${
                        event.action === 'create' ? 'bg-green-600' :
                        event.action === 'update' ? 'bg-blue-600' :
                        event.action === 'delete' ? 'bg-red-600' :
                        event.action === 'login' ? 'bg-purple-600' :
                        event.action === 'export' ? 'bg-orange-600' :
                        'bg-gray-600'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{event.user}</span>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getActionColor(event.action)}`}>
                            {(event.action || '').charAt(0).toUpperCase() + (event.action || '').slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{event.details}</p>
                        <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                          <span className="tabular-nums">{formatDate(event.timestamp)} {formatDateTime(event.timestamp)}</span>
                          <span>Entity: {event.entity}</span>
                          <span>Type: {event.entityType}</span>
                          <span className="font-mono">{event.ipAddress}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="No audit events found"
              description="Try adjusting your filters"
            />
          )}
        </div>
      </Card>

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-gray-900">Audit Trail Information</h2>
        </div>
        <div className="p-6 space-y-3 text-sm text-gray-700">
          <p>
            This audit trail provides an immutable record of all system activities and user actions. All events are logged with:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Precise timestamp of the action</li>
            <li>User who performed the action</li>
            <li>Type of action (create, update, delete, login, export, view)</li>
            <li>Entity affected by the action</li>
            <li>IP address of the user</li>
            <li>Detailed description of what was done</li>
          </ul>
          <p className="mt-4">
            This log cannot be edited or deleted, ensuring full compliance with regulatory requirements and maintaining data integrity.
          </p>
        </div>
      </Card>
    </div>
  );
}
