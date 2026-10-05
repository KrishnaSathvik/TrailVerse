# Trailie V2 — Strict `create_itinerary` Production Readiness

**Date:** 2026-08-28. **$0 only.** No model calls, no network, no commit, no push,
no deploy. Strict remains **OFF by default**; this pass does not enable it.

## What is being made production-safe

Four things that are now **one generation-contract feature**, not miscellaneous
schema helpers. They are load-bearing together and meaningless apart:

| Piece | Role |
| ----- | ---- |
| `TRAILIE_CREATE_ITINERARY_STRICT` | the rollout switch, default OFF |
| `TOP_LEVEL_OUTPUT_ORDER` | `days → intro → narrativeSections → alternatives` |
| `toStrictSchema` | strict-compatible normalisation |
| `STRICT_EMPTY_ARRAY_GUIDANCE` | schema-required ≠ content-required |

`TOP_LEVEL_OUTPUT_ORDER` is no longer inert intent. It is demonstrably
load-bearing:

```
strict:false + declared order  ->  IGNORED   (model emitted intro → days)
strict:true  + declared order  ->  OBEYED    (n=3 live runs)
```

### Measured basis (four live runs, 2026-08-27/28 — not re-measured here)

| Question | Result |
| -------- | ------ |
| Does strict enforce `days → intro` on this tool path? | **Yes**, n=3 |
| Does that move Day 1 earlier? | **Yes**, ~49% → ~25–27% of the artifact stream |
| Useful hidden-work window? | **Yes**, ~7.5–8.5 s → ~11.4–12.2 s |
| Did strict originally cause junk optional content? | Yes — stop alternatives 0/9 → 9/9 |
| Did the contract correction fix it? | **Yes** — Case A all `[]`; Case B exactly the 3 `scenic_drive` stops |
| Does strict weaken semantic validation? | **No** — attempt-1 pass, validators/persistence clean |
| Is the +25% raw token delta from forced arrays? | **No** |
| Normalised overhead | **~3.6–6.7% per stop**, consistent with the ~5% mechanical estimate |

**The architectural fact, banked:** strict buys roughly **22 percentage points**
of earlier structural availability without weakening the final validation
contract.

No further identical THRO latency runs. A second $0.05 sample would not close the
±5% token question — it would re-roll stop count, note length and intro length
along with it.

---

## What this pass pinned (52 tests, `strictProductionReadiness.test.js`)

**§2 — one contract test for the whole strict shape.** Across all five
production variants: declared top-level order; `required` in the same order;
`additionalProperties: false` on every object *walked recursively*; every
property required; optional scalars preserved as approved nullable fields;
optional arrays as required arrays carrying the empty-state rule.

**§3 — `requireAlternatives` interaction.** No backup requested → trip
`alternatives` may be `[]` and the schema says so. Backup requested →
`minItems: 1` and the empty-state clause is **suppressed for that field only**;
telling the model both "you MUST populate" and "use `[]`" would be incoherent.
Stop-level alternatives keep independent empty-state semantics in **both** cases
— a trip-level Plan B is not a request for a fallback at every stop, which is
exactly what the Case B run demonstrated.

**§4 — production OFF pinned byte-for-byte.** A golden fixture
(`__fixtures__/createItineraryProductionContract.json`) captures all five
variants of the shipped contract, compared by exact serialization so **key order
is part of the pin**. Any diff is a deliberate production change and must be
reviewed as one. Also asserted: no strict-only text can reach it.

**§5 — the switch cannot become truthy by accident.** `1`, `yes`, `on`,
`enabled`, `truthy`, `true1`, `0`, `''`, whitespace and `undefined` all resolve
false; only an exact case/space-tolerant `true` enables. The config seam is the
**single reader** — a directory scan asserts no service, route or util names the
env var directly.

**§6/§7 — scope.** `PATCH_ITINERARY_TOOL` is never strict under either flag
state and is a distinct object that cannot be strictified by reference. The flag
is read **exactly once**, inside the `create_itinerary` arm. Non-itinerary turns
dispatch `tools: []`.

Also closed: the *other* strict door. `request.structuredOutput.strict !== false`
**defaults to true** in the adapter, so a caller that starts passing
`structuredOutput` would get strict without asking. A test parses every
`createRequest`/`createResponsesRequest` argument body and asserts none supplies
it, and pins that the only `structuredOutput` mentions in `services/` are the
request/response envelope and the OpenAI adapter that fills it.

**§8 — rollout segmentation telemetry.** `createItineraryStrict: true|false|null`
is captured **at the moment the tool is built**, not re-read when telemetry is
assembled, so it reports what the dispatch actually used. `null` means
`create_itinerary` was never built. Configuration metadata only — a boolean,
carrying no prompt, plan or traveler content. Forwarded through the bounded
telemetry projection so a future regression can be segmented by strict on/off
without inspecting prompts.

**§10 — validators and repair untouched.** No validator or repair module mentions
strict, `toStrictSchema`, or the flag. A schema-perfect artifact with a zero
duration still fails `zero_duration_stops`: **strict constrains shape and removes
only `tool_output_invalid`.** Every semantic gate and the repair ledger remain
authoritative.

---

## §9 — Rollback criteria, fixed before enablement

Roll strict back — set `TRAILIE_CREATE_ITINERARY_STRICT` off — if production
shows a meaningful increase in any of:

- **attempt count** (attempt-1 acceptance falling below the current baseline)
- **semantic validation failures** (any `validationStage` rate rising)
- **routing exhaustion**
- **output cost per turn**
- **traveler-fit failures**

`createItineraryStrict` in telemetry is what makes each of these segmentable
without a code change or a prompt inspection. Rollback is a config flip: the
production contract is pinned byte-for-byte by the golden fixture, so turning the
flag off restores exactly the shipped schema.

## Test results

```
strictProductionReadiness    52 tests pass
full server suite         4,869 tests pass  (351 suites)
```

Pre-existing failures, none referencing anything in this feature (verified by
grep — zero matches in all of them):

| Suite | Cause |
| ----- | ----- |
| `liveScope` | asserts a Claude route that is now OpenAI — stale Stage-13.3 test |
| `compositePreflight` | `PHASES` 21-vs-20 drift in the eval harness |
| `factsWebSearch.live` | live API tests requiring network |
| `auth`, `parks`, `blogController` | fail at Babel transform time in `services/reactEmailRenderer.js` |
| `beehiivSync` | `ENOENT` on `src/scripts/sync-newsletter-subscribers-to-beehiiv.js` — the file, and the whole `src/scripts/` directory, do not exist |
| `beehiivWebhook`, `subscribers.beehiiv` | **pass in isolation**; fail only under full-suite in-memory-Mongo contention |

---

## Next: the provisional-Day study, framed correctly

Not *"how do we stream Day 1?"* but:

> **Can a structurally complete Day 1 earn a provisional state that is useful to
> the traveler without ever being mistaken for the accepted itinerary?**

The state machine, with only the last state being the actual plan:

```
STREAMING → STRUCTURALLY_COMPLETE → PROVISIONALLY_CHECKED
                                          ├── final plan fails / repairs → DISCARD
                                          └── FINALIZED → WHOLE_PLAN_VALIDATED → CANONICAL
```

The open question is whether `PROVISIONALLY_CHECKED` may have a traveler-visible
representation **at all**.

### The study uses history, not model calls

Take real attempts that failed on: zero durations, requested-experience coverage,
cross-day duplicates, traveler fit, refinement ownership, repair regression.
Replay the Day 1 that *would have existed* at its stream milestone and ask:

> Had we shown this Day 1 provisionally, would the finally accepted result have
> contradicted or replaced anything the traveler already saw?

That yields an actual **false-early-reveal rate** from historical failures. If a
completed Day 1 usually survives repair and finalization unchanged, provisional
UX becomes plausible. If it often changes, ~12 seconds is not enough
justification.
