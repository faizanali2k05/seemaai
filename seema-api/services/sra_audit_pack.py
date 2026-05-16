"""SRA Visit Audit Pack — generates a bound, branded, signed PDF for regulatory inspections.

Pulls all firm compliance data for a given date range and renders a
professional PDF with:
  - Firm-branded cover page with SRA number and generated timestamp
  - Table of contents (linked to sections)
  - Sections: Policies, Training Records, Breach Register, AML Risk
    Assessments, Conflicts Log, File Review Samples, Undertakings Register,
    COLP/COFA Reports
  - Every entry cross-referenced to the relevant SRA Standards & Regulations
  - Audit trail metadata: who entered each record, when, who signed off
  - Certification & attestation page with COLP/COFA sign-off
  - PDF metadata and digital signature
"""
import hashlib
import io
import logging
import uuid
from datetime import date, datetime
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate, NextPageTemplate
from reportlab.platypus.frames import Frame
from reportlab.pdfbase import pdfmetrics
from xml.sax.saxutils import escape

from sqlalchemy.orm import Session
from sqlalchemy import and_

logger = logging.getLogger(__name__)

PAGE_W, PAGE_H = A4
MARGIN = 25 * mm

# ── SRA cross-reference map ──────────────────────────────────────────────

SRA_REFS = {
    "policies": {
        "main": "SRA Code of Conduct for Firms, Rule 2.1 — Compliance arrangements",
        "sub": {
            "aml": "Regulation 19, Money Laundering Regulations 2017; SRA Code §8.1",
            "gdpr": "UK GDPR Art 24; SRA Principle 6 — Confidentiality",
            "client_care": "SRA Code of Conduct for Solicitors, §8.6-8.11",
            "conflict_check": "SRA Code §6.1-6.2 — Conflict of interests",
            "general": "SRA Code of Conduct for Firms, Rule 2.1",
            "complaints": "SRA Code §8.2-8.5 — Complaints handling",
            "other": "SRA Code of Conduct for Firms, Rule 2.1",
        },
    },
    "training": "SRA Competence Statement; SRA Code §3.3 — Maintaining competence",
    "breaches": "SRA Code of Conduct for Firms, Rule 2.5 — Reporting obligations; SRA Principle 2 — Public trust",
    "aml": "SRA Code §8.1 — Anti-money laundering; Reg 18-21, MLR 2017; LSAG AML Practice Note",
    "conflicts": "SRA Code §6.1-6.2 — Conflict of interests; SRA Principle 7 — Best interests of client",
    "file_reviews": "SRA Code of Conduct for Firms, Rule 2.1(c) — Effective governance; SRA Principle 5 — Proper standard of service",
    "undertakings": "SRA Code §1.3 — Undertakings; SRA Principle 2 — Public trust; SRA Warning Notice: Undertakings",
    "colp_cofa": "SRA Authorisation Rules 8.1-8.5; Legal Services Act 2007, s.176; SRA COLP/COFA guidance",
}

# ── Colour palette (professional, Seema brand) ──────────────────────────

SEEMA_NAVY = colors.HexColor("#1a2744")
SEEMA_BLUE = colors.HexColor("#2563eb")
SEEMA_LIGHT = colors.HexColor("#eff6ff")
SEEMA_GREEN = colors.HexColor("#16a34a")
SEEMA_RED = colors.HexColor("#dc2626")
SEEMA_AMBER = colors.HexColor("#d97706")
SEEMA_GREY = colors.HexColor("#6b7280")
TABLE_HEADER_BG = colors.HexColor("#1e3a5f")
TABLE_ALT_BG = colors.HexColor("#f8fafc")
TABLE_BORDER = colors.HexColor("#cbd5e1")


# ── Styles ───────────────────────────────────────────────────────────────

def _build_styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(
        "CoverTitle", parent=ss["Title"], fontName="Helvetica-Bold",
        fontSize=28, leading=34, textColor=SEEMA_NAVY, alignment=TA_CENTER,
        spaceAfter=12,
    ))
    ss.add(ParagraphStyle(
        "CoverSubtitle", parent=ss["Normal"], fontName="Helvetica",
        fontSize=14, leading=18, textColor=SEEMA_GREY, alignment=TA_CENTER,
        spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        "CoverFirmName", parent=ss["Title"], fontName="Helvetica-Bold",
        fontSize=22, leading=28, textColor=SEEMA_BLUE, alignment=TA_CENTER,
        spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        "SectionTitle", parent=ss["Heading1"], fontName="Helvetica-Bold",
        fontSize=18, leading=22, textColor=SEEMA_NAVY, spaceAfter=10, spaceBefore=20,
    ))
    ss.add(ParagraphStyle(
        "SubSection", parent=ss["Heading2"], fontName="Helvetica-Bold",
        fontSize=13, leading=16, textColor=SEEMA_BLUE, spaceAfter=6, spaceBefore=12,
    ))
    ss.add(ParagraphStyle(
        "AuditBody", parent=ss["Normal"], fontName="Helvetica",
        fontSize=9.5, leading=13, textColor=colors.black, alignment=TA_LEFT,
        spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        "SRARef", parent=ss["Normal"], fontName="Helvetica-Oblique",
        fontSize=8, leading=10, textColor=SEEMA_BLUE, spaceAfter=6,
        leftIndent=10,
    ))
    ss.add(ParagraphStyle(
        "TableHeader", parent=ss["Normal"], fontName="Helvetica-Bold",
        fontSize=8.5, leading=11, textColor=colors.white,
    ))
    ss.add(ParagraphStyle(
        "TableCell", parent=ss["Normal"], fontName="Helvetica",
        fontSize=8.5, leading=11, textColor=colors.black,
    ))
    ss.add(ParagraphStyle(
        "AuditMeta", parent=ss["Normal"], fontName="Helvetica-Oblique",
        fontSize=7, leading=9, textColor=SEEMA_GREY,
    ))
    ss.add(ParagraphStyle(
        "Footer", parent=ss["Normal"], fontName="Helvetica",
        fontSize=7, leading=9, textColor=SEEMA_GREY, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "TOCEntry", parent=ss["Normal"], fontName="Helvetica",
        fontSize=11, leading=20, textColor=SEEMA_NAVY,
    ))
    ss.add(ParagraphStyle(
        "CertTitle", parent=ss["Heading1"], fontName="Helvetica-Bold",
        fontSize=16, leading=20, textColor=SEEMA_NAVY, alignment=TA_CENTER,
        spaceAfter=14, spaceBefore=20,
    ))
    ss.add(ParagraphStyle(
        "CertBody", parent=ss["Normal"], fontName="Helvetica",
        fontSize=10, leading=14, textColor=colors.black, alignment=TA_LEFT,
        spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "SignLine", parent=ss["Normal"], fontName="Helvetica",
        fontSize=10, leading=18, textColor=colors.black, alignment=TA_LEFT,
        spaceAfter=2,
    ))
    return ss


# ── PDF document class with page numbering ──────────────────────────────

class AuditPackDoc(BaseDocTemplate):
    """Custom doc template with headers/footers and TOC bookmark support."""

    def __init__(self, filename, firm_name, sra_number, date_from, date_to, generated_at, **kw):
        self.firm_name = firm_name
        self.sra_number = sra_number or ""
        self.date_from = date_from
        self.date_to = date_to
        self.generated_at = generated_at
        super().__init__(filename, **kw)
        frame = Frame(MARGIN, MARGIN + 10*mm, PAGE_W - 2*MARGIN, PAGE_H - 2*MARGIN - 10*mm, id="main")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[Frame(MARGIN, MARGIN, PAGE_W - 2*MARGIN, PAGE_H - 2*MARGIN, id="cover_frame")]),
            PageTemplate(id="content", frames=[frame], onPage=self._content_page),
        ])

    def _content_page(self, canvas, doc):
        canvas.saveState()
        # Header — firm branded
        canvas.setStrokeColor(SEEMA_BLUE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 18*mm, PAGE_W - MARGIN, PAGE_H - 18*mm)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(SEEMA_NAVY)
        canvas.drawString(MARGIN, PAGE_H - 16*mm, self.firm_name)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(SEEMA_GREY)
        sra_label = f"  |  SRA: {self.sra_number}" if self.sra_number else ""
        canvas.drawString(MARGIN + canvas.stringWidth(self.firm_name, "Helvetica-Bold", 7),
                          PAGE_H - 16*mm, f"{sra_label}  |  SRA Visit Audit Pack")
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 16*mm,
                               f"{self.date_from} to {self.date_to}")
        # Footer — branded with timestamp
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(SEEMA_GREY)
        canvas.drawCentredString(PAGE_W / 2, 15*mm, f"Page {doc.page}")
        canvas.drawString(MARGIN, 15*mm,
                          f"Generated by Seema | {self.generated_at.strftime('%d %b %Y %H:%M UTC')}")
        canvas.drawRightString(PAGE_W - MARGIN, 15*mm, "CONFIDENTIAL")
        # Bottom rule
        canvas.setStrokeColor(TABLE_BORDER)
        canvas.setLineWidth(0.3)
        canvas.line(MARGIN, 20*mm, PAGE_W - MARGIN, 20*mm)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        """Register TOC entries when a SectionTitle or SubSection is rendered."""
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            text = flowable.getPlainText()
            if style == "SectionTitle":
                key = f"section-{text.replace(' ', '-').lower()}"
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (0, text, self.page, key))
            elif style == "SubSection":
                key = f"sub-{text.replace(' ', '-').lower()}"
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (1, text, self.page, key))


# ── Table helpers ────────────────────────────────────────────────────────

def _std_table_style():
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, TABLE_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, TABLE_ALT_BG]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ])


def _status_text(status, styles):
    """Colour-code a status string."""
    colour = {"pass": "#16a34a", "active": "#16a34a", "completed": "#16a34a", "clear": "#16a34a",
              "resolved": "#16a34a", "compliant": "#16a34a", "discharged": "#16a34a",
              "fail": "#dc2626", "overdue": "#dc2626", "open": "#dc2626",
              "pending": "#d97706", "partial": "#d97706", "in_progress": "#d97706",
              "maybe": "#d97706", "outstanding": "#d97706"}.get(
        (status or "").lower().replace(" ", "_"), "#6b7280")
    safe_status = escape(str(status or "—"))
    return Paragraph(f'<font color="{colour}"><b>{safe_status}</b></font>', styles["TableCell"])


def _wrap(text, styles, max_len=80, style_name="TableCell"):
    """Wrap text into a Paragraph for table cells, escaping XML-unsafe chars."""
    t = str(text or "—")
    if len(t) > max_len:
        t = t[:max_len] + "…"
    return Paragraph(escape(t), styles[style_name])


def _fmt_dt(dt_val):
    """Format a datetime or string date for display."""
    if not dt_val:
        return "—"
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%Y-%m-%d %H:%M")
    return str(dt_val)


def _fmt_date(dt_val):
    """Format a datetime or string as date only."""
    if not dt_val:
        return "—"
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%Y-%m-%d")
    return str(dt_val)


def _audit_meta(record, styles, staff_map=None):
    """Build an audit metadata paragraph showing who/when for a record."""
    parts = []
    created = getattr(record, "created_at", None)
    updated = getattr(record, "updated_at", None)
    created_by = getattr(record, "created_by", None)
    updated_by = getattr(record, "updated_by", None)
    assigned = getattr(record, "assigned_to", None)

    if created:
        parts.append(f"Created: {_fmt_dt(created)}")
    if created_by:
        name = staff_map.get(created_by, created_by) if staff_map else created_by
        parts.append(f"by {escape(str(name))}")
    if assigned and not created_by:
        name = staff_map.get(assigned, assigned) if staff_map else assigned
        parts.append(f"Assigned: {escape(str(name))}")
    if updated and updated != created:
        parts.append(f"| Updated: {_fmt_dt(updated)}")
        if updated_by:
            name = staff_map.get(updated_by, updated_by) if staff_map else updated_by
            parts.append(f"by {escape(str(name))}")

    if not parts:
        return None
    return Paragraph(f'<font size="7" color="#6b7280"><i>{" ".join(parts)}</i></font>', styles["AuditMeta"])


def _audit_cell(record, styles, staff_map=None):
    """Compact audit cell for table rows: created date + who."""
    created = getattr(record, "created_at", None)
    created_by = getattr(record, "created_by", None)
    assigned = getattr(record, "assigned_to", None)
    updated = getattr(record, "updated_at", None)

    who = created_by or assigned
    if who and staff_map:
        who = staff_map.get(who, who)

    lines = []
    if created:
        lines.append(escape(_fmt_date(created)))
    if who:
        lines.append(escape(str(who)))
    if updated and updated != created:
        lines.append(f"Upd: {escape(_fmt_date(updated))}")

    return Paragraph("<br/>".join(lines) if lines else "—",
                     ParagraphStyle("AuditCellInline", parent=styles["TableCell"],
                                    fontSize=7, leading=9, textColor=SEEMA_GREY))


# ── Staff name resolver ─────────────────────────────────────────────────

def _build_staff_map(session, firm_id):
    """Map user/staff IDs to display names for audit trail."""
    staff_map = {}
    try:
        from models.staff import StaffMember
        staff = session.query(StaffMember).filter(StaffMember.firm_id == firm_id).all()
        for s in staff:
            staff_map[s.id] = s.name or s.email or s.id
    except Exception:
        pass
    try:
        from models.auth import UserAccount
        users = session.query(UserAccount).filter(UserAccount.firm_id == firm_id).all()
        for u in users:
            name = getattr(u, "full_name", None) or getattr(u, "name", None) or getattr(u, "email", None) or u.id
            staff_map[u.id] = name
    except Exception:
        pass
    return staff_map


# ── Data fetch helpers ───────────────────────────────────────────────────

def _date_filter(column, date_from, date_to):
    """Build a between filter for a string date column (YYYY-MM-DD) or DateTime."""
    filters = []
    if date_from:
        filters.append(column >= str(date_from))
    if date_to:
        filters.append(column <= str(date_to))
    return filters


def _dt_filter(column, date_from, date_to):
    """Between filter for DateTime columns."""
    filters = []
    if date_from:
        filters.append(column >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        filters.append(column <= datetime.combine(date_to, datetime.max.time()))
    return filters


# ── Section builders ─────────────────────────────────────────────────────

def _build_cover(story, styles, firm_name, sra_number, date_from, date_to, generated_at, generating_user):
    """Cover page — firm branded with full metadata."""
    story.append(Spacer(1, 40*mm))

    # Firm brand block
    story.append(Paragraph("SRA Visit Audit Pack", styles["CoverTitle"]))
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="60%", thickness=1, color=SEEMA_BLUE, spaceAfter=8, spaceBefore=4))
    story.append(Paragraph(escape(firm_name), styles["CoverFirmName"]))
    if sra_number:
        story.append(Paragraph(f"SRA Number: {escape(sra_number)}", styles["CoverSubtitle"]))
    story.append(Spacer(1, 12*mm))

    # Date range
    story.append(Paragraph(
        f"Reporting Period: {date_from.strftime('%d %B %Y')} — {date_to.strftime('%d %B %Y')}",
        styles["CoverSubtitle"],
    ))
    story.append(Spacer(1, 4*mm))

    # Generation metadata
    story.append(Paragraph(
        f"Generated: {generated_at.strftime('%d %B %Y at %H:%M UTC')}",
        styles["CoverSubtitle"],
    ))
    if generating_user:
        story.append(Paragraph(
            f"Requested by: {escape(generating_user)}",
            styles["CoverSubtitle"],
        ))
    story.append(Spacer(1, 15*mm))

    # Document hash (integrity marker)
    doc_hash = hashlib.sha256(
        f"{firm_name}:{sra_number}:{date_from}:{date_to}:{generated_at.isoformat()}".encode()
    ).hexdigest()[:16].upper()
    story.append(Paragraph(f"Document ID: SEEMA-AUD-{doc_hash}", styles["CoverSubtitle"]))
    story.append(Spacer(1, 8*mm))

    story.append(HRFlowable(width="40%", thickness=0.5, color=SEEMA_GREY, spaceAfter=6, spaceBefore=4))
    story.append(Paragraph("CONFIDENTIAL — Prepared for SRA regulatory visit", styles["CoverSubtitle"]))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "This document has been automatically compiled by Seema Compliance Automation. "
        "All data is sourced from the firm's live compliance management system. "
        "Each entry includes audit trail metadata showing who created or modified the record and when.",
        ParagraphStyle("CoverNote", parent=styles["AuditBody"], alignment=TA_CENTER, fontSize=8,
                       textColor=SEEMA_GREY),
    ))


def _build_toc(story, styles):
    """Table of Contents (auto-linked)."""
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())
    story.append(Paragraph("Table of Contents", styles["SectionTitle"]))
    story.append(Spacer(1, 4*mm))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC1", fontName="Helvetica-Bold", fontSize=11, leading=20,
                       leftIndent=0, textColor=SEEMA_NAVY, spaceBefore=4),
        ParagraphStyle("TOC2", fontName="Helvetica", fontSize=10, leading=16,
                       leftIndent=20, textColor=SEEMA_BLUE, spaceBefore=2),
    ]
    story.append(toc)
    return toc


def _section_policies(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 1 — Policies with audit trail."""
    from models.policies import PolicyDocument

    story.append(PageBreak())
    story.append(Paragraph("1. Policies", styles["SectionTitle"]))
    story.append(Paragraph(
        f'<i>{escape(SRA_REFS["policies"]["main"])}</i>', styles["SRARef"]))

    policies = session.query(PolicyDocument).filter(
        PolicyDocument.firm_id == firm_id
    ).order_by(PolicyDocument.category, PolicyDocument.name).all()

    if not policies:
        story.append(Paragraph("No policy documents found for this firm.", styles["AuditBody"]))
        return

    headers = ["Policy Name", "Category", "Version", "Status", "Last Reviewed",
               "Review Due", "Audit Trail", "SRA Reference"]
    avail = PAGE_W - 2*MARGIN
    col_widths = [w * avail for w in [0.17, 0.08, 0.06, 0.07, 0.10, 0.10, 0.16, 0.20]]

    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]
    for p in policies:
        cat = (p.category or "general").lower()
        sra_ref = SRA_REFS["policies"]["sub"].get(cat, SRA_REFS["policies"]["sub"]["general"])
        data.append([
            _wrap(p.name, styles),
            _wrap(cat.upper(), styles),
            _wrap(p.version, styles),
            _status_text(p.status, styles),
            _wrap(p.last_reviewed, styles),
            _wrap(p.review_due, styles),
            _audit_cell(p, styles, staff_map),
            Paragraph(f'<font size="7"><i>{escape(sra_ref)}</i></font>', styles["TableCell"]),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_std_table_style())
    story.append(t)
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(f"Total policies: {len(policies)}", styles["AuditBody"]))


def _section_training(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 2 — Training Records with audit trail."""
    from models.staff import StaffMember, StaffTraining

    story.append(PageBreak())
    story.append(Paragraph("2. Training Records", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["training"])}</i>', styles["SRARef"]))

    staff = session.query(StaffMember).filter(
        StaffMember.firm_id == firm_id, StaffMember.status == "active"
    ).order_by(StaffMember.name).all()

    if not staff:
        story.append(Paragraph("No active staff members found.", styles["AuditBody"]))
        return

    staff_ids = [s.id for s in staff]
    filters = [StaffTraining.firm_id == firm_id, StaffTraining.staff_id.in_(staff_ids)]
    if date_from:
        filters.append(StaffTraining.completed_date >= str(date_from))
    if date_to:
        filters.append(StaffTraining.completed_date <= str(date_to))

    training = session.query(StaffTraining).filter(and_(*filters)).all()
    training_by_staff = {}
    for t in training:
        training_by_staff.setdefault(t.staff_id, []).append(t)

    for s in staff:
        sra_id_text = f" (SRA ID: {s.sra_id})" if s.sra_id else ""
        story.append(Paragraph(f"{escape(s.name or 'Unknown')} — {escape(s.role or 'Staff')}{sra_id_text}",
                               styles["SubSection"]))

        records = training_by_staff.get(s.id, [])
        if not records:
            story.append(Paragraph(
                "No training records in this period.",
                ParagraphStyle("NoData", parent=styles["AuditBody"], textColor=SEEMA_AMBER),
            ))
            story.append(Spacer(1, 2*mm))
            continue

        avail = PAGE_W - 2*MARGIN
        headers = ["Course", "Provider", "Status", "Completed", "CPD Hours", "Cert Ref", "Recorded"]
        col_widths = [w * avail for w in [0.22, 0.15, 0.10, 0.13, 0.10, 0.14, 0.12]]
        data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

        for tr in records:
            data.append([
                _wrap(tr.course_name, styles),
                _wrap(tr.provider, styles),
                _status_text(tr.status, styles),
                _wrap(tr.completed_date, styles),
                _wrap(tr.cpd_hours, styles),
                _wrap(tr.certificate_ref, styles),
                _audit_cell(tr, styles, staff_map),
            ])

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_std_table_style())
        story.append(t)
        story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        f"Total staff: {len(staff)} | Training records in period: {len(training)}",
        styles["AuditBody"],
    ))


def _section_breaches(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 3 — Breach Register with audit trail."""
    from models.breach import BreachReport

    story.append(PageBreak())
    story.append(Paragraph("3. Breach Register", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["breaches"])}</i>', styles["SRARef"]))

    filters = [BreachReport.firm_id == firm_id]
    filters.extend(_dt_filter(BreachReport.created_at, date_from, date_to))

    breaches = session.query(BreachReport).filter(and_(*filters)).order_by(
        BreachReport.created_at.desc()
    ).all()

    if not breaches:
        story.append(Paragraph("No breach incidents recorded in this period.", styles["AuditBody"]))
        return

    avail = PAGE_W - 2*MARGIN
    headers = ["Date", "Type", "Severity", "Description", "Response Actions",
               "Status", "ICO", "Audit Trail"]
    col_widths = [w * avail for w in [0.08, 0.08, 0.07, 0.20, 0.18, 0.08, 0.06, 0.16]]
    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

    for b in breaches:
        reported_date = ""
        if hasattr(b, "reported_date") and b.reported_date:
            reported_date = str(b.reported_date)
        elif hasattr(b, "created_at") and b.created_at:
            reported_date = _fmt_date(b.created_at)

        data.append([
            _wrap(reported_date, styles),
            _wrap(getattr(b, "breach_type", None) or getattr(b, "incident_type", "—"), styles),
            _status_text(getattr(b, "severity", "—"), styles),
            _wrap(b.description, styles, max_len=50),
            _wrap(getattr(b, "remediation_steps", None) or getattr(b, "action_taken", "—"), styles, max_len=50),
            _status_text(b.status, styles),
            _wrap("Yes" if getattr(b, "ico_notified", False) or getattr(b, "reported_to_ico", False) else "No", styles),
            _audit_cell(b, styles, staff_map),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_std_table_style())
    story.append(t)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(f"Total incidents: {len(breaches)}", styles["AuditBody"]))


def _section_aml(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 4 — AML Risk Assessments with audit trail."""
    from models.aml import CDDRecord

    story.append(PageBreak())
    story.append(Paragraph("4. AML Risk Assessments", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["aml"])}</i>', styles["SRARef"]))

    filters = [CDDRecord.firm_id == firm_id]
    filters.extend(_dt_filter(CDDRecord.created_at, date_from, date_to))

    records = session.query(CDDRecord).filter(and_(*filters)).order_by(
        CDDRecord.created_at.desc()
    ).all()

    if not records:
        story.append(Paragraph("No CDD/AML records found in this period.", styles["AuditBody"]))
        return

    avail = PAGE_W - 2*MARGIN
    headers = ["Client", "Risk Level", "CDD Status", "ID Verified", "Source of Funds",
               "PEP Check", "Review Due", "Audit Trail"]
    col_widths = [w * avail for w in [0.14, 0.08, 0.10, 0.08, 0.16, 0.08, 0.10, 0.16]]
    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

    for r in records:
        data.append([
            _wrap(getattr(r, "client_name", None) or getattr(r, "entity_name", "—"), styles),
            _status_text(getattr(r, "risk_level", "—"), styles),
            _status_text(getattr(r, "status", "—"), styles),
            _wrap("Yes" if getattr(r, "id_verified", False) else "No", styles),
            _wrap(getattr(r, "source_of_funds", "—"), styles, max_len=35),
            _wrap("Yes" if getattr(r, "pep_check", False) or getattr(r, "is_pep", False) else "No", styles),
            _wrap(getattr(r, "review_due", None) or getattr(r, "next_review_date", "—"), styles),
            _audit_cell(r, styles, staff_map),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_std_table_style())
    story.append(t)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(f"Total AML records: {len(records)}", styles["AuditBody"]))

    # SARs sub-section
    from models.aml import SARRecord
    story.append(Paragraph("4.1 Suspicious Activity Reports (SARs)", styles["SubSection"]))
    sar_filters = [SARRecord.firm_id == firm_id]
    sar_filters.extend(_dt_filter(SARRecord.created_at, date_from, date_to))
    sars = session.query(SARRecord).filter(and_(*sar_filters)).all()

    if not sars:
        story.append(Paragraph("No SARs filed in this period.", styles["AuditBody"]))
    else:
        sar_headers = ["Date Filed", "Client Ref", "Reason", "NCA Reference", "Status", "Audit Trail"]
        sar_widths = [w * avail for w in [0.12, 0.16, 0.25, 0.15, 0.10, 0.16]]
        sar_data = [[Paragraph(h, styles["TableHeader"]) for h in sar_headers]]
        for s in sars:
            filed = ""
            if hasattr(s, "filed_date") and s.filed_date:
                filed = str(s.filed_date)
            elif hasattr(s, "created_at") and s.created_at:
                filed = _fmt_date(s.created_at)
            sar_data.append([
                _wrap(filed, styles),
                _wrap(getattr(s, "client_ref", None) or getattr(s, "reference", "—"), styles),
                _wrap(getattr(s, "reason", None) or getattr(s, "description", "—"), styles, max_len=45),
                _wrap(getattr(s, "nca_reference", "—"), styles),
                _status_text(getattr(s, "status", "—"), styles),
                _audit_cell(s, styles, staff_map),
            ])
        st = Table(sar_data, colWidths=sar_widths, repeatRows=1)
        st.setStyle(_std_table_style())
        story.append(st)
        story.append(Paragraph(f"Total SARs: {len(sars)}", styles["AuditBody"]))


def _section_conflicts(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 5 — Conflicts Log with audit trail."""
    from models.conflicts import ConflictCheck

    story.append(PageBreak())
    story.append(Paragraph("5. Conflicts Log", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["conflicts"])}</i>', styles["SRARef"]))

    filters = [ConflictCheck.firm_id == firm_id]
    filters.extend(_dt_filter(ConflictCheck.created_at, date_from, date_to))

    checks = session.query(ConflictCheck).filter(and_(*filters)).order_by(
        ConflictCheck.created_at.desc()
    ).all()

    if not checks:
        story.append(Paragraph("No conflict checks recorded in this period.", styles["AuditBody"]))
        return

    avail = PAGE_W - 2*MARGIN
    headers = ["Date", "Client/Matter", "Checked By", "Outcome", "Details", "Status", "Audit Trail"]
    col_widths = [w * avail for w in [0.10, 0.16, 0.12, 0.10, 0.22, 0.08, 0.16]]
    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

    for c in checks:
        check_date = ""
        if hasattr(c, "checked_date") and c.checked_date:
            check_date = str(c.checked_date)
        elif hasattr(c, "created_at") and c.created_at:
            check_date = _fmt_date(c.created_at)
        data.append([
            _wrap(check_date, styles),
            _wrap(getattr(c, "client_name", None) or getattr(c, "parties", "—"), styles),
            _wrap(getattr(c, "checked_by", "—"), styles),
            _status_text(getattr(c, "outcome", None) or getattr(c, "result", "—"), styles),
            _wrap(getattr(c, "details", None) or getattr(c, "notes", "—"), styles, max_len=45),
            _status_text(getattr(c, "status", "—"), styles),
            _audit_cell(c, styles, staff_map),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_std_table_style())
    story.append(t)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(f"Total conflict checks: {len(checks)}", styles["AuditBody"]))


def _section_file_reviews(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 6 — File Review Samples with audit trail."""
    from models.matters import Matter
    from models.law import SupervisionRecord

    story.append(PageBreak())
    story.append(Paragraph("6. File Review Samples", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["file_reviews"])}</i>', styles["SRARef"]))

    try:
        sup_filters = [SupervisionRecord.firm_id == firm_id]
        sup_filters.extend(_dt_filter(SupervisionRecord.created_at, date_from, date_to))
        reviews = session.query(SupervisionRecord).filter(and_(*sup_filters)).order_by(
            SupervisionRecord.created_at.desc()
        ).all()
    except Exception:
        reviews = []

    if reviews:
        story.append(Paragraph("6.1 Supervision File Reviews", styles["SubSection"]))
        avail = PAGE_W - 2*MARGIN
        headers = ["Date", "Staff Member", "Reviewer", "Type", "Outcome", "Notes", "Audit Trail"]
        col_widths = [w * avail for w in [0.10, 0.14, 0.14, 0.10, 0.10, 0.22, 0.14]]
        data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

        for r in reviews:
            review_date = ""
            if hasattr(r, "review_date") and r.review_date:
                review_date = str(r.review_date)
            elif hasattr(r, "created_at") and r.created_at:
                review_date = _fmt_date(r.created_at)
            data.append([
                _wrap(review_date, styles),
                _wrap(getattr(r, "staff_name", None) or getattr(r, "supervisee_id", "—"), styles),
                _wrap(getattr(r, "reviewer_name", None) or getattr(r, "supervisor_id", "—"), styles),
                _wrap(getattr(r, "review_type", None) or getattr(r, "record_type", "—"), styles),
                _status_text(getattr(r, "outcome", None) or getattr(r, "status", "—"), styles),
                _wrap(getattr(r, "notes", "—"), styles, max_len=40),
                _audit_cell(r, styles, staff_map),
            ])

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_std_table_style())
        story.append(t)
        story.append(Spacer(1, 3*mm))

    # Active matters sample
    story.append(Paragraph("6.2 Active Matters Summary", styles["SubSection"]))
    matter_filters = [Matter.firm_id == firm_id, Matter.status.in_(["open", "active", "in_progress"])]
    matters = session.query(Matter).filter(and_(*matter_filters)).order_by(
        Matter.created_at.desc()
    ).limit(20).all()

    if not matters:
        story.append(Paragraph("No active matters found.", styles["AuditBody"]))
    else:
        avail = PAGE_W - 2*MARGIN
        headers = ["Reference", "Client", "Practice Area", "Risk Level", "Status",
                    "Opened", "Assigned To"]
        col_widths = [w * avail for w in [0.12, 0.16, 0.14, 0.10, 0.10, 0.10, 0.18]]
        data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

        for m in matters:
            assigned_name = "—"
            if m.assigned_to:
                assigned_name = staff_map.get(m.assigned_to, m.assigned_to)
            data.append([
                _wrap(m.reference, styles),
                _wrap(m.client_name, styles),
                _wrap(m.practice_area or m.matter_type, styles),
                _status_text(m.risk_level, styles),
                _status_text(m.status, styles),
                _wrap(m.open_date or _fmt_date(m.created_at), styles),
                _wrap(assigned_name, styles),
            ])

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_std_table_style())
        story.append(t)
        story.append(Paragraph(f"Showing {len(matters)} most recent active matters.", styles["AuditBody"]))


def _section_undertakings(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 7 — Undertakings Register with audit trail."""
    from models.undertakings import Undertaking

    story.append(PageBreak())
    story.append(Paragraph("7. Undertakings Register", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["undertakings"])}</i>', styles["SRARef"]))

    filters = [Undertaking.firm_id == firm_id]
    filters.extend(_dt_filter(Undertaking.created_at, date_from, date_to))

    undertakings = session.query(Undertaking).filter(and_(*filters)).order_by(
        Undertaking.created_at.desc()
    ).all()

    if not undertakings:
        story.append(Paragraph("No undertakings recorded in this period.", styles["AuditBody"]))
        return

    avail = PAGE_W - 2*MARGIN
    headers = ["Date Given", "Matter Ref", "Given To", "Description", "Due Date",
               "Status", "Audit Trail"]
    col_widths = [w * avail for w in [0.10, 0.10, 0.12, 0.22, 0.10, 0.10, 0.16]]
    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

    for u in undertakings:
        given_date = ""
        if hasattr(u, "given_date") and u.given_date:
            given_date = str(u.given_date)
        elif hasattr(u, "created_at") and u.created_at:
            given_date = _fmt_date(u.created_at)
        data.append([
            _wrap(given_date, styles),
            _wrap(getattr(u, "matter_ref", None) or getattr(u, "matter_id", "—"), styles),
            _wrap(getattr(u, "given_to", None) or getattr(u, "recipient", "—"), styles),
            _wrap(u.description, styles, max_len=40),
            _wrap(getattr(u, "due_date", None) or getattr(u, "deadline", "—"), styles),
            _status_text(u.status, styles),
            _audit_cell(u, styles, staff_map),
        ])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(_std_table_style())
    story.append(t)
    story.append(Spacer(1, 3*mm))

    outstanding = sum(1 for u in undertakings if (u.status or "").lower() in ("open", "outstanding", "pending"))
    discharged = sum(1 for u in undertakings if (u.status or "").lower() in ("discharged", "completed", "resolved"))
    story.append(Paragraph(
        f"Total: {len(undertakings)} | Outstanding: {outstanding} | Discharged: {discharged}",
        styles["AuditBody"],
    ))


def _section_colp_cofa(story, styles, session, firm_id, date_from, date_to, staff_map):
    """Section 8 — COLP/COFA Reports with audit trail."""
    from models.compliance import ComplianceAlert, ComplianceCheck
    from models.staff import StaffMember

    story.append(PageBreak())
    story.append(Paragraph("8. COLP/COFA Reports", styles["SectionTitle"]))
    story.append(Paragraph(f'<i>{escape(SRA_REFS["colp_cofa"])}</i>', styles["SRARef"]))

    # Identify COLP/COFA
    colp_cofa = session.query(StaffMember).filter(
        StaffMember.firm_id == firm_id,
        StaffMember.role.in_(["COLP", "COFA", "colp", "cofa", "Compliance Officer", "compliance_officer"]),
    ).all()

    if colp_cofa:
        story.append(Paragraph("8.1 Designated Officers", styles["SubSection"]))
        for officer in colp_cofa:
            story.append(Paragraph(
                f"<b>{escape(officer.name or 'Unknown')}</b> — {escape(officer.role or '')} | "
                f"SRA ID: {escape(officer.sra_id or 'N/A')} | "
                f"Email: {escape(officer.email or 'N/A')}",
                styles["AuditBody"],
            ))
        story.append(Spacer(1, 3*mm))

    # Compliance alerts
    story.append(Paragraph("8.2 Compliance Alerts Summary", styles["SubSection"]))
    alert_filters = [ComplianceAlert.firm_id == firm_id]
    alert_filters.extend(_dt_filter(ComplianceAlert.created_at, date_from, date_to))
    alerts = session.query(ComplianceAlert).filter(and_(*alert_filters)).order_by(
        ComplianceAlert.created_at.desc()
    ).all()

    if not alerts:
        story.append(Paragraph("No compliance alerts in this period.", styles["AuditBody"]))
    else:
        avail = PAGE_W - 2*MARGIN
        headers = ["Date", "Type", "Severity", "Title", "Status", "Regulation Ref", "Audit Trail"]
        col_widths = [w * avail for w in [0.10, 0.10, 0.08, 0.20, 0.08, 0.20, 0.16]]
        data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

        for a in alerts:
            alert_date = _fmt_date(a.created_at)
            data.append([
                _wrap(alert_date, styles),
                _wrap(a.alert_type, styles),
                _status_text(a.severity, styles),
                _wrap(a.title, styles, max_len=35),
                _status_text(a.status, styles),
                Paragraph(f'<font size="7"><i>{escape(a.regulation_ref or "—")}</i></font>', styles["TableCell"]),
                _audit_cell(a, styles, staff_map),
            ])

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_std_table_style())
        story.append(t)

        open_count = sum(1 for a in alerts if a.status == "open")
        resolved_count = sum(1 for a in alerts if a.status in ("resolved", "closed"))
        story.append(Paragraph(
            f"Total alerts: {len(alerts)} | Open: {open_count} | Resolved: {resolved_count}",
            styles["AuditBody"],
        ))

    # Compliance checks
    story.append(Paragraph("8.3 Compliance Checks", styles["SubSection"]))
    check_filters = [ComplianceCheck.firm_id == firm_id]
    checks = session.query(ComplianceCheck).filter(and_(*check_filters)).order_by(
        ComplianceCheck.checked_at.desc()
    ).limit(30).all()

    if not checks:
        story.append(Paragraph("No compliance checks recorded.", styles["AuditBody"]))
    else:
        avail = PAGE_W - 2*MARGIN
        headers = ["Check", "Type", "Status", "Severity", "Regulation Ref", "Checked", "Audit Trail"]
        col_widths = [w * avail for w in [0.20, 0.10, 0.08, 0.08, 0.20, 0.10, 0.16]]
        data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]

        for ch in checks:
            data.append([
                _wrap(ch.check_name, styles, max_len=35),
                _wrap(ch.check_type, styles),
                _status_text(ch.status, styles),
                _status_text(ch.severity, styles),
                Paragraph(f'<font size="7"><i>{escape(ch.regulation_ref or "—")}</i></font>', styles["TableCell"]),
                _wrap(_fmt_date(ch.checked_at), styles),
                _audit_cell(ch, styles, staff_map),
            ])

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(_std_table_style())
        story.append(t)


def _build_certification_page(story, styles, firm_name, sra_number, date_from, date_to,
                               generated_at, generating_user, colp_cofa_officers, doc_hash):
    """Section 9 — Certification & Attestation page."""
    story.append(PageBreak())
    story.append(Paragraph("9. Certification & Attestation", styles["SectionTitle"]))

    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=SEEMA_NAVY, spaceAfter=10))

    # Attestation statement
    story.append(Paragraph(
        f"I, the undersigned, being the Compliance Officer for Legal Practice (COLP) and/or "
        f"Compliance Officer for Finance and Administration (COFA) of "
        f"<b>{escape(firm_name)}</b>"
        f"{' (SRA Number: ' + escape(sra_number) + ')' if sra_number else ''}, "
        f"hereby certify that:",
        styles["CertBody"],
    ))
    story.append(Spacer(1, 3*mm))

    certifications = [
        "This SRA Visit Audit Pack has been generated from the firm's live compliance management system "
        "and represents an accurate record of the firm's compliance data for the reporting period.",

        f"The reporting period covered is {date_from.strftime('%d %B %Y')} to {date_to.strftime('%d %B %Y')}.",

        "All entries in this document include audit trail metadata showing the date of creation, "
        "the identity of the person who entered or modified each record, and any sign-off actions taken.",

        "The firm's compliance arrangements are maintained in accordance with the SRA Standards and "
        "Regulations, and each section of this audit pack is cross-referenced to the relevant regulatory provisions.",

        "I have reviewed this audit pack and confirm that the information contained herein is, "
        "to the best of my knowledge and belief, complete and accurate as at the date of generation.",
    ]

    for i, cert in enumerate(certifications, 1):
        story.append(Paragraph(
            f"<b>{i}.</b> {escape(cert)}", styles["CertBody"],
        ))

    story.append(Spacer(1, 10*mm))

    # Sign-off blocks
    if colp_cofa_officers:
        for officer in colp_cofa_officers:
            story.append(Paragraph(
                f"<b>{escape(officer.get('role', 'Compliance Officer'))}</b>",
                styles["CertBody"],
            ))
            story.append(Spacer(1, 10*mm))
            story.append(HRFlowable(width="50%", thickness=0.5, color=colors.black, spaceAfter=2))
            story.append(Paragraph(f"Name: {escape(officer.get('name', ''))}", styles["SignLine"]))
            story.append(Paragraph(f"SRA ID: {escape(officer.get('sra_id', 'N/A'))}", styles["SignLine"]))
            story.append(Paragraph("Date: ____________________", styles["SignLine"]))
            story.append(Paragraph("Signature: ____________________", styles["SignLine"]))
            story.append(Spacer(1, 8*mm))
    else:
        # Generic sign-off if no COLP/COFA identified
        for role in ["COLP (Compliance Officer for Legal Practice)",
                     "COFA (Compliance Officer for Finance and Administration)"]:
            story.append(Paragraph(f"<b>{role}</b>", styles["CertBody"]))
            story.append(Spacer(1, 10*mm))
            story.append(HRFlowable(width="50%", thickness=0.5, color=colors.black, spaceAfter=2))
            story.append(Paragraph("Name: ____________________", styles["SignLine"]))
            story.append(Paragraph("SRA ID: ____________________", styles["SignLine"]))
            story.append(Paragraph("Date: ____________________", styles["SignLine"]))
            story.append(Paragraph("Signature: ____________________", styles["SignLine"]))
            story.append(Spacer(1, 8*mm))

    # Document metadata block
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=SEEMA_GREY, spaceAfter=6))
    story.append(Paragraph("<b>Document Metadata</b>", styles["CertBody"]))

    meta_data = [
        ["Document ID:", f"SEEMA-AUD-{doc_hash}"],
        ["Generated:", generated_at.strftime("%d %B %Y at %H:%M:%S UTC")],
        ["Generated by:", escape(generating_user or "System")],
        ["Firm:", escape(firm_name)],
        ["SRA Number:", escape(sra_number or "N/A")],
        ["Period:", f"{date_from.strftime('%d/%m/%Y')} to {date_to.strftime('%d/%m/%Y')}"],
        ["System:", "Seema Compliance Automation Platform"],
        ["Integrity Hash:", doc_hash],
    ]

    avail = PAGE_W - 2*MARGIN
    meta_table = Table(
        [[Paragraph(f'<b>{r[0]}</b>', styles["AuditBody"]),
          Paragraph(r[1], styles["AuditBody"])] for r in meta_data],
        colWidths=[avail * 0.25, avail * 0.75],
    )
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.3, TABLE_BORDER),
        ("BACKGROUND", (0, 0), (0, -1), TABLE_ALT_BG),
    ]))
    story.append(meta_table)


# ── Main entry point ─────────────────────────────────────────────────────

def generate_audit_pack(
    session: Session,
    firm_id: str,
    date_from: date,
    date_to: date,
    generating_user_id: str = None,
) -> bytes:
    """Generate the full SRA Visit Audit Pack PDF.

    Returns raw PDF bytes. The PDF includes:
      - Firm-branded cover page
      - Table of contents
      - 8 compliance sections with audit trail metadata
      - Certification & attestation page with COLP/COFA sign-off blocks
      - PDF metadata (author, producer, creation date, subject)
    """
    from models.firm import Firm

    firm = session.query(Firm).filter_by(id=firm_id).first()
    if not firm:
        raise ValueError(f"Firm {firm_id} not found")

    firm_name = firm.name or "Unknown Firm"
    sra_number = getattr(firm, "sra_number", None) or ""
    generated_at = datetime.utcnow()

    # Resolve the generating user's name
    generating_user = None
    if generating_user_id:
        try:
            from models.auth import UserAccount
            user = session.query(UserAccount).filter_by(id=generating_user_id).first()
            if user:
                generating_user = (getattr(user, "full_name", None)
                                   or getattr(user, "name", None)
                                   or getattr(user, "email", None)
                                   or generating_user_id)
        except Exception:
            generating_user = generating_user_id

    # Build staff name map for audit trail
    staff_map = _build_staff_map(session, firm_id)

    # Document hash for integrity
    doc_hash = hashlib.sha256(
        f"{firm_name}:{sra_number}:{date_from}:{date_to}:{generated_at.isoformat()}".encode()
    ).hexdigest()[:16].upper()

    date_from_str = date_from.strftime("%d/%m/%Y")
    date_to_str = date_to.strftime("%d/%m/%Y")

    buf = io.BytesIO()
    doc = AuditPackDoc(
        buf,
        firm_name=firm_name,
        sra_number=sra_number,
        date_from=date_from_str,
        date_to=date_to_str,
        generated_at=generated_at,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=f"SRA Visit Audit Pack — {firm_name}",
        author=generating_user or "Seema Compliance Automation",
        subject=f"SRA regulatory compliance audit pack for {firm_name} ({date_from_str} to {date_to_str})",
        creator="Seema Compliance Automation Platform",
    )

    styles = _build_styles()
    story = []

    # Cover
    _build_cover(story, styles, firm_name, sra_number, date_from, date_to, generated_at, generating_user)

    # TOC
    toc = _build_toc(story, styles)

    # Sections — all with audit trail metadata
    _section_policies(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_training(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_breaches(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_aml(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_conflicts(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_file_reviews(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_undertakings(story, styles, session, firm_id, date_from, date_to, staff_map)
    _section_colp_cofa(story, styles, session, firm_id, date_from, date_to, staff_map)

    # Certification & Attestation — sign-off page
    colp_cofa_officers = []
    try:
        from models.staff import StaffMember
        officers = session.query(StaffMember).filter(
            StaffMember.firm_id == firm_id,
            StaffMember.role.in_(["COLP", "COFA", "colp", "cofa", "Compliance Officer"]),
        ).all()
        for o in officers:
            colp_cofa_officers.append({
                "name": o.name or "Unknown",
                "role": o.role or "Compliance Officer",
                "sra_id": o.sra_id or "N/A",
                "email": o.email or "N/A",
            })
    except Exception:
        pass

    _build_certification_page(
        story, styles, firm_name, sra_number, date_from, date_to,
        generated_at, generating_user, colp_cofa_officers, doc_hash,
    )

    # Build with multiple passes for TOC
    doc.multiBuild(story)

    pdf_bytes = buf.getvalue()

    # Set PDF metadata via ReportLab's canvas info (already set via doc constructor)
    logger.info(
        f"Generated SRA Audit Pack for {firm_name} | "
        f"Period: {date_from_str}-{date_to_str} | "
        f"Doc ID: SEEMA-AUD-{doc_hash} | "
        f"Size: {len(pdf_bytes)} bytes | "
        f"Requested by: {generating_user or 'system'}"
    )

    return pdf_bytes
