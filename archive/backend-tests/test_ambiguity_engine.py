"""Ambiguity stress test — does the AI hedge appropriately or invent certainty?

Sends 5 deliberately ambiguous/edge-case regulatory notices through the same
interpretation prompt used in production. Each notice is designed to test a
specific failure mode:

  1. VAGUE_WORDING     — Notice with no concrete obligation, just "considering"
  2. TANGENTIAL        — About a practice area the firm barely touches
  3. MIXED_SIGNALS     — Contains both "no action required" and "firms should review"
  4. OVERLY_BROAD      — Applies to "all regulated entities" but content is niche
  5. INSUFFICIENT_INFO — Title sounds relevant but body is just a placeholder

Expected behaviour: the engine should use "maybe" or "no" for applicability,
confidence_score < 0.8, and confidence_label "medium" or "low". If it says
"yes" with high confidence on any of these, the prompt needs tightening.
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

# ── Same prompt template from regulatory_analysis.py (with the updated rules) ──
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

# ── Test firm profile (same as main test) ──
FIRM = {
    "firm_name": "Henderson & Clarke Solicitors LLP",
    "sra_number": "654321",
    "practice_areas": "Conveyancing, Family Law, Wills & Probate, Commercial Property, Employment Law",
    "firm_size": "18",
    "subscription_tier": "professional",
}

# ── 5 AMBIGUOUS / EDGE-CASE NOTICES ──
NOTICES = [
    {
        "id": "AMB-1",
        "label": "VAGUE_WORDING",
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/considering-future-regulation",
        "title": "SRA considering potential future changes to regulation of legal technology providers",
        "published_date": "March 2026",
        "category": "discussion",
        "body": (
            "The SRA has published a discussion paper exploring whether there may be a "
            "case for considering changes to how legal technology providers are regulated "
            "in the future. The paper does not propose any specific rule changes and no "
            "consultation is planned at this stage. The SRA notes that it is 'at an early "
            "stage of thinking' and that any changes, if pursued, 'could take several years "
            "to develop'. The paper invites informal feedback from interested parties but "
            "stresses this is not a formal consultation and no response is required. The "
            "SRA Chief Executive noted: 'We are simply opening a conversation about what "
            "the regulatory landscape might look like in years to come.'"
        ),
        "expected_applicability": ["no", "maybe"],
        "expected_max_confidence": 0.7,
        "expected_max_actions": 2,
        "why": "No concrete obligation, no rule change, no consultation. Pure horizon-scanning."
    },
    {
        "id": "AMB-2",
        "label": "TANGENTIAL",
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/immigration-practitioner-guidance",
        "title": "Updated guidance for immigration law practitioners on record-keeping requirements",
        "published_date": "February 2026",
        "category": "guidance",
        "body": (
            "The SRA has published updated guidance on record-keeping requirements "
            "specifically for solicitors practising in immigration law. The guidance "
            "clarifies documentation standards for visa applications, asylum cases, and "
            "Windrush-related matters. It introduces new expectations around maintaining "
            "detailed chronological records of Home Office correspondence and client "
            "instructions for all immigration files. Firms handling immigration work are "
            "expected to review their file management procedures and ensure compliance "
            "by 1 September 2026. The guidance also notes that 'firms not currently "
            "handling immigration matters are not affected but should be aware of these "
            "standards in case they take on such work in the future.'"
        ),
        "expected_applicability": ["no", "maybe"],
        "expected_max_confidence": 0.95,
        "expected_max_actions": 2,
        "why": "Firm doesn't practise immigration law. Notice explicitly says unaffected firms need not act. High confidence 'no' is acceptable here — the notice itself excludes non-immigration firms."
    },
    {
        "id": "AMB-3",
        "label": "MIXED_SIGNALS",
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/equality-diversity-report-2026",
        "title": "SRA publishes annual equality, diversity and inclusion data report for 2025-26",
        "published_date": "April 2026",
        "category": "report",
        "body": (
            "The SRA has published its annual report on equality, diversity and inclusion "
            "across the regulated legal sector. The report presents aggregated workforce "
            "data collected from all regulated firms. Key findings include a slight increase "
            "in ethnic diversity at senior levels and persistent gender pay gaps in larger "
            "firms. The SRA notes that 'no new regulatory obligations arise from this "
            "report' but adds that 'firms should reflect on their own diversity data and "
            "consider whether their practices align with Principle 6 (encouraging equality, "
            "diversity and inclusion)'. The SRA also states that 'we may consult on "
            "mandatory reporting for firms above a certain size in the future, though no "
            "decision has been taken.' Firms are not required to respond or take any "
            "specific action at this time."
        ),
        "expected_applicability": ["no", "maybe"],
        "expected_max_confidence": 0.70,
        "expected_max_actions": 2,
        "why": "Report explicitly says no new obligations. 'Should reflect' is soft, not mandatory. 18-person firm unlikely to hit any future reporting threshold."
    },
    {
        "id": "AMB-4",
        "label": "OVERLY_BROAD",
        "source": "GOV.UK",
        "source_url": "https://www.gov.uk/government/consultations/digital-regulation-reform",
        "title": "Digital regulation reform: consultation on updated rules for all regulated professional services",
        "published_date": "March 2026",
        "category": "consultation",
        "body": (
            "The Department for Science, Innovation and Technology (DSIT) has launched a "
            "wide-ranging consultation on digital regulation reform across all regulated "
            "professional services, including legal, medical, and financial services. The "
            "consultation covers potential requirements around digital service delivery, "
            "data handling, algorithmic transparency, and online client communication "
            "standards. The proposals are at an early stage and the consultation document "
            "is 347 pages long. The scope is described as 'all entities providing regulated "
            "professional services in the United Kingdom.' However, the detailed proposals "
            "primarily focus on financial services firms using automated decision-making and "
            "healthcare providers offering telemedicine. References to legal services are "
            "limited to three paragraphs on pages 289-291 which discuss 'potential future "
            "consideration of whether solicitors using AI-powered tools should be subject "
            "to additional disclosure requirements.' The consultation closes on 30 September "
            "2026."
        ),
        "expected_applicability": ["maybe"],
        "expected_max_confidence": 0.65,
        "expected_max_actions": 3,
        "why": "Technically applies to 'all regulated professional services' but the actual legal-sector content is 3 paragraphs in a 347-page doc. Firm may want to monitor but shouldn't panic."
    },
    {
        "id": "AMB-5",
        "label": "INSUFFICIENT_INFO",
        "source": "SRA",
        "source_url": "https://www.sra.org.uk/news/upcoming-announcement-april-2026",
        "title": "Important changes to client account rules — further details to follow",
        "published_date": "April 2026",
        "category": "announcement",
        "body": (
            "The SRA will be making an important announcement regarding changes to the "
            "SRA Accounts Rules in the coming weeks. The changes are expected to affect "
            "how firms handle client money in certain circumstances. Full details will be "
            "published on the SRA website in due course. Firms do not need to take any "
            "action at this time. The SRA will provide adequate notice of any changes and "
            "a reasonable implementation period."
        ),
        "expected_applicability": ["maybe"],
        "expected_max_confidence": 0.5,
        "expected_max_actions": 2,
        "why": "No actual rule change yet — just a pre-announcement. Insufficient information to assess impact. Should flag as 'monitor' but can't determine applicability."
    },
]


def call_anthropic(prompt: str) -> dict:
    """Call the Anthropic Messages API and return parsed JSON."""
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())

    body = json.dumps({
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )

    start = time.time()
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.loads(resp.read())
    elapsed_ms = int((time.time() - start) * 1000)

    raw_text = data["content"][0]["text"].strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()

    return {
        "parsed": json.loads(raw_text),
        "tokens_in": data["usage"]["input_tokens"],
        "tokens_out": data["usage"]["output_tokens"],
        "elapsed_ms": elapsed_ms,
    }


# ── Run tests ──
print("\n" + "=" * 70)
print("AMBIGUITY STRESS TEST — Seema Regulatory Interpretation Engine")
print("=" * 70)

results = []
passes = 0
fails = 0

for notice in NOTICES:
    print(f"\n{'─' * 60}")
    print(f"Test {notice['id']}: {notice['label']}")
    print(f"Title: {notice['title']}")
    print(f"Why ambiguous: {notice['why']}")
    print(f"{'─' * 60}")

    prompt = INTERPRETATION_PROMPT.format(
        source=notice["source"],
        source_url=notice["source_url"],
        title=notice["title"],
        published_date=notice["published_date"],
        category=notice["category"],
        body=notice["body"],
        **FIRM,
    )

    try:
        resp = call_anthropic(prompt)
        interp = resp["parsed"]

        applicability = interp.get("applicability", "???")
        confidence = interp.get("confidence_score", -1)
        conf_label = interp.get("confidence_label", "???")
        action_count = len(interp.get("action_items", []))
        summary = interp.get("summary", "")

        # ── Evaluate ──
        issues = []

        # Check 1: Applicability should be in expected set
        if applicability not in notice["expected_applicability"]:
            issues.append(
                f"APPLICABILITY: Got '{applicability}', expected one of {notice['expected_applicability']}"
            )

        # Check 2: Confidence score should not exceed expected max
        if confidence > notice["expected_max_confidence"]:
            issues.append(
                f"OVERCONFIDENT: Score {confidence:.2f} exceeds max {notice['expected_max_confidence']}"
            )

        # Check 3: Confidence label should match score range
        if confidence >= 0.8 and conf_label != "high":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")
        elif 0.5 <= confidence < 0.8 and conf_label != "medium":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")
        elif confidence < 0.5 and conf_label != "low":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")

        # Check 4: Too many action items for an ambiguous notice
        if action_count > notice["expected_max_actions"]:
            issues.append(
                f"TOO MANY ACTIONS: Got {action_count}, expected max {notice['expected_max_actions']}"
            )

        # Check 5: Summary should contain hedging language if applicability is "maybe"
        hedge_words = ["may", "might", "could", "potential", "possible", "unclear", "monitor",
                       "uncertain", "limited", "consider", "await", "not yet", "no action",
                       "no immediate", "does not currently", "not required"]
        if applicability == "maybe" and not any(w in summary.lower() for w in hedge_words):
            issues.append("NO HEDGING: Applicability is 'maybe' but summary lacks hedging language")

        # ── Verdict ──
        passed = len(issues) == 0
        if passed:
            passes += 1
            verdict = "PASS"
        else:
            fails += 1
            verdict = "FAIL"

        print(f"\n  Summary: {summary[:150]}...")
        print(f"  Applicability: {applicability}  |  Confidence: {confidence:.2f} ({conf_label})")
        print(f"  Action items: {action_count}")
        print(f"  Tokens: {resp['tokens_in']} in / {resp['tokens_out']} out  |  {resp['elapsed_ms']}ms")
        print(f"\n  Verdict: {'✅' if passed else '❌'} {verdict}")
        if issues:
            for issue in issues:
                print(f"    ⚠️  {issue}")

        results.append({
            "notice_id": notice["id"],
            "label": notice["label"],
            "title": notice["title"],
            "why_ambiguous": notice["why"],
            "interpretation": interp,
            "expected_applicability": notice["expected_applicability"],
            "expected_max_confidence": notice["expected_max_confidence"],
            "expected_max_actions": notice["expected_max_actions"],
            "actual_applicability": applicability,
            "actual_confidence": confidence,
            "actual_conf_label": conf_label,
            "actual_action_count": action_count,
            "issues": issues,
            "passed": passed,
            "tokens_in": resp["tokens_in"],
            "tokens_out": resp["tokens_out"],
            "elapsed_ms": resp["elapsed_ms"],
        })

    except Exception as e:
        print(f"\n  ❌ ERROR: {e}")
        fails += 1
        results.append({
            "notice_id": notice["id"],
            "label": notice["label"],
            "title": notice["title"],
            "error": str(e),
            "passed": False,
        })

# ── Summary ──
print(f"\n{'=' * 70}")
print(f"RESULTS: {passes}/{len(NOTICES)} passed  |  {fails} failed")
print(f"{'=' * 70}")

if fails > 0:
    print("\nFailed tests:")
    for r in results:
        if not r["passed"]:
            label = r.get("label", "???")
            issues = r.get("issues", [r.get("error", "unknown")])
            print(f"  {r['notice_id']} ({label}): {'; '.join(issues) if isinstance(issues[0], str) else issues}")

# ── Save results ──
output_file = "ambiguity_test_results.json"
with open(output_file, "w") as f:
    json.dump(results, f, indent=2)

print(f"\nFull results saved to {output_file}")
