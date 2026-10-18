# Controlled two-park replay — PASS

One local live traveler request, authorized by the user. The exact historical failed request could not be established; the user selected this captured comparison request with the explicit one-hotel-change sentence added:

> We're flying into Las Vegas and have five days total, including driving back for our flight. We'd like to visit Zion and Bryce Canyon, do easy hikes, and avoid changing hotels every night. Can you build a realistic trip? We only want one hotel change.

Ran the current model-first guest route with real providers and an isolated temporary MongoDB replica set. No production conversation or saved trip was modified. One request only, no rerun, SDK retries disabled. No implementation changes, hosted changes or deployment.

## Result

- HTTP 200; runtime `complete`; mutation accepted and persisted.
- First proposal accepted: `mutationRounds: [{issues: []}]`, zero corrections.
- Neither `duration_exceeds_source` nor `traveler_required_place_unresolved` occurred.
- Both canonical destinations retained: Zion (`zion`) and Bryce Canyon (`brca`).
- Five days, with arrival and departure included.
- Two nights Springdale, then two nights Bryce Canyon City: exactly one hotel change.
- Explicit transfer on day 3; day 5 reserved for the Las Vegas return and flight.
- Saved canonical plan deep-equals the returned plan; itinerary hashes match.
- Guest session consumed one user turn, leaving four; guest design unchanged.
- Runtime latency: 63,611 ms. Two planning calls plus the existing memory verifier (three provider model calls total). Zero correction calls. Runtime-reported model cost: $0.083209; this is not a total including other provider costs.

| Day | Content | Overnight |
|---|---|---|
| 1 | Arrival and transfer from Las Vegas | Springdale |
| 2 | Zion Riverside Walk, with canyon transport and rest | Springdale |
| 3 | Pa’rus Trail, then transfer to Bryce | Bryce Canyon City |
| 4 | Bryce Sunset Point and Sunrise Point, relaxed afternoon | Bryce Canyon City |
| 5 | Return to Las Vegas and fly home | None |

The plan explicitly assumes car access, an arrival early enough to reach Springdale, and a late-afternoon/evening return flight. Flight times and travel dates were not supplied. It explicitly states that an early return flight requires reconsidering this layout; long transfer driving times remain unconfirmed. This result does not establish every seasonal itinerary or early-flight scenario.

Public-safe saved plan: [JSON](trailie-two-park-live-plan-2026-10-17.json).

Local private evidence: `/private/tmp/trailie-two-park-replay-20261017/` contains the request, model responses, telemetry and saved session. Diagnosis capture response ID: `6d26076a-e656-4600-a0e0-182f9b3deaee`, under `artifacts/private/diagnosis/`. Saved itinerary hash: `f174ada7405b294c7570cb120359a75914bc522319653edc42fe9fc5c3ecd3da`.

## Recreation.gov

Already verified separately using the newly configured key: [RIDB live report](trailie-ridb-live-verification-2026-10-17.md). Upper Pines Campground and Half Dome Permits identities were returned successfully; availability remained unknown. The raw RIDB records had empty reservation URLs/link arrays. Official pages were verified independently, but those links were not inserted into runtime evidence. The API-key blocker is resolved; automatic booking-link delivery remains a documented gap. No additional model request was used for RIDB verification.

The approved two-destination scenario now passes live acceptance. No deployment was performed or authorized by this test.
