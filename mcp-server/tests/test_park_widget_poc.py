"""Offline MCP wire checks, not ChatGPT acceptance."""
import asyncio
import importlib
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from mcp.shared.memory import create_connected_server_and_client_session

@pytest.mark.parametrize('enabled', [False, True])
def test_wire_contract(monkeypatch, enabled):
    monkeypatch.setenv('MCP_PARK_BROWSER_POC', str(enabled).lower())
    monkeypatch.setenv('MCP_MARKDOWN_ONLY', 'true')
    monkeypatch.setenv('MCP_ENABLE_WIDGETS', 'false')
    from server import main
    importlib.reload(main)
    park = {'parkCode': 'zion', 'fullName': 'Zion National Park', 'states': 'UT', 'description': 'Recorded description'}
    api = MagicMock()
    api.__aenter__ = AsyncMock(return_value=api)
    api.__aexit__ = AsyncMock(return_value=None)
    api.search_parks = AsyncMock(return_value={'data': [park]})
    api.get_park_details = AsyncMock(return_value={'data': park})
    for name in ['get_park_alerts', 'get_park_weather', 'get_park_campgrounds', 'get_park_permits', 'get_park_of_day']:
        setattr(api, name, AsyncMock(return_value={}))
    async def run():
        async with create_connected_server_and_client_session(main.mcp) as client:
            tools = {t.name: t for t in (await client.list_tools()).tools}
            assert len(tools) == 5
            assert len((await client.list_prompts()).prompts) == 5
            assert len((await client.list_resources()).resources) == (2 if enabled else 0)
            for tool, slug in [('search_parks', 'park-list'), ('get_park_details', 'park-details')]:
                if enabled:
                    uri = f'ui://widget/{slug}.html'
                    assert tools[tool].meta['ui'] == {'resourceUri': uri, 'visibility': ['model', 'app']}
                    content = (await client.read_resource(uri)).contents[0]
                    assert content.mimeType == 'text/html;profile=mcp-app'
                    assert content.meta['ui']['csp']['connectDomains'] == []
                    assert "rpc('tools/call'" in content.text
                else:
                    assert 'ui' not in tools[tool].meta
            for name in ['plan_trip', 'compare_parks', 'find_events']:
                assert 'ui' not in tools[name].meta
            search = await client.call_tool('search_parks', {'query': 'Utah'})
            assert not search.isError
            assert 'Zion National Park' in search.content[0].text
            if enabled:
                assert search.structuredContent['parks'][0]['parkCode'] == 'zion'
            else:
                assert search.structuredContent is None
            detail = await client.call_tool('get_park_details', {'park_code': 'zion'})
            assert not detail.isError
            if enabled:
                assert detail.structuredContent['name'] == park['fullName']
            else:
                assert detail.structuredContent is None
            assert main._tool_result({'kind': 'events'}, 'x', {}).structuredContent is None
            with patch.object(main, 'slim_plan_trip_structured', return_value={'sessionId': 'same'}) as slim:
                assert main._tool_result({'kind': 'itinerary'}, 'x', {}, machine_readable=True).structuredContent == {'sessionId': 'same'}
                slim.assert_called_once()
    try:
        with patch.object(main, 'TrailVerseClient', return_value=api), patch.object(main, '_check_rate_limit', AsyncMock(return_value=None)), patch.object(main, '_resolve_park_code', AsyncMock(return_value='zion')), patch.object(main, '_send_analytics'):
            asyncio.run(run())
    finally:
        monkeypatch.undo()
        importlib.reload(main)
