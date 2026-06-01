#!/usr/bin/env python3
"""
Verify that each MCP tool's structuredContent contains all keys
the corresponding ChatGPT widget expects to render.

Usage:
    python scripts/verify_widgets.py              # test all tools
    python scripts/verify_widgets.py park_details  # test one tool
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.main import (  # noqa: E402
    compare_parks,
    find_events,
    get_park_details,
    plan_trip,
    search_parks,
)

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def _extract_structured(result) -> dict:
    """Extract structuredContent from a CallToolResult (Pydantic model)."""
    if hasattr(result, "structuredContent"):
        sc = result.structuredContent
        if isinstance(sc, dict):
            return sc
        if hasattr(sc, "model_dump"):
            return sc.model_dump()
    if hasattr(result, "model_dump"):
        d = result.model_dump()
        return d.get("structuredContent") or {}
    return {}


def _extract_text(result) -> str:
    """Extract text content from a CallToolResult."""
    if hasattr(result, "content"):
        for block in result.content:
            if hasattr(block, "text"):
                return block.text
            if isinstance(block, dict) and block.get("type") == "text":
                return block["text"]
    return ""


def _check_keys(data: dict, required: list[str], path: str = "") -> list[str]:
    """Check that required keys exist in data. Returns list of missing keys."""
    missing = []
    for key in required:
        parts = key.split(".", 1)
        if parts[0] not in data:
            missing.append(f"{path}{key}")
        elif len(parts) > 1 and isinstance(data[parts[0]], dict):
            missing.extend(_check_keys(data[parts[0]], [parts[1]], f"{path}{parts[0]}."))
    return missing


def _check_array_item_keys(data: dict, array_key: str, required_item_keys: list[str]) -> list[str]:
    """Check that items in an array have required keys."""
    issues = []
    arr = data.get(array_key, [])
    if not arr:
        return [f"{array_key} is empty"]
    first = arr[0] if isinstance(arr[0], dict) else {}
    for k in required_item_keys:
        if k not in first:
            issues.append(f"{array_key}[0] missing '{k}'")
    return issues


# Widget field expectations: what each widget's render() reads from structuredContent
WIDGET_CHECKS = {
    "park_details": {
        "call": lambda: get_park_details(park_code="zion"),
        "required_keys": [
            "name", "parkCode", "designation", "heroImage",
            "alerts", "activities", "entranceFees", "description",
        ],
        "optional_keys": [
            "weather.current", "weather.forecast", "weather.seasonal",
            "editorial", "operatingHours", "campgrounds", "permits",
            "images", "directionsInfo", "links", "links.maps",
        ],
        "array_checks": {
            "alerts": ["title", "category"],
            "entranceFees": ["title", "cost"],
        },
        "deep_checks": [
            ("weather.current.tempF", "current temperature"),
            ("weather.current.feelsLike", "feelsLike (NEW)"),
            ("weather.current.uvIndex", "uvIndex (NEW)"),
            ("links.trailverse", "TrailVerse link"),
            ("links.planTrip", "plan trip link"),
        ],
    },
    "itinerary": {
        "call": lambda: plan_trip(
            message="Plan a 2-day trip to Zion for beginners in May",
            park_code="zion", persona="planner", days=2,
        ),
        "required_keys": ["parkName", "itinerary", "sessionId"],
        "optional_keys": ["narrative", "persona", "intent", "dayMaps", "parkImages", "links"],
        "array_checks": {},
        "deep_checks": [
            ("itinerary.days", "itinerary days"),
            ("links.continueOnWebsite", "continue link"),
        ],
    },
    "compare": {
        "call": lambda: compare_parks(park_codes=["zion", "brca"]),
        "required_keys": ["parks", "highlights"],
        "optional_keys": ["links"],
        "array_checks": {
            "parks": ["name", "parkCode"],
        },
        "deep_checks": [
            ("links.continueOnWebsite", "compare page link"),
            ("links.directionsUrl", "directionsUrl (NEW)"),
        ],
    },
    "search": {
        "call": lambda: search_parks(state="UT", limit=3),
        "required_keys": ["parks", "count"],
        "optional_keys": ["links"],
        "array_checks": {
            "parks": ["name", "parkCode", "heroImage"],
        },
        "deep_checks": [
            ("links.exploreAll", "explore all link"),
        ],
    },
    "events": {
        "call": lambda: find_events(park_code="zion", limit=5),
        "required_keys": ["events"],
        "optional_keys": ["links"],
        "array_checks": {
            "events": ["title", "date"],
        },
        "deep_checks": [],
    },
}


def _deep_get(data: dict, dotpath: str):
    """Get a nested value by dot-separated path."""
    parts = dotpath.split(".")
    current = data
    for p in parts:
        if isinstance(current, dict) and p in current:
            current = current[p]
        else:
            return None
    return current


async def verify_tool(name: str, spec: dict) -> tuple[bool, list[str]]:
    """Run one tool and verify its structuredContent. Returns (pass, issues)."""
    issues = []

    print(f"\n{BOLD}Testing {name}...{RESET}")
    try:
        result = await spec["call"]()
    except Exception as e:
        return False, [f"Tool call failed: {e}"]

    sc = _extract_structured(result)
    text = _extract_text(result)

    if not sc:
        min_len = 400 if name == "park_details" else 150
        if len(text) >= min_len:
            print(f"  {GREEN}✓{RESET} markdown-only mode ({len(text)} chars text, no structuredContent)")
            print(f"\n  {DIM}text length:{RESET} {len(text)} chars")
            return True, []
        return False, ["No structuredContent and text too short for markdown-only mode"]

    if sc.get("kind") == "error":
        return False, [f"Tool returned error: {sc.get('message', '?')}"]

    # Check required keys
    missing_required = _check_keys(sc, spec["required_keys"])
    for m in missing_required:
        issues.append(f"{RED}MISSING required{RESET}: {m}")

    # Check optional keys (warn only)
    missing_optional = _check_keys(sc, spec["optional_keys"])
    for m in missing_optional:
        issues.append(f"{YELLOW}MISSING optional{RESET}: {m}")

    # Check array item structure
    for arr_key, item_keys in spec.get("array_checks", {}).items():
        arr_issues = _check_array_item_keys(sc, arr_key, item_keys)
        for issue in arr_issues:
            issues.append(f"{YELLOW}ARRAY{RESET}: {issue}")

    # Deep checks for specific nested keys
    for dotpath, label in spec.get("deep_checks", []):
        val = _deep_get(sc, dotpath)
        if val is None:
            issues.append(f"{YELLOW}DEEP{RESET}: {dotpath} ({label}) not found")
        else:
            val_preview = str(val)[:60] if not isinstance(val, (list, dict)) else f"[{type(val).__name__}]"
            print(f"  {GREEN}✓{RESET} {dotpath} = {DIM}{val_preview}{RESET}")

    # Check new widget fields specifically
    if name == "park_details":
        # Verify new sections added in our changes
        for section, label in [
            ("operatingHours", "Operating Hours"),
            ("campgrounds", "Campgrounds"),
            ("permits", "Permits"),
        ]:
            arr = sc.get(section, [])
            if arr:
                print(f"  {GREEN}✓{RESET} {section}: {len(arr)} item(s)")
                if arr and isinstance(arr[0], dict):
                    print(f"    {DIM}keys: {list(arr[0].keys())}{RESET}")
            else:
                issues.append(f"{YELLOW}EMPTY{RESET}: {section} (may be OK if park has none)")

        # Check images array
        images = sc.get("images", [])
        if images:
            print(f"  {GREEN}✓{RESET} images: {len(images)} photo(s)")
            if images[0].get("url"):
                print(f"    {DIM}first: {images[0]['url'][:60]}...{RESET}")

        # Check editorial atAGlance is NOT [object Object]
        ed = sc.get("editorial", {})
        if ed:
            aag = ed.get("atAGlance")
            if isinstance(aag, dict):
                print(f"  {GREEN}✓{RESET} editorial.atAGlance is dict (crowdLevel={aag.get('crowdLevel')})")
                print(f"    {DIM}Widget JS handles typeof === 'object' correctly{RESET}")
            elif isinstance(aag, str):
                print(f"  {GREEN}✓{RESET} editorial.atAGlance is string: {aag[:60]}")
            else:
                issues.append(f"{YELLOW}editorial.atAGlance{RESET}: unexpected type {type(aag)}")

        # Check alert URLs
        alerts = sc.get("alerts", [])
        for a in alerts[:2]:
            if a.get("url"):
                print(f"  {GREEN}✓{RESET} alert has url: {a['url'][:60]}...")
                break
        else:
            if alerts:
                issues.append(f"{YELLOW}ALERT{RESET}: no alerts have 'url' field (may be OK)")

        maps_link = _deep_get(sc, "links.maps")
        if maps_link:
            print(f"  {GREEN}✓{RESET} links.maps (Getting there)")
        if sc.get("directionsInfo"):
            print(f"  {GREEN}✓{RESET} directionsInfo: {str(sc['directionsInfo'])[:60]}...")

    if name == "itinerary":
        dm = sc.get("dayMaps", [])
        if dm:
            print(f"  {GREEN}✓{RESET} dayMaps: {len(dm)} day(s)")
            for m in dm[:2]:
                print(f"    {DIM}{m.get('day')}: {(m.get('url') or '')[:60]}...{RESET}")
        else:
            issues.append(f"{YELLOW}EMPTY{RESET}: dayMaps (NEW — may not be returned for all trips)")

        pi = sc.get("parkImages", [])
        if pi:
            print(f"  {GREEN}✓{RESET} parkImages: {len(pi)} image(s)")

    if name == "compare":
        dir_url = _deep_get(sc, "links.directionsUrl")
        if dir_url:
            print(f"  {GREEN}✓{RESET} directionsUrl: {dir_url[:60]}...")
        else:
            issues.append(f"{YELLOW}MISSING{RESET}: links.directionsUrl (NEW)")

        # Check parks have review fields
        for p in sc.get("parks", []):
            if "reviewCount" in p:
                print(f"  {GREEN}✓{RESET} {p.get('parkCode')}: reviewCount={p['reviewCount']}")
                break

    if name == "search":
        for p in sc.get("parks", [])[:1]:
            if p.get("mapsUrl"):
                print(f"  {GREEN}✓{RESET} park has mapsUrl: {p['mapsUrl'][:60]}...")
            else:
                issues.append(f"{YELLOW}MISSING{RESET}: parks[0].mapsUrl (NEW)")

    if name == "events":
        evts = sc.get("events", [])
        has_recurring = any(e.get("recurring") for e in evts)
        has_free = any(e.get("isFree") for e in evts)
        has_date_end = any(e.get("dateEnd") for e in evts)
        if has_recurring:
            print(f"  {GREEN}✓{RESET} Found recurring events")
        if has_free:
            print(f"  {GREEN}✓{RESET} Found free events (isFree)")
        if has_date_end:
            print(f"  {GREEN}✓{RESET} Found events with dateEnd")
        if not any([has_recurring, has_free, has_date_end]):
            issues.append(f"{YELLOW}NOTE{RESET}: no events had recurring/isFree/dateEnd (data-dependent)")

    # Summary
    print(f"\n  {DIM}structuredContent top-level keys:{RESET} {list(sc.keys())}")
    print(f"  {DIM}text length:{RESET} {len(text)} chars")

    has_errors = any("MISSING required" in i for i in issues)
    return not has_errors, issues


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tool", nargs="?", help="Test only this tool (omit for all)")
    args = ap.parse_args()

    print(f"{BOLD}Widget structuredContent verification{RESET}")
    print(f"Backend: {os.getenv('TRAILVERSE_API_BASE', 'https://trailverse.onrender.com')}\n")

    checks = WIDGET_CHECKS
    if args.tool:
        if args.tool not in checks:
            print(f"{RED}Unknown tool: {args.tool}{RESET}")
            print(f"Available: {', '.join(checks.keys())}")
            sys.exit(1)
        checks = {args.tool: checks[args.tool]}

    all_pass = True
    for name, spec in checks.items():
        passed, issues = await verify_tool(name, spec)
        if not passed:
            all_pass = False

        if issues:
            print(f"\n  Issues:")
            for issue in issues:
                print(f"    • {issue}")

        status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"\n  → {status}")

    print(f"\n{'='*50}")
    if all_pass:
        print(f"{GREEN}{BOLD}All widget checks passed!{RESET}")
    else:
        print(f"{RED}{BOLD}Some checks failed — see above.{RESET}")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
