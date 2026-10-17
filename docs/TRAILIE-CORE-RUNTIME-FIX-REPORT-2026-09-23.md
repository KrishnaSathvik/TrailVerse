# Trailie core runtime fixes — audit report

**Date:** September 23, 2026  
**Verdict:** Qualification incomplete; not ready for production cutover.  
**Model stack:** Unchanged. No deployment or production database changes.

## Result

The final source state passed **161 focused offline tests across 10 suites**, with zero live provider dispatches in the test runner. The requested **four conversations × three repetitions** have not passed. The original live run stopped on **`credit_balance_exhausted` / `insufficient_quota`**. After the user added funds, a fresh live retry confirmed that credit was available; the resumed core run exposed remaining validation failures and a provider HTTP 504. The ten-case smoke was not rerun.

Before the credit interruption, two wheelchair repetitions saved non-hiking plans and another encountered duplicate-experience and coverage failures. Those earlier observations did not qualify the final source state. The funded retry below exercises the subsequent continuity changes and confirms that qualification still fails.

## Funded retry — September 23 local time / September 24 UTC

**Credit restored; qualification failed.** One wheelchair check and one complete four-conversation run finished against disposable local MongoDB. No runtime source or model-stack changes were made during this retry. Two further repetitions and the smoke test were held because the first repetition already failed the required gate.

The standalone wheelchair check completed after two Sol validation failures and an Astra success. The full core run returned **13 complete and 3 failed API responses across 16 turns**. These are response statuses, not 13 behavioral passes.

| Case | Funded observation | Assessment |
|---|---|---|
| Wheelchair Zion | Standalone check saved a facility-based plan. In the full run, repair added `Zion Human History Museum` with `type: hike` and a note to take an outdoor walk. The wheelchair fact remained saved. | Not a clean accessibility pass: facility access evidence does not establish every outdoor approach. Repair activity typing and access scope need review. |
| Constraint-heavy continuity | Initial four-day generation failed after unresolved stop identity and a provider HTTP 504. The exposure-constraint turn and hotel update failed validation. Later day-two/day-three edits changed only the requested day; parents' addition changed days 3–4; the final day-four edit succeeded after Astra escalation. Failed hotel update preserved the saved plan. | Conversation fails end-to-end. Saved-plan scope handling improved, but false exposure rejections still cause retries and failure. |
| Closure, rain, fatigue | Closure saved changes to days 1–2 and preserved day 3. Rain and fatigue each revised day 2. Fatigue retained the after-noon timing and replaced Canyon Overlook. | Adaptation persistence worked in this repetition. Stale alternatives still refer to removed `Canyon Overlook`; full narrative/plan agreement is not met. |
| Three-day Seattle | Saved Pike Place Market, Seattle Art Museum, Seattle Center, Olympic Sculpture Park, Chittenden Locks and Gas Works Park. | Specific-POI requirement met in this repetition. Olympic Sculpture Park was incorrectly tagged `parkCode: olym` / Olympic National Park. Coordinates remained unverified. |

Local replay of the captured exposure response confirmed false rejection of **“leave cliff-edge hikes out.”** The validator also rejected uncertainty language explaining why exposed options were excluded. These are validation defects; they should be corrected without weakening checks against genuinely recommended hazardous terrain.

All **13 returned itineraries** across the standalone check and full run matched their saved canonical hashes. This proves response/save agreement for those artifacts, not correctness of every stop, identity or narrative field. The continuity fixture's September 12–17 dates were already past; its date clarification was reasonable and was not counted as a failure.

Across both runs, the harness recorded **42 GPT-6 dispatches: 37 Sol and 5 Astra**. The full core run alone used 39 dispatches, including 4 Astra. This small failed run does not establish a sustained escalation reduction. Settled usage-based estimates totaled **$1.5806**, with one HTTP-504 dispatch unpriced; this is not a billing total. No exhausted-credit error recurred.

Durable, session-ID-free response and canonical-plan evidence: [funded retry evidence](TRAILIE-FUNDED-RETRY-EVIDENCE-2026-09-23.json). Raw temporary captures: `/tmp/trailie-core-final-funded-check.jsonl` and `/tmp/trailie-core-final-funded-1.jsonl`.

## Changes

| Area | Implementation | Verification and remaining limits |
|---|---|---|
| Accessibility and repair eligibility | Pass frozen traveler constraints into anchor, coverage and substitution repairs. Filter candidates before selection using access, exposure, distance and difficulty eligibility. Shared final-stop checks enforce wheelchair access, stairs, pets, difficulty and no-hiking constraints. Unknown access cannot be certified by model prose. | Focused regressions pass. Two live wheelchair plans avoided hiking. Coverage and duplicate-experience reliability still require repeat qualification; broader destination accessibility evidence remains incomplete. |
| Evidence identity | Reconcile duplicate official facility records with the same name and park; retain ambiguity when coordinates conflict. Add reviewed, source-linked Zion facility access facts to the existing evidence pipeline. | Same-facility and conflicting-location tests pass. Data describes static suitability, not live opening status. |
| Canonical continuity | Give mutation requests the complete saved plan, canonical trip facts and new mutation outside the 800-token conversation trip-state section. Prefer the server-supplied saved plan over legacy plan aliases. Explicit photography priorities and family additions trigger refinements; “last two days” bounds a family edit to those saved days. | Long-plan, priority, subset-scope and execution regressions pass. Final behavior has not been live-qualified. Complete mutation context can increase input tokens; retry and Astra reductions are unmeasured. |
| Exposure | New/touched stops under a hard no-exposure constraint must use evidence-backed exposure, rather than a model-authored “low” value. Photographic terms such as “long exposure” no longer count as terrain hazards; an exposed ledge in the same sentence still fails. | Focused safety and execution regressions pass. Older untouched saved days retain their existing canonical metadata. |
| Closure adaptation | Include structured access dependencies in affected-stop matching. Use word boundaries and exclude descriptions such as “away from the canyon,” which previously widened repair scope to unrelated areas. | Scope tests pass; an earlier diagnostic adaptation saved a changed plan. General road-dependency coverage is still limited by available stop metadata; final repeated closure/weather/fatigue qualification is pending. |
| Seattle / city quality | Reject destination-only identity evidence as an experiential itinerary stop. Add six specific Seattle places to the existing owner-sourced activity catalog. | One earlier live Seattle plan used specific places. Destination-centroid rejection tests pass. This adds Seattle catalog coverage, not a universal city-POI discovery solution. |
| Narrative agreement | Detect unselected named evidence activities and unsupported hike/waterfall/overlook mentions in plan narration. Rebuild affected narration from canonical stop names before finalization; never add a stop to make prose true. | Regressions verify that accepted days/stops remain unchanged. The deterministic detector is bounded; broader language coverage and final live agreement checks remain pending. |
| Resolution / maps | Stamp stop identity resolution as `resolved`, `ambiguous`, `unresolved` or `not_applicable`. | Identity-state tests pass. `resolved` means identity binding, not verified coordinates or routing. Google authorization still prevents full local route/map qualification. |

## Earlier live evidence — before funded retry

| Core case | Observed outcome | Acceptance status |
|---|---|---|
| Wheelchair Zion | Two saved non-hiking plans; third repetition reached duplicate/coverage failures, then a provider failure. | Not qualified 3/3. |
| Constraint-heavy Zion | Diagnostic conversation still failed at sunrise-priority propagation and a day-two edit. Canonical-context and preference changes followed offline. | Final implementation requires all three repetitions. |
| Canyon-road closure | Diagnostic turn saved a revised itinerary. Later scope correction has offline coverage. | Final closure, rain and fatigue repetitions remain pending. |
| Three-day Seattle | Diagnostic run saved specific places rather than repeated Seattle-centroid stops. | Final three repetitions remain pending. |

No claim is made that Astra usage has met the target. These earlier interrupted conversations are unsuitable for a reliable before/after escalation comparison.

## Evidence files

- Final offline verification: `/tmp/trailie-core-final-offline-3.log` — 161/161 tests, 10/10 suites; provider isolation counters all zero.
- Diagnostic conversations: `/tmp/trailie-core-repair.jsonl`.
- Interrupted repetition captures: `/tmp/trailie-core-final-1.jsonl`, `/tmp/trailie-core-final-2.jsonl`, `/tmp/trailie-core-final-3.jsonl`.
- Confirmed external blocker: `/tmp/trailie-provider-check-2.log` and `/tmp/trailie-core-final-provider-check-2.jsonl`.

These `/tmp` captures are temporary local artifacts. They contain synthetic test conversations and execution details. The earlier broad audit remains in [the prior qualification report](TRAILIE-LOCAL-QUALIFICATION-AUDIT-2026-09-23.md).

## Resume qualification

Provider credit is now available. Address the funded retry findings first: repair access scope/activity typing, exposure rejection polarity, stale alternative references and Seattle park-identity contamination. Then, from `server/`, run the [local qualification script](../server/scripts/qualify-trailie-core-local.js) three times with distinct run IDs, sequentially:

```bash
TRAILIE_CORE_RUN=resume-1 node scripts/qualify-trailie-core-local.js --live
TRAILIE_CORE_RUN=resume-2 node scripts/qualify-trailie-core-local.js --live
TRAILIE_CORE_RUN=resume-3 node scripts/qualify-trailie-core-local.js --live
```

The runner uses disposable MongoDB, the unchanged GPT-6 routing, an $8 per-run reserve cap, and no forced Astra compatibility calls. It records full response/state artifacts and stops on exhausted credit. Its execution completing is not itself a behavioral pass: inspect saved plans, hard constraints, affected days, prose agreement and actual model calls.

Only after the four core conversations meet the 12/12 target, run the ten-case smoke once:

```bash
TRAILIE_CORE_RUN=smoke node scripts/qualify-trailie-core-local.js --live --smoke
```

Production-cutover readiness remains unproven until those checks pass. Google route/map qualification is a separate outstanding requirement once local authorization works.
