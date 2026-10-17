# Travel & Stay Logistics v1 Design

**Date:** 2026-08-11  
**Status:** Approved for implementation planning  
**Product bar:** Full Travel & Stay Logistics v1 (Scope C) before final Trailie demo validation  
**Architecture choice:** Approach 1 — assemble + thin adapters  
**Inside-park lodging:** Lodge A — curated official catalog is the only authority for `inside_park`

---

## 1. Goal and non-goals

### Goal

Make Trailie a coherent national-park **trip planner**, not only an itinerary generator, for prompts like:

> “5 days in Yellowstone from St. Louis, fly + lodge”

Trailie should be able to answer, when needed:

```text
TRAILIE TRIP PLAN
│
├── Getting there
│   ├── nearest/practical airports
│   ├── departure context (e.g. STL / St. Louis)
│   └── airport → park drive time + miles
│
├── Ground logistics
│   ├── route legs
│   ├── distance + duration
│   └── feasibility / drive limits
│
├── Where to stay
│   ├── inside-park lodges (verified catalog)
│   ├── gateway hotels (Places discovery)
│   ├── campground options (NPS)
│   └── RV-compatible options when requested
│
└── Day-by-day itinerary
```

All transport/stay results remain **discovery/logistics**, not booking.

Evidence contract (unchanged Trailie philosophy):

```text
verified  → show it
estimated → label it
unknown   → say unknown
```

### Non-goals (Travel & Stay v2)

Explicitly out of this milestone:

- Amadeus / live flight offers / fare cards
- Booking.com / Expedia / Amadeus hotel inventory or live rates
- Airbnb inventory (or any scraped vacation-rental inventory)
- Car rental inventory
- Booking checkout
- Affiliate plumbing

Airbnb/vacation-rental in v1 means: understand preference + recommend areas/search action only. Never claim “I found this Airbnb for $X.”

---

## 2. Architecture

### High-level flow

```text
tripState / planningState
        ↓
logisticsNeedsResolver          ← demand gate (no global attach)
        ↓
thin adapters / existing evidence (I/O lives here)
  ├── existing Maps route evidence
  ├── airport helper (coords / nearest)
  ├── airport→park Maps lookup
  ├── NPS campgrounds
  ├── Places lodging service (extracted from gmaps nearby internals)
  └── official lodge catalog (data lookup)
        ↓
normalized logistics inputs
        ↓
travelLogisticsBuilder          ← PURE (no network, no HTTP)
        ↓
travelLogistics
        ├──→ model narration context (optional)
        └──→ response / UI cards
```

### Purity rule (hard)

`travelLogisticsBuilder` is a **pure assembler**.

It must **not**:

- call `/api/gmaps/nearby` or any HTTP route
- call Google Maps / Places / NPS clients directly
- read the network or wall clock for provider results

Provider I/O belongs in thin adapters invoked only when `logisticsNeedsResolver` says those slices are needed. Adapters produce normalized inputs; the builder maps inputs → `travelLogistics`.

For Places: **reuse/extract the underlying service behind** `GET /api/gmaps/nearby`. The logistics path calls that service/module in-process. Do not have the server HTTP-call itself.

### Demand gate (hard)

Travel & Stay Logistics is **demand-driven**, not globally attached to every Trailie turn.

Provider calls and UI sections activate only when relevant **current-turn intent** or **persisted active-trip logistics preferences** require them.

Examples:

| User / trip signal | Logistics activated |
|---|---|
| “Best hikes in Yosemite?” | none |
| “Plan 2 days in Zion.” | itinerary only; do **not** auto-spam lodging/flight cards |
| “Plan 5 days Yellowstone from St. Louis, we’ll fly.” | airports + airport→park ground transfer |
| “Where should we stay in Yellowstone?” | lodge/hotel cards |
| “We want to camp.” | NPS campgrounds |
| “We have a 30-ft RV.” | NPS campgrounds + RV filtering |
| “Actually stay in a hotel instead.” | switch stay slice to hotel/gateway |
| “How long is Denver → RMNP?” | route time + distance only |
| Earlier: fly + lodge; later: “Make it 6 days” | preferences persist; re-fetch/re-render only if still needed and inputs changed |

The **model does not decide** whether a provider is called. Structured trip state + `logisticsNeedsResolver` do.

Rough need → slice map:

```text
drive / road trip          → Maps route logistics
fly / airport request      → airport discovery + ground transfer
lodge                      → official lodge catalog + gateway fallback/enrichment
hotel                      → Places lodging
camping / campground       → NPS campgrounds
RV                         → NPS campgrounds + RV capability filtering
vacation rental / Airbnb   → area guidance only
```

This exists to control **latency, Maps/Places cost, and UI clutter**.

---

## 3. `travelLogistics` contract

Single source of truth for logistics cards. UI renders logistics **only** from this object, never from free-form model prose.

Use **`schemaVersion: 1`** only (do not also ship an ambiguous top-level `version` unless it intentionally means something different; v1 uses `schemaVersion` alone).

### Top-level shape (normative sketch)

```js
{
  schemaVersion: 1,
  transport: {
    mode: 'drive' | 'fly' | 'unknown',
    departure: {
      city: string | null,
      airportCode: string | null,
      status: 'available' | 'not_requested' | 'not_verified' | 'unknown'
    },
    airports: AirportOption[],
    airportsStatus: 'not_requested' | 'available' | 'no_results' | 'provider_unavailable' | 'not_verified',
    routeLegs: DriveLeg[],
    routeLegsStatus: 'not_requested' | 'available' | 'no_results' | 'provider_unavailable' | 'not_verified',
    driveCap: {
      maxDailyDriveMinutes: number | null,
      status: 'not_requested' | 'available' | 'unknown'
    }
  },
  stays: {
    accommodationClass: 'camping' | 'lodging' | 'unknown',
    stayPreference:
      'campground' | 'rv' | 'lodge' | 'hotel' | 'cabin' | 'vacation_rental' | 'unknown',
    insidePark: {
      status: 'verified' | 'not_verified' | 'verified_none',
      properties: StayCard[]
    },
    gateway: {
      status: 'not_requested' | 'available' | 'no_results' | 'provider_unavailable' | 'not_verified',
      areaLabel: string | null,
      properties: StayCard[]
    },
    campgrounds: {
      status: 'not_requested' | 'available' | 'no_results' | 'provider_unavailable' | 'not_verified',
      properties: StayCard[]
    },
    vacationRentalHint: null | {
      status: 'available' | 'not_requested',
      areas: string[],
      externalSearchHint: string | null
    }
  }
}
```

### Stable identities (required)

Cards and legs must carry stable IDs for UI reconciliation, caching, enrichment, and later v2 inventory:

```js
DriveLeg {
  legId,                    // deterministic from origin/destination entity IDs + travel mode
  originEntityId,
  destinationEntityId,
  originLabel,
  destinationLabel,
  durationMinutes,          // from Maps when available
  distanceMeters,           // from Maps when available
  distanceMiles,            // derived; same evidence
  evidenceStatus,           // verified | estimated | unknown
  feasibility: null | {
    exceedsDailyDriveCap: boolean,
    maxDailyDriveMinutes: number | null,
    driveDurationMinutes: number | null
  },
  provenance
}

AirportOption {
  airportCode,              // IATA
  entityId: string | null,
  name,
  groundTransfer: null | {
    durationMinutes,
    distanceMeters,
    distanceMiles,
    destinationLabel,
    evidenceStatus
  },
  evidenceStatus,
  provenance
}

StayCard {
  propertyId,               // catalog id OR stable Places-derived id
  parkCode: string | null,
  placeId: string | null,   // Google place id when Places-backed
  name,
  propertyType,             // lodge | hotel | cabin | campground | rv_park | other
  locationClass,            // inside_park | gateway | unknown
  // locationClass === 'inside_park' ONLY when catalog asserts it
  rating: number | null,
  address: string | null,
  officialUrl: string | null,
  reservationUrl: string | null,
  mapsUrl: string | null,
  amenitiesSummary: string[] | null,
  rvSuitable: boolean | null,
  evidenceStatus,
  provenance
}
```

### Status semantics (hard)

**Inside-park lodging status:**

| Status | Meaning |
|---|---|
| `verified` | Authoritative catalog has one or more verified inside-park properties for this park |
| `not_verified` | Trailie does **not** yet have authoritative catalog coverage for this park |
| `verified_none` | An authoritative source **explicitly** establishes there is no applicable inside-park lodging |

Do **not** infer `verified_none` merely because the catalog returned `[]`. Empty catalog without an explicit none-record ⇒ `not_verified`.

Those mean different things:

- `[]` + `not_verified` → “we haven’t verified lodge inventory for this park”
- `[]` + `verified_none` → “authoritative source says none apply”
- Never present API failure as “there are no hotels/lodges”

**Provider / list statuses** (campgrounds, gateway, airports, route legs where useful):

| Status | Meaning |
|---|---|
| `not_requested` | Need gate did not activate this slice |
| `available` | Provider returned usable results |
| `no_results` | Provider succeeded and returned zero matches |
| `provider_unavailable` | Call failed / timed out / misconfigured — **not** the same as no results |
| `not_verified` | We lack authoritative coverage for this claim type |

### Accommodation dual contract (hard)

Do **not** replace the existing coarse accommodation contract used by validators.

Keep both:

```text
accommodationClass:  camping | lodging | unknown
stayPreference:      campground | rv | lodge | hotel | cabin | vacation_rental | unknown
```

Mapping examples:

| User signal | accommodationClass | stayPreference |
|---|---|---|
| lodge | lodging | lodge |
| hotel / motel | lodging | hotel |
| cabin | lodging | cabin |
| Airbnb / VRBO / vacation rental | lodging | vacation_rental |
| camp / tent / campground | camping | campground |
| RV / RV site | camping | rv |

Existing hard rules that understand camping vs lodging continue to use `accommodationClass`. Logistics discovery branches on `stayPreference`.

### Provenance (every card / leg)

```js
provenance: {
  sourceType,            // official | nps | google_places | google_maps | curated_catalog | derived
  sourceName: string | null,
  evidenceStatus,        // verified | estimated | unknown
  observedAt: string | null,       // ISO when we observed provider data
  sourceUpdatedAt: string | null,  // provider-reported update time if any
  officialUrl: string | null,
  livePrice: false,                // always false in v1 unless contract later expands
  liveAvailability: false          // always false in v1 unless contract later expands
}
```

Timestamps need not be rendered in v1 UI, but the contract includes them for freshness honesty.

Especially for Places:

```text
verified property/location
≠
verified current availability
```

### Hard product rules on the contract

1. **No live prices or availability** unless a future contract revision explicitly supports them with real provider evidence.
2. **Places (or Serper) may never independently assert `locationClass: 'inside_park'`** or flip `insidePark=true`. Only the official lodge catalog (or an explicit authoritative none-record path) may.
3. **UI cards never invent facts** from model prose. Prose may narrate; cards bind to `travelLogistics`.
4. **No destination-specific control flow.** Catalog/data may be park-keyed; logic is generic lookup by `parkCode`.
5. Existing clients that ignore `travelLogistics` continue to work (additive field).

---

## 4. Transport

### Drive (reuse existing Maps truth)

Sources:

- `mapsEvidenceProvider` Distance Matrix evidence (`durationSeconds`, `distanceMeters`)
- `routeEvidenceDriveBridge` (leg hydration, daily drive-cap evaluation)

v1 productizes:

- route legs with **time and miles**
- feasibility vs `maxDailyDriveMinutes` when set
- drive logistics cards (not only validation / workspace pills)

`distanceMeters` must be surfaced (as miles) on legs — today it is mostly unused after fetch.

### Fly / airports (no live flight search)

Sources:

- `airportCoordinates` / `getNearestAirports`
- airport→park Maps duration/distance via the **adapter** path that replaces the currently dead prompt-only `buildDrivingTimeContext` wiring
- departure city / airport from trip state

Airport cards show: code, name, ground transfer mi/min, optional grounded comparative notes.

Comparative claims (e.g. “BZN is usually more practical for the northern/western side”) are allowed **only** when underlying logistics support them; otherwise omit.

**No fare/offer cards in v1.**

### Transportation persistence repair (in this milestone)

Audit finding: fly/airport fields can be parsed then dropped on planning-state serialization.

v1 explicitly repairs persistence of at least:

```js
transportation: {
  mode,                     // drive | fly | unknown
  departureCity?,
  departureAirportCode?,
  rentalCar?                // preserve if already present; do not productize inventory
}
```

Refinements such as “Actually fly from Kansas City instead” must survive save/reload and subsequent turns.

Also fix negation pitfalls where feasible (e.g. “prefer not to fly” must not set `mode: 'fly'`), without expanding into a full NLP rewrite.

---

## 5. Stays

### Inside-park lodges — curated authority

```text
User asks for lodging / stayPreference=lodge
        ↓
Catalog lookup by parkCode
        │
        ├─ entries found
        │    → insidePark.status = verified
        │    → StayCards with locationClass=inside_park
        │    → official URL + optional Places enrichment
        │
        └─ no entries
             → Do NOT invent inside-park lodges
             → insidePark.status = not_verified
               (unless an explicit verified_none record exists)
             → show NPS lodging/info link if available
             → gateway Places discovery as separate bucket
```

**Hard contract sentence:**

> Places enrichment and generic discovery may never independently assert `inside_park=true`. Inside-park status itself is verified data from the official lodge catalog (or an explicit authoritative none-record).

Places may enrich catalog properties with rating/coords/photos only. Enrichment **cannot override** official identity, `officialUrl`, or `inside_park`.

### Official lodge catalog (data, not behavior)

Generic schema (illustrative):

```js
{
  propertyId,
  parkCode,
  name,
  propertyType,          // lodge | cabin | ...
  locationClass: 'inside_park',
  officialUrl,
  reservationUrl?,
  operator?,
  source,
  sourceVerifiedAt?,
  seasonNotes?
}
```

Lookup: `parkCode → 0..N verified properties`. No `if (parkCode === 'yell')` branches in logic.

**Coverage:**

- **Hard requirement for demo:** Yellowstone (`yell`)
- **Tier 1 target:** Yellowstone, Yosemite, Grand Canyon, Zion, Glacier, Grand Teton
- **Tier 2 (capacity permitting):** Bryce, Olympic, Mount Rainier, Acadia, Sequoia/Kings Canyon, Death Valley

Uncovered park ⇒ `insidePark.status = not_verified`, not a silent empty list implying “no lodges.”

### Gateway hotels — separate bucket

```text
STAY OPTIONS
│
├── Inside the park     ← curated catalog
└── Gateway area        ← Google Places discovery
```

Gateway discovery uses the extracted Places lodging service near park/gateway coords (`PARK_GATEWAY_CITIES` when available for `areaLabel`). Cards: name, rating if available, location, Maps/site link. **No fake price/availability.**

Keep buckets visually and structurally distinct so users never confuse West Yellowstone hotels with inside-park lodges.

### Campgrounds — NPS first

NPS campground evidence (existing API/facts/evidence path) → StayCards with fees/amenities/reservation links when evidence has them.

### RV

When `stayPreference = rv`:

- filter/flag NPS campgrounds using RV suitability fields (hookups, RV counts, dump station, etc. when present)
- do **not** build a private RV-park inventory platform in v1
- optional Places `rv_park` near gateway may be added as gateway enrichment only if need-gated and cheap; not required for Yellowstone lodge demo path

### Vacation rental / Airbnb

When `stayPreference = vacation_rental`:

- set `vacationRentalHint` with suitable gateway/area guidance + external search hint
- never claim specific Airbnb listings or prices

---

## 6. Frontend

Logistics sections are **separate from day-by-day itinerary cards**.

Suggested sections (render only when corresponding status ≠ `not_requested` and content warrants):

1. **Getting there** — airports + ground transfer (fly / airport needs)
2. **Ground logistics** — route legs + miles/minutes + cap warnings
3. **Where to stay** — subsections: Inside park / Gateway / Camping (as activated)
4. **Itinerary** — existing day cards unchanged as the activity plan

Trust cues from provenance (`Official`, `NPS`, `Google Places`) without dumping raw backend metadata.

Cards should work even when the model produces weak prose. Prefer binding strictly to `travelLogistics`.

### Infeasibility / no itinerary

Backend contract **allows** returning `travelLogistics` even when there is **no** `canonicalPlan` (e.g. Case 7 route-leg exceeds daily drive cap → refuse generation).

Example UX (optional in first frontend pass, required in contract):

```text
RMNP → Dinosaur
~403 min
⚠ exceeds your 240-min daily limit
```

First frontend pass may focus on the happy-path Yellowstone fly+lodge demo; backend must not couple logistics correctness to successful itinerary generation.

---

## 7. Pipeline placement

Logistics correctness is **not** tied to model generation.

```text
planning state
+
frozen evidence
+
need-gated logistics inputs (adapters)
       ↓
travelLogisticsBuilder (pure)
       ↓
verified travelLogistics
       ├──→ model narration context (optional)
       │
       └──→ response/UI cards

model generation (when itinerary needed and feasible)
       ↓
canonicalPlan
       ↓
validation / finalization
       ↓
response {
  canonicalPlan?,        // may be absent on refuse paths
  travelLogistics?,      // present when needs activated
  ...
}
```

Cards must never require GPT to exist.

Wire into Trailie v2 execution after planning state + evidence assembly and after logistics adapters run for activated needs; attach `travelLogistics` on the response envelope additively.

---

## 8. Build order

Unchanged priority:

| Order | Capability | Why |
|---|---|---|
| 1 | Structured `travelLogistics` contract + needs resolver + pure builder scaffold | Source of truth |
| 2 | Drive leg cards | Backend already exists; fastest win |
| 3 | Airport + ground-transfer cards + transportation persistence repair | Makes “fly to Yellowstone” real |
| 4 | Inside-park lodge + gateway hotel cards | Required for Yellowstone fly+lodge demo |
| 5 | NPS campground cards | Strong existing TrailVerse advantage |
| 6 | RV-specific filtering/cards | Small extension of campground contract |
| 7 | Airbnb/vacation-rental fallback semantics | Preference/area/link only |

Demo critical path for Yellowstone fly+lodge: **1 → 2 → 3 → 4**. Items 5–7 reuse the same stay-card framework.

---

## 9. Verification

### Functional / contract

- Unknown park with no lodge catalog → `insidePark.status = not_verified`; never “no lodging exists.”
- Provider failure (Places) → `gateway.status = provider_unavailable` (or equivalent); never presented as zero hotels.
- Genericity: non-Yellowstone fixture proves no `if (yell)` control flow.
- Authority: Places result can never flip `insidePark` / `locationClass: inside_park`.
- Price safety: recursively assert no live-price/availability claim appears unless the contract explicitly supports it (`livePrice`/`liveAvailability` remain false in v1).
- Need gating: camping turn does not call hotel Places; drive-only turn does not request airports; hike Q&A does not attach logistics dump.
- Persistence: fly / departure airport / detailed `stayPreference` survive save/reload and refinement turns.
- Dual accommodation: validators still see coarse `accommodationClass`; logistics uses `stayPreference`.
- Backward compatibility: clients ignoring `travelLogistics` continue to work.
- Infeasibility: builder can emit route logistics with cap-exceeded feasibility without a `canonicalPlan`.

### Offline golden

Yellowstone fly+lodge golden uses **injected/mock** Maps/Places/catalog inputs. Do **not** make golden tests depend on live providers.

### Manual demo bar

Prompt: “5 days in Yellowstone from St. Louis, fly + lodge”

Expect:

- departure context for St. Louis / STL when resolvable
- airport cards (e.g. BZN / JAC / …) with ground transfer mi/time
- inside-park lodge cards from curated catalog
- gateway hotels in a separate bucket (when Places available)
- itinerary day cards as today
- no invented fares or room rates

---

## 10. Explicitly deferred to v2

- FlightProvider / Amadeus offers (and any “these are all available flights” framing)
- Live hotel rates / availability
- Booking.com / Expedia redirect inventory
- Airbnb authorized inventory
- Car rentals
- Checkout / affiliates

When v2 arrives, prefer a `FlightProvider` / lodging inventory interface with explicit `coverage=partial` rather than implying complete market truth (especially given Amadeus Self-Service airline gaps).

---

## 11. Implementation notes (non-normative pointers)

Existing leverage to reuse:

- `server/src/services/providers/mapsEvidenceProvider.js`
- `server/src/utils/routeEvidenceDriveBridge.js`
- `server/src/utils/airportCoordinates.js`
- `server/src/services/drivingTimesContextService.js` (rewire; do not leave prompt injection dead)
- NPS campgrounds via existing park/evidence paths
- `server/src/routes/gmaps.js` nearby lodging internals → extract shared service
- `PARK_GATEWAY_CITIES` in `parkPlanningService.js` for gateway labels
- Preference parse paths in `constraintEngine` / `tripStateBuilder` / `planningState` (extend, don’t replace coarse class)

New modules (illustrative names):

- `logisticsNeedsResolver.js`
- `travelLogisticsBuilder.js` (pure)
- `officialLodgingCatalog.js` (or `server/data/official-lodging-catalog.json` + loader)
- thin adapters for airports ground transfer, Places lodging normalize, NPS stay normalize
- frontend: logistics section components bound to `travelLogistics`

---

## 12. Spec self-review checklist

- [x] No placeholder TODOs for core contract decisions
- [x] Approach 1 + Lodge A + Scope C consistent throughout
- [x] Builder purity and need-gating explicit
- [x] Status semantics distinguish not_verified / verified_none / provider_unavailable / no_results
- [x] Dual accommodationClass + stayPreference preserves validators
- [x] Transportation persistence repair in-milestone
- [x] Stable IDs + schemaVersion: 1
- [x] Provenance includes freshness fields; livePrice/liveAvailability false in v1
- [x] Pipeline allows logistics without canonicalPlan
- [x] Verification includes gating, authority, price safety, offline golden
- [x] v2 booking/flight inventory clearly deferred
