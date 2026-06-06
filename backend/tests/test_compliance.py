"""
Integration tests for compliance endpoints.

Tests compliance scans, alerts, dashboard metrics, and the
AI-powered compliance scanning (with AI disabled, verifying fallback).
"""
import pytest


@pytest.mark.asyncio
async def test_list_compliance_alerts(client, auth_headers):
    """GET /compliance/alerts returns a list (possibly empty)."""
    response = await client.get("/api/compliance/alerts", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_create_compliance_alert(client, auth_headers):
    """Create a compliance alert and verify it appears in the list."""
    create_resp = await client.post("/api/compliance/alerts", headers=auth_headers, json={
        "title": "Overdue CDD for client Smith",
        "severity": "high",
        "category": "aml",
        "description": "CDD expired 30 days ago for Smith & Co matter.",
    })
    assert create_resp.status_code == 200, create_resp.text
    alert = create_resp.json()
    assert alert["title"] == "Overdue CDD for client Smith"
    assert alert["severity"] == "high"
    alert_id = alert["id"]

    # Verify it appears in the list
    list_resp = await client.get("/api/compliance/alerts", headers=auth_headers)
    assert list_resp.status_code == 200
    alerts = list_resp.json()
    assert any(a["id"] == alert_id for a in alerts)


@pytest.mark.asyncio
async def test_compliance_scan_results(client, auth_headers):
    """GET /compliance/scan-results returns scan history."""
    response = await client.get("/api/compliance/scan-results", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_compliance_score(client, auth_headers):
    """GET /compliance/score returns a numeric score."""
    response = await client.get("/api/compliance/score", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "score" in data or "overall_score" in data


@pytest.mark.asyncio
async def test_dashboard_returns_metrics(client, auth_headers):
    """GET /dashboard returns compliance metrics summary."""
    response = await client.get("/api/dashboard", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Dashboard should include some form of metrics/counts
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_ai_compliance_scan_fallback(client, auth_headers):
    """AI compliance scan falls back gracefully when API key is empty."""
    response = await client.post("/api/ai/scan-compliance", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Should return a structured result even without AI
    assert "scan_id" in data or "overall_risk_score" in data or "ai_generated" in data


@pytest.mark.asyncio
async def test_ai_risk_summary_fallback(client, auth_headers):
    """AI risk summary degrades gracefully without API key."""
    response = await client.get("/api/ai/risk-summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
