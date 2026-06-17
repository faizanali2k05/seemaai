'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  DataTable,
  Tabs,
  Card,
  Button,
  Modal,
  Input,
  Select,
  EmptyState,
  LoadingSpinner,
  showToast,
  ConfirmDialog,
} from '@/components/ui';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { AlertTriangle, Upload, Download, Trash2, Database, ChevronRight } from 'lucide-react';

interface ImportLog {
  id: string;
  import_type?: string;
  file_name?: string;
  status: string;
  total_rows?: number;
  imported_rows?: number;
  failed_rows?: number;
  error_details?: string;
  created_at?: string;
  [key: string]: any;
}

interface DatabaseStats {
  table: string;
  recordCount: number;
  lastUpdated: string | null;
}

export default function DataManagementPage() {
  useRequireAuth();

  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'system'>('import');
  const [importHistory, setImportHistory] = useState<ImportLog[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedImportType, setSelectedImportType] = useState<'staff' | 'cases' | 'training' | 'clients'>('staff');
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [databaseStats, setDatabaseStats] = useState<DatabaseStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch real per-table database statistics for the System tab.
  useEffect(() => {
    const fetchDatabaseStats = async () => {
      setStatsLoading(true);
      try {
        const response = await apiClient.get('/admin/database-stats');
        const data = response?.data?.data ?? response?.data ?? [];
        setDatabaseStats(Array.isArray(data) ? data : []);
      } catch {
        setDatabaseStats([]);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchDatabaseStats();
  }, []);

  // Fetch import logs
  useEffect(() => {
    const fetchImportLogs = async () => {
      setImportLoading(true);
      setImportError(null);
      try {
        const response = await apiClient.get('/admin/import-logs');
        const data = response?.data?.data || response?.data || response;
        setImportHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Failed to load import logs');
        setImportHistory([]);
      } finally {
        setImportLoading(false);
      }
    };

    fetchImportLogs();
  }, []);

  // Parse CSV text into array of objects
  const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }
    return rows;
  };

  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [uploadFileName, setUploadFileName] = useState<string>('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setUploadError('No valid rows found in CSV');
        setIsUploading(false);
        return;
      }
      setParsedRows(rows);
      setUploadFileName(file.name);
      setPreviewData(rows.slice(0, 10)); // Show first 10 rows as preview
      setShowPreview(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to parse CSV file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsUploading(true);
    try {
      const endpoint = `/admin/import/${selectedImportType}`;
      const response = await apiClient.post(endpoint, {
        rows: parsedRows,
        file_name: uploadFileName,
        skip_duplicates: true,
      });

      const data = response.data || response;
      const imported = data.records_imported || 0;
      const skippedCount = data.records_skipped || 0;
      const failedCount = data.records_failed || 0;

      showToast(
        `Import complete: ${imported} imported, ${skippedCount} skipped, ${failedCount} failed`,
        failedCount > 0 ? 'warning' : 'success'
      );

      setShowPreview(false);
      setPreviewData(null);
      setParsedRows([]);

      // Refresh import logs
      const logsResponse = await apiClient.get('/admin/import-logs');
      const logsData = logsResponse?.data?.data || logsResponse?.data || logsResponse;
      setImportHistory(Array.isArray(logsData) ? logsData : []);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Import failed';
      showToast(errorMsg, 'error');
      setUploadError(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleExport = async (type: 'staff' | 'cases' | 'training') => {
    try {
      const endpoint = `/admin/export/${type}`;
      const response = await apiClient.get(endpoint);

      // Trigger download
      const exportData = response?.data || response;
      const { data, filename, export_type } = exportData;
      const csv = typeof data === 'string' ? data : JSON.stringify(data);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `${type}_export.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`${type} data exported successfully`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      const errorMsg = error instanceof Error ? error.message : `Failed to export ${type}`;
      showToast(errorMsg, 'error');
      setImportError(errorMsg);
    }
  };

  const handleClearDemoData = async () => {
    setClearLoading(true);
    setClearError(null);
    try {
      await apiClient.post('/admin/clear-demo-data', {});
      showToast('Demo data cleared successfully', 'success');
      setShowClearConfirm(false);
      // Refresh import logs
      const response = await apiClient.get('/admin/import-logs');
      const logData = response?.data?.data || response?.data || response;
      setImportHistory(Array.isArray(logData) ? logData : []);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear demo data';
      showToast(errorMsg, 'error');
      setClearError(errorMsg);
    } finally {
      setClearLoading(false);
    }
  };

  const importLogColumns = [
    { accessor: 'created_at', header: 'DATE', render: (_value: any, row: any) => formatDate(row.created_at) },
    { accessor: 'file_name', header: 'FILE' },
    { accessor: 'import_type', header: 'TYPE', render: (_value: any, row: any) => (row.import_type || '').toUpperCase() },
    { accessor: 'total_rows', header: 'TOTAL ROWS', render: (_value: any, row: any) => <span className="tabular-nums">{row.total_rows}</span> },
    { accessor: 'imported_rows', header: 'IMPORTED', render: (_value: any, row: any) => <span className="tabular-nums">{row.imported_rows}</span> },
    { accessor: 'failed_rows', header: 'FAILED', render: (_value: any, row: any) => <span className="tabular-nums">{row.failed_rows}</span> },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: any) => (
        <span
          className={`px-2 py-1 rounded-lg text-sm font-medium transition-colors ${
            row.status === 'success'
              ? 'bg-green-100 text-green-800'
              : row.status === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {(row.status || '').charAt(0).toUpperCase() + (row.status || '').slice(1)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Data Management"
        description="Import, export, and manage compliance data"
      />

      <Tabs
        tabs={[
          { id: 'import', label: 'Import' },
          { id: 'export', label: 'Export' },
          { id: 'system', label: 'System' },
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
      >
        {activeTab === 'import' && (
          <div className="space-y-6">
            <Card className="rounded-xl border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Import CSV Data</h3>

              {uploadError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  {uploadError}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Import Type</label>
                <select
                  value={selectedImportType}
                  onChange={(e) => setSelectedImportType(e.target.value as any)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="staff">Staff</option>
                  <option value="cases">Cases</option>
                  <option value="training">Training</option>
                  <option value="clients">Clients</option>
                </select>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
                <Upload className="mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 mb-2">Drag and drop your CSV file</p>
                <p className="text-sm text-gray-500 mb-4">or</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button
                    as="span"
                    disabled={isUploading}
                    className="cursor-pointer"
                  >
                    {isUploading ? 'Processing...' : 'Select File'}
                  </Button>
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Supported formats:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Staff import: Name, Email, Role, Department</li>
                  <li>• Training import: Name, Training Type, Completion Date</li>
                  <li>• Cases import: Matter Reference, Case Name, Status</li>
                  <li>• Clients import: Firm Name, Matter Reference, Status</li>
                </ul>
              </div>
            </Card>

            <div>
              <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Import History</h3>
              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  {importError}
                </div>
              )}
              {importLoading ? (
                <LoadingSpinner />
              ) : importHistory.length > 0 ? (
                <DataTable columns={importLogColumns} data={importHistory} />
              ) : (
                <EmptyState
                  title="No imports yet"
                  description="CSV imports will appear here"
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-4">
            <Card className="rounded-xl border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Export Data as CSV</h3>
              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  {importError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'staff', label: 'Staff Directory' },
                  { type: 'training', label: 'Training Records' },
                  { type: 'cases', label: 'Cases' },
                ].map((item) => (
                  <Button
                    key={item.type}
                    variant="outline"
                    onClick={() => handleExport(item.type as any)}
                    className="justify-start"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-6">
            <Card className="rounded-xl border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                <Database className="h-5 w-5" />
                Database Statistics
              </h3>
              <div className="space-y-3">
                {statsLoading ? (
                  <LoadingSpinner />
                ) : databaseStats.length > 0 ? (
                  databaseStats.map((stat) => (
                    <div
                      key={stat.table}
                      className="flex justify-between items-center p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                      <div>
                        <p className="font-medium capitalize uppercase tracking-wide text-gray-900">{stat.table}</p>
                        <p className="text-sm text-gray-500">
                          {stat.lastUpdated ? `Updated ${formatDate(stat.lastUpdated)}` : 'No records yet'}
                        </p>
                      </div>
                      <p className="text-lg font-semibold tabular-nums">{(stat.recordCount ?? 0).toLocaleString()}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No data yet" description="Record counts will appear here once you import or sync data." />
                )}
              </div>
            </Card>

          </div>
        )}
      </Tabs>

      {showPreview && previewData && (
        <Modal
          title="Preview Import Data"
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          size="lg"
        >
          <div className="max-h-96 overflow-y-auto mb-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200">
                  {Object.keys(previewData[0] || {}).map((key) => (
                    <th key={key} className="px-4 py-2 text-left font-medium uppercase tracking-wide text-gray-700">
                      {(key || '').charAt(0).toUpperCase() + (key || '').slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    {Object.values(row).map((val, cidx) => (
                      <td key={cidx} className="px-4 py-2">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmImport}>Confirm Import</Button>
          </div>
        </Modal>
      )}

    </div>
  );
}
