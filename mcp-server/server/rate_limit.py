"""
Lightweight in-process rate limiter for the MCP server.

Purpose: defense-in-depth. If MCP_BYPASS_KEY is ever exposed (accidentally
committed, leaked from logs, etc.), this caps the damage by limiting the
TOTAL volume of requests the MCP server will forward to the TrailVerse
backend per time window — regardless of who's asking.

This is NOT a per-user limit. ChatGPT does not give us a stable per-user
identifier in anonymous tool calls, and we deliberately do not track users.
This is a global fuse for the whole MCP → TrailVerse pipe.

Separate buckets for:
  - plan_trip (expensive: hits Claude/GPT-4.1): default 120/min
  - all other read tools (cheap: cached NPS data): default 300/min
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import deque


class RateLimiter:
    """Fixed-window token bucket, async-safe."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max = max_requests
        self.window = window_seconds
        self._hits: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def allow(self) -> tuple[bool, float]:
        """
        Returns (allowed, retry_after_seconds).
        If denied, retry_after is roughly how long until the oldest hit expires.
        """
        async with self._lock:
            now = time.monotonic()
            cutoff = now - self.window
            while self._hits and self._hits[0] < cutoff:
                self._hits.popleft()
            if len(self._hits) >= self.max:
                retry = self._hits[0] + self.window - now
                return False, max(retry, 1.0)
            self._hits.append(now)
            return True, 0.0


# Configurable defaults; override via env if traffic patterns demand
PLAN_TRIP_LIMIT = int(os.getenv("MCP_PLAN_TRIP_LIMIT", "120"))
PLAN_TRIP_WINDOW = float(os.getenv("MCP_PLAN_TRIP_WINDOW", "60"))
READ_TOOL_LIMIT = int(os.getenv("MCP_READ_LIMIT", "300"))
READ_TOOL_WINDOW = float(os.getenv("MCP_READ_WINDOW", "60"))

plan_trip_limiter = RateLimiter(PLAN_TRIP_LIMIT, PLAN_TRIP_WINDOW)
read_tool_limiter = RateLimiter(READ_TOOL_LIMIT, READ_TOOL_WINDOW)
