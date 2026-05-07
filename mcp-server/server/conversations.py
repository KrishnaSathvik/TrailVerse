"""
In-memory conversation store for multi-turn MCP sessions.

Key: session_id (str) → Conversation { session_id, anonymous_id, messages[], timestamps }
Eviction: lazy prune entries older than 2 hours on each access.
Data lost on process restart — acceptable (backend has MongoDB copy; worst case = fresh session).
"""
from __future__ import annotations

import re
import secrets
import time
from dataclasses import dataclass, field

MAX_AGE_SECONDS = 7200  # 2 hours
MAX_CONVERSATIONS = 1000  # memory cap
MAX_MESSAGES_PER_SESSION = 20
_KEEP_RECENT = 15  # keep last N messages verbatim when summarizing


def _summarize_older_messages(older: list[dict]) -> str:
    """Extract key travel context from older user messages (ignoring assistant
    messages to avoid self-reinforcing hallucination loops)."""
    user_text = " ".join(
        m["content"] for m in older if m.get("role") == "user" and m.get("content")
    )
    if not user_text:
        return ""

    parts = ["[CONVERSATION CONTEXT — extracted from earlier messages]"]

    park = re.search(
        r"(?:going to|visiting|trip to|plan for|heading to|explore)\s+"
        r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+National\s+Park)?)",
        user_text,
    )
    if park:
        parts.append(f"Park: {park.group(1)}")

    dates = re.search(
        r"(?:from|between|starting|arriving|dates?:?\s*)"
        r"(\w+ \d{1,2}(?:\s*[-–to]+\s*\w+ \d{1,2})?(?:,?\s*\d{4})?)",
        user_text,
        re.IGNORECASE,
    )
    if dates:
        parts.append(f"Dates: {dates.group(1)}")

    group = re.search(
        r"(\d+)\s*(?:people|person|adults?|of us|travelers?|in (?:our|the) group)",
        user_text,
        re.IGNORECASE,
    )
    if group:
        parts.append(f"Group size: {group.group(1)}")

    budget = re.search(
        r"(?:budget|spend|spending|afford)\s*(?:is|of|around|about)?\s*\$?"
        r"([\d,]+(?:\s*[-–to]+\s*\$?[\d,]+)?)",
        user_text,
        re.IGNORECASE,
    )
    if budget:
        parts.append(f"Budget: ${budget.group(1)}")

    interests = list(
        {
            m.lower()
            for m in re.findall(
                r"(hiking|camping|photography|wildlife|stargazing|fishing|kayaking|"
                r"rock climbing|backpacking|scenic drives?|waterfalls?|sunrise|sunset|"
                r"family.friendly|kid.friendly|accessible|easy trails?|moderate|"
                r"challenging|strenuous)",
                user_text,
                re.IGNORECASE,
            )
        }
    )
    if interests:
        parts.append(f"Interests: {', '.join(interests[:8])}")

    accom = re.search(
        r"(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb)",
        user_text,
        re.IGNORECASE,
    )
    if accom:
        parts.append(f"Accommodation: {accom.group(1)}")

    parts.append(
        f"[{len(older)} earlier messages summarized above]"
    )
    return "\n".join(parts)


@dataclass
class Conversation:
    session_id: str
    anonymous_id: str
    messages: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.monotonic)
    last_active: float = field(default_factory=time.monotonic)

    def append_message(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > MAX_MESSAGES_PER_SESSION:
            older = self.messages[:-_KEEP_RECENT]
            recent = self.messages[-_KEEP_RECENT:]
            summary = _summarize_older_messages(older)
            if summary:
                self.messages = [
                    {"role": "system", "content": summary},
                    *recent,
                ]
            else:
                self.messages = recent
        self.last_active = time.monotonic()


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
        sid = f"mcp-{secrets.token_urlsafe(24)}"
        aid = f"mcp-{secrets.token_urlsafe(24)}"
        conv = Conversation(session_id=sid, anonymous_id=aid)
        self._store[sid] = conv
        return conv


conversation_store = ConversationStore()  # module-level singleton
