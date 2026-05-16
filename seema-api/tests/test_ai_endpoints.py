"""
Integration tests for AI-powered endpoints.

All tests run with ANTHROPIC_API_KEY="" to verify that every AI
endpoint degrades gracefully to rule-based fallbacks. No real
API calls are made.
"""
import pytest


@pytest.mark.asyncio
async def test_ai_status_reports_unavailable(client, auth_headers):
    """AI status endpoint shows AI is unavailable (no API key)."""
    response = await client.get("/api/ai/status")
    assert response.status_code == 200
    data = response.json()
    assert data["ai_available"] is False


@pytest.mark.asyncio
async def test_ai_analyze_regulatory_returns_fallback(client, auth_headers):
    """Regulatory analysis returns a structured fallback response."""
    response = await client.post(
        "/api/ai/analyze-regulatory",
        headers=auth_headers,
        json={
            "text": "The SRA has published new guidance on technology and cybersecurity risk management for regulated law firms.",
            "source": "SRA",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "impact_level" in data
    assert data["impact_level"] in ("high", "medium", "low")
    assert data.get("ai_generated") is False


@pytest.mark.asyncio
async def test_ai_generate_policy_returns_fallback(client, auth_headers):
    """Policy generation returns template content as fallback."""
    response = await client.post(
        "/api/ai/generate-policy",
        headers=auth_headers,
        json={
            "policy_type": "anti-money-laundering",
            "additional_context": "Small firm, 5 solicitors, conveyancing focus",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "content" in data
    assert len(data["content"]) > 50
    assert "title" in data
    assert "policy_id" in data  # Should auto-save as draft


@pytest.mark.asyncio
async def test_ai_scan_compliance_returns_fallback(client, auth_headers):
    """Compliance scan returns structured risk assessment as fallback."""
    response = await client.post(
        "/api/ai/scan-compliance",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "scan_id" in data
    assert "compliance_data" in data


@pytest.mark.asyncio
async def test_ai_suggest_remediation_returns_fallback(client, auth_headers):
    """Remediation suggestion returns action steps as fallback."""
    response = await client.post(
        "/api/ai/suggest-remediation",
        headers=auth_headers,
        json={
            "compliance_gap": "No AML training completed by any staff member in the last 12 months",
            "severity": "critical",
            "additional_context": "Firm has 8 fee earners",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "plan_id" in data  # Auto-creates remediation plan
    assert "steps" in data or "title" in data


@pytest.mark.asyncio
async def test_ai_ask_question_returns_fallback(client, auth_headers):
    """Knowledge engine returns a fallback answer."""
    response = await client.post(
        "/api/ai/ask",
        headers=auth_headers,
        json={
            "question": "What are my obligations under the Money Laundering Regulations 2017?",
            "conversation_history": [],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert len(data["answer"]) > 50
    assert data["confidence"] == "low"  # Fallback confidence
    assert "topics" in data
    assert "aml" in data["topics"]


@pytest.mark.asyncio
async def test_ai_ask_gdpr_question(client, auth_headers):
    """Knowledge engine correctly classifies a GDPR question."""
    response = await client.post(
        "/api/ai/ask",
        headers=auth_headers,
        json={
            "question": "How do I handle a subject access request under GDPR?",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "data_protection" in data["topics"]


@pytest.mark.asyncio
async def test_ai_risk_summary_returns_fallback(client, auth_headers):
    """Risk summary returns executive briefing as fallback."""
    response = await client.get(
        "/api/ai/risk-summary",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "compliance_data" in data


@pytest.mark.asyncio
async def test_ai_analyze_regulatory_validates_input(client, auth_headers):
    """Regulatory analysis rejects text that's too short."""
    response = await client.post(
        "/api/ai/analyze-regulatory",
        headers=auth_headers,
        json={"text": "Short", "source": "SRA"},
    )
    assert response.status_code == 422  # Pydantic validation (min_length=10)


@pytest.mark.asyncio
async def test_ai_ask_validates_input(client, auth_headers):
    """Knowledge engine rejects empty questions."""
    response = await client.post(
        "/api/ai/ask",
        headers=auth_headers,
        json={"question": "ab"},  # min_length=3
    )
    assert response.status_code == 422
