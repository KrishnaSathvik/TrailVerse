# Trailie Zion + Bryce live release-readiness review — 2026-10-13

## Decision

**Hold commit and production activation.** The multi-park repair produced a materially more useful saved trip and the correction-context repair reduced the measured correction payload. The release gate is still incomplete because the live access follow-up included one inaccurate time-zone qualification, the main planning turn still took 103.7 seconds, and no browser session was available for the required desktop/mobile visual inspection.

Reserve discovery remained disabled throughout. No Pass 2 or Pass 3 work was performed.

## Configuration and evidence

- Runtime: `model_first`
- Model: `gpt-6.1-sol`, low reasoning effort
- Isolated database and test account
- Live providers: OpenAI, NPS, and the existing configured research providers
- Reserve discovery: `false`
- Replay capture: `artifacts/trailie-zion-bryce-live-validation-postfix-2026-10-13/cases/zion-bryce/`
- Pre-serialization-fix comparison: `artifacts/trailie-zion-bryce-live-validation-2026-10-13/cases/zion-bryce/`

The configured model pricing is now sourced from the official OpenAI model page and recorded in `server/src/config/trailiePricingRegistry.js`: $2.00 per million input tokens, $0.10 per million cached input tokens, $2.50 per million cache-write tokens, and $10.00 per million output tokens. Every model call in the final replay was priced. Provider costs that are not exposed by their adapters remain unknown and are not treated as zero.

## Traveler outcome

The original three Demo prompts produced and persisted a five-day plan after one correction. Each day had a distinct grounded outing:

1. Pa'rus Trail
2. Riverside Walk
3. Lower Emerald Pool Trail
4. Sunset Point
5. Sunrise Point

This is a material improvement over the earlier Mixed replay, which saved three mapped stops and left Days 3 and 5 without a concrete outing. The final research selection stayed within its budget at 27,900 fact bytes and 31,450 total model-context bytes. It contained official activity evidence from Zion and Bryce and retained official shuttle/access information for both parks.

The plan persisted after both original follow-ups. When asked to add an on-the-way stop to Day 3, Trailie correctly noticed that the transfer to Bryce occurs on Day 4 and asked the traveler which day they meant instead of silently changing the wrong day. The access follow-up correctly described the Zion shuttle dependency, Bryce shuttle optionality, weather/road uncertainty, and flight-time assumptions. It also said the Las Vegas–Utah time difference “changes in winter.” That qualification is inaccurate: Nevada and Utah follow the same daylight-saving transition schedule, so Utah remains one hour ahead of Las Vegas. This keeps traveler-quality acceptance Mixed.

## Correction performance

The live trace showed that correction grounding was reattaching complete `sourceDetails` even though the ordinary model-facing evidence view omits those raw source passages. The correction catalog now uses the same model-facing projection while the guard retains the complete authoritative rows.

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Correction feedback | 45,816 bytes | 17,154 bytes | -62.6% |
| Correction call input | 28,875 tokens | 23,306 tokens | -19.3% |
| Planning-turn latency | 119.5 s | 103.7 s | -13.3% |
| First-three-turn input | 74,799 tokens | 69,766 tokens | -6.7% |
| First-three-turn model cost | $0.249442 | $0.234080 | -6.2% |

The complete five-turn final conversation used 107,837 input tokens, 6,931 output tokens, 187.9 seconds of server time, and $0.338503 in model cost. This is measured model cost, not whole-provider cost. The correction improvement is real, but a planning turn over 100 seconds remains a release concern.

### Where the 103.7 seconds went

| Phase | Time | Share of planning turn |
| --- | ---: | ---: |
| Initial request interpretation and research request | 6.4 s | 6.2% |
| Provider research and finalization | 3.2 s | 3.1% |
| Initial itinerary generation | 50.8 s | 49.0% |
| Memory verification | 5.3 s | 5.1% |
| Corrected itinerary generation | 38.0 s | 36.7% |
| Persistence | 0.02 s | <0.1% |

The two itinerary-generation calls account for 88.8 seconds. Their time-to-response-headers values were 50.7 and 37.9 seconds, almost their complete call durations, so the dominant wait was upstream model generation rather than local parsing, validation, persistence, or provider fan-out. Removing the correction alone would still leave this observed turn near 66 seconds, above the proposed 45-second product target.

The first proposal was rejected only for `day_type_inconsistent`; the correction passed. At capture time, diagnosis stored one proposal record per response, so the accepted correction overwrote the rejected proposal summary and the current artifact cannot identify which original day/type/block combination failed. Diagnosis capture now preserves every rejected and accepted proposal round in order; its focused regression passes. The next live replay will therefore expose the exact day/type/block mismatch. This observability repair does not alter runtime decisions or weaken the day-shape guard.

## Factual follow-up diagnosis

The time-zone qualification originated in answer-only model prose:

- Turn 5 made one model call with 10,432 input tokens and 564 output tokens.
- It made no `read_travel` call and received no new time-zone evidence.
- The saved plan says only that travelers should account for a time-zone change. It does not say the difference changes in winter.
- The inaccurate winter qualification appears only in the final conversational answer.

The itinerary guard validates mutations against authoritative evidence. This follow-up proposed no mutation, so the guard had nothing to inspect. The defect is therefore an unsupported factual elaboration on a non-mutating response, not an NPS extraction, evidence-selection, or saved-plan defect. A destination-specific string filter or a broad prompt addition would hide the example without proving factual grounding. The next repair should be evaluated at the answer-only factual boundary and should have a focused regression before another live call.

## Provider and integration verification

- Both exact official park anchors produced successful NPS activity reads in the live run.
- The frozen multi-park boundary suite covers nine resolved parks against the four-request cap and partial timeout/incomplete-research reporting.
- The live run made no reserve-discovery reads.
- The public share projection was corrected to retain safe canonical day identity fields and to avoid injecting absent empty collections. Owner, share, and export now preserve the same itinerary hash in the lifecycle fixture.
- The guard and authoritative evidence store were unchanged by the correction serialization repair.

Verification results:

- Correction/runtime suites: 67/67 passed.
- NPS provider/source/multi-park suites: 61/61 passed.
- Shared payload and semantic parity: 13/13 passed.
- Stage 14 lifecycle and cross-surface projection: 48/48 passed.
- Focused Trailie UI/component suites: 98/98 passed.
- Multi-round proposal diagnosis capture: 1/1 passed.
- Production Next.js build: passed with the documented Webpack fallback. The default Turbopack build could not start its CSS worker because this execution environment denied local port binding; the Webpack build compiled, typechecked, generated all 95 static pages, and completed successfully.

## Remaining release gates

1. Inspect the Trailie Demo and saved-plan workspace in a real desktop and mobile browser. The configured browser runtime reported no available browser sessions, so this gate could not be completed or honestly substituted with component tests.
2. Decide how to reduce model-generation latency. Provider research, validation, and persistence are not the dominant bottlenecks, and merely eliminating correction would not have met the proposed 45-second target in this run.
3. Use the now-preserved proposal rounds to determine the exact source of `day_type_inconsistent` in the next replay rather than weakening the guard.
4. Prevent or catch unsupported factual embellishments in answer-only logistics follow-ups, demonstrated here by the inaccurate winter time-zone qualification, and rerun that focused follow-up.

Until these gates pass, the validated code should remain uncommitted and production activation should remain held.
