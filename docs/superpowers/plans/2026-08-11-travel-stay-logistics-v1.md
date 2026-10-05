# Travel & Stay Logistics v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship demand-gated, evidence-tagged `travelLogistics` (drive legs, airports + ground transfer, inside-park lodges, gateway hotels, campgrounds/RV, vacation-rental hints) with Plan AI cards — discovery only, no booking — so Yellowstone “fly + lodge from St. Louis” works before final demo validation.

**Architecture:** `logisticsNeedsResolver` gates slices from trip/planning state; thin adapters gather Maps/Places/NPS/catalog inputs; pure `travelLogisticsBuilder` assembles `travelLogistics`; Trailie v2 attaches it additively beside `canonicalPlan` (including refuse paths); frontend renders logistics sections only from that object.

**Tech Stack:** Node.js CommonJS, Jest (`npm run test:non-network` from `server/`), Next.js React JSX Plan AI chat, existing Google Distance Matrix evidence + Places nearby internals, NPS campgrounds.

**Spec:** `docs/superpowers/specs/2026-08-11-travel-stay-logistics-v1-design.md`

## Global Constraints

- No Amadeus/flight offers, live hotel prices, Booking/Expedia/Airbnb inventory, car-rental inventory, checkout, or affiliates.
- `travelLogisticsBuilder` is pure: no HTTP, no Maps/Places/NPS clients, no wall-clock provider reads.
- Places/Serper must never independently assert `locationClass: 'inside_park'` or flip inside-park status.
- Do not infer `verified_none` from empty catalog `[]`; empty without explicit none-record ⇒ `not_verified`.
- Provider failure ⇒ `provider_unavailable`, never “zero hotels/lodges.”
- Preserve coarse `accommodationClass: camping|lodging|unknown` for existing validators; add `stayPreference` for logistics precision.
- Logistics is demand-gated; model does not decide provider calls.
- `schemaVersion: 1` only on `travelLogistics` (no parallel ambiguous `version`).
- `livePrice` and `liveAvailability` remain `false` in v1 on all provenance objects.
- No destination-specific control flow (`if (yell)`); catalog data may be park-keyed.
- Cap provider fan-out: at most **3** airport candidates for Matrix ground-transfer; at most **5** Places lodging results for gateway cards.
- Distinguishing “traveling in an RV” (transport) vs “want an RV campsite” (`stayPreference=rv`): only lodging/camping intent sets stay preference; mere RV-as-vehicle must not force camping.
- Existing clients ignoring `travelLogistics` must keep working (additive field).
- Offline goldens use injected/mock inputs — never live providers.
- No commit/push/deploy/demo capture as part of writing or executing this plan unless the user explicitly requests it later.

---

## File map

| Path | Responsibility |
|---|---|
| `server/src/utils/travelLogisticsContract.js` | Enums, empty shells, normalize/validate, price-safety assert, deterministic IDs |
| `server/src/utils/logisticsNeedsResolver.js` | Pure need gate → activated slices |
| `server/src/utils/stayPreferenceMapper.js` | Map user/accommodation signals → `{ accommodationClass, stayPreference }` |
| `server/src/utils/travelLogisticsBuilder.js` | Pure assemble inputs → `travelLogistics` |
| `server/src/services/travelLogisticsOrchestrator.js` | Needs → adapters → builder (I/O boundary) |
| `server/src/services/placesLodgingService.js` | Extracted Places nearby lodging (in-process) |
| `server/src/services/airportGroundTransferAdapter.js` | Nearest airports + Matrix legs (capped) |
| `server/src/services/campgroundStayAdapter.js` | Normalize NPS campground evidence → stay inputs |
| `server/src/data/officialLodgingCatalog.json` | Curated inside-park lodges |
| `server/src/utils/officialLodgingCatalog.js` | Loader + lookup by `parkCode` |
| `server/src/utils/planningState.js` | Persist transport departure fields + stayPreference |
| `server/src/utils/tripStateBuilder.js` | Parse/persist aligned transport + stay preference |
| `server/src/routes/gmaps.js` | Call extracted `placesLodgingService` |
| `server/src/services/trailieV2ExecutionService.js` | Attach `travelLogistics` in `finalize()` / refuse paths |
| `server/src/routes/ai.js` | Forward `travelLogistics` on all four v2 response terminals |
| `next-frontend/src/components/plan-ai/TravelLogisticsSections.jsx` | Getting there / Route / Stay sections |
| `next-frontend/src/components/plan-ai/TripPlannerChat.jsx` | Bind `message.travelLogistics` → sections |
| `server/src/utils/__tests__/…` + `server/src/services/__tests__/…` | Unit + golden offline tests |
| `server/src/eval/travelLogisticsYellowstoneFlyLodgeGolden.js` | Offline golden fixture |

---

### Task 1: Contract module — enums, empty shell, IDs, price safety

**Files:**
- Create: `server/src/utils/travelLogisticsContract.js`
- Create: `server/src/utils/__tests__/travelLogisticsContract.test.js`

**Interfaces:**
- Produces:
  - `TRAVEL_LOGISTICS_SCHEMA_VERSION = 1`
  - `emptyTravelLogistics()`
  - `normalizeTravelLogistics(raw)`
  - `assertNoLiveCommercialClaims(travelLogistics)` — throws if any `livePrice`/`liveAvailability` true or price fields present
  - `buildDriveLegId({ originEntityId, destinationEntityId, travelMode })`
  - `buildAirportEntityId(airportCode)`
  - `metersToMiles(meters)`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const {
  TRAVEL_LOGISTICS_SCHEMA_VERSION,
  emptyTravelLogistics,
  normalizeTravelLogistics,
  assertNoLiveCommercialClaims,
  buildDriveLegId,
  metersToMiles,
} = require('../travelLogisticsContract');

describe('travelLogisticsContract', () => {
  test('empty shell uses schemaVersion 1 and not_requested statuses', () => {
    const t = emptyTravelLogistics();
    expect(t.schemaVersion).toBe(1);
    expect(TRAVEL_LOGISTICS_SCHEMA_VERSION).toBe(1);
    expect(t.transport.airportsStatus).toBe('not_requested');
    expect(t.transport.routeLegsStatus).toBe('not_requested');
    expect(t.stays.insidePark.status).toBe('not_verified');
    expect(t.stays.insidePark.properties).toEqual([]);
    expect(t.stays.gateway.status).toBe('not_requested');
    expect(t.stays.campgrounds.status).toBe('not_requested');
  });

  test('normalize rejects ambiguous top-level version-only objects without schemaVersion', () => {
    const n = normalizeTravelLogistics({ version: 1, transport: {}, stays: {} });
    expect(n.ok).toBe(false);
  });

  test('assertNoLiveCommercialClaims fails on livePrice true', () => {
    const t = emptyTravelLogistics();
    t.stays.gateway.status = 'available';
    t.stays.gateway.properties = [{
      propertyId: 'p1',
      name: 'Hotel',
      locationClass: 'gateway',
      provenance: { sourceType: 'google_places', livePrice: true, liveAvailability: false, evidenceStatus: 'verified' },
    }];
    expect(() => assertNoLiveCommercialClaims(t)).toThrow(/livePrice/);
  });

  test('buildDriveLegId is deterministic', () => {
    const a = buildDriveLegId({ originEntityId: 'a', destinationEntityId: 'b', travelMode: 'drive' });
    const b = buildDriveLegId({ originEntityId: 'a', destinationEntityId: 'b', travelMode: 'drive' });
    expect(a).toBe(b);
    expect(a).toMatch(/^leg:/);
  });

  test('metersToMiles rounds reasonably', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test:non-network -- src/utils/__tests__/travelLogisticsContract.test.js`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement contract**

Implement `travelLogisticsContract.js` matching the spec §3 shape: enums for list statuses (`not_requested|available|no_results|provider_unavailable|not_verified`), inside-park statuses (`verified|not_verified|verified_none`), provenance defaults with `livePrice: false`, `liveAvailability: false`. `normalizeTravelLogistics` returns `{ ok, value, errors }`. Recursively walk objects in `assertNoLiveCommercialClaims` and also reject keys like `price`, `priceUsd`, `nightlyRate` if present on stay cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm run test:non-network -- src/utils/__tests__/travelLogisticsContract.test.js`

Expected: PASS

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add server/src/utils/travelLogisticsContract.js server/src/utils/__tests__/travelLogisticsContract.test.js
git commit -m "$(cat <<'EOF'
feat(trailie): add travelLogistics contract scaffold

EOF
)"
```

---

### Task 2: Stay preference mapper (dual contract)

**Files:**
- Create: `server/src/utils/stayPreferenceMapper.js`
- Create: `server/src/utils/__tests__/stayPreferenceMapper.test.js`

**Interfaces:**
- Produces: `mapStayPreference(input) → { accommodationClass, stayPreference }`
- Consumes: raw accommodation string / message cues / previous preference

```js
// mapStayPreference({
//   rawAccommodation, // from constraints / form / message
//   messageText,
//   previousStayPreference,
// })
```

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { mapStayPreference } = require('../stayPreferenceMapper');

describe('mapStayPreference', () => {
  test('lodge → lodging + lodge', () => {
    expect(mapStayPreference({ rawAccommodation: 'lodge' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'lodge',
    });
  });

  test('hotel → lodging + hotel', () => {
    expect(mapStayPreference({ rawAccommodation: 'hotel' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'hotel',
    });
  });

  test('rv as campsite → camping + rv', () => {
    expect(mapStayPreference({ rawAccommodation: 'rv' })).toEqual({
      accommodationClass: 'camping',
      stayPreference: 'rv',
    });
  });

  test('traveling in an RV without stay cue does not force camping', () => {
    expect(mapStayPreference({
      messageText: 'We are traveling in a 30-foot RV from Denver',
      rawAccommodation: null,
    })).toEqual({
      accommodationClass: 'unknown',
      stayPreference: 'unknown',
    });
  });

  test('want RV campsite sets rv preference', () => {
    expect(mapStayPreference({
      messageText: 'We want an RV campsite with hookups',
      rawAccommodation: null,
    })).toEqual({
      accommodationClass: 'camping',
      stayPreference: 'rv',
    });
  });

  test('airbnb → lodging + vacation_rental', () => {
    expect(mapStayPreference({ rawAccommodation: 'airbnb' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'vacation_rental',
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`cd server && npm run test:non-network -- src/utils/__tests__/stayPreferenceMapper.test.js`

- [ ] **Step 3: Implement mapper**

Rules:
- Explicit stay nouns (`lodge`, `hotel`, `cabin`, `motel`, `airbnb`, `camping`, `campground`, `rv site`, `hookups`) set preference.
- Phrases like `traveling in (an )?RV` / `driving (an )?RV` / `our RV` **without** camp/site/hookup/stay nouns ⇒ do **not** set `stayPreference=rv`.
- `camping|tent|backcountry` ⇒ `campground` unless RV campsite cues win.
- Coarse class: camping preferences → `camping`; lodge/hotel/cabin/vacation_rental → `lodging`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 3: logisticsNeedsResolver (demand gate)

**Files:**
- Create: `server/src/utils/logisticsNeedsResolver.js`
- Create: `server/src/utils/__tests__/logisticsNeedsResolver.test.js`

**Interfaces:**
- Produces: `resolveLogisticsNeeds({ planningState, tripState, intent, messageText, tripScope }) → LogisticsNeeds`

```js
// LogisticsNeeds shape:
{
  routeLegs: boolean,
  airports: boolean,
  insideParkLodging: boolean,
  gatewayLodging: boolean,
  campgrounds: boolean,
  rvFilter: boolean,
  vacationRentalHint: boolean,
  reasons: string[], // stable reason codes for tests/telemetry
}
```

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { resolveLogisticsNeeds } = require('../logisticsNeedsResolver');

const base = {
  planningState: null,
  tripState: null,
  intent: { primaryIntent: 'park_facts' },
  messageText: 'What are the best hikes in Yosemite?',
  tripScope: null,
};

describe('resolveLogisticsNeeds', () => {
  test('hike Q&A activates nothing', () => {
    const n = resolveLogisticsNeeds(base);
    expect(n.routeLegs).toBe(false);
    expect(n.airports).toBe(false);
    expect(n.insideParkLodging).toBe(false);
    expect(n.gatewayLodging).toBe(false);
    expect(n.campgrounds).toBe(false);
  });

  test('fly + lodge trip activates airports and lodge slices', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: '5 days in Yellowstone from St. Louis, we will fly and stay in a lodge',
      planningState: {
        transportation: { mode: 'fly', departureCity: 'St. Louis', departureAirportCode: 'STL' },
        lodging: { type: 'lodging', stayPreference: 'lodge' },
      },
    });
    expect(n.airports).toBe(true);
    expect(n.insideParkLodging).toBe(true);
    expect(n.gatewayLodging).toBe(true);
    expect(n.campgrounds).toBe(false);
  });

  test('drive-only road trip activates routeLegs not airports', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: 'Road trip Denver to RMNP to Dinosaur, max 4 hours driving a day',
      planningState: { transportation: { mode: 'drive' } },
      tripScope: { routeLegs: [{}, {}], maxDailyDriveMinutes: 240 },
    });
    expect(n.routeLegs).toBe(true);
    expect(n.airports).toBe(false);
  });

  test('camping preference activates campgrounds not Places hotels', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'lodging_strategy' },
      messageText: 'We want to camp in Yellowstone',
      planningState: { lodging: { type: 'camping', stayPreference: 'campground' } },
    });
    expect(n.campgrounds).toBe(true);
    expect(n.gatewayLodging).toBe(false);
    expect(n.insideParkLodging).toBe(false);
  });

  test('persisted fly+lodge still activates on day-count refinement', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'refinement' },
      messageText: 'Make it 6 days instead',
      planningState: {
        transportation: { mode: 'fly', departureCity: 'St. Louis' },
        lodging: { type: 'lodging', stayPreference: 'lodge' },
      },
    });
    expect(n.airports).toBe(true);
    expect(n.insideParkLodging).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement resolver**

Activation rules (spec §2 demand gate):
- `routeLegs` if `mode=drive` OR tripScope has route legs OR message is drive-time question between places OR road-trip shape.
- `airports` if `mode=fly` OR message has fly/airport cues OR persisted departure airport/city with fly mode.
- `insideParkLodging` if `stayPreference` in `lodge|cabin` OR lodging_strategy with lodge cues OR persisted lodge preference on trip-planning intents.
- `gatewayLodging` if `stayPreference` in `hotel|lodge|cabin` OR lodging_strategy for hotels OR inside lodge path wants gateway fallback.
- `campgrounds` if `stayPreference` in `campground|rv` OR camping accommodationClass on lodging intents.
- `rvFilter` if `stayPreference=rv`.
- `vacationRentalHint` if `stayPreference=vacation_rental`.
- Plain `full_trip` / “plan 2 days” **without** fly/stay cues ⇒ all logistics flags false (itinerary only).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 4: Pure builder scaffold + drive legs from injected Maps inputs

**Files:**
- Create: `server/src/utils/travelLogisticsBuilder.js`
- Create: `server/src/utils/__tests__/travelLogisticsBuilder.test.js`

**Interfaces:**
- Produces: `buildTravelLogistics(inputs) → travelLogistics`
- Consumes normalized inputs only (no I/O):

```js
// inputs:
{
  needs: LogisticsNeeds,
  transportMode,
  departure: { city, airportCode },
  routeLegEvidence: [{ originEntityId, destinationEntityId, originLabel, destinationLabel, durationSeconds, distanceMeters, status }],
  driveCap: { maxDailyDriveMinutes },
  airports: [...],          // later tasks
  insideParkCatalog: [...], // later
  gatewayPlaces: [...],     // later
  campgrounds: [...],       // later
  vacationRentalHint: null,
  adapterErrors: { gateway?: Error|null, airports?: Error|null, campgrounds?: Error|null },
}
```

- [ ] **Step 1: Write failing drive-leg tests**

```js
'use strict';

const { buildTravelLogistics } = require('../travelLogisticsBuilder');
const { assertNoLiveCommercialClaims } = require('../travelLogisticsContract');

describe('buildTravelLogistics drive legs', () => {
  test('maps evidence becomes verified legs with miles and cap feasibility', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: true, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'drive',
      departure: { city: 'Denver', airportCode: null },
      routeLegEvidence: [{
        originEntityId: 'city:denver',
        destinationEntityId: 'nps:park:romo',
        originLabel: 'Denver',
        destinationLabel: 'Rocky Mountain NP',
        durationSeconds: 6300,
        distanceMeters: 104607,
        status: 'verified',
      }],
      driveCap: { maxDailyDriveMinutes: 240 },
      adapterErrors: {},
    });
    expect(out.transport.routeLegsStatus).toBe('available');
    expect(out.transport.routeLegs).toHaveLength(1);
    expect(out.transport.routeLegs[0].durationMinutes).toBe(105);
    expect(out.transport.routeLegs[0].distanceMiles).toBeGreaterThan(60);
    expect(out.transport.routeLegs[0].feasibility.exceedsDailyDriveCap).toBe(false);
    expect(out.transport.airportsStatus).toBe('not_requested');
    assertNoLiveCommercialClaims(out);
  });

  test('leg over cap sets feasibility.exceedsDailyDriveCap without requiring itinerary', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: true, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'drive',
      departure: { city: null, airportCode: null },
      routeLegEvidence: [{
        originEntityId: 'nps:park:romo',
        destinationEntityId: 'nps:park:dino',
        originLabel: 'RMNP',
        destinationLabel: 'Dinosaur',
        durationSeconds: 24180,
        distanceMeters: 500000,
        status: 'verified',
      }],
      driveCap: { maxDailyDriveMinutes: 240 },
      adapterErrors: {},
    });
    expect(out.transport.routeLegs[0].feasibility.exceedsDailyDriveCap).toBe(true);
    expect(out.transport.routeLegs[0].durationMinutes).toBe(403);
  });

  test('needs.routeLegs false leaves routeLegsStatus not_requested', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'unknown',
      departure: { city: null, airportCode: null },
      routeLegEvidence: [{ originEntityId: 'a', destinationEntityId: 'b', durationSeconds: 100, distanceMeters: 1000, status: 'verified' }],
      driveCap: { maxDailyDriveMinutes: null },
      adapterErrors: {},
    });
    expect(out.transport.routeLegsStatus).toBe('not_requested');
    expect(out.transport.routeLegs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement builder** for drive + empty not_requested other slices. Reuse `extractDrivingLegsFromEvidenceBundle` shapes as **input** only — do not import Maps clients. Prefer accepting pre-extracted `routeLegEvidence` from orchestrator (orchestrator may call `extractDrivingLegsFromEvidenceBundle`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 5: Planning/trip state persistence — transport + stayPreference

**Files:**
- Modify: `server/src/utils/planningState.js`
- Modify: `server/src/utils/tripStateBuilder.js`
- Modify: `server/src/utils/__tests__/planningState.test.js` (or create if missing focused file)
- Create: `server/src/utils/__tests__/travelLogisticsPersistence.test.js`

**Interfaces:**
- Extends `lodging` with `stayPreference` (nullable).
- Extends `transportation` with `departureCity`, `departureAirportCode` (keep `mode`, `startLocation`, `airport`, `rentalCar`).
- `buildPlanningStateFromRuntime` must copy airport/rentalCar/departure fields (fix audit drop).
- Negation: messages matching prefer-not-to-fly must not set `mode: 'fly'`.

- [ ] **Step 1: Write failing persistence tests**

```js
test('departureAirportCode and stayPreference survive normalizePersistedPlanningState', () => {
  const { normalizePersistedPlanningState } = require('../planningState');
  const { state } = normalizePersistedPlanningState({
    lodging: { type: 'lodging', stayPreference: 'lodge', baseTown: null, booked: null },
    transportation: {
      mode: 'fly',
      startLocation: 'St. Louis',
      airport: 'STL',
      departureCity: 'St. Louis',
      departureAirportCode: 'STL',
      rentalCar: true,
    },
  });
  expect(state.transportation.departureAirportCode).toBe('STL');
  expect(state.transportation.departureCity).toBe('St. Louis');
  expect(state.transportation.rentalCar).toBe(true);
  expect(state.lodging.stayPreference).toBe('lodge');
});

test('buildPlanningStateFromRuntime retains airport fields from tripState', () => {
  // Construct runtime with tripState.transportation.airport = 'MCI' and mode fly;
  // assert returned planningState keeps departureAirportCode/airport.
});
```

- [ ] **Step 2: Run — expect FAIL** on missing fields after normalize

- [ ] **Step 3: Implement whitelist + runtime copy**

In `emptyPlanningState` / `normalizePersistedPlanningState` / `buildPlanningStateFromRuntime` / `planningStateToTripStateLayer` / `tripStateBuilder` empty + merge layers, add the new keys. Map `airport` ↔ `departureAirportCode` when one is present. Wire `mapStayPreference` when updating lodging from message/constraints.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 6: Official lodge catalog + inside-park builder path

**Files:**
- Create: `server/src/data/officialLodgingCatalog.json`
- Create: `server/src/utils/officialLodgingCatalog.js`
- Create: `server/src/utils/__tests__/officialLodgingCatalog.test.js`
- Modify: `server/src/utils/travelLogisticsBuilder.js`
- Modify: `server/src/utils/__tests__/travelLogisticsBuilder.test.js`

**Interfaces:**
- `listOfficialLodgingByParkCode(parkCode) → OfficialLodgingProperty[]`
- `hasOfficialLodgingCoverage(parkCode) → boolean` (true only if park has ≥1 catalog entries **or** explicit verified_none record — v1 can omit none-records and treat missing park as not covered)

Catalog entry fields per spec. **Hard requirement:** Yellowstone (`yell`) with at least Old Faithful Inn + Canyon Lodge (or equivalent real official properties with real official URLs). Prefer Tier 1 parks if time allows; Yellowstone is mandatory.

- [ ] **Step 1: Write failing tests**

```js
test('yell returns inside_park properties with official URLs', () => {
  const { listOfficialLodgingByParkCode } = require('../officialLodgingCatalog');
  const rows = listOfficialLodgingByParkCode('yell');
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.every((r) => r.locationClass === 'inside_park')).toBe(true);
  expect(rows.every((r) => /^https?:\/\//.test(r.officialUrl))).toBe(true);
});

test('unknown park has no coverage — builder sets not_verified not verified_none', () => {
  const out = buildTravelLogistics({
    needs: { routeLegs: false, airports: false, insideParkLodging: true, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
    transportMode: 'unknown',
    departure: { city: null, airportCode: null },
    parkCode: 'xxxx',
    insideParkCatalog: [],
    catalogCoverage: false,
    adapterErrors: {},
  });
  expect(out.stays.insidePark.status).toBe('not_verified');
  expect(out.stays.insidePark.properties).toEqual([]);
});

test('Places enrichment cannot set inside_park on gateway-only place', () => {
  const out = buildTravelLogistics({
    needs: { routeLegs: false, airports: false, insideParkLodging: true, gatewayLodging: true, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
    parkCode: 'yell',
    insideParkCatalog: [{ propertyId: 'yell:old-faithful-inn', parkCode: 'yell', name: 'Old Faithful Inn', propertyType: 'lodge', locationClass: 'inside_park', officialUrl: 'https://example.nps.gov/ofi' }],
    catalogCoverage: true,
    gatewayPlaces: [{ placeId: 'ChxFake', name: 'Fake Lodge Outside', rating: 4.9, address: 'West Yellowstone', mapsUrl: 'https://maps.google.com/?cid=1' }],
    adapterErrors: {},
  });
  expect(out.stays.insidePark.properties.every((p) => p.locationClass === 'inside_park')).toBe(true);
  expect(out.stays.gateway.properties.every((p) => p.locationClass === 'gateway')).toBe(true);
  expect(out.stays.gateway.properties.every((p) => p.locationClass !== 'inside_park')).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Add JSON + loader + builder inside/gateway assembly**

Loader must be generic: `entries.filter(e => e.parkCode === code)`. No `if (code === 'yell')`.

When `needs.insideParkLodging` and `catalogCoverage === true` and properties length > 0 ⇒ `status: 'verified'`.  
When needed and `catalogCoverage === false` ⇒ `not_verified`.  
Only set `verified_none` if input includes explicit `{ verifiedNone: true }` from an authoritative record (v1 may never emit this).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 7: Extract Places lodging service + gateway adapter status handling

**Files:**
- Create: `server/src/services/placesLodgingService.js`
- Create: `server/src/services/__tests__/placesLodgingService.test.js` (mock `fetch`)
- Modify: `server/src/routes/gmaps.js` — `/nearby` delegates to service for lodging (and ideally all types)
- Create: `server/src/services/gatewayLodgingAdapter.js` (thin normalize + cap 5)

**Interfaces:**
- `searchNearbyLodging({ lat, lng, radiusMeters, limit }) → { ok, status, places[] }`
  - `status`: `available | no_results | provider_unavailable`
- Never HTTP-call `/api/gmaps/nearby` from server code.

- [ ] **Step 1: Write failing tests** with mocked fetch success, zero results, and API error → `provider_unavailable`

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Extract logic from `gmaps.js` nearby handler into `placesLodgingService.js`; route becomes a thin wrapper. Cap `limit` default 5 for logistics (route may keep top 10 for backward compat).**

- [ ] **Step 4: Builder/orchestrator: Places failure ⇒ `gateway.status = provider_unavailable` and `properties = []` — never imply no hotels.**

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit** (if requested)

---

### Task 8: Airport ground-transfer adapter (fan-out capped)

**Files:**
- Create: `server/src/services/airportGroundTransferAdapter.js`
- Create: `server/src/services/__tests__/airportGroundTransferAdapter.test.js`
- Modify: `server/src/utils/travelLogisticsBuilder.js` (airports slice)
- Inspect: `server/src/utils/airportCoordinates.js`, `server/src/services/drivingTimesContextService.js`, `server/src/services/providers/mapsEvidenceProvider.js`

**Interfaces:**
- `resolveAirportGroundTransfers({ parkLat, parkLon, parkLabel, parkEntityId, departureCity, departureAirportCode, mapsGetRoute, maxAirports = 3 })`
- Returns normalized airport inputs for builder; uses `getNearestAirports(..., maxAirports)` and optional departure airport resolution.
- Each Matrix call goes through injected `mapsGetRoute` (same client as evidence provider) — **do not** revive dead prompt-only path as the product path; can reuse helpers from `drivingTimesContextService` for parsing if useful.

- [ ] **Step 1: Write failing tests** with fake `mapsGetRoute` returning duration/distance; assert ≤3 airports requested; STL departure labeled; BZN/JAC-style nearest for yell coords.

- [ ] **Step 2: Implement adapter + builder airports section** (`airportsStatus` available/no_results/provider_unavailable).

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit** (if requested)

---

### Task 9: Campground + RV adapter

**Files:**
- Create: `server/src/services/campgroundStayAdapter.js`
- Create: `server/src/services/__tests__/campgroundStayAdapter.test.js`
- Modify: `server/src/utils/travelLogisticsBuilder.js`

**Interfaces:**
- `normalizeCampgroundsForLogistics({ npsCampgrounds, rvFilter }) → { status, properties }`
- Map NPS fields: name, reservationUrl, fees/amenities when present, `rvSuitable` from RV counts/hookups/dump when available.
- When `rvFilter` true, keep/flag RV-suitable sites; if none suitable but provider ok ⇒ `available` with empty or filtered list + do not invent.

- [ ] **Step 1–4:** TDD as above; include provider_unavailable path.

- [ ] **Step 5: Commit** (if requested)

---

### Task 10: Vacation-rental hint (semantics only)

**Files:**
- Modify: `server/src/utils/travelLogisticsBuilder.js`
- Modify: `server/src/utils/__tests__/travelLogisticsBuilder.test.js`

**Interfaces:**
- When `needs.vacationRentalHint`, set `stays.vacationRentalHint` with gateway `areaLabel` from `PARK_GATEWAY_CITIES` / planning base town and an external search hint string — **no listings**.

- [ ] **Step 1: Failing test** — airbnb preference yields hint, zero inventory properties, no prices.

- [ ] **Step 2: Implement**

- [ ] **Step 3: Pass + commit** (if requested)

---

### Task 11: Orchestrator + Trailie v2 attachment (including refuse path)

**Files:**
- Create: `server/src/services/travelLogisticsOrchestrator.js`
- Create: `server/src/services/__tests__/travelLogisticsOrchestrator.test.js`
- Modify: `server/src/services/trailieV2ExecutionService.js`
- Modify: `server/src/routes/ai.js` (all four v2 `transport.responseFinalized` sites)
- Create: `server/src/services/__tests__/travelLogisticsV2Attachment.test.js` (structural / stubbed)

**Interfaces:**
- `buildTravelLogisticsForTurn(context) → travelLogistics | null`
  - runs needs resolver; if all false ⇒ return `null` (omit field)
  - else run only needed adapters → `buildTravelLogistics` → `assertNoLiveCommercialClaims`
- Attach on `finalize()` result as `travelLogistics`
- On route-leg cap infeasibility / refuse-before-generation path, still call orchestrator when `needs.routeLegs` so cards can show exceeding leg

- [ ] **Step 1: Write failing tests**
  - hike turn ⇒ orchestrator returns null / no provider spies called
  - fly+lodge with mocks ⇒ airports + inside catalog
  - camping turn ⇒ Places lodging spy not called
  - refuse path with route needs ⇒ travelLogistics present, canonicalPlan null/absent

- [ ] **Step 2: Wire execution service** after evidence + drive bridge inputs exist; pass extracted route evidence into orchestrator. Keep builder pure.

- [ ] **Step 3: Forward `travelLogistics: v2Result.travelLogistics ?? null` in auth chat, auth stream, anon stream, anon chat response payloads.**

- [ ] **Step 4: Run focused suites — PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 12: Frontend logistics sections

**Files:**
- Create: `next-frontend/src/components/plan-ai/TravelLogisticsSections.jsx`
- Create: `next-frontend/src/components/plan-ai/__tests__/TravelLogisticsSections.test.jsx` (if frontend test harness exists; otherwise a minimal RTL test matching EarlyItineraryCard pattern)
- Modify: `next-frontend/src/components/plan-ai/TripPlannerChat.jsx`
- Possibly: message normalization where `canonicalPlan` is stored — also persist `travelLogistics` on the assistant message object

**Interfaces:**
- `<TravelLogisticsSections logistics={travelLogistics} />`
- Renders only sections where status ≠ `not_requested` and (for lists) not empty unless status is `provider_unavailable` / `not_verified` (show honest empty/error copy)
- Subsections: Getting there | Ground logistics | Where to stay (Inside / Gateway / Camping)
- Trust cues from provenance.sourceType
- Never display price fields

- [ ] **Step 1: Write component test** with fixture Yellowstone fly+lodge logistics object — assert airport codes, inside lodge name, gateway hotel name appear in separate labeled regions; assert no `$` price.

- [ ] **Step 2: Implement UI** using existing Plan AI tokens/classes (match TrailVerse patterns; no new card chrome extravagance).

- [ ] **Step 3: In TripPlannerChat**, when assistant message includes `travelLogistics`, render `<TravelLogisticsSections />` **above** `EarlyItineraryCard` (logistics first, itinerary second). Also render logistics alone when present without itinerary (refuse path).

- [ ] **Step 4: Run frontend tests if present**

- [ ] **Step 5: Commit** (if requested)

---

### Task 13: Offline Yellowstone fly+lodge golden + isolation checks

**Files:**
- Create: `server/src/eval/travelLogisticsYellowstoneFlyLodgeGolden.js`
- Create: `server/src/services/__tests__/travelLogisticsYellowstoneGolden.test.js`
- Create: `server/src/utils/__tests__/travelLogisticsBuilderIsolation.test.js`

**Interfaces:**
- Golden fixture injects mock Maps legs, mock Places hotels, catalog yell entries, planningState fly+lodge from St. Louis.
- Assert full `travelLogistics` shape: STL departure, ≥1 airport with ground transfer, inside_park lodges verified, gateway separate, `assertNoLiveCommercialClaims`, no `if (yell)` in builder source (isolation test reads builder file / uses second parkCode fixture).

- [ ] **Step 1: Write golden + isolation tests**

Isolation checks:
- `travelLogisticsBuilder.js` must not `require` routes, `placesLodgingService`, `mapsEvidenceProvider`, or `npsService`.
- Second park without catalog ⇒ `not_verified`.
- Places failure input ⇒ `provider_unavailable`.

- [ ] **Step 2: Run**

`cd server && npm run test:non-network -- src/utils/__tests__/travelLogisticsContract.test.js src/utils/__tests__/stayPreferenceMapper.test.js src/utils/__tests__/logisticsNeedsResolver.test.js src/utils/__tests__/travelLogisticsBuilder.test.js src/utils/__tests__/officialLodgingCatalog.test.js src/utils/__tests__/travelLogisticsPersistence.test.js src/services/__tests__/placesLodgingService.test.js src/services/__tests__/airportGroundTransferAdapter.test.js src/services/__tests__/campgroundStayAdapter.test.js src/services/__tests__/travelLogisticsOrchestrator.test.js src/services/__tests__/travelLogisticsYellowstoneGolden.test.js src/utils/__tests__/travelLogisticsBuilderIsolation.test.js`

Expected: all PASS; zero live provider calls.

- [ ] **Step 3: Commit** (if requested)

---

### Task 14: Final regression sanity (no demo)

**Files:** none new

- [ ] **Step 1: Run adjacent road-trip / drive-bridge suites** to ensure logistics work did not break Maps consumption:

`cd server && npm run test:non-network -- src/utils/__tests__/routeEvidenceDriveBridge.test.js src/utils/__tests__/mixedRoadTripMapsFulfillment.test.js`

Expected: PASS

- [ ] **Step 2: Grep guarantee**

```bash
rg -n "livePrice:\\s*true|Amadeus|booking\\.com/demand" server/src/utils/travelLogistics*.js server/src/services/travelLogistics*.js server/src/services/airportGroundTransferAdapter.js server/src/services/placesLodgingService.js
```

Expected: no matches for enabling live commercial claims.

- [ ] **Step 3: Stop** — do not start demo capture, deploy, or live GPT runs unless user explicitly requests.

---

## Spec coverage self-review

| Spec requirement | Task(s) |
|---|---|
| Demand-gated logistics / model does not choose providers | 3, 11 |
| Pure builder / no server→HTTP Places | 4, 7, 11, 13 isolation |
| `travelLogistics` contract + stable IDs + schemaVersion 1 | 1, 4 |
| Status semantics not_verified / verified_none / provider_unavailable / no_results | 1, 6, 7, 9 |
| Dual accommodationClass + stayPreference | 2, 5 |
| Inside-park catalog authority; Places cannot claim inside_park | 6, 7 |
| Transport persistence repair | 5 |
| Drive miles + minutes + cap feasibility without itinerary | 4, 11 |
| Airports + ground transfer, no fares; fan-out ≤3 | 8 |
| Gateway Places ≤5; extract service | 7 |
| Campgrounds NPS + RV filter; RV vehicle ≠ campsite | 2, 9 |
| Vacation rental hint only | 10 |
| v2 attach additive; four routes; refuse path | 11 |
| Frontend sections separate from day cards | 12 |
| Offline golden Yellowstone fly+lodge | 13 |
| Price safety / no v2 booking APIs | 1, 13, 14 |
| Tier-1 catalog beyond yell optional | 6 (yell required) |

## Placeholder scan

No TBD/TODO implementation steps; commands and interfaces named. Commits gated on user request.

## Type consistency

- `LogisticsNeeds` flags shared by resolver → orchestrator → builder.
- `stayPreference` enum identical in mapper, planningState, needs resolver, builder.
- Inside-park status enum: `verified | not_verified | verified_none` only.
- List statuses: `not_requested | available | no_results | provider_unavailable | not_verified`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-travel-stay-logistics-v1.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints  

**Which approach?**

Do not start implementation, commits, push, deploy, or demo work until you choose an execution option (or explicitly ask to wait).
