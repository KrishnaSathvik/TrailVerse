#!/usr/bin/env python3
"""Run natural-language search_parks queries (local MCP or direct handlers)."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

QUERIES = [
    "nature relax ocean vibes",
    "best parks for couples",
    "easy hikes with waterfalls",
    "peaceful park with beach views",
    "family friendly park with camping",
    "winter national parks with snow",
    "best parks for photography",
]

MCP_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8000/mcp")


def _park_names(structured: dict) -> list[str]:
    parks = structured.get("parks") or []
    return [
        f"{p.get('name', '?')} ({p.get('states', '')})"
        for p in parks[:8]
    ]


def _from_call_tool_result(result) -> tuple[dict, str, bool]:
    if hasattr(result, "structuredContent"):
        structured = result.structuredContent or {}
        text = ""
        if result.content:
            block = result.content[0]
            text = getattr(block, "text", None) or block.get("text", "")
        return structured, text, bool(getattr(result, "isError", False))
    structured = result.get("structuredContent") or {}
    content = result.get("content") or []
    text = content[0].get("text", "") if content else ""
    return structured, text, result.get("isError", False)


async def _run_via_handlers(api_base: str) -> list[dict]:
    from server.main import search_parks

    os.environ["TRAILVERSE_API_BASE"] = api_base
    rows = []
    for q in QUERIES:
        result = await search_parks(query=q, limit=10)
        structured, text, is_error = _from_call_tool_result(result)
        rows.append({
            "query": q,
            "count": structured.get("count", 0),
            "parks": _park_names(structured),
            "error": is_error,
            "text_preview": text[:280].replace("\n", " "),
        })
    return rows


async def _run_via_mcp(mcp_url: str) -> list[dict]:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    rows = []
    async with streamablehttp_client(mcp_url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            for q in QUERIES:
                result = await session.call_tool(
                    "search_parks",
                    {"query": q, "limit": 10},
                )
                structured, text, is_error = _from_call_tool_result(result)
                rows.append({
                    "query": q,
                    "count": structured.get("count", 0),
                    "parks": _park_names(structured),
                    "error": is_error,
                    "text_preview": text[:280].replace("\n", " "),
                })
    return rows


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--mode",
        choices=("mcp", "handlers"),
        default="mcp",
        help="Call via HTTP MCP endpoint (default) or Python handlers",
    )
    ap.add_argument("--mcp-url", default=MCP_URL)
    ap.add_argument(
        "--base",
        default=os.getenv("TRAILVERSE_API_BASE", "http://127.0.0.1:5001"),
    )
    args = ap.parse_args()

    if args.mode == "mcp":
        rows = await _run_via_mcp(args.mcp_url)
        transport = f"MCP {args.mcp_url}"
    else:
        rows = await _run_via_handlers(args.base)
        transport = f"handlers → {args.base}"

    print(json.dumps({"transport": transport, "results": rows}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
