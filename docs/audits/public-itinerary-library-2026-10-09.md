# Public itinerary library — October 9, 2026

## Local result

The library now contains ten actual, reviewed Trailie trips: 47 days and 60 stops. `/itineraries` links to ten stable, public, read-only detail routes. Public fixtures contain no account, private TripPlan, conversation, response, session, token, cost or private hash fields. No push or deployment was performed.

Every concept began in a separate authenticated browser context at `entry=new-trip`, using the exact supplied prompt and the real model-first runtime. The user explicitly authorized creating a local development account and using its admin quota exemption. Normal login was used; existing accounts and production configuration were not changed. Credentials remain in mode-0600 temporary files and were never placed in source, public fixtures or command arguments. No email was sent.

Rejected captures were retained privately. The approved snapshots were copied without editing itinerary data into `artifacts/public-itinerary-selected/`. Matching review files bind to the canonical hash and capture-file SHA-256 digest. The importer validated all ten before writing the local public manifest.

## Product defects found and addressed

- Official identity resolution fetched unrelated activity articles and consumed the resolution deadline. A dedicated places-only path reduced a measured Yellowstone lookup from roughly 8–12 seconds to 2.4 seconds. Independent park fetches now run concurrently; evidence still requires official identities and owned coordinates.
- The model sometimes combined two places into one lookup name. Guidance now resolves individual identities before composing continuous outings. Verified park qualifiers now match on either side while retaining exact underlying names, trusted anchors and geographic checks. Regression tests reject wrong states, missing anchors, trailhead substitutions and combined names.
- Continuous hikes could receive misleading road transfers between their trailhead and hiking destination. Guidance now uses one outing or explicit activity groups, and keeps real transfers separate. Every selected sample received individual route review; this is not a claim that arbitrary future generations cannot make routing mistakes.
- Regional multi-park titles omitted park identities and imagery. Explicit park enumeration restored the included destinations; the Utah sample retains all five park identities.
- Refinement code copied the conversational reply into the saved trip overview, while the patch interface could not update narrative sections. The model-first patch contract now preserves the overview by default and supports explicit overview/guidance updates, including narrative-only edits. Live Yosemite and Utah continuations verified revised overviews and guidance with every day and stop unchanged. A subsequent Utah note-only correction preserved its overview and guidance.
- HTTP success, the right day count and zero missing coordinates do not prove a complete trip: a saved plan can omit entire outings. Import checks reject explicit partial output, and manual review checks the actual card promise, important places, duplicates, route logic and pacing.

## Selected provenance

All paths below are private local capture directories under `artifacts/`, not public routes or dependencies.

| Sample | Approved capture directory |
|---|---|
| Yellowstone — 3 days | `public-itinerary-retry-2` |
| Glacier — 5 days | `public-itinerary-product-fix-2` |
| Utah Mighty 5 — 7 days | `public-itinerary-utah-complete` |
| Alaska — 10 days | `public-itinerary-product-fix` |
| Yosemite — 3 days | `public-itinerary-yosemite-final` |
| Grand Canyon + Page — 4 days | `public-itinerary-product-fix-2` |
| Olympic — 4 days | `public-itinerary-product-fix` |
| Big Bend — weekend | `public-itinerary-product-fix` |
| Washington parks — 7 days | `public-itinerary-product-fix` |
| Acadia — fall weekend | `public-itinerary-product-fix-2` |

Utah and Yosemite include real conversational refinements after their original exact prompts. The capture artifacts retain those follow-ups, the conversation text and transport evidence. No generated itinerary was hand-edited. Card descriptions and tags are editorial presentation fields.

Olympic's coastal finish is explicitly conditional on Highway 101 access; the sample does not claim the reported closure has ended. Alaska deliberately focuses on Denali and Kenai Fjords. Washington includes dedicated transfer days rather than filling them with artificial attractions. Repeated Alaska town/visitor-center anchors have explicit arrival, bus, cruise or departure purposes.

## Public implementation

- Responsive catalog: one column on mobile, two on tablet, three at large widths, within the shared page shell; images, duration/season filters and concise descriptions.
- Stable detail routes reuse `TripWorkspaceView`, the canonical itinerary renderer and map. Public mode suppresses editor/account actions and adds overview, imagery and grounded guidance.
- View links open the frozen sample. Personalization links use `/plan-ai?entry=new-trip&ask=...`, carrying no private trip identifier.
- Nested allowlists retain canonical coordinates, route edges, access conditions, overnight bases, requirements and notes. Private evidence references become consistent public-local reference labels. Destination/place identities remain intact.
- The public manifest is recursively frozen. Import rejects changes to existing snapshots; content revisions require a new versioned slug. Sitemap entries come only from approved fixtures.
- The capture tool supports fresh runs and explicit continuation of a previously captured conversation, verifies the original prompt and trip identity, and keeps all capture artifacts private. It waits for a ready composer and tolerates a restoration remount without intentionally resending a submitted request.

## Validation

- 55 focused backend tests passed across official places, identity equivalence, experience routing, narrative patches, hard constraints and accepted-stop preservation. These pure unit suites ran with outbound provider access denied and without the unrelated MongoMemoryServer setup.
- 14 focused frontend tests passed after population: export privacy, map/route parity, invalid capture rejection, public action suppression, filtering, independent new-trip links, view switching and unknown-slug handling.
- All ten raw-to-public projections passed comparisons of actual map coordinates/mapping, route labels and durations, notes, timing, day labels and overnight bases. Private identifiers and hashes were checked against exported content.
- The final anonymous browser pass passed all 44 page/width combinations at 390, 768, 1440 and 1920 pixels: HTTP 200, no horizontal overflow, loaded images, valid new-trip links, day selection, all mapped stops represented individually or in clusters, loaded map tiles, day-specific pins, route labels, real marker selection and no private trip/conversation/generation requests. Machine-readable result: `artifacts/public-itinerary-browser-checks/results.json` (10 samples, 44 pages, zero failures).
- Local headless Chrome reports a vector-to-raster Maps fallback. The capture scrolls the map into view and waits for markers, clusters, loaded tiles and the camera transition. The warning is a headless rendering fallback, not a missing-key or missing-coordinate failure. Settled mobile screenshots and actual marker selection were visually/functionally verified.
- Targeted ESLint and script syntax checks passed, including the final capture/browser tooling.
- Existing unrelated workspace changes were preserved. No production build, push or deployment was performed.

## Reproduce

From `next-frontend`, configure `ITINERARY_EMAIL` and `ITINERARY_SECRET_FILE` privately, then run the capture script. `ITINERARY_SLUG` selects concepts; `ITINERARY_CAPTURE_DIR` retains separate batches. Optional `ITINERARY_FOLLOWUP_FILE` supplies real follow-ups, and `ITINERARY_RESUME_DIR` continues the matching previously captured trip.

```sh
node scripts/capture-public-itineraries.mjs
ITINERARY_CAPTURE_DIR=../artifacts/public-itinerary-selected node scripts/import-public-itineraries.mjs
node scripts/check-public-itineraries.mjs
```

The importer defaults to validation only. `--apply` writes only the local fixture manifest. Public pages make no trip, conversation or generation requests. Screenshots and machine-readable browser results are in `artifacts/public-itinerary-browser-checks/`.
