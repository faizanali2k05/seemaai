'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  LoadingSpinner,
  showToast,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  AlertCircle as AlertIcon,
  ChevronRight,
} from 'lucide-react';
import { isDemoMode, DEMO_AML_STATS, DEMO_CDD_RECORDS, DEMO_SAR_RECORDS } from '@/lib/demo-data';

interface AMLStats {
  cdd_total?: number;
  cdd_incomplete?: number;
  cdd_verified?: number;
  completion_rate?: number;
  pep_flagged?: number;
  sars_pending?: number;
  // Demo/legacy keys
  total_cdd?: number;
  pending_review?: number;
  high_risk?: number;
  sars_filed_ytd?: number;
  sars_pending_mlro?: number;
  pep_matches?: number;
  sanctions_hits?: number;
  [key: string]: any;
}

interface CDDRecord {
  id: string;
  client_name: string;
  client_type?: string;
  cdd_level?: string;
  // Loose — demo data uses strings outside the union.
  risk_level: 'low' | 'medium' | 'high' | 'very_high' | string;
  id_verified?: boolean;
  address_verified?: boolean;
  sof_verified?: boolean;
  status: 'incomplete' | 'pending_review' | 'verified' | 'expired' | string;
  nationality?: string;
  country_of_residence?: string;
  date_of_birth?: string;
  company_number?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

interface CDDDetail extends CDDRecord {
  pep_screenings: Array<{
    id: string;
    screening_date: string;
    result: string;
    status: string;
  }>;
  sanctions_checks: Array<{
    id: string;
    check_date: string;
    result: string;
    status: string;
  }>;
}

interface SARRecord {
  id: string;
  client_name: string;
  matter_ref?: string;
  suspicion_type?: string;
  amount?: number;
  report_date?: string;
  mlro_decision?: string | null;
  nca_filed?: boolean;
  status: 'draft' | 'pending_mlro' | 'filed' | 'rejected' | 'closed' | string;
  grounds_for_suspicion?: string;
  transaction_details?: string;
  // Demo/legacy keys
  subject?: string;
  filed_at?: string | null;
  created_at?: string;
  filer?: string;
  nca_reference?: string | null;
  narrative?: string;
  [key: string]: any;
}

export default function AMLPage() {
  useRequireAuth();
  const router = useRouter();

  // DB-driven combobox option lists (client names / matter refs)
  const { clientNames, matterReferences } = useClientMatterOptions();

  // Stats
  const [stats, setStats] = useState<AMLStats | null>(null);

  // CDD Records
  const [cddRecords, setCDDRecords] = useState<CDDRecord[]>([]);
  const [selectedCDD, setSelectedCDD] = useState<CDDDetail | null>(null);
  const [showNewCDDModal, setShowNewCDDModal] = useState(false);
  const [cddFormData, setCDDFormData] = useState({
    client_name: '',
    client_type: 'individual',
    nationality: '',
    country_of_residence: '',
    date_of_birth: '',
    company_number: '',
  });

  // SAR Records
  const [sarRecords, setSARRecords] = useState<SARRecord[]>([]);
  const [showNewSARModal, setShowNewSARModal] = useState(false);
  const [sarFormData, setSARFormData] = useState({
    client_name: '',
    matter_ref: '',
    suspicion_type: 'money_laundering',
    grounds_for_suspicion: '',
    transaction_details: '',
    amount_involved: '',
  });

  // MLRO Decision
  const [mlroModal, setMLROModal] = useState<{ id: string } | null>(null);
  const [mlroFormData, setMLROFormData] = useState({
    decision: 'file_sar',
    reasoning: '',
    nca_reference: '',
  });

  // PEP Screening / Sanctions Check
  const [screeningLoading, setScreeningLoading] = useState<string | null>(null);
  const [sanctionsLoading, setSanctionsLoading] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'cdd' | 'sar'>('cdd');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isDemoMode()) {
        setStats(DEMO_AML_STATS);
        setCDDRecords(DEMO_CDD_RECORDS);
        setSARRecords(DEMO_SAR_RECORDS);
        setIsLoading(false);
        return;
      }

      const [statsRes, cddRes, sarRes] = await Promise.all([
        apiClient.get('/compliance/aml/stats'),
        apiClient.get('/compliance/aml/cdd'),
        apiClient.get('/compliance/aml/sar'),
      ]);

      // Real API stats shape is { total_cdd, pending_cdd, approved_cdd, total_sars }.
      // The cards read cdd_total / cdd_incomplete / cdd_verified / completion_rate /
      // pep_flagged / sars_pending — normalize so they display real numbers.
      const rawStats = (statsRes.data as any) ?? {};
      const cddTotal = rawStats.cdd_total ?? rawStats.total_cdd ?? 0;
      const cddVerified = rawStats.cdd_verified ?? rawStats.approved_cdd ?? 0;
      const cddIncomplete = rawStats.cdd_incomplete ?? rawStats.pending_cdd ?? 0;
      setStats({
        ...rawStats,
        cdd_total: cddTotal,
        cdd_verified: cddVerified,
        cdd_incomplete: cddIncomplete,
        completion_rate:
          rawStats.completion_rate ?? (cddTotal > 0 ? (cddVerified / cddTotal) * 100 : 0),
        pep_flagged: rawStats.pep_flagged ?? 0,
        sars_pending: rawStats.sars_pending ?? rawStats.sars_pending_mlro ?? 0,
      });
      setCDDRecords(Array.isArray(cddRes.data) ? (cddRes.data as any) : []);
      setSARRecords(Array.isArray(sarRes.data) ? (sarRes.data as any) : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load AML data';
      setError(errorMsg);
      console.error('Error fetching AML data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // CDD Records handlers
  const handleCreateCDD = async () => {
    if (!cddFormData.client_name) {
      showToast('Client name is required', 'error');
      return;
    }

    if (isDemoMode()) {
      const newCDD: CDDRecord = {
        id: `cdd-${Date.now()}`,
        client_name: cddFormData.client_name,
        client_type: cddFormData.client_type,
        cdd_level: 'standard',
        risk_level: 'medium',
        id_verified: false,
        address_verified: false,
        sof_verified: false,
        status: 'incomplete',
        nationality: cddFormData.nationality,
        country_of_residence: cddFormData.country_of_residence,
        date_of_birth: cddFormData.date_of_birth,
        company_number: cddFormData.company_number,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setCDDRecords([...cddRecords, newCDD]);
      showToast('CDD record created successfully', 'success');
      setShowNewCDDModal(false);
      setCDDFormData({
        client_name: '',
        client_type: 'individual',
        nationality: '',
        country_of_residence: '',
        date_of_birth: '',
        company_number: '',
      });
      return;
    }

    try {
      await apiClient.post('/compliance/aml/cdd', {
        ...cddFormData,
      });

      showToast('CDD record created successfully', 'success');
      setShowNewCDDModal(false);
      setCDDFormData({
        client_name: '',
        client_type: 'individual',
        nationality: '',
        country_of_residence: '',
        date_of_birth: '',
        company_number: '',
      });
      await fetchData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create CDD record';
      showToast(errorMsg, 'error');
    }
  };

  const handleFetchCDDDetail = async (id: string) => {
    if (isDemoMode()) {
      const record = cddRecords.find((r) => r.id === id);
      if (record) {
        const detail: CDDDetail = {
          ...record,
          pep_screenings: [],
          sanctions_checks: [],
        };
        setSelectedCDD(detail);
      }
      return;
    }

    try {
      const response = await apiClient.get(`/compliance/aml/cdd/${id}`);
      setSelectedCDD(response.data || null);
    } catch (err) {
      showToast('Failed to load CDD detail', 'error');
    }
  };

  const handleRunPEPScreening = async (cddId: string) => {
    if (isDemoMode()) {
      setScreeningLoading(cddId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      showToast('PEP screening complete - no matches found', 'success');
      setScreeningLoading(null);
      if (selectedCDD && selectedCDD.id === cddId) {
        await handleFetchCDDDetail(cddId);
      }
      return;
    }

    setScreeningLoading(cddId);
    try {
      await apiClient.post(`/compliance/aml/pep-screening`, {
        cdd_id: cddId,
      });

      showToast('PEP screening started', 'success');
      // Refresh the detail
      if (selectedCDD && selectedCDD.id === cddId) {
        await handleFetchCDDDetail(cddId);
      }
    } catch (err) {
      showToast('Failed to run PEP screening', 'error');
    } finally {
      setScreeningLoading(null);
    }
  };

  const handleRunSanctionsCheck = async (cddId: string) => {
    if (isDemoMode()) {
      setSanctionsLoading(cddId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      showToast('Sanctions check clear', 'success');
      setSanctionsLoading(null);
      if (selectedCDD && selectedCDD.id === cddId) {
        await handleFetchCDDDetail(cddId);
      }
      return;
    }

    setSanctionsLoading(cddId);
    try {
      await apiClient.post(`/compliance/aml/sanctions-check`, {
        cdd_id: cddId,
      });

      showToast('Sanctions check started', 'success');
      // Refresh the detail
      if (selectedCDD && selectedCDD.id === cddId) {
        await handleFetchCDDDetail(cddId);
      }
    } catch (err) {
      showToast('Failed to run sanctions check', 'error');
    } finally {
      setSanctionsLoading(null);
    }
  };

  const handleVerifyCDD = async (cddId: string) => {
    if (isDemoMode()) {
      if (selectedCDD && selectedCDD.id === cddId) {
        setSelectedCDD({ ...selectedCDD, status: 'verified' });
      }
      setCDDRecords(
        cddRecords.map((r) =>
          r.id === cddId ? { ...r, status: 'verified' } : r
        )
      );
      showToast('CDD verified successfully', 'success');
      return;
    }

    try {
      await apiClient.post(`/compliance/aml/cdd/${cddId}/verify`);
      showToast('CDD verified successfully', 'success');
      if (selectedCDD && selectedCDD.id === cddId) {
        setSelectedCDD({ ...selectedCDD, status: 'verified' });
      }
      await fetchData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify CDD';
      showToast(errorMsg, 'error');
    }
  };

  // SAR Records handlers
  const handleCreateSAR = async () => {
    if (!sarFormData.client_name || !sarFormData.matter_ref || !sarFormData.grounds_for_suspicion) {
      showToast('Client name, matter reference, and grounds for suspicion are required', 'error');
      return;
    }

    if (isDemoMode()) {
      const newSAR: SARRecord = {
        id: `sar-${Date.now()}`,
        client_name: sarFormData.client_name,
        matter_ref: sarFormData.matter_ref,
        suspicion_type: sarFormData.suspicion_type,
        amount: sarFormData.amount_involved ? parseFloat(sarFormData.amount_involved) : 0,
        report_date: new Date().toISOString(),
        nca_filed: false,
        status: 'pending_mlro',
      };
      setSARRecords([...sarRecords, newSAR]);
      showToast('SAR submitted successfully', 'success');
      setShowNewSARModal(false);
      setSARFormData({
        client_name: '',
        matter_ref: '',
        suspicion_type: 'money_laundering',
        grounds_for_suspicion: '',
        transaction_details: '',
        amount_involved: '',
      });
      return;
    }

    try {
      await apiClient.post('/compliance/aml/sar', {
        client_name: sarFormData.client_name,
        matter_ref: sarFormData.matter_ref,
        suspicion_type: sarFormData.suspicion_type,
        grounds_for_suspicion: sarFormData.grounds_for_suspicion,
        transaction_details: sarFormData.transaction_details,
        amount_involved: sarFormData.amount_involved ? parseFloat(sarFormData.amount_involved) : 0,
      });

      showToast('SAR submitted successfully', 'success');
      setShowNewSARModal(false);
      setSARFormData({
        client_name: '',
        matter_ref: '',
        suspicion_type: 'money_laundering',
        grounds_for_suspicion: '',
        transaction_details: '',
        amount_involved: '',
      });
      await fetchData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create SAR';
      showToast(errorMsg, 'error');
    }
  };

  const handleMLRODecision = async (sarId: string) => {
    if (!mlroFormData.reasoning) {
      showToast('Reasoning is required', 'error');
      return;
    }

    if (isDemoMode()) {
      const newStatus = mlroFormData.decision === 'file_sar' ? 'filed' : 'closed';
      setSARRecords(
        sarRecords.map((sar) =>
          sar.id === sarId ? { ...sar, status: newStatus as any } : sar
        )
      );
      showToast('MLRO decision submitted', 'success');
      setMLROModal(null);
      setMLROFormData({
        decision: 'file_sar',
        reasoning: '',
        nca_reference: '',
      });
      return;
    }

    try {
      await apiClient.post(`/compliance/aml/sar/${sarId}/mlro-decision`, {
        decision: mlroFormData.decision,
        reasoning: mlroFormData.reasoning,
        nca_reference: mlroFormData.nca_reference,
      });

      showToast('MLRO decision submitted', 'success');
      setMLROModal(null);
      setMLROFormData({
        decision: 'file_sar',
        reasoning: '',
        nca_reference: '',
      });
      await fetchData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit MLRO decision';
      showToast(errorMsg, 'error');
    }
  };

  // Render status badge for CDD
  const getCDDStatusColor = (status: string): 'error' | 'warning' | 'success' | 'info' => {
    switch (status) {
      case 'incomplete':
        return 'error';
      case 'pending_review':
      case 'pending': // real API status
        return 'warning';
      case 'verified':
      case 'approved': // real API status
        return 'success';
      case 'expired':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getRiskLevelColor = (level: string): 'error' | 'warning' | 'success' | 'info' => {
    switch (level) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      case 'very_high':
        return 'error';
      default:
        return 'info';
    }
  };

  const getSARStatusColor = (status: string): 'error' | 'warning' | 'success' | 'info' => {
    switch (status) {
      case 'draft':
        return 'info';
      case 'pending_mlro':
        return 'warning';
      case 'filed':
        return 'success';
      case 'rejected':
        return 'error';
      case 'closed':
        return 'info';
      default:
        return 'info';
    }
  };

  // CDD Table columns
  const cddColumns = [
    { accessor: 'client_name', header: 'Client Name', sortable: true },
    { accessor: 'client_type', header: 'Client Type' },
    { accessor: 'cdd_level', header: 'CDD Level' },
    {
      accessor: 'risk_level',
      header: 'Risk Level',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.risk_level} variant={row.risk_level} />
      ),
    },
    {
      accessor: 'id_verified',
      header: 'ID Verified',
      render: (_value: any, row: any) => (
        row.id_verified ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertIcon className="h-5 w-5 text-red-600" />
      ),
    },
    {
      accessor: 'address_verified',
      header: 'Address Verified',
      render: (_value: any, row: any) => (
        row.address_verified ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertIcon className="h-5 w-5 text-red-600" />
      ),
    },
    {
      accessor: 'sof_verified',
      header: 'SOF Verified',
      render: (_value: any, row: any) => (
        row.sof_verified ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertIcon className="h-5 w-5 text-red-600" />
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.status} variant={getCDDStatusColor(row.status)} />
      ),
    },
  ];

  // SAR Table columns
  const sarColumns = [
    { accessor: 'client_name', header: 'Client Name', sortable: true },
    { accessor: 'matter_ref', header: 'Matter Ref' },
    { accessor: 'suspicion_type', header: 'Suspicion Type' },
    {
      accessor: 'amount',
      header: 'Amount',
      render: (_value: any, row: any) => (
        row.amount ? `£${row.amount.toLocaleString()}` : '-'
      ),
    },
    {
      accessor: 'report_date',
      header: 'Report Date',
      render: (_value: any, row: any) => formatDate(row.report_date),
    },
    { accessor: 'mlro_decision', header: 'MLRO Decision' },
    {
      accessor: 'nca_filed',
      header: 'NCA Filed',
      render: (_value: any, row: any) => (
        row.nca_filed ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertIcon className="h-5 w-5 text-red-600" />
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.status} variant={getSARStatusColor(row.status)} />
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AML/CDD Compliance"
          description="Manage Customer Due Diligence and Suspicious Activity Reports"
        />
        <Card>
          <div className="p-12 flex justify-center">
            <LoadingSpinner />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="AML/CDD Compliance"
        description="Manage Customer Due Diligence and Suspicious Activity Reports"
      />

      {/* DB-driven combobox suggestions (free text still allowed). */}
      <datalist id="aml-client-options">
        {clientNames.map((name) => (
          <option key={`client-${name}`} value={name} />
        ))}
      </datalist>
      <datalist id="aml-matter-options">
        {matterReferences.map((ref) => (
          <option key={`matter-${ref}`} value={ref} />
        ))}
      </datalist>

      {error && (
        <Card className="bg-red-50 border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Data</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard title="CDD Total" value={stats.cdd_total ?? 0} color="blue" icon={<User className="h-5 w-5" />} />
          <StatCard
            title="CDD Incomplete"
            value={stats.cdd_incomplete ?? 0}
            color="amber"
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard title="CDD Verified" value={stats.cdd_verified ?? 0} color="green" icon={<CheckCircle className="h-5 w-5" />} />
          <StatCard
            title="Completion Rate"
            value={`${Math.round(stats.completion_rate ?? 0)}%`}
            color="blue"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <StatCard title="PEP Flagged" value={stats.pep_flagged ?? 0} color="red" icon={<AlertTriangle className="h-5 w-5" />} />
          <StatCard title="SARs Pending" value={stats.sars_pending ?? 0} color="amber" icon={<Clock className="h-5 w-5" />} />
        </div>
      )}

      {/* Tabs */}
      <Card className="rounded-xl">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('cdd')}
              className={`flex-1 py-4 px-6 text-center font-medium uppercase tracking-wide text-sm border-b-2 transition-colors ${
                activeTab === 'cdd'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              CDD Records
            </button>
            <button
              onClick={() => setActiveTab('sar')}
              className={`flex-1 py-4 px-6 text-center font-medium uppercase tracking-wide text-sm border-b-2 transition-colors ${
                activeTab === 'sar'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              SAR Register
            </button>
            {/* CDD Risk Review (pre-engagement intake) lives at its own
                route. We surface it here so the COLP discovers it from the
                AML hub rather than a separate sidebar entry. */}
            <button
              onClick={() => router.push('/intake')}
              className="flex-1 py-4 px-6 text-center font-medium uppercase tracking-wide text-sm border-b-2 border-transparent text-gray-600 hover:text-gray-900 transition-colors"
            >
              New Client Intake →
            </button>
          </div>
        </div>

        {/* CDD Records Tab */}
        {activeTab === 'cdd' && (
          <div className="p-6 space-y-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold uppercase tracking-wide text-gray-900">Customer Due Diligence Records</h3>
              <Button onClick={() => setShowNewCDDModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New CDD Record
              </Button>
            </div>

            {cddRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No CDD records found. Create your first record to get started.
              </div>
            ) : (
              <DataTable
                columns={cddColumns}
                data={cddRecords}
                onRowClick={(row) => handleFetchCDDDetail(row.id)}
              />
            )}
          </div>
        )}

        {/* SAR Register Tab */}
        {activeTab === 'sar' && (
          <div className="p-6 space-y-4">
            {/* Tipping Off Warning */}
            <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-4 rounded-r-lg">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-900 uppercase tracking-wide text-sm">Confidential — POCA s.333A</h4>
                  <p className="text-sm text-red-800 mt-1">
                    Tipping off is a criminal offence. Do not discuss SARs with the subject.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center border-b border-gray-200 pb-4">
              <h3 className="text-lg font-semibold uppercase tracking-wide text-gray-900">Suspicious Activity Reports</h3>
              <Button onClick={() => setShowNewSARModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Submit Internal SAR
              </Button>
            </div>

            {sarRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No SARs found. Submit your first SAR using the button above.
              </div>
            ) : (
              <div className="space-y-2">
                {sarRecords.map((sar) => (
                  <div key={sar.id} className="group flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{sar.client_name}</div>
                      <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-2">
                        <span className="uppercase tracking-wide text-xs font-medium">{sar.matter_ref}</span>
                        <span className="text-gray-400">•</span>
                        <span>{sar.suspicion_type}</span>
                        <span className="text-gray-400">•</span>
                        <span className="tabular-nums font-medium">{sar.amount ? `£${sar.amount.toLocaleString()}` : '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <StatusBadge status={sar.status} variant={getSARStatusColor(sar.status)} />
                      {sar.status === 'pending_mlro' && (
                        <Button
                          onClick={() => setMLROModal({ id: sar.id })}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm whitespace-nowrap"
                        >
                          MLRO Decision
                        </Button>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* New CDD Modal */}
      <Modal
        isOpen={showNewCDDModal}
        onClose={() => {
          setShowNewCDDModal(false);
          setCDDFormData({
            client_name: '',
            client_type: 'individual',
            nationality: '',
            country_of_residence: '',
            date_of_birth: '',
            company_number: '',
          });
        }}
        title="New CDD Record"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name
            </label>
            <input
              type="text"
              list="aml-client-options"
              value={cddFormData.client_name}
              onChange={(e) =>
                setCDDFormData({ ...cddFormData, client_name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Full legal name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Type
            </label>
            <select
              value={cddFormData.client_type}
              onChange={(e) =>
                setCDDFormData({ ...cddFormData, client_type: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="trust">Trust</option>
              <option value="partnership">Partnership</option>
              <option value="charity">Charity</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nationality
            </label>
            <input
              type="text"
              value={cddFormData.nationality}
              onChange={(e) =>
                setCDDFormData({ ...cddFormData, nationality: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., British"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country of Residence
            </label>
            <input
              type="text"
              value={cddFormData.country_of_residence}
              onChange={(e) =>
                setCDDFormData({
                  ...cddFormData,
                  country_of_residence: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., United Kingdom"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={cddFormData.date_of_birth}
              onChange={(e) =>
                setCDDFormData({ ...cddFormData, date_of_birth: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Number
            </label>
            <input
              type="text"
              value={cddFormData.company_number}
              onChange={(e) =>
                setCDDFormData({ ...cddFormData, company_number: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional: Companies House number"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleCreateCDD} className="flex-1">
              Create Record
            </Button>
            <Button
              onClick={() => {
                setShowNewCDDModal(false);
                setCDDFormData({
                  client_name: '',
                  client_type: 'individual',
                  nationality: '',
                  country_of_residence: '',
                  date_of_birth: '',
                  company_number: '',
                });
              }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* CDD Detail Modal */}
      {selectedCDD && (
        <Modal
          isOpen={!!selectedCDD}
          onClose={() => setSelectedCDD(null)}
          title={`${selectedCDD.client_name} - CDD Record`}
        >
          <div className="space-y-6">
            {/* CDD Details */}
            <div className="border-b border-gray-200 pb-6">
              <h4 className="font-semibold text-gray-900 mb-3 uppercase tracking-wide text-sm">CDD Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Client Type</p>
                  <p className="font-medium text-gray-900">{selectedCDD.client_type}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">CDD Level</p>
                  <p className="font-medium text-gray-900">{selectedCDD.cdd_level}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Risk Level</p>
                  <StatusBadge
                    status={selectedCDD.risk_level}
                    variant={getRiskLevelColor(selectedCDD.risk_level)}
                  />
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Status</p>
                  <StatusBadge
                    status={selectedCDD.status}
                    variant={getCDDStatusColor(selectedCDD.status)}
                  />
                </div>
                {selectedCDD.nationality && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Nationality</p>
                    <p className="font-medium text-gray-900">{selectedCDD.nationality}</p>
                  </div>
                )}
                {selectedCDD.country_of_residence && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Country of Residence</p>
                    <p className="font-medium text-gray-900">{selectedCDD.country_of_residence}</p>
                  </div>
                )}
                {selectedCDD.date_of_birth && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Date of Birth</p>
                    <p className="font-medium text-gray-900 tabular-nums">{formatDate(selectedCDD.date_of_birth)}</p>
                  </div>
                )}
                {selectedCDD.company_number && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-xs font-medium">Company Number</p>
                    <p className="font-medium text-gray-900 font-mono">{selectedCDD.company_number}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Status */}
            <div className="border-b border-gray-200 pb-6">
              <h4 className="font-semibold text-gray-900 mb-3 uppercase tracking-wide text-sm">Verification Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">ID Verified</span>
                  {selectedCDD.id_verified ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertIcon className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Address Verified</span>
                  {selectedCDD.address_verified ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertIcon className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Source of Funds Verified</span>
                  {selectedCDD.sof_verified ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertIcon className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </div>
            </div>

            {/* PEP Screenings */}
            {selectedCDD.pep_screenings && selectedCDD.pep_screenings.length > 0 && (
              <div className="border-b border-gray-200 pb-6">
                <h4 className="font-semibold text-gray-900 mb-3 uppercase tracking-wide text-sm">PEP Screenings</h4>
                <div className="space-y-2">
                  {selectedCDD.pep_screenings.map((screening) => (
                    <div key={screening.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <p className="text-gray-600 tabular-nums">{formatDate(screening.screening_date)}</p>
                          <p className="font-medium text-gray-900">{screening.result}</p>
                        </div>
                        <StatusBadge
                          status={screening.status}
                          variant={
                            screening.status === 'clear'
                              ? 'success'
                              : screening.status === 'flagged'
                                ? 'error'
                                : 'warning'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sanctions Checks */}
            {selectedCDD.sanctions_checks && selectedCDD.sanctions_checks.length > 0 && (
              <div className="border-b border-gray-200 pb-6">
                <h4 className="font-semibold text-gray-900 mb-3 uppercase tracking-wide text-sm">Sanctions Checks</h4>
                <div className="space-y-2">
                  {selectedCDD.sanctions_checks.map((check) => (
                    <div key={check.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <p className="text-gray-600 tabular-nums">{formatDate(check.check_date)}</p>
                          <p className="font-medium text-gray-900">{check.result}</p>
                        </div>
                        <StatusBadge
                          status={check.status}
                          variant={
                            check.status === 'clear'
                              ? 'success'
                              : check.status === 'flagged'
                                ? 'error'
                                : 'warning'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={() => handleRunPEPScreening(selectedCDD.id)}
                disabled={screeningLoading === selectedCDD.id}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
              >
                {screeningLoading === selectedCDD.id ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Running...
                  </>
                ) : (
                  'Run PEP Screening'
                )}
              </Button>

              <Button
                onClick={() => handleRunSanctionsCheck(selectedCDD.id)}
                disabled={sanctionsLoading === selectedCDD.id}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
              >
                {sanctionsLoading === selectedCDD.id ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Running...
                  </>
                ) : (
                  'Run Sanctions Check'
                )}
              </Button>

              {selectedCDD.status !== 'verified' && (
                <Button
                  onClick={() => handleVerifyCDD(selectedCDD.id)}
                  variant="success"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
                >
                  Verify CDD
                </Button>
              )}

              <Button
                onClick={() => setSelectedCDD(null)}
                variant="outline"
                className="px-4 py-2 text-sm"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New SAR Modal */}
      <Modal
        isOpen={showNewSARModal}
        onClose={() => {
          setShowNewSARModal(false);
          setSARFormData({
            client_name: '',
            matter_ref: '',
            suspicion_type: 'money_laundering',
            grounds_for_suspicion: '',
            transaction_details: '',
            amount_involved: '',
          });
        }}
        title="Submit Internal SAR"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name
            </label>
            <input
              type="text"
              list="aml-client-options"
              value={sarFormData.client_name}
              onChange={(e) =>
                setSARFormData({ ...sarFormData, client_name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Client name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Matter Reference
            </label>
            <input
              type="text"
              list="aml-matter-options"
              value={sarFormData.matter_ref}
              onChange={(e) =>
                setSARFormData({ ...sarFormData, matter_ref: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., MATTER-2024-001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Suspicion Type
            </label>
            <select
              value={sarFormData.suspicion_type}
              onChange={(e) =>
                setSARFormData({ ...sarFormData, suspicion_type: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="money_laundering">Money Laundering</option>
              <option value="terrorist_financing">Terrorist Financing</option>
              <option value="tax_evasion">Tax Evasion</option>
              <option value="fraud">Fraud</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grounds for Suspicion
            </label>
            <textarea
              value={sarFormData.grounds_for_suspicion}
              onChange={(e) =>
                setSARFormData({
                  ...sarFormData,
                  grounds_for_suspicion: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detailed explanation of suspicions..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Details
            </label>
            <textarea
              value={sarFormData.transaction_details}
              onChange={(e) =>
                setSARFormData({
                  ...sarFormData,
                  transaction_details: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Details of transactions involved..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount Involved
            </label>
            <input
              type="number"
              value={sarFormData.amount_involved}
              onChange={(e) =>
                setSARFormData({ ...sarFormData, amount_involved: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="£"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleCreateSAR} className="flex-1">
              Submit SAR
            </Button>
            <Button
              onClick={() => {
                setShowNewSARModal(false);
                setSARFormData({
                  client_name: '',
                  matter_ref: '',
                  suspicion_type: 'money_laundering',
                  grounds_for_suspicion: '',
                  transaction_details: '',
                  amount_involved: '',
                });
              }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* MLRO Decision Modal */}
      {mlroModal && (
        <Modal
          isOpen={!!mlroModal}
          onClose={() => {
            setMLROModal(null);
            setMLROFormData({
              decision: 'file_sar',
              reasoning: '',
              nca_reference: '',
            });
          }}
          title="MLRO Decision"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Decision
              </label>
              <select
                value={mlroFormData.decision}
                onChange={(e) =>
                  setMLROFormData({ ...mlroFormData, decision: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="file_sar">File SAR</option>
                <option value="no_action">No Action Required</option>
                <option value="request_more_info">Request More Information</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reasoning
              </label>
              <textarea
                value={mlroFormData.reasoning}
                onChange={(e) =>
                  setMLROFormData({ ...mlroFormData, reasoning: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Detailed reasoning for decision..."
                rows={4}
              />
            </div>

            {mlroFormData.decision === 'file_sar' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NCA Reference
                </label>
                <input
                  type="text"
                  value={mlroFormData.nca_reference}
                  onChange={(e) =>
                    setMLROFormData({
                      ...mlroFormData,
                      nca_reference: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="NCA reference number (if filed)"
                />
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={() => handleMLRODecision(mlroModal.id)}
                className="flex-1"
              >
                Submit Decision
              </Button>
              <Button
                onClick={() => {
                  setMLROModal(null);
                  setMLROFormData({
                    decision: 'file_sar',
                    reasoning: '',
                    nca_reference: '',
                  });
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
