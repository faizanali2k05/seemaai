// User and Authentication types
export type UserRole = 'colp' | 'partner' | 'admin' | 'solicitor' | 'staff';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  firm_id: string;
  firm_name: string;
  avatar?: string;
  last_login?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

// Firm types
export type SubscriptionTier = 'essentials' | 'professional';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';
export type PracticeArea =
  | 'conveyancing'
  | 'litigation'
  | 'corporate'
  | 'employment'
  | 'family'
  | 'probate'
  | 'ip'
  | 'personal_injury'
  | 'immigration'
  | 'other';

export interface Firm {
  id: string;
  name: string;
  sra_number: string;
  subscription_tier: SubscriptionTier;
  practice_areas: PracticeArea[];
  onboarding_status: OnboardingStatus;
  created_at: string;
  updated_at: string;
  address?: string;
  phone?: string;
  website?: string;
}

// Staff types
export interface StaffMember {
  id: string;
  firm_id?: string;
  name: string;
  email: string;
  role: UserRole;
  job_title?: string;
  department?: string;
  start_date?: string;
  status: 'active' | 'inactive' | 'suspended' | string;
  last_training?: string;
  training_progress?: number;
  created_at?: string;
  updated_at?: string;
  // Optional legacy/demo fields
  pqe?: number;
  [key: string]: any;
}

export interface StaffTraining {
  id: string;
  staff_id?: string;
  course_type?: 'gdpr' | 'aml' | 'fca_handbook' | 'conflict_check' | 'client_care' | 'general_compliance' | string;
  status: 'not_started' | 'in_progress' | 'completed' | string;
  completion_date?: string;
  score?: number;
  expiry_date?: string;
  created_at?: string;
  updated_at?: string;
  // Legacy/demo fields
  training_type?: string;
  due_date?: string;
  [key: string]: any;
}

// Compliance types
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ComplianceStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'on_hold';

export interface ComplianceAlert {
  id: string;
  firm_id?: string;
  title: string;
  description?: string;
  risk_level?: RiskLevel;
  // Some callers use `severity` (legacy) instead of risk_level.
  severity?: string;
  status: ComplianceStatus | string;
  category?: string;
  due_date?: string;
  assigned_to?: string;
  assignedTo?: string;
  evidence_items?: string[];
  remediation_plan_id?: string;
  created_at?: string;
  /** Legacy field — same as `created_at`. */
  created?: Date | string;
  updated_at?: string;
  timeline?: Array<{ action: string; timestamp: Date | string; user: string }>;
  [key: string]: any;
}

// Client intake types
export interface ClientIntake {
  id: string;
  firm_id: string;
  client_name: string;
  client_email?: string;
  practice_area: PracticeArea;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  conflict_check_status: 'not_started' | 'in_progress' | 'clear' | 'conflict_found';
  conflict_check_details?: string;
  client_care_letter_sent: boolean;
  created_at: string;
  updated_at: string;
}

// Breach types
export interface BreachReport {
  id: string;
  firm_id: string;
  breach_date: string;
  breach_type: 'data_loss' | 'unauthorized_access' | 'malware' | 'ransomware' | 'other';
  description: string;
  severity: RiskLevel;
  affected_count?: number;
  reported_to_ico: boolean;
  report_reference?: string;
  remediation_steps: string[];
  status: ComplianceStatus;
  created_at: string;
  updated_at: string;
}

// Regulatory types
export interface RegulatoryUpdate {
  id: string;
  title: string;
  description: string;
  effective_date: string;
  regulatory_body: 'sra' | 'fca' | 'ico' | 'moj' | 'other';
  impact_areas: string[];
  action_required: boolean;
  action_deadline?: string;
  source_url?: string;
  created_at: string;
}

// Policy types
export interface PolicyDocument {
  id: string;
  firm_id: string;
  name: string;
  description?: string;
  category: 'aml' | 'gdpr' | 'client_care' | 'conflict_check' | 'general' | 'other';
  content: string;
  version: string;
  last_reviewed?: string;
  review_due?: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

// Deadline types
export interface DeadlineItem {
  id: string;
  firm_id?: string;
  title: string;
  due_date: string;
  category: 'training' | 'report' | 'review' | 'filing' | 'other' | string;
  priority: 'low' | 'medium' | 'high' | 'critical' | string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | string;
  assigned_to?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

// Supervision types
export interface SupervisionSchedule {
  id: string;
  firm_id: string;
  staff_member_id: string;
  supervisor_id: string;
  scheduled_date: string;
  type: 'file_review' | 'performance' | 'compliance' | 'training' | 'general';
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Matter types
export interface MatterChecklist {
  id: string;
  firm_id: string;
  matter_reference: string;
  client_name: string;
  practice_area: PracticeArea;
  checklist_type: 'client_care' | 'conflict_check' | 'file_opening' | 'ongoing_compliance' | 'file_closing';
  items: ChecklistItem[];
  status: 'pending' | 'in_progress' | 'completed';
  completion_date?: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
  completed_by?: string;
  completed_date?: string;
  notes?: string;
}

// Communication types
export interface ChaserLog {
  id: string;
  firm_id: string;
  recipient_email: string;
  subject: string;
  template_type: 'training_reminder' | 'deadline_reminder' | 'report_due' | 'review_reminder' | 'custom';
  status: 'sent' | 'failed' | 'opened' | 'clicked';
  sent_date: string;
  opened_date?: string;
  created_at: string;
}

// Audit and compliance types
export interface AuditTrailEntry {
  id: string;
  firm_id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, any>;
  ip_address?: string;
  timestamp: string;
}

export interface EvidenceItem {
  id: string;
  firm_id: string;
  alert_id?: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  uploaded_date: string;
  description?: string;
}

export interface RemediationPlan {
  id: string;
  firm_id: string;
  alert_id?: string;
  title: string;
  description: string;
  actions: RemediationAction[];
  status: ComplianceStatus;
  target_completion_date: string;
  completion_date?: string;
  created_at: string;
  updated_at: string;
}

export interface RemediationAction {
  id: string;
  task: string;
  owner: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  completion_date?: string;
  notes?: string;
}

// User preferences
export interface EmailSettings {
  id: string;
  user_id: string;
  alerts_enabled: boolean;
  deadline_reminders: boolean;
  training_reminders: boolean;
  weekly_summary: boolean;
  critical_only: boolean;
}

// Regulatory reporting
export interface SRAReturnData {
  id: string;
  firm_id: string;
  reporting_period: string;
  sra_form_type: 'annual_return' | 'special_return' | 'interim_return';
  data: Record<string, any>;
  status: 'draft' | 'submitted' | 'acknowledged' | 'rejected';
  submission_date?: string;
  sra_reference?: string;
  created_at: string;
  updated_at: string;
}

// Notification types
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'alert' | 'deadline' | 'training' | 'system' | 'update';
  read: boolean;
  action_url?: string;
  created_at: string;
  read_at?: string;
}

// Alert type aliases (for convenience)
export type Alert = ComplianceAlert;
export type AlertStatus = ComplianceStatus;

// API Response wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
  status?: number;
}

// Login/Auth request types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}
