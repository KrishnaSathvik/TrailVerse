"""
Natural-language query expansion for search_parks.

Expands travel-intent keywords (ocean, relax, photography, etc.) into
synonym sets so backend text search matches more relevant parks.
"""
from __future__ import annotations

import re

INTENT_KEYWORDS: dict[str, list[str]] = {
    "ocean": ["ocean", "coast", "coastal", "beach", "shore", "island", "seashore"],
    "relax": ["relax", "relaxing", "peaceful", "quiet", "calm", "easy", "chill"],
    "nature": ["nature", "scenic", "wildlife", "forest", "mountains", "views"],
    "romantic": ["romantic", "couples", "sunset", "peaceful", "scenic"],
    "photography": ["photography", "photo", "viewpoint", "sunrise", "sunset", "scenic"],
    "hiking": ["hiking", "hike", "trails", "trail", "backcountry"],
    "camping": ["camping", "campground", "backcountry"],
    "family": ["family", "kids", "children", "kid-friendly", "accessible"],
    "beginner": ["beginner", "beginners", "first-time", "first-timer", "easy", "newbie"],
    "winter": ["winter", "snow", "ski", "cold"],
    "waterfall": ["waterfall", "falls", "cascade"],
}

# Filler words common in natural-language queries (not useful for backend search)
_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "for", "with", "to", "in", "on", "at", "of",
    "best", "good", "great", "some", "any", "park", "parks", "national", "place",
    "places", "looking", "want", "need", "vibe", "vibes", "like", "something",
})

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _query_tokens(query: str) -> set[str]:
    return set(_TOKEN_RE.findall(query.lower()))


def expand_search_query(query: str | None) -> str | None:
    """Expand travel-intent tokens into synonym keywords for backend search."""
    if not query or not query.strip():
        return query

    tokens = _query_tokens(query)
    if not tokens:
        return query.strip()

    expanded = tokens - _STOP_WORDS
    if not expanded:
        expanded = tokens

    for key, synonyms in INTENT_KEYWORDS.items():
        synonym_set = set(synonyms)
        if key in tokens or tokens & synonym_set:
            expanded.update(synonym_set)

    return " ".join(sorted(expanded))


def count_search_results(resp: dict) -> int:
    """Return number of parks in a /api/parks/search response."""
    results = resp.get("data") or resp.get("results") or []
    if isinstance(results, dict) and "parks" in results:
        results = results["parks"]
    return len(results) if isinstance(results, list) else 0
