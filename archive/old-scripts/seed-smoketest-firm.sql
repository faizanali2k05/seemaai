-- Seed realistic data for the smoketest firm so the UI has something to act on.
--
-- Firm: 'Smoke Test Firm', id 3c041e01-9d26-429e-b22c-fcb4e852500d
-- Run as the seema (superuser) so RLS doesn't get in the way of the seed.
--
-- Idempotent: ON CONFLICT DO NOTHING + WHERE NOT EXISTS guards.

\set firm_id '3c041e01-9d26-429e-b22c-fcb4e852500d'
\set staff_jane '11111111-aaaa-bbbb-cccc-100000000001'
\set staff_priya '11111111-aaaa-bbbb-cccc-100000000002'
\set staff_marcus '11111111-aaaa-bbbb-cccc-100000000003'
\set staff_owen '11111111-aaaa-bbbb-cccc-100000000004'

-- ─── Staff members ──────────────────────────────────────────────
INSERT INTO staff_members (id, firm_id, name, email, role, department, status, pqe, sra_id, start_date, last_training)
VALUES
  (:'staff_jane',  :'firm_id', 'Jane Whitfield',   'jane@smoketest.firm',   'Solicitor (Senior)', 'Litigation', 'active', 12, '604812', '2014-09-01', '2025-11-10'),
  (:'staff_priya', :'firm_id', 'Priya Shah',       'priya@smoketest.firm',  'Solicitor',          'Conveyancing', 'active', 5, '712334', '2020-03-15', '2025-09-22'),
  (:'staff_marcus',:'firm_id', 'Marcus Hollings',  'marcus@smoketest.firm', 'Trainee',            'Family',     'active', 1, '845221', '2024-09-01', '2026-01-08'),
  (:'staff_owen',  :'firm_id', 'Owen Pritchard',   'owen@smoketest.firm',   'Partner',            'Commercial', 'active', 21, '331108', '2003-06-01', '2025-12-01')
ON CONFLICT (id) DO NOTHING;

-- ─── Client intakes (different statuses) ─────────────────────────
INSERT INTO client_intakes (id, firm_id, client_name, client_email, practice_area, status, conflict_check_status, risk_level, risk_score, assigned_to, source_of_funds, pep_screening, sanctions_check, cdd_status, client_phone, client_type, company_name)
VALUES
  ('22222222-aaaa-bbbb-cccc-200000000001', :'firm_id', 'Aldridge & Sons Ltd',      'finance@aldridge.co.uk', 'Commercial',  'approved',    'clear',       'low',    18, :'staff_owen',   'company funds',  'clear', 'clear', 'complete', '020 7946 0123', 'company',    'Aldridge & Sons Ltd'),
  ('22222222-aaaa-bbbb-cccc-200000000002', :'firm_id', 'Helen Roberts',            'helen.r@example.com',     'Family',      'pending',     'pending',     'medium', 45, :'staff_marcus', 'salary',         'clear', 'clear', 'in_progress', '07700 900111',  'individual', NULL),
  ('22222222-aaaa-bbbb-cccc-200000000003', :'firm_id', 'Pemberton Holdings',        'compliance@pemberton.io', 'Commercial',  'pending',     'review',      'high',   72, :'staff_owen',   'investment',     'review','clear','in_progress', '020 7946 0500', 'company',    'Pemberton Holdings Ltd'),
  ('22222222-aaaa-bbbb-cccc-200000000004', :'firm_id', 'Daniel Okafor',             'd.okafor@example.com',    'Conveyancing','approved',    'clear',       'low',    12, :'staff_priya',  'remortgage',     'clear', 'clear','complete',   '07700 900222',  'individual', NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── Matters (different statuses + matter_types) ────────────────
INSERT INTO matters (id, firm_id, client_name, matter_type, reference, status, assigned_to, risk_level, fee_estimate, external_ref, source, title, description, practice_area, open_date)
VALUES
  ('33333333-aaaa-bbbb-cccc-300000000001', :'firm_id', 'Aldridge & Sons Ltd', 'commercial',  'COM-2026-001', 'open',   :'staff_owen',   'low',    18000, NULL, 'manual', 'Aldridge — supply contract review',     'Reviewing supply chain contracts for compliance.', 'Commercial',  '2026-04-12'),
  ('33333333-aaaa-bbbb-cccc-300000000002', :'firm_id', 'Helen Roberts',       'family',      'FAM-2026-014', 'open',   :'staff_marcus', 'medium',  4500, NULL, 'manual', 'Roberts — divorce proceedings',         'Initial advice + financial disclosure prep.',     'Family',      '2026-04-18'),
  ('33333333-aaaa-bbbb-cccc-300000000003', :'firm_id', 'Daniel Okafor',       'conveyancing','CONV-2026-077','open',   :'staff_priya',  'low',     1800, NULL, 'manual', 'Okafor — remortgage 14 Birch Lane',     'Remortgage from Halifax to Nationwide.',          'Conveyancing','2026-05-02'),
  ('33333333-aaaa-bbbb-cccc-300000000004', :'firm_id', 'Hartley Estates',     'litigation',  'LIT-2025-203', 'closed', :'staff_jane',   'high',   42000, NULL, 'manual', 'Hartley v Greenfield — boundary dispute', 'Settled at mediation, Dec 2025.',                'Litigation',  '2025-06-04'),
  ('33333333-aaaa-bbbb-cccc-300000000005', :'firm_id', 'Pemberton Holdings',  'commercial',  'COM-2026-009', 'open',   :'staff_owen',   'high',   75000, NULL, 'manual', 'Pemberton — Series B investor diligence', 'Cross-border due diligence for investment.',      'Commercial',  '2026-04-25')
ON CONFLICT (id) DO NOTHING;

-- ─── Compliance alerts (different severities + statuses) ────────
INSERT INTO compliance_alerts (id, firm_id, alert_type, severity, title, description, action_required, status, regulation_ref)
VALUES
  ('44444444-aaaa-bbbb-cccc-400000000001', :'firm_id', 'overdue_training', 'high',     'AML Refresher overdue for 1 staff member', 'Marcus Hollings has not completed the 2026 AML Refresher (due 30 Apr 2026).', 'Assign and complete training; update record.', 'open',         'SRA AML Guidance 2024'),
  ('44444444-aaaa-bbbb-cccc-400000000002', :'firm_id', 'policy_review_due','medium',   'Anti-bribery policy review overdue',       'Last reviewed 14 months ago; SRA recommends annual review.',                  'Review policy + reissue to all staff.',         'open',         'SRA Code of Conduct §7.3'),
  ('44444444-aaaa-bbbb-cccc-400000000003', :'firm_id', 'deadline_approaching','critical','SAR review window closes in 2 days',     'Suspicious activity report from 03 May 2026 needs MLRO sign-off by 14 May.',  'MLRO to review and sign off.',                  'open',         'POCA 2002 §330'),
  ('44444444-aaaa-bbbb-cccc-400000000004', :'firm_id', 'cpd_shortfall',    'low',      'CPD hours below target for 1 fee earner', 'Priya Shah at 12 hours; SRA recommends 16 by year-end.',                       'Schedule additional CPD before 30 Sept.',       'open',         'SRA CPD Guidance')
ON CONFLICT (id) DO NOTHING;

-- ─── Breach report (with ICO deadline) ───────────────────────────
INSERT INTO breach_reports (id, firm_id, title, description, breach_type, severity, status, reported_date, ico_deadline, notification_status, affected_records, root_cause)
VALUES
  ('55555555-aaaa-bbbb-cccc-500000000001', :'firm_id', 'Misdirected client email — 11 May 2026', 'Email containing a draft witness statement sent to wrong recipient (similar surname).', 'data', 'medium', 'open', '2026-05-11 10:24:00', '2026-05-14 10:24:00', 'pending', 1, 'Outlook autocomplete; sender did not verify recipient before sending.')
ON CONFLICT (id) DO NOTHING;

-- ─── Conflict checks + parties ───────────────────────────────────
INSERT INTO conflict_parties (id, firm_id, party_name, party_type, date_added)
VALUES
  ('66666666-aaaa-bbbb-cccc-600000000001', :'firm_id', 'Greenfield Properties Ltd', 'opposing', '2025-06-04'),
  ('66666666-aaaa-bbbb-cccc-600000000002', :'firm_id', 'Aldridge & Sons Ltd',       'client',   '2026-04-12'),
  ('66666666-aaaa-bbbb-cccc-600000000003', :'firm_id', 'Pemberton Holdings Ltd',    'client',   '2026-04-25')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conflict_checks (id, firm_id, client_name, matter_type, parties, status, conflict_type, checked_by)
VALUES
  ('77777777-aaaa-bbbb-cccc-700000000001', :'firm_id', 'Helen Roberts',        'family',     '["Helen Roberts","Marcus Roberts"]',                'clear',       NULL,           :'staff_marcus'),
  ('77777777-aaaa-bbbb-cccc-700000000002', :'firm_id', 'Pemberton Holdings',   'commercial', '["Pemberton Holdings","Aldridge & Sons Ltd"]',     'review',     'related_parties', :'staff_owen')
ON CONFLICT (id) DO NOTHING;

-- ─── Undertakings ────────────────────────────────────────────────
INSERT INTO undertakings (id, firm_id, description, matter_ref, given_to, given_by, given_date, due_date, status)
VALUES
  ('88888888-aaaa-bbbb-cccc-800000000001', :'firm_id', 'Hold £50,000 to order pending exchange of contracts on 14 Birch Lane.', 'CONV-2026-077', 'Nationwide Building Society', 'Priya Shah',    '2026-05-02', '2026-05-30', 'active'),
  ('88888888-aaaa-bbbb-cccc-800000000002', :'firm_id', 'Discharge existing mortgage on completion (Halifax #1234567).',           'CONV-2026-077', 'Halifax',                     'Priya Shah',    '2026-05-02', '2026-05-30', 'active')
ON CONFLICT (id) DO NOTHING;

-- ─── Complaints ──────────────────────────────────────────────────
INSERT INTO complaints (id, firm_id, complainant_name, complainant_type, category, description, priority, status, assigned_to, opened_date)
VALUES
  ('99999999-aaaa-bbbb-cccc-900000000001', :'firm_id', 'Sandra Beecham', 'client',    'service_quality', 'Slow response to email queries during conveyancing transaction.', 'medium', 'open',     :'staff_priya', '2026-04-28'),
  ('99999999-aaaa-bbbb-cccc-900000000002', :'firm_id', 'Hartley Estates','client',    'fees',           'Disputes time-recording on closed litigation matter.',           'high',   'in_review',:'staff_jane',  '2026-04-15')
ON CONFLICT (id) DO NOTHING;

-- ─── Deadlines ───────────────────────────────────────────────────
INSERT INTO deadlines (id, firm_id, title, due_date, priority, status, category, assigned_to)
VALUES
  ('aaaaaaaa-aaaa-bbbb-cccc-a00000000001', :'firm_id', 'File defence — Pemberton v Aldridge',            '2026-05-20 16:00:00', 'critical', 'pending', 'litigation',       :'staff_jane'),
  ('aaaaaaaa-aaaa-bbbb-cccc-a00000000002', :'firm_id', 'CDD refresh: Aldridge & Sons Ltd',                '2026-06-12 17:00:00', 'medium',   'pending', 'aml',              :'staff_owen'),
  ('aaaaaaaa-aaaa-bbbb-cccc-a00000000003', :'firm_id', 'Annual SRA return submission',                    '2026-10-31 23:59:00', 'high',     'pending', 'regulatory',       :'staff_owen'),
  ('aaaaaaaa-aaaa-bbbb-cccc-a00000000004', :'firm_id', 'Indemnity insurance renewal',                     '2026-09-30 17:00:00', 'high',     'pending', 'insurance',        :'staff_owen')
ON CONFLICT (id) DO NOTHING;

-- ─── Staff training records ─────────────────────────────────────
INSERT INTO staff_training (id, firm_id, staff_id, course_name, provider, status, due_date, completed_date, certificate_ref, cpd_hours)
VALUES
  ('bbbbbbbb-aaaa-bbbb-cccc-b00000000001', :'firm_id', :'staff_jane',   'AML Refresher 2026',          'Central Law Training', 'completed', '2026-04-30', '2026-04-12', 'CLT-2026-AML-J1', 4),
  ('bbbbbbbb-aaaa-bbbb-cccc-b00000000002', :'firm_id', :'staff_priya',  'AML Refresher 2026',          'Central Law Training', 'completed', '2026-04-30', '2026-04-22', 'CLT-2026-AML-P1', 4),
  ('bbbbbbbb-aaaa-bbbb-cccc-b00000000003', :'firm_id', :'staff_marcus', 'AML Refresher 2026',          'Central Law Training', 'pending',   '2026-04-30',  NULL,         NULL,              NULL),
  ('bbbbbbbb-aaaa-bbbb-cccc-b00000000004', :'firm_id', :'staff_owen',   'GDPR for Solicitors 2026',    'Datalaw',              'completed', '2026-06-30', '2026-03-08', 'DAT-2026-GDPR-O1',2),
  ('bbbbbbbb-aaaa-bbbb-cccc-b00000000005', :'firm_id', :'staff_priya',  'CPR Updates Q2 2026',         'CLT',                  'pending',   '2026-06-15',  NULL,         NULL,              NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── Policy documents ───────────────────────────────────────────
INSERT INTO policy_documents (id, firm_id, title, category, status, version, content, last_reviewed, next_review, owner)
VALUES
  ('cccccccc-aaaa-bbbb-cccc-c00000000001', :'firm_id', 'Anti-Money Laundering Policy',   'aml',         'published', '3.1', 'Full policy text omitted for brevity.', '2025-04-01', '2026-04-01', :'staff_owen'),
  ('cccccccc-aaaa-bbbb-cccc-c00000000002', :'firm_id', 'Anti-Bribery & Corruption Policy','ethics',     'published', '2.0', 'Full policy text omitted for brevity.', '2025-03-15', '2026-03-15', :'staff_owen'),
  ('cccccccc-aaaa-bbbb-cccc-c00000000003', :'firm_id', 'GDPR & Data Protection Policy',  'data',        'published', '4.2', 'Full policy text omitted for brevity.', '2025-11-20', '2026-11-20', :'staff_owen')
ON CONFLICT (id) DO NOTHING;

-- ─── Client / Office accounts ───────────────────────────────────
INSERT INTO client_accounts (id, firm_id, account_name, account_type, balance, status, bank_name, account_number, sort_code)
VALUES
  ('dddddddd-aaaa-bbbb-cccc-d00000000001', :'firm_id', 'Smoke Test Firm — Client Account', 'client', 245678.50, 'active', 'Lloyds',  '12345678', '20-00-01'),
  ('dddddddd-aaaa-bbbb-cccc-d00000000002', :'firm_id', 'Smoke Test Firm — Office Account', 'office',  18432.10, 'active', 'Lloyds',  '12345679', '20-00-01')
ON CONFLICT (id) DO NOTHING;

-- ─── Confirm row counts ────────────────────────────────────────
\echo ''
\echo '=== Seed complete. Row counts for smoketest firm: ==='
SELECT 'staff_members'        AS table_name, count(*) FROM staff_members        WHERE firm_id = :'firm_id'
UNION ALL SELECT 'client_intakes',     count(*) FROM client_intakes      WHERE firm_id = :'firm_id'
UNION ALL SELECT 'matters',            count(*) FROM matters             WHERE firm_id = :'firm_id'
UNION ALL SELECT 'compliance_alerts',  count(*) FROM compliance_alerts   WHERE firm_id = :'firm_id'
UNION ALL SELECT 'breach_reports',     count(*) FROM breach_reports      WHERE firm_id = :'firm_id'
UNION ALL SELECT 'conflict_parties',   count(*) FROM conflict_parties    WHERE firm_id = :'firm_id'
UNION ALL SELECT 'conflict_checks',    count(*) FROM conflict_checks     WHERE firm_id = :'firm_id'
UNION ALL SELECT 'undertakings',       count(*) FROM undertakings        WHERE firm_id = :'firm_id'
UNION ALL SELECT 'complaints',         count(*) FROM complaints          WHERE firm_id = :'firm_id'
UNION ALL SELECT 'deadlines',          count(*) FROM deadlines           WHERE firm_id = :'firm_id'
UNION ALL SELECT 'staff_training',     count(*) FROM staff_training      WHERE firm_id = :'firm_id'
UNION ALL SELECT 'policy_documents',   count(*) FROM policy_documents    WHERE firm_id = :'firm_id'
UNION ALL SELECT 'client_accounts',    count(*) FROM client_accounts     WHERE firm_id = :'firm_id';
