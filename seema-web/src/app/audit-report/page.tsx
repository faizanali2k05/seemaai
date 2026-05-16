'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  BarChart,
  PieChart,
  Line,
  Bar,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  PageHeader,
  DataTable,
  StatCard,
  StatusBadge,
  Card,
  Button,
  LoadingSpinner,
  showToast,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_SCAN_RESULTS } from '@/lib/demo-data';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { Download } from 'lucide-react';

interface AuditReport {
  id: string;
  report_type: string;
  title: string;
  status: string;
  generated_at: string;
  summary: string;
  findings: AuditFinding[];
  recommendations: string[];
  score: number;
}

interface AuditFinding {
  id: string;
  finding: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  area: string;
  status: 'open' | 'resolved' | 'in-progress';
  recommendation: string;
}

const COLORS_CATEGORY = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AuditReportPage() {
  useRequireAuth();
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dateRange, setDateRange] = useState('6m');
  const [severityFilter, setSeverityFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  useEffect(() => {
    fetchAuditReports();
  }, []);

  const fetchAuditReports = async () => {
    try {
      setLoading(true);
      setError(null);

      // Demo mode fallback
      if (isDemoMode()) {
        const demoReport: AuditReport = {
          id: DEMO_SCAN_RESULTS.id,
          report_type: 'compliance_scan',
          title: 'Compliance Audit Report',
          status: 'completed',
          generated_at: DEMO_SCAN_RESULTS.scanned_at,
          summary: `Overall compliance score: ${DEMO_SCAN_RESULTS.score}%`,
          findings: [],
          recommendations: DEMO_SCAN_RESULTS.categories.flatMap(c => c.issues),
          score: DEMO_SCAN_RESULTS.score,
        };
        setReports([demoReport]);
        setFindings([]);
        setLoading(false);
        return;
      }

      const response = await apiClient.get('/compliance/audit-reports');
      const data = response.data;
      setReports(data);

      // Flatten all findings from all reports
      const allFindings: AuditFinding[] = [];
      data.forEach((report: AuditReport) => {
        if (report.findings && Array.isArray(report.findings)) {
          allFindings.push(...report.findings);
        }
      });
      setFindings(allFindings);
    } catch (err) {
      setError('Failed to load audit reports. Please try again.');
      // Fallback to demo data
      if (isDemoMode()) {
        const demoReport: AuditReport = {
          id: DEMO_SCAN_RESULTS.id,
          report_type: 'compliance_scan',
          title: 'Compliance Audit Report',
          status: 'completed',
          generated_at: DEMO_SCAN_RESULTS.scanned_at,
          summary: `Overall compliance score: ${DEMO_SCAN_RESULTS.score}%`,
          findings: [],
          recommendations: DEMO_SCAN_RESULTS.categories.flatMap(c => c.issues),
          score: DEMO_SCAN_RESULTS.score,
        };
        setReports([demoReport]);
      }
      console.error('Error fetching audit reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      // PDF + AI summarisation — can take up to 2 min.
      await apiClient.post('/compliance/generate-audit-report', {
        report_type: 'standard',
        title: `Audit Report - ${formatDate(new Date())}`,
      }, { timeout: 120000 });
      showToast('Audit report generated successfully', 'success');
      // Refresh the list of reports
      await fetchAuditReports();
    } catch (err) {
      const errorMsg = 'Failed to generate audit report. Please try again.';
      showToast(errorMsg, 'error');
      setError(errorMsg);
      console.error('Error generating report:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportReport = () => {
    if (reports.length === 0) {
      showToast('No reports to export', 'error');
      return;
    }

    try {
      const latestReport = reports[reports.length - 1];
      const printContent = `
        <html>
          <head>
            <title>Audit Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
              h1 { color: #2563eb; margin-bottom: 10px; }
              h2 { color: #1e40af; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
              .header { margin-bottom: 20px; }
              .date { color: #666; font-size: 14px; }
              .score { font-size: 48px; font-weight: bold; color: #2563eb; margin: 20px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background: #f5f6fa; font-weight: bold; }
              tr:nth-child(even) { background: #fafbfc; }
              .finding-item { margin: 10px 0; padding: 10px; background: #f9fafb; border-left: 3px solid #2563eb; }
              .severity-critical { color: #dc2626; font-weight: bold; }
              .severity-high { color: #f97316; font-weight: bold; }
              .severity-medium { color: #eab308; font-weight: bold; }
              .severity-low { color: #22c55e; font-weight: bold; }
              .page-break { page-break-after: always; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Seema Audit Report</h1>
              <p class="date">Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
              <p><strong>Report Type:</strong> ${latestReport.report_type}</p>
              <p><strong>Status:</strong> ${latestReport.status}</p>
            </div>

            <div>
              <h2>Executive Summary</h2>
              <p>${latestReport.summary || 'No summary available'}</p>
            </div>

            <div>
              <h2>Compliance Score</h2>
              <p class="score">${latestReport.score}/100</p>
            </div>

            <div>
              <h2>Audit Findings</h2>
              <table>
                <thead>
                  <tr>
                    <th>Finding</th>
                    <th>Severity</th>
                    <th>Area</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${latestReport.findings.map(f => `
                    <tr>
                      <td>${f.finding}</td>
                      <td><span class="severity-${f.severity}">${(f.severity || '').charAt(0).toUpperCase() + (f.severity || '').slice(1)}</span></td>
                      <td>${f.area}</td>
                      <td>${(f.status || '').charAt(0).toUpperCase() + (f.status || '').slice(1)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="page-break"></div>

            <div>
              <h2>Recommendations</h2>
              <ul>
                ${latestReport.recommendations.map(rec => `
                  <li style="margin-bottom: 10px;">${rec}</li>
                `).join('')}
              </ul>
            </div>

            <div class="footer">
              <p>This report was automatically generated by Seema Compliance Platform.</p>
              <p>For more information or to discuss findings, please contact your compliance officer.</p>
            </div>
          </body>
        </html>
      `;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(printContent);
        win.document.close();
        win.focus();
        setTimeout(() => {
          win.print();
        }, 250);
      } else {
        showToast('Failed to open print preview', 'error');
      }
    } catch (err) {
      console.error('Error exporting report:', err);
      showToast('Failed to export audit report', 'error');
    }
  };

  const filteredFindings = findings.filter(f => {
    const matchesSeverity = !severityFilter || f.severity === severityFilter;
    const matchesArea = !areaFilter || f.area === areaFilter;
    return matchesSeverity && matchesArea;
  });

  const totalChecks = findings.length;
  const passCount = findings.filter(f => f.status === 'resolved').length;
  const passRate = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0;
  const criticalFindings = findings.filter(f => f.severity === 'critical').length;
  const lastAuditDate = reports.length > 0
    ? new Date(reports[0].generated_at)
    : new Date();

  // Build compliance score data from reports
  const complianceScoreData = reports
    .sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime())
    .slice(-6)
    .map((report, idx) => ({
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][idx] || `Month ${idx + 1}`,
      score: report.score || 0,
    }));

  // Build findings by category
  const categoryMap = new Map<string, number>();
  findings.forEach(f => {
    categoryMap.set(f.area, (categoryMap.get(f.area) || 0) + 1);
  });
  const findingsByCategory = Array.from(categoryMap).map(([category, count]) => ({
    category,
    count,
  }));

  // Build risk distribution
  const riskCounts = {
    Critical: findings.filter(f => f.severity === 'critical').length,
    High: findings.filter(f => f.severity === 'high').length,
    Medium: findings.filter(f => f.severity === 'medium').length,
    Low: findings.filter(f => f.severity === 'low').length,
  };
  const riskDistribution = [
    { name: 'Critical', value: riskCounts.Critical, fill: '#dc2626' },
    { name: 'High', value: riskCounts.High, fill: '#f97316' },
    { name: 'Medium', value: riskCounts.Medium, fill: '#eab308' },
    { name: 'Low', value: riskCounts.Low, fill: '#22c55e' },
  ];

  const columns = [
    { accessor: 'finding', header: 'Finding', sortable: true },
    {
      accessor: 'severity',
      header: 'Severity',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.severity} variant={row.severity as any} />
      ),
    },
    { accessor: 'area', header: 'Area', sortable: true },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: any) => <StatusBadge status={row.status} />,
    },
    { accessor: 'recommendation', header: 'Recommendation' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Report" description="Review compliance audit results and trends" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-xl p-6">
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-gray-200 rounded animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Report" description="Review compliance audit results and trends" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {findings.length === 0 ? (
        <Card className="rounded-xl">
          <div className="p-6 text-center">
            <p className="text-gray-500 mb-4">No audit reports available</p>
            <Button onClick={handleGenerateReport} disabled={generating}>
              {generating ? 'Generating...' : 'Generate First Report'}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard title="Total Checks" value={totalChecks} color="blue" />
            <StatCard title="Pass Rate" value={`${passRate}%`} color="green" />
            <StatCard title="Critical Findings" value={criticalFindings} color="red" />
            <StatCard
              title="Last Audit Date"
              value={formatDate(lastAuditDate)}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card className="rounded-xl">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide">Compliance Score Over Time</h3>
                {complianceScoreData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={complianceScoreData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6' }}
                        name="Compliance Score"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-400 text-center py-8">No data available</p>
                )}
              </div>
            </Card>

            <Card className="rounded-xl">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide">Findings by Category</h3>
                {findingsByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={findingsByCategory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10b981" name="Number of Findings" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-400 text-center py-8">No data available</p>
                )}
              </div>
            </Card>

            <Card className="rounded-xl">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide">Risk Distribution</h3>
                {riskDistribution.some(item => item.value > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Tooltip />
                      <Legend />
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {riskDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-400 text-center py-8">No data available</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="rounded-xl">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="1m">Last Month</option>
                    <option value="3m">Last 3 Months</option>
                    <option value="6m">Last 6 Months</option>
                    <option value="1y">Last Year</option>
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  <select
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Areas</option>
                    {findingsByCategory.map(cat => (
                      <option key={cat.category} value={cat.category}>
                        {cat.category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <Button onClick={handleGenerateReport} disabled={generating}>
                    {generating ? 'Generating...' : 'Generate Report'}
                  </Button>
                  <Button variant="outline" onClick={handleExportReport} disabled={reports.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Report
                  </Button>
                </div>
              </div>

              <h3 className="text-lg font-semibold">Audit Findings</h3>
              {filteredFindings.length > 0 ? (
                <DataTable columns={columns} data={filteredFindings} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No findings match the selected filters
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
