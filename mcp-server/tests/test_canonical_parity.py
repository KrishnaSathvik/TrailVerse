"""The adapter must preserve planning meaning, including unknown future fields."""
import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from server.formatters import format_plan_trip
from server.plan_trip_service import slim_plan_trip_structured

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = json.loads((ROOT/'next-frontend/src/data/public-itineraries/index.json').read_text())
DEMO_TURNS = [(scenario['id'], index + 1, turn) for scenario in
              json.loads((ROOT/'next-frontend/src/data/trailieDemoPlayback.json').read_text())['scenarios']
              for index, turn in enumerate(scenario['turns']) if turn.get('plan')]


@pytest.mark.parametrize('scenario,turn_number,turn', DEMO_TURNS,
                         ids=[f'{scenario}-{number}' for scenario, number, _ in DEMO_TURNS])
def test_demo_canonical_plans_are_lossless_in_mcp(scenario, turn_number, turn):
    plan = turn['plan']
    structured, text = format_plan_trip({'data': {'canonicalPlan': plan, 'content': turn['content']}}, user_message=turn['question'])
    for wire in (structured, slim_plan_trip_structured(structured)):
        assert wire['canonicalPlan'] == plan
        assert wire['days'] == plan['days']
    assert json.loads(text.split('```json\n')[1].split('\n```')[0]) == plan

@pytest.mark.parametrize('sample', SAMPLES, ids=lambda s: s['slug'])
def test_every_real_sample_is_lossless_in_both_mcp_modes(sample):
    plan = sample['plan']
    before = json.dumps(plan)
    structured, text = format_plan_trip({'data': {'canonicalPlan': plan, 'content': 'Exact answer.'}}, user_message='Plan a trip')
    for wire in (structured, slim_plan_trip_structured(structured)):
        assert wire['canonicalPlan'] == plan
        assert wire['itinerary'] == plan
        assert wire['days'] == plan['days']
        assert 'buffer_minutes' not in wire['days'][0]
    rendered = json.loads(text.split('```json\n')[1].split('\n```')[0])
    assert rendered == plan
    assert json.dumps(plan) == before

@pytest.mark.parametrize('widgets', [False, True])
@pytest.mark.parametrize('saved_plan', [None, SAMPLES[0]['plan']])
def test_real_tool_preserves_reply_success_and_failed_save(widgets, saved_plan):
    from server.main import plan_trip
    outcome = {'artifactStatus': {'status': 'save_failed', 'code': 'mutation_rejected', 'notice': 'Saved trip unchanged.'},
               'mutationStatus': 'rejected_answered', 'mutationIssues': ['stop_identity_unresolved'],
               'correctionAttempted': True, 'correctionIssues': ['stop_identity_unresolved']}
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.plan_trip_anonymous = AsyncMock(return_value={'success': True, 'data': {
        'content': 'Useful answer.', 'canonicalPlan': saved_plan, 'anonymousId': 'test-session', **outcome}})
    async def run():
        with patch('server.main.TrailVerseClient', return_value=client), patch('server.main._check_rate_limit', AsyncMock(return_value=None)), patch('server.main._resolve_park_code', AsyncMock(return_value='zion')), patch('server.main._park_display_name', AsyncMock(return_value='Zion')), patch('server.main.ENABLE_WIDGETS', widgets):
            return await plan_trip(park_code='zion', number_of_days=3, travel_month='October')
    result = asyncio.run(run())
    assert not result.isError  # A usable reply is not a tool failure.
    assert result.structuredContent['status'] == 'save_failed'
    assert result.structuredContent['replyStatus'] == 'success'
    assert result.structuredContent['canonicalPlan'] == saved_plan
    for key, value in outcome.items():
        assert result.structuredContent[key] == value
    assert 'Useful answer.' in result.content[0].text


def test_canonical_authority_and_future_fields_are_not_overwritten():
    plan = {'days': [], 'destinations': [], 'futureContract': {'meaning': 42}}
    structured, _ = format_plan_trip({'data': {'canonicalPlan': plan, 'itinerary': {'days': ['stale']}}}, user_message='x')
    assert slim_plan_trip_structured(structured)['canonicalPlan'] == plan


def test_reply_failure_is_distinct_from_save_failure():
    from server.main import plan_trip
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.plan_trip_anonymous = AsyncMock(return_value={'success': False, 'error': 'Provider unavailable', 'code': 'model_first_unavailable'})
    async def run():
        with patch('server.main.TrailVerseClient', return_value=client), patch('server.main._check_rate_limit', AsyncMock(return_value=None)), patch('server.main._resolve_park_code', AsyncMock(return_value='zion')):
            return await plan_trip(park_code='zion', number_of_days=3, travel_month='October')
    result = asyncio.run(run())
    assert result.isError
    assert 'model_first_unavailable' in json.dumps(result.structuredContent)
    assert result.structuredContent.get('status') != 'save_failed'
