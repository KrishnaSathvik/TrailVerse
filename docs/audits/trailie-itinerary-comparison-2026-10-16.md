# Trailie itinerary comparison — 2026-10-16

## Scope and result

All 20 authorized paid requests completed: five fresh two-turn conversations on production and five on current local, using the exact prompts. No client retries or reruns. Run time: 2026-10-16T22:04:26.194Z–2026-10-16T22:19:19.818Z, approximately 14 minutes 54 seconds.

**Local generally gives a more realistic, restrained trip and better scoped revisions, but this is not a clean five-scenario pass.** Most importantly, the local Zion/Bryce flight follow-up gives better advice but does not update the saved itinerary. Its structured route data also has gaps that validation success does not resolve. Production has useful concrete suggestions, but overpacked days, unsupported accessibility claims and prose-only revisions.

This is a qualitative single-run review, not a release approval or architecture audit.

## Timing, calls and cost

| Metric | Production | Current local |
|---|---:|---:|
| Completed requests | 10 | 10 |
| Median first readable text, all turns | 31.04 s | 36.66 s |
| Median final response, all turns | 41.02 s | 36.66 s |
| Median initial-plan completion | 79.95 s | 63.68 s |
| Median follow-up completion | 11.53 s | 16.45 s |
| Mean final response, all turns | 50.46 s | 38.46 s |
| Mean chat answer length, whitespace words | 392.5 | 148.4 |
| Responses returning structured itinerary | 3 | 8 |
| Observed paid model calls | Unknown | 23 |
| Estimated model-only cost | Unknown | $0.663016 |

Local's runtime modelCalls counters sum to 18; actual SDK calls total 23, including five additional verification calls on the initial plans. The per-turn table counts actual calls, not just the runtime loop. All observed local calls use gpt-6.1-sol; production reports claude-sonnet-5. Production call counts and token usage are not exposed.

Local cost is calculated from returned usage and the repository pricing registry, not a provider invoice. Some research/geocoding costs are unknown, so this is not the full local bill or total test spend. Earlier comparisons are excluded. HTTP 200 and a terminal event occurred on all requests, but that alone does not establish itinerary quality.

| Prompt number | Production readable / final seconds | Local readable / final seconds | Returned plan: prod / local | Local actual model calls |
|---|---:|---:|---|---:|
| 1 | 36.87 / 48.27 | 49.78 / 49.78 | false / true | 3 |
| 2 | 1.82 / 8.47 | 20.25 / 20.25 | false / true | 2 |
| 3 | 46.03 / 79.95 | 66.04 / 66.04 | true / true | 3 |
| 4 | 5.78 / 10.34 | 12.71 / 12.71 | false / true | 1 |
| 5 | 35.30 / 76.74 | 63.68 / 63.68 | false / true | 3 |
| 6 | 23.41 / 28.66 | 16.45 / 16.45 | false / false | 2 |
| 7 | 39.94 / 98.07 | 68.30 / 68.30 | true / true | 3 |
| 8 | 26.78 / 33.77 | 23.53 / 23.53 | false / true | 2 |
| 9 | 61.55 / 108.85 | 59.10 / 59.10 | true / true | 3 |
| 10 | 7.04 / 11.53 | 4.78 / 4.78 | false / false | 1 |

## Scenario review

### 1. Chicago — local better matches relaxed pacing; production offers more neighborhood variety

Production's initial plan combines Art Institute, Millennium Park, Riverwalk and West Loop on Day 1, then Field Museum plus Pilsen or Wicker Park on Day 2. It gives concrete food/neighborhood options, but adds a distracting NPS/fee-free-day suggestion and a signup upsell. Its follow-up replaces the museum with Pilsen, Wicker Park/Bucktown and optional Logan Square, which is more variety but more cross-town travel than a relaxed neighborhood day. It says Day 1 is unchanged; neither response returns a structured itinerary, so preservation is only a prose claim.

Local uses Art Institute + Millennium Park on Day 1 and National Museum of Mexican Art + 5 Rabanitos + Pilsen wandering on Day 2, with breaks and November-weather flexibility. Follow-up removes the second museum and preserves **the complete Day 1 object exactly**. Pilsen remains an unmapped neighborhood experience rather than a fabricated point.

Limitations: local lodging is suggested only in prose, not selected; specific transit connections remain dependent on hotel location. Its two short intra-area edges are labeled transit (249 m and 362 m), despite being natural walks. A verified route label is not proof of appropriate transport-mode semantics. Optional Chicago Cultural Center appears in a downtime note rather than a mapped stop.

### 2. Acadia — local clearly lighter; production's revision still asks for substantial walking

Production initially has Bar Harbor/Cadillac, then Sand Beach + Ocean Path to Otter Point + full Jordan Pond loop + Jesup, then Ship Harbor/Bass Harbor. The second day is overpacked for photography and easy walks. Its follow-up drops only Jesup, keeping coastal walking and the 3.3-mile Jordan Pond circuit before an allegedly free afternoon. No updated structured itinerary is returned.

Local groups the coast on Day 1, Jordan Pond + Jesup on Day 2, Cadillac + town waterfront on Day 3, all based near Bar Harbor. Follow-up removes Jesup and leaves the afternoon explicitly free. **Days 1 and 3 are deeply identical before/after.** The initial plan offers closure contingencies instead of assuming all trails are usable.

Production calls Jordan Pond a flat gravel loop; NPS describes rocky sections and boulder crossings, so that description understates footing demands. [NPS Jordan Pond guidance](https://home.nps.gov/thingstodo/hike-jordan-pond-loop-with-island-explorer-bus.htm). Production also frames Cadillac reservations mainly as a sunrise issue, although NPS offers both sunrise and daytime reservations. [NPS reservations](https://www.nps.gov/acad/planyourvisit/vehicle_reservations.htm).

Production's Ocean Path closure explanation and routing to Otter Point are internally questionable; the exact closure extent for the travel dates was not established by this test. Do not classify all closure claims as fabricated without dated evidence.

### 3. Zion/Bryce — better local flight advice, but saved-plan mismatch

Production initially assigns Springdale nights 1–2 and Bryce nights 3–4, returning to Vegas on Day 5. It assumes current closures for an undated trip and includes Queens Garden despite the easy-hike preference. NPS rates Queens Garden moderate, even though it is the least difficult descent below the rim. [NPS trailhead](https://www.nps.gov/places/000/queens-garden-trailhead.htm).

After the 11 AM flight follow-up, production suggests returning to Springdale for night 4 and leaving by 7:30 AM. That still requires a long flight-day drive, and its buffer explanation omits explicit time-zone, rental-return and terminal-transfer accounting. This is weaker risk management than a Vegas overnight; it is not proof that the flight is impossible. No structured itinerary is returned on either production turn.

Local initially allocates three Springdale nights and one Bryce night, with arrival/return inside the five days. It explicitly assumes an evening departure and flags an early flight as requiring a Las Vegas overnight. Follow-up correctly recommends Springdale nights 1–3, Bryce as a short Day 4 visit, then Vegas night 4, with a driving-heavy-day tradeoff and separate airport/car-return allowance.

**However, local does not propose or commit any trip mutation on this follow-up.** The response itinerary is null; all five persisted days remain exactly unchanged. Day 4 still sleeps in Bryce, and Day 5 still assumes an evening flight. Because the prompt asks whether the plan works or should change, advice-only is a defensible conversational interpretation, but it does not satisfy a saved-plan adjustment expectation. Do not report this as a successfully revised TripPlan.

Additional local limitations: the major Vegas–Springdale–Bryce–Vegas transfers are narrative blocks without verified route edges/times. The Riverside Walk–Pa'rus edge is marked driving/verified while the day narrative calls for shuttle use during shuttle season. Operational access remains unknown in that edge. Grounded stop coordinates do not establish access-mode consistency or end-to-end flight feasibility.

### 4. Yellowstone — local revision genuinely reduces scope, with a grounding limitation

Production packs Day 2 with Hayden Valley, Mud Volcano, two canyon viewpoints and Norris. It describes the whole trip as nothing steep or long. Its revision removes Norris but retains the other circuit and claims one-way/no-backtracking travel to West Yellowstone without demonstrating the return route or reduced mileage. Mud Volcano's full circuit includes a steep grade, contrary to blanket knee-friendly language. [NPS Mud Volcano](https://www.nps.gov/thingstodo/yell-mud-volcano-trails.htm?nt=1). No updated structured plan is returned.

Local initially separates geysers, Lamar wildlife and canyon viewpoints. It acknowledges Lamar is a long drive from West Yellowstone, but choosing that distant valley is still debatable for these parents. On follow-up it replaces Lamar with a flexible Madison River corridor outing, lunch and a free afternoon. It explains that wolf-watching opportunities are sacrificed rather than claiming all wildlife highlights are equivalent. **Days 1 and 3 remain deeply identical.**

The new Day 2 has **zero mapped stops** because Madison Valley could not be reliably resolved. Local discloses that clearly and saves a flexible experience instead. This is an honest grounding fallback, not a fully navigable replacement itinerary. Drive-time reduction is a qualitative geographic judgment, not a measured complete route total.

### 5. Olympic — both recognize the existing one-change structure

Both initially choose Port Angeles nights 1–2 and Forks nights 3–4. Both correctly say the follow-up already matches one hotel change; a mutation is unnecessary here.

Production gives richer named-hike options (Hurricane Hill, Marymere, Sol Duc, Hall of Mosses), but adds a Seattle flight/arrival assumption and a busy mountain-plus-lake Day 2. The follow-up newly says morning departure on Day 5 although the initial plan includes beaches and afternoon departure. Its claim that each day's driving stays under an hour contradicts its own 45-minute one-way mountain approach and 75-minute base transfer.

Production's flat, wheelchair-accessible description of Hall of Mosses is materially misleading: NPS documents steps and steep grades. [NPS detailed accessibility](https://www.nps.gov/places/000/hall-of-mosses-trailhead.htm). It also names the Hurricane Ridge Visitor Center without acknowledging the former building burned in 2023; a visitor contact station is not the same facility. [NPS former center](https://www.nps.gov/places/site-of-former-hurricane-ridge-visitor-center.htm), [NPS current visitor facilities](https://home.nps.gov/olym/planyourvisit/visitorcenters.htm).

Local gives each day one principal area: Hurricane Ridge, Lake Crescent, relocate/Rialto, Hoh, Ruby Beach. It explicitly assumes arrival before Day 1 and no long return journey on Day 5, and asks for clarification if Seattle travel must fit inside the five days. That is calmer and clearer, but users may find one broadly described destination per day too sparse. Local also leaves actual date-specific road access unconfirmed. Production's current closure claims and local's conditional routes cannot establish which roads will be open for an unspecified August.

Local leaves all five saved days unchanged on follow-up and sensibly suggests a fifth night at the same Forks hotel if needed. This is appropriate non-mutation, unlike an asserted saved flight-plan correction.

## Grounding and exact changes

All mapped stops in the five initial local plans carry resolved identities and coordinates; many have NPS or commercial source references. This is observed provenance, not an independent audit of every coordinate. Base/arrival transfers are often ungrounded narrative blocks; all Olympic travelEdges arrays are empty because each day has one principal mapped stop. Production's three returned structures do not expose equivalent stop-resolution fields in this capture; canonical guarantees and persistence are unknown, not disproven.

Local accepted five initial proposals plus Chicago, Acadia and Yellowstone patches. Acadia/Yellowstone initial telemetry includes memory_authority_unsupported despite final accepted plans; acceptance does not mean every proposed memory field was accepted. There were eight read_travel invocations across the ten local turns. Provider work also occurs during grounding; those eight tool calls are not a count of external API requests.

Complete local day-object equality:
- Chicago: Day 1 identical; Day 2 changed.
- Acadia: Days 1/3 identical; Day 2 changed.
- Zion/Bryce: all five identical; advice only.
- Yellowstone: Days 1/3 identical; Day 2 changed.
- Olympic: all five identical; no change needed.

Exact field-level before/after changes are in [diffs JSON](trailie-itinerary-comparison-2026-10-16-diffs.json). Full returned structures and latest persisted local structures are in [plans JSON](trailie-itinerary-comparison-2026-10-16-plans.json). These retain notes, day blocks, route edges, source references and provenance rather than reducing plans to a pass/fail score.

## Method and limitations

- One fresh anonymous session per scenario/environment; each follow-up uses the same identity and prior user/assistant message history. No injected hints, word limits, preferences or editScope. Local loads its persisted canonical snapshot.
- Environments alternate order by scenario; each two-turn conversation runs together. One sample per prompt, no reruns.
- Experimental answer streaming and draft preview remain off. Local uses the real model-first route/providers with a disposable local Mongo replica set, never the configured production database. Review enqueue/worker disabled.
- Local HEAD 6392da99 plus existing uncommitted working-tree changes; production is the live Render service. The earlier comparison observed production cffedbef; its revision was not re-read for this run, so it is not independently pinned here.
- Direct SSE endpoint timing, not browser paint or frontend proxy timing. First-readable heuristic requires at least 24 characters and five words after basic Markdown stripping. Progress messages are not readable answers. Local content arrives at final delivery; earlier production chunks do not establish underlying token-generation timing.
- Different models, runtime revisions, database and network paths; not an isolated model or streaming A/B experiment. Grounding/research cost, production model-call count and total cost remain unknown where not emitted.
- Spot-checks above address concrete claims, not every weather/closure/fee/hour assertion. Current conditions cannot validate unspecified future travel dates.
- No app code edits, deployment, commits, push or release-candidate changes. Only temporary capture tooling and report artifacts were added.

## Artifacts and recommendation

[All 20 complete answers and exact prompts](trailie-itinerary-comparison-2026-10-16-responses.md).

Raw SSE events, terminal payloads, local session snapshots, usage and telemetry remain in the restricted local file /private/tmp/trailie-itinerary-comparison-20261016/results.json. The runner is /private/tmp/trailie-itinerary-comparison.cjs; console log is /private/tmp/trailie-itinerary-comparison-console.log. Raw data includes generated guest-session identifiers; do not publish it unredacted. Temporary files may be cleaned by the OS; the durable report/plan/diff artifacts omit those identifiers.

Keep the experimental flag off. The strongest local improvements are calmer pacing, concise chat summaries and exact untouched-day preservation. The clearest remaining product issue is the flight-advice/saved-itinerary divergence, followed by route/access-mode consistency and incomplete base-transfer grounding. Treat those as separately scoped follow-up work, not grounds to rerun this paid comparison or automatically deploy.

