# Trailie local release baseline — 2026-10-15

Status: **local preparation complete; not pushed or deployed**. Architecture and travel policy remain unchanged in this preparation pass. This is a scoped demo/evidence checkpoint, not a claim that all other working-tree development is committed or production-ready.

## Frozen conversations

The public baseline is `next-frontend/src/data/trailieDemoPlayback.json`: five conversations, three turns each. Preserve the first passing run. All five passed on attempt 1, with zero reruns and $0.88931 measured model spend. Do not regenerate for editorial preferences.

| Conversation | Recorded behavior |
|---|---|
| Acadia / Shenandoah | Recommendation changes with crowd preference; four-day plan |
| Zion / Bryce | Pushback on overloaded trip; five-day plan; scoped Day 3 patch |
| Yellowstone | Photography plan; advice without mutation; selected early morning retained |
| St. John | Beach plan; Cinnamon Bay and Peace Hill pinned; scoped Day 2 replacement; snorkeling advice without mutation |
| Chicago | Q&A without itinerary; car-free city plan with Art Institute pin; museum-day simplification |

The [machine-readable baseline](trailie-baseline-2026-10-15.json) records the fixture hash, all 15 exact question strings and response hashes, per-turn HTTP latency, checks, and raw capture hashes. Assistant wording is preserved in the fixture. The baseline hash is also locked by `trailieDemoPlayback.test.js`.

## Separate scope and booking evidence

These are **not part of the five public demo conversations**. Full verbatim refusal answers and source checksums are preserved in the baseline JSON without account IDs or credentials.

| Check | Recording | Result |
|---|---|---|
| Tokyo, first independent conversation | `artifacts/private/closeout-smoke/turn-04-attempt-1.json` | Explicit U.S. scope refusal; no itinerary or mutation |
| Tokyo, second independent conversation | `artifacts/private/closeout-smoke/turn-05-attempt-1.json` | Explicit U.S. scope refusal; no itinerary or mutation |
| Hotel booking | `artifacts/private/closeout-smoke/turn-06-attempt-1.json` | Cannot book or check live availability; no itinerary or mutation |
| Restaurant guarantee | `artifacts/private/release-refusal-2026-10-15/restaurant-guarantee/accepted.json` | Cannot guarantee tables, reserve, or check live availability; no tool call, itinerary, or mutation |

The restaurant check was the only new model turn in this preparation pass: **$0.01208**, 4.474 seconds HTTP latency, first run, $0.10 ceiling. Combined with the demo capture: **$0.90139**. Prior October 14 smoke costs are separate. These costs measure model tokens, not map/provider charges.

The two booking checks cover different requests (hotel booking and restaurant guarantees); they are not repeated runs of one identical prompt. The refusal examples establish observed behavior, not a guarantee for all future wording.

### Timing and transport caveat

Older closeout recordings explicitly say `non_stream_chat_after_sse_finalize_hang`. Their harness times were 200.561, 192.462, and 197.731 seconds for Tokyo/Tokyo/hotel, while recorded runtime times were 5.857, 3.774, and 3.830 seconds. Preserve both measurements; do not present these as successful low-latency streaming tests.

The 15-turn demo capture used authenticated terminal HTTP responses and a disposable local MongoDB. Per-turn latency is in the baseline JSON; it is not encoded by playback animation timing. Live streaming/production transport performance remains a separate release concern, not proven by this capture.

## Verification receipts

| Evidence | Result | Scope |
|---|---|---|
| Auth suite and manual lifecycle | Previously passed: 29 auth tests plus standalone lifecycle smoke | Signup → login → reset → profile edit → login; projected user save preserves password hash |
| Last full server suite | Previously passed: 7,554 tests; 22 skipped; 540 suites passed, 1 skipped; exit 0 | October 14 pin/reply-polish state, not rerun during this docs pass |
| Frontend demo/export/presentation tests | 128 passed in 8 files; exit 0 | Final captured fixture and manual Next question |
| One-Brain gate | Passed; 284 test executions including repeated suites; exit 0 | Final captured fixture |
| Local Chrome / Playwright | All 5 scenarios at 1440px and 390px | Next question, trip cards, workspace Overview/Day/Map; no horizontal overflow or runtime errors |
| Marker interaction | Passed | Art Institute marker opens selected-stop details |

Prior auth/P1 details: [auth verification](../audits/local-auth-and-server-tests-2026-10-14.md), [pin and wording verification](../audits/trailie-local-pin-and-reply-polish-2026-10-14.md).

Browser fallback was explicitly approved after the in-app browser reported no connection. Screenshots, browser report, test logs, and scripts have been copied out of `/tmp` to `artifacts/private/release-baseline-2026-10-15/`, with `evidence-checksums.json`. These raw local receipts are gitignored; the sanitized baseline JSON and this note are versioned. Browser claims are agent-run test results, not independent human sign-off. Safari and Firefox were not tested.

Verify the frozen recordings without provider calls:

```sh
node scripts/verify-trailie-release-baseline.mjs
```

## Maps compatibility follow-up

Observed warning: `<gmp-advanced-marker>: Please use addEventListener with 'gmp-' events instead of addListener.`

Google's [Advanced Markers reference](https://developers.google.com/maps/documentation/javascript/reference/advanced-markers) now marks `AdvancedMarkerElement.addListener` and `click` deprecated; the replacement is `addEventListener('gmp-click', handler)`.

Owner: frontend map adapter. Affected calls: ordinary and clustered marker clicks in `next-frontend/src/components/itinerary/ItineraryMapView.jsx`. Follow-up should update those two bindings and the marker test mock, then verify individual selection, cluster expansion, keyboard activation, and cleanup. Do not replace the map object's unrelated `idle` listener.

Current disposition: **tracked compatibility debt**, not a demonstrated interaction failure. The Art Institute pin click passed despite the warning. No map behavior change was made in this baseline preparation.

## Release boundary

No deployment or push is authorized or performed. The local commit includes the demo baseline, its tests/capture tools, and release evidence/docs; unrelated working-tree changes remain outside it. Do not deploy this checkpoint in isolation and assume it contains all current renderer/runtime/auth changes.

Next release decision: choose the complete code revision to ship, validate its production configuration and streaming transport, and authorize deployment explicitly. No additional broad audit, policy rewrite, or planning-engine redesign is part of this baseline.
