import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "msf_sessions" in data


@pytest.mark.anyio
async def test_execute_without_auth(client: AsyncClient):
    res = await client.post(
        "/execute",
        json={"command": "nmap -sV 127.0.0.1"},
    )
    assert res.status_code == 422 or res.status_code == 403


@pytest.mark.anyio
async def test_execute_blocked_command(client: AsyncClient):
    res = await client.post(
        "/execute",
        json={"command": "rm -rf /"},
        headers={"x-secret": os.getenv("KES_SECRET", "changeme")},
    )
    assert res.status_code == 400
    assert "allowlist" in res.json()["detail"]


@pytest.mark.anyio
async def test_msf_sessions_empty(client: AsyncClient):
    res = await client.get(
        "/msf/sessions",
        headers={"x-secret": os.getenv("KES_SECRET", "changeme")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "sessions" in data
