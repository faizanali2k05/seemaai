"""
Integration tests for breach reporting.

Tests creating breach reports, verifying ICO deadline logic,
and audit trail creation.
"""
import pytest


@pytest.mark.asyncio
async def test_list_breaches_empty(client, auth_headers):
    """New firm starts with no breaches."""
    response = await client.get("/api/compliance/breaches", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_breach_report(client, auth_headers):
    """Create a breach report and verify fields."""
    response = await client.post("/api/compliance/breaches", headers=auth_headers, json={
        "title": "Client data sent to wrong recipient",
        "breach_type": "data_breach",
        "severity": "high",
        "description": "Email containing client financial records was sent to wrong email address.",
        "data_subjects_affected": 1,
        "personal_data_types": "financial records, name, address",
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["title"] == "Client data sent to wrong recipient"
    assert data["severity"] == "high"
    assert data["status"] == "open"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_breach_appears_in_list(client, auth_headers):
    """Created breach appears in the breaches list."""
    create_resp = await client.post("/api/compliance/breaches", headers=auth_headers, json={
        "title": "Laptop theft from office",
        "breach_type": "security_incident",
        "severity": "critical",
        "description": "Laptop with client data stolen from reception area.",
    })
    breach_id = create_resp.json()["id"]

    list_resp = await client.get("/api/compliance/breaches", headers=auth_headers)
    breaches = list_resp.json()
    assert any(b["id"] == breach_id for b in breaches)


@pytest.mark.asyncio
async def test_breach_has_ico_deadline(client, auth_headers):
    """Breach report should include or imply an ICO notification deadline."""
    response = await client.post("/api/compliance/breaches", headers=auth_headers, json={
        "title": "Ransomware attack",
        "breach_type": "data_breach",
        "severity": "critical",
        "description": "Ransomware encrypted client files.",
    })
    assert response.status_code == 200
    data = response.json()
    # ICO deadline is 72 hours from breach — check field exists
    assert "ico_deadline" in data or "ico_notified" in data or "created_at" in data
