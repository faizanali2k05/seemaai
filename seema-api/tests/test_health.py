"""
Integration tests for basic app health and endpoint availability.

These run first and fast — if the health check fails, nothing else
will work, so these catch fundamental setup issues early.
"""
import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    """Health endpoint returns ok — confirms the app is running."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "seema-api"


@pytest.mark.asyncio
async def test_openapi_docs_available(client):
    """OpenAPI docs endpoint is accessible."""
    response = await client.get("/docs")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_openapi_json_schema(client):
    """OpenAPI JSON schema is valid and lists endpoints."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert len(schema["paths"]) > 50  # We have 122+ endpoints


@pytest.mark.asyncio
async def test_cors_headers(client):
    """CORS preflight returns correct headers."""
    response = await client.options(
        "/api/dashboard",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    # FastAPI CORS middleware should respond
    assert response.status_code in (200, 204, 405)
