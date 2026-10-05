# Trailie V2 — Days-First Structured Output Order

**Date:** 2026-08-27. **Offline only.** No model calls, no providers, no network,
no client partial rendering, no commit, no push, no deploy.

## Why

Measured on the live shadow-structure run
(`artifacts/trailie-shadow-structure-2026-08-27/`):

```
first artifact byte    7,441 ms
  intro                7,449 ms   (+8 ms after the opening brace)
  narrativeSections    9,845 ms
  days                11,043 ms   ← 3,602 ms, 22% of the 16,271 ms stream
day 1 complete        15,238 ms
tool complete         23,712 ms
```

The model emits properties in schema order, so **22% of the artifact stream is
spent on plan-level prose before the first day begins**, shifting every
structural milestone later by that amount.

This changes **production order, not semantics**. It is much cheaper than
building local validation for partial days, and it should be answered first:

> Can the same validated artifact become structurally useful earlier?

---

## A — Schema order only

`create_itinerary` output properties are now emitted in a declared order:

```
days · intro · narrativeSections · alternatives
```

Implemented as a named `TOP_LEVEL_OUTPUT_ORDER` constant plus an `orderKeys`
helper applied **last** in `getCreateItineraryTool`, after every other schema
transform — so `requireAlternatives`, `reduced`, `bindParkIdentity` and
`bindCoordinates` cannot reintroduce the old ordering. Verified across all five
tool variants.

`required` was reordered to match (`['days','intro']`). **The set is unchanged** —
this is the same ordering signal, not a change to what is required. Flagged
explicitly because the run brief said not to change required fields; if reordering
that array is unwanted, it is a one-line revert.

Nothing else changed: no field added, removed or renamed; no field description
altered; no validator touched; no `maxOutputTokens` change; `intro`'s "not a 1–3
sentence stub" contract and `narrativeSections`' "0–3 sections only when
something actually matters" contract are byte-identical.

### The constraint that decides whether this works at all

This tool is dispatched with **`strict: false`** — `convertTools` in
`providers/openaiResponsesAdapter.js` sets `strict: tool.strict === true`, and
`getCreateItineraryTool` sets no `strict` flag. So property order is **advisory,
not constrained decoding.** The only evidence that the model follows schema order
is that it did so exactly on the measured run. Live telemetry settles it; nothing
here forces it.

---

## B / D — Order is not semantics

Audited every consumer that could depend on property order:

| Consumer | Verdict |
| -------- | ------- |
| `hashPayload` / `hashItinerary` | `stableStringify` **sorts keys** before hashing — "insertion order can never change a hash" |
| `itineraryPlanPatch.sameValue` / signatures | `stableValue` sorts keys |
| `bindGeneratedItineraryContract` | rebuilds the plan; no key-order read |
| `normalizeToolCalls` | parses JSON; no key-order read |
| Plan iteration anywhere | no `Object.keys`/`for…in` over a plan object exists |
| `detectContradiction` blob | `JSON.stringify` for substring search only — order-insensitive for its purpose |

Two **existing tests** were coupled to `required` array order
(`generationContractTier1`, `itineraryToolIntro`, both asserting
`toEqual(['intro','days'])`). Both were incidental order-coupling; updated to
assert the **set** plus, where relevant, the days-first signal. This is exactly
the coupling the audit existed to surface.

Then the same artifact, keys in either order, through the real pipeline:

```
parse (normalizeToolCalls)            same status, same itineraryData hash
binding (bindGeneratedItineraryContract)  same plan hash
finalizeStructuredItinerary           same finalized hash, same feasibilityIssues
evaluateStructuralArtifact            same ok, reasonCodes, dayDiagnostics
evaluateItineraryCompleteness         same ok, same reasonCodes
evaluateTravelerFit                   same ok, same reasonCodes
persistence hash                      identical by construction
```

The healthy artifact passes everything, which proves equivalence only on the
happy path — so a **deliberately broken** artifact (day 1 all-zero durations,
day 2 empty) is run through the same checks and must be rejected **identically,
with the same non-empty reason codes**, in both orders. Otherwise reordering
could quietly change which plans get repaired.

---

## C — The shadow tracker must not assume `days` is terminal

Under the old order `allDaysStructurallyCompleteMs == toolCompleteMs` (23,712 ms
live) because `days` was the last key. Days-first breaks that coincidence, and
the tracker is pinned for it:

- days-first: `allDaysStructurallyCompleteMs` **strictly less than**
  `toolCompleteMs`, and `daysStartMs < sectionStartMs.intro`
- old order: the two collapse to within 1 ms, reproducing the live measurement
- both orders find the **same** units (9 stops, days 1–3)
- days-first moves `firstCompleteDayMs` **earlier** — the hypothesis, asserted

---

## E / F — Unchanged

Intro and narrative generation requirements and their validators are untouched;
no prose was shortened or made optional. No structural milestone is exposed to
the browser: `CANONICAL_EVENTS` has no `stop_complete` / `day_complete` /
`all_days_structurally_complete` member, no `emit(...)` mentions one, and the
stream callback still holds exactly one `emit`, behind the `text_delta` gate.

---

## G — Live hypothesis (projection only — NOT a claim)

From the measured run, assuming the model follows the new order and its
production rate is unchanged:

```
first artifact byte              7,441 ms   (measured)
~one 3-stop day                  ~4,200 ms  (measured: 4,195 / 4,007 / 4,461)
─────────────────────────────────────────
projected day 1 complete        ~11,600 ms
tool complete                    23,712 ms  (measured)
projected hidden window         ~12,100 ms  (versus 8,474 ms measured)
```

**This is arithmetic, not a result.** Three things could falsify it: `strict` is
off so the model may ignore the order; changing the order may change generation
behaviour (including quality); and run-to-run variance on this prompt is 16–21%
on every model number.

---

## Test results

```
new suite       28 tests pass   daysFirstOutputOrder
targeted sweep 362 tests pass   25 suites (every schema consumer)
full server   4732 tests pass   347 suites
```

**6 pre-existing failing suites (11 tests), none importing anything changed here**
— verified by grepping each for every module touched in this pass (zero hits):

| Suite | Cause |
| ----- | ----- |
| `liveScope.test.js` | asserts `autoRouteProvider() === 'claude'`; it returns `'openai'` — stale Stage-13.3 test predating the OpenAI migration |
| `compositePreflight.test.js` | `PHASES` has 21 entries, test expects 20 — eval-harness drift |
| `factsWebSearch.live.test.js` | live API tests requiring network |
| `tests/integration/auth.test.js`, `tests/integration/parks.test.js`, `tests/blogController.test.js` | fail at **Babel transform time** in `services/reactEmailRenderer.js` |

---

## The live benchmark this unblocks

One identical THRO turn. The primary comparison is **ordering, not total model
latency**:

| Milestone | Before | After |
| --------- | -----: | ----: |
| first tool byte | 7,441 | ? |
| `days` start | 11,043 | ? |
| first stop complete | 12,402 | ? |
| Day 1 complete | 15,238 | ? |
| Day 2 complete | 19,245 | ? |
| Day 3 complete | 23,706 | ? |
| all days complete | 23,712 | ? |
| tool complete | 23,712 | ? |

And especially `toolComplete − day1Complete`: **8,474 ms today**. If it grows to
roughly 11–13 s, progressive day availability becomes materially more
interesting. Also verify where `intro` and `narrativeSections` actually land —
with `strict: false` the model may not obey the order at all.

Decision, fixed in advance:

- **Day 1 moves to ~11–13 s** → a server-only provisional-day feasibility pass is
  justified. Not client rendering. `PROVISIONAL ≠ CANONICAL` preserved throughout.
- **The milestone barely moves** → the model is choosing its own generation order,
  or something else dominates. A complicated partial-plan path for an ~8 s window
  is not compelling. Stop.
- **Quality regresses** → revert the ordering. Speed is not worth destabilising
  planning.

## What this cannot fix

Even the optimistic version leaves the first ~7–9 s with no artifact bytes at
all. Days-first cannot make Trailie feel instantaneous. What it can do is turn
the second half of a ~24 s wait from entirely hidden work into something that
might eventually be exploited safely.


---

# LIVE RESULT — 2026-08-27 (`artifacts/trailie-days-first-2026-08-27/`)

**NO RESULT. The model ignored the requested property order.**

```
requested:        days → intro → narrativeSections → alternatives
actually emitted: intro → days
```

`intro` began 1 ms after the first artifact byte. `days` began 3,291 ms later.
`narrativeSections` and `alternatives` were not emitted at all this turn.

The `strict: false` caveat written into section A turned out to be the whole
story: an explicit schema property order **and** a matching `required` order were
both disregarded.

## Raw deltas flattered the change; relative position did not move

Every milestone landed earlier in absolute terms, but only because the run was
9.4% shorter (model window 21,017 ms vs 23,896 ms). Normalised by stream
duration:

| milestone | before | after | delta |
| --------- | -----: | ----: | ----: |
| days begins | 22.1% | 22.3% | +0.2 pp |
| first stop complete | 30.5% | 31.8% | +1.3 pp |
| day 1 complete | 47.9% | 48.9% | +1.0 pp |
| day 2 complete | 72.5% | 73.2% | +0.7 pp |
| all days complete | 100.0% | 100.0% | 0.0 pp |

Available window: 8,474 ms (52.1% of stream) → 7,531 ms (51.1%). It did not grow.

The prose-before-days share was **22.1% → 22.3%**, essentially identical, despite
the earlier run emitting a `narrativeSections` entry and this one emitting none.

## Quality: no regression

Attempt-1 pass, 3 days / 9 stops, zero zero-duration stops, all four requested
interests represented, 9/9 stops with both note and why, intro 1,089 chars,
persistence shape ok. Nothing to revert on quality grounds — the change is inert,
not harmful.

## Disposition of the schema-ordering lever

**Closed.** Cost to learn it: $0.047.

The ~22% prose-first share and the ~48% position of Day 1 both reproduced across
two runs with opposite schema orders, which makes them properties of the model's
generation behaviour rather than of the schema.

Remaining options, all materially more expensive than what was tried:

1. `strict: true` on the tool so ordering is enforced by constrained decoding —
   changes dispatch semantics for every itinerary turn and carries strict-mode
   schema restrictions (all properties required, keyword limits). Needs its own
   study.
2. Split generation into two tool calls, days first — a large change to the
   generation contract.
3. Accept the ~8 s window and study whether a completed Day 1 can carry a
   provisional state at 48% of the stream.

The ordering code is left in place: it is inert, provably semantics-preserving
(28 offline tests), and would become live if option 1 is ever taken.
