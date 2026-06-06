export const APP_NAME = 'Seema';
export const APP_TAGLINE = "Your COLP's Operating System";
export const APP_DESCRIPTION =
  'Compliance platform for UK law firms to manage COLP operations, regulatory compliance, and legal requirements.';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const STATUS_COLORS = {
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
  info: '#2563eb',
};

export const STATUS_LABELS = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
  in_progress: 'In Progress',
  overdue: 'Overdue',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STAFF_TRAINING: '/staff-training',
  CLIENT_INTAKE: '/client-intake',
  DEADLINES: '/deadlines',
  REGULATORY_UPDATES: '/regulatory-updates',
  ALERTS: '/alerts',
  SRA_AUDIT: '/sra-audit',
  REMEDIATION: '/remediation',
  POLICIES: '/policies',
  BREACH_LOG: '/breach-log',
  AUDIT_REPORT: '/audit-report',
  CHASERS: '/chasers',
  EVIDENCE_LOCKER: '/evidence-locker',
  SUPERVISION: '/supervision',
  MATTER_CHECKLISTS: '/matter-checklists',
  SRA_RETURN: '/sra-return',
  AUDIT_TRAIL: '/audit-trail',
  DATA_MANAGEMENT: '/data-management',
  USER_MANAGEMENT: '/user-management',
  STAFF_PORTAL: '/staff-portal',
  EMAIL_SETTINGS: '/email-settings',
  COMPLIANCE_SCAN: '/compliance-scan',
};
