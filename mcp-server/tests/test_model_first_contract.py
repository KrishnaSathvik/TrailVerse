"""Local cutover compatibility, with an HTTP mock and no provider access."""
import os
import asyncio
import json
from pathlib import Path

import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from server.client import TrailVerseClient
from server.formatters import format_plan_trip
from server.plan_trip_service import slim_plan_trip_structured


def test_local_planner_preserves_request_and_canonical_response():
    fixture = json.loads((Path(__file__).resolve().parents[2] /
        os.environ.get("TRAILIE_CONTRACT_FIXTURE", "artifacts/trailie-model-first-cutover-2026-09-30/contract-fixture.json")).read_text())
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"success": True, "data": fixture})

    async def run():
        client = TrailVerseClient(base_url="http://127.0.0.1:5001")
        async with httpx.AsyncClient(base_url=client.base_url, transport=httpx.MockTransport(handle)) as http:
            client._client = http
            return await client.plan_trip_anonymous(message="Keep my words unchanged", anonymous_id="guest-fixture")

    response = asyncio.run(run())
    assert str(seen[0].url) == "http://127.0.0.1:5001/api/ai/plan-itinerary"
    body = json.loads(seen[0].content)
    assert body["messages"][-1]["content"] == "Keep my words unchanged"
    assert body["provider"] == "auto"
    assert response["data"]["canonicalPlan"] == fixture["canonicalPlan"]
    assert response["data"]["itineraryHash"] == fixture["itineraryHash"]
    structured, text = format_plan_trip(response, user_message="Keep my words unchanged")
    assert text
    assert structured["canonicalPlan"] == fixture["canonicalPlan"]
    assert slim_plan_trip_structured(structured)["canonicalPlan"] == fixture["canonicalPlan"]
    assert structured["days"] == fixture["canonicalPlan"]["days"]


def test_mcp_followup_keeps_backend_session_authority():
    from server.main import plan_trip
    fixture = json.loads((Path(__file__).resolve().parents[2] /
        os.environ.get("TRAILIE_CONTRACT_FIXTURE", "artifacts/trailie-model-first-cutover-2026-09-30/contract-fixture.json")).read_text())
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.plan_trip_anonymous = AsyncMock(return_value={"success": True, "data": fixture})

    async def run():
        with patch("server.main.TrailVerseClient", return_value=client), \
             patch("server.main._check_rate_limit", AsyncMock(return_value=None)), \
             patch("server.main._resolve_park_code", AsyncMock(return_value="test")), \
             patch("server.main._park_display_name", AsyncMock(return_value="Recorded park")), \
             patch("server.main._send_analytics"), patch("server.main.ENABLE_WIDGETS", False):
            first = await plan_trip(park_code="test", start_date="2026-10-01", number_of_days=2)
            assert first.structuredContent["canonicalPlan"] == fixture["canonicalPlan"]
            assert not first.isError
            session_id = first.structuredContent["sessionId"]
            second = await plan_trip(session_id=session_id, revision_request="Shorten day two")
            assert not second.isError
            assert client.plan_trip_anonymous.call_args.kwargs["anonymous_id"] == fixture["anonymousId"]

    asyncio.run(run())


def test_planning_has_separate_bounded_timeout_over_real_http():
    """A delayed local HTTP response outlives the read budget, not the plan budget."""
    from server.client import TrailVerseAPIError

    async def run():
        async def respond(reader, writer):
            try:
                await reader.readuntil(b"\r\n\r\n")
                await asyncio.sleep(0.15)
                payload = b'{"success":true,"data":{}}'
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + str(len(payload)).encode() + b"\r\nConnection: close\r\n\r\n" + payload)
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()

        server = await asyncio.start_server(respond, '127.0.0.1', 0)
        try:
            port = server.sockets[0].getsockname()[1]
            async with TrailVerseClient(base_url=f'http://127.0.0.1:{port}', timeout=0.05, plan_trip_timeout=1) as client:
                result = await client.plan_trip_anonymous(message='Hello', anonymous_id='timeout-fixture')
                assert result['success']
                client.plan_trip_timeout = 0.05
                try:
                    await client.plan_trip_anonymous(message='Hello', anonymous_id='timeout-fixture')
                except TrailVerseAPIError as error:
                    assert 'timed out' in str(error)
                else:
                    raise AssertionError('Planning timeout must remain bounded')
        finally:
            server.close()
            await server.wait_closed()
            await asyncio.sleep(0.2)

    asyncio.run(run())
