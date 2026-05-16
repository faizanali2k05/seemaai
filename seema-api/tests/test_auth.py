"""
Integration tests for authentication and authorisation.

Tests the full auth lifecycle: registration, login, token refresh,
protected endpoint access, and invalid credential rejection.
"""
import pytest


@pytest.mark.asyncio
async def test_register_new_user(client, test_firm):
    """Register a new user under an existing firm."""
    response = await client.post("/api/auth/register", json={
        "email": "newuser@testfirm.co.uk",
        "password": "SecurePassword123!",
        "full_name": "New User",
        "role": "solicitor",
        "firm_id": test_firm.id,
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["email"] == "newuser@testfirm.co.uk"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected(client, test_user):
    """Cannot register with an email that already exists."""
    response = await client.post("/api/auth/register", json={
        "email": test_user["user"].email,
        "password": "AnotherPassword123!",
        "full_name": "Duplicate User",
        "role": "staff",
        "firm_id": test_user["firm"].id,
    })
    assert response.status_code in (400, 409), f"Expected rejection, got {response.status_code}"


@pytest.mark.asyncio
async def test_login_valid_credentials(client, test_user):
    """Login with correct email and password returns tokens."""
    response = await client.post("/api/auth/login", json={
        "email": test_user["user"].email,
        "password": test_user["password"],
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client, test_user):
    """Login with wrong password is rejected."""
    response = await client.post("/api/auth/login", json={
        "email": test_user["user"].email,
        "password": "WrongPassword999!",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client, test_firm):
    """Login with non-existent email is rejected."""
    response = await client.post("/api/auth/login", json={
        "email": "nobody@nowhere.com",
        "password": "Password123!",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_access_protected_endpoint_with_token(client, auth_headers):
    """Authenticated user can access the dashboard."""
    response = await client.get("/api/dashboard", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_access_protected_endpoint_without_token(client, test_firm):
    """Unauthenticated request to a protected endpoint is rejected."""
    response = await client.get("/api/dashboard")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_access_with_invalid_token(client, test_firm):
    """Invalid JWT token is rejected."""
    response = await client.get(
        "/api/dashboard",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_refresh_token(client, test_user):
    """Refresh token issues a new access token."""
    # First, log in to get tokens
    login_resp = await client.post("/api/auth/login", json={
        "email": test_user["user"].email,
        "password": test_user["password"],
    })
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    # Now refresh
    refresh_resp = await client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_get_current_user_profile(client, auth_headers, test_user):
    """GET /auth/me returns the authenticated user's profile."""
    response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user["user"].email
    assert data["role"] == "colp"
