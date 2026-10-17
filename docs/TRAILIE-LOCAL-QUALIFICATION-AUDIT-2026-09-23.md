# Trailie local GPT-6 qualification — final audit

**Audit date:** September 23, 2026  
**Decision:** **NOT READY FOR PRODUCTION CUTOVER WORK**  
**Scope:** Local API conversations, persisted trip state, model routing, and focused failure simulations.

## Executive result

Trailie generally answered simple questions, narrowed discovery choices, and pushed back on unrealistic trips. Some planning and bounded edits worked well. However, accessibility-sensitive planning, longer constraint-heavy conversations, city itineraries, and closure adaptation remained unreliable. These failures prevent a production-readiness recommendation.

Eight narrow implementation defects were addressed. The exposure-scope correction fixed a specific mismatch, but its full traveler conversation still failed for other reasons. The final smoke passed **8 of 10** cases: **closure adaptation and Seattle planning failed**.

| Measure | Result |
|---|---:|
| Requested scenario groups tested | 39 |
| Turns in the initial broad pass | 66 |
| Total turns, including preflight, rechecks, injected failure, and final smoke | 100 |
| Scenarios judged clean on the initial pass | 23 / 39 |
| Final smoke outcomes | 8 pass / 2 fail |
| OpenAI model calls | 163 |
| Estimated OpenAI token cost | $4.65 |

“Clean” is a qualitative first-pass assessment combining useful travel behavior with successful execution and state handling; HTTP 200 or runtime `complete` alone did not count as a behavioral pass. The 23/39 figure is **not** a complete post-fix rerun score. Failing cases and nearby cases were rechecked, followed by the final smoke.

## Boundaries and method

- Production was not changed or deployed. Production Claude configuration was not changed.
- The GPT-6 stack stayed frozen: Luna low for bounded helpers; Sol low for conversation and discovery; Sol medium for planning and edits; Astra medium for final escalation after validation failures.
- Live conversations used the local application API with disposable MongoDB state. The temporary qualification harness was removed afterward.
- The harness raised the guest turn allowance in its own process to permit the ten-turn conversation; the application's guest quota configuration was not changed.
- Saved sessions, canonical itineraries, changed days, returned hashes, and model dispatches were captured for review.
- Failure coverage combined an injected model outage during a real disposable trip edit with focused offline evidence, coordinate, route, and logistics tests. Those offline checks were not counted as live conversations.
- This was **API and persisted-state qualification**, not a browser/UI rendering certification. Google API authorization failures limited local route and coordinate verification.

## Conversation coverage

The initial pass covered all 30 individually specified A–F cases: simple answers, comparisons, discovery, non-park travel, realistic itineraries, and unrealistic requests. Nine additional scenario groups covered Zion continuity, live adaptation, hypothetical versus committed bookings, preference propagation, family travel, accessibility, photography, driving tolerance, and current information.

| Area | Observed result |
|---|---|
| Simple answers | Generally concise and direct. An Acadia foliage-timing error did not repeat; some answers hedged instead of supplying useful stable tradeoffs. |
| Comparison and discovery | Usually chose or narrowed options. Some comparisons were thin or discussed evidence coverage instead of the travel decision. |
| Non-park travel | Chicago, Santa Fe, Highway 1, and regional advice were useful. Seattle's structured itinerary repeatedly collapsed into generic city-level stops. |
| Unrealistic requests | Useful pushback and smaller alternatives. A false driving prohibition in the Colorado case was fixed and rechecked. |
| Zion continuity | Dates and preferences persisted, but repeated constraint updates and later edits failed. Stored facts did not reliably translate into a usable updated plan. |
| Live adaptation | Closure and exhaustion updates succeeded in one thread. Rain began updating the actual day after a narrow fix. Closure adaptation still failed in the final smoke. |
| Bookings | Hypotheticals did not commit a base. Explicit booking replacement initially failed to persist and was fixed. Repeated Springdale disambiguation remained awkward. |
| Family | The explicit family-day update changed the saved day. A reference to parents joining for the last two days initially shrank the trip; the duration fix preserved four days on recheck. |
| Accessibility | **Failed.** Repair-added stops included hiking instructions despite a stored wheelchair constraint and an introduction promising not to assume hiking. |
| Photography | The three-day photography conversation used sunrise/sunset timing, and its wildlife edit changed only day two. A separate four-day response had a narrative/plan mismatch. |
| Driving tolerance | The Las Vegas plan used separate nearby desert outings rather than a large multi-park loop. |
| Current information | The answer disclosed that this week's conditions could not be verified and still gave a useful official-check path. |

## Implementation changes and verification

| Defect | Narrow change | Verification and limit |
|---|---|---|
| Null trip date became January 1, 1970 in astronomy evidence | Reject null/empty date input before constructing a JavaScript date | Focused tests passed; the undated live recheck stopped dispatching astronomy calculations. |
| “I don't want to drive much” became a total driving ban | Exclude qualified driving limits from the prohibition match | Colorado recheck no longer claimed driving was forbidden; car-free Chicago still preserved its prohibition. |
| Nonempty, truncated prose was accepted as complete | Reject incomplete prose through the existing repair path | Regression reproduced acceptance before the fix and passed afterward; booking recheck returned a complete acknowledgment. |
| Exposure edits could not touch all stops checked by validation | Use the same exposure-relevance rule when identifying affected days | Scope regressions passed. **Partial behavioral resolution:** the live recheck still failed on coverage/eligibility. |
| “Last two days” overwrote total trip duration | Treat ordinal subsets as references within a trip, not total duration | Four-day parent-arrival recheck retained four days; ordinary duration tests passed. |
| “Reservation” matched `rv` and invented RV accommodation | Add word boundaries to accommodation matching | Cancellation recheck no longer created an RV stay; related accommodation tests passed. |
| Confirmed relocation left the previous booked base saved | Commit explicit relocation of an already-confirmed lodging booking | Five-turn recheck kept hypothetical alternatives uncommitted and replaced Springdale with St. George on explicit confirmation. |
| “It's raining tomorrow” missed refinement recognition | Recognize inflected weather terms alongside their base forms | Rain recheck changed saved day two to an afternoon start; subsequent exhaustion edit again changed only day two. Weather questions remained non-mutating in focused tests. |

Runtime changes are in `server/src/services/providers/astronomyEvidenceProvider.js`, `server/src/services/trailieExecutionService.js`, `server/src/services/tripMutationCommit.js`, and the relevant traveler-state, duration, constraint, itinerary-impact, and refinement utilities under `server/src/utils/`.

Focused checks completed successfully:

| Check group | Tests passed |
|---|---:|
| Astronomy | 5 |
| Driving constraints | 42 |
| Evidence, route, logistics, and model failure simulations | 68 |
| Exposure scope, bounded edits, and execution/truncation | 83 |
| Duration subsets and duration advice | 16 |
| Booking and accommodation | 47 |
| Weather refinement and bounded scope | 30 |

These groups overlap; their counts must not be added as a unique-test total. Initial sandbox attempts could not open local MongoDB ports; successful runs used disposable local MongoDB outside that restriction with outbound model providers disabled for the offline checks.

## Saved-state and failure findings

- No returned itinerary-hash mismatch with the corresponding saved canonical plan was observed in the broad pass.
- Successful closure, exhaustion, family, and photography edits changed the expected days. The final smoke's explicit Zion edit changed only day two.
- An injected model outage during an edit preserved the prior canonical plan and hash. The response explicitly said the change had not been applied.
- Some preference/booking turns produced planning prose without changing the canonical itinerary. Therefore, successful fact storage and matching hashes were **not sufficient proof of response/plan consistency**.
- Full map, route, warning, and logistics artifact revision consistency was not certified. Optional artifacts were often absent, Google requests were denied locally, and browser rendering was not exercised.

## Remaining cutover blockers

1. **Accessibility through repair.** A wheelchair-oriented request received repair-added hiking stops, including Lower Emerald Pool Trail and Taylor Creek Trail. A general access disclaimer does not make those instructions an acceptable wheelchair plan.
2. **Constraint propagation and continuity.** Exposure preferences persisted, but updates and later day edits repeatedly failed. Some answers described proposed plans beside an unchanged saved itinerary.
3. **Reliable closure adaptation.** One closure thread successfully changed the trip; the final smoke's closure edit failed. This is inconsistent behavior, not a qualified capability.
4. **Useful city itineraries.** Seattle repeatedly produced stops named only “Seattle, Washington, United States,” or failed validation. City-center pins and generic walks do not fulfill a three-day Seattle planning request.
5. **Narrative and itinerary agreement.** One Grand Teton introduction described a waterfall/overlook outing absent from the saved day cards. Several plans also used interpretive-sign titles as traveler-facing stops.
6. **Escalation frequency.** Constraint-heavy threads repeatedly exhausted Sol attempts and escalated. The exposure-scope fix did not eliminate the broader validation failures.
7. **Map and route qualification.** Local Google API requests were denied by authorization restrictions. End-to-end rendering and route coverage remain unqualified.

## Model usage and cost

| Model | Calls |
|---|---:|
| GPT-6 Luna | 14 |
| GPT-6 Sol | 130 |
| GPT-6 Astra | 19 |
| **Total** | **163** |

Telemetry recorded **33 same-model retry attempts** and **23 escalation attempts**. These are routing events, not additional counts to add to the 163 calls; dispatch totals also include helper calls. Astra accounted for roughly **12%** of model calls, concentrated in failing constraint-heavy conversations and reproductions.

The **$4.65** estimate uses the local harness's token accounting and configured prices. It includes preflight, the broad pass, live reproductions/rechecks, and final smoke. It is not a billing reconciliation and excludes external evidence-provider costs.

## Final smoke — once after the implementation fixes

| # | Case | Outcome | Evidence |
|---|---|---|---|
| 1 | Can I drive to Brooks Falls? | Pass | Direct no-road-access answer, without an itinerary. |
| 2 | Acadia or Shenandoah for fall colors? | Pass | Recommendation and coastal/mountain tradeoff. |
| 3 | November desert discovery | Pass | Narrowed choices and gave a preferred option. |
| 4 | Relaxed Zion, Springdale, no exposure, sunrise | Pass | Created a canonical three-day plan shaped by the stated priorities. |
| 5 | Redo Zion day two and make it easier | Pass | Saved change affected only day two. |
| 6 | Canyon road closure | **Fail** | Could not apply the edit; preserved the previous plan and acknowledged failure. |
| 7 | Yellowstone, Grand Teton, Glacier, Banff in five days | Pass | Rejected the pacing and proposed a smaller trip. |
| 8 | Three days in Seattle | **Fail** | Generic city-level stops rather than a meaningful Seattle itinerary. |
| 9 | Brooks Falls day trip from Anchorage | Pass | Flight-based logistics outline, weather caveat, and a relevant date question; not a bookable schedule. |
| 10 | Photography-focused Grand Teton trip | Pass | Concrete photography priorities and a relevant duration/season question; the separate three-day photography thread tested saved planning and editing. |

## Evidence locations

Raw evidence remains in temporary local files and may be removed by operating-system cleanup:

- `/tmp/trailie-qualification.jsonl` — initial 39-scenario, 66-turn pass, including responses and saved sessions.
- `/tmp/trailie-qualification.log` — broad-pass execution log.
- `/tmp/trailie-qualification-final-smoke.jsonl` — final ten smoke turns.
- `/tmp/trailie-qualification-model-failure.jsonl` — injected model-outage conversation.
- `/tmp/trailie-qualification-*-fixed.jsonl`, `*-recheck.jsonl`, and `*-repro.jsonl` — targeted reproductions and rechecks.
- `/tmp/trailie-qualification-*.log` — focused test and live-run logs.

This document is the durable audit summary. It does not certify production readiness, browser rendering, or full derived-artifact consistency. Production-cutover work should wait until the remaining blockers pass targeted live rechecks and the failed smoke cases succeed.
