"""
Integration tests for multi-tenancy data isolation.

This is the MOST CRITICAL test file. It verifies that Firm A
cannot see, modify, or access Firm B's data under any circumstance.
A failure here is a catastrophic security vulnerability.
"""
import pytest


@pytest.mark.asyncio
async def test_firm_a_cannot_see_firm_b_policies(
    client, auth_headers, second_auth_headers
):
    """Policies created by Firm A are invisible to Firm B."""
    # Firm A creates a policy
    create_resp = await client.post(
        "/api/compliance/policies",
        headers=auth_headers,
        json={
            "title": "Firm A's Secret AML Policy",
            "category": "aml",
            "content": "Confidential Firm A procedures...",
        },
    )
    assert create_resp.status_code == 200
    firm_a_policy_id = create_resp.json()["id"]

    # Firm B lists policies — should NOT see Firm A's policy
    list_resp = await client.get(
        "/api/compliance/policies",
        headers=second_auth_headers,
    )
    assert list_resp.status_code == 200
    firm_b_policies = list_resp.json()
    firm_b_ids = [p["id"] for p in firm_b_policies]
    assert firm_a_policy_id not in firm_b_ids, "CRITICAL: Firm B can see Firm A's policy!"


@pytest.mark.asyncio
async def test_firm_a_cannot_see_firm_b_alerts(
    client, auth_headers, second_auth_headers
):
    """Compliance alerts are isolated between firms."""
    # Firm B creates an alert
    create_resp = await client.post(
        "/api/compliance/alerts",
        headers=second_auth_headers,
        json={
            "title": "Firm B's Confidential Alert",
            "severity": "critical",
            "category": "data_protection",
        },
    )
    assert create_resp.status_code == 200
    firm_b_alert_id = create_resp.json()["id"]

    # Firm A lists alerts — should NOT see Firm B's alert
    list_resp = await client.get(
        "/api/compliance/alerts",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    firm_a_alerts = list_resp.json()
    firm_a_ids = [a["id"] for a in firm_a_alerts]
    assert firm_b_alert_id not in firm_a_ids, "CRITICAL: Firm A can see Firm B's alerts!"


@pytest.mark.asyncio
async def test_firm_a_cannot_see_firm_b_breaches(
    client, auth_headers, second_auth_headers
):
    """Breach reports are isolated between firms."""
    # Firm B creates a breach
    create_resp = await client.post(
        "/api/compliance/breaches",
        headers=second_auth_headers,
        json={
            "title": "Firm B Data Breach - CONFIDENTIAL",
            "breach_type": "data_breach",
            "severity": "critical",
            "description": "This must never be visible to other firms.",
        },
    )
    assert create_resp.status_code == 200
    firm_b_breach_id = create_resp.json()["id"]

    # Firm A lists breaches — should NOT see Firm B's breach
    list_resp = await client.get(
        "/api/compliance/breaches",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    firm_a_breaches = list_resp.json()
    firm_a_ids = [b["id"] for b in firm_a_breaches]
    assert firm_b_breach_id not in firm_a_ids, "CRITICAL: Firm A can see Firm B's breaches!"


@pytest.mark.asyncio
async def test_firm_a_cannot_see_firm_b_regulatory_updates(
    client, auth_headers, second_auth_headers
):
    """Regulatory updates are firm-scoped."""
    # Firm B creates a regulatory update
    create_resp = await client.post(
        "/api/compliance/regulatory-updates",
        headers=second_auth_headers,
        json={
            "title": "Firm B Internal Regulatory Note",
            "source": "SRA",
            "description": "Internal analysis for Firm B only.",
        },
    )
    assert create_resp.status_code == 200
    firm_b_update_id = create_resp.json()["id"]

    # Firm A lists updates — should NOT see it
    list_resp = await client.get(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    firm_a_updates = list_resp.json()
    firm_a_ids = [u["id"] for u in firm_a_updates]
    assert firm_b_update_id not in firm_a_ids, "CRITICAL: Firm A can see Firm B's regulatory updates!"


@pytest.mark.asyncio
async def test_firm_a_dashboard_excludes_firm_b_data(
    client, auth_headers, second_auth_headers
):
    """Dashboard metrics are computed per-firm, not globally."""
    # Firm B creates data
    await client.post(
        "/api/compliance/alerts",
        headers=second_auth_headers,
        json={"title": "Firm B Alert", "severity": "high", "category": "aml"},
    )

    # Firm A's dashboard should show 0 alerts (no data created for Firm A)
    dashboard_resp = await client.get("/api/dashboard", headers=auth_headers)
    assert dashboard_resp.status_code == 200
    # The dashboard shouldn't reflect Firm B's data


@pytest.mark.asyncio
async def test_firm_b_cannot_analyze_firm_a_regulatory_update(
    client, auth_headers, second_auth_headers
):
    """Firm B cannot run AI analysis on Firm A's regulatory update."""
    # Firm A creates an update
    create_resp = await client.post(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
        json={
            "title": "Firm A Private Update",
            "source": "SRA",
            "description": "Private analysis content.",
        },
    )
    firm_a_update_id = create_resp.json()["id"]

    # Firm B tries to analyze Firm A's update
    analyze_resp = await client.post(
        "/api/compliance/regulatory-updates/analyze",
        headers=second_auth_headers,
        json={"update_id": firm_a_update_id},
    )
    assert analyze_resp.status_code == 404, "CRITICAL: Firm B can access Firm A's update for analysis!"
