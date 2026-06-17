"use client";

import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/api";
import { SendPackModal } from "@/components/SendPackModal";
import { PackDeliveryHistory } from "@/components/PackDeliveryHistory";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditItem {
  id: string;
  standard: string;
  title: string;
  description: string;
  status: "pass" | "fail" | "partial";
  category: string;
  evidence_count: number;
  last_reviewed: string;
  notes: string;
  remediation_hint?: string;
}

interface AuditSummary {
  total: number;
  passing: number;
  failing: number;
  partial: number;
}

interface AuditData {
  score: number;
  summary: AuditSummary;
  assessed_at: string;
  items: AuditItem[];
}

// ─── Circular Progress Component ─────────────────────────────────────────────

function CircularProgress({
  score,
  size = 180,
  strokeWidth = 14,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return "#22c55e"; // green-500
    if (s >= 60) return "#f59e0b"; // amber-500
    return "#ef4444"; // red-500
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-gray-900">{score}%</span>
        <span className="text-sm text-gray-500 mt-1">Overall Readiness</span>
      </div>
    </div>
  );
}

// ─── Score Methodology Modal ─────────────────────────────────────────────────

function ScoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            How is this score calculated?
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 text-gray-600 text-sm leading-relaxed">
          <p>
            The SRA Audit Readiness Score evaluates your firm against 18 key standards
            and regulations drawn from the SRA Standards and Regulations framework,
            including the SRA Principles, Code of Conduct, Accounts Rules, and
            Transparency Rules.
          </p>
          <p>
            Each check is scored as <span className="font-medium text-green-700">Passing (100%)</span>,{" "}
            <span className="font-medium text-amber-600">Partial (50%)</span>, or{" "}
            <span className="font-medium text-red-600">Failing (0%)</span>. The overall
            score is the weighted average across all checks, giving you a single
            readiness percentage.
          </p>
          <p>
            A score above 80% indicates strong audit preparedness. Scores below 70%
            suggest areas requiring immediate attention before an SRA visit.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "pass" | "fail" | "partial" }) {
  const config = {
    pass: { label: "Passing", bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200" },
    partial: { label: "Partial", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
    fail: { label: "Failing", bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${c.bg} ${c.text} ${c.ring}`}>
      {c.label}
    </span>
  );
}

// ─── Toast Notification ──────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
        type === "success" ? "bg-green-600" : "bg-red-600"
      } text-white text-sm font-medium`}>
        {type === "success" ? (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {message}
        <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SRAAuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "pass" | "partial" | "fail">("all");
  const [sendOpen, setSendOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get("/compliance/sra-audit");
      if (res.data && typeof res.data === "object" && res.data.score !== undefined) {
        setData(res.data);
      } else {
        // No valid audit data from API — show empty state
        setError("No audit data available. Run your first compliance scan to generate results.");
      }
    } catch (_err: any) {
      console.error('Error fetching SRA audit data:', _err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const buildPackHTML = (firmName: string, sraNumber: string, score: number, summary: AuditSummary | undefined, items: AuditItem[], generatedAt: string) => {
    const passing = items.filter(i => i.status === "pass");
    const failing = items.filter(i => i.status === "fail");
    const partial = items.filter(i => i.status === "partial");

    const statusIcon = (s: string) => s === "pass" ? "✅" : s === "fail" ? "❌" : "⚠️";

    const itemRows = items.map(item => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${statusIcon(item.status)}</td>
        <td style="padding:8px;border:1px solid #ddd;font-weight:600;">${item.standard}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.title}</td>
        <td style="padding:8px;border:1px solid #ddd;text-transform:uppercase;font-size:12px;font-weight:600;color:${item.status === 'pass' ? '#16a34a' : item.status === 'fail' ? '#dc2626' : '#d97706'}">${item.status}</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px;">${item.notes}</td>
      </tr>
    `).join("");

    const remediationRows = [...failing, ...partial].map(item => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${statusIcon(item.status)}</td>
        <td style="padding:8px;border:1px solid #ddd;font-weight:600;">${item.standard} — ${item.title}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.remediation_hint || "Review required"}</td>
        <td style="padding:8px;border:1px solid #ddd;font-size:12px;">Last reviewed: ${new Date(item.last_reviewed).toLocaleDateString("en-GB")}</td>
      </tr>
    `).join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SRA Visit Preparation Pack — ${firmName}</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 15mm; size: A4; } }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 900px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: white; padding: 30px; border-radius: 8px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 8px 0; font-size: 24px; } .header p { margin: 4px 0; opacity: 0.9; font-size: 14px; }
  .score-box { display: inline-block; background: white; color: #1e3a5f; border-radius: 12px; padding: 16px 24px; margin-top: 16px; text-align: center; }
  .score-box .score { font-size: 36px; font-weight: 700; } .score-box .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-card .num { font-size: 28px; font-weight: 700; } .summary-card .lbl { font-size: 12px; color: #64748b; margin-top: 4px; }
  h2 { color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 32px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { background: #f1f5f9; padding: 10px 8px; border: 1px solid #ddd; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  .action-needed { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; margin: 16px 0; font-size: 13px; }
  .print-btn { background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 16px 0; }
  .print-btn:hover { background: #1d4ed8; }
  @media print { .no-print { display: none !important; } }
</style></head><body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
  </div>
  <div class="header">
    <h1>SRA Visit Preparation Pack</h1>
    <p><strong>${firmName}</strong> | SRA No: ${sraNumber}</p>
    <p>Generated: ${new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} at ${new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
    <div class="score-box"><div class="score">${score}%</div><div class="label">Readiness Score</div></div>
  </div>

  <div class="summary-grid">
    <div class="summary-card"><div class="num">${summary?.total || items.length}</div><div class="lbl">Total Checks</div></div>
    <div class="summary-card"><div class="num" style="color:#16a34a">${summary?.passing || passing.length}</div><div class="lbl">Passing</div></div>
    <div class="summary-card"><div class="num" style="color:#d97706">${summary?.partial || partial.length}</div><div class="lbl">Partial</div></div>
    <div class="summary-card"><div class="num" style="color:#dc2626">${summary?.failing || failing.length}</div><div class="lbl">Failing</div></div>
  </div>

  ${failing.length > 0 ? `<div class="action-needed"><strong>⚠ Immediate action required:</strong> ${failing.length} check(s) are currently failing and must be addressed before an SRA visit.</div>` : ""}

  <h2>Full Compliance Checklist</h2>
  <table><thead><tr><th></th><th>Standard</th><th>Check</th><th>Status</th><th>Notes</th></tr></thead><tbody>${itemRows}</tbody></table>

  ${[...failing, ...partial].length > 0 ? `<h2>Remediation Actions Required</h2><table><thead><tr><th></th><th>Standard</th><th>Recommended Action</th><th>Review Date</th></tr></thead><tbody>${remediationRows}</tbody></table>` : ""}

  <h2>Preparation Notes for SRA Visit</h2>
  <ul style="font-size:13px;">
    <li>Ensure all evidence files referenced above are readily accessible</li>
    <li>COLP and COFA should review this pack and sign off before the visit</li>
    <li>All remediation items marked above should be completed or have documented progress</li>
    <li>Client account reconciliation records should be available for the last 12 months</li>
    <li>Staff training records and CPD logs should be up to date</li>
    <li>AML risk assessment and related policies must be current</li>
  </ul>

  <div class="footer">
    <p>CONFIDENTIAL — Prepared by Seema Compliance Platform for ${firmName}</p>
    <p>This document is generated for internal compliance purposes and SRA visit preparation.</p>
  </div>
</body></html>`;
  };

  const handleAiAssess = async () => {
    try {
      setAssessing(true);
      // AI analyses the firm's live data against the 12 SRA guidelines and
      // persists the result as the firm's audit items.
      const res = await apiClient.post("/compliance/sra-audit/ai-assess", undefined, { timeout: 120000 });
      if (res.data && res.data.score !== undefined) {
        setData(res.data);
        setError(null);
        setToast({ message: `AI assessment complete — readiness ${res.data.score}%`, type: "success" });
      }
    } catch (_err: any) {
      setToast({ message: _err?.response?.data?.message || "AI assessment failed", type: "error" });
    } finally {
      setAssessing(false);
    }
  };

  const handleGeneratePack = async () => {
    // Open window synchronously to avoid popup blocker
    const win = window.open("", "_blank");

    try {
      setGenerating(true);

      // Generating an SRA audit pack (PDF + AI summary) can take 60–90s.
      const res = await apiClient.post("/compliance/sra-audit/generate-pack", undefined, { timeout: 120000 });
      const { firm_name, sra_number, score: packScore, summary: packSummary } = res.data;
      const generatedAt = res.data.generated_at || new Date().toISOString();
      const html = buildPackHTML(
        firm_name || "Your Firm", sra_number || "N/A",
        packScore || data?.score || 0, packSummary || data?.summary, data?.items || [], generatedAt
      );
      if (win) {
        win.document.write(html);
        win.document.close();
      }
      setToast({ message: "SRA Visit Pack generated — use Print > Save as PDF", type: "success" });
    } catch (err: any) {
      if (win) { win.close(); }
      setToast({
        message: err?.response?.data?.detail || "Failed to generate pack",
        type: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  // Derive attention items (failing first, then partial, sorted by oldest review)
  const attentionItems: AuditItem[] = data
    ? [...data.items]
        .filter((i) => i.status !== "pass")
        .sort((a, b) => {
          if (a.status === "fail" && b.status !== "fail") return -1;
          if (a.status !== "fail" && b.status === "fail") return 1;
          return new Date(a.last_reviewed).getTime() - new Date(b.last_reviewed).getTime();
        })
        .slice(0, 3)
    : [];

  // Filter items by tab
  const filteredItems = data
    ? activeTab === "all"
      ? data.items
      : data.items.filter((i) => i.status === activeTab)
    : [];

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64" />
            <div className="bg-white rounded-xl p-8 h-64" />
            <div className="bg-white rounded-xl p-6 h-96" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl p-8 text-center">
            <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to load audit data</h2>
            <p className="text-gray-500 mb-4">{error}</p>
            <button
              onClick={fetchAudit}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SRA Audit Readiness</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gap analysis against SRA Standards &amp; Regulations
            </p>
          </div>
          <div className="flex items-center gap-3">
          <button
            onClick={handleAiAssess}
            disabled={assessing}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {assessing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run AI Assessment
              </>
            )}
          </button>
          <button
            onClick={() => setSendOpen(true)}
            className="inline-flex items-center gap-2 bg-white text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Send to recipient
          </button>
          <button
            onClick={handleGeneratePack}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate SRA Visit Pack
              </>
            )}
          </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero Card: Score + Attention Items ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Left: Score */}
            <div className="p-8 flex flex-col items-center text-center">
              <CircularProgress score={data.score} />

              <p className="mt-4 text-sm text-gray-600 leading-relaxed max-w-sm">
                Based on {data.summary.total} SRA Standards &amp; Regulations checks
                &mdash;{" "}
                <span className="font-medium text-green-700">{data.summary.passing} passing</span>,{" "}
                <span className="font-medium text-red-600">{data.summary.failing} failing</span>,{" "}
                <span className="font-medium text-amber-600">{data.summary.partial} partial</span>
              </p>

              <p className="mt-2 text-xs text-gray-400">
                Last assessed: {formatDate(data.assessed_at)}
              </p>

              <button
                onClick={() => setShowModal(true)}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors"
              >
                What is this score?
              </button>
            </div>

            {/* Right: Top 3 Items Needing Attention */}
            <div className="p-8">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                Top Items Needing Attention
              </h3>
              {attentionItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">All checks passing</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attentionItems.map((item, idx) => (
                    <a
                      key={item.id}
                      href={`#item-${item.id}`}
                      className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            item.status === "fail"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{item.standard}</p>
                            {item.remediation_hint && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {item.remediation_hint}
                              </p>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Checks",
              value: data.summary.total,
              color: "text-gray-900",
              bg: "bg-white",
            },
            {
              label: "Passing",
              value: data.summary.passing,
              color: "text-green-700",
              bg: "bg-green-50",
            },
            {
              label: "Partial",
              value: data.summary.partial,
              color: "text-amber-700",
              bg: "bg-amber-50",
            },
            {
              label: "Failing",
              value: data.summary.failing,
              color: "text-red-700",
              bg: "bg-red-50",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bg} rounded-xl border border-gray-200 p-4 shadow-sm`}
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {stat.label}
              </p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Audit Items List ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {/* Tab Filters */}
          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-6 -mb-px">
              {(["all", "pass", "partial", "fail"] as const).map((tab) => {
                const labels = {
                  all: "All Items",
                  pass: "Passing",
                  partial: "Partial",
                  fail: "Failing",
                };
                const counts = {
                  all: data.summary.total,
                  pass: data.summary.passing,
                  partial: data.summary.partial,
                  fail: data.summary.failing,
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {labels[tab]}{" "}
                    <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                      activeTab === tab ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {counts[tab]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Item List */}
          <div className="divide-y divide-gray-100">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                id={`item-${item.id}`}
                className="px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <StatusBadge status={item.status} />
                      <span className="text-xs text-gray-400 font-mono">{item.standard}</span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-gray-400">{item.category}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                    <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                    {item.notes && (
                      <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded px-3 py-2 border border-gray-100">
                        {item.notes}
                      </p>
                    )}
                    {item.remediation_hint && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 border border-amber-100">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{item.remediation_hint}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-gray-400">
                      {item.evidence_count} evidence item{item.evidence_count !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Reviewed {formatDate(item.last_reviewed)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="px-6 py-12 text-center text-gray-400">
                <p className="text-sm">No items in this category</p>
              </div>
            )}
          </div>
        </div>

        {/* Delivery history — past sends of this pack */}
        <PackDeliveryHistory packType="sra_audit" refreshKey={historyRefresh} />
      </div>

      {/* Modals & Toasts */}
      <SendPackModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        packType="sra_audit"
        onSent={() => setHistoryRefresh((n) => n + 1)}
      />
      <ScoreModal open={showModal} onClose={() => setShowModal(false)} />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
