# Recreation.gov / RIDB — Phase 2 Plan

Phase 1 (shipped): permits, timed entry, and ticket facilities via `ridbService.getPermitsForPark()`, park details SSR, Permits tab badge count, Recreation.gov search fallback URL fix.

## Goals

1. Enrich booking data where NPS is thin (campgrounds, complex permits).
2. Reuse one RecArea resolution per park (already cached 30 days in `ridbService`).
3. Stay within RIDB rate limits (429 → empty fallback today).

---

## Phase 2a — Campground enrichment (recommended next)

**Problem:** NPS `/campgrounds` lists sites and sometimes `reservationUrl`, but many parks have Recreation.gov campground facilities with richer site-level booking links.

### API shape (proposed)

```
GET /api/parks/:parkCode/campgrounds/enriched
```

Or merge into existing `GET /api/parks/:code/campgrounds` response:

```json
{
  "success": true,
  "data": [
    {
      "id": "nps-id",
      "name": "South Campground",
      "reservationUrl": "https://www.recreation.gov/camping/campgrounds/232447",
      "ridbFacilityId": "232447",
      "sitesCount": 127,
      "source": "nps+ridb"
    }
  ]
}
```

### Backend flow

1. `resolveRecAreaId(parkCode)` (existing).
2. `GET /recareas/{id}/facilities` → filter `FacilityTypeDescription` matching campground/camping (not permit types).
3. For each campground facility: optional `GET /facilities/{id}/campsites?limit=50` for site count / ADA (defer full site list to v3).
4. **Merge** with NPS campgrounds by normalized name fuzzy match (same scoring idea as RecArea).
5. Cache: 7 days keyed by `parkCode` (align with permits cache).

### RIDB endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /recareas/{id}/facilities` | Campground facilities |
| `GET /facilities/{id}/campsites` | Site count, optional detail |
| `GET /facilities/{id}` | Single facility metadata |

### Frontend

- **Where to Stay** tab: prefer merged `reservationUrl`; show “Reserve on Recreation.gov” when RIDB link exists and NPS does not.
- **Map** `CampgroundPreviewCard`: same merged URL.
- **Trailie** `factsService`: include top 3 reservable campgrounds with links.

### Out of scope

- Live availability / inventory (requires Recreation.gov booking API, not RIDB catalog).

---

## Phase 2b — Permit entrances & zones

**Problem:** One RIDB “facility” can represent many trailheads (e.g. wilderness permits, coyote buttes). Today we show one card per facility only.

### API shape (proposed)

Extend permit objects from `getPermitsForPark`:

```json
{
  "id": "4675338",
  "name": "Zion National Park Overnight Wilderness Permits",
  "type": "Permit",
  "reservationUrl": "https://www.recreation.gov/permits/4675338",
  "entrances": [
    {
      "id": "ent-1",
      "name": "Narrows",
      "district": "Zion Canyon",
      "zones": [{ "id": "z1", "name": "North Fork" }]
    }
  ]
}
```

### Backend flow

1. After collecting permit-like facilities, for each facility (cap **5** per park to limit calls):
   - `GET /facilities/{facilityId}/permitentrances?limit=50`
   - Optional: `GET /permitentrances/{id}/zones` for top entrances only.
2. Wire existing `_getPermitsForFacility()` (currently dead code) or replace with batch helper.
3. Cache entrances with parent permit cache entry (7-day TTL).

### RIDB endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /facilities/{id}/permitentrances` | Trailheads / entry points |
| `GET /permitentrances/{id}/zones` | Sub-areas for lottery permits |
| `GET /permitentrances/{id}/attributes` | Rules text (optional) |

### Frontend

- `ParkPermitsTab`: expandable “Entry points” under card when `entrances.length > 0`.
- Trailie: include entrance names in facts for lottery/backcountry questions.

### Guardrails

- Same timed-entry staleness warnings as today in `factsService`.
- Do not assert entrance availability without Recreation.gov booking confirmation.

---

## Phase 2c — Recreation.gov search fallback expansion

**Shipped (partial):** `entity_type:permit` search + `_buildReservationUrl()` on fallback results.

**Next:**

- Additional fallbacks when RIDB returns zero facilities:
  - `entity_type:timed_entry` (if supported by search index)
  - Broader `q={stripped park name}` without fq
- Map `entity_type` → facility type (see `_entityTypeToFacilityType` in `ridbService.js`).

---

## What we intentionally skip

| RIDB area | Reason |
|-----------|--------|
| Events | NPS `/events` + Events page |
| Activities, media, links | NPS park content |
| `GET /reservations` | Not public availability |
| Organizations | Metadata only |
| Trails | Not in RIDB v1 product model for NP hiking |

---

## Env & ops

- `RIDB_API_KEY` required (free at https://ridb.recreation.gov/).
- Production: verify Render env; local without key → empty permits (badge hidden).
- Monitor `[RIDB] 429` logs; backoff already returns `[]`.

---

## Implementation order

1. ~~Permits in `GET /parks/:code/details` + tab badge~~ (done)
2. Campground merge (2a) — highest user impact
3. Permit entrances (2b) — best for wilderness/lottery parks
4. Search fallback expansion (2c) — low effort maintenance
