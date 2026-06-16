'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  ComplianceFlowNav,
  Card,
  Button,
  StatusBadge,
  EmptyState,
  showToast,
  DashboardSkeleton,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  Play,
  Download,
  CheckCircle,
  AlertCircle,
  XCircle,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

interface ComplianceCheck {
  id: string;
  check_type: string;
  title: string;
  check_name?: string;
  status: 'pass' | 'warning' | 'fail';
  result?: string;
  details?: string[];
  description?: string;
  checked_at?: string;
  check_date?: string;
}

interface RiskScore {
  score: number;
  timestamp: string;
}

interface ScanCategory {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  count: number;
  findings: string[];
}

interface ScanResult {
  id: string;
  date: string;
  categories: ScanCategory[];
  score: number;
  totalIssues: number;
}

export default function ComplianceScanPage() {
  useRequireAuth();
  const router = useRouter();

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingRemediationId, setCreatingRemediationId] = useState<string | null>(null);

  // Fetch compliance checks on page load
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch compliance checks and risk score
      const [checksRes, riskScoreRes] = await Promise.all([
        apiClient.get('/compliance/checks'),
        apiClient.get('/compliance/risk-scores'),
      ]);
      const checks = Array.isArray(checksRes.data) ? checksRes.data : [];
      const riskScore = riskScoreRes.data;

      // Transform checks into scan history (handles the AI comprehensive-scan row)
      const scanResult = buildScanResult(checks, riskScore, '1');
      if (scanResult) {
        setScanHistory([scanResult]);
      }
    } catch (err) {
      console.error('Error fetching compliance data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const groupChecksByType = (checks: ComplianceCheck[]): ScanCategory[] => {
    const grouped: Record<string, ComplianceCheck[]> = {};

    checks.forEach((check) => {
      if (!grouped[check.check_type]) {
        grouped[check.check_type] = [];
      }
      grouped[check.check_type].push(check);
    });

    return Object.entries(grouped).map(([type, typeChecks]) => {
      const failedChecks = typeChecks.filter((c) => c.status === 'fail' || c.status === 'warning');
      const status: 'pass' | 'warning' | 'fail' = typeChecks.some((c) => c.status === 'fail')
        ? 'fail'
        : typeChecks.some((c) => c.status === 'warning')
          ? 'warning'
          : 'pass';

      return {
        name: type,
        status,
        count: failedChecks.length,
        findings: failedChecks
          .flatMap((c) => c.details || [c.result])
          .filter((v): v is string => Boolean(v)),
      };
    });
  };

  // Build a ScanResult from the real API. The AI comprehensive scan is stored as a single
  // /compliance/checks row { category: "ai_comprehensive_scan", details: "<json string>" }
  // where the JSON has { overall_risk_score, overall_rating, categories:[{category, score,
  // status, findings, recommendations}] }. We parse that into the page's category shape and
  // use overall_risk_score as the score. Falls back to the legacy grouped-checks shape.
  const buildScanResult = (checks: any[], riskScore: any, id: string): ScanResult | null => {
    const aiRow = checks.find(
      (c) => c?.category === 'ai_comprehensive_scan' || c?.check_type === 'ai_comprehensive_scan',
    );

    if (aiRow) {
      let parsed: any = aiRow.details;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      parsed = parsed || {};
      const rawCats: any[] = Array.isArray(parsed.categories) ? parsed.categories : [];
      const categories: ScanCategory[] = rawCats.map((cat) => {
        const findings: string[] = [
          ...(Array.isArray(cat.findings) ? cat.findings : []),
          ...(Array.isArray(cat.recommendations) ? cat.recommendations : []),
        ].filter((v): v is string => Boolean(v));
        const status: 'pass' | 'warning' | 'fail' =
          cat.status === 'fail' || cat.status === 'warning' || cat.status === 'pass'
            ? cat.status
            : (Array.isArray(cat.findings) && cat.findings.length > 0 ? 'warning' : 'pass');
        return {
          name: cat.category || cat.name || 'General',
          status,
          // Issue count = number of findings (recommendations are advisory, not counted).
          count: Array.isArray(cat.findings) ? cat.findings.length : 0,
          findings,
        };
      });
      const score = Math.round(parsed.overall_risk_score ?? aiRow.score ?? riskScore?.score ?? 0);
      const totalIssues = categories.reduce((sum, cat) => sum + cat.count, 0);
      return { id, date: aiRow.created_at || new Date().toISOString(), categories, score, totalIssues };
    }

    if (!checks.length) return null;
    const categories = groupChecksByType(checks);
    const score = Math.round(riskScore?.score ?? riskScore?.pass_rate ?? 0);
    const totalIssues = categories.reduce((sum, cat) => sum + cat.count, 0);
    return { id, date: new Date().toISOString(), categories, score, totalIssues };
  };

  const DEFAULT_SCAN_STEPS = [
    'AML Compliance',
    'Data Protection',
    'Client Account Rules',
    'Professional Standards',
    'Training & CPD',
    'Insurance & Reporting',
  ];

  const steps = scanHistory.length > 0
    ? scanHistory[0].categories.map(c => c.name)
    : DEFAULT_SCAN_STEPS;

  const handleRunScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setError(null);

    try {
      // Simulate progress while fetching
      const progressInterval = setInterval(() => {
        setScanProgress((prev) => Math.min(prev + Math.random() * 15, 90));
      }, 500);

      // Update current step through check types
      if (steps.length > 0) {
        setCurrentStep(steps[0]);
      }

      // Run the AI compliance scan — it returns the full result directly:
      // { overall_risk_score, overall_rating, categories:[{category, score, status,
      //   findings, recommendations}] }. Fall back to the legacy re-evaluate + refetch.
      let newResult: ScanResult | null = null;
      try {
        const scanRes = await apiClient.post('/ai/scan-compliance', {}, { timeout: 120000 });
        const data = scanRes.data as any;
        if (data && Array.isArray(data.categories)) {
          // Reuse buildScanResult by wrapping the live response as an ai_comprehensive_scan row.
          newResult = buildScanResult(
            [{ category: 'ai_comprehensive_scan', details: data }],
            null,
            String(scanHistory.length + 1),
          );
        }
      } catch {
        // Fall through to the legacy path below.
      }

      if (!newResult) {
        await apiClient.post('/compliance/checks/run');
        const [checksRes, riskScoreRes] = await Promise.all([
          apiClient.get('/compliance/checks'),
          apiClient.get('/compliance/risk-scores'),
        ]);
        const checks = Array.isArray(checksRes.data) ? checksRes.data : [];
        newResult = buildScanResult(checks, riskScoreRes.data, String(scanHistory.length + 1));
      }

      clearInterval(progressInterval);
      setScanProgress(95);

      if (newResult) {
        setResults(newResult);
        setScanHistory([newResult, ...scanHistory]);
      }

      setScanProgress(100);
      showToast('Compliance scan completed successfully', 'success');
      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
        setCurrentStep('');
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run scan';
      showToast(errorMessage, 'error');
      setError(errorMessage);
      console.error('Error running scan:', err);
      setIsScanning(false);
      setScanProgress(0);
      setCurrentStep('');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleFixThisCheck = async (check: ComplianceCheck) => {
    setCreatingRemediationId(check.id);
    try {
      const response = await apiClient.post('/compliance/remediation-plans', {
        title: `Remediation: ${check.title || check.check_name}`,
        description: `Auto-created from compliance scan — ${check.check_type}: ${check.title || check.check_name}`,
        source_type: 'compliance_check',
        source_id: check.id,
        priority: check.status === 'fail' ? 'high' : 'medium',
        status: 'open',
      });

      if (response) {
        showToast('Remediation plan created successfully', 'success');
        setTimeout(() => {
          router.push('/remediation');
        }, 500);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create remediation plan';
      showToast(errorMsg, 'error');
    } finally {
      setCreatingRemediationId(null);
    }
  };

  const handleGeneratePDF = () => {
    if (!results) return;

    try {
      const printContent = `
        <html>
          <head>
            <title>Compliance Scan Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
              h1 { color: #2563eb; margin-bottom: 10px; }
              .score { font-size: 48px; font-weight: bold; color: #2563eb; margin: 20px 0; }
              .date { color: #666; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background: #f5f6fa; font-weight: bold; }
              tr:nth-child(even) { background: #fafbfc; }
              .pass { color: #10b981; }
              .warning { color: #f59e0b; }
              .fail { color: #ef4444; }
              .findings { margin-top: 20px; }
              .finding { margin: 10px 0; padding: 10px; background: #f9fafb; border-left: 3px solid #2563eb; }
              .page-break { page-break-after: always; }
            </style>
          </head>
          <body>
            <h1>Seema Compliance Scan Report</h1>
            <p class="date">Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
            <p class="score">${results.score}%</p>
            <p><strong>Total Issues Found:</strong> ${results.totalIssues}</p>

            <h2>Scan Summary by Category</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                ${results.categories.map(c => `
                  <tr>
                    <td>${c.name}</td>
                    <td class="${c.status}">${(c.status || '').charAt(0).toUpperCase() + (c.status || '').slice(1)}</td>
                    <td>${c.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="page-break"></div>

            <h2>Detailed Findings</h2>
            ${results.categories.map(c => (c.findings?.length ?? 0) > 0 ? `
              <div class="findings">
                <h3>${c.name}</h3>
                ${c.findings.map((f, idx) => `
                  <div class="finding">
                    <strong>${idx + 1}.</strong> ${f}
                  </div>
                `).join('')}
              </div>
            ` : '').join('')}

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
              <p>This report was automatically generated by Seema Compliance Platform.</p>
              <p>For more information, please contact your compliance officer.</p>
            </div>
          </body>
        </html>
      `;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(printContent);
        win.document.close();
        win.focus();
        // Give the window time to render before printing
        setTimeout(() => {
          win.print();
        }, 250);
      } else {
        showToast('Failed to open print preview', 'error');
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
      showToast('Failed to generate PDF report', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compliance Scan Tool"
        description="Run automated compliance checks across your firm"
      />
      <ComplianceFlowNav />

      {/* Error State — only shown for scan failures, not initial load */}
      {error && !isLoading && (
        <Card className="bg-red-50 border border-red-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Scan Failed</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setError(null); handleRunScan(); }}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && <DashboardSkeleton />}

      {/* Main Scan Button */}
      {!isLoading && !isScanning && !results && (
        <Card className="text-center py-12 rounded-xl border border-gray-200 shadow-sm">
          <div className="mb-6">
            <TrendingUp className="h-16 w-16 text-blue-600 mx-auto mb-4 opacity-80" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Ready to scan?
            </h3>
            <p className="text-gray-600 mb-8">
              This will check all compliance areas across your firm
            </p>
            <Button onClick={handleRunScan} disabled={isScanning}>
              <Play className="mr-2 h-5 w-5" />
              Run Full Compliance Scan
            </Button>
          </div>
        </Card>
      )}

      {/* Scanning Progress */}
      {isScanning && (
        <Card className="space-y-6 rounded-xl border border-blue-200 bg-blue-50 shadow-sm">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Scanning in progress</h3>
            <p className="text-sm text-gray-600">Current step: <span className="font-medium">{currentStep}</span></p>
          </div>

          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-sm">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out rounded-full"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 text-right font-semibold tabular-nums">{Math.round(scanProgress)}%</p>
          </div>

          <div className="space-y-3 border-t border-blue-200 pt-4">
            {steps.map((step) => {
              const stepIndex = steps.indexOf(step);
              const completed = scanProgress >= ((stepIndex + 1) / steps.length) * 100;

              return (
                <div key={step} className="flex items-center gap-3 group">
                  {completed ? (
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <span className={completed ? 'text-gray-900 font-medium' : 'text-gray-600'}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Scan Results */}
      {results && !isScanning && (
        <>
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Compliance Score
                </h3>
                <p className="text-sm text-gray-600">
                  Scan completed {formatDate(results.date)}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-5xl font-bold tabular-nums ${getScoreColor(results.score)} mb-1`}>
                  {results.score}%
                </p>
                <p className="text-sm text-gray-600 tabular-nums">{results.totalIssues} issues found</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-blue-200">
              <Button variant="outline" onClick={() => setResults(null)}>
                Run Another Scan
              </Button>
              <Button variant="outline" onClick={handleGeneratePDF}>
                <Download className="mr-2 h-4 w-4" />
                Generate PDF Report
              </Button>
            </div>
          </Card>

          {/* Detailed Results */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Scan Details</h3>
            <div className="space-y-3">
              {results.categories.map((category) => {
                // Find the original check data if available from scanHistory
                const originalChecks = scanHistory[0]?.categories.find(c => c.name === category.name);

                return (
                  <Card key={category.name} className="p-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors shadow-sm group">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(category.status)}
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {category.name}
                          </h4>
                          {(category.findings?.length ?? 0) > 0 && (
                            <p className="text-sm text-gray-600 mt-1 tabular-nums">
                              {category.count} issue{category.count !== 1 ? 's' : ''} found
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(category.status === 'fail' || category.status === 'warning') && (
                          <Button
                            onClick={() => {
                              // Create remediation for the entire category
                              const checkId = originalChecks?.name || category.name;
                              handleFixThisCheck({
                                id: `${category.name}-check`,
                                check_type: category.name,
                                title: category.name,
                                status: category.status === 'fail' ? 'fail' : 'warning',
                              });
                            }}
                            disabled={creatingRemediationId === `${category.name}-check`}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
                          >
                            {creatingRemediationId === `${category.name}-check` ? (
                              <>
                                <span className="inline-block animate-spin mr-2 h-4 w-4">⏳</span>
                                <span>Creating...</span>
                              </>
                            ) : (
                              'Fix This'
                            )}
                          </Button>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          category.status === 'pass'
                            ? 'bg-green-100 text-green-800'
                            : category.status === 'warning'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {(category.status || '').charAt(0).toUpperCase() + (category.status || '').slice(1)}
                        </span>
                      </div>
                    </div>

                    {(category.findings?.length ?? 0) > 0 && (
                      <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
                        {category.findings.map((finding, idx) => (
                          <p key={idx} className="text-sm text-gray-700 line-clamp-2">
                            • {finding}
                          </p>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Scan History */}
      {!isLoading && scanHistory.length > 0 && (
        <Card className="rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Scan History</h3>
          <div className="space-y-3">
            {scanHistory.map((scan) => (
              <div
                key={scan.id}
                className="group flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 hover:border border-gray-300 transition-colors cursor-pointer border border-gray-200"
                onClick={() => setResults(scan)}
              >
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    Scan from {formatDate(scan.date)}
                  </p>
                  <p className="text-sm text-gray-600 tabular-nums">
                    {scan.totalIssues} issue{scan.totalIssues !== 1 ? 's' : ''} found
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-2xl font-bold tabular-nums ${getScoreColor(scan.score)}`}>
                      {scan.score}%
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State for Scans */}
      {!isLoading && scanHistory.length === 0 && !results && (
        <Card className="text-center py-8 text-gray-500">
          <p>No scans yet. Run your first compliance scan to get started.</p>
        </Card>
      )}
    </div>
  );
}
