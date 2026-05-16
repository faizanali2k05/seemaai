'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  Card,
  Button,
  StatCard,
  LoadingSpinner,
  EmptyState,
  StatusBadge,
  showToast,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  AlertCircle,
  Zap,
} from 'lucide-react';

interface RiskScore {
  overall_score: number;
  sra_score: number;
  aml_score: number;
  cpr_score: number;
  gdpr_score: number;
  limitation_score: number;
}

interface ComplianceCheck {
  id: string;
  check_name: string;
  check_type: string;
  status: 'pending' | 'passed' | 'failed' | 'warning';
  severity: string;
  description: string;
  regulation_ref: string;
  remediation: string;
  checked_at: string;
  due_date: string;
}

interface ComplianceAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  regulation_ref: string;
  action_required: string;
  status: string;
  created_at: string;
}

interface Deadline {
  id: string;
  title: string;
  description: string;
  due_date: string;
  priority: string;
  status: string;
}

interface CaseData {
  case: {
    case_id: string;
    case_name: string;
  };
  risk_score: RiskScore;
  compliance_checks: ComplianceCheck[];
  compliance_alerts: ComplianceAlert[];
  deadlines: Deadline[];
  summary: {
    total_checks: number;
    failed_checks: number;
    warning_checks: number;
    active_alerts: number;
    pending_deadlines: number;
  };
}

function getRiskColor(score: number): string {
  if (score >= 0 && score <= 39) return 'bg-green-100 text-green-900';
  if (score >= 40 && score <= 59) return 'bg-yellow-100 text-yellow-900';
  if (score >= 60 && score <= 79) return 'bg-orange-100 text-orange-900';
  return 'bg-red-100 text-red-900';
}

function getRiskBadgeColor(score: number): string {
  if (score >= 0 && score <= 39) return 'bg-green-50 text-green-700 border border-green-200';
  if (score >= 40 && score <= 59) return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
  if (score >= 60 && score <= 79) return 'bg-orange-50 text-orange-700 border border-orange-200';
  return 'bg-red-50 text-red-700 border border-red-200';
}

function getRiskLabel(score: number): string {
  if (score >= 0 && score <= 39) return 'Low Risk';
  if (score >= 40 && score <= 59) return 'Moderate Risk';
  if (score >= 60 && score <= 79) return 'High Risk';
  return 'Critical Risk';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'passed':
    case 'resolved':
      return 'bg-green-100 text-green-900';
    case 'pending':
      return 'bg-gray-100 text-gray-900';
    case 'failed':
      return 'bg-red-100 text-red-900';
    case 'warning':
      return 'bg-yellow-100 text-yellow-900';
    case 'open':
    case 'acknowledged':
      return 'bg-blue-100 text-blue-900';
    default:
      return 'bg-gray-100 text-gray-900';
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600 bg-red-50';
    case 'high':
      return 'text-orange-600 bg-orange-50';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50';
    case 'low':
      return 'text-green-600 bg-green-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export default function CaseCompliancePage() {
  useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseId = searchParams.get('id');
  const fromPage = searchParams.get('from') || '/dashboard';

  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingRemediationId, setCreatingRemediationId] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) {
      setError('No case ID provided');
      setIsLoading(false);
      return;
    }
    fetchCaseData();
  }, [caseId]);

  const fetchCaseData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get(`/compliance/case/${caseId}`);
      setCaseData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case data');
      showToast('Failed to load case compliance data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRemediationPlan = async (checkId: string, checkName: string) => {
    try {
      setCreatingRemediationId(checkId);
      const response = await apiClient.post('/compliance/remediation-plans', {
        title: `Remediation for ${checkName}`,
        description: `Address failed compliance check: ${checkName}`,
        source_type: 'compliance_check',
        source_id: checkId,
        priority: 'high',
        status: 'pending',
      });

      if (response) {
        showToast('Remediation plan created', 'success');
        // Optionally refresh data or navigate
      }
    } catch (err) {
      showToast('Failed to create remediation plan', 'error');
    } finally {
      setCreatingRemediationId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="p-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(fromPage)}
          className="mb-6 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <EmptyState
          icon={<AlertCircle className="w-10 h-10" />}
          title="Error Loading Case"
          description={error || 'Case data not found'}
        />
      </div>
    );
  }

  const { risk_score, compliance_checks, compliance_alerts, deadlines, summary } = caseData;

  return (
    <div className="space-y-6 p-8">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(fromPage)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      <PageHeader
        title={caseData.case.case_name || `Case ${caseData.case.case_id}`}
        description="Compliance overview, risk assessment, and remediation actions"
      />

      {/* Overall Risk Score */}
      <Card className="p-8 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2 uppercase tracking-wide">Overall Risk Score</h3>
            <p className="text-gray-600">Current compliance risk level</p>
          </div>
          <div
            className={`flex flex-col items-center justify-center w-32 h-32 rounded-xl ${getRiskColor(
              risk_score.overall_score,
            )}`}
          >
            <div className="text-5xl font-bold tabular-nums">{risk_score.overall_score}</div>
            <div className="text-sm font-medium mt-1">
              {getRiskLabel(risk_score.overall_score)}
            </div>
          </div>
        </div>
      </Card>

      {/* Domain Risk Scores */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="SRA"
          value={risk_score.sra_score.toString()}
          icon={<FileText className="h-5 w-5" />}
          color={risk_score.sra_score >= 0 && risk_score.sra_score <= 39 ? 'green' : risk_score.sra_score >= 40 && risk_score.sra_score <= 59 ? 'amber' : risk_score.sra_score >= 60 && risk_score.sra_score <= 79 ? 'orange' : 'red'}
        />
        <StatCard
          title="AML"
          value={risk_score.aml_score.toString()}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={risk_score.aml_score >= 0 && risk_score.aml_score <= 39 ? 'green' : risk_score.aml_score >= 40 && risk_score.aml_score <= 59 ? 'amber' : risk_score.aml_score >= 60 && risk_score.aml_score <= 79 ? 'orange' : 'red'}
        />
        <StatCard
          title="CPR"
          value={risk_score.cpr_score.toString()}
          icon={<CheckCircle className="h-5 w-5" />}
          color={risk_score.cpr_score >= 0 && risk_score.cpr_score <= 39 ? 'green' : risk_score.cpr_score >= 40 && risk_score.cpr_score <= 59 ? 'amber' : risk_score.cpr_score >= 60 && risk_score.cpr_score <= 79 ? 'orange' : 'red'}
        />
        <StatCard
          title="GDPR"
          value={risk_score.gdpr_score.toString()}
          icon={<Zap className="h-5 w-5" />}
          color={risk_score.gdpr_score >= 0 && risk_score.gdpr_score <= 39 ? 'green' : risk_score.gdpr_score >= 40 && risk_score.gdpr_score <= 59 ? 'amber' : risk_score.gdpr_score >= 60 && risk_score.gdpr_score <= 79 ? 'orange' : 'red'}
        />
        <StatCard
          title="Limitation"
          value={risk_score.limitation_score.toString()}
          icon={<Clock className="h-5 w-5" />}
          color={risk_score.limitation_score >= 0 && risk_score.limitation_score <= 39 ? 'green' : risk_score.limitation_score >= 40 && risk_score.limitation_score <= 59 ? 'amber' : risk_score.limitation_score >= 60 && risk_score.limitation_score <= 79 ? 'orange' : 'red'}
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Compliance Checks"
          value={summary.total_checks.toString()}
          subtitle={
            summary.failed_checks > 0 || summary.warning_checks > 0
              ? `${summary.failed_checks} failed, ${summary.warning_checks} warning`
              : 'All checks passing'
          }
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Active Alerts"
          value={summary.active_alerts.toString()}
          subtitle={summary.active_alerts > 0 ? 'Require attention' : 'No active alerts'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Deadlines"
          value={summary.pending_deadlines.toString()}
          subtitle={summary.pending_deadlines > 0 ? 'Upcoming deadlines' : 'No pending deadlines'}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Compliance Checks Table */}
      {compliance_checks.length > 0 && (
        <Card className="overflow-hidden rounded-xl">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-lg uppercase tracking-wide">Compliance Checks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Check Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Regulation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Result
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Last Checked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {compliance_checks.map((check) => (
                  <tr key={check.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {check.check_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{check.check_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{check.regulation_ref}</td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(check.status)}`}>
                        {(check.status || '').charAt(0).toUpperCase() + (check.status || '').slice(1)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {check.checked_at ? formatDate(check.checked_at) : 'Not checked'}
                    </td>
                    <td className="px-6 py-4">
                      {check.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateRemediationPlan(check.id, check.check_name)}
                          disabled={creatingRemediationId === check.id}
                          className="text-xs"
                        >
                          {creatingRemediationId === check.id ? 'Creating...' : 'Fix This'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Case Alerts Section */}
      {compliance_alerts.length > 0 && (
        <Card className="p-6 rounded-xl">
          <h3 className="font-semibold text-lg mb-4 uppercase tracking-wide">Case Alerts</h3>
          <div className="space-y-4">
            {compliance_alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg"
              >
                <AlertTriangle
                  className={`w-5 h-5 mt-1 flex-shrink-0 ${getSeverityColor(alert.severity).split(' ')[0]}`}
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">{alert.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                      {alert.regulation_ref && (
                        <p className="text-xs text-gray-500 mt-2">Ref: {alert.regulation_ref}</p>
                      )}
                      {alert.action_required && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-900">
                          <strong>Action Required:</strong> {alert.action_required}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <StatusBadge
                        status={alert.severity as any}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deadlines Section */}
      {deadlines.length > 0 && (
        <Card className="overflow-hidden rounded-xl">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-lg uppercase tracking-wide">Compliance Deadlines</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Deadline
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((deadline) => (
                  <tr key={deadline.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {deadline.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{deadline.description}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(deadline.due_date)}
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`inline-flex px-3 py-1 rounded text-xs font-medium ${
                          deadline.priority === 'critical'
                            ? 'bg-red-100 text-red-900'
                            : deadline.priority === 'high'
                              ? 'bg-orange-100 text-orange-900'
                              : deadline.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-900'
                                : 'bg-green-100 text-green-900'
                        }`}
                      >
                        {(deadline.priority || '').charAt(0).toUpperCase() + (deadline.priority || '').slice(1)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(deadline.status)}`}
                      >
                        {(deadline.status || '').charAt(0).toUpperCase() + (deadline.status || '').slice(1)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Empty States */}
      {compliance_checks.length === 0 && compliance_alerts.length === 0 && deadlines.length === 0 && (
        <EmptyState
          icon={<CheckCircle className="w-10 h-10" />}
          title="Case Compliance Status"
          description="No compliance checks, alerts, or deadlines for this case"
        />
      )}
    </div>
  );
}
