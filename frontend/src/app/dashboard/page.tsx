'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  PageHeader, StatCard, Card, Button, EmptyState, Tabs, showToast,
  DashboardSkeleton, UpgradeGate, TierBadge,
} from '@/components/ui';

// Dynamic imports for Recharts-based components — avoids SSR crashes in production
const TrendChart = dynamic(() => import('@/components/ui/Charts').then(m => m.TrendChart), { ssr: false });
const BarChartCard = dynamic(() => import('@/components/ui/Charts').then(m => m.BarChartCard), { ssr: false });
const ComplianceGauge = dynamic(() => import('@/components/ui/Charts').then(m => m.ComplianceGauge), { ssr: false });
const ActivityTimeline = dynamic(() => import('@/components/ui/Charts').then(m => m.ActivityTimeline), { ssr: false });
import { useRequireAuth, useTierGate } from '@/lib/hooks';
import { useAuthStore } from '@/lib/stores/auth-store';
import apiClient from '@/lib/api';
import { formatDate } from '@/lib/utils/format';
import {
  AlertTriangle, CheckCircle, Clock, Shield, Users, FileWarning,
  Scale, Bell, ArrowRight, TrendingUp, Activity, BarChart3,
  FileCheck, Zap, ChevronRight,
} from 'lucide-react';
import { isDemoMode, DEMO_DASHBOARD_STATS, DEMO_DASHBOARD_BRIEFING, DEMO_REGULATORY_UPDATES } from '@/lib/demo-data';

interface DashboardStats {
  total_staff: number;
  open_alerts: number;
  critical_alerts: number;
  pending_tasks: number;
  pending_intake: number;
  open_breaches: number;
}

interface BriefingData {
  date: string;
  overdue_training: Array<{ staff_id: string; staff_name: string; title: string; due_date: string; training_type: string }>;
  overdue_reviews: Array<{ staff_id: string; staff_name: string; case_id: string; due_date: string }>;
  overdue_supervision: Array<{ staff_id: string; staff_name: string; next_due: string; frequency: string }>;
  open_breaches: Array<{ id: string; title: string; severity: string; status: string }>;
  high_risk_intakes: Array<{ id: string; client_name: string; risk_level: string; risk_score: number }>;
  pending_regulatory_updates: Array<{ id: string; title: string; source: string; impact_level: string; published_date: string }>;
  upcoming_deadlines: Array<{ id: string; title: string; due_date: string; priority: string; assigned_to: string }>;
}

interface RegulatoryUpdate {
  id: string;
  title: string;
  source: string;
  impact_level: string;
  published_date: string;
  description?: string;
  regulatory_body?: string;
}

export default function DashboardPage() {
  useRequireAuth();
  const router = useRouter();
  const { isPro } = useTierGate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const api = apiClient;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('briefing');


  const isDemo = isDemoMode();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // Demo mode — show realistic Harrison Morgan firm data, never hit the API
      if (isDemo) {
        setStats(DEMO_DASHBOARD_STATS as DashboardStats);
        setBriefing(DEMO_DASHBOARD_BRIEFING as BriefingData);
        setUpdates(DEMO_REGULATORY_UPDATES.slice(0, 5) as RegulatoryUpdate[]);
        setLoading(false);
        return;
      }

      // Promise.allSettled never throws — each result is 'fulfilled' or 'rejected'
      const [statsRes, briefingRes, updatesRes, staffRes, mattersRes] = await Promise.allSettled([
        api.get('/dashboard/stats'),
        api.get('/compliance/daily-briefing'),
        api.get('/compliance/regulatory-updates'),
        api.get('/compliance/staff'),
        api.get('/compliance/matters'),
      ]);

      // Real API returns a NESTED stats shape: { alerts:{open,critical}, breaches:{open},
      // intake:{pending}, training:{overdue}, compliance_scans:{...} }. The cards below read
      // a flat shape, so normalize to it (keeping flat keys for demo/legacy responses).
      // total_staff has no key in stats — derive it from /compliance/staff. There is no
      // pending_tasks source, so it falls back to overdue training.
      if (statsRes.status === 'fulfilled' && statsRes.value.data && typeof statsRes.value.data === 'object') {
        const raw = statsRes.value.data as any;
        const staffData = staffRes.status === 'fulfilled' ? staffRes.value.data : null;
        const staffCount = Array.isArray(staffData) ? staffData.length : (raw.total_staff ?? 0);
        const mattersData = mattersRes.status === 'fulfilled' ? mattersRes.value.data : null;
        const matterCount = Array.isArray(mattersData) ? mattersData.length : 0;
        const normalized: any = {
          open_alerts: raw.open_alerts ?? raw.alerts?.open ?? 0,
          critical_alerts: raw.critical_alerts ?? raw.alerts?.critical ?? 0,
          open_breaches: raw.open_breaches ?? raw.breaches?.open ?? 0,
          pending_intake: raw.pending_intake ?? raw.intake?.pending ?? 0,
          pending_tasks: raw.pending_tasks ?? raw.training?.overdue ?? 0,
          total_staff: staffCount,
          open_matters: matterCount,
        };
        setStats(normalized);
      } else if (isDemoMode()) {
        setStats(DEMO_DASHBOARD_STATS as DashboardStats);
      }

      // Real API returns { today_alerts, overdue_items, upcoming_deadlines }, not the
      // overdue_training/overdue_reviews/... shape the briefing tab reads. Normalize so the
      // briefing list and quick-jump flags populate from real data.
      if (briefingRes.status === 'fulfilled' && briefingRes.value.data && typeof briefingRes.value.data === 'object') {
        const raw = briefingRes.value.data as any;
        if (Array.isArray(raw.overdue_training)) {
          setBriefing(raw);
        } else {
          const overdueItems = Array.isArray(raw.overdue_items) ? raw.overdue_items : [];
          const upcoming = Array.isArray(raw.upcoming_deadlines) ? raw.upcoming_deadlines : [];
          const normalizedBriefing: BriefingData = {
            date: raw.date || new Date().toISOString(),
            overdue_training: overdueItems.map((t: any) => ({
              staff_id: t.staff_id || t.id,
              staff_name: t.staff_name || '',
              title: t.title || '',
              due_date: t.due_date || '',
              training_type: t.training_type || t.status || '',
            })),
            overdue_reviews: [],
            overdue_supervision: [],
            open_breaches: [],
            high_risk_intakes: [],
            pending_regulatory_updates: [],
            upcoming_deadlines: upcoming.map((d: any) => ({
              id: d.id,
              title: d.title || '',
              due_date: d.due_date || '',
              priority: d.priority || 'medium',
              assigned_to: d.assigned_to || d.staff_name || '',
            })),
          };
          setBriefing(normalizedBriefing);
        }
      } else if (isDemoMode()) {
        setBriefing(DEMO_DASHBOARD_BRIEFING as BriefingData);
      }

      if (updatesRes.status === 'fulfilled') {
        const data = updatesRes.value.data;
        setUpdates(Array.isArray(data) ? data.slice(0, 5) : isDemoMode() ? DEMO_REGULATORY_UPDATES.slice(0, 5) as RegulatoryUpdate[] : []);
      } else if (isDemoMode()) {
        setUpdates(DEMO_REGULATORY_UPDATES.slice(0, 5) as RegulatoryUpdate[]);
      }

      setLoading(false);
    };

    fetchData();
  }, [api, isDemo]);

  // ── Loading state with skeleton ──
  if (loading) {
    return <DashboardSkeleton />;
  }

  // ── Greeting logic ──
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const userName = user?.name || 'COLP';
  const firmName = user?.firm_name || '';
  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Overdue / urgency calculations ──
  const overdueCount = briefing
    ? (briefing.overdue_training?.length ?? 0) + (briefing.overdue_reviews?.length ?? 0) + (briefing.overdue_supervision?.length ?? 0)
    : 0;
  const totalActionItems = briefing
    ? overdueCount + (briefing.open_breaches?.length ?? 0) + (briefing.high_risk_intakes?.length ?? 0) + (briefing.upcoming_deadlines?.length ?? 0)
    : 0;

  // Status banner
  let statusColor: string;
  let statusBg: string;
  let statusBorder: string;
  let statusMessage: string;
  let StatusIcon = CheckCircle;

  if (overdueCount > 0) {
    statusColor = 'text-red-700';
    statusBg = 'bg-red-50';
    statusBorder = 'border-red-200';
    statusMessage = `${overdueCount} overdue item${overdueCount > 1 ? 's' : ''} — action required before end of day`;
    StatusIcon = AlertTriangle;
  } else if ((stats?.pending_tasks ?? 0) > 0) {
    statusColor = 'text-amber-700';
    statusBg = 'bg-amber-50';
    statusBorder = 'border-amber-200';
    statusMessage = `${stats?.pending_tasks} task${(stats?.pending_tasks ?? 0) > 1 ? 's' : ''} due soon`;
    StatusIcon = Clock;
  } else {
    statusColor = 'text-green-700';
    statusBg = 'bg-green-50';
    statusBorder = 'border-green-200';
    statusMessage = 'No urgent actions — your compliance position is strong';
    StatusIcon = CheckCircle;
  }

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  // ── Briefing flags (quick-jump counters) ──
  const briefingFlags = briefing ? [
    { label: 'Overdue Training', count: briefing.overdue_training?.length ?? 0, route: '/staff', color: 'red' },
    { label: 'Overdue Reviews', count: briefing.overdue_reviews?.length ?? 0, route: '/staff', color: 'red' },
    { label: 'Open Breaches', count: briefing.open_breaches?.length ?? 0, route: '/breaches', color: 'red' },
    { label: 'Pending Intakes', count: briefing.high_risk_intakes?.length ?? 0, route: '/intake', color: 'amber' },
    { label: 'Reg. Updates', count: briefing.pending_regulatory_updates?.length ?? 0, route: '/regulatory', color: 'blue' },
    { label: 'Overdue Supervision', count: briefing.overdue_supervision?.length ?? 0, route: '/supervision', color: 'orange' },
  ].filter(f => f.count > 0) : [];

  // ── Action items (flat list for briefing tab) ──
  const actionItems = briefing ? [
    ...(briefing.overdue_training ?? []).map(t => ({
      id: `training-${t.staff_id}`,
      title: `Overdue training: ${t.title} — ${t.staff_name}`,
      type: 'training' as const,
      priority: 'high' as const,
      due_date: t.due_date,
    })),
    ...(briefing.overdue_reviews ?? []).map(r => ({
      id: `review-${r.staff_id}-${r.case_id}`,
      title: `Overdue file review — ${r.staff_name}`,
      type: 'review' as const,
      priority: 'high' as const,
      due_date: r.due_date,
    })),
    ...(briefing.overdue_supervision ?? []).map(s => ({
      id: `supervision-${s.staff_id}`,
      title: `Overdue supervision: ${s.staff_name} (${s.frequency})`,
      type: 'supervision' as const,
      priority: 'medium' as const,
      due_date: s.next_due,
    })),
    ...(briefing.open_breaches ?? []).map(b => ({
      id: `breach-${b.id}`,
      title: `Open breach: ${b.title}`,
      type: 'breach' as const,
      priority: b.severity === 'critical' ? 'critical' as const : 'high' as const,
      due_date: '',
    })),
    ...(briefing.high_risk_intakes ?? []).map(i => ({
      id: `intake-${i.id}`,
      title: `High-risk intake: ${i.client_name} (score: ${i.risk_score})`,
      type: 'intake' as const,
      priority: 'high' as const,
      due_date: '',
    })),
    ...(briefing.upcoming_deadlines ?? []).map(d => ({
      id: `deadline-${d.id}`,
      title: d.title,
      type: 'deadline' as const,
      priority: (d.priority || 'medium') as 'critical' | 'high' | 'medium' | 'low',
      due_date: d.due_date,
    })),
  ] : [];

  const complianceHealth = Math.max(0, 100 - (stats?.open_alerts ?? 0) * 10 - (stats?.open_breaches ?? 0) * 20);

  // ── Donut chart data ──
  const complianceDonut = [
    { name: 'Compliant', value: complianceHealth, color: '#059669' },
    { name: 'At Risk', value: Math.min(100 - complianceHealth, 30), color: '#d97706' },
    { name: 'Non-Compliant', value: Math.max(0, 100 - complianceHealth - 30), color: '#dc2626' },
  ].filter(d => d.value > 0);

  // ── Bar chart: open items by category, derived from REAL stats (no mock) ──
  const taskDistribution = stats
    ? [
        { category: 'Alerts', count: stats.open_alerts ?? 0 },
        { category: 'Tasks', count: stats.pending_tasks ?? 0 },
        { category: 'Intakes', count: stats.pending_intake ?? 0 },
        { category: 'Breaches', count: stats.open_breaches ?? 0 },
        { category: 'Staff', count: stats.total_staff ?? 0 },
      ].filter((d) => d.count > 0)
    : [];

  // ── Compliance score trend — fills in as scan history accrues (no mock data) ──
  const complianceTrend: { month: string; score: number }[] = [];

  // ── Activity timeline — real activity only (empty until there is any) ──
  const recentActivity: { id: string; title: string; description: string; time: string; type: 'success' | 'info' | 'error' | 'warning' }[] = [];

  return (
    <div className="space-y-6">
      {/* ── Personalised Greeting Banner ── */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {greeting}, {userName}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
              {todayFormatted}{firmName ? ` · ${firmName}` : ''} <TierBadge />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => router.push('/compliance-scan')}>
              <Zap className="w-4 h-4 mr-1.5" />
              Run Compliance Scan
            </Button>
          </div>
        </div>

        {/* Status Banner */}
        <div className={`${statusBg} border ${statusBorder} rounded-xl px-4 py-3 flex items-center gap-3 mt-4`}>
          <div className={`flex-shrink-0 ${statusColor}`}>
            <StatusIcon className="w-5 h-5" />
          </div>
          <p className={`text-sm font-semibold ${statusColor} flex-1`}>{statusMessage}</p>
          {overdueCount > 0 && (
            <button
              onClick={() => router.push('/alerts')}
              className={`text-xs font-medium ${statusColor} flex items-center gap-1 hover:underline`}
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── Briefing Flags (quick-jump counters) ── */}
      {briefingFlags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {briefingFlags.map((flag) => {
            const colorMap: Record<string, string> = {
              red: 'bg-red-100 text-red-800 hover:bg-red-200',
              amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
              orange: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
              blue: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
            };
            return (
              <button
                key={flag.label}
                onClick={() => router.push(flag.route)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border border-transparent hover:border-current/10 ${colorMap[flag.color] || colorMap.blue}`}
              >
                <span className="font-bold text-sm">{flag.count}</span>
                <span>{flag.label}</span>
                <ChevronRight className="w-3 h-3 opacity-60" />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Stat Cards Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Open Matters"
          value={(stats as any)?.open_matters ?? 0}
          color="red"
          icon={<Bell className="w-5 h-5" />}
          onClick={() => router.push('/matters')}
        />
        <StatCard
          title="Critical Items"
          value={stats?.critical_alerts ?? 0}
          color="amber"
          icon={<AlertTriangle className="w-5 h-5" />}
          onClick={() => router.push('/alerts')}
        />
        <StatCard
          title="Pending Intakes"
          value={stats?.pending_intake ?? 0}
          color="blue"
          icon={<FileCheck className="w-5 h-5" />}
          onClick={() => router.push('/intake')}
        />
        <StatCard
          title="Active Staff"
          value={stats?.total_staff ?? 0}
          color="green"
          icon={<Users className="w-5 h-5" />}
          onClick={() => router.push('/staff')}
        />
        <StatCard
          title="Open Breaches"
          value={stats?.open_breaches ?? 0}
          color="red"
          icon={<FileWarning className="w-5 h-5" />}
          onClick={() => router.push('/breaches')}
        />
        <StatCard
          title="Pending Tasks"
          value={stats?.pending_tasks ?? 0}
          color="orange"
          icon={<Clock className="w-5 h-5" />}
          onClick={() => router.push('/deadlines')}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart
          data={complianceTrend}
          dataKey="score"
          xAxisKey="month"
          color="#059669"
          title="Compliance Score Trend"
          height={220}
        />
        <BarChartCard
          data={taskDistribution}
          dataKey="count"
          xAxisKey="category"
          color="#2563eb"
          title="Open Items by Category"
          height={220}
        />
      </div>

      {/* ── Main Content Grid: Briefing + Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Tabs for Briefing and Updates ── */}
        <div className="lg:col-span-2">
          <Tabs
            tabs={[
              { id: 'briefing', label: 'Daily Briefing', count: totalActionItems },
              { id: 'updates', label: 'Regulatory Updates', count: updates.length },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          {activeTab === 'briefing' && (
            <Card className="mt-4">
              {actionItems.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {actionItems.map((item) => {
                    const typeToRoute: Record<string, string> = {
                      training: '/staff',
                      review: '/staff',
                      supervision: '/supervision',
                      breach: '/breaches',
                      intake: '/intake',
                      deadline: '/deadlines',
                    };
                    const targetRoute = typeToRoute[item.type] || '/alerts';
                    return (
                      <div
                        key={item.id}
                        className="px-4 py-3 flex items-start justify-between hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => router.push(targetRoute)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="text-sm font-medium text-gray-900 truncate">{item.title}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${priorityColor(item.priority)}`}>
                              {item.priority}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 capitalize">{item.type}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          {item.due_date && (
                            <p className="text-xs font-medium text-gray-600 whitespace-nowrap">{formatDate(item.due_date)}</p>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="All clear"
                  description="No action items today — your compliance position is strong"
                  icon="check"
                />
              )}
            </Card>
          )}

          {activeTab === 'updates' && (
            <Card className="mt-4">
              {updates.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {updates.map((update) => {
                    const impactColor: Record<string, string> = {
                      high: 'bg-red-100 text-red-800',
                      medium: 'bg-amber-100 text-amber-800',
                      low: 'bg-green-100 text-green-800',
                    };
                    return (
                      <div
                        key={update.id}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => router.push('/regulatory')}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="text-sm font-medium text-gray-900 flex-1">{update.title}</h4>
                          <div className="flex items-center gap-2 ml-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${impactColor[update.impact_level] || 'bg-blue-100 text-blue-800'}`}>
                              {update.impact_level}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                              {update.source || update.regulatory_body || ''}
                            </span>
                          </div>
                        </div>
                        {update.description && (
                          <p className="text-xs text-gray-600 mb-1 line-clamp-2">{update.description}</p>
                        )}
                        <p className="text-xs text-gray-400">{formatDate(update.published_date)}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No recent updates" description="Check back later for regulatory updates" icon="inbox" />
              )}
            </Card>
          )}
        </div>

        {/* ── Right Sidebar: Compliance Health + Activity ── */}
        <div className="space-y-6">
          {/* Compliance Health Gauge */}
          <ComplianceGauge
            value={complianceHealth}
            label="Compliance Health"
          />

          {/* Quick Actions */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'View Alerts', route: '/alerts', icon: Bell, count: stats?.open_alerts },
                { label: 'Check Deadlines', route: '/deadlines', icon: Clock, count: stats?.pending_tasks },
                { label: 'Review Breaches', route: '/breaches', icon: FileWarning, count: stats?.open_breaches },
                { label: 'Regulatory Feed', route: '/regulatory', icon: Scale, count: updates.length },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => router.push(action.route)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <action.icon className="w-4 h-4 text-gray-400 group-hover:text-seema-primary transition-colors" />
                    <span className="font-medium">{action.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {action.count !== undefined && action.count > 0 && (
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {action.count}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Activity Timeline */}
          <ActivityTimeline items={recentActivity} />
        </div>
      </div>

      {/* ── Professional Tier: Risk Heatmap ── */}
      <UpgradeGate feature="risk_heatmap">
        <Card title="Firm-Wide Risk Heatmap">
          <p className="text-sm text-gray-500 mb-4">
            Visual overview of compliance risk across all departments and practice areas.
          </p>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 text-sm">
            Risk heatmap visualization
          </div>
        </Card>
      </UpgradeGate>

      {/* ── Professional Tier: Department Views ── */}
      <UpgradeGate feature="multi_department_views">
        <Card title="Department Compliance Overview">
          <p className="text-sm text-gray-500 mb-4">
            Compare compliance metrics across departments — training completion, open alerts, and risk scores.
          </p>
          <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 text-sm">
            Department comparison view
          </div>
        </Card>
      </UpgradeGate>
    </div>
  );
}
