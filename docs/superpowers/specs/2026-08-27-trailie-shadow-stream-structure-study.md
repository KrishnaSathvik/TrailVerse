# Trailie V2 — Shadow Stream Structure Study

**Date:** 2026-08-27. **Offline only.** No client partial plan, no model calls,
no providers, no network, no commit, no push, no deploy.

Follows the live first-artifact-byte measurement
(`artifacts/trailie-first-artifact-byte-2026-08-27/`), which produced a **fourth
shape the original decision tree did not have**:

```
dispatch
  ─► 2.46s   stream opens
  ─► ~7.0s   no tool bytes at all
  ─► 9.42s   first itinerary byte
  ─► 18.7s   continuous itinerary construction (1,440 deltas, ~98 tok/s)
  ─► 0.2s    finish
```

**Delayed start + continuous artifact stream.** 18.7 seconds of continuous
construction is a lot of potentially usable work, and nothing knew *when* inside
it a structural unit first exists. This pass builds the instrument that answers
that, and only that.

---

## The question, and the question it is NOT

> **When does Day 1 actually exist?**

Not: *can we show it?* A streamed day that is structurally complete is not a
validated day. It can still be rejected by whole-plan completeness, cross-day
pacing, traveler-fit interactions, missing requested experiences, evidence-bound
inconsistencies, later repair, or final artifact rejection.

---

## 1–2 — The tracker and its milestones

`server/src/utils/shadowStreamStructure.js`. An incremental JSON structure
scanner fed by `tool_argument_delta`, recording a fixed milestone vocabulary:

```
first_tool_byte
first_opening_brace
stop_complete                    { dayOrdinal, stopOrdinal }
day_complete                     { dayOrdinal }
all_days_structurally_complete   { dayCount }
tool_complete
```

Projected into telemetry as `structureMilestones`:

```
firstOpeningBraceMs · firstCompleteStopMs · firstCompleteDayMs
secondCompleteDayMs · allDaysStructurallyCompleteMs · toolCompleteMs
dayCompletionMs[] · stopCompletionCount · structurallyComplete · malformedReason
```

### Positional, never semantic

Milestones carry **ordinals, timestamps and byte offsets only**. String *values*
are skipped, not buffered — the scanner reads a value only far enough to find its
closing quote. The sole text it retains is the current object **key** (schema
field names like `days`/`stops`) in a 64-char capped buffer that fails closed.
There is no code path by which a stop name, note or label can enter a milestone.

This also answers the instrumentation note from the review: **semantic
milestones, not denser byte telemetry.** The 32-point byte curve stays as it is;
it already proved continuity.

### Path-aware, not depth-aware — this is the whole design

`days[].stops[].alternatives[]`, plan-level `alternatives[]` and
`narrativeSections[]` are all arrays of objects. Measured on the test artifact
(3 days, 4 stops):

| Naive strategy | Reports | Truth |
| -------------- | ------- | ----- |
| every object closing inside any array | **13** | 3 days + 4 stops |
| objects at depth 2 = "days" | **6** | 3 — `narrativeSections[]` and plan-level `alternatives[]` sit at the same depth |
| objects at depth 4 = "stops" | 4 | 4 — correct *by luck*, and only for this schema |

Depth happens to work for stops today and is already wrong for days; it would
break for stops the moment a field nests one level differently. Milestones are
therefore matched on the exact container path from the root:

```
[root]                                        -> the artifact
[root, days(array), obj]                      -> a day
[root, days(array), obj, stops(array), obj]   -> a stop
```

### 3–5 — The boundary, enforced not just stated

- **No persistence.** The tracker has **zero `require` statements**; it cannot
  reach a database, provider or validator even by accident. Tested.
- **No emission.** It is fed inside the `tool_argument_delta` branch, which
  returns before any `emit` is reachable. The stream callback still contains
  exactly one `emit`, still behind the `text_delta` gate. Tested.
- **No validator on incomplete JSON.** Nothing calls a validator from here. The
  only methods ever invoked on the tracker are `consume` and `snapshot` — tested
  by enumerating every call site.
- **Three call sites total**: construct, consume, snapshot-into-the-telemetry-row.

---

## 6 — Adversarial replay

`server/src/utils/__tests__/shadowStreamStructure.test.js` — 31 tests.

The live stream delivered 6,739 bytes in 1,440 deltas (**~4.7 bytes each**), so
splits land mid-key, mid-string and mid-escape as a matter of course. Every
structural assertion is replayed under seven chunking strategies: whole document,
one byte at a time, fixed 2/3/7-byte chunks, and two deterministic pseudo-random
1–9 byte splits. All produce identical structure.

Content designed to look like structure and is not:

| Case | Must not |
| ---- | -------- |
| `{{{{ }}}} [[[ ]]]` inside a string | open or close a container |
| escaped quotes `\"go\"` | end the string early |
| trailing backslash `C:\\` | swallow the closing quote |
| `\u007b\u007d` unicode escapes | be read as braces |
| nulls, zero durations, negative floats | disturb the scan |
| a stop note containing a **complete fake plan** — `"days": [{"stops": [{}]}]` | invent a day or a stop |
| stop `alternatives` nested 4 objects deep | register as stops |
| empty `stops: []` | produce a phantom stop |

Truncation behaviour:

- A stream cut at 25/50/75/95% is **never** marked structurally complete.
- **Units completed before the cut are still dated** — that is the entire point.
- An empty stream yields no milestones and no first byte (not a zero).
- Unbalanced closers are reported as `malformed_reason`, not silently absorbed.

Bounds: milestone series capped (early units still dated when the tail drops);
an absurdly long key fails closed without unbounded buffer growth; the projection
exposes exactly eleven bounded fields; no artifact string appears anywhere in a
serialized snapshot.

---

## 8 — Validator scope audit

Read from the live order of `validateGeneration`, not from names. The question
each row answers: **what is the smallest amount of plan this check can decide
on?**

| Stage | Scope | Why |
| ----- | ----- | --- |
| `refusal` | FINAL_ARTIFACT_ONLY | property of the dispatch, not the plan |
| `structured_output` | FINAL_ARTIFACT_ONLY | needs the complete tool payload to exist |
| `plan_patch_scope` | DAY_LOCAL | per-operation, against a resolved scope |
| `plan_patch_apply` | WHOLE_PLAN | merge result is a whole plan |
| `refinement_scope_ownership` | WHOLE_PLAN | compares prior vs next plan for ripples |
| `structured_artifact_structure` | **mixed** | `zero_duration_stops` and `empty_day` are DAY_LOCAL; `underfilled_day_count` is WHOLE_PLAN |
| `itinerary_contradiction` | WHOLE_PLAN | text checked against the finalized plan |
| `itinerary_feasibility` | POST_FINALIZATION | runs on `finalizeItinerary` output |
| `operational_eligibility` | **STOP_LOCAL** | `exposure_eligibility` binds one stop to evidence by place identity |
| `itinerary_completeness` | **mixed** | `empty_day`/`insufficient_day_coverage`/`missing_experience_anchor` are DAY_LOCAL; `duplicate_base_experience`, `missing_requested_{hike,sunset,scenic,wildlife}`, `missing_backup_plan` are WHOLE_PLAN |
| `traveler_fit` | **mixed** | per-day anchor findings are DAY_LOCAL; the low-effort profile is evaluated across all days |
| `mobility_claim_consistency` | POST_FINALIZATION | reads `finalized.itineraryData.intro` + narrative |
| `prose_constraint_safety` | POST_FINALIZATION | same text, post-finalize |
| `traveler_language` | POST_FINALIZATION | same |
| `budget_claim` | POST_FINALIZATION | whole-answer claim |

### What that audit actually says

A genuinely stop-local check exists (`exposure_eligibility`) and several
day-local ones do. But **three structural facts block any "locally validated"
status from meaning much**:

1. **The strongest checks are whole-plan by nature.** Requested-experience
   coverage across three days, cross-day duplicate detection, and day-count
   sufficiency cannot be decided from Day 1 alone — and these are exactly the
   classes that have historically rejected plans.
2. **Five stages run only after `finalizeItinerary`**, which mutates the plan.
   A day that was valid pre-finalization can be invalid after it.
3. **Repair replaces content that already passed.** The monotonic repair ledger
   exists because attempt 2 once put every duration back to 0 after attempt 1
   had fixed them. A day shown at 13 s can be replaced at 25 s.

So the reachable ceiling for a streamed unit is:

```
PARSED  →  LOCALLY VALIDATED  →  STILL NOT CANONICAL
```

and the third arrow is not a formality. **Local validity is not final
acceptance**, and this study defines no path by which it could be presented as
one.

---

## 9 — No new traveler-visible behaviour

Nothing in this pass changes what a traveler sees. No client change, no partial
plan, no new event type, no model behaviour change. `CANONICAL_EVENTS` gained no
structural member; the client normalizer has no vocabulary for one.

---

## Test results

```
new suite       31 tests pass   shadowStreamStructure
server sweep   271 tests pass   16 suites, 3/3 consecutive clean runs
client          63 tests pass   honest-progress suites unaffected
```

One transient failure appeared on the first sweep (2 tests, in `tests/setup.js:37`
`afterAll` → `mongod.stop()` on the in-memory Mongo, under concurrent load).
It did not reproduce across three consecutive runs. Teardown race, not this
change set.

---

## The one live measurement this unblocks

One identical THRO turn, same prompt, same routing, reading:

```
firstToolArgumentDeltaMs       9,424   (known)
firstCompleteStopMs                ?
firstCompleteDayMs                 ?
secondCompleteDayMs                ?
allDaysStructurallyCompleteMs      ?
toolCompleteMs                28,122   (known)
```

Interpretation fixed in advance:

- **Day 1 complete early (~12–14 s)** → up to ~15 s of the 28 s wait is work the
  model has already finished. A progressive architecture becomes worth designing
  — with the validator audit above as its hard constraint, not an afterthought.
- **Day 1 complete late (~24–26 s)** → little to exploit; the streamed structure
  lands too close to the terminal to matter.

## The other problem this cannot touch

Progressive artifact work can only ever help **after 9.4 s**. The first nine
seconds contain no traveler-visible model content at all and nothing in this
study changes that. That is a separate problem, and deliberately not the one
being solved first — this one requires no extra inference, and a second framing
call does.
