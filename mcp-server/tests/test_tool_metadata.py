"""tools/list snapshot checks (Fix 3): honest, documented, non-steering metadata."""
from __future__ import annotations

import asyncio
import re

import pytest

from server.host_instructions import BANNED_STEERING_PHRASES, MCP_HOST_INSTRUCTIONS
from server.main import mcp

EXPECTED_TOOLS = {"plan_trip", "get_park_details", "compare_parks", "search_parks", "find_events"}

# Selection-steering / overclaiming language that must not appear in any
# model-readable tool field.
STEERING_PATTERNS = [
    r"\bALWAYS\b",
    r"\bFIRST\b",
    r"\bIMMEDIATELY\b",
    r"REAL-TIME",
    r"on every call",
    r"[Ww]hen in doubt",
    r"better, more current",
    r"than web search",
    r"prefer (it|this tool) over",
    r"confidence[- ]scor",
    r"post-validat",
]


def _tools():
    return asyncio.run(mcp.list_tools())


def _model_readable_text(tool) -> str:
    parts = [tool.name, tool.title or "", tool.description or ""]
    for prop in (tool.inputSchema.get("properties") or {}).values():
        parts.append(prop.get("description") or "")
    if tool.annotations and tool.annotations.title:
        parts.append(tool.annotations.title)
    return "\n".join(parts)


def test_exactly_five_tools():
    assert {t.name for t in _tools()} == EXPECTED_TOOLS


@pytest.mark.parametrize("name", sorted(EXPECTED_TOOLS))
def test_every_parameter_has_a_description(name):
    tool = next(t for t in _tools() if t.name == name)
    props = tool.inputSchema.get("properties") or {}
    assert props, f"{name} exposes no parameters"
    for pname, prop in props.items():
        assert (prop.get("description") or "").strip(), f"{name}.{pname} has no description"


@pytest.mark.parametrize("name", sorted(EXPECTED_TOOLS))
def test_descriptions_follow_use_this_when_and_do_not_use(name):
    tool = next(t for t in _tools() if t.name == name)
    assert tool.description.startswith("Use this when"), name
    assert "Do not use for" in tool.description, name
    assert tool.title, f"{name} has no top-level title"


@pytest.mark.parametrize("name", sorted(EXPECTED_TOOLS))
def test_no_steering_or_overclaiming_language(name):
    text = _model_readable_text(next(t for t in _tools() if t.name == name))
    for pattern in STEERING_PATTERNS:
        assert not re.search(pattern, text), f"{name} contains steering text {pattern!r}"


@pytest.mark.parametrize("name", sorted(EXPECTED_TOOLS))
def test_annotations_are_explicit(name):
    ann = next(t for t in _tools() if t.name == name).annotations
    for field in ("readOnlyHint", "destructiveHint", "openWorldHint", "idempotentHint"):
        assert getattr(ann, field) is not None, f"{name}.{field} not set"
    assert ann.destructiveHint is False


def test_read_only_hints_match_behavior():
    hints = {t.name: t.annotations.readOnlyHint for t in _tools()}
    # plan_trip persists an anonymous guest session + itinerary in the backend.
    assert hints["plan_trip"] is False
    for name in EXPECTED_TOOLS - {"plan_trip"}:
        assert hints[name] is True, name


def test_plan_trip_documents_ranges_and_difficulty_values():
    tool = next(t for t in _tools() if t.name == "plan_trip")
    props = tool.inputSchema["properties"]
    assert props["number_of_days"]["minimum"] == 1 and props["number_of_days"]["maximum"] == 14
    assert "1–14" in props["number_of_days"]["description"]
    assert "easy, moderate, challenging" in props["difficulty"]["description"]
    assert "48 hours" in tool.description  # persistence disclosed


def test_compare_does_not_promise_drive_distance_or_decision():
    tool = next(t for t in _tools() if t.name == "compare_parks")
    desc = tool.description.lower()
    assert "driving distance" not in desc
    assert "decision recommendation" not in desc
    assert "not calculated" in desc
    schema = tool.inputSchema["properties"]["park_codes"]
    assert schema["minItems"] == 2 and schema["maxItems"] == 4


def test_get_park_details_discloses_caching():
    desc = next(t for t in _tools() if t.name == "get_park_details").description
    assert "cached" in desc and "30 minutes" in desc


def test_host_instructions_do_not_steer_selection():
    for phrase in BANNED_STEERING_PHRASES:
        assert phrase not in MCP_HOST_INSTRUCTIONS, phrase
    for pattern in (r"\bALWAYS\b", r"\bFIRST\b", r"web_search", r"[Ww]hen in doubt"):
        assert not re.search(pattern, MCP_HOST_INSTRUCTIONS), pattern


def test_host_instructions_keep_user_park_count_edit():
    assert 'not just the 64 "big" national parks' in MCP_HOST_INSTRUCTIONS


def test_whats_happening_prompt_routes_to_events_wording():
    prompts = asyncio.run(mcp.list_prompts())
    prompt = next(p for p in prompts if p.name == "whats_happening")
    rendered = asyncio.run(mcp.get_prompt("whats_happening", {"park_name": "Zion"}))
    text = rendered.messages[0].content.text
    assert "ranger programs" in text and "events" in text
    assert "right now" not in text
    assert "events" in (prompt.description or "").lower()
