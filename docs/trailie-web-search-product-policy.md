# Trailie Web Search — Product Policy

**Status:** Active (small non-NPS unblock shipped 2026-06-16)  
**Code:** `server/src/services/factsService.js` — `needsWebSearch()`, `hasExplicitNonNpsDestinationSignal()`, `fetchRelevantFacts()`

---

## Guiding principle

Trailie stays **NPS-first** for TrailVerse catalog parks.

For **known NPS parks**, use TrailVerse/NPS data, weather, blogs, crowd calendar, permits/RIDB, and only use web search when the user asks for live/local/off-NPS details: hotels, restaurants, road construction, smoke, local shuttles, nearby towns, etc.

For **logged-in users** asking about a clear **named non-NPS outdoor destination** — state parks, national forests, preserves, recreation areas, Valley of Fire, Hocking Hills, Red River Gorge, Custer, Starved Rock, Smith Rock, etc. — Trailie allows web search even when the prompt is an itinerary, comparison, or open/closed/status question.

For **anonymous users**, web search remains **skipped intentionally** (conversion flow). Trailie can still give a useful general answer but must not pretend it has live/current web-grounded facts.

For **generic open-ended discovery** (e.g. “best state parks near Chicago”), **v1 avoids web search** until a stronger candidate/resolver layer exists.

---

## What the small unblock fixed (2026-06-16)

**Before:** `needsWebSearch()` exited early on itinerary, compare, operational-status, and open-ended discovery — including named non-NPS places with no `parkCode`.

**After:** When `parkCode` is null and `hasExplicitNonNpsDestinationSignal(userMessage)` is true, web search runs for logged-in users **before** those gates.

| Gate | NPS catalog park | Named non-NPS (logged-in) | Anonymous |
|------|------------------|---------------------------|-----------|
| Itinerary | Skip web | **Web runs** | Skip web |
| Compare | Skip web (NPS catalog) | **Web runs** | Skip web |
| Operational / open-closed (no road) | Skip web (NPS alerts) | **Web runs** | Skip web |
| Open-ended discovery (“best near X”) | Skip web | Skip web (v1) | Skip web |
| Logistics (hotels, roads, smoke) | Web runs | Web runs | Skip web |

Implementation:

```js
needsWebSearch(userMessage, { parkCode })
// Early override: !parkCode && hasExplicitNonNpsDestinationSignal(userMessage)
// Anonymous skip unchanged upstream: shouldFetchWeb = !isAnonymous && needsWebSearch(...)
```

`hasExplicitNonNpsDestinationSignal` is **conservative** — destination types and named places only, not broad words like `best`, `recommend`, or `near Chicago`.

---

## Current expected behavior

| Prompt | Expected |
|--------|----------|
| Plan 3 days in Yosemite | NPS-first, no web |
| Does Arches need timed entry? | NPS/RIDB-first, no random web |
| Restaurants near Zion | Web runs (logged-in) |
| Plan 2 days at Custer State Park | Logged-in web runs |
| Plan Valley of Fire from Las Vegas | Logged-in web runs |
| Is Starved Rock open this week? | Logged-in web runs |
| Compare Hocking Hills vs Red River Gorge | Logged-in web runs |
| Best state parks near Chicago | No web in v1 |
| Anonymous asking Custer / Valley of Fire | No web; general answer + conversion CTA |

---

## What remains unsolved (future resolver layer)

The small unblock fixes **when** web search runs. It does **not** fix **destination understanding**.

Still missing:

- `resolvedDestination` object (name, type, state, agency, official URL, lat/lon, confidence)
- Official agency detection and URL extraction
- Coordinates for weather on non-catalog places
- Source confidence (official vs SEO)
- `nonNpsDestination` in `STRUCTURED_CONTEXT_JSON`
- Open-ended candidate discovery for “best state parks near Chicago”

Today:

```txt
Named non-NPS prompt → web search can run
```

Not yet:

```txt
Named non-NPS prompt → resolve exact destination, agency, official source, coords, structured facts
```

---

## Tests

Unit: `server/src/services/__tests__/factsWebSearchPolicy.test.js`

Live (logged-in + `TRAILIE_DEBUG_CONTEXT=true`): confirm `debugTrailieContext.liveDataStatuses.webSearch` is `available` or `missing`, not `not_requested`, for named non-NPS prompts.
