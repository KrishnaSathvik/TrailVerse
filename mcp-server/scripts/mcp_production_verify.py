#!/usr/bin/env python3
"""Call production MCP plan_trip scenarios with timing."""
from __future__ import annotations

import json
import time
import urllib.request

MCP_URL = "https://trailverse-mcp.onrender.com/mcp"


def mcp_call(method: str, params: dict | None = None, req_id: int = 1) -> dict:
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(
        MCP_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def call_tool(name: str, arguments: dict, req_id: int) -> tuple[dict, int]:
    start = time.monotonic()
    result = mcp_call("tools/call", {"name": name, "arguments": arguments}, req_id)
    elapsed_ms = round((time.monotonic() - start) * 1000)
    return result, elapsed_ms


def summarize_tool_result(payload: dict) -> dict:
    result = payload.get("result", {})
    is_error = result.get("isError", False)
    sc = result.get("structuredContent") or {}
    text = ""
    content = result.get("content") or []
    if content and isinstance(content[0], dict):
        text = content[0].get("text", "")
    session_id = sc.get("sessionId") or sc.get("session_id")
    if not session_id and text:
        import re
        match = re.search(r"\[session_id: ([^\]]+)\]", text)
        if match:
            session_id = match.group(1).strip()
    return {
        "isError": is_error,
        "status": sc.get("status"),
        "errorCode": (sc.get("error") or {}).get("code"),
        "sessionId": session_id,
        "plannerMode": sc.get("plannerMode") or sc.get("planner_mode"),
        "dayCount": len(sc.get("days") or []),
        "hasItinerary": sc.get("hasItinerary"),
        "textPreview": text[:180],
    }


def main() -> None:
    mcp_call("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "prod-verify", "version": "1.0"},
    }, 1)
    mcp_call("notifications/initialized", {}, 2)
    tools = mcp_call("tools/list", {}, 3)
    tool_names = [t["name"] for t in tools["result"]["tools"]]

    results = [{"toolNames": tool_names}]

    # D first (fast validation)
    payload, ms = call_tool(
        "plan_trip",
        {"park_code": "shen", "number_of_days": 3, "adults": 2},
        4,
    )
    results.append({"scenario": "D_missing_date", "elapsedMs": ms, **summarize_tool_result(payload)})

    # A create
    payload, ms = call_tool(
        "plan_trip",
        {
            "park_code": "shen",
            "start_date": "2026-10-15",
            "number_of_days": 3,
            "adults": 2,
            "difficulty": ["easy", "moderate"],
            "max_hike_miles": 3,
            "interests": ["photography", "wildlife", "scenic-drives"],
            "sunrise": True,
            "sunset": True,
            "relaxed_afternoon": True,
        },
        5,
    )
    summary = summarize_tool_result(payload)
    results.append({"scenario": "A_create_shenandoah", "elapsedMs": ms, **summary})
    session_id = summary.get("sessionId")

    if session_id:
        payload, ms = call_tool(
            "plan_trip",
            {
                "session_id": session_id,
                "revision_request": (
                    "Make Day 2 a relaxed afternoon while preserving "
                    "the rest of the itinerary."
                ),
            },
            6,
        )
        results.append({"scenario": "B_revise_day2", "elapsedMs": ms, **summarize_tool_result(payload)})
    else:
        results.append({"scenario": "B_revise_day2", "skipped": True, "reason": "no session_id"})

    payload, ms = call_tool(
        "plan_trip",
        {
            "park_code": "acad",
            "start_date": "2026-10-15",
            "number_of_days": 3,
            "difficulty": ["easy"],
            "sunrise": True,
            "interests": ["photography"],
        },
        7,
    )
    results.append({"scenario": "C_create_acadia", "elapsedMs": ms, **summarize_tool_result(payload)})

    # quick missing-park validation proves new deploy
    payload, ms = call_tool("plan_trip", {"number_of_days": 3, "adults": 2}, 8)
    results.append({"scenario": "validation_missing_park", "elapsedMs": ms, **summarize_tool_result(payload)})

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
