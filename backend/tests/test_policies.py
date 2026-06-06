"""
Integration tests for policy management.

Tests CRUD operations on policies and AI-powered policy generation
(with fallback when Anthropic API key is not set).
"""
import pytest


@pytest.mark.asyncio
async def test_list_policies_empty(client, auth_headers):
    """New firm starts with no policies."""
    response = await client.get("/api/compliance/policies", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_policy(client, auth_headers):
    """Create a manual policy document."""
    response = await client.post("/api/compliance/policies", headers=auth_headers, json={
        "title": "Anti-Money Laundering Policy",
        "category": "aml",
        "content": "This policy sets out the firm's approach to AML compliance...",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Anti-Money Laundering Policy"
    assert data["category"] == "aml"
    assert data["status"] == "draft"
    assert data["version"] == "1.0"
    assert data["content"] is not None


@pytest.mark.asyncio
async def test_create_and_list_policies(client, auth_headers):
    """Created policy appears in the list."""
    # Create
    create_resp = await client.post("/api/compliance/policies", headers=auth_headers, json={
        "title": "Data Protection Policy",
        "category": "gdpr",
        "content": "GDPR compliance procedures...",
    })
    assert create_resp.status_code == 200
    policy_id = create_resp.json()["id"]

    # List
    list_resp = await client.get("/api/compliance/policies", headers=auth_headers)
    assert list_resp.status_code == 200
    policies = list_resp.json()
    assert any(p["id"] == policy_id for p in policies)


@pytest.mark.asyncio
async def test_generate_policy_fallback(client, auth_headers):
    """AI policy generation falls back to template when no API key."""
    response = await client.post("/api/compliance/generate-policy", headers=auth_headers, json={
        "policy_type": "anti-money-laundering",
        "additional_context": "Small conveyancing firm",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["title"] is not None
    assert data["content"] is not None
    assert len(data["content"]) > 100  # Should have substantial content
    assert data["status"] == "draft"


@pytest.mark.asyncio
async def test_generate_policy_via_ai_endpoint(client, auth_headers):
    """AI policy endpoint also works with fallback."""
    response = await client.post("/api/ai/generate-policy", headers=auth_headers, json={
        "policy_type": "data-protection",
        "additional_context": "",
    })
    assert response.status_code == 200
    data = response.json()
    assert "content" in data
    assert "title" in data
    assert "policy_id" in data


@pytest.mark.asyncio
async def test_policy_versions(client, auth_headers):
    """Policy version history endpoint works."""
    # Create a policy first
    create_resp = await client.post("/api/compliance/policies", headers=auth_headers, json={
        "title": "Complaints Policy",
        "category": "complaints",
        "content": "Handling complaints...",
    })
    policy_id = create_resp.json()["id"]

    # Get versions
    response = await client.get(
        f"/api/compliance/policies/{policy_id}/versions",
        headers=auth_headers,
    )
    assert response.status_code == 200
    versions = response.json()
    assert len(versions) >= 1
    assert versions[0]["is_current"] is True
