'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  DataTable,
  Card,
  Button,
  StatusBadge,
  Modal,
  showToast,
  ConfirmDialog,
  DashboardSkeleton,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { ChevronRight } from 'lucide-react';
import { isDemoMode, DEMO_POLICIES } from '@/lib/demo-data';

interface Policy {
  id: string;
  policy_type: string;
  title: string;
  version: string;
  status: 'Active' | 'Draft' | 'Under Review' | 'Archived';
  review_date: string;
  approved_by: string;
  created_at: string;
  content: string;
}

interface PolicyVersion {
  id: string;
  version_number: number;
  version_label: string;
  change_summary: string;
  created_by: string;
  created_at: string;
  content: string;
}

const POLICY_CATEGORIES = [
  'AML',
  'Data Protection',
  'Complaints',
  'Equality',
  'Anti-Corruption',
  'Risk Management',
];

export default function PoliciesPage() {
  useRequireAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showScheduleReviewModal, setShowScheduleReviewModal] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PolicyVersion | null>(null);

  // Fetch policies on mount
  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isDemoMode()) {
          setPolicies(DEMO_POLICIES as any);
          setLoading(false);
          return;
        }

        const response = await apiClient.get('/compliance/policies');
        setPolicies(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policies');
        if (isDemoMode()) {
          setPolicies(DEMO_POLICIES as any);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPolicies();
  }, []);

  const filteredPolicies = categoryFilter
    ? policies.filter(p => p.policy_type === categoryFilter)
    : policies;

  const policiesPendingReview = policies.filter(
    p => p.status === 'Under Review' || p.status === 'Draft'
  );

  const handleGeneratePolicy = async (templateId: string, policyType: string) => {
    try {
      setGenerateLoading(true);
      setGenerateError(null);

      if (isDemoMode()) {
        showToast('Seema\'s AI is generating your policy…', 'info');
        await new Promise(r => setTimeout(r, 2500));

        const generatedContent: Record<string, string> = {
          'AML': `# Anti-Money Laundering Policy\n\n## 1. Purpose & Scope\nThis policy sets out the firm's obligations under the Proceeds of Crime Act 2002 (POCA), the Terrorism Act 2000, the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (as amended), and guidance issued by the Legal Sector Affinity Group (LSAG).\n\nThis policy applies to all partners, solicitors, trainees, paralegals, and support staff.\n\n## 2. Money Laundering Reporting Officer (MLRO)\nThe firm's MLRO is responsible for receiving internal suspicious activity reports, deciding whether to submit a SAR to the NCA, and maintaining the firm's AML risk assessment.\n\n## 3. Firm-Wide Risk Assessment\nThe firm maintains a documented risk assessment covering: client types (PEPs, high-net-worth individuals, corporate structures), geographic risk (high-risk jurisdictions per FATF), service risk (property transactions, trust work, company formations), and delivery channels.\n\nThis risk assessment is reviewed at least annually or following any material change.\n\n## 4. Client Due Diligence (CDD)\n**Standard CDD** must be completed before establishing a business relationship. This includes: verifying identity using reliable, independent sources; identifying beneficial owners (25%+ ownership threshold); understanding the purpose of the retainer.\n\n**Enhanced Due Diligence (EDD)** is required for: PEPs and their associates, clients from high-risk third countries, complex or unusual transactions, and any situation presenting a higher risk of money laundering.\n\n**Simplified Due Diligence** may be applied only where the firm has assessed the risk as genuinely low, in accordance with Regulation 37.\n\n## 5. Ongoing Monitoring\nAll client relationships must be subject to ongoing monitoring proportionate to the risk level. Fee earners must remain alert to changes in a client's circumstances or transaction patterns.\n\n## 6. Suspicious Activity Reporting\nAny member of staff who knows or suspects money laundering must make an internal report to the MLRO immediately. Staff must not disclose ("tip off") that a report has been made. The MLRO will assess the report and, where appropriate, submit a SAR to the NCA via the SAR Online system.\n\n## 7. Record Keeping\nAll CDD records and transaction records must be retained for at least 5 years from the date the business relationship ends or the date of the occasional transaction.\n\n## 8. Training\nAll relevant staff must complete AML training upon induction and at least annually thereafter. Training records are maintained by the COLP.\n\n## 9. Sanctions Screening\nAll new clients and beneficial owners must be screened against the OFSI consolidated sanctions list and other relevant sanctions databases.\n\n## 10. Review\nThis policy is reviewed annually by the COLP and MLRO. The next review date is recorded in the firm's compliance calendar.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: POCA 2002, MLR 2017, SRA Code of Conduct 2019 (paragraphs 7.1–7.5), LSAG Guidance*`,

          'Data Protection': `# Data Protection & GDPR Policy\n\n## 1. Purpose & Scope\nThis policy sets out how the firm complies with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and guidance issued by the Information Commissioner's Office (ICO).\n\nThis policy applies to all processing of personal data by the firm, whether in electronic or manual form.\n\n## 2. Data Protection Principles\nThe firm adheres to the seven data protection principles: lawfulness, fairness and transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity and confidentiality; and accountability.\n\n## 3. Lawful Bases for Processing\nThe firm processes client personal data primarily under: contractual necessity (performance of the retainer), legal obligation (regulatory and court requirements), and legitimate interests (administration and business development). Special category data is processed under the substantial public interest condition or legal claims exemption where applicable.\n\n## 4. Data Protection Impact Assessments (DPIAs)\nA DPIA must be conducted before any new processing activity that is likely to result in a high risk to individuals, including the deployment of AI tools, large-scale profiling, or systematic monitoring.\n\n## 5. Data Subject Rights\nThe firm has procedures to respond to: subject access requests (within one month), rectification and erasure requests, restriction of processing, data portability, and objections to processing. The COLP is responsible for coordinating responses.\n\n## 6. Data Breach Notification\nPersonal data breaches must be reported to the ICO within 72 hours of becoming aware, unless the breach is unlikely to result in a risk to individuals' rights and freedoms. Data subjects must be notified without undue delay where the breach is likely to result in a high risk.\n\nAll breaches must be recorded in the firm's breach register regardless of whether they are reported to the ICO.\n\n## 7. International Transfers\nPersonal data may only be transferred outside the UK where adequate safeguards are in place, such as UK adequacy regulations, standard contractual clauses, or binding corporate rules.\n\n## 8. Retention\nPersonal data is retained in accordance with the firm's retention schedule: matter files (6 years from closure, 15 years for property and trust matters), HR records (6 years after employment ends), marketing data (reviewed annually).\n\n## 9. Training & Awareness\nAll staff receive data protection training at induction and annually thereafter. Specialist training is provided to staff handling special category data.\n\n## 10. Review\nThis policy is reviewed annually or following significant changes to data processing activities.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: UK GDPR, DPA 2018, SRA Code of Conduct 2019 (paragraphs 6.3–6.5), ICO Employment Practices Code*`,

          'Complaints': `# Complaints Handling Policy\n\n## 1. Purpose & Scope\nThis policy sets out the firm's procedure for handling complaints in accordance with Rule 4.1 of the SRA Standards and Regulations 2019 and the Legal Ombudsman's requirements. It applies to all complaints received from clients, third parties, and other regulated persons.\n\n## 2. Definition of a Complaint\nA complaint is any expression of dissatisfaction, whether oral or written, about the firm's service, fees, or the conduct of any person connected with the firm.\n\n## 3. Initial Response\nAll complaints will be acknowledged in writing within 2 working days of receipt. The acknowledgment will confirm: the name of the person handling the complaint, the firm's complaints procedure, and the expected timescale for resolution.\n\n## 4. Investigation\nComplaints will be investigated by a senior member of staff not connected with the matter complained about. The investigation will be completed within 8 weeks. The complainant will receive:\n- A substantive response within 8 weeks\n- Regular updates if the investigation takes longer than 4 weeks\n- A written outcome letter with findings, any proposed remedies, and information about escalation options\n\n## 5. Remedies\nWhere a complaint is upheld, the firm may offer: an apology, a reduction or waiver of fees, compensation for loss or distress, or corrective action. The response will explain the reasoning for any remedy offered.\n\n## 6. Legal Ombudsman\nIf the complainant remains dissatisfied after the firm's complaints process, they may refer the matter to the Legal Ombudsman within 6 months of the firm's final written response (or within 6 years of the act/omission, or 3 years from when the complainant should reasonably have known about it). Contact: enquiries@legalombudsman.org.uk, 0300 555 0333.\n\n## 7. SRA Reporting\nComplaints involving professional misconduct or breaches of the SRA Standards and Regulations will be reported to the SRA by the COLP.\n\n## 8. Complaints Register\nAll complaints are recorded in the firm's central complaints register, which is reviewed quarterly by the COLP to identify trends and systemic issues.\n\n## 9. Review\nThis policy is reviewed annually. All staff are trained on the complaints procedure at induction.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: SRA Code of Conduct 2019 (Rule 4.1, 8.3), SRA Transparency Rules, Legal Ombudsman Scheme Rules*`,

          'Equality': `# Equality, Diversity & Inclusion Policy\n\n## 1. Purpose & Scope\nThis policy sets out the firm's commitment to equality, diversity and inclusion in accordance with the Equality Act 2010, the SRA's requirements on fair treatment (SRA Principles 2019), and the SRA's published equality and diversity guidance.\n\nThis policy applies to all partners, employees, contractors, and anyone acting on the firm's behalf.\n\n## 2. Legal Framework\nThe firm is committed to preventing unlawful discrimination on the grounds of the nine protected characteristics: age, disability, gender reassignment, marriage and civil partnership, pregnancy and maternity, race, religion or belief, sex, and sexual orientation.\n\n## 3. Recruitment & Selection\nAll recruitment decisions are based on merit. Job descriptions and person specifications are reviewed to ensure they do not contain discriminatory criteria. The firm monitors diversity data in recruitment processes and reports annually.\n\n## 4. Reasonable Adjustments\nThe firm will make reasonable adjustments for disabled employees and clients, including: physical adjustments to premises, provision of auxiliary aids, adjustment of working practices and procedures.\n\n## 5. Equal Pay\nThe firm is committed to equal pay for equal work and conducts pay gap analysis annually.\n\n## 6. Harassment & Bullying\nHarassment, bullying, and victimisation are treated as serious disciplinary offences. The firm provides a confidential reporting mechanism and will investigate all allegations promptly.\n\n## 7. Client Service\nAll clients receive equal quality of service regardless of background. The firm monitors client satisfaction data by relevant diversity characteristics where appropriate.\n\n## 8. SRA Reporting\nThe firm completes the SRA's annual diversity survey and publishes workforce diversity data as required.\n\n## 9. Training\nAll staff receive equality and diversity training at induction and biennially thereafter. Partners receive additional training on inclusive leadership.\n\n## 10. Review\nThis policy is reviewed annually by the COLP. Complaints of discrimination are handled under the firm's complaints procedure.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: Equality Act 2010, SRA Principles 2019, SRA Code of Conduct 2019 (paragraph 1.1), SRA Equality and Diversity Guidance*`,

          'Anti-Corruption': `# Anti-Bribery & Anti-Corruption Policy\n\n## 1. Purpose & Scope\nThis policy sets out the firm's commitment to conducting business ethically and in compliance with the Bribery Act 2010. It applies to all partners, employees, consultants, and third parties acting on the firm's behalf.\n\nThe firm operates a zero-tolerance approach to bribery and corruption in all forms.\n\n## 2. The Bribery Act 2010\nThe Act creates four offences: offering/paying a bribe (Section 1), receiving a bribe (Section 2), bribing a foreign public official (Section 6), and failure by a commercial organisation to prevent bribery (Section 7). The firm can face unlimited fines under Section 7 unless it can demonstrate adequate procedures.\n\n## 3. Prohibited Conduct\nAll personnel are prohibited from: offering, promising, giving, requesting, or accepting any financial or other advantage intended to improperly influence business decisions; making facilitation payments; engaging intermediaries to do anything that would breach this policy.\n\n## 4. Gifts & Hospitality\nModest and proportionate gifts/hospitality may be given or received subject to: a maximum value of £50 per item (£150 cumulative per relationship per year), prior approval for gifts exceeding these thresholds, recording in the gifts and hospitality register, no gifts to public officials or during active tenders.\n\n## 5. Risk Assessment\nThe firm conducts a bribery risk assessment covering: business relationships, geographic exposure, third-party intermediaries, and procurement. This is reviewed annually.\n\n## 6. Due Diligence\nProportionate due diligence is conducted on third-party intermediaries, referral partners, and suppliers before entering into business relationships.\n\n## 7. Reporting & Whistleblowing\nAll suspected breaches must be reported immediately to the COLP. The firm protects whistleblowers from retaliation in accordance with the Public Interest Disclosure Act 1998.\n\n## 8. Training\nAll staff complete anti-bribery training at induction and annually thereafter.\n\n## 9. Record Keeping\nThe firm maintains accurate books and records. All payments must be properly documented with a legitimate business purpose.\n\n## 10. Review\nThis policy is reviewed annually by the COLP.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: Bribery Act 2010, SRA Code of Conduct 2019 (paragraphs 1.2, 5.2), SRA Principles 2019 (Principles 2, 5)*`,

          'Risk Management': `# Risk Management Policy\n\n## 1. Purpose & Scope\nThis policy establishes the firm's framework for identifying, assessing, mitigating, and monitoring risks to compliance, client service, and business continuity. It fulfils the COLP's obligations under Rule 8 of the SRA Code of Conduct for Firms 2019.\n\n## 2. Risk Governance\nThe COLP has overall responsibility for risk management. A risk register is maintained and reviewed quarterly. All partners share collective responsibility for risk within their practice areas.\n\n## 3. Risk Identification\nRisks are identified through: compliance monitoring, matter audits, complaint analysis, near-miss reporting, regulatory updates, staff feedback, and external intelligence.\n\n## 4. Risk Assessment\nEach identified risk is assessed for likelihood (1-5) and impact (1-5), producing a risk score (1-25). Risks scoring 15+ are classified as critical and require immediate mitigation.\n\n## 5. Key Risk Categories\n- **Regulatory risk**: Non-compliance with SRA Standards, AML regulations, data protection law\n- **Financial risk**: Client account irregularities, inadequate PI cover, fee disputes\n- **Operational risk**: IT failure, key-person dependency, inadequate supervision\n- **Reputational risk**: Complaints, media exposure, SRA interventions\n- **Strategic risk**: Market changes, regulatory reform, competition\n\n## 6. Risk Mitigation\nFor each significant risk, the firm documents: the risk owner, existing controls, additional controls required, implementation timeline, and residual risk level.\n\n## 7. Business Continuity\nThe firm maintains a business continuity plan covering: IT disaster recovery, key-person absence, premises loss, and pandemic response. The plan is tested annually.\n\n## 8. Insurance\nThe firm maintains professional indemnity insurance meeting SRA minimum requirements and reviews coverage annually against its risk profile.\n\n## 9. Monitoring & Reporting\nThe risk register is reviewed quarterly. The COLP reports material risk issues to the partnership. The SRA is notified of any material failure in accordance with Rule 3.9.\n\n## 10. Review\nThis policy is reviewed annually or following any material risk event.\n\n---\n*Generated by Seema's AI Regulatory Intelligence*\n*Regulatory references: SRA Code of Conduct for Firms 2019 (Rules 2.1, 3.9, 8.1), SRA Indemnity Insurance Rules, SRA Accounts Rules 2019*`,
        };

        const content = generatedContent[policyType] || generatedContent['Risk Management'];

        const newPolicy: Policy = {
          id: `POL-${policies.length + 1}`,
          policy_type: policyType,
          title: `${policyType} Policy`,
          version: '1.0',
          status: 'Draft',
          review_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          approved_by: 'Pending',
          created_at: new Date().toISOString(),
          content,
        };
        setPolicies([...policies, newPolicy]);
        showToast(`${policyType} policy generated by Seema's AI`, 'success');
        setShowGenerateModal(false);
        return;
      }

      // Route lives under /ai/ (proxied to FastAPI), not /compliance/.
      // AI policy generation takes 30-60s with a 4096-token output, so we
      // override axios's 30s default and use a 2-minute timeout for this
      // call only.
      await apiClient.post('/ai/generate-policy', {
        template_id: templateId,
        title: `${policyType} Policy`,
        policy_type: policyType,
      }, { timeout: 120000 });
      showToast(`${policyType} policy generated successfully`, 'success');
      // Refresh policies list
      const response = await apiClient.get('/compliance/policies');
      setPolicies(Array.isArray(response.data) ? response.data : []);
      setShowGenerateModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate policy';
      showToast(errorMsg, 'error');
      setGenerateError(errorMsg);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleScheduleReview = (id: string, newDate: Date) => {
    // Schedule review functionality - update nextReviewDate
    // For now, this updates locally. In a real scenario, you'd POST to backend
    setPolicies(
      policies.map(p =>
        p.id === id ? { ...p, review_date: newDate.toISOString() } : p
      )
    );
    showToast('Review scheduled successfully', 'success');
    setShowScheduleReviewModal(null);
  };

  const handleViewVersionHistory = async (policyId: string) => {
    try {
      setVersionsLoading(true);
      setShowVersionHistory(policyId);
      setSelectedVersion(null);
      const response = await apiClient.get(`/compliance/policies/${policyId}/versions`);
      const data = response.data?.data || response.data;
      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load version history', 'error');
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const columns = [
    { accessor: 'title', header: 'Policy Name', sortable: true },
    { accessor: 'policy_type', header: 'Category' },
    { accessor: 'version', header: 'Version' },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: any) => (
        <StatusBadge
          status={row.status}
          variant={
            row.status === 'Active'
              ? 'success'
              : row.status === 'Draft'
              ? 'warning'
              : row.status === 'Archived'
              ? 'critical'
              : 'info'
          }
        />
      ),
    },
    {
      accessor: 'created_at',
      header: 'Created',
      render: (_value: any, row: any) => formatDate(new Date(row.created_at)),
    },
    {
      accessor: 'review_date',
      header: 'Next Review',
      render: (_value: any, row: any) => formatDate(new Date(row.review_date)),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Policies & Procedures" description="Manage compliance policies" />

      {error && (
        <Card className="rounded-xl border border-red-200 bg-red-50">
          <div className="p-6">
            <h3 className="font-semibold text-red-900">Error Loading Policies</h3>
            <p className="text-red-700 mt-2">{error}</p>
          </div>
        </Card>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : policies.length === 0 ? (
        <Card className="rounded-xl border border-gray-200">
          <div className="p-6 text-center">
            <p className="text-gray-600">No policies found. Generate one to get started.</p>
          </div>
        </Card>
      ) : (
        <>
          {policiesPendingReview.length > 0 && (
            <Card className="rounded-xl border border-yellow-200 bg-yellow-50 shadow-sm">
              <div className="p-6">
                <h3 className="text-xs font-semibold text-yellow-900 uppercase tracking-wide mb-4">Review Queue</h3>
                <div className="space-y-3">
                  {policiesPendingReview.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-100 hover:border-yellow-200 transition-colors">
                      <span className="font-medium text-gray-900 line-clamp-1">{p.title}</span>
                      <StatusBadge status={p.status} variant="warning" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <Card className="rounded-xl border border-gray-200 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors hover:border-gray-300"
                >
                  <option value="">All Categories</option>
                  {POLICY_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <Button onClick={() => setShowGenerateModal(true)}>Generate Policy</Button>
              </div>

              <div className="space-y-3">
                {filteredPolicies.map((policy) => (
                  <div
                    key={policy.id}
                    onClick={() => setSelectedPolicy(policy)}
                    className="group p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {policy.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-1">{policy.policy_type}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0 mt-1" />
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                      <StatusBadge
                        status={policy.status}
                        variant={
                          policy.status === 'Active'
                            ? 'success'
                            : policy.status === 'Draft'
                            ? 'warning'
                            : policy.status === 'Archived'
                            ? 'critical'
                            : 'info'
                        }
                      />
                      <span className="text-xs text-gray-500 font-medium">v{policy.version}</span>
                      <span className="text-xs text-gray-400 tabular-nums">{formatDate(new Date(policy.created_at))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}

      {selectedPolicy && (
        <Modal
          isOpen={!!selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
          title={selectedPolicy.title}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Category</label>
                <p className="text-lg font-medium text-gray-900 mt-1">{selectedPolicy.policy_type}</p>
              </div>
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</label>
                <p className="mt-2">
                  <StatusBadge status={selectedPolicy.status} />
                </p>
              </div>
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Current Version</label>
                <p className="text-lg font-medium text-gray-900 mt-1 tabular-nums">v{selectedPolicy.version}</p>
              </div>
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created</label>
                <p className="text-lg font-medium text-gray-900 mt-1 tabular-nums">{formatDate(new Date(selectedPolicy.created_at))}</p>
              </div>
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Approved By</label>
                <p className="text-lg font-medium text-gray-900 mt-1">{selectedPolicy.approved_by || 'Pending'}</p>
              </div>
              <div className="border-b pb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Next Review</label>
                <p className="text-lg font-medium text-gray-900 mt-1 tabular-nums">{formatDate(new Date(selectedPolicy.review_date))}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Policy Content</h4>
              <div className="p-4 border border-gray-200 rounded-xl text-sm bg-gray-50 max-h-96 overflow-y-auto">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedPolicy.content}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={() => {
                  setSelectedPolicy(null);
                  handleViewVersionHistory(selectedPolicy.id);
                }}
                variant="secondary"
                className="flex-1"
              >
                Version History
              </Button>
              <Button
                onClick={() => setShowScheduleReviewModal(selectedPolicy.id)}
                variant="secondary"
                className="flex-1"
              >
                Schedule Review
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showGenerateModal && (
        <Modal
          isOpen={showGenerateModal}
          // Block close while a generation is in flight — closing the modal
          // mid-call doesn't cancel the request and leaves the loading state
          // dangling.
          onClose={() => { if (!generateLoading) setShowGenerateModal(false); }}
          title="Generate Policy"
        >
          <div className="space-y-3">
            {generateError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {generateError}
              </div>
            )}
            {generateLoading ? (
              <div className="py-6 text-center space-y-3">
                {/* Spinner */}
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <p className="text-sm font-medium text-gray-900">
                  Generating your policy with Seema AI…
                </p>
                <p className="text-xs text-gray-600">
                  This usually takes 30–60 seconds while Seema drafts a
                  firm-specific document. Please don't close this window.
                </p>
              </div>
            ) : (
              POLICY_CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  onClick={() => handleGeneratePolicy(cat.toLowerCase(), cat)}
                  variant="secondary"
                  className="w-full text-left"
                  disabled={generateLoading}
                >
                  Generate {cat} Policy
                </Button>
              ))
            )}
          </div>
        </Modal>
      )}

      {showScheduleReviewModal && (
        <Modal
          isOpen={!!showScheduleReviewModal}
          onClose={() => setShowScheduleReviewModal(null)}
          title="Schedule Review"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">New Review Date</span>
              <input type="date" className="w-full px-3 py-2 border rounded mt-1" />
            </label>
            <Button
              onClick={() =>
                handleScheduleReview(
                  showScheduleReviewModal,
                  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                )
              }
              variant="success"
              className="w-full"
            >
              Schedule
            </Button>
          </div>
        </Modal>
      )}

      {showVersionHistory && (
        <Modal
          isOpen={!!showVersionHistory}
          onClose={() => {
            setShowVersionHistory(null);
            setVersions([]);
            setSelectedVersion(null);
          }}
          title="Version History"
        >
          <div className="space-y-4">
            {versionsLoading ? (
              <p className="text-gray-600">Loading versions...</p>
            ) : versions.length === 0 ? (
              <p className="text-gray-600">No version history available for this policy.</p>
            ) : selectedVersion ? (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedVersion(null)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors flex items-center gap-1"
                >
                  <span>&larr;</span> Back to version list
                </button>
                <div className="space-y-3">
                  <div className="border-b pb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</label>
                    <p className="text-sm font-medium text-gray-900 mt-1 tabular-nums">{selectedVersion.version_label || `v${selectedVersion.version_number}`}</p>
                  </div>
                  <div className="border-b pb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                    <p className="text-sm font-medium text-gray-900 mt-1 tabular-nums">{formatDate(new Date(selectedVersion.created_at))}</p>
                  </div>
                  <div className="border-b pb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Changes</label>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{selectedVersion.change_summary || 'No summary provided'}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Content</label>
                  <div className="p-4 border border-gray-200 rounded-xl text-sm bg-gray-50 max-h-64 overflow-y-auto mt-2">
                    <p className="text-gray-700 whitespace-pre-wrap line-clamp-2">{selectedVersion.content}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v)}
                    className="w-full text-left p-3 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex justify-between items-center gap-3">
                      <span className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                        {v.version_label || `Version ${v.version_number}`}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
                        {formatDate(new Date(v.created_at))}
                      </span>
                    </div>
                    {v.change_summary && (
                      <p className="text-xs text-gray-600 mt-2 line-clamp-1">{v.change_summary}</p>
                    )}
                    {v.created_by && (
                      <p className="text-xs text-gray-400 mt-1">By: {v.created_by}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!confirmArchive}
        onConfirm={() => {
          if (confirmArchive) {
            setPolicies(policies.map(p => p.id === confirmArchive ? { ...p, status: 'Archived' } : p));
            showToast('Policy archived successfully', 'success');
          }
          setConfirmArchive(null);
        }}
        onCancel={() => setConfirmArchive(null)}
        title="Archive Policy"
        message="This will archive the policy and it will no longer be active."
        confirmLabel="Archive"
        variant="warning"
      />
    </div>
  );
}
