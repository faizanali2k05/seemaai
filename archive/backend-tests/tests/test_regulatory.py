"""
Integration tests for regulatory updates and intelligence.

Tests CRUD for regulatory updates, the AI impact analysis endpoint
(with fallback), and the feed status endpoint.
"""
import pytest


@pytest.mark.asyncio
async def test_list_regulatory_updates_empty(client, auth_headers):
    """New firm starts with no regulatory updates."""
    response = await client.get(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_regulatory_update(client, auth_headers):
    """Create a regulatory update."""
    response = await client.post(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
        json={
            "title": "SRA Warning Notice: Cybersecurity",
            "source": "SRA",
            "impact_level": "high",
            "description": "The SRA has issued new guidance on cybersecurity requirements for all regulated firms.",
            "regulatory_body": "Solicitors Regulation Authority",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "SRA Warning Notice: Cybersecurity"
    assert data["source"] == "SRA"
    assert data["impact_level"] == "high"
    assert data["status"] == "published"


@pytest.mark.asyncio
async def test_create_and_list_regulatory_updates(client, auth_headers):
    """Created update appears in the list."""
    create_resp = await client.post(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
        json={
            "title": "ICO Enforcement Action: Data Breach Fine",
            "source": "ICO",
            "impact_level": "medium",
            "description": "ICO fines law firm £50,000 for data breach.",
        },
    )
    assert create_resp.status_code == 200
    update_id = create_resp.json()["id"]

    list_resp = await client.get(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    updates = list_resp.json()
    assert any(u["id"] == update_id for u in updates)


@pytest.mark.asyncio
async def test_analyze_regulatory_update_fallback(client, auth_headers):
    """AI analysis of a regulatory update falls back without API key."""
    # Create an update first
    create_resp = await client.post(
        "/api/compliance/regulatory-updates",
        headers=auth_headers,
        json={
            "title": "New AML Regulations 2026",
            "source": "GOV.UK",
            "description": "Updated Money Laundering Regulations requiring enhanced CDD for high-risk jurisdictions.",
        },
    )
    update_id = create_resp.json()["id"]

    # Analyze it
    response = await client.post(
        "/api/compliance/regulatory-updates/analyze",
        headers=auth_headers,
        json={"update_id": update_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["update_id"] == update_id
    assert "analysis" in data


@pytest.mark.asyncio
async def test_ai_analyze_regulatory_fallback(client, auth_headers):
    """Direct AI regulatory analysis endpoint with fallback."""
    response = await client.post(
        "/api/ai/analyze-regulatory",
        headers=auth_headers,
        json={
            "text": "The SRA has announced changes to the Transparency Rules requiring all firms to publish pricing information for additional legal services from January 2027.",
            "source": "SRA",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "impact_level" in data
    assert "affected_areas" in data or "summary" in data


@pytest.mark.asyncio
async def test_regulatory_intelligence(client, auth_headers):
    """Regulatory intelligence endpoint returns updates."""
    response = await client.get(
        "/api/compliance/regulatory-intelligence",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_feed_status(client, auth_headers):
    """Feed status shows active regulatory sources."""
    response = await client.get(
        "/api/compliance/regulatory-intelligence/feed-status",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "active"
    assert len(data["sources"]) >= 4
    source_names = [s["name"] for s in data["sources"]]
    assert "SRA" in source_names
    assert "ICO" in source_names
