"""Client time zone hint reaches Trailie as metadata.timeZone; absent hints add nothing."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import mcp.types as types

from server.client import TrailVerseClient
from server.main import _client_time_zone


def _ctx(meta):
    return SimpleNamespace(request_context=SimpleNamespace(
        meta=None if meta is None else types.RequestParams.Meta.model_validate(meta)))


def test_reads_chatgpt_user_location_time_zone():
    assert _client_time_zone(_ctx({"openai/userLocation": {"timezone": "America/Denver", "city": "Denver"}})) == "America/Denver"


def test_missing_or_malformed_hints_yield_none():
    assert _client_time_zone(None) is None
    assert _client_time_zone(_ctx(None)) is None
    assert _client_time_zone(_ctx({})) is None
    assert _client_time_zone(_ctx({"openai/userLocation": "Denver"})) is None
    assert _client_time_zone(_ctx({"openai/userLocation": {"timezone": 7}})) is None
    assert _client_time_zone(_ctx({"openai/userLocation": {"timezone": "x" * 65}})) is None


def _sent_metadata(**kwargs):
    seen = []

    async def run():
        client = TrailVerseClient(base_url="http://127.0.0.1:5001")
        transport = httpx.MockTransport(lambda r: seen.append(r) or httpx.Response(200, json={"success": True, "data": {}}))
        async with httpx.AsyncClient(base_url=client.base_url, transport=transport) as http:
            client._client = http
            await client.plan_trip_anonymous(message="Is December good for Yellowstone?", **kwargs)

    asyncio.run(run())
    return json.loads(seen[0].content)["metadata"]


def test_time_zone_forwarded_only_when_supplied():
    assert _sent_metadata(time_zone="America/Denver")["timeZone"] == "America/Denver"
    assert "timeZone" not in _sent_metadata()
