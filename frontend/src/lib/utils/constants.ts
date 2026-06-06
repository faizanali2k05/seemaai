import type { UserRole } from '../types';

// Role hierarchy for permission checking (higher = more privilege)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  colp: 5,
  partner: 4,
  admin: 3,
  solicitor: 2,
  staff: 1,
};

export const ROLES: { value: UserRole; label: string }[] = [
  { value: 'colp', label: 'COLP' },
  { value: 'partner', label: 'Partner' },
  { value: 'admin', label: 'Admin' },
  { value: 'solicitor', label: 'Solicitor' },
  { value: 'staff', label: 'Staff' },
];

export const PRACTICE_AREAS = [
  { value: 'conveyancing', label: 'Conveyancing' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'employment', label: 'Employment' },
  { value: 'family', label: 'Family' },
  { value: 'probate', label: 'Probate' },
  { value: 'ip', label: 'Intellectual Property' },
  { value: 'personal_injury', label: 'Personal Injury' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'other', label: 'Other' },
];

export const RISK_LEVELS = [
  { value: 'critical', label: 'Critical', color: '#dc2626' },
  { value: 'high', label: 'High', color: '#ea580c' },
  { value: 'medium', label: 'Medium', color: '#d97706' },
  { value: 'low', label: 'Low', color: '#059669' },
  { value: 'info', label: 'Info', color: '#2563eb' },
];

export const COMPLIANCE_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'on_hold', label: 'On Hold' },
];

export const TRAINING_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export const CONFLICT_CHECK_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'clear', label: 'Clear' },
  { value: 'conflict_found', label: 'Conflict Found' },
];

export const CLIENT_INTAKE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export const BREACH_TYPE_OPTIONS = [
  { value: 'data_loss', label: 'Data Loss' },
  { value: 'unauthorized_access', label: 'Unauthorized Access' },
  { value: 'malware', label: 'Malware' },
  { value: 'ransomware', label: 'Ransomware' },
  { value: 'other', label: 'Other' },
];

export const REGULATORY_BODY_OPTIONS = [
  { value: 'sra', label: 'SRA' },
  { value: 'fca', label: 'FCA' },
  { value: 'ico', label: 'ICO' },
  { value: 'moj', label: 'MOJ' },
  { value: 'other', label: 'Other' },
];

export const DEADLINE_PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const DEADLINE_CATEGORY_OPTIONS = [
  { value: 'training', label: 'Training' },
  { value: 'report', label: 'Report' },
  { value: 'review', label: 'Review' },
  { value: 'filing', label: 'Filing' },
  { value: 'other', label: 'Other' },
];

export const TRAINING_COURSE_TYPES = [
  { value: 'gdpr', label: 'GDPR' },
  { value: 'aml', label: 'Anti-Money Laundering' },
  { value: 'fca_handbook', label: 'FCA Handbook' },
  { value: 'conflict_check', label: 'Conflict Check' },
  { value: 'client_care', label: 'Client Care' },
  { value: 'general_compliance', label: 'General Compliance' },
];

export const SUBSCRIPTION_TIERS = [
  {
    value: 'essentials',
    label: 'Essentials',
    price: 200,
    firmSize: '2–10 solicitors',
    description: 'Full compliance automation for small firms',
    features: [
      'Compliance dashboard & alerts',
      'Clio PMS integration & auto-sync',
      'AI-powered compliance scanning',
      'Regulatory feed monitoring (SRA, ICO, GOV.UK)',
      'Automated chaser emails & daily digests',
      'Deadline & undertaking tracking',
      'SRA return preparation',
      'Risk scoring & AML checks',
      'Staff training management',
      'Client account reconciliation',
      'Breach & complaints register',
      'Policy & evidence management',
      'Weekly compliance summary report',
      'Up to 10 user accounts',
      'Email support',
    ],
  },
  {
    value: 'professional',
    label: 'Professional',
    price: 700,
    firmSize: '10–50 solicitors',
    description: 'Scale compliance across departments and teams',
    features: [
      'Everything in Essentials',
      'Unlimited user accounts',
      'Multi-department views & filtering',
      'Advanced reporting & audit exports',
      'Custom compliance report builder',
      'Firm-wide risk heatmap',
      'Bulk staff training assignments',
      'Dedicated onboarding session',
      'Priority support',
    ],
  },
];

export const ONBOARDING_STEPS = [
  { step: 1, title: 'Firm Profile', description: 'Set up your firm details and SRA number' },
  { step: 2, title: 'Staff Directory', description: 'Add your team members and assign roles' },
  { step: 3, title: 'Compliance Policies', description: 'Upload or create your compliance policies' },
  { step: 4, title: 'Training Setup', description: 'Configure training modules for your team' },
  { step: 5, title: 'Email Settings', description: 'Set up automated notifications and chasers' },
];

export const UK_REGULATORY_BODIES = [
  { id: 'sra', name: 'Solicitors Regulation Authority', url: 'https://www.sra.org.uk' },
  { id: 'ico', name: 'Information Commissioner\'s Office', url: 'https://ico.org.uk' },
  { id: 'fca', name: 'Financial Conduct Authority', url: 'https://www.fca.org.uk' },
  { id: 'moj', name: 'Ministry of Justice', url: 'https://www.gov.uk/government/organisations/ministry-of-justice' },
  { id: 'law_society', name: 'The Law Society', url: 'https://www.lawsociety.org.uk' },
];

export const SRA_HANDBOOK_SECTIONS = [
  'Code of Conduct for Solicitors',
  'Code of Conduct for Firms',
  'SRA Accounts Rules',
  'SRA Financial Services (Conduct of Business) Rules',
  'SRA Indemnity Insurance Rules',
  'SRA Standards and Regulations',
];

export const COMPLIANCE_REMINDER_WINDOWS = {
  training_expiry: 30,      // days before training expires
  deadline_warning: 14,     // days before deadline
  review_due: 7,            // days before review due
  policy_review: 30,        // days before policy review due
};

export const TRAINING_EXPIRY_PERIODS: Record<string, number> = {
  gdpr: 365,
  aml: 365,
  fca_handbook: 365,
  conflict_check: 730,
  client_care: 365,
  general_compliance: 365,
};

export const POLICY_CATEGORIES = [
  { value: 'aml', label: 'Anti-Money Laundering' },
  { value: 'gdpr', label: 'GDPR & Data Protection' },
  { value: 'client_care', label: 'Client Care' },
  { value: 'conflict_check', label: 'Conflict of Interest' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
];

export const NOTIFICATION_TYPES = [
  { value: 'alert', label: 'Alert' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'training', label: 'Training' },
  { value: 'system', label: 'System' },
  { value: 'update', label: 'Update' },
];

export const DEFAULT_EMAIL_PREFERENCES = {
  alerts_enabled: true,
  deadline_reminders: true,
  training_reminders: true,
  weekly_summary: true,
  critical_only: false,
};

export const DEFAULT_PAGINATION = {
  page: 1,
  per_page: 20,
};

export const API_RATE_LIMITS = {
  requests_per_minute: 60,
  max_concurrent: 10,
};
