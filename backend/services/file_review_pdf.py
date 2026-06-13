"""File Review Form PDF generator.

Reproduces the firm's "File Review Form" template (a file-audit checklist) as a
branded, downloadable PDF. The header banner uses the firm's own name and
tagline; the body is the standard SRA file-opening review checklist with a
"Choose an item." option column, matching the supplied Word/PDF template.

Pre-fills file reference / file name / matter handler / reviewer from a matter
record when one is supplied; otherwise produces a blank, printable form.
"""
import io
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)
from xml.sax.saxutils import escape

# Brand palette (kept consistent with services/sra_audit_pack.py)
NAVY = colors.HexColor("#1a2744")
BLUE = colors.HexColor("#2563eb")
LIGHT = colors.HexColor("#eef3fb")
GREY = colors.HexColor("#9ca3af")
BORDER = colors.HexColor("#cbd5e1")
PLACEHOLDER = colors.HexColor("#9ca3af")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ── Checklist content (matches the firm template) ────────────────────────
FILE_OPENING_ITEMS = [
    "File opening procedures followed",
    "Valid passport seen and copy obtained",
    "Costs information provided, including: basis of charging; likely overall cost; "
    "when fees may change; any other costs for which the client may be responsible",
    "Client's requirements and objectives established",
    "Client given clear explanation of the issues involved and the options available to them",
    "Client advised at the outset of the potential costs of the matter versus the benefit to be derived",
    "Client given explanation of what the fee earner will and will not do",
    "Client given name and status of fee earner and person responsible for supervising the matter",
    "Instructions received confirmed in writing",
    "Next steps agreed with client",
    "Appropriate level of service agreed",
    "Method of funding established",
    "Where acting under a CFA or damages-based agreement, all required information provided to the client",
    "Client's full contact details recorded",
    "Client care letter and Terms of business sent to client",
    "Conflict check carried out",
    "Risk assessment carried out",
    "Complaints information provided",
    "Client informed of any limitation of liability",
    "Explanation provided of: action to be taken and likely timescales; fee earner and client "
    "responsibilities; any likely limitations on what can be done for the client",
    "Any client vulnerabilities or other attributes, needs or circumstances identified",
    "Where the client requires reasonable adjustments, these have been identified and provided",
]


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("FRBanner", parent=ss["Title"], fontName="Helvetica-Bold",
                          fontSize=26, leading=30, textColor=NAVY, alignment=TA_CENTER))
    ss.add(ParagraphStyle("FRTagline", parent=ss["Normal"], fontName="Helvetica-Oblique",
                          fontSize=12, leading=15, textColor=BLUE, alignment=TA_CENTER))
    ss.add(ParagraphStyle("FRTitle", parent=ss["Title"], fontName="Helvetica-Bold",
                          fontSize=15, leading=19, textColor=NAVY, alignment=TA_CENTER,
                          spaceBefore=14, spaceAfter=12))
    ss.add(ParagraphStyle("FRSection", parent=ss["Heading2"], fontName="Helvetica-Bold",
                          fontSize=12, leading=15, textColor=NAVY, spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("FRLabel", parent=ss["Normal"], fontName="Helvetica-Bold",
                          fontSize=9.5, leading=12, textColor=NAVY))
    ss.add(ParagraphStyle("FRCell", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=9.5, leading=12, textColor=colors.black))
    ss.add(ParagraphStyle("FRHead", parent=ss["Normal"], fontName="Helvetica-Bold",
                          fontSize=9.5, leading=12, textColor=colors.white))
    ss.add(ParagraphStyle("FRChoose", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=9, leading=12, textColor=PLACEHOLDER))
    return ss


def generate_file_review_form(
    firm,
    matter: Optional[dict] = None,
    reviewer_name: Optional[str] = None,
    tagline: Optional[str] = None,
) -> bytes:
    """Build the File Review Form PDF and return it as bytes."""
    ss = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=14 * mm, bottomMargin=14 * mm,
        title="File Review Form", author=getattr(firm, "name", "") or "Seema",
    )
    content_w = PAGE_W - 2 * MARGIN

    firm_name = (getattr(firm, "name", None) or "Solicitors").upper()
    tagline = tagline or "Regulatory File Review"

    story = []

    # ── Branded banner ──
    banner = Table(
        [[Paragraph(escape(firm_name), ss["FRBanner"])],
         [Paragraph(escape(tagline), ss["FRTagline"])]],
        colWidths=[content_w],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 1, BORDER),
        ("TOPPADDING", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(banner)
    story.append(Paragraph("File Review Form", ss["FRTitle"]))

    # ── Review metadata table ──
    reason_line = ("[ ] Complaint &nbsp;&nbsp; [ ] Routine file audit/review &nbsp;&nbsp; "
                   "[ ] Fee earner &nbsp;&nbsp; [ ] AML &nbsp;&nbsp; [ ] Other (describe)")
    m = matter or {}
    file_ref = m.get("reference") or m.get("external_ref") or ""
    file_name = m.get("title") or m.get("client_name") or ""
    handler = m.get("handler_name") or ""
    reviewer = reviewer_name or (getattr(firm, "colp_name", None) or "")

    meta_rows = [
        [Paragraph("Reason for review <i>(Mark all that apply)</i>", ss["FRLabel"]),
         Paragraph(reason_line, ss["FRCell"])],
        [Paragraph("Date of review", ss["FRLabel"]), Paragraph("", ss["FRCell"])],
        [Paragraph("File reference number", ss["FRLabel"]), Paragraph(escape(file_ref), ss["FRCell"])],
        [Paragraph("File name", ss["FRLabel"]), Paragraph(escape(file_name), ss["FRCell"])],
        [Paragraph("Reviewer", ss["FRLabel"]), Paragraph(escape(reviewer), ss["FRCell"])],
        [Paragraph("Matter Handler", ss["FRLabel"]), Paragraph(escape(handler), ss["FRCell"])],
    ]
    meta = Table(meta_rows, colWidths=[content_w * 0.32, content_w * 0.68])
    meta.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(meta)

    # ── File opening checklist ──
    story.append(Paragraph("File opening", ss["FRSection"]))
    rows = [[Paragraph("Item checked", ss["FRHead"]), Paragraph("Select Option", ss["FRHead"])]]
    for item in FILE_OPENING_ITEMS:
        rows.append([Paragraph(escape(item), ss["FRCell"]), Paragraph("Choose an item.", ss["FRChoose"])])

    table = Table(rows, colWidths=[content_w * 0.74, content_w * 0.26], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#fbfbfd")),
        ("ROWBACKGROUNDS", (0, 1), (0, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(table)

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        f"<font color='#9ca3af' size='7'>Generated by Seema · "
        f"{datetime.utcnow().strftime('%d %b %Y %H:%M UTC')}</font>",
        ss["FRCell"],
    ))

    doc.build(story)
    return buf.getvalue()
