"""
Confidence-gated park name → NPS code resolution.

The old resolver fell back to "first token prefix" or "first search hit", which
silently turned "Valley of Fire" into Valley Forge NHP. This module only
returns a park when the match is unambiguous:

  1. exact full-name match              ("Statue of Liberty National Monument")
  2. exact core-name match              ("Glacier" → Glacier National Park,
                                          not Glacier Bay)
  3. every core query token is a whole word in exactly one candidate name
                                         ("Kings Canyon" → Sequoia & Kings Canyon)

Anything weaker is reported as ``not_found`` / ``ambiguous`` / ``non_nps`` with
candidate suggestions so the tool can say so instead of guessing.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

# Designation and filler words ignored when comparing the "core" of a name.
GENERIC_NAME_TOKENS = frozenset({
    "national", "park", "parks", "monument", "monuments", "preserve", "historical",
    "historic", "site", "sites", "memorial", "battlefield", "military", "recreation",
    "area", "seashore", "lakeshore", "parkway", "trail", "scenic", "wild", "part",
    "np", "nm", "nhp", "nhs", "nra", "nps", "nmp", "nb", "us", "usa",
    "and", "of", "the", "at", "in", "a", "to",
})

# Short strings that look like 4-letter codes but are ordinary words.
NOT_CODES = frozenset({
    "utah", "mesa", "bend", "park", "lake", "cave", "reef", "arch", "fire",
    "teton", "peak", "fort", "gulf", "bear", "hill", "rock", "isle", "dune",
})

# Explicit non-NPS destination markers. These places are not in the NPS catalog.
NON_NPS_RE = re.compile(
    r"\b(state\s+(park|parks|forest|beach|recreation\s+area|natural\s+area|historic\s+site|reserve)"
    r"|national\s+forests?|county\s+park|regional\s+park|city\s+park|provincial\s+park)\b",
    re.IGNORECASE,
)

_CODE_RE = re.compile(r"^[a-z0-9]{2,4}$")


def normalize_text(value: str) -> str:
    """Lowercase, strip accents/okina/apostrophes, collapse punctuation to spaces."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[ʻʼ‘’'`]", "", text)
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def name_tokens(value: str) -> list[str]:
    return normalize_text(value).split()


def core_tokens(value: str) -> list[str]:
    return [t for t in name_tokens(value) if t not in GENERIC_NAME_TOKENS]


def looks_like_code(value: str) -> bool:
    cleaned = (value or "").strip().lower()
    return bool(_CODE_RE.fullmatch(cleaned)) and cleaned not in NOT_CODES


def _token_in(token: str, words: set[str]) -> bool:
    if token in words:
        return True
    # Tolerate a plural query ("tetons") against a singular name ("teton").
    return token.endswith("s") and len(token) > 3 and token[:-1] in words


@dataclass
class ParkResolution:
    """Outcome of resolving a user-supplied park name or code."""

    input: str
    status: str  # code | matched | ambiguous | not_found | non_nps | lookup_failed | invalid
    code: str | None = None
    name: str | None = None
    candidates: list[dict[str, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.code is not None

    def candidate_text(self, limit: int = 5) -> str:
        return ", ".join(
            f"{c['name']} ({c['code']})" for c in self.candidates[:limit] if c.get("code")
        )

    def error_code(self) -> str:
        return {
            "ambiguous": "AMBIGUOUS_PARK",
            "non_nps": "NOT_AN_NPS_SITE",
            "lookup_failed": "PARK_LOOKUP_FAILED",
            "invalid": "INVALID_PARK",
        }.get(self.status, "UNKNOWN_PARK")

    def explain(self) -> str:
        """Human/model-readable reason this input did not resolve to one park."""
        label = self.input.strip() or "(empty)"
        if self.status == "ambiguous":
            return (
                f"'{label}' matches more than one NPS site: {self.candidate_text()}. "
                "Retry with the exact park code or full name."
            )
        if self.status == "non_nps":
            return (
                f"'{label}' is not a National Park Service site, so live NPS data is not "
                "available for it. plan_trip (with park_name) can still plan a trip there."
            )
        if self.status == "lookup_failed":
            return f"Could not look up '{label}' right now (TrailVerse backend unavailable). Try again shortly."
        if self.status == "invalid":
            return f"'{label}' is not a valid park name or NPS code."
        hint = (
            f" Closest NPS names: {self.candidate_text()}." if self.candidates else ""
        )
        return (
            f"No NPS site matched '{label}'.{hint} "
            "TrailVerse park tools only cover US National Park Service sites; if this is a "
            "state park or other non-NPS place, use plan_trip with park_name. "
            "Use search_parks to look up the right NPS site or code."
        )


SearchFn = Callable[[str], Awaitable[list[dict[str, Any]]]]


def _search_query_for(raw: str) -> str:
    core = core_tokens(raw)
    return " ".join(core) if core else normalize_text(raw)


def rank_candidates(raw: str, parks: list[dict[str, Any]]) -> ParkResolution:
    """Pure ranking step (no I/O) — exposed for tests."""
    q_full = name_tokens(raw)
    q_core = core_tokens(raw)
    non_nps = bool(NON_NPS_RE.search(raw or ""))

    scored: list[tuple[int, int, dict[str, str]]] = []
    partial: list[tuple[int, dict[str, str]]] = []
    seen: set[str] = set()
    for p in parks or []:
        code = (p.get("parkCode") or p.get("code") or "").strip().lower()
        pname = (p.get("fullName") or p.get("name") or "").strip()
        if not code or not pname or code in seen:
            continue
        seen.add(code)
        entry = {"code": code, "name": pname}
        c_full = name_tokens(pname)
        c_core = core_tokens(pname)
        c_words = set(c_full)
        if q_full and q_full == c_full:
            scored.append((0, len(pname), entry))
        elif q_core and set(q_core) == set(c_core):
            scored.append((1, len(pname), entry))
        elif q_core and all(_token_in(t, c_words) for t in q_core):
            scored.append((2, len(pname), entry))
        else:
            overlap = sum(1 for t in q_core if _token_in(t, c_words))
            # Suggest only near misses (most query words present). "Valley of
            # Fire" sharing just "valley" with Valley Forge is not a suggestion.
            if overlap and overlap * 2 > len(q_core):
                partial.append((overlap, entry))

    if non_nps and not any(rank == 0 for rank, _, _ in scored):
        return ParkResolution(input=raw, status="non_nps")

    if not q_core and not any(rank == 0 for rank, _, _ in scored):
        return ParkResolution(input=raw, status="invalid")

    if scored:
        best = min(rank for rank, _, _ in scored)
        tier = [entry for rank, _, entry in sorted(scored, key=lambda s: (s[0], s[1])) if rank == best]
        if len(tier) == 1 or best == 0:
            top = tier[0]
            return ParkResolution(input=raw, status="matched", code=top["code"], name=top["name"])
        return ParkResolution(input=raw, status="ambiguous", candidates=tier)

    partial.sort(key=lambda s: -s[0])
    return ParkResolution(
        input=raw, status="not_found", candidates=[entry for _, entry in partial[:5]]
    )


async def resolve_park(raw: str, search: SearchFn) -> ParkResolution:
    """Resolve a park name or code. ``search`` returns park dicts for a query."""
    text = (raw or "").strip()
    if not text or len(text) > 100:
        return ParkResolution(input=text, status="invalid")
    # Website-style slugs: yellowstone-national-park → yellowstone national park
    if "-" in text and " " not in text and len(text) > 4:
        text = text.replace("-", " ")
    if looks_like_code(text):
        # Existence is verified by the calling tool (404 / missing from compare).
        return ParkResolution(input=raw, status="code", code=text.lower())
    # Non-NPS markers ("State Park") are judged after the search so an exact
    # NPS name such as "Redwood National and State Parks" still resolves.
    alias = PARK_ALIASES.get(normalize_text(text))
    if alias:
        return ParkResolution(input=raw, status="matched", code=alias[0], name=alias[1])
    try:
        parks = list(await search(_search_query_for(text)))
        result = rank_candidates(text, parks)
        if result.status == "not_found":
            # Backend search is not diacritic-aware ("Hawaiʻi", "Haleakalā") and
            # does not singularize. Retry once with the most specific token; the
            # strict ranking below still decides, so this cannot add a guess.
            core = sorted(core_tokens(text), key=len, reverse=True)
            if core:
                token = core[0]
                for q in dict.fromkeys([token, token[:-1] if len(token) > 5 else token]):
                    parks.extend(await search(q))
                result = rank_candidates(text, parks)
    except Exception:  # backend errors surface as a clear lookup failure
        return ParkResolution(input=raw, status="lookup_failed")
    result.input = raw
    return result


# Common nicknames the catalog search cannot infer. Keep this small and exact.
PARK_ALIASES: dict[str, tuple[str, str]] = {
    "smokies": ("grsm", "Great Smoky Mountains National Park"),
    "great smokies": ("grsm", "Great Smoky Mountains National Park"),
    "the smokies": ("grsm", "Great Smoky Mountains National Park"),
    "tetons": ("grte", "Grand Teton National Park"),
    "the tetons": ("grte", "Grand Teton National Park"),
    "grand tetons": ("grte", "Grand Teton National Park"),
    "haleakala": ("hale", "Haleakalā National Park"),
    "haleakala national park": ("hale", "Haleakalā National Park"),
    "hawaii volcanoes": ("havo", "Hawaiʻi Volcanoes National Park"),
    "hawaii volcanoes national park": ("havo", "Hawaiʻi Volcanoes National Park"),
}
