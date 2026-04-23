#!/usr/bin/env python3
"""
Local smoke test for the TrailVerse MCP server.

Calls each of the 5 tools directly against the TrailVerse backend
(no MCP protocol layer — just the Python handlers) and prints the
shape of what ChatGPT would receive.

Usage:
    python scripts/test_local.py                  # test all tools
    python scripts/test_local.py plan_trip        # test one tool
    TRAILVERSE_API_BASE=http://localhost:5001 python scripts/test_local.py

Requires the TrailVerse Express backend to be reachable.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running from project root
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
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def _truncate(v, n=200):
    s = json.dumps(v, default=str, indent=2)
    return s if len(s) <= n else s[:n] + f"... [{len(s)} chars]"


def _print_result(name: str, result: dict) -> bool:
    is_error = result.get("isError", False)
    prefix = f"{RED}✗{RESET}" if is_error else f"{GREEN}✓{RESET}"
    print(f"\n{prefix} {BOLD}{name}{RESET}")

    content = result.get("content", [])
    if content and content[0].get("type") == "text":
        print(f"  {DIM}text:{RESET} {content[0]['text'][:160]}")

    structured = result.get("structuredContent", {})
    if structured:
        kind = structured.get("kind", "?")
        print(f"  {DIM}kind:{RESET} {kind}")
        # Pretty-print a summary of structured keys
        for k, v in structured.items():
            if k == "kind":
                continue
            if isinstance(v, list):
                print(f"  {DIM}{k}:{RESET} [{len(v)} item(s)]")
            elif isinstance(v, dict):
                keys = list(v.keys())[:4]
                print(f"  {DIM}{k}:{RESET} {{{', '.join(keys)}}}")
            else:
                val_str = str(v)
                print(f"  {DIM}{k}:{RESET} {val_str[:80]}")
    return not is_error


TESTS = {
    "search_parks": lambda: search_parks(state="UT", limit=3),
    "get_park_details": lambda: get_park_details(park_code="zion"),
    "compare_parks": lambda: compare_parks(park_codes=["zion", "brca"]),
    "find_events": lambda: find_events(limit=3),
    "plan_trip": lambda: plan_trip(
        message="Plan a relaxed 3-day trip to Zion for a beginner with kids in May",
        park_code="zion",
        persona="planner",
        days=3,
        group_size=3,
        fitness_level="easy",
        has_kids=True,
        interests=["photography", "family-friendly"],
    ),
}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tool", nargs="?", help="Test only this tool name (omit for all)")
    ap.add_argument("--base", default=os.getenv("TRAILVERSE_API_BASE", "https://trailverse.onrender.com"),
                    help="Backend base URL")
    args = ap.parse_args()

    os.environ["TRAILVERSE_API_BASE"] = args.base
    print(f"{BOLD}TrailVerse MCP — local smoke test{RESET}")
    print(f"Backend: {args.base}\n")

    tools = {args.tool: TESTS[args.tool]} if args.tool else TESTS
    if args.tool and args.tool not in TESTS:
        print(f"{RED}Unknown tool: {args.tool}{RESET}")
        print(f"Available: {', '.join(TESTS.keys())}")
        sys.exit(1)

    results = {}
    for name, fn in tools.items():
        try:
            result = await fn()
            results[name] = _print_result(name, result)
        except Exception as e:
            print(f"\n{RED}✗ {BOLD}{name}{RESET} — exception: {e}")
            results[name] = False

    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\n{BOLD}Summary:{RESET} {passed}/{total} passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    asyncio.run(main())
