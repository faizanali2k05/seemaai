# Seema Frontend - Exhaustive API Endpoints Specification

## Overview
This document contains all API calls made by the Seema web frontend, organized by endpoint path. The API client base URL is `http://localhost:8000/api` with Bearer token authentication.

---

## AUTHENTICATION ENDPOINTS

### POST /auth/login
**Location**: `src/app/login/page.tsx`, `src/lib/stores/auth-store.ts`

**Request Body**:
```typescript
{
  email: string;
  password: string;
}
```

**Response**:
```typescript
{
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'colp' | 'partner' | 'admin' | 'solicitor' | 'staff';
    firm_id: string;
    firm_name: string;
    avatar?: string;
    last_login?: string;
    onboarding_status?: 'not_started' | 'in_progress' | 'completed';
  };
}
```

**Used For**: Initial user authentication and session creation

---

### POST /auth/register
**Location**: `src/app/register/page.tsx`

**Request Body**:
```typescript
{
  firm_name: string;
  sra_number: string;
  full_name: string;
  email: string;
  password: string;
  phone?: string | null;
}
```

**Response**:
```typescript
{
  access_token: string;
  refresh_token: string;
  user: User;
}
```

**Used For**: Firm registration and initial admin account creation

---

### POST /auth/refresh
**Location**: `src/lib/api.ts`, `src/lib/stores/auth-store.ts`

**Request Body**:
```typescript
{
  refresh_token: string;
}
```

**Response**:
```typescript
{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}
```

**Used For**: Token refresh when access token expires

---

### POST /auth/change-password
**Location**: `src/app/security/page.tsx`, `src/app/settings/page.tsx`

**Request Body**:
```typescript
{
  current_password: string;
  new_password: string;
  confirm_password: string;
}
```

**Response**: `{ success: boolean; message?: string }`

**Used For**: User password changes

---

### GET /auth/sessions
**Location**: `src/app/security/page.tsx`, `src/app/settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  last_activity: string;
}>
```

**Used For**: Listing active user sessions

---

### POST /auth/sessions/${sessionId}/revoke
**Location**: `src/app/security/page.tsx`, `src/app/settings/page.tsx`

**Response**: `{ success: boolean; message?: string }`

**Used For**: Revoking specific user sessions

---

## ADMIN / FIRM MANAGEMENT ENDPOINTS

### GET /admin/firm-settings
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  firm_id: string;
  name: string;
  sra_number: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise';
  practice_areas: Array<'conveyancing' | 'litigation' | 'corporate' | 'employment' | 'family' | 'probate' | 'ip' | 'personal_injury' | 'immigration' | 'other'>;
  address?: string;
  phone?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}
```

**Used For**: Displaying firm settings and information

---

### PUT /admin/firm-settings
**Location**: `src/app/settings/page.tsx`

**Request Body**: Partial firm settings (any updateable fields)

**Response**: Updated firm settings

**Used For**: Updating firm profile information

---

### GET /admin/users
**Location**: `src/app/user-management/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  email: string;
  role: 'colp' | 'partner' | 'admin' | 'solicitor' | 'staff';
  is_active: boolean;
  last_login?: string;
  created_at: string;
}>
```

**Used For**: Listing all firm users

---

### POST /admin/users
**Location**: `src/app/user-management/page.tsx`

**Request Body**:
```typescript
{
  email: string;
  password: string;
  role: string;
}
```

**Response**: `{ id: string; email: string; ... }`

**Used For**: Creating new user accounts

---

### PUT /admin/users/${userId}
**Location**: `src/app/user-management/page.tsx`

**Request Body**:
```typescript
{
  role?: string;
  is_active?: boolean;
}
```

**Response**: Updated user object

**Used For**: Updating user roles and active status

---

### DELETE /admin/users/${userId}
**Location**: `src/app/user-management/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Deleting user accounts

---

### GET /admin/preferences
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  user_id: string;
  theme?: 'light' | 'dark';
  language?: string;
  timezone?: string;
  [key: string]: any;
}
```

**Used For**: Retrieving user preferences

---

### PUT /admin/preferences
**Location**: `src/app/settings/page.tsx`

**Request Body**: Preference updates

**Response**: Updated preferences

**Used For**: Saving user preferences

---

### GET /admin/notification-preferences
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  id: string;
  user_id: string;
  alerts_enabled: boolean;
  deadline_reminders: boolean;
  training_reminders: boolean;
  weekly_summary: boolean;
  critical_only: boolean;
}
```

**Used For**: Retrieving notification settings

---

### PUT /admin/notification-preferences
**Location**: `src/app/settings/page.tsx`

**Request Body**: Notification preference updates

**Response**: Updated notification preferences

**Used For**: Updating notification settings

---

### GET /admin/import-logs
**Location**: `src/app/data-management/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rows_imported: number;
  rows_failed: number;
  errors?: Array<{row: number; error: string}>;
  created_at: string;
}>
```

**Used For**: Displaying data import history

---

### POST /admin/import (generic)
**Location**: `src/app/data-management/page.tsx`

**Endpoints**:
- `/admin/import/alerts`
- `/admin/import/staff`
- `/admin/import/compliance-items`

**Request Body**:
```typescript
{
  rows: Array<Record<string, any>>;
  file_name: string;
}
```

**Response**:
```typescript
{
  id: string;
  file_name: string;
  status: string;
  rows_imported: number;
  rows_failed: number;
  errors?: Array<{row: number; error: string}>;
}
```

**Used For**: Bulk importing data (alerts, staff, compliance items)

---

### POST /admin/clear-demo-data
**Location**: `src/app/data-management/page.tsx`

**Request Body**: `{}`

**Response**: `{ success: boolean; message?: string }`

**Used For**: Clearing demo data from the system

---

### GET /admin/email-settings
**Location**: `src/app/email-settings/page.tsx`

**Response**:
```typescript
{
  id: string;
  firm_id: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  from_email: string;
  from_name?: string;
}
```

**Used For**: Retrieving email configuration

---

### POST /admin/email-settings
**Location**: `src/app/email-settings/page.tsx`

**Request Body**:
```typescript
{
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  from_email?: string;
  from_name?: string;
}
```

**Response**: Updated email settings

**Used For**: Configuring email/SMTP settings

---

### GET /admin/email-queue
**Location**: `src/app/email-settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  recipient: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  created_at: string;
}>
```

**Used For**: Listing queued emails

---

### GET /admin/email-queue/stats
**Location**: `src/app/email-settings/page.tsx`

**Response**:
```typescript
{
  total: number;
  pending: number;
  sent: number;
  failed: number;
}
```

**Used For**: Getting email queue statistics

---

### POST /admin/email-queue/send-all
**Location**: `src/app/email-settings/page.tsx`

**Response**: `{ sent: number; failed: number }`

**Used For**: Sending all pending emails

---

### POST /admin/email-queue/${emailId}/send
**Location**: `src/app/email-settings/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Sending individual queued email

---

### POST /admin/email/test
**Location**: `src/app/email-settings/page.tsx`

**Request Body**:
```typescript
{
  recipient: string;
  subject: string;
}
```

**Response**: `{ success: boolean; message?: string }`

**Used For**: Sending test email to verify SMTP configuration

---

### GET /admin/email-templates
**Location**: `src/app/email-settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  name: string;
  subject: string;
  body: string;
  variables?: Array<string>;
}>
```

**Used For**: Listing available email templates

---

### POST /admin/email/auto-chase
**Location**: `src/app/email-settings/page.tsx`

**Request Body**:
```typescript
{
  training_ids?: Array<string>;
  review_ids?: Array<string>;
}
```

**Response**: `{ sent: number }`

**Used For**: Sending automatic chase/reminder emails

---

## BILLING ENDPOINTS

### GET /billing/subscription
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  subscription_id: string;
  tier: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'cancelled' | 'suspended';
  current_period_start: string;
  current_period_end: string;
  amount: number;
  currency: string;
}
```

**Used For**: Displaying current subscription info

---

### GET /billing/history
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  invoice_url?: string;
}>
```

**Used For**: Displaying billing history

---

### GET /billing/payment-methods
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  type: string;
  last_four: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}>
```

**Used For**: Listing saved payment methods

---

### POST /billing/setup-intent
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  client_secret: string;
  setup_intent_id: string;
}
```

**Used For**: Creating Stripe setup intent for adding payment method

---

### POST /billing/payment-methods/${pmId}/default
**Location**: `src/app/settings/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Setting a payment method as default

---

### DELETE /billing/payment-methods/${pmId}
**Location**: `src/app/settings/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Deleting a saved payment method

---

## COMPLIANCE ENDPOINTS

### GET /compliance/alerts
**Location**: `src/app/alerts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  title: string;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'resolved' | 'closed' | 'on_hold';
  description: string;
  case_id?: string;
  acknowledged_by?: string;
  resolved_by?: string;
  created_at: string;
}>
```

**Used For**: Listing all compliance alerts

---

### POST /compliance/alerts/${id}/acknowledge
**Location**: `src/app/alerts/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Acknowledging an alert

---

### POST /compliance/alerts/${id}/resolve
**Location**: `src/app/alerts/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Resolving an alert

---

### POST /compliance/alerts/${id}/escalate
**Location**: `src/app/alerts/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Escalating an alert

---

### GET /compliance/checks
**Location**: `src/app/compliance-scan/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  check_name: string;
  check_type: string;
  title: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  last_run?: string;
  details?: string;
}>
```

**Used For**: Listing compliance checks

---

### GET /compliance/risk-scores
**Location**: `src/app/compliance-scan/page.tsx`

**Response**:
```typescript
{
  overall_score: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  last_updated: string;
}
```

**Used For**: Displaying overall risk score

---

### POST /compliance/checks/run
**Location**: `src/app/compliance-scan/page.tsx`

**Response**:
```typescript
{
  status: 'running' | 'completed';
  job_id?: string;
}
```

**Used For**: Triggering compliance check scan

---

### GET /compliance/remediation-plans
**Location**: `src/app/remediation/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  alert_id?: string;
  title: string;
  description: string;
  actions: Array<{
    id: string;
    task: string;
    owner: string;
    due_date: string;
    status: 'pending' | 'in_progress' | 'completed';
    completion_date?: string;
    notes?: string;
  }>;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'on_hold';
  target_completion_date: string;
  completion_date?: string;
  created_at: string;
  updated_at: string;
}>
```

**Used For**: Listing remediation plans

---

### POST /compliance/remediation-plans
**Location**: `src/app/compliance-scan/page.tsx`, `src/app/case-compliance/page.tsx`, `src/app/sra-audit/page.tsx`

**Request Body**:
```typescript
{
  alert_id?: string;
  title: string;
  description: string;
  target_completion_date: string;
  actions?: Array<{
    task: string;
    owner: string;
    due_date: string;
  }>;
}
```

**Response**: New remediation plan object

**Used For**: Creating remediation plans for failed checks

---

### POST /compliance/remediation-steps/${stepId}/complete
**Location**: `src/app/remediation/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Marking remediation step as complete

---

### POST /compliance/remediate
**Location**: `src/app/remediation/page.tsx`

**Request Body**:
```typescript
{
  plan_id: string;
  notes?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Submitting remediation completion

---

### GET /compliance/evidence
**Location**: `src/app/evidence/page.tsx`

**Response**:
```typescript
Array<{
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
}>
```

**Used For**: Listing evidence documents

---

### POST /compliance/evidence
**Location**: `src/app/evidence/page.tsx`

**Request Body**: FormData with file upload

**Response**: Uploaded evidence item object

**Used For**: Uploading evidence files

---

### POST /compliance/evidence/${evidenceId}/verify
**Location**: `src/app/evidence/page.tsx`

**Response**: `{ verified: boolean }`

**Used For**: Verifying evidence document

---

### GET /compliance/evidence/${evidenceId}/download
**Location**: `src/app/evidence/page.tsx`

**Response**: File download

**Used For**: Downloading evidence document

---

### GET /compliance/audit-trail
**Location**: `src/app/audit-trail/page.tsx`, `src/app/settings/page.tsx`

**Query Params**: `?limit=100&offset=0`

**Response**:
```typescript
Array<{
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
}>
```

**Used For**: Displaying audit trail of user actions

---

### GET /compliance/audit-trail/summary
**Location**: `src/app/audit-trail/page.tsx`

**Response**:
```typescript
{
  total_actions: number;
  total_users: number;
  date_range: {start: string; end: string};
  actions_by_type: Record<string, number>;
}
```

**Used For**: Displaying audit trail summary stats

---

## AML ENDPOINTS

### GET /compliance/aml/stats
**Location**: `src/app/aml/page.tsx`

**Response**:
```typescript
{
  cdd_total: number;
  cdd_incomplete: number;
  cdd_verified: number;
  completion_rate: number;
  pep_flagged: number;
  sars_pending: number;
}
```

**Used For**: Displaying AML statistics

---

### GET /compliance/aml/cdd
**Location**: `src/app/aml/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  client_name: string;
  client_type: string;
  cdd_level: string;
  risk_level: 'low' | 'medium' | 'high' | 'very_high';
  id_verified: boolean;
  address_verified: boolean;
  sof_verified: boolean;
  status: 'incomplete' | 'pending_review' | 'verified' | 'expired';
  nationality?: string;
  country_of_residence?: string;
  date_of_birth?: string;
  company_number?: string;
  created_at: string;
  updated_at: string;
}>
```

**Used For**: Listing customer due diligence records

---

### POST /compliance/aml/cdd
**Location**: `src/app/aml/page.tsx`

**Request Body**:
```typescript
{
  client_name: string;
  client_type: string;
  nationality?: string;
  country_of_residence?: string;
  date_of_birth?: string;
  company_number?: string;
}
```

**Response**: New CDD record

**Used For**: Creating CDD record

---

### GET /compliance/aml/cdd/${id}
**Location**: `src/app/aml/page.tsx`

**Response**:
```typescript
{
  ...CDDRecord,
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
```

**Used For**: Fetching detailed CDD record with screening results

---

### POST /compliance/aml/cdd/${cddId}/verify
**Location**: `src/app/aml/page.tsx`

**Response**: `{ verified: boolean }`

**Used For**: Marking CDD as verified

---

### POST /compliance/aml/pep-screening
**Location**: `src/app/aml/page.tsx`

**Request Body**:
```typescript
{
  cdd_id: string;
}
```

**Response**: `{ status: 'started' | 'completed' }`

**Used For**: Initiating PEP screening for CDD

---

### POST /compliance/aml/sanctions-check
**Location**: `src/app/aml/page.tsx`

**Request Body**:
```typescript
{
  cdd_id: string;
}
```

**Response**: `{ status: 'started' | 'completed' }`

**Used For**: Running sanctions check for CDD

---

### GET /compliance/aml/sar
**Location**: `src/app/aml/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  client_name: string;
  matter_ref: string;
  suspicion_type: string;
  amount: number;
  report_date: string;
  mlro_decision?: string;
  nca_filed: boolean;
  status: 'draft' | 'pending_mlro' | 'filed' | 'rejected' | 'closed';
  grounds_for_suspicion?: string;
  transaction_details?: string;
}>
```

**Used For**: Listing suspicious activity reports

---

### POST /compliance/aml/sar
**Location**: `src/app/aml/page.tsx`

**Request Body**:
```typescript
{
  client_name: string;
  matter_ref: string;
  suspicion_type: string;
  grounds_for_suspicion: string;
  transaction_details?: string;
  amount_involved?: number;
}
```

**Response**: New SAR record

**Used For**: Creating suspicious activity report

---

### POST /compliance/aml/sar/${sarId}/mlro-decision
**Location**: `src/app/aml/page.tsx`

**Request Body**:
```typescript
{
  decision: 'file_sar' | 'reject' | 'no_action';
  reasoning: string;
  nca_reference?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Recording MLRO decision on SAR

---

## ACCOUNTS & RECONCILIATION ENDPOINTS

### GET /compliance/accounts/stats
**Location**: `src/app/accounts/page.tsx`

**Response**:
```typescript
{
  total_accounts: number;
  active_accounts: number;
  total_client_money: number;
  residual_balances: number;
  reconciliation_overdue: number;
}
```

**Used For**: Displaying account statistics

---

### GET /compliance/accounts
**Location**: `src/app/accounts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  client_name: string;
  matter_ref: string;
  balance: number;
  status: 'active' | 'dormant' | 'closed';
  residual: boolean;
  last_reconciled: string | null;
  next_recon_due: string | null;
}>
```

**Used For**: Listing client accounts

---

### POST /compliance/accounts
**Location**: `src/app/accounts/page.tsx`

**Request Body**:
```typescript
{
  client_name: string;
  matter_ref: string;
  fee_earner_id?: string;
}
```

**Response**: New account object

**Used For**: Opening new client account

---

### GET /compliance/accounts/${accountId}/transactions
**Location**: `src/app/accounts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  account_id: string;
  transaction_type: 'receipt' | 'payment' | 'transfer_in' | 'transfer_out' | 'interest' | 'refund';
  amount: number;
  direction: 'in' | 'out';
  description: string;
  payer_payee: string;
  reference: string;
  payment_method: string;
  withdrawal_reason?: string;
  bill_reference?: string;
  created_at: string;
}>
```

**Used For**: Listing transactions on account

---

### POST /compliance/accounts/transactions
**Location**: `src/app/accounts/page.tsx`

**Request Body**:
```typescript
{
  account_id: string;
  transaction_type: 'receipt' | 'payment' | 'transfer_in' | 'transfer_out' | 'interest' | 'refund';
  amount: number;
  direction: 'in' | 'out';
  description: string;
  payer_payee: string;
  reference: string;
  payment_method: string;
  withdrawal_reason?: string;
  bill_reference?: string;
}
```

**Response**: New transaction object

**Used For**: Recording client account transaction

---

### GET /compliance/accounts/reconciliations
**Location**: `src/app/accounts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  client_ledger_total: number;
  bank_statement_total: number;
  difference: number;
  period_start: string;
  period_end: string;
  status: 'reconciled' | 'pending' | 'failed';
  created_at: string;
  cofa_signed_at?: string;
  cofa_signed_by?: string;
}>
```

**Used For**: Listing account reconciliations

---

### POST /compliance/accounts/reconciliations
**Location**: `src/app/accounts/page.tsx`

**Request Body**:
```typescript
{
  client_ledger_total: number;
  bank_statement_total: number;
  period_start: string;
  period_end: string;
}
```

**Response**: New reconciliation object

**Used For**: Recording account reconciliation

---

### POST /compliance/accounts/reconciliations/${reconId}/cofa-signoff
**Location**: `src/app/accounts/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Recording COFA sign-off on reconciliation

---

## CONFLICTS OF INTEREST ENDPOINTS

### GET /compliance/conflicts/stats
**Location**: `src/app/conflicts/page.tsx`

**Response**:
```typescript
{
  total_checks: number;
  passed: number;
  failed: number;
  pending: number;
  check_rate: number;
}
```

**Used For**: Displaying conflict check statistics

---

### GET /compliance/conflicts
**Location**: `src/app/conflicts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  matter_reference: string;
  client_name: string;
  opposing_party?: string;
  check_status: 'pass' | 'fail' | 'pending' | 'pending_review';
  conflict_details?: string;
  resolution_notes?: string;
  waiver_obtained: boolean;
  check_date: string;
  resolved_by?: string;
  resolved_date?: string;
}>
```

**Used For**: Listing conflict checks

---

### POST /compliance/conflicts/check
**Location**: `src/app/conflicts/page.tsx`

**Request Body**:
```typescript
{
  matter_reference: string;
  client_name: string;
  opposing_party?: string;
  related_parties?: Array<string>;
}
```

**Response**:
```typescript
{
  id: string;
  check_status: 'pass' | 'fail';
  conflict_details?: string;
}
```

**Used For**: Running conflict of interest check

---

### POST /compliance/conflicts/${checkId}/resolve
**Location**: `src/app/conflicts/page.tsx`

**Request Body**:
```typescript
{
  resolution_notes: string;
  waiver_obtained: boolean;
}
```

**Response**: `{ success: boolean }`

**Used For**: Resolving conflict of interest issue

---

### POST /compliance/conflicts/parties
**Location**: `src/app/conflicts/page.tsx`

**Request Body**:
```typescript
{
  party_name: string;
  party_type: string;
}
```

**Response**: New party object

**Used For**: Adding party to conflict check database

---

### GET /compliance/conflicts/parties
**Location**: `src/app/conflicts/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  party_name: string;
  party_type: string;
  created_at: string;
}>
```

**Used For**: Listing all conflict parties

---

## BREACH & INCIDENT REPORTING

### GET /compliance/breach-reports
**Location**: `src/app/breaches/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  breach_date: string;
  breach_type: 'data_loss' | 'unauthorized_access' | 'malware' | 'ransomware' | 'other';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affected_count?: number;
  reported_to_ico: boolean;
  report_reference?: string;
  remediation_steps: Array<string>;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'on_hold';
  created_at: string;
  updated_at: string;
}>
```

**Used For**: Listing data breach reports

---

### POST /compliance/breach-report
**Location**: `src/app/breaches/page.tsx`

**Request Body**:
```typescript
{
  breach_date: string;
  breach_type: 'data_loss' | 'unauthorized_access' | 'malware' | 'ransomware' | 'other';
  title: string;
  description: string;
  severity: string;
  affected_count?: number;
  remediation_steps?: Array<string>;
}
```

**Response**: New breach report

**Used For**: Creating data breach report

---

## COMPLAINTS MANAGEMENT

### GET /compliance/complaints/stats
**Location**: `src/app/complaints/page.tsx`

**Response**:
```typescript
{
  total_complaints: number;
  open_complaints: number;
  resolved_complaints: number;
  average_resolution_time: number;
}
```

**Used For**: Displaying complaints statistics

---

### GET /compliance/complaints
**Location**: `src/app/complaints/page.tsx`

**Query Params**: `?page=1&per_page=20&sort=-created_at&status=open`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  complainant_name: string;
  complainant_email: string;
  complaint_type: string;
  description: string;
  status: 'draft' | 'submitted' | 'acknowledged' | 'under_investigation' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  date_received: string;
  target_resolution_date: string;
  resolution_notes?: string;
  created_at: string;
}>
```

**Used For**: Listing complaints with filtering/pagination

---

### POST /compliance/complaints
**Location**: `src/app/complaints/page.tsx`

**Request Body**:
```typescript
{
  complainant_name: string;
  complainant_email: string;
  complaint_type: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  date_received?: string;
}
```

**Response**: New complaint object

**Used For**: Recording new complaint

---

### POST /compliance/complaints/${complaintId}/acknowledge
**Location**: `src/app/complaints/page.tsx`

**Request Body**: `{}`

**Response**: `{ success: boolean }`

**Used For**: Acknowledging receipt of complaint

---

### POST /compliance/complaints/${complaintId}/resolve
**Location**: `src/app/complaints/page.tsx`

**Request Body**:
```typescript
{
  resolution_notes: string;
  resolution_date?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Marking complaint as resolved

---

## CASE COMPLIANCE

### GET /compliance/case/${caseId}
**Location**: `src/app/case-compliance/page.tsx`

**Response**:
```typescript
{
  id: string;
  matter_reference: string;
  client_name: string;
  practice_area: string;
  compliance_status: string;
  open_issues: Array<string>;
  checks: Array<{
    check_name: string;
    status: 'pass' | 'fail';
  }>;
}
```

**Used For**: Fetching case-specific compliance data

---

## CHASERS & COMMUNICATIONS

### GET /compliance/chasers
**Location**: `src/app/chasers/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  recipient_email: string;
  subject: string;
  template_type: 'training_reminder' | 'deadline_reminder' | 'report_due' | 'review_reminder' | 'custom';
  status: 'sent' | 'failed' | 'opened' | 'clicked';
  sent_date: string;
  opened_date?: string;
  created_at: string;
}>
```

**Used For**: Listing chase/reminder communications

---

### POST /compliance/chasers/send
**Location**: `src/app/chasers/page.tsx`

**Request Body**:
```typescript
{
  chaser_type: string;
  recipient_email: string;
  subject?: string;
  message?: string;
}
```

**Response**: New chaser object

**Used For**: Sending chase reminder

---

### POST /compliance/chasers/${chaserId}/escalate
**Location**: `src/app/chasers/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Escalating unresolved chaser

---

### POST /compliance/chasers/${chaserId}/resend
**Location**: `src/app/chasers/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Resending chase communication

---

### POST /compliance/chasers/${chaserId}/acknowledge
**Location**: `src/app/chasers/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Acknowledging chaser receipt

---

### POST /compliance/briefing/chase-training
**Location**: `src/app/chasers/page.tsx`

**Response**: `{ sent: number }`

**Used For**: Sending training chase to overdue staff

---

### POST /compliance/briefing/chase-review
**Location**: `src/app/chasers/page.tsx`

**Response**: `{ sent: number }`

**Used For**: Sending review chase

---

## STAFF & TRAINING

### GET /compliance/staff
**Location**: `src/app/supervision/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  name: string;
  email: string;
  role: string;
  job_title?: string;
  department?: string;
  start_date?: string;
  status: 'active' | 'inactive' | 'suspended';
  last_training?: string;
  training_progress?: number;
  created_at: string;
  updated_at: string;
}>
```

**Used For**: Listing staff members

---

### POST /staff/complete-training/${id}
**Location**: `src/app/staff-portal/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Marking training as complete

---

### POST /staff/log-action
**Location**: `src/app/staff-portal/page.tsx`

**Request Body**:
```typescript
{
  action: string;
  details?: Record<string, any>;
}
```

**Response**: `{ success: boolean }`

**Used For**: Logging staff action

---

### POST /staff/acknowledge-chaser/${id}
**Location**: `src/app/staff-portal/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Staff acknowledging chase message

---

## SUPERVISION

### GET /compliance/supervision
**Location**: `src/app/supervision/page.tsx`

**Response**:
```typescript
Array<{
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
}>
```

**Used For**: Listing supervision sessions

---

### GET /compliance/supervision/overdue
**Location**: `src/app/supervision/page.tsx`

**Response**: Array of overdue supervision sessions

**Used For**: Listing overdue supervision sessions

---

### POST /compliance/briefing/schedule-supervision
**Location**: `src/app/supervision/page.tsx`

**Request Body**:
```typescript
{
  staff_member_id: string;
  supervisor_id: string;
  scheduled_date: string;
  type: 'file_review' | 'performance' | 'compliance' | 'training' | 'general';
}
```

**Response**: New supervision session

**Used For**: Scheduling supervision session

---

### POST /compliance/supervision/${sessionId}/complete
**Location**: `src/app/supervision/page.tsx`

**Request Body**:
```typescript
{
  notes?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Marking supervision session as complete

---

## MATTERS & CHECKLISTS

### GET /compliance/matters
**Location**: `src/app/matters/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  firm_id: string;
  matter_reference: string;
  client_name: string;
  practice_area: string;
  checklist_type: 'client_care' | 'conflict_check' | 'file_opening' | 'ongoing_compliance' | 'file_closing';
  items: Array<{
    id: string;
    task: string;
    completed: boolean;
    completed_by?: string;
    completed_date?: string;
    notes?: string;
  }>;
  status: 'pending' | 'in_progress' | 'completed';
  completion_date?: string;
  created_at: string;
  updated_at: string;
}>
```

**Used For**: Listing matter checklists

---

### POST /compliance/matters
**Location**: `src/app/matters/page.tsx`

**Request Body**:
```typescript
{
  matter_reference: string;
  client_name: string;
  practice_area: string;
  checklist_type: string;
}
```

**Response**: New matter checklist

**Used For**: Creating matter checklist

---

### POST /compliance/matter-items/${itemId}/complete
**Location**: `src/app/matters/page.tsx`

**Request Body**:
```typescript
{
  notes?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Marking checklist item as complete

---

## CLIENT INTAKE

### GET /compliance/intake
**Location**: Inferred from types

**Response**: Array of intake records

**Used For**: Listing client intakes (if endpoint exists)

---

## POLICIES

### GET /compliance/policies
**Location**: `src/app/policies/page.tsx`

**Response**:
```typescript
Array<{
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
}>
```

**Used For**: Listing policy documents

---

### POST /compliance/generate-policy
**Location**: `src/app/policies/page.tsx`

**Request Body**:
```typescript
{
  policy_type: string;
  practice_areas?: Array<string>;
}
```

**Response**: Generated policy document

**Used For**: Auto-generating policy documents

---

### GET /compliance/policies/${policyId}/versions
**Location**: `src/app/policies/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  version: string;
  created_at: string;
  created_by: string;
}>
```

**Used For**: Listing policy versions

---

## AUDIT REPORTS

### GET /compliance/audit-reports
**Location**: `src/app/audit-report/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  report_type: string;
  title: string;
  status: 'draft' | 'generated' | 'sent';
  generated_at: string;
  generated_by: string;
}>
```

**Used For**: Listing audit reports

---

### POST /compliance/generate-audit-report
**Location**: `src/app/audit-report/page.tsx`

**Request Body**:
```typescript
{
  report_type: string;
  title: string;
  include_sections?: Array<string>;
}
```

**Response**: New audit report

**Used For**: Generating audit report

---

## REGULATORY ENDPOINTS

### GET /compliance/sra-audit
**Location**: `src/app/sra-audit/page.tsx`

**Response**: SRA audit information

**Used For**: Fetching SRA audit data

---

### GET /compliance/sra-return
**Location**: `src/app/sra-return/page.tsx`

**Response**:
```typescript
{
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
```

**Used For**: Fetching SRA return data

---

### POST /compliance/sra-return/export
**Location**: `src/app/sra-return/page.tsx`

**Request Body**:
```typescript
{
  format?: 'json' | 'xml' | 'csv';
}
```

**Response**: Exported SRA return data

**Used For**: Exporting SRA return

---

### POST /compliance/sra-return/export-pdf
**Location**: `src/app/sra-return/page.tsx`

**Response**: PDF file download

**Used For**: Exporting SRA return as PDF

---

## KEY DATES & DEADLINES

### GET /compliance/key-dates/limitation-periods
**Location**: `src/app/key-dates/page.tsx`

**Response**: Array of limitation period records

**Used For**: Fetching limitation period dates

---

### GET /compliance/key-dates/pre-action-protocols
**Location**: `src/app/key-dates/page.tsx`

**Response**: Array of pre-action protocol records

**Used For**: Fetching pre-action protocol dates

---

### POST /compliance/key-dates/limitation
**Location**: `src/app/key-dates/page.tsx`

**Request Body**: Limitation period details

**Response**: New limitation period record

**Used For**: Recording limitation period

---

### POST /compliance/key-dates/cpr
**Location**: `src/app/key-dates/page.tsx`

**Request Body**: CPR deadline details

**Response**: New CPR record

**Used For**: Recording CPR deadline

---

### POST /compliance/key-dates/pre-action
**Location**: `src/app/key-dates/page.tsx`

**Request Body**: Pre-action protocol details

**Response**: New pre-action record

**Used For**: Recording pre-action protocol date

---

## UNDERTAKINGS

### POST /compliance/undertakings
**Location**: `src/app/undertakings/page.tsx`

**Request Body**:
```typescript
{
  matter_reference: string;
  undertaking_text: string;
  due_date: string;
}
```

**Response**: New undertaking

**Used For**: Recording undertaking

---

### POST /compliance/undertakings/${id}/fulfil
**Location**: `src/app/undertakings/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Marking undertaking as fulfilled

---

### POST /compliance/undertakings/${id}/breach
**Location**: `src/app/undertakings/page.tsx`

**Request Body**:
```typescript
{
  breach_reason: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Recording undertaking breach

---

## ONBOARDING ENDPOINTS

### GET /onboarding/sra-lookup/${sraNumber}
**Location**: `src/app/onboarding/page.tsx`

**Response**:
```typescript
{
  sra_number: string;
  firm_name: string;
  status: string;
  address?: string;
}
```

**Used For**: Looking up firm by SRA number during onboarding

---

### POST /onboarding/complete
**Location**: `src/app/onboarding/page.tsx`

**Request Body**:
```typescript
{
  firm_id: string;
  practice_areas: Array<string>;
  subscription_tier?: string;
}
```

**Response**: `{ success: boolean }`

**Used For**: Completing onboarding setup

---

## INTEGRATION ENDPOINTS

### GET /integrations/clio/status
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  connected: boolean;
  last_sync?: string;
  sync_status: 'idle' | 'syncing' | 'error';
}
```

**Used For**: Checking Clio integration status

---

### GET /integrations/clio/auth-url
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
{
  auth_url: string;
}
```

**Used For**: Getting OAuth auth URL for Clio

---

### DELETE /integrations/clio/disconnect
**Location**: `src/app/settings/page.tsx`

**Response**: `{ success: boolean }`

**Used For**: Disconnecting Clio integration

---

### GET /integrations/clio/sync-history
**Location**: `src/app/settings/page.tsx`

**Response**:
```typescript
Array<{
  id: string;
  sync_date: string;
  status: 'success' | 'partial' | 'failed';
  records_synced: number;
  error?: string;
}>
```

**Used For**: Fetching Clio sync history

---

### POST /integrations/clio/sync
**Location**: `src/app/settings/page.tsx`

**Request Body**:
```typescript
{
  sync_type: 'full' | 'incremental' | 'matters' | 'time_entries' | 'tasks';
}
```

**Response**: `{ sync_id: string; status: string }`

**Used For**: Triggering Clio sync

---

## NOTES

1. **Base URL**: All endpoints use `http://localhost:8000/api` (configurable via `NEXT_PUBLIC_API_URL`)
2. **Authentication**: All endpoints (except `/auth/login` and `/auth/register`) require `Authorization: Bearer {accessToken}` header
3. **Response Envelope**: Most endpoints return `{ data: T, message?: string, success?: boolean }`
4. **Error Handling**: Errors return `{ message: string, code?: string, details?: Record<string, any>, status?: number }`
5. **Pagination**: List endpoints support `?page=N&per_page=M` query parameters
6. **Filtering**: Many list endpoints support additional query parameters for filtering (e.g., `?status=open`)
7. **Demos Mode**: When `localStorage.accessToken === 'demo-token'`, all API calls fall back to demo data

---

**Total Endpoints**: 122+ unique endpoint paths across 30+ page modules
