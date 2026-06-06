"""
Firm Compliance Seeder — production-grade SRA regulatory obligations.

Every compliance check and SRA audit item maps to a REAL obligation from:
- SRA Standards and Regulations 2019
- SRA Code of Conduct for Solicitors 2019
- SRA Code of Conduct for Firms 2019
- SRA Accounts Rules 2019
- Money Laundering Regulations 2017
- Proceeds of Crime Act 2002
- Data Protection Act 2018 / UK GDPR
- Civil Procedure Rules 1998
- Limitation Act 1980
- Employment Rights Act 1996
- Equality Act 2010
- Solicitors Act 1974

Called automatically on every firm's first login (idempotent — skips if already seeded).
Also triggered on onboarding completion and via POST /compliance/seed.
"""
import uuid
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from models.compliance import (
    ComplianceAlert, ComplianceCheck, ComplianceTask,
    RiskScore, SRAauditItem,
)


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


def _due(days: int) -> str:
    return (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d")


# ═══════════════════════════════════════════════════════════════
# COMPLIANCE CHECKS — mapped to sidebar workflows
# Each tuple: (check_type, check_name, status, severity,
#               description, regulation_ref, due_days)
# ═══════════════════════════════════════════════════════════════

COMPLIANCE_CHECKS: list[tuple] = [

    # ── Staff & Training (/staff) ──────────────────────────────
    ("AML", "MLRO Appointment",
     "pending", "critical",
     "Firm must appoint a Money Laundering Reporting Officer responsible for receiving internal SARs, "
     "filing external SARs with NCA, maintaining consent regime, and liaison with supervisory authorities.",
     "MLR 2017 Reg 25", 7),

    ("AML", "Staff AML Training — Annual",
     "pending", "critical",
     "All relevant employees must complete annual AML training covering: money laundering offences, "
     "firm AML policy, identifying SAR triggers, tipping off consequences, and record keeping requirements.",
     "MLR 2017 Reg 24", 365),

    ("Staff Training", "CPD Compliance Records",
     "pending", "high",
     "All solicitors must maintain continuing professional development records. "
     "Minimum competence must be demonstrated and records kept: name, date, provider, subject, hours.",
     "SRA Competence Statement 2019", 365),

    ("Staff Training", "Supervision Framework",
     "pending", "high",
     "Fee-earners, paralegals, and support staff must be supervised proportionate to their experience. "
     "COLP is responsible. Record: supervision plan, frequency, supervisor name, assessment outcome.",
     "SRA Standards para 2.3-2.5; SRA Code for Firms para 2.2", 30),

    ("Staff Training", "Data Protection Awareness Training",
     "pending", "medium",
     "Staff handling personal data must complete GDPR/DPA 2018 awareness training covering: "
     "lawful bases, data subject rights, breach reporting, and secure data handling.",
     "UK GDPR Article 32; DPA 2018 s.170-171", 365),

    ("Staff Training", "Equality & Diversity Training",
     "pending", "medium",
     "All staff must receive equality and diversity training covering recruitment, service delivery, "
     "promotion practices, and complaint procedures.",
     "Equality Act 2010 s.136-137; SRA Principles 1 & 6", 365),

    # ── Client Intake (/intake) ────────────────────────────────
    ("AML", "Customer Due Diligence — Identity Verification",
     "pending", "critical",
     "Verify client identity before establishing business relationship using: passport, driving licence, "
     "or utility bill. Understand nature and purpose of relationship. Assess risk profile.",
     "MLR 2017 Reg 28(1)-(3)", 1),

    ("AML", "Beneficial Ownership Verification",
     "pending", "critical",
     "Identify and verify the ultimate beneficial owner of any entity client. "
     "Anyone holding >25%% shares/voting rights must be identified. Check Companies House PSC register.",
     "MLR 2017 Reg 28(4)-(6); Reg 5-6", 1),

    ("AML", "Source of Funds Enquiry",
     "pending", "critical",
     "Verify source of funds for property, trust, and significant transactions. "
     "Required documents: bank statements, employment letter, business accounts, or gift letter.",
     "MLR 2017 Reg 28(4); Reg 33 (EDD)", 7),

    ("AML", "PEP and Sanctions Screening",
     "pending", "high",
     "Screen all clients against Politically Exposed Persons lists and HMT sanctions lists. "
     "Enhanced due diligence required for PEPs, their family members, and known close associates.",
     "MLR 2017 Reg 33-35; Sanctions and Anti-Money Laundering Act 2018", 1),

    ("SRA Standards", "Conflict of Interest Check",
     "pending", "critical",
     "Identify conflicts before accepting instructions. Cannot act for both sides in dispute/transaction. "
     "Cannot act for former client against former client in same/related matter. Chinese Walls must be effective.",
     "SRA Code para 6.1-6.5; SRA Code for Firms para 1.13-1.19", 1),

    ("SRA Standards", "Client Care Letter Issued",
     "pending", "high",
     "Inform client in writing about: scope of work, costs basis (hourly/fixed/CFA), billing method, "
     "right to challenge costs (Solicitors Act s.69), complaint procedure, Legal Ombudsman details, and VAT.",
     "SRA Code para 8.1-8.8", 7),

    ("SRA Standards", "Written Costs Estimate",
     "pending", "high",
     "Provide written costs estimate before engagement. Regular updates required if costs likely to exceed estimate. "
     "Explain all outlays (disbursements) separately. Keep costs under review throughout matter.",
     "SRA Code para 8.1-8.4, 8.7", 7),

    ("GDPR", "Privacy Notice at Collection",
     "pending", "medium",
     "Provide privacy notice at point of data collection including: controller identity, purpose, "
     "lawful basis, recipients, retention period, data subject rights, right to complain to ICO.",
     "UK GDPR Articles 13-14", 7),

    # ── Deadlines (/deadlines) ─────────────────────────────────
    ("CPR", "Acknowledgment of Service",
     "pending", "critical",
     "Acknowledge service within 14 days of service of claim form. "
     "Failure: deemed admission; defendant in default.",
     "CPR Part 10.3", 14),

    ("CPR", "Defence Filing",
     "pending", "critical",
     "Serve defence within 14 days of service of particulars (28 days if AoS filed). "
     "Failure: judgment in default entered against defendant.",
     "CPR Part 15.4", 14),

    ("CPR", "Standard Disclosure",
     "pending", "high",
     "Disclose documents within 14 days of case management directions. "
     "Failure: breach of court order; sanctions under CPR Part 3.",
     "CPR Part 31.5, 31.10", 14),

    ("CPR", "Costs Budgeting — Multi-Track",
     "pending", "high",
     "File costs budget as directed (typically 4 weeks after directions) for multi-track cases. "
     "Failure: budget deemed agreed at court-approved figures; caps costs recovery.",
     "CPR Part 3.13-3.18", 28),

    ("CPR", "Appeal Deadline",
     "pending", "critical",
     "File appeal within 21 days of date of decision appealed. "
     "No extension except in exceptional circumstances.",
     "CPR Part 52.12", 21),

    ("CPR", "Pre-Trial Checklist",
     "pending", "high",
     "File pre-trial checklist 8 weeks before trial date. "
     "Failure: case may be struck out.",
     "CPR Part 29.6", 56),

    ("Limitation", "Limitation Period — General",
     "pending", "critical",
     "Track limitation periods per matter type: contract 6 years (s.5), tort 6 years (s.2), "
     "personal injury 3 years (s.11), defamation 1 year (s.4A), deed 12 years (s.8).",
     "Limitation Act 1980 s.2-24", 30),

    ("Employment", "ET1 Filing Deadline",
     "pending", "critical",
     "Employment Tribunal claim must be filed within 3 months less 1 day from effective date of termination. "
     "ACAS Early Conciliation mandatory before filing (pauses the clock).",
     "Employment Rights Act 1996 s.111; ACAS EC Regulations", 90),

    # ── Regulatory Updates (/regulatory) ───────────────────────
    ("Regulatory", "SRA Regulatory Update Review",
     "pending", "high",
     "COLP/COFA must review and acknowledge all SRA regulatory updates. "
     "Assess impact on firm policies and procedures. Update practice where required.",
     "SRA Standards para 7; SRA Code for Firms para 2.5-2.7", 14),

    ("Regulatory", "Impact Assessment — Policy Update",
     "pending", "high",
     "When regulatory change affects firm operations, conduct impact assessment and update "
     "relevant policies within 30 days. Document changes and communicate to affected staff.",
     "SRA Standards para 2.2-2.7; SRA Code for Firms para 2.5", 30),

    # ── Alerts (/alerts) ──────────────────────────────────────
    ("AML", "SAR Filing Protocol",
     "pending", "critical",
     "Suspicious Activity Reports must be filed with NCA via MLRO as soon as practicable "
     "(within 30 calendar days of suspicion). Cannot proceed without NCA consent if required.",
     "POCA 2002 s.330, s.335; MLR 2017 Reg 21", 30),

    ("AML", "Tipping Off Prevention",
     "pending", "critical",
     "Cannot disclose to client or third party that a SAR has been filed or that an investigation "
     "is being considered. Criminal offence: up to 5 years imprisonment.",
     "POCA 2002 s.333A", 1),

    ("GDPR", "Data Breach Notification — ICO",
     "pending", "critical",
     "Notify ICO within 72 hours of becoming aware of personal data breach. "
     "Describe breach, data subjects affected, likely consequences, and measures taken.",
     "UK GDPR Articles 33-34", 1),

    ("Accounts", "Client Account Shortage Reporting",
     "pending", "critical",
     "Any shortage in client account must be reported immediately to COLP/COFA. "
     "Firm must replace shortage from own resources immediately.",
     "SRA Accounts Rules 2019 Rule 6.1, 11.4", 1),

    # ── SRA Audit (/sra-audit) — see SRA_AUDIT_ITEMS below ────

    # ── Remediation (/remediation) ─────────────────────────────
    ("Remediation", "Breach Remediation Protocol",
     "pending", "high",
     "COLP/COFA duty to rectify breaches as soon as reasonably practicable. "
     "Document remediation plan, assign responsibilities, set timeline, evidence completion.",
     "SRA Standards para 1.1-1.2; SRA Standards para 2.7", 14),

    ("Remediation", "Root Cause Analysis",
     "pending", "high",
     "For material breaches, conduct root cause analysis to prevent recurrence. "
     "Update risk register and implement control improvements.",
     "SRA Standards para 7.5; SRA Code for Firms para 2.5", 30),

    # ── Policies (/policies) ──────────────────────────────────
    ("Policies", "AML Policy — Written Procedures",
     "pending", "critical",
     "Firm must maintain written AML policies and procedures covering: CDD, EDD, record keeping, "
     "SAR procedures, staff training requirements, and risk assessment methodology.",
     "MLR 2017 Reg 19-20", 30),

    ("Policies", "Data Protection Policy",
     "pending", "high",
     "Document data protection policy covering: lawful bases, privacy notices, DSAR procedures, "
     "breach response plan, data retention schedule, and DPO/contact details.",
     "UK GDPR Articles 5, 24, 32, 35; DPA 2018", 30),

    ("Policies", "Complaints Handling Policy",
     "pending", "high",
     "Firm complaints procedure must be documented, published, and accessible. "
     "Response deadline: 8 weeks from receipt. Must signpost Legal Ombudsman and SRA.",
     "SRA Code para 8.6; Solicitors Act 1974 s.31A; Legal Services Act 2007 s.112", 30),

    ("Policies", "Supervision Policy",
     "pending", "high",
     "Document supervision arrangements for all fee-earners and support staff. "
     "Define: supervisor allocation, review frequency, file audit procedures, escalation routes.",
     "SRA Standards para 2.3-2.5; SRA Code for Firms para 2.2-2.3", 30),

    ("Policies", "Conflicts of Interest Policy",
     "pending", "high",
     "Written policy covering: conflict identification, screening procedures, Chinese Wall protocols, "
     "waiver conditions, and ongoing monitoring of existing retainers.",
     "SRA Code para 6.1-6.5; SRA Code for Firms para 1.13-1.19", 30),

    ("Policies", "Client Money Handling Policy",
     "pending", "critical",
     "Written procedures for: client money receipt, holding, transfer, and withdrawal. "
     "Cover: dual authorisation, reconciliation schedule, residual balance management.",
     "SRA Accounts Rules 2019 Rules 2-8", 14),

    ("Policies", "Information Security Policy",
     "pending", "high",
     "IT security policy covering: password management, patch management, backup procedures, "
     "encryption standards, incident response, and remote working security.",
     "UK GDPR Article 32; SRA Code para 5.1-5.3", 30),

    # ── Breach Log (/breaches) ─────────────────────────────────
    ("Breach", "Breach Reporting — SRA Notification",
     "pending", "critical",
     "Material breaches must be reported to SRA. COLP/COFA must assess whether breach is reportable "
     "under SRA Standards para 1.2. Report within 14 days of becoming aware.",
     "SRA Standards para 1.2; SRA Handbook — Reportable Events", 14),

    ("Breach", "Data Breach — ICO Notification",
     "pending", "critical",
     "Personal data breaches must be notified to ICO within 72 hours. High-risk breaches "
     "must also be notified to affected data subjects without undue delay.",
     "UK GDPR Articles 33-34", 1),

    ("Breach", "AML Breach — NCA SAR",
     "pending", "critical",
     "If breach involves suspected money laundering or terrorist financing, "
     "file SAR with NCA via MLRO. Cannot proceed without NCA consent.",
     "POCA 2002 s.330; MLR 2017 Reg 21", 1),

    # ── Audit Report (/audit-report) ──────────────────────────
    ("Audit", "Annual Accountant's Report",
     "pending", "critical",
     "Annual accountant's report required if holding or receiving client money. "
     "Must be filed within 6 months of end of accounting period.",
     "SRA Accounts Rules 2019 Rule 12", 180),

    ("Audit", "Annual AML Compliance Review",
     "pending", "critical",
     "Annual review of AML policies, procedures, controls, and risk assessment. "
     "Review by compliance officer or external auditor. Document findings and remediation.",
     "MLR 2017 Reg 18, 21-22", 365),

    ("Audit", "SRA Standards Compliance Review",
     "pending", "high",
     "Annual review of compliance with SRA Standards and Regulations. "
     "COLP to assess all areas: governance, client protection, AML, data protection, accounts.",
     "SRA Standards para 1.1; SRA Code for Firms para 2.5", 365),

    # ── COLP: Chasers (/chasers) ──────────────────────────────
    ("Operational", "Matter Progress Monitoring",
     "pending", "medium",
     "Regular client updates and matter progress monitoring. "
     "Act in accordance with client instructions and keep client informed of material developments.",
     "SRA Code para 1.4, 8.7", 14),

    ("Operational", "Residual Balance Chase",
     "pending", "high",
     "Residual client money balances must be returned promptly after matter completion. "
     "If client uncontactable after reasonable attempts, hold for 6 years then may forfeit.",
     "SRA Accounts Rules 2019 Rule 2.5", 30),

    # ── COLP: Evidence Locker (/evidence) ─────────────────────
    ("Data Management", "Document Retention Compliance",
     "pending", "high",
     "Accounting records: minimum 6 years (SRA Accounts Rules 13.1). "
     "AML/CDD records: 5 years after end of relationship (MLR 2017 Reg 40). "
     "Matter files: 6 years minimum, longer if limitation period applies.",
     "SRA Accounts Rules 13.1; MLR 2017 Reg 40; Limitation Act 1980", 30),

    ("Data Management", "Confidential Data Security",
     "pending", "high",
     "Client information must be kept confidential unless disclosure required by law. "
     "Implement appropriate technical and organisational security measures.",
     "SRA Code para 5.1-5.3; UK GDPR Article 32", 30),

    # ── COLP: Supervision (/supervision) ──────────────────────
    ("Professional Standards", "Supervision Schedule Maintained",
     "pending", "high",
     "Formal supervision schedule for all fee-earners and support staff. "
     "Frequency: proportionate to experience level. Record: plan, meetings, outcomes, actions.",
     "SRA Standards para 2.3-2.5; SRA Code for Firms para 2.2-2.3", 30),

    ("Professional Standards", "File Review Programme",
     "pending", "high",
     "Regular file reviews conducted for all open matters. "
     "COLP or designated supervisor to audit file quality, compliance, and client care.",
     "SRA Code para 1.1; SRA Standards para 7.1-7.6", 30),

    # ── COLP: Matter Checklists (/matters) ────────────────────
    ("Matter Management", "Matter Opening Compliance",
     "pending", "high",
     "All new matters require: conflict check, client care letter, costs estimate, "
     "AML/CDD completion, engagement letter, file reference, and fee-earner allocation.",
     "SRA Code para 1.1-1.4, 6.1-6.5, 8.1-8.8", 7),

    ("Matter Management", "Matter Closure Compliance",
     "pending", "medium",
     "Matter closure requires: final bill, file review, client notification, "
     "return of client documents, archive per retention policy, and residual balance handling.",
     "SRA Code para 8.7; SRA Accounts Rules 2.5; SRA Standards para 7.1", 14),

    # ── COLP: SRA Return (/sra-return) ────────────────────────
    ("SRA Return", "Annual SRA Return",
     "pending", "critical",
     "COLP/COFA must complete and submit annual SRA Return covering: firm governance, finance, "
     "AML compliance, GDPR, complaints, breaches, staff, and practice areas.",
     "SRA Standards para 1.1; SRA Return Requirements", 365),

    ("SRA Return", "Reportable Event Notification",
     "pending", "critical",
     "Material changes must be reported to SRA within 14 days: COLP/COFA changes, "
     "firm name/address changes, practice area changes, PII issues, or material breaches.",
     "SRA Standards para 1.2; SRA Handbook — Reportable Events", 14),

    # ── COLP: Audit Trail (/audit-trail) ──────────────────────
    ("Audit", "Audit Trail System Active",
     "pending", "high",
     "All compliance-relevant actions must be logged with: user, timestamp, action, entity, and details. "
     "Trail must be tamper-evident and retained per data retention policy.",
     "UK GDPR Article 5(1)(a), 32; SRA Standards para 7.1-7.6", 7),

    # ── Tools: Compliance Scan (/compliance-scan) ─────────────
    ("Compliance Scan", "Quarterly Compliance Assessment",
     "pending", "high",
     "COLP to conduct quarterly compliance assessment across all regulatory areas. "
     "Review: SRA Standards, AML controls, GDPR, accounts rules, CPR compliance, and risk register.",
     "SRA Standards para 1.1; MLR 2017 Reg 18; SRA Code for Firms para 2.5", 90),

    # ── Accounts Rules (cross-cutting) ────────────────────────
    ("Accounts", "Client Account Reconciliation — 5 Weekly",
     "pending", "critical",
     "Client account must be reconciled at least every 5 weeks. "
     "Compare client ledger balances with bank statement. Investigate and resolve discrepancies immediately.",
     "SRA Accounts Rules 2019 Rule 8.3", 35),

    ("Accounts", "Client/Office Money Separation",
     "pending", "critical",
     "Client money must be held in a client account separate from office money at all times. "
     "Client account must be at a bank or building society in the UK.",
     "SRA Accounts Rules 2019 Rules 2.1, 3.1", 7),

    ("Accounts", "Dual Authorisation for Transfers",
     "pending", "critical",
     "Client account transfers require dual authorisation: director/partner plus one other "
     "authorised signatory. Single signatory transfers prohibited.",
     "SRA Accounts Rules 2019 Rule 6.1", 7),

    ("Accounts", "Professional Indemnity Insurance",
     "pending", "critical",
     "Valid PII cover must be in place and certificate available for inspection. "
     "Minimum cover per SRA Indemnity Insurance Rules. Renewal: annually.",
     "SRA Indemnity Insurance Rules 2019", 365),

    # ── Conflict of Interest (/conflicts) ─────────────────────
    ("Conflicts", "Conflict Check Procedure",
     "pending", "critical",
     "Firm must have written procedures for identifying and managing conflicts of interest. "
     "Every new matter requires a conflict search before the firm can act. "
     "Own interest conflicts (para 6.1) are absolute — cannot act. "
     "Client conflicts (para 6.2) may be managed with informed consent and safeguards.",
     "SRA Code para 6.1-6.2", 14),

    ("Conflicts", "Conflict Register Maintained",
     "pending", "high",
     "Maintain a central searchable register of all parties across all matters. "
     "Register must include: client names, opposing parties, related parties, witnesses, "
     "beneficial owners, and any other connected persons.",
     "SRA Code para 6.1-6.2", 30),

    ("Conflicts", "Information Barriers Policy",
     "pending", "medium",
     "Where firm acts for multiple parties, effective information barriers (Chinese walls) "
     "must be documented: physical separation, IT access controls, staff awareness, "
     "and supervision arrangements. Written policy required.",
     "SRA Code para 6.2, 6.5", 60),

    # ── AML / CDD (/aml) ─────────────────────────────────────
    ("AML", "CDD Procedures Documented",
     "pending", "critical",
     "Written CDD procedures covering: identification and verification of client identity, "
     "beneficial owner identification, purpose of business relationship, "
     "ongoing monitoring requirements. Must cover simplified, standard, and enhanced CDD.",
     "MLR 2017 Reg 28-29", 14),

    ("AML", "Enhanced Due Diligence Policy",
     "pending", "critical",
     "EDD required for: PEPs and family members (Reg 35), high-risk third countries (Reg 33), "
     "complex/unusual transactions, non-face-to-face relationships. "
     "Must include source of funds and source of wealth verification.",
     "MLR 2017 Reg 33-35", 14),

    ("AML", "PEP Screening Process",
     "pending", "high",
     "All clients and beneficial owners must be screened against PEP databases. "
     "Domestic and foreign PEPs, family members, and close associates. "
     "If PEP identified: senior management approval required before acting.",
     "MLR 2017 Reg 35(5)", 30),

    ("AML", "Sanctions Screening Process",
     "pending", "critical",
     "Screen all clients against UK (HMT), EU, UN, and OFAC sanctions lists. "
     "Acting for a sanctioned person is a criminal offence. "
     "Must screen at onboarding and periodically during relationship.",
     "Sanctions & Anti-Money Laundering Act 2018", 14),

    ("AML", "Source of Funds Verification",
     "pending", "high",
     "For all transactions above £10,000 and all EDD cases, verify source of funds. "
     "Evidence required: bank statements, sale proceeds, gift documentation, "
     "loan agreements. Source of wealth verification for PEPs.",
     "MLR 2017 Reg 28(3)", 30),

    ("AML", "SAR Procedures and MLRO Protocol",
     "pending", "critical",
     "Written procedures for internal SAR reporting: how staff report suspicions to MLRO, "
     "MLRO decision-making framework, NCA filing process, consent regime, "
     "tipping off prohibition training. MLRO must document all decisions.",
     "POCA 2002 s.330, s.333A, s.335", 14),

    ("AML", "Ongoing Monitoring Programme",
     "pending", "high",
     "CDD records must be reviewed periodically: annually for high-risk, "
     "every 3 years for standard risk. Triggered by material changes in "
     "client circumstances or transaction patterns.",
     "MLR 2017 Reg 28(11)", 90),

    # ── Undertakings (/undertakings) ──────────────────────────
    ("Undertakings", "Undertakings Register",
     "pending", "critical",
     "Maintain a central register of all undertakings given and received. "
     "Track: exact wording, given by, given to, date, deadline, conditions, "
     "fulfilment status, financial value. COLP must review regularly.",
     "SRA Code para 1.3", 14),

    ("Undertakings", "Undertaking Approval Process",
     "pending", "high",
     "Establish authority levels for giving undertakings: who can give them, "
     "what value thresholds require partner approval, review before sending. "
     "Breach of undertaking is one of the top reasons for SRA disciplinary action.",
     "SRA Code para 1.3", 30),

    # ── Complaints (/complaints) ──────────────────────────────
    ("Complaints", "Written Complaints Procedure",
     "pending", "critical",
     "Firm must have a written complaints procedure. Must cover: "
     "who handles complaints, acknowledgement within 2 business days, "
     "substantive response within 8 weeks, right to escalate to Legal Ombudsman. "
     "Procedure must be provided to all clients at engagement.",
     "SRA Code para 1.4, Legal Ombudsman Scheme Rules", 14),

    ("Complaints", "Complaints Log and Trend Analysis",
     "pending", "high",
     "Maintain a complaints log with: complainant details, nature, date received, "
     "acknowledgement date, investigator, outcome, root cause, lessons learned. "
     "Analyse trends quarterly. Report statistics in SRA annual return.",
     "SRA Code para 1.4", 30),

    ("Complaints", "Legal Ombudsman Signposting",
     "pending", "medium",
     "All complaint responses must inform the client of their right to escalate "
     "to the Legal Ombudsman if dissatisfied. Time limit: 6 months from final response "
     "or 6 years from the act/omission (1 year from when they should have known).",
     "Legal Ombudsman Scheme Rules 2019", 14),

    # ── Client Accounts (/accounts) ───────────────────────────
    ("Accounts", "Client Account Reconciliation — 5 Weekly",
     "pending", "critical",
     "Client account must be reconciled at least every 5 weeks. "
     "Compare client ledger balances with bank statement. "
     "Investigate and resolve any discrepancy immediately. "
     "COFA must sign off each reconciliation.",
     "SRA Accounts Rules 2019 Rule 8.3", 35),

    ("Accounts", "Client Money Handling Procedure",
     "pending", "critical",
     "Client money must be kept separate from firm money (Rule 2). "
     "Prompt banking: within 1 working day if practical. "
     "No personal cheques into client account. Written authority for transfers.",
     "SRA Accounts Rules 2019 Rules 2-4", 14),

    ("Accounts", "Residual Balance Policy",
     "pending", "high",
     "Residual balances must be returned promptly when matter concludes. "
     "Balances held >30 days after completion require documented reason. "
     "COFA must review all residual balances quarterly.",
     "SRA Accounts Rules 2019 Rule 2.5", 30),

    ("Accounts", "Client Money Interest Policy",
     "pending", "medium",
     "Pay interest on client money where fair and reasonable to do so. "
     "Written policy stating when interest is paid, how calculated, "
     "and minimum threshold. Policy provided to clients on engagement.",
     "SRA Accounts Rules 2019 Rule 7", 60),

    ("Accounts", "Permitted Withdrawals Only",
     "pending", "critical",
     "Only permitted withdrawals from client account: properly billed costs, "
     "disbursements, money properly required for payment on client behalf, "
     "transfer of residual balance. All withdrawals must be authorised.",
     "SRA Accounts Rules 2019 Rule 5", 14),

    ("Accounts", "Accountant's Report",
     "pending", "high",
     "Deliver an accountant's report to the SRA within 6 months of the end of "
     "the accounting period if the firm held or received client money. "
     "Report must be prepared by a reporting accountant.",
     "SRA Accounts Rules 2019 Rule 12", 180),
]


# ═══════════════════════════════════════════════════════════════
# SRA AUDIT ITEMS — real categories per SRA Standards framework
# Each tuple: (category, item_name, description, status)
# ═══════════════════════════════════════════════════════════════

SRA_AUDIT_ITEMS: list[tuple] = [

    # ── Governance ─────────────────────────────────────────────
    ("Governance",
     "COLP Appointment & Registration",
     "Compliance Officer for Legal Practice appointed per SRA Standards para 4.1. "
     "Must be a solicitor or REL with 3+ years recent practice. Registered with SRA. "
     "Responsible for: compliance monitoring, breach reporting, remediation oversight.",
     "not_reviewed"),

    ("Governance",
     "COFA Appointment & Registration",
     "Compliance Officer for Finance and Administration appointed per SRA Standards para 5.1. "
     "Must have adequate knowledge of finance. Registered with SRA. "
     "Responsible for: accounts rules compliance, financial reporting, client money oversight.",
     "not_reviewed"),

    ("Governance",
     "Firm-Wide Risk Register",
     "Risk register maintained and reviewed quarterly per SRA Standards para 7.5. "
     "Must cover: AML/TF risk, cyber security, client protection, professional indemnity, "
     "business continuity, regulatory compliance, and reputational risk.",
     "not_reviewed"),

    ("Governance",
     "Business Continuity Plan",
     "Documented BCP per SRA Standards para 7.6. Must address: data loss recovery, "
     "premises unavailability, key staff incapacity, IT system failure, "
     "client notification procedures, and regulatory reporting during disruption.",
     "not_reviewed"),

    ("Governance",
     "Annual SRA Return Preparation",
     "COLP/COFA prepare and submit annual SRA Return covering all compliance areas. "
     "Deadline: as specified by SRA (typically November-January). "
     "Content: governance, finance, AML, GDPR, complaints, breaches, staff details.",
     "not_reviewed"),

    # ── Client Protection ──────────────────────────────────────
    ("Client Protection",
     "Client Care Letter Standards",
     "Client care letters issued for all new matters per SRA Code para 8.1-8.8. "
     "Must include: scope of work, costs basis, billing frequency, right to challenge costs "
     "(Solicitors Act s.69), complaint procedure, Legal Ombudsman details, VAT treatment.",
     "not_reviewed"),

    ("Client Protection",
     "Complaints Handling Procedure",
     "Written complaints procedure documented and accessible per Solicitors Act 1974 s.31A. "
     "Response deadline: 8 weeks from receipt. Must signpost: Legal Ombudsman "
     "(within 6 months of final response or 6 years of act), SRA for conduct issues.",
     "not_reviewed"),

    ("Client Protection",
     "Client Money Protection",
     "Client money handled per SRA Accounts Rules 2019. Requirements: separate client account, "
     "dual authorisation for transfers, 5-weekly reconciliation, residual balance procedures, "
     "annual accountant's report if holding client money.",
     "not_reviewed"),

    ("Client Protection",
     "Conflict of Interest Management",
     "Written conflict procedures per SRA Code para 6.1-6.5. Cover: conflict identification screening, "
     "existing client checks, Chinese Wall protocols, waiver conditions (informed written consent), "
     "and ongoing monitoring of retainers.",
     "not_reviewed"),

    ("Client Protection",
     "Costs Transparency",
     "Costs information provided in writing before engagement per SRA Code para 8.1-8.4. "
     "Regular updates if costs likely to exceed estimate. Explain disbursements and VAT separately. "
     "Inform of right to assessment under Solicitors Act s.69.",
     "not_reviewed"),

    # ── Professional Standards ─────────────────────────────────
    ("Professional Standards",
     "CPD Compliance",
     "All solicitors maintain continuing competence per SRA Competence Statement 2019. "
     "Records maintained: practitioner name, activity date, provider, subject, duration. "
     "Firm monitors compliance and addresses shortfalls.",
     "not_reviewed"),

    ("Professional Standards",
     "Supervision Framework",
     "Supervision arrangements proportionate to staff experience per SRA Standards para 2.3-2.5. "
     "Documented plan including: supervisor allocation, review frequency, file audit schedule, "
     "competence assessment, and escalation routes.",
     "not_reviewed"),

    ("Professional Standards",
     "Equality & Diversity",
     "Policy in place per Equality Act 2010 and SRA Principles 1 & 6. "
     "Covers: recruitment, promotion, service delivery, reasonable adjustments, complaint handling. "
     "Staff trained. Data collected for SRA reporting if applicable.",
     "not_reviewed"),

    ("Professional Standards",
     "Pre-Action Protocol Compliance",
     "Pre-action protocols followed for all new litigation matters per CPR Pre-Action Protocols. "
     "Letter of Claim with prescribed content. Allow prescribed response time (varies by protocol). "
     "Failure: costs sanctions at court's discretion.",
     "not_reviewed"),

    # ── Financial Controls ─────────────────────────────────────
    ("Financial Controls",
     "Client Account Reconciliation",
     "Client account reconciled at least every 5 weeks per SRA Accounts Rules 8.3. "
     "Compare: client ledger balances vs bank statement. "
     "Investigate and resolve discrepancies immediately. Report shortages to COLP/COFA.",
     "not_reviewed"),

    ("Financial Controls",
     "Dual Authorisation Controls",
     "Client account transfers require dual authorisation per SRA Accounts Rules 6.1. "
     "Signatories: director/partner plus one other authorised person. "
     "No single-signatory withdrawals from client account.",
     "not_reviewed"),

    ("Financial Controls",
     "Billing Accuracy & Review",
     "All bills reviewed for accuracy before dispatch per SRA Code para 8.8. "
     "Verify: no inflation, disbursements correctly itemised, VAT correctly applied, "
     "work description matches file records.",
     "not_reviewed"),

    ("Financial Controls",
     "Residual Balance Management",
     "Return residual client money balances promptly after matter completion per SRA Accounts Rules 2.5. "
     "Process: attempt to locate client; reasonable efforts documented; "
     "if unclaimed after 6 years, may be paid to charity or forfeited.",
     "not_reviewed"),

    ("Financial Controls",
     "Accountant's Report",
     "Annual accountant's report filed if holding/receiving client money per SRA Accounts Rules 12. "
     "Due within 6 months of end of accounting period. "
     "Qualified accountant must verify compliance with Accounts Rules.",
     "not_reviewed"),

    ("Financial Controls",
     "Professional Indemnity Insurance",
     "Valid PII cover in place per SRA Indemnity Insurance Rules 2019. "
     "Certificate available for inspection. Cover adequate for firm size and practice areas. "
     "Renewal: annually. Notify SRA of any issues with cover.",
     "not_reviewed"),

    # ── Information Security ───────────────────────────────────
    ("Information Security",
     "Cyber Security Policy & Controls",
     "IT security policy documented per UK GDPR Article 32. Covers: password policy (complexity, rotation), "
     "patch management, data backup (encrypted, tested), incident response procedure, "
     "remote working security, and staff awareness training.",
     "not_reviewed"),

    ("Information Security",
     "ICO Registration",
     "ICO registration current and valid per UK GDPR Article 13. Annual renewal. "
     "Data controller registration required for all firms processing personal data. "
     "Cost: £40-£2,900/year depending on firm size and turnover.",
     "not_reviewed"),

    ("Information Security",
     "Secure Client Communication",
     "Encrypted email and/or secure client portal available per SRA Code para 5.1. "
     "Standard: TLS 1.2+ for email transport, AES-256 for stored data. "
     "Client consent for method of communication documented.",
     "not_reviewed"),

    ("Information Security",
     "Data Breach Response Plan",
     "72-hour ICO notification procedure documented per UK GDPR Articles 33-34. "
     "Plan covers: breach identification, assessment, containment, notification (ICO and data subjects), "
     "documentation, and post-incident review.",
     "not_reviewed"),

    ("Information Security",
     "Data Retention & Destruction",
     "Retention schedule documented per UK GDPR Article 5(1)(e). "
     "Accounting records: 6 years (SRA Accounts Rules 13.1). AML/CDD: 5 years after relationship end "
     "(MLR 2017 Reg 40). Matter files: 6+ years. Secure destruction: certified shredding/wiping.",
     "not_reviewed"),

    ("Information Security",
     "DSAR Response Procedure",
     "Data Subject Access Request procedure documented per UK GDPR Articles 12-15. "
     "30 calendar day response deadline (extendable by 2 months for complex requests). "
     "Verify identity, search all systems, provide data in accessible format.",
     "not_reviewed"),

    # ── AML Controls ───────────────────────────────────────────
    ("AML Controls",
     "Firm-Wide AML Risk Assessment",
     "Annual AML risk assessment per MLR 2017 Reg 18. Must cover: money laundering and "
     "terrorist financing risks; client types; geographic exposure; product/service risk; "
     "delivery channel risk; and mitigation measures. Available for supervisory inspection.",
     "not_reviewed"),

    ("AML Controls",
     "MLRO Appointment & SAR Procedures",
     "Money Laundering Reporting Officer appointed per MLR 2017 Reg 25. "
     "Written SAR procedure: internal reporting to MLRO, MLRO assessment, "
     "external filing with NCA, consent regime management, record keeping.",
     "not_reviewed"),

    ("AML Controls",
     "Staff AML Training Records",
     "All relevant employees completed annual AML training per MLR 2017 Reg 24. "
     "Training records: name, date, duration, topics (ML offences, CDD, SAR identification, "
     "tipping off, record keeping). New staff trained within 30 days of start.",
     "not_reviewed"),

    ("AML Controls",
     "CDD Record Keeping",
     "CDD records maintained for 5 years after end of business relationship per MLR 2017 Reg 40. "
     "Records: identity verification documents, beneficial ownership declarations, "
     "risk assessments, source of funds evidence, SAR submissions.",
     "not_reviewed"),

    ("AML Controls",
     "Enhanced Due Diligence Triggers",
     "EDD procedures documented for high-risk situations per MLR 2017 Reg 33. "
     "Triggers: PEPs and family, high-risk countries (FATF list), complex structures, "
     "unusual patterns, property transactions >£15,000. Senior management approval required.",
     "not_reviewed"),

    ("AML Controls",
     "Ongoing Monitoring",
     "Ongoing monitoring throughout client relationship per MLR 2017 Reg 27. "
     "Review transactions for consistency with client profile. Update beneficial ownership annually. "
     "Escalate unusual/suspicious activity to MLRO.",
     "not_reviewed"),

    # ── Conflict Management ───────────────────────────────────
    ("Conflict Management",
     "Conflict Check Procedure",
     "Written procedure for identifying and managing conflicts per SRA Code para 6.1-6.2. "
     "Searchable register of all parties across all matters. Procedure followed for every new "
     "matter and every new party. Own interest conflicts: cannot act. Client conflicts: "
     "informed consent and effective safeguards documented.",
     "not_reviewed"),

    ("Conflict Management",
     "Information Barriers",
     "Policy for implementing information barriers (Chinese walls) per SRA Code para 6.5. "
     "Documented arrangements: physical separation, IT access controls, "
     "ring-fencing supervision, and staff briefing. Barriers tested periodically.",
     "not_reviewed"),

    # ── Complaints Management ─────────────────────────────────
    ("Complaints Management",
     "Complaints Procedure",
     "Written complaints procedure per SRA Code para 1.4 and Legal Ombudsman Scheme Rules. "
     "Covers: receipt, acknowledgement (2 business days), investigation, "
     "response (8 weeks), escalation to LEO, trend analysis. "
     "Procedure provided to all clients at engagement.",
     "not_reviewed"),

    ("Complaints Management",
     "Root Cause Analysis",
     "Quarterly analysis of complaint root causes and trends. Categories tracked: "
     "service quality, costs, delay, communication, confidentiality. "
     "Lessons learned communicated to staff. Process improvements implemented.",
     "not_reviewed"),

    # ── Undertakings ──────────────────────────────────────────
    ("Undertakings",
     "Undertakings Register",
     "Central register of all undertakings given and received per SRA Code para 1.3. "
     "Tracks: exact wording, given by, given to, deadline, fulfilment status, "
     "financial exposure. COLP reviews weekly. Breach immediately escalated.",
     "not_reviewed"),

    # ── Client Account Controls ───────────────────────────────
    ("Client Account Controls",
     "5-Weekly Reconciliation",
     "Client account reconciled at least every 5 weeks per SRA Accounts Rules 2019 Rule 8.3. "
     "Compare client ledger balances with bank statement. COFA signs off. "
     "Discrepancies investigated and resolved immediately.",
     "not_reviewed"),

    ("Client Account Controls",
     "Residual Balance Review",
     "Quarterly review of all residual client money balances per Rule 2.5. "
     "Balances returned promptly when matter concludes. Any balance held >30 days "
     "requires documented justification. COFA oversight.",
     "not_reviewed"),

    ("Client Account Controls",
     "Client Money Handling",
     "Compliance with SRA Accounts Rules 2019 Rules 2-5. "
     "Client money kept separate, prompt banking, permitted withdrawals only, "
     "proper authorisation for transfers, no personal cheques into client account.",
     "not_reviewed"),
]


# ═══════════════════════════════════════════════════════════════
# INITIAL COMPLIANCE TASKS — mapped to COLP duties
# Each tuple: (task_type, title, description, priority, due_days)
# ═══════════════════════════════════════════════════════════════

INITIAL_TASKS: list[tuple] = [
    ("setup", "Complete Firm-Wide AML Risk Assessment",
     "Conduct and document annual AML risk assessment covering all risk categories "
     "per MLR 2017 Reg 18. Required before accepting new client instructions.",
     "critical", 14),

    ("setup", "Appoint and Register MLRO with SRA",
     "Designate Money Laundering Reporting Officer per MLR 2017 Reg 25. "
     "Register with SRA. Ensure MLRO understands SAR procedures and consent regime.",
     "critical", 7),

    ("setup", "Verify Professional Indemnity Insurance",
     "Confirm PII is adequate and current per SRA Indemnity Insurance Rules 2019. "
     "Obtain certificate. Verify cover amount matches firm size and practice areas.",
     "critical", 7),

    ("setup", "Configure Client Account Reconciliation Schedule",
     "Set up 5-weekly reconciliation process per SRA Accounts Rules 8.3. "
     "Define: reconciliation method, responsible person, discrepancy escalation route.",
     "critical", 14),

    ("setup", "Document Client Care Letter Template",
     "Create compliant client care letter template per SRA Code para 8.1-8.8. "
     "Include: scope, costs, billing, assessment rights, complaints, Legal Ombudsman.",
     "high", 14),

    ("setup", "Document Complaints Procedure",
     "Create or review firm complaints procedure with Legal Ombudsman signposting "
     "per Solicitors Act 1974 s.31A. 8-week response deadline. Publish to clients.",
     "high", 21),

    ("setup", "Create Data Breach Response Plan",
     "Document 72-hour ICO notification procedure per UK GDPR Articles 33-34. "
     "Cover: identification, assessment, containment, notification, documentation.",
     "high", 21),

    ("setup", "Document AML Policies and Procedures",
     "Create written AML policies per MLR 2017 Reg 19-20. "
     "Cover: CDD, EDD triggers, SAR procedures, record keeping, training requirements.",
     "critical", 14),

    ("setup", "Configure Conflict Checking System",
     "Establish conflict identification and screening procedures per SRA Code para 6.1-6.5. "
     "Define: search method, database, Chinese Wall protocols, waiver process.",
     "high", 14),

    ("training", "Schedule Staff AML Training",
     "All relevant staff must complete AML training per MLR 2017 Reg 24. "
     "Topics: ML offences, firm policy, SAR triggers, tipping off, record keeping.",
     "critical", 30),

    ("training", "Schedule GDPR Awareness Training",
     "Staff handling personal data must complete GDPR training per UK GDPR Article 32. "
     "Topics: lawful bases, data subject rights, breach reporting, secure handling.",
     "high", 30),

    ("review", "Review Supervision Arrangements",
     "Assess supervision framework per SRA Standards para 2.3-2.5. "
     "Define: supervisor allocation, review frequency, file audit schedule, competence assessment.",
     "high", 30),

    ("review", "Prepare SRA Return Data",
     "Gather data for annual SRA Return per SRA Standards para 1.1. "
     "Cover: firm details, governance, finance, AML, GDPR, complaints, breaches, staff.",
     "high", 60),

    # ── New module setup tasks ────────────────────────────────
    ("setup", "Establish Conflict Check Procedure",
     "Document and implement conflict of interest procedures per SRA Code para 6.1-6.2. "
     "Set up searchable parties register. Define who can grant waivers. "
     "Train staff on when to run checks and how to escalate.",
     "critical", 14),

    ("setup", "Set Up CDD Verification Workflow",
     "Document CDD procedures covering ID verification, address proof, "
     "beneficial ownership, source of funds. Define risk assessment criteria "
     "for standard vs enhanced due diligence. Assign CDD reviewer roles.",
     "critical", 14),

    ("setup", "Document Written Complaints Procedure",
     "Create written complaints procedure per SRA Code para 1.4. "
     "Include: receipt, acknowledgement (2 days), investigation, response (8 weeks), "
     "LEO signposting. Appoint complaints handler. Add to client care letter.",
     "critical", 14),

    ("setup", "Establish Undertakings Register",
     "Set up central register for all undertakings given and received. "
     "Define approval authority levels. Implement weekly COLP review process. "
     "Create template wording for common undertakings.",
     "critical", 14),

    ("setup", "Set Up Client Account Controls",
     "Implement SRA Accounts Rules 2019 compliance framework: "
     "5-weekly reconciliation schedule, residual balance review process, "
     "authorisation levels for withdrawals, COFA sign-off workflow.",
     "critical", 14),

    ("setup", "Configure Sanctions Screening",
     "Establish sanctions screening process for all new clients. "
     "Select screening provider or manual check procedure. "
     "Document: UK HMT, EU, UN, OFAC lists to be checked. "
     "Train staff on criminal liability for acting for sanctioned persons.",
     "critical", 7),
]


# ═══════════════════════════════════════════════════════════════
# INITIAL ALERTS — regulatory obligations requiring attention
# Each tuple: (alert_type, severity, title, description, action_required)
# ═══════════════════════════════════════════════════════════════

INITIAL_ALERTS: list[tuple] = [
    ("regulatory", "critical",
     "AML Framework — Immediate Setup Required",
     "Money Laundering Regulations 2017 require firms to have AML policies, procedures, "
     "and controls in place BEFORE accepting client instructions. Failure is a criminal offence "
     "(up to 2 years imprisonment and/or fine) under MLR 2017 Reg 76.",
     "Complete: AML risk assessment (Reg 18), appoint MLRO (Reg 25), document CDD procedures (Reg 28)"),

    ("regulatory", "critical",
     "Client Account Controls — SRA Accounts Rules",
     "SRA Accounts Rules 2019 require client money to be held separately with proper controls. "
     "Breach may result in SRA investigation, conditions on practice, or intervention.",
     "Configure: separate client account (Rule 2.1), dual authorisation (Rule 6.1), "
     "5-weekly reconciliation (Rule 8.3)"),

    ("regulatory", "high",
     "GDPR Compliance — Data Protection Obligations",
     "UK GDPR and DPA 2018 require documented data protection measures. "
     "ICO can fine up to £17.5 million for serious breaches.",
     "Complete: privacy notices (Art 13-14), breach response plan (Art 33-34), "
     "DSAR procedure (Art 12-15), ICO registration"),

    ("regulatory", "high",
     "SRA Code of Conduct — Client Care Requirements",
     "SRA Code para 8.1-8.8 requires costs transparency for all matters. "
     "Non-compliance may trigger SRA investigation or disciplinary proceedings.",
     "Prepare: client care letter template, complaints procedure, costs estimate process"),

    ("regulatory", "high",
     "Staff Supervision and Training Obligations",
     "SRA Standards para 2.3-2.5 require adequate supervision. "
     "MLR 2017 Reg 24 requires annual AML training for all relevant staff.",
     "Establish: supervision framework, AML training schedule, CPD monitoring"),
]


async def seed_firm_compliance(db: AsyncSession, firm_id: str) -> dict:
    """Seed production-grade SRA compliance data for a firm. Idempotent."""

    from sqlalchemy import select, func

    # Check if already seeded
    count_result = await db.execute(
        select(func.count()).select_from(ComplianceCheck).where(
            ComplianceCheck.firm_id == firm_id
        )
    )
    existing = count_result.scalar()
    if existing and existing > 0:
        return {"message": "Already seeded", "checks": existing, "seeded": False}

    created = {"checks": 0, "sra_items": 0, "risk_scores": 0, "alerts": 0, "tasks": 0}

    # 1. Compliance Checks
    for check_type, name, status, severity, desc, reg_ref, due_days in COMPLIANCE_CHECKS:
        db.add(ComplianceCheck(
            id=_id(), firm_id=firm_id, check_type=check_type, check_name=name,
            status=status, severity=severity, description=desc,
            regulation_ref=reg_ref, due_date=_due(due_days),
        ))
        created["checks"] += 1

    # 2. SRA Audit Items
    for category, name, desc, status in SRA_AUDIT_ITEMS:
        db.add(SRAauditItem(
            id=_id(), firm_id=firm_id, category=category, item_name=name,
            description=desc, status=status, next_review_due=_due(90),
        ))
        created["sra_items"] += 1

    # 3. Risk Score — baseline (all areas start at 50 until assessed)
    db.add(RiskScore(
        id=_id(), firm_id=firm_id, entity_type="firm", entity_id=firm_id,
        overall_score=50, sra_score=50, aml_score=40, cpr_score=60,
        gdpr_score=45, limitation_score=55,
    ))
    created["risk_scores"] += 1

    # 4. Alerts
    for alert_type, severity, title, desc, action in INITIAL_ALERTS:
        db.add(ComplianceAlert(
            id=_id(), firm_id=firm_id, alert_type=alert_type, severity=severity,
            title=title, description=desc, action_required=action,
            status="open", created_at=_now(),
        ))
        created["alerts"] += 1

    # 5. Tasks
    for task_type, title, desc, priority, due_days in INITIAL_TASKS:
        db.add(ComplianceTask(
            id=_id(), firm_id=firm_id, task_type=task_type, title=title,
            description=desc, priority=priority, status="pending",
            due_date=_due(due_days), created_at=_now(),
        ))
        created["tasks"] += 1

    await db.flush()

    return {"message": "Firm compliance data seeded", "seeded": True, **created}
