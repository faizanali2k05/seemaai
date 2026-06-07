"""
Integration tests for audit trail.

Verifies that key actions create audit log entries, which is
critical for SRA compliance evidence.
"""
import pytest


@pytest.mark.asyncio
async def test_audit_trail_exists(client, auth_headers):
    """Audit trail endpoint returns log entries."""
    response = await client.get("/api/audit/logs", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_policy_creation_creates_audit_entry(client, auth_headers):
    """Creating a policy should generate an audit log entry."""
    # Create a policy
    await client.post("/api/compliance/policies", headers=auth_headers, json={
        "title": "Test Policy for Audit",
        "category": "general",
        "content": "Test content",
    })

    # Check audit trail
    audit_resp = await client.get("/api/audit/logs", headers=auth_headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    # Should have at least one entry for policy creation
    policy_logs = [
        log for log in logs
        if log.get("entity_type") == "policy" and log.get("action") == "created"
    ]
    assert len(policy_logs) >= 1


@pytest.mark.asyncio
async def test_regulatory_update_creates_audit_entry(client, auth_headers):
    """Creating a regulatory update should generate an audit log entry."""
    await client.post("/api/compliance/regulatory-updates", headers=auth_headers, json={
        "title": "Test Update for Audit",
        "source": "SRA",
    })

    audit_resp = await client.get("/api/audit/logs", headers=auth_headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    reg_logs = [
        log for log in logs
        if log.get("entity_type") == "regulatory_update"
    ]
    assert len(reg_logs) >= 1


@pytest.mark.asyncio
async def test_audit_trail_is_firm_scoped(
    client, auth_headers, second_auth_headers
):
    """Audit logs from Firm A are not visible to Firm B."""
    # Firm A creates a policy (generates an audit entry)
    await client.post("/api/compliance/policies", headers=auth_headers, json={
        "title": "Firm A Audit Test Policy",
        "category": "general",
        "content": "Private",
    })

    # Firm B checks audit trail
    audit_resp = await client.get("/api/audit/logs", headers=second_auth_headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()

    # None of these should reference Firm A's policy
    for log in logs:
        if log.get("entity_type") == "policy":
            assert "Firm A Audit Test" not in log.get("details", ""), \
                "CRITICAL: Firm B can see Firm A's audit entries!"
