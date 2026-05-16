"""Test the Seema regulatory interpretation engine against 10 real SRA notices.

Uses raw HTTP calls to the Anthropic API (no SDK needed) and the same prompt
template from services/regulatory_analysis.py.
"""
import json
import time
import urllib.request
import urllib.error
import ssl

# ── Load API key from .env ──
API_KEY = ""
with open(".env") as f:
    for line in f:
        if line.startswith("ANTHROPIC_API_KEY=") and "=" in line:
            API_KEY = line.strip().split("=", 1)[1]
            break

if not API_KEY:
    print("ERROR: No ANTHROPIC_API_KEY found in .env")
    exit(1)

print(f"API key loaded: {API_KEY[:12]}...{API_KEY[-4:]}")

# ── Same prompt template from regulatory_analysis.py ──
INTERPRETATION_PROMPT = """You are a UK legal compliance analyst specialising in SRA-regulated law firms.

A new regulatory notice has been published. Analyse it in the context of the firm profile provided and produce a structured assessment.

## Regulatory Notice
- **Source**: {source} ({source_url})
- **Title**: {title}
- **Published**: {published_date}
- **Category**: {category}
- **Content**: {body}

## Firm Profile
- **Firm Name**: {firm_name}
- **SRA Number**: {sra_number}
- **Practice Areas**: {practice_areas}
- **Firm Size**: {firm_size} staff members
- **Subscription Tier**: {subscription_tier}

## Your Task
Produce a JSON response with exactly these fields:

{{
  "summary": "A clear, 2-3 sentence plain-English summary of what this notice means. Avoid jargon. Write as if briefing a busy partner.",
  "applicability": "yes" | "no" | "maybe",
  "applicability_reasoning": "1-2 sentences explaining WHY this does or doesn't apply to this specific firm, referencing their practice areas and size.",
  "action_items": ["Specific action item 1", "Specific action item 2", ...],
  "source_citation": "Formatted citation: [Source Name], '[Title]', published [date]. Available at: [URL]",
  "confidence_score": 0.0 to 1.0,
  "confidence_label": "high" | "medium" | "low"
}}

Rules:

### Applicability
- "yes" ONLY when the notice creates a concrete obligation, changes an existing rule, or explicitly requires firms to do something by a date. The notice must contain a clear "you must" or "firms are required to" or equivalent mandatory language.
- "no" when the notice is about a practice area the firm doesn't handle, or when the notice explicitly states it does not apply to firms like this one.
- "maybe" for everything else — including: discussion papers, pre-announcements, consultations with no clear legal-sector impact, reports with soft "should consider" language, notices where full details are pending, and notices that are tangentially related but not directly relevant.
- When in doubt between "yes" and "maybe", ALWAYS choose "maybe". Overcalling applicability erodes trust.

### Confidence calibration — BE HONEST ABOUT UNCERTAINTY
- "high" (0.8-1.0): Reserve for clear-cut cases ONLY — e.g. a mandatory AML rule change that obviously applies, or a niche practice area notice that obviously doesn't. You should be RARE with high confidence.
- "medium" (0.5-0.79): The default for most notices. Use when the notice is relevant but the firm's obligation is unclear, the notice uses soft/aspirational language, or when you are making reasonable inferences.
- "low" (0.0-0.49): Use when the notice lacks sufficient detail to assess (e.g. pre-announcements, placeholder notices), when the connection to this firm is speculative, or when you are guessing.
- CRITICAL: If the notice itself says "no action required at this time" or "further details to follow", your confidence CANNOT be "high". The source is telling you the picture is incomplete.
- If applicability is "maybe", confidence_score should almost never exceed 0.75. You are uncertain — your score must reflect that.
- STRONGER: If the notice explicitly disclaims obligation (phrases like "no new regulatory obligations", "not required to respond", "no action required at this time"), confidence MUST be 0.65 or below, regardless of applicability. When the source itself says nothing is required, you cannot be 70%+ confident that something is relevant.

### Informational notices
- If the notice is purely informational or educational (e.g. exam results, appointment announcements, statistical reports, annual data reports, discussion papers) with NO compliance obligation, regulatory change, or required action, applicability should be "no" or "maybe" — never "yes".
- Soft language like "firms should reflect", "consider whether", "be aware" does NOT create an obligation. Do not treat aspirational suggestions as requirements.

### Pre-announcements and incomplete notices
- If a notice announces upcoming changes but provides no details of what those changes are, applicability should be "maybe" and confidence should be "low" (0.3-0.49). You cannot assess impact without knowing what the change is.
- Do NOT invent specific action items for notices that lack specific content. "Monitor for further details" is the appropriate action.

### Action items
- Must be specific and actionable (e.g. "Review your AML policy by [date]" not "Consider implications").
- If the notice is informational, a pre-announcement, or has no required action, provide at most 1-2 awareness items (e.g. "Monitor for the full announcement expected in [timeframe]").
- Do NOT generate 3+ action items for a notice that explicitly says no action is required.

### Summary language
- When applicability is "maybe", the summary MUST include hedging language (e.g. "may affect", "could potentially", "firms should monitor", "it is unclear whether"). Do not write definitive summaries for uncertain assessments.

- Respond with ONLY the JSON object, no markdown fences, no preamble."""

# ── Test firm profile (realistic mid-size SRA firm) ──
FIRM = {
    "firm_name": "Henderson & Clarke Solicitors LLP",
    "sra_number": "654321",
    "practice_areas": "Conveyancing, Family Law, Wills & Probate, Commercial Property, Employment Law",
    "firm_size": "18",
    "subscription_tier": "professional",
}

# ── 10 REAL SRA notices from search results (Jan-Apr 2026) ──
NOTICES = [
    {
        "id": 1,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/news/press/competence-requirements",
        "title": "SRA consults on proposals to strengthen continuing competence requirements",
        "published_date": "22 April 2026",
        "category": "consultation",
        "body": (
            "The SRA is consulting on potential new rules which will require all solicitors to keep "
            "a record of how they are reviewing and addressing their learning and development needs. "
            "The SRA is also proposing that all solicitors take part in mandatory ethical discussions "
            "on an annual basis. The consultation opened on 22 April 2026 and will run for 12 weeks, "
            "closing on 15 July 2026. The proposals aim to strengthen the continuing competence "
            "framework and ensure solicitors maintain high standards of practice throughout their careers."
        ),
    },
    {
        "id": 2,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/news/press/sqe-2026",
        "title": "Reports find SQE to be robust with improvements made",
        "published_date": "21 April 2026",
        "category": "education",
        "body": (
            "The SRA has published a suite of annual reports on the fourth full year of the "
            "Solicitors Qualifying Examination (SQE). Together, these reports provide assurance on "
            "the robustness of the assessment and detail improvements in delivery and candidate support. "
            "The results for the SQE1 January 2026 sitting have been published, with a total of 7,863 "
            "candidates completing both parts of SQE1. The reports assess the validity, reliability "
            "and fairness of the SQE, and include external examiner evaluations."
        ),
    },
    {
        "id": 3,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/sra-update/sra-update-issue-149-april-2026/",
        "title": "New Executive Director to lead casework review",
        "published_date": "April 2026",
        "category": "governance",
        "body": (
            "New Executive Director Jonathan Peddie will lead an end-to-end review of the SRA's "
            "casework process, including reviewing the application of the assessment threshold test "
            "and improving quality assurance of triage and investigations. This follows concerns "
            "about the timeliness of SRA investigations and the consistency of enforcement decisions. "
            "The review will examine how cases are prioritised, how evidence is gathered, and how "
            "decisions are communicated to firms and individuals under investigation."
        ),
    },
    {
        "id": 4,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/news/sra-update-147-sanctions-enforcement/",
        "title": "Sanctions enforcement update — firms must use UK Sanctions List as sole authoritative source",
        "published_date": "February 2026",
        "category": "enforcement",
        "body": (
            "The SRA has updated its guidance on the UK Sanctions Regime to reflect that the UK "
            "Sanctions List is now the sole authoritative source for sanctions screening. Firms must "
            "ensure they are using the UK Sanctions List maintained by the Office of Financial "
            "Sanctions Implementation (OFSI) for all client and matter screening. The SRA takes "
            "compliance with the sanctions regime very seriously and may take enforcement action "
            "where a firm fails to conduct adequate screening. Firms should review their sanctions "
            "screening processes and update them to reference the UK Sanctions List exclusively."
        ),
    },
    {
        "id": 5,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/solicitors/guidance/slapps-warning-notice/",
        "title": "Strategic Lawsuits Against Public Participation (SLAPPs) — Warning Notice",
        "published_date": "2026",
        "category": "warning_notice",
        "body": (
            "The SRA has issued a warning notice on Strategic Lawsuits Against Public Participation "
            "(SLAPPs). SLAPPs are legal actions brought primarily to silence or intimidate critics "
            "rather than to vindicate genuine legal rights. The SRA expects solicitors to consider "
            "whether their conduct in bringing or threatening legal proceedings is consistent with "
            "their obligations under the SRA Principles, particularly Principles 1 (upholding the "
            "rule of law), 2 (acting in a way that upholds public trust), and 5 (acting with "
            "integrity). Solicitors must not misuse legal processes to suppress free speech or "
            "legitimate public interest reporting."
        ),
    },
    {
        "id": 6,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/news/press/priorities-2026/",
        "title": "Chief executive sets out priorities for change in 2026",
        "published_date": "2026",
        "category": "governance",
        "body": (
            "SRA Chief Executive Sarah Rapson has set out the organisation's priorities for 2026, "
            "focusing on rebuilding trust in regulation. Key priorities include: faster and more "
            "transparent casework processes; strengthened continuing competence requirements; "
            "enhanced supervision of AML compliance; and better engagement with consumers and firms. "
            "The SRA will also focus on addressing issues in the no-win-no-fee sector and improving "
            "the quality of its decision-making through the appointment of new leadership."
        ),
    },
    {
        "id": 7,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/sra-update/sra-update-issue-148-march-2026/",
        "title": "Warning on use of AI — National Economic Crime Centre guidance",
        "published_date": "March 2026",
        "category": "guidance",
        "body": (
            "The SRA's March 2026 update includes a warning from the National Economic Crime Centre "
            "(NECC) on the use of artificial intelligence by criminals to facilitate economic crime. "
            "The NECC has identified that AI is being used to create convincing phishing emails, "
            "generate fake identity documents, and automate social engineering attacks. Law firms "
            "are advised to review their cybersecurity arrangements and ensure staff are trained to "
            "identify AI-generated fraud attempts. Firms should also consider whether their "
            "professional indemnity insurance covers losses arising from AI-enabled fraud."
        ),
    },
    {
        "id": 8,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/sra-update/sra-update-issue-148-march-2026/",
        "title": "Updated guidance on digital ID checks for anti-money laundering",
        "published_date": "March 2026",
        "category": "guidance",
        "body": (
            "The SRA has updated its guidance on digital identity verification for anti-money "
            "laundering (AML) purposes. The guidance confirms that firms may use digital identity "
            "verification technology as part of their customer due diligence (CDD) processes, "
            "provided they satisfy themselves that the technology meets the required standards. "
            "Firms must still conduct a risk assessment before relying on digital ID checks and "
            "should maintain records of the technology used, the checks performed, and the results "
            "obtained. The LSAG Anti-Money Laundering Guidance has been updated accordingly."
        ),
    },
    {
        "id": 9,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/news/firm-anti-money-laundering-sanctions-data-requirements/",
        "title": "Firm anti-money laundering and sanctions data requirements",
        "published_date": "2026",
        "category": "compliance",
        "body": (
            "The SRA requires firms to submit AML and sanctions data as part of its risk-based "
            "supervisory approach. Firms within scope of the Money Laundering Regulations must "
            "submit data on the SRA's reporting site. The data collection covers: firm-wide AML "
            "risk assessments, client identification procedures, source of funds verification, "
            "PEP screening arrangements, sanctions screening procedures, and suspicious activity "
            "reporting. The SRA uses this data to identify firms that may require enhanced "
            "supervision or inspection. Failure to submit data may result in regulatory action."
        ),
    },
    {
        "id": 10,
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/sra/consultations/consultation-listing/financial-penalties-further-developing-framework/",
        "title": "Financial Penalties: further developing our framework",
        "published_date": "2026",
        "category": "consultation",
        "body": (
            "The SRA is consulting on proposals to introduce minimum fine levels in each penalty "
            "band in its guidance. The SRA has noted that some fines may not be high enough to "
            "provide a credible deterrent. The Economic Crime and Corporate Transparency Act "
            "provides the SRA with new powers to gather information and to impose unlimited fines "
            "for economic crime matters. The consultation seeks views on whether the current "
            "framework adequately deters non-compliance, particularly in relation to AML failures, "
            "and whether minimum fine levels would improve consistency and public confidence."
        ),
    },
]


def call_anthropic(prompt):
    """Call the Anthropic Messages API via raw HTTP."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
    }
    body = json.dumps({
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())

    start = time.time()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            data = json.loads(resp.read().decode())
            elapsed = int((time.time() - start) * 1000)
            return data, elapsed
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        return {"error": error_body, "status": e.code}, 0


def run_tests():
    results = []
    total = len(NOTICES)

    for i, notice in enumerate(NOTICES, 1):
        print(f"\n{'='*70}")
        print(f"[{i}/{total}] {notice['title'][:60]}...")
        print(f"  Source: {notice['source']} | Category: {notice['category']}")
        print(f"  Published: {notice['published_date']}")

        prompt = INTERPRETATION_PROMPT.format(
            source=notice["source"],
            source_url=notice["source_url"],
            title=notice["title"],
            published_date=notice["published_date"],
            category=notice["category"],
            body=notice["body"],
            **FIRM,
        )

        response, elapsed = call_anthropic(prompt)

        if "error" in response:
            print(f"  ERROR: {response['error']}")
            results.append({"notice": notice, "error": response["error"]})
            continue

        raw_text = response["content"][0]["text"].strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        try:
            interp = json.loads(raw_text)
        except json.JSONDecodeError as e:
            print(f"  JSON PARSE ERROR: {e}")
            print(f"  Raw: {raw_text[:200]}")
            results.append({"notice": notice, "error": f"JSON parse: {e}", "raw": raw_text})
            continue

        tokens_in = response.get("usage", {}).get("input_tokens", 0)
        tokens_out = response.get("usage", {}).get("output_tokens", 0)

        print(f"  Applicability: {interp.get('applicability', '?').upper()}")
        print(f"  Confidence: {interp.get('confidence_score', '?')} ({interp.get('confidence_label', '?')})")
        print(f"  Summary: {interp.get('summary', '?')[:120]}...")
        print(f"  Action items: {len(interp.get('action_items', []))}")
        print(f"  Citation: {interp.get('source_citation', '?')[:100]}...")
        print(f"  Tokens: {tokens_in} in / {tokens_out} out | {elapsed}ms")

        results.append({
            "notice_id": notice["id"],
            "title": notice["title"],
            "category": notice["category"],
            "interpretation": interp,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "elapsed_ms": elapsed,
        })

        # Small delay between calls
        time.sleep(1)

    return results


def audit_results(results):
    """Audit all interpretations for quality issues."""
    print("\n\n" + "="*70)
    print("AUDIT REPORT — Regulatory Interpretation Engine")
    print("="*70)

    issues = []
    good = []

    for r in results:
        if "error" in r:
            issues.append(f"NOTICE {r.get('notice', {}).get('id', '?')}: API/parse error — {r['error'][:100]}")
            continue

        interp = r["interpretation"]
        notice_id = r["notice_id"]
        title = r["title"][:50]

        # ── Check 1: Does applicability make sense? ──
        applicability = interp.get("applicability", "")
        category = r["category"]
        reasoning = interp.get("applicability_reasoning", "")

        # General regulatory / AML / compliance / enforcement notices should still apply
        # The tightened prompt shouldn't cause REAL compliance obligations to get downgraded
        mandatory_categories = ("guidance", "compliance", "enforcement")
        if category in mandatory_categories and applicability == "no":
            issues.append(
                f"#{notice_id} '{title}': REGRESSION — Applicability='no' but this is a {category} notice "
                f"that likely applies to all firms. The tightened prompt may be too aggressive. "
                f"Reasoning: {reasoning[:80]}"
            )

        # Consultations should be "yes" or "maybe" (firms can/should respond) but never "no"
        if category == "consultation" and applicability == "no":
            issues.append(
                f"#{notice_id} '{title}': REGRESSION — Consultation should be 'yes' or 'maybe', "
                f"got 'no'. Firms should at least be aware of consultations."
            )

        # Warning notices should apply broadly
        if category == "warning_notice" and applicability == "no":
            issues.append(
                f"#{notice_id} '{title}': REGRESSION — Warning notice should be 'yes' or 'maybe', "
                f"got 'no'. Warning notices from SRA apply to regulated firms."
            )

        # Education/informational notices shouldn't be "yes"
        if category in ("education",) and applicability == "yes":
            issues.append(
                f"#{notice_id} '{title}': Applicability='yes' but this is about SQE exams — "
                f"shouldn't directly apply to a practicing firm."
            )

        # ── Check 2: Confidence score vs label alignment ──
        score = interp.get("confidence_score", 0)
        label = interp.get("confidence_label", "")
        if label == "high" and score < 0.8:
            issues.append(f"#{notice_id} '{title}': Label='high' but score={score} (should be >=0.8)")
        elif label == "medium" and (score < 0.5 or score >= 0.8):
            issues.append(f"#{notice_id} '{title}': Label='medium' but score={score} (should be 0.5-0.79)")
        elif label == "low" and score >= 0.5:
            issues.append(f"#{notice_id} '{title}': Label='low' but score={score} (should be <0.5)")

        # ── Check 3: Citation matches the notice ──
        citation = interp.get("source_citation", "")
        if notice_id and r.get("title"):
            # Check citation contains the source name
            if "SRA" not in citation.upper():
                issues.append(f"#{notice_id} '{title}': Citation doesn't mention SRA as source")
            # Check citation contains the URL
            notice_url = NOTICES[notice_id - 1]["source_url"]
            if notice_url and notice_url not in citation:
                issues.append(f"#{notice_id} '{title}': Citation URL doesn't match. Expected '{notice_url[:50]}' in citation")

        # ── Check 4: Action items are specific ──
        actions = interp.get("action_items", [])
        if not actions:
            issues.append(f"#{notice_id} '{title}': No action items generated")
        for ai_item in actions:
            if ai_item and len(ai_item) < 15:
                issues.append(f"#{notice_id} '{title}': Action item too vague: '{ai_item}'")
            # Check for generic non-actionable items
            vague_phrases = ["consider implications", "be aware", "take note", "keep in mind"]
            if any(vp in ai_item.lower() for vp in vague_phrases):
                issues.append(f"#{notice_id} '{title}': Vague action item: '{ai_item[:60]}'")

        # ── Check 5: Summary quality ──
        summary = interp.get("summary", "")
        if len(summary) < 30:
            issues.append(f"#{notice_id} '{title}': Summary too short ({len(summary)} chars)")
        if len(summary) > 500:
            issues.append(f"#{notice_id} '{title}': Summary too long ({len(summary)} chars)")

        # If no issues for this notice, mark as good
        notice_issues = [i for i in issues if i.startswith(f"#{notice_id}")]
        if not notice_issues:
            good.append(f"#{notice_id} '{title}': PASS — {applicability}, confidence {score} ({label})")

    # ── Print results ──
    print(f"\nTotal notices tested: {len(results)}")
    errors = [r for r in results if "error" in r]
    print(f"API/parse errors: {len(errors)}")
    print(f"Interpretations generated: {len(results) - len(errors)}")

    if good:
        print(f"\nPASSED ({len(good)}):")
        for g in good:
            print(f"  {g}")

    if issues:
        print(f"\nISSUES FOUND ({len(issues)}):")
        for idx, issue in enumerate(issues, 1):
            print(f"  {idx}. {issue}")
    else:
        print("\nNO ISSUES FOUND — all interpretations passed audit checks.")

    # Stats
    valid = [r for r in results if "error" not in r]
    if valid:
        avg_ms = sum(r["elapsed_ms"] for r in valid) / len(valid)
        avg_tokens = sum(r["tokens_in"] + r["tokens_out"] for r in valid) / len(valid)
        scores = [r["interpretation"]["confidence_score"] for r in valid]
        apps = [r["interpretation"]["applicability"] for r in valid]
        print(f"\nSTATISTICS:")
        print(f"  Avg response time: {avg_ms:.0f}ms")
        print(f"  Avg tokens/call: {avg_tokens:.0f}")
        print(f"  Applicability: yes={apps.count('yes')}, no={apps.count('no')}, maybe={apps.count('maybe')}")
        print(f"  Confidence scores: min={min(scores):.2f}, max={max(scores):.2f}, avg={sum(scores)/len(scores):.2f}")


if __name__ == "__main__":
    results = run_tests()
    audit_results(results)

    # Save full results
    out_path = "regulatory_engine_test_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to {out_path}")
