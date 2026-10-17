# Pass 3B — One live stream integration test

The single authorized proposal was accepted and persisted in the isolated database, with no correction or retry. Actual Sol argument deltas reached the authenticated chat and generated five provisional day objects. Draft state was removed after acceptance. This is a successful stream/guard/persistence integration result, **not full browser or production acceptance**.

## Boundaries

- One new `gpt-6.1-sol` streamed itinerary proposal and one optional memory verification; SDK retries disabled.
- Existing captured Zion + Bryce conversation and frozen evidence; current clarified day-type policy, unchanged proposal schema and guard.
- Real development chat composer, JWT authentication, credentialed CORS, actual router/store and temporary MongoDB. Frontend/backend on loopback ports 3107/3110.
- Frozen research injected at the travel-tool boundary. Zero live research/provider attempts, zero corrections, no production database access.
- Development-only preview enabled for this process. Reserve discovery disabled. No interruption test, commits, deployment or production activation.
- Raw requests, responses, deltas, JWT session, database snapshot and screenshots remain private and gitignored under `artifacts/private/pass3b-one-live/`.

## Measurements

| Measurement | Result | Boundary |
|---|---:|---|
| First actual argument delta | 3.10 s | Proposal request to adapter delta |
| First complete day parsed | 20.98 s | Proposal request to parser |
| First day rendered in browser DOM | 23.38 s | Playwright click initiation to animation-frame observation |
| Subsequent days rendered | 32.39 / 41.68 / 49.01 / 57.69 s | Same browser clock |
| Proposal generation | 58.43 s | Adapter request lifecycle |
| Memory verification | 3.14 s | Verifier lifecycle |
| Accepted itinerary including persistence | 61.61 s | Server turn telemetry |
| Database update timestamp | 63.92 s | From Playwright click initiation; 61.62 s from browser HTTP request |
| Accepted chat observed, draft absent | By 65.64 s | Browser assertion upper bound, not exact paint time |

Playwright took approximately 2.30 s between click initiation and the actual HTTP request. These clock boundaries must not be conflated.

**Readable preview timing was not established.** The initial probe checked viewport intersection but not occlusion. Screenshot review showed the fixed composer covering the area where the first draft day entered the viewport. Its `visibleMs` value is invalid as a measure of readable content. The first-day screenshot shows only the top of the preview container above the composer. Later days entered the DOM without scrolling the traveler to them. Do not advertise 23.38 s as time to useful visible content or calculate a demonstrated visible-preview lead time from it.

## Usage and recorded cost

| Call | Input | Output | Cache read | Cache write | Ledger cost |
|---|---:|---:|---:|---:|---:|
| Proposal | 15,536 | 2,468 | 0 | 15,533 | $0.0635185 |
| Memory verification | 772 | 99 | 0 | 0 | $0.0025340 |
| Total | 16,308 | 2,567 | 0 | 15,533 | **$0.0660525** |

Usage comes from the actual provider responses. Cost uses the repository's `pricing-2026-10-13` ledger, not an independently reconciled provider invoice. Runtime `modelCalls: 2` includes the injected frozen research-selection turn; actual upstream calls were exactly one proposal plus one memory verification.

## Integrity and presentation checks

- Exact captured traveler request retained in the real composer and sent once to `/api/ai/chat-stream`; no non-stream fallback.
- Five ordered draft-day events followed by the final persisted response. No partial plan was observed in repeated database samples during generation and memory verification; conversation remained at its original four entries until completion.
- Draft container had no links and only the cancellation action. No sharing, export or booking action was exercised. This does not replace a separate authorization/endpoint audit of those features.
- Guard accepted the proposal with zero issues. Day 5 declared `departure` and included both `transfer` and `departure` blocks. No guard modifications or automatic block insertion.
- Final SSE canonical plan and database plan matched exactly. Persisted conversation's canonical itinerary fields matched the saved plan; store metadata is additionally present on the top-level plan.
- Accepted chat replaced draft state, and reload restored the accepted response and five day summaries.
- Read-only browser checks at 1200px and 390px verified Overview summaries, each Day's activities and summaries, and chat reload against saved content. Saved plan remained unchanged throughout.
- Map route and five per-day counts matched (one place each). External Google Maps loading was deliberately blocked; interactive map, coordinates on tiles and marker interactions were **not verified**.
- No horizontal body overflow observed in the inspected saved views. Existing development hydration warning remains; composer submission and reload worked in this run.

Initial Map screenshots were taken too soon after route navigation and captured the preceding Day view. Follow-up read-only checks explicitly waited for the selected Map tab and Map region. Do not count the initial screenshots as Map verification.

The Playwright `response.text()` SSE recording misdecoded a typographic apostrophe; persisted text and browser text were correct. Restored response checks use database text, stripping Markdown list markers for rendered comparisons. This was a recorder limitation, not demonstrated application text corruption.

## Evidence-quality limit

The authorized frozen evidence predates the Pass 1 extraction repair. The resulting isolated saved Sunrise Point stop still contains `walkingDistanceMiles: 5.5` inherited from that fixture. This is not evidence that current v11 extraction regressed, nor a quality acceptance of that distance. No evidence was refreshed or silently repaired during this controlled run. The isolated saved trip must not be reused as a production-quality sample.

## Verdict and holds

Stream delivery, unchanged validation, isolated canonical persistence and accepted-view consistency passed in this one run. The full user-visible preview gate remains incomplete because readable first-preview timing was not measured successfully; the fixed composer obscured the initial preview position. Interactive Map verification also remains incomplete.

No additional live call or real disconnection test was run. Next review should address preview discoverability and occlusion using offline captured events, then decide the separately authorized interruption test. Production activation, Passes 4–5, reserve discovery, commits, deployment and historical saved-plan remediation remain held.
