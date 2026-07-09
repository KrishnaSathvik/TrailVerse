"""
MCP-side search result re-ranking for park-name queries.
"""
from __future__ import annotations

import re
from typing import Any


def _park_name(park: dict[str, Any]) -> str:
    return (park.get("fullName") or park.get("name") or "").strip()


def _normalize_query(q: str | None) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())


def rerank_search_results(resp: dict[str, Any], query: str | None) -> dict[str, Any]:
    """
    Boost exact / prefix park-name matches and demote substring false positives
    (e.g. Acadian sites when searching for Acadia).
    """
    if not query:
        return resp

    data = resp.get("data", resp)
    parks = data.get("parks") if isinstance(data, dict) else None
    if not isinstance(parks, list) or not parks:
        return resp

    q = _normalize_query(query)
    if not q:
        return resp

    q_tokens = [t for t in re.split(r"[^a-z0-9]+", q) if len(t) >= 3]
    if not q_tokens:
        return resp

    def score(park: dict[str, Any]) -> tuple[int, int, str]:
        name = _park_name(park).lower()
        name_words = [w for w in re.split(r"[^a-z0-9]+", name) if w]
        primary = q_tokens[0]

        if name == q:
            return (0, -len(name), name)
        if name.startswith(q):
            return (1, -len(name), name)
        if any(word == primary for word in name_words):
            return (2, -len(name), name)
        if any(word.startswith(primary) for word in name_words):
            return (3, -len(name), name)
        if primary in name and not _is_false_substring_match(primary, name):
            return (4, -len(name), name)
        return (9, -len(name), name)

    ranked = sorted(parks, key=score)
    if isinstance(data, dict):
        data = {**data, "parks": ranked}
        if "data" in resp:
            return {**resp, "data": data}
        return data
    return resp


def _is_false_substring_match(token: str, name: str) -> bool:
    """Reject token matches where token is a strict substring of a longer word."""
    for word in re.split(r"[^a-z0-9]+", name):
        if token in word and word != token and word.startswith(token):
            return True
    return False
