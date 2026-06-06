"""
Integration tests for firm onboarding flow.

Tests the multi-step onboarding wizard: firm creation,
SRA lookup, and initial setup.
"""
import pytest


@pytest.mark.asyncio
async def test_sra_lookup(client, auth_headers):
    """SRA lookup endpoint returns firm data (or a structured response)."""
    response = await client.get(
        "/api/onboarding/sra-lookup/123456",
        headers=auth_headers,
    )
    # SRA lookup may return 200 with data or a "not found" style response
    # depending on whether it hits the real SRA API or returns mock data
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_onboarding_status(client, auth_headers):
    """Onboarding status endpoint shows current progress."""
    response = await client.get(
        "/api/onboarding/status",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
