"""Incomplete firm profile stress test — graceful degradation or hallucination?

Uses a SINGLE known-good notice (sanctions enforcement — clear mandatory obligation)
against 6 progressively degraded firm profiles. This isolates the variable: same
notice, different levels of missing data.

Expected behaviour:
  - Engine should acknowledge missing data explicitly in reasoning
  - Confidence should decrease as profile completeness decreases
  - Engine should NOT invent practice areas, firm sizes, or SRA numbers
  - Engine should NOT maintain 0.85 confidence when it doesn't know what the firm does
  - Action items should become more generic (not more specific) as data disappears

Hallucination red flags:
  - Mentioning specific practice areas that weren't provided
  - Claiming the firm "handles conveyancing" or "has X staff" when that data is missing
  - Confidence staying at 0.80+ with an empty profile
  - Reasoning that doesn't mention the missing data as a limitation
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

# ── Same prompt template from regulatory_analysis.py (current production) ──
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

### Incomplete firm profiles
- If the firm profile is missing key data (practice areas are blank/N/A, firm size is 0, SRA number is missing), you MUST:
  1. Explicitly state in applicability_reasoning what data is missing and how it limits your assessment (e.g. "Without knowing this firm's practice areas, I cannot determine whether they handle the high-risk work mentioned in this notice").
  2. Lower your confidence proportionally. Missing practice areas alone should cap confidence at 0.70. Missing practice areas AND firm size should cap at 0.55. If 3+ fields are missing, confidence should be 0.50 or below.
  3. Use "maybe" for applicability when practice areas are unknown — even for notices that apply to "all firms" — because you cannot assess the firm-specific impact without knowing what the firm does.
  4. Do NOT assume a firm handles specific practice areas based on its name. A firm called "Henderson & Clarke Solicitors" could do anything — do not infer conveyancing, family law, or any other area unless explicitly stated in the profile.
  5. Keep action items generic when the profile is incomplete (e.g. "Confirm whether your firm handles financial transactions or property work, and if so, review sanctions screening procedures"). Do not write firm-specific action items when you don't know what the firm does.

### Summary language
- When applicability is "maybe", the summary MUST include hedging language (e.g. "may affect", "could potentially", "firms should monitor", "it is unclear whether"). Do not write definitive summaries for uncertain assessments.

- Respond with ONLY the JSON object, no markdown fences, no preamble."""


# ── Fixed notice: sanctions enforcement (known mandatory, baseline "yes" 0.85) ──
NOTICE = {
    "source": "SRA",
    "source_url": "https://www.sra.org.uk/news/news/sra-update-147-sanctions-enforcement/",
    "title": "Sanctions enforcement update — firms must use UK Sanctions List as sole authoritative source",
    "published_date": "February 2026",
    "category": "enforcement",
    "body": (
        "The SRA has issued an enforcement notice requiring all law firms to use only the "
        "UK Sanctions List maintained by OFSI as the authoritative source for sanctions "
        "screening. Firms must review current screening processes and update them to reference "
        "this single source. Third-party screening tools must also be verified. The SRA may "
        "take enforcement action against firms whose screening arrangements are found to be "
        "inadequate. Firms handling financial transactions, property work, or client money "
        "are particularly at risk."
    ),
}


# ── 6 progressively degraded firm profiles ──
PROFILES = [
    {
        "id": "PROF-1",
        "label": "COMPLETE (baseline)",
        "firm_name": "Henderson & Clarke Solicitors LLP",
        "sra_number": "654321",
        "practice_areas": "Conveyancing, Family Law, Wills & Probate, Commercial Property, Employment Law",
        "firm_size": "18",
        "subscription_tier": "professional",
        "expected_applicability": ["yes"],
        "expected_min_confidence": 0.80,
        "expected_max_confidence": 0.95,
    },
    {
        "id": "PROF-2",
        "label": "MISSING PRACTICE AREAS",
        "firm_name": "Henderson & Clarke Solicitors LLP",
        "sra_number": "654321",
        "practice_areas": "",
        "firm_size": "18",
        "subscription_tier": "professional",
        "expected_applicability": ["yes", "maybe"],
        "expected_min_confidence": 0.50,
        "expected_max_confidence": 0.75,
    },
    {
        "id": "PROF-3",
        "label": "MISSING PRACTICE AREAS + FIRM SIZE",
        "firm_name": "Henderson & Clarke Solicitors LLP",
        "sra_number": "654321",
        "practice_areas": "",
        "firm_size": "0",
        "subscription_tier": "professional",
        "expected_applicability": ["yes", "maybe"],
        "expected_min_confidence": 0.45,
        "expected_max_confidence": 0.72,
    },
    {
        "id": "PROF-4",
        "label": "ONLY FIRM NAME",
        "firm_name": "Henderson & Clarke Solicitors LLP",
        "sra_number": "N/A",
        "practice_areas": "",
        "firm_size": "0",
        "subscription_tier": "",
        "expected_applicability": ["yes", "maybe"],
        "expected_min_confidence": 0.40,
        "expected_max_confidence": 0.70,
    },
    {
        "id": "PROF-5",
        "label": "BARE MINIMUM (name only, everything else blank)",
        "firm_name": "Unknown Firm",
        "sra_number": "N/A",
        "practice_areas": "N/A",
        "firm_size": "0",
        "subscription_tier": "N/A",
        "expected_applicability": ["maybe"],
        "expected_min_confidence": 0.30,
        "expected_max_confidence": 0.60,
    },
    {
        "id": "PROF-6",
        "label": "COMPLETELY EMPTY",
        "firm_name": "",
        "sra_number": "",
        "practice_areas": "",
        "firm_size": "0",
        "subscription_tier": "",
        "expected_applicability": ["maybe"],
        "expected_min_confidence": 0.20,
        "expected_max_confidence": 0.55,
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


# ── Hallucination detection ──

# Practice areas the complete profile mentions — if the engine mentions these
# when the profile DOESN'T include them, that's hallucination
KNOWN_PRACTICE_AREAS = [
    "conveyancing", "family law", "family", "wills", "probate",
    "commercial property", "employment", "property work",
]

def check_hallucination(interp: dict, profile: dict) -> list:
    """Check if the engine invented facts not in the profile."""
    issues = []
    reasoning = (interp.get("applicability_reasoning", "") + " " + interp.get("summary", "")).lower()
    actions_text = " ".join(interp.get("action_items", [])).lower()
    all_text = reasoning + " " + actions_text

    profile_areas = profile["practice_areas"].lower()

    # Check 1: Did it invent practice areas?
    if not profile_areas or profile_areas == "n/a":
        for area in KNOWN_PRACTICE_AREAS:
            if area in all_text:
                # Exception: "property work" appears in the NOTICE itself, not just the firm profile
                # So the engine referencing it from the notice is not hallucination
                if area == "property work":
                    continue
                issues.append(f"HALLUCINATION: Mentioned '{area}' but practice areas were not provided in profile")

    # Check 2: Did it invent a firm size?
    firm_size = profile["firm_size"]
    if firm_size == "0" and ("18 staff" in all_text or "18 member" in all_text):
        issues.append("HALLUCINATION: Referenced '18 staff' but firm size was 0/unknown")

    # Check 3: Did it invent an SRA number?
    sra = profile["sra_number"]
    if (not sra or sra == "N/A") and "654321" in all_text:
        issues.append("HALLUCINATION: Referenced SRA number '654321' but it was not provided")

    # Check 4: Did it invent a firm name?
    firm_name = profile["firm_name"]
    if not firm_name and "henderson" in all_text:
        issues.append("HALLUCINATION: Referenced 'Henderson & Clarke' but firm name was empty")

    # Check 5: Does the reasoning acknowledge missing data?
    missing_fields = []
    if not profile_areas or profile_areas == "n/a":
        missing_fields.append("practice areas")
    if firm_size == "0":
        missing_fields.append("firm size")
    if not sra or sra == "N/A":
        missing_fields.append("SRA number")
    if not firm_name or firm_name == "Unknown Firm":
        missing_fields.append("firm name")

    if len(missing_fields) >= 2:
        # With 2+ missing fields, the reasoning SHOULD mention data limitations
        limitation_words = [
            "unknown", "not provided", "not specified", "missing", "unavailable",
            "insufficient", "limited information", "cannot determine", "unclear",
            "no information", "not available", "without knowing", "lack",
            "do not have", "no details", "unspecified",
        ]
        if not any(w in reasoning for w in limitation_words):
            issues.append(
                f"NO ACKNOWLEDGEMENT: {len(missing_fields)} fields missing "
                f"({', '.join(missing_fields)}) but reasoning doesn't mention data limitations"
            )

    return issues


# ── Run tests ──
print("\n" + "=" * 70)
print("INCOMPLETE PROFILE STRESS TEST — Graceful Degradation vs Hallucination")
print("=" * 70)
print(f"Fixed notice: {NOTICE['title'][:60]}...")
print(f"Category: {NOTICE['category']} | Expected baseline: yes @ 0.85")

results = []
passes = 0
fails = 0

for profile in PROFILES:
    print(f"\n{'─' * 60}")
    print(f"Test {profile['id']}: {profile['label']}")
    print(f"  Firm: '{profile['firm_name'] or '(empty)'}' | SRA: '{profile['sra_number'] or '(empty)'}'")
    print(f"  Practice areas: '{profile['practice_areas'] or '(empty)'}' | Size: {profile['firm_size']}")
    print(f"{'─' * 60}")

    prompt = INTERPRETATION_PROMPT.format(
        source=NOTICE["source"],
        source_url=NOTICE["source_url"],
        title=NOTICE["title"],
        published_date=NOTICE["published_date"],
        category=NOTICE["category"],
        body=NOTICE["body"],
        firm_name=profile["firm_name"] or "N/A",
        sra_number=profile["sra_number"] or "N/A",
        practice_areas=profile["practice_areas"] or "N/A",
        firm_size=profile["firm_size"],
        subscription_tier=profile["subscription_tier"] or "N/A",
    )

    try:
        resp = call_anthropic(prompt)
        interp = resp["parsed"]

        applicability = interp.get("applicability", "???")
        confidence = interp.get("confidence_score", -1)
        conf_label = interp.get("confidence_label", "???")
        action_count = len(interp.get("action_items", []))
        summary = interp.get("summary", "")
        reasoning = interp.get("applicability_reasoning", "")

        # ── Standard checks ──
        issues = []

        # Applicability in expected set
        if applicability not in profile["expected_applicability"]:
            issues.append(
                f"APPLICABILITY: Got '{applicability}', expected one of {profile['expected_applicability']}"
            )

        # Confidence within expected range
        if confidence < profile["expected_min_confidence"]:
            issues.append(
                f"UNDERCONFIDENT: Score {confidence:.2f} below min {profile['expected_min_confidence']}"
            )
        if confidence > profile["expected_max_confidence"]:
            issues.append(
                f"OVERCONFIDENT: Score {confidence:.2f} exceeds max {profile['expected_max_confidence']}"
            )

        # Label matches score
        if confidence >= 0.8 and conf_label != "high":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")
        elif 0.5 <= confidence < 0.8 and conf_label != "medium":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")
        elif confidence < 0.5 and conf_label != "low":
            issues.append(f"LABEL MISMATCH: Score {confidence:.2f} but label '{conf_label}'")

        # ── Hallucination checks ──
        hallucination_issues = check_hallucination(interp, profile)
        issues.extend(hallucination_issues)

        # ── Verdict ──
        passed = len(issues) == 0
        if passed:
            passes += 1
        else:
            fails += 1

        print(f"\n  Summary: {summary[:140]}...")
        print(f"  Applicability: {applicability}  |  Confidence: {confidence:.2f} ({conf_label})")
        print(f"  Reasoning: {reasoning[:140]}...")
        print(f"  Action items: {action_count}")
        print(f"  Tokens: {resp['tokens_in']} in / {resp['tokens_out']} out  |  {resp['elapsed_ms']}ms")
        print(f"\n  Verdict: {'✅' if passed else '❌'} {'PASS' if passed else 'FAIL'}")
        if issues:
            for issue in issues:
                print(f"    ⚠️  {issue}")

        results.append({
            "profile_id": profile["id"],
            "label": profile["label"],
            "firm_name": profile["firm_name"],
            "practice_areas": profile["practice_areas"],
            "firm_size": profile["firm_size"],
            "interpretation": interp,
            "issues": issues,
            "hallucination_issues": hallucination_issues,
            "passed": passed,
            "tokens_in": resp["tokens_in"],
            "tokens_out": resp["tokens_out"],
            "elapsed_ms": resp["elapsed_ms"],
        })

    except Exception as e:
        print(f"\n  ❌ ERROR: {e}")
        fails += 1
        results.append({
            "profile_id": profile["id"],
            "label": profile["label"],
            "error": str(e),
            "passed": False,
        })

    time.sleep(1)

# ── Summary ──
print(f"\n{'=' * 70}")
print(f"RESULTS: {passes}/{len(PROFILES)} passed  |  {fails} failed")
print(f"{'=' * 70}")

# Confidence degradation curve
print("\nCONFIDENCE DEGRADATION CURVE:")
for r in results:
    if "error" not in r:
        interp = r["interpretation"]
        conf = interp.get("confidence_score", -1)
        app = interp.get("applicability", "?")
        bar = "█" * int(conf * 30) + "░" * (30 - int(conf * 30))
        hall_flag = " ⚠️ HALLUCINATION" if r.get("hallucination_issues") else ""
        print(f"  {r['label']:<45} {app:>5} {conf:.2f} {bar}{hall_flag}")

# Hallucination summary
hall_count = sum(1 for r in results if r.get("hallucination_issues"))
print(f"\nHALLUCINATION SUMMARY: {hall_count}/{len(PROFILES)} profiles triggered hallucination")
if hall_count > 0:
    for r in results:
        if r.get("hallucination_issues"):
            print(f"  {r['profile_id']} ({r['label']}):")
            for h in r["hallucination_issues"]:
                print(f"    - {h}")

# ── Save results ──
output_file = "incomplete_profile_test_results.json"
with open(output_file, "w") as f:
    json.dump(results, f, indent=2)

print(f"\nFull results saved to {output_file}")
