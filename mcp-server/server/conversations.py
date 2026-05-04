"""
In-memory conversation store for multi-turn MCP sessions.

Key: session_id (str) → Conversation { session_id, anonymous_id, messages[], timestamps }
Eviction: lazy prune entries older than 2 hours on each access.
Data lost on process restart — acceptable (backend has MongoDB copy; worst case = fresh session).
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

MAX_AGE_SECONDS = 7200  # 2 hours
MAX_CONVERSATIONS = 1000  # memory cap


@dataclass
class Conversation:
    session_id: str
    anonymous_id: str
    messages: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.monotonic)
    last_active: float = field(default_factory=time.monotonic)


class ConversationStore:
    def __init__(self) -> None:
        self._store: dict[str, Conversation] = {}

    def _prune(self) -> None:
        cutoff = time.monotonic() - MAX_AGE_SECONDS
        expired = [k for k, v in self._store.items() if v.last_active < cutoff]
        for k in expired:
            del self._store[k]

    def get(self, session_id: str) -> Conversation | None:
        self._prune()
        conv = self._store.get(session_id)
        if conv:
            conv.last_active = time.monotonic()
        return conv

    def create(self) -> Conversation:
        self._prune()
        if len(self._store) >= MAX_CONVERSATIONS:
            oldest = min(self._store, key=lambda k: self._store[k].last_active)
            del self._store[oldest]
        sid = f"mcp-{uuid.uuid4().hex[:12]}"
        aid = f"mcp-{uuid.uuid4().hex[:16]}"
        conv = Conversation(session_id=sid, anonymous_id=aid)
        self._store[sid] = conv
        return conv


conversation_store = ConversationStore()  # module-level singleton
