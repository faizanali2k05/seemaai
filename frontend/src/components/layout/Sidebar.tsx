'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useFirmStore } from '@/lib/stores/firm-store';
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Users,
  BookOpen,
  Calendar,
  AlertCircle,
  CheckCircle,
  RotateCcw,
  FileText,
  Shield,
  Zap,
  Settings,
  HelpCircle,
  Database,
  MessageSquare,
  Lock,
  Clipboard,
  BarChart3,
  Scan,
  Search,
  Fingerprint,
  ScrollText,
  MessageCircle,
  Landmark,
  Calculator,
  Bell,
  ShieldCheck,
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: MenuItem[];
  minRole?: number; // Minimum role level required to see this item
  proOnly?: boolean; // Shows PRO badge on Essentials tier
}

// Role hierarchy: higher number = more permissions
const ROLE_HIERARCHY: Record<string, number> = {
  staff: 10,
  solicitor: 20,
  admin: 30,
  partner: 40,
  colp: 50,
};

const getUserRoleLevel = (role: string): number => {
  return ROLE_HIERARCHY[role?.toLowerCase()] || 10;
};

// ── Top-level nav items (always visible) ──
// Reminders → Chasers: clearer label. SRA Audit moved to More since the
// inspection pack is occasional (every 5–10 years), not daily.
const primaryItems: MenuItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={18} />, href: '/dashboard' },
  { label: 'Regulatory Updates', icon: <AlertCircle size={18} />, href: '/regulatory' },
  { label: 'AML / CDD', icon: <Fingerprint size={18} />, href: '/aml' },
  { label: 'Chasers', icon: <Zap size={18} />, href: '/chasers' },
];

// ── "More" items (collapsible) ──
// CDD Risk Review removed — surfaced as a tab inside AML/CDD instead.
// SRA naming disambiguated: "SRA Inspection Pack" (pack for SRA visits) vs
// "SRA Annual Return" (annual mySRA submission).
// Admin pages (Settings, Data Management, User Management, Audit Trail) are
// grouped at the end with a header for visual separation.
const moreItems: MenuItem[] = [
  { label: 'Conflict Check', icon: <Search size={18} />, href: '/conflicts' },
  { label: 'Matter Compliance Review', icon: <Clipboard size={18} />, href: '/matters' },
  { label: 'Compliance Deadlines', icon: <Calendar size={18} />, href: '/deadlines' },
  { label: 'Undertakings', icon: <ScrollText size={18} />, href: '/undertakings' },
  { label: 'Compliance Scan', icon: <Scan size={18} />, href: '/compliance-scan', minRole: 30 },
  { label: 'Complaints', icon: <MessageCircle size={18} />, href: '/complaints' },
  { label: 'Breach Log', icon: <Shield size={18} />, href: '/breaches' },
  { label: 'Remediation', icon: <RotateCcw size={18} />, href: '/remediation' },
  { label: 'Policies', icon: <FileText size={18} />, href: '/policies' },
  { label: 'Alerts', icon: <AlertCircle size={18} />, href: '/alerts' },
  { label: 'Staff & Training', icon: <Users size={18} />, href: '/staff', minRole: 30 },
  { label: 'Supervision', icon: <Shield size={18} />, href: '/supervision', minRole: 30 },
  { label: 'SRA Inspection Pack', icon: <CheckCircle size={18} />, href: '/sra-audit' },
  { label: 'SRA Annual Return', icon: <FileText size={18} />, href: '/sra-return', minRole: 40 },
  { label: 'PII Renewal Pack', icon: <ShieldCheck size={18} />, href: '/pii-renewal', minRole: 40 },
];

// ── Admin items (grouped under their own header inside "More") ──
const adminItems: MenuItem[] = [
  { label: 'Settings', icon: <Settings size={18} />, href: '/settings', minRole: 30 },
  { label: 'User Management', icon: <Users size={18} />, href: '/user-management', minRole: 30 },
  { label: 'Data Management', icon: <Database size={18} />, href: '/data-management', minRole: 30 },
  { label: 'Audit Trail', icon: <BarChart3 size={18} />, href: '/audit-trail', minRole: 40 },
];

// ── "Lab" items (experimental — hidden behind localStorage flag) ──
//
// These four pages exist and the URLs still work, but they're hidden from
// nav by default because they either duplicate tools the firm already uses
// (Client Accounts ↔ Quill/Xero, Evidence Locker ↔ NetDocuments/M365), serve
// niche workflows (Key Dates Calculator), or depend on staff adoption that
// we haven't proven (Staff Portal). Flip
// `localStorage.setItem('seema_lab_features_enabled', 'true')` in devtools,
// or use the toggle in Settings → Preferences, to surface them.
const labItems: MenuItem[] = [
  { label: 'Key Dates Calculator', icon: <Calculator size={18} />, href: '/key-dates' },
  { label: 'Client Accounts', icon: <Landmark size={18} />, href: '/accounts', minRole: 40 },
  { label: 'Evidence Locker', icon: <Lock size={18} />, href: '/evidence', minRole: 40 },
  { label: 'Staff Portal', icon: <MessageSquare size={18} />, href: '/staff-portal' },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [labExpanded, setLabExpanded] = useState(false);
  // Read once on mount — toggling this in Settings reloads the page.
  const [labEnabled, setLabEnabled] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLabEnabled(localStorage.getItem('seema_lab_features_enabled') === 'true');
    }
  }, []);

  // Use Zustand auth store — stays in sync with login/logout
  const storeUser = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const storeLogout = useAuthStore((state) => state.logout);
  const firmTier = useFirmStore((state) => state.firm?.subscription_tier || 'essentials');
  const isPro = firmTier === 'professional';
  const user = storeUser;
  const isLoading = !isHydrated;

  const userLevel = getUserRoleLevel(user?.role || 'staff');

  // Auto-expand "More" if the active page is inside it
  const isMenuItemActive = (href?: string): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const activeInMore = moreItems.some(item => isMenuItemActive(item.href));
  const showMoreExpanded = moreExpanded || activeInMore;

  const handleLogout = () => {
    storeLogout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white shadow-lg hover:bg-gray-50"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar overlay for mobile */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:relative top-0 left-0 h-screen z-40 bg-seema-sidebar-bg text-white transition-transform duration-300 flex flex-col w-64 lg:w-[260px]`}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-seema-sidebar-hover">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Seema</h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isPro
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {isPro ? 'Professional' : 'Essentials'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Compliance Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {/* ── Primary items ── */}
          <div className="space-y-1 mb-4">
            {primaryItems.map((item) => {
              const isActive = isMenuItemActive(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href || '#'}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-[13px] font-medium ${
                    isActive
                      ? 'bg-seema-sidebar-active text-white'
                      : 'text-gray-300 hover:bg-seema-sidebar-hover hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* ── More section ── */}
          <div>
            <button
              onClick={() => setMoreExpanded(!showMoreExpanded)}
              className="flex items-center justify-between w-full px-3 py-2 text-[12px] font-semibold text-gray-400 hover:text-white transition-colors rounded-md hover:bg-seema-sidebar-hover"
            >
              <span>More</span>
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${showMoreExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {showMoreExpanded && (
              <div className="mt-1 space-y-0.5 ml-1 border-l border-gray-700 pl-2">
                {moreItems
                  .filter(item => userLevel >= (item.minRole || 0))
                  .map((item) => {
                    const isActive = isMenuItemActive(item.href);
                    return (
                      <Link
                        key={item.label}
                        href={item.href || '#'}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-1.5 rounded-md transition-colors text-[12px] ${
                          isActive
                            ? 'bg-seema-sidebar-active text-white font-medium'
                            : 'text-gray-400 hover:bg-seema-sidebar-hover hover:text-gray-200'
                        }`}
                      >
                        {item.icon}
                        <span className="flex-1">{item.label}</span>
                        {item.proOnly && !isPro && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                            PRO
                          </span>
                        )}
                      </Link>
                    );
                  })}

                {/* ── Admin sub-group ──
                    Visually separated with a small uppercase header so
                    Settings / User Mgmt / Data Mgmt / Audit Trail don't
                    sit in the main list as if they were daily workflows. */}
                {adminItems.some(item => userLevel >= (item.minRole || 0)) && (
                  <div className="pt-3 mt-2 border-t border-gray-700/50">
                    <p className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Admin
                    </p>
                    {adminItems
                      .filter(item => userLevel >= (item.minRole || 0))
                      .map((item) => {
                        const isActive = isMenuItemActive(item.href);
                        return (
                          <Link
                            key={item.label}
                            href={item.href || '#'}
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center space-x-3 px-3 py-1.5 rounded-md transition-colors text-[12px] ${
                              isActive
                                ? 'bg-seema-sidebar-active text-white font-medium'
                                : 'text-gray-400 hover:bg-seema-sidebar-hover hover:text-gray-200'
                            }`}
                          >
                            {item.icon}
                            <span className="flex-1">{item.label}</span>
                          </Link>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Lab section — only when the localStorage flag is on ── */}
          {labEnabled && (
            <div className="mt-3">
              <button
                onClick={() => setLabExpanded(!labExpanded)}
                className="flex items-center justify-between w-full px-3 py-2 text-[12px] font-semibold text-amber-400/80 hover:text-amber-300 transition-colors rounded-md hover:bg-seema-sidebar-hover"
              >
                <span>Lab</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${labExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {labExpanded && (
                <div className="mt-1 space-y-0.5 ml-1 border-l border-amber-700/50 pl-2">
                  {labItems
                    .filter(item => userLevel >= (item.minRole || 0))
                    .map((item) => {
                      const isActive = isMenuItemActive(item.href);
                      return (
                        <Link
                          key={item.label}
                          href={item.href || '#'}
                          onClick={() => setIsOpen(false)}
                          className={`flex items-center space-x-3 px-3 py-1.5 rounded-md transition-colors text-[12px] ${
                            isActive
                              ? 'bg-seema-sidebar-active text-white font-medium'
                              : 'text-gray-400 hover:bg-seema-sidebar-hover hover:text-gray-200'
                          }`}
                        >
                          {item.icon}
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        {!isLoading && user && (
          <div className="border-t border-seema-sidebar-hover p-4">
            <div className="px-4 py-3 bg-seema-sidebar-hover rounded-lg mb-4">
              <p className="text-sm font-semibold text-white">{user.name}</p>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm font-medium text-white"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
