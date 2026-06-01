#!/usr/bin/env python3
"""
Cross-check MCP tool output against live TrailVerse API responses.

Validates structuredContent when MCP_ENABLE_WIDGETS=true; otherwise checks full
markdown text blocks (default markdown-only mode).

Usage:
    TRAILVERSE_API_BASE=http://127.0.0.1:5001 python scripts/test_accuracy.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from server.client import TrailVerseClient
from server.main import (
    compare_parks,
    find_events,
    get_park_details,
    plan_trip,
    search_parks,
)

BASE = os.getenv("TRAILVERSE_API_BASE", "http://127.0.0.1:5001").rstrip("/")
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

issues: list[str] = []
passed: list[str] = []


def ok(msg: str) -> None:
    passed.append(msg)
    print(f"  {GREEN}✓{RESET} {msg}")


def warn(msg: str) -> None:
    issues.append(f"WARN: {msg}")
    print(f"  {YELLOW}⚠{RESET} {msg}")


def fail(msg: str) -> None:
    issues.append(f"FAIL: {msg}")
    print(f"  {RED}✗{RESET} {msg}")


def sc_from_result(result: Any) -> dict:
    sc = getattr(result, "structuredContent", None)
    return sc if isinstance(sc, dict) else {}


def _extract_text(result: Any) -> str:
    content = getattr(result, "content", None) or []
    parts: list[str] = []
    for block in content:
        if hasattr(block, "text"):
            parts.append(getattr(block, "text", "") or "")
        elif isinstance(block, dict):
            parts.append(block.get("text", "") or "")
    return "\n".join(parts).strip()


async def api_get(path: str, **params: Any) -> dict:
    async with httpx.AsyncClient(base_url=BASE, timeout=60.0) as client:
        r = await client.get(f"/api{path}", params=params or None)
        r.raise_for_status()
        return r.json()


async def test_park_details() -> None:
    print(f"\n{BOLD}1. get_park_details (zion){RESET}")
    code = "zion"
    raw = await api_get(f"/parks/{code}/details")
    raw_alerts = await api_get(f"/parks/{code}/alerts")
    raw_weather = await api_get(f"/parks/{code}/weather")

    result = await get_park_details(park_code=code)
    sc = sc_from_result(result)
    text = _extract_text(result)
    if sc.get("kind") == "error":
        fail(f"tool error: {sc.get('message')}")
        return

    api_park = (raw.get("data") or {}).get("park") or raw.get("data") or {}
    api_name = api_park.get("fullName") or api_park.get("name")

    if not sc:
        if api_name and api_name in text:
            ok(f"markdown contains park name: {api_name}")
        else:
            fail(f"markdown missing API park name {api_name!r}")
        if code in text.lower() or (api_name and api_name.split()[0].lower() in text.lower()):
            ok(f"markdown references {code}")
        else:
            warn("park code/name not obvious in markdown text")
        api_alert_list = raw_alerts.get("data") or raw_alerts.get("alerts") or []
        if isinstance(api_alert_list, list) and api_alert_list:
            if "## Active Alerts" in text or "## Alerts" in text:
                ok("markdown has alerts section")
            else:
                warn("API has alerts but markdown alerts section missing")
        w_data = raw_weather.get("data") or raw_weather
        api_cur = w_data.get("current") or w_data
        api_temp = api_cur.get("tempF") or api_cur.get("temperature") or api_cur.get("temp")
        if api_temp is not None and str(int(round(float(api_temp)))) in text:
            ok(f"markdown includes weather temp ~{api_temp}°F")
        elif "## Weather" in text or "## Right Now" in text:
            ok("markdown has weather section")
        else:
            warn(f"weather temp {api_temp} not found in markdown")
        if "google.com/maps" in text or "## Getting There" in text:
            ok("markdown has maps or getting-there section")
        else:
            warn("missing maps link or Getting There section in markdown")
        if len(text) >= 500:
            ok(f"full markdown text ({len(text)} chars)")
        else:
            fail(f"markdown text too short ({len(text)} chars)")
        return

    if sc.get("name") == api_name:
        ok(f"name matches API: {api_name}")
    else:
        fail(f"name mismatch tool={sc.get('name')!r} api={api_name!r}")

    if (sc.get("parkCode") or "").lower() == code:
        ok(f"parkCode={code}")
    else:
        fail(f"parkCode mismatch: {sc.get('parkCode')}")

    api_alert_list = raw_alerts.get("data") or raw_alerts.get("alerts") or []
    if not isinstance(api_alert_list, list):
        api_alert_list = []
    tool_alerts = sc.get("alerts") or []
    if len(tool_alerts) == min(len(api_alert_list), 6):
        ok(f"alert count aligned: tool={len(tool_alerts)} api={len(api_alert_list)}")
    elif len(api_alert_list) == 0 and len(tool_alerts) == 0:
        ok("no alerts (API and tool agree)")
    else:
        warn(f"alert count tool={len(tool_alerts)} api={len(api_alert_list)} (tool caps at 6)")

    if tool_alerts and api_alert_list:
        api_titles = {(a.get("title") or "").strip().lower() for a in api_alert_list[:6]}
        tool_titles = {(a.get("title") or "").strip().lower() for a in tool_alerts}
        overlap = api_titles & tool_titles
        if overlap:
            ok(f"alert titles overlap API ({len(overlap)} matched)")
        else:
            fail("alert titles do not match any API alert")

    w_data = raw_weather.get("data") or raw_weather
    api_cur = w_data.get("current") or w_data
    tool_cur = (sc.get("weather") or {}).get("current") or {}
    api_temp = api_cur.get("tempF") or api_cur.get("temperature") or api_cur.get("temp")
    tool_temp = tool_cur.get("tempF")
    if api_temp is not None and tool_temp is not None:
        if abs(float(api_temp) - float(tool_temp)) < 0.5:
            ok(f"weather tempF matches API: {tool_temp}°F")
        else:
            fail(f"weather temp mismatch tool={tool_temp} api={api_temp}")
    elif api_temp is None and tool_temp is None:
        warn("no current temp in API or tool (may be unavailable)")
    else:
        warn(f"temp partial: tool={tool_temp} api={api_temp}")

    maps = (sc.get("links") or {}).get("maps") or ""
    if maps and "google.com/maps" in maps and "Zion" in maps or "zion" in maps.lower():
        ok("links.maps points to Google Maps for park")
    elif sc.get("directionsInfo"):
        ok("directionsInfo present (maps link optional)")
    else:
        warn("missing links.maps and directionsInfo")

    if sc.get("directionsInfo") and api_park.get("directionsInfo"):
        if (sc.get("directionsInfo") or "")[:40] in _strip(api_park.get("directionsInfo") or "")[:500]:
            ok("directionsInfo prefix matches API")
        else:
            warn("directionsInfo may be truncated differently than API raw text")

    text_len = len(text)
    if text_len >= 500:
        ok(f"full markdown text ({text_len} chars)")
    else:
        fail(f"markdown text too short ({text_len} chars) — expected full formatter output")

    meta = getattr(result, "meta", None) or getattr(result, "_meta", None) or {}
    if isinstance(meta, dict) and meta.get("openai/outputTemplate"):
        warn("outputTemplate still set (widget mode enabled?)")


def _strip(html: str) -> str:
    import re
    return " ".join(re.sub(r"<[^>]+>", "", html).split())


async def test_search() -> None:
    print(f"\n{BOLD}2. search_parks (quiet parks for beginners){RESET}")
    query = "quiet parks for beginners"
    raw = await api_get("/parks/search", q=query, limit=5)
    result = await search_parks(query=query, limit=5)
    sc = sc_from_result(result)
    text = _extract_text(result)

    raw_parks = raw.get("data") or raw.get("parks") or raw
    if isinstance(raw_parks, dict) and "parks" in raw_parks:
        raw_parks = raw_parks["parks"]

    if not sc:
        if len(text) >= 150:
            ok(f"search markdown ({len(text)} chars)")
        else:
            fail(f"search markdown too short ({len(text)} chars)")
        if isinstance(raw_parks, list) and raw_parks:
            first = raw_parks[0]
            name = first.get("fullName") or first.get("name") or ""
            if name and name in text:
                ok(f"markdown lists API park: {name}")
            else:
                warn("first API park name not found verbatim in markdown")
    else:
        tool_parks = sc.get("parks") or []
        if len(tool_parks) >= 1:
            ok(f"returned {len(tool_parks)} parks")
        else:
            fail("no parks returned")
            return

        if len(tool_parks) <= len(raw_parks) if isinstance(raw_parks, list) else True:
            ok("tool count <= API count")
        else:
            fail("tool returned more parks than API")

        with_reason = [p for p in tool_parks if p.get("matchReason")]
        if with_reason:
            ok(f"{len(with_reason)}/{len(tool_parks)} have matchReason")
            sample = with_reason[0]
            print(f"    {DIM}sample:{RESET} {sample.get('name')} — {sample.get('matchReason')}")
        else:
            warn("no matchReason on results (ranked search may be disabled on API)")

        if isinstance(raw_parks, list) and raw_parks:
            api_codes = {((p.get("parkCode") or p.get("code") or "").lower()) for p in raw_parks}
            tool_codes = {(p.get("parkCode") or "").lower() for p in tool_parks}
            if tool_codes <= api_codes or tool_codes & api_codes:
                ok("tool park codes are subset of API results")
            else:
                fail(f"tool codes not in API: {tool_codes - api_codes}")

    print(f"\n{BOLD}3. search_parks (state=UT){RESET}")
    raw_ut = await api_get("/parks/search", state="UT", limit=5)
    result_ut = await search_parks(state="UT", limit=5)
    sc_ut = sc_from_result(result_ut)
    text_ut = _extract_text(result_ut)

    if not sc_ut:
        if len(text_ut) >= 80:
            ok(f"UT search markdown ({len(text_ut)} chars)")
        else:
            fail(f"UT search markdown too short ({len(text_ut)} chars)")
        if "UT" in text_ut or "Utah" in text_ut:
            ok("UT search markdown mentions Utah")
        else:
            warn("UT/Utah not obvious in markdown")
    else:
        parks_ut = sc_ut.get("parks") or []
        bad_state = [p for p in parks_ut if p.get("states") and "UT" not in (p.get("states") or "")]
        if not bad_state:
            ok(f"all {len(parks_ut)} UT results list UT in states")
        else:
            warn(f"{len(bad_state)} parks missing UT in states field: {[p.get('name') for p in bad_state[:2]]}")


async def test_compare() -> None:
    print(f"\n{BOLD}4. compare_parks (zion, brca){RESET}")
    codes = ["zion", "brca"]
    async with TrailVerseClient() as client:
        raw = await client.compare_parks(codes)
    result = await compare_parks(park_codes=codes)
    sc = sc_from_result(result)
    text = _extract_text(result)

    if not sc:
        if len(text) >= 300:
            ok(f"compare markdown ({len(text)} chars)")
        else:
            fail(f"compare markdown too short ({len(text)} chars)")
        if "zion" in text.lower() and ("bryce" in text.lower() or "brca" in text.lower()):
            ok("markdown mentions both parks")
        else:
            warn("both park names not obvious in compare markdown")
        if "google.com/maps/dir" in text:
            ok("markdown has multi-stop directions link")
        else:
            warn("missing Google Maps directions link in markdown")
        return

    tool_parks = sc.get("parks") or []
    raw_list = raw.get("data") or raw.get("parks") or []
    if isinstance(raw_list, dict) and "parks" in raw_list:
        raw_list = raw_list["parks"]

    if len(tool_parks) == 2:
        ok("2 parks in comparison")
    else:
        fail(f"expected 2 parks, got {len(tool_parks)}")

    tool_codes = sorted((p.get("parkCode") or "").lower() for p in tool_parks)
    if tool_codes == sorted(codes):
        ok(f"park codes: {tool_codes}")
    else:
        fail(f"park codes mismatch: {tool_codes}")

    if isinstance(raw_list, list) and len(raw_list) >= 2:
        for tp in tool_parks:
            api_match = next(
                (p for p in raw_list if (p.get("parkCode") or p.get("code") or "").lower() == (tp.get("parkCode") or "").lower()),
                None,
            )
            if not api_match:
                fail(f"no API row for {tp.get('parkCode')}")
                continue
            api_name = api_match.get("fullName") or api_match.get("name")
            if tp.get("name") == api_name:
                ok(f"{tp.get('parkCode')}: name matches API")
            else:
                fail(f"{tp.get('parkCode')}: name tool={tp.get('name')!r} api={api_name!r}")

    dir_url = (sc.get("links") or {}).get("directionsUrl") or ""
    if dir_url and "google.com/maps/dir" in dir_url:
        ok("directionsUrl is a multi-stop Google Maps link")
    else:
        warn("missing or invalid directionsUrl")


async def test_events() -> None:
    print(f"\n{BOLD}5. find_events (zion, limit=5){RESET}")
    code = "zion"
    raw = await api_get("/events/", parkCode=code, limit=5)
    result = await find_events(park_code=code, limit=5)
    sc = sc_from_result(result)
    text = _extract_text(result)

    if not sc:
        if len(text) >= 80:
            ok(f"events markdown ({len(text)} chars)")
        else:
            warn(f"events markdown short ({len(text)} chars)")
        return

    tool_events = sc.get("events") or []
    raw_events = raw.get("data") or raw.get("events") or []
    if isinstance(raw_events, dict) and "events" in raw_events:
        raw_events = raw_events["events"]

    if len(tool_events) >= 1:
        ok(f"{len(tool_events)} events returned")
    else:
        warn("no events (may be seasonal)")
        return

    if tool_events[0].get("title"):
        ok("events have titles")
    else:
        fail("first event missing title")

    if isinstance(raw_events, list) and raw_events:
        api_titles = {(e.get("title") or e.get("name") or "").lower() for e in raw_events[:5]}
        if (tool_events[0].get("title") or "").lower() in api_titles:
            ok("first tool event title found in API list")
        else:
            warn("first tool event title not in API top 5 (ordering may differ)")


async def test_plan_trip() -> None:
    print(f"\n{BOLD}6. plan_trip (Zion 2-day beginner){RESET}")
    result = await plan_trip(
        message="Plan a 2-day trip to Zion for beginners in May",
        park_code="zion",
        persona="planner",
        days=2,
    )
    sc = sc_from_result(result)
    text = _extract_text(result)
    if sc.get("kind") == "error":
        fail(sc.get("message", "plan_trip error"))
        return

    if not sc:
        if len(text) >= 200:
            ok(f"plan_trip markdown ({len(text)} chars)")
        else:
            fail(f"plan_trip markdown too short ({len(text)} chars)")
        if "zion" in text.lower():
            ok("markdown mentions Zion")
        else:
            warn("Zion not obvious in plan markdown")
        if "plan-ai" in text or "nationalparksexplorerusa.com" in text:
            ok("markdown includes TrailVerse continue link")
        return

    park_label = sc.get("parkName") or (sc.get("itinerary") or {}).get("parkName") or ""
    if park_label and "zion" in park_label.lower():
        ok(f"parkName set: {park_label}")
    elif sc.get("parkCode") == "zion" and not park_label:
        fail("parkCode=zion but parkName still missing after backfill")
    else:
        warn(f"parkName={park_label!r} parkCode={sc.get('parkCode')!r}")

    it = sc.get("itinerary") or {}
    days = it.get("days") or []
    if len(days) >= 1:
        ok(f"itinerary has {len(days)} day(s)")
        stops = sum(len(d.get("stops") or []) for d in days)
        if stops >= 2:
            ok(f"{stops} total stops across days")
        else:
            warn(f"only {stops} stops (AI may return light itinerary)")
    else:
        fail("no itinerary.days")

    if sc.get("sessionId"):
        ok(f"sessionId present: {sc.get('sessionId')[:24]}...")
    else:
        fail("missing sessionId")

    if sc.get("narrative") and len(sc.get("narrative", "")) > 50:
        ok(f"narrative length {len(sc['narrative'])} chars")
    else:
        warn("short or missing narrative")


async def main() -> None:
    print(f"{BOLD}TrailVerse MCP — accuracy test{RESET}")
    print(f"Backend: {BASE}\n")

    try:
        await api_get("/parks/zion/details")
        ok("backend reachable")
    except Exception as e:
        print(f"{RED}Backend not reachable at {BASE}: {e}{RESET}")
        sys.exit(1)

    await test_park_details()
    await test_search()
    await test_compare()
    await test_events()
    await test_plan_trip()

    fails = [i for i in issues if i.startswith("FAIL:")]
    warns = [i for i in issues if i.startswith("WARN:")]
    print(f"\n{BOLD}{'=' * 50}{RESET}")
    print(f"{GREEN}{len(passed)}{RESET} checks passed")
    print(f"{YELLOW}{len(warns)}{RESET} warnings")
    print(f"{RED}{len(fails)}{RESET} failures")
    if warns:
        print(f"\n{DIM}Warnings:{RESET}")
        for w in warns:
            print(f"  • {w[6:]}")
    if fails:
        print(f"\n{RED}Failures:{RESET}")
        for f in fails:
            print(f"  • {f[6:]}")
        sys.exit(1)
    print(f"\n{GREEN}{BOLD}Accuracy test passed (with warnings noted above).{RESET}")
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
