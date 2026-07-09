#!/usr/bin/env python3
"""Production verification for plan_trip after MCP deploy."""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.main import plan_trip  # noqa: E402

TRAILVERSE_API_BASE = "https://trailverse.onrender.com"


def _summary(result) -> dict:
    is_error = bool(getattr(result, "isError", False))
    sc = getattr(result, "structuredContent", None) or {}
    text = ""
    content = getattr(result, "content", None) or []
    if content:
        text = getattr(content[0], "text", "")[:200]
    return {
        "isError": is_error,
        "status": sc.get("status"),
        "errorCode": (sc.get("error") or {}).get("code"),
        "sessionId": sc.get("sessionId"),
        "hasDays": bool(sc.get("days")),
        "dayCount": len(sc.get("days") or []),
        "textPreview": text,
    }


async def run_scenario(name: str, coro) -> dict:
    start = time.monotonic()
    result = await coro
    elapsed_ms = round((time.monotonic() - start) * 1000)
    out = _summary(result)
    out["scenario"] = name
    out["elapsedMs"] = elapsed_ms
    return out


async def main() -> int:
    import os

    os.environ.setdefault("TRAILVERSE_API_BASE", TRAILVERSE_API_BASE)

    results = []

    results.append(
        await run_scenario(
            "A_create_shenandoah",
            plan_trip(
                park_code="shen",
                start_date="2026-10-15",
                number_of_days=3,
                adults=2,
                difficulty=["easy", "moderate"],
                max_hike_miles=3,
                interests=["photography", "wildlife", "scenic-drives"],
                sunrise=True,
                sunset=True,
                relaxed_afternoon=True,
            ),
        )
    )

    session_id = results[-1].get("sessionId")
    if session_id:
        results.append(
            await run_scenario(
                "B_revise_day2",
                plan_trip(
                    session_id=session_id,
                    revision_request=(
                        "Make Day 2 a relaxed afternoon while preserving "
                        "the rest of the itinerary."
                    ),
                ),
            )
        )
    else:
        results.append(
            {
                "scenario": "B_revise_day2",
                "skipped": True,
                "reason": "no session_id from scenario A",
            }
        )

    results.append(
        await run_scenario(
            "C_create_acadia",
            plan_trip(
                park_code="acad",
                start_date="2026-10-15",
                number_of_days=3,
                difficulty=["easy"],
                sunrise=True,
                interests=["photography"],
            ),
        )
    )

    results.append(
        await run_scenario(
            "D_missing_date",
            plan_trip(
                park_code="shen",
                number_of_days=3,
                adults=2,
            ),
        )
    )

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
