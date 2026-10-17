# Trailie V2 — `create_itinerary` Strict-Mode Feasibility

**Date:** 2026-08-27. **Offline only.** No model calls, no providers, no network,
no paid run, no commit, no push, no deploy, no UX change. **`strict` stays false
everywhere** — nothing here enables it.

## Purpose

The live days-first benchmark settled that advisory ordering is not a lever: the
model emitted `intro → days` against a schema declaring `days` first, and every
normalised milestone stayed within ~1 percentage point. Before building
provisional-Day architecture around an ~8 s window, this audit asks whether the
existing contract could run under constrained decoding at all.

**Method caveat, stated once:** the provider's exact strict subset is not
verifiable offline. Every incompatibility below is stated *as understood* and
names an exact schema path so it can be re-checked against provider docs. What
*is* measured here — schema contents, optional-property counts, replay
equivalence, byte tax, routing scope — is measured, not assumed.

---

## 1. Unsupported schema constructs

Walked every production variant (`reduced`, `+requireAlternatives`,
`+bindParkIdentity`, `+bindCoordinates`, base). The findings are small and
identical across variants:

| Path | Construct | Present in |
| ---- | --------- | ---------- |
| `$.narrativeSections.maxItems` | `maxItems: 3` | **every** variant |
| `$.alternatives.minItems` | `minItems: 1` | only `requireAlternatives` |
| `$.days[].stops[].alternatives[]` | missing `additionalProperties: false` | every variant |
| `$.alternatives[]` | missing `additionalProperties: false` | every variant |

Structural size is comfortable: **6 objects, 33 properties, max object nesting
depth 4** (root → day → stop → alternative). No `oneOf`/`allOf`/`not`/`if`, no
`pattern`, no `format`, no numeric bounds, no `default`.

**Both `additionalProperties` gaps are the two `alternatives` item schemas**,
which are declared `additionalProperties: true` — deliberately open. Closing them
means enumerating the fallback fields, which is a real (small) contract decision,
not a mechanical edit.

> **CORRECTION (2026-08-28).** `minItems`/`maxItems` were listed here as
> unsupported. That is wrong for this path: they are supported in strict schemas
> for non-fine-tuned models — the provider's own strict example carries
> `minItems: 2` — and are restricted only for fine-tuned models. Verified against
> current provider docs. **They are retained**, not dropped.
>
> The real conversion constraints are therefore only the other two the audit
> found: every property required (optionality via nullable types) and
> `additionalProperties: false` on every object.

---

## 2. Required-property implications

Strict requires **every** property to be listed in `required`. The production
default has **19 optional properties**:

| Class | Count | Paths |
| ----- | ----: | ----- |
| Already nullable → **SAFE TO REQUIRE AS NULL** | 11 | `overnightLocation`, stop `parkCode`, `parkName`, `timeWindow`, `exposureLevel`, `walkingDistanceMiles`, `latitude`, `longitude`, `difficulty`, `why`, `narrativeSections[].heading` |
| Optional **arrays** → must emit `[]` | 3 | `$.alternatives`, `$.narrativeSections`, `$.days[].stops[].alternatives` |
| Properties of items **inside** those arrays | 5 | `alternatives[].name/note/when`, stop `alternatives[].name/note` |

The 5 in the third class are inert: they only materialise when an item exists.

## 3. Nullable / empty semantic risk

The question that matters is whether absence carries meaning anywhere. Tested,
not assumed:

- **`alternatives: []` is indistinguishable from absent.** The backup gate reads
  `structured.length > 0`. A test drives a backup-requesting prompt with the key
  deleted and with `[]` and asserts identical reason codes (`missing_backup_plan`
  in both).
- **`walkingDistanceMiles: null` is indistinguishable from absent** to the
  evidence-bound comparator: `sameFieldValue` normalises with `?? null`, and
  `evidenceBoundChanges` skips when `before` is null.
- Structural, completeness and traveler-fit verdicts are **identical** across
  representations, on a healthy plan *and* on a deliberately broken one (same
  non-empty reason codes).

### One real difference, found and pinned

**The finalized plan hash changes.** Not because any value changed — because two
keys materialise:

```
walkingDistanceMiles   undefined → null    (all 9 stops)
alternatives           undefined → []      (all 9 stops)
```

Every other field is byte-identical. `stableStringify` hashes the key *set*, so a
materialised key changes the hash even though nothing was decided differently.

This is safe within a turn (the succession guard compares a hash to itself), but
it crosses a turn boundary in exactly one place: refinement ownership, which
compares a persisted prior plan against a new one — and `walkingDistanceMiles`
**is** in `SUBSTANTIVE_STOP_FIELDS`. Tested directly:

```
prior = pre-strict representation, next = strict representation, same content
  → evaluateScopedOwnership: ok, no reason codes
control: a genuine day-1 stop rename under a day-2 scope
  → refinement_mutation_outside_requested_scope
```

**Migration is safe** — the comparator normalises undefined to null — and the
control proves the check still bites.

---

## 4. Output tax

Measured on the artifact accepted by the live days-first run (3 days, 9 stops):

```
bytes           7,744 → 8,158    +414   (+5.3%)
approx tokens   2,091 → 2,208    +117
```

**No BPE tokenizer is available offline.** `promptTokenAccounting` is a word-ish
regex (`trailie_prompt_token_v1`), so the token figure is an approximation with a
stated method; the byte figure is exact. Scaling the exact +5.3% against this
run's measured 1,569 BPE output tokens gives roughly **+83 output tokens**.

On an output-bound path that is small but not nothing — and it grows with stop
count, since 9 of the 11 nullable fields are per-stop.

---

## 5. Ordering-enforcement confidence: **LIVE-UNPROVEN**

Nothing in this repository establishes that constrained decoding emits properties
in schema key order. Searched: no provider docs vendored, no adapter comment, no
prior experiment, and **no call site currently uses strict at all** (no
production code passes `structuredOutput`, and no tool sets `strict: true`).

Strict mode's documented purpose is to constrain **shape** — that a required key
appears, that a value matches its type/enum. That a constrained decoder must also
walk properties in declaration order is a *plausible implementation consequence*,
not something this audit can demonstrate.

**Do not claim strict will fix ordering because it constrains shape.** The whole
value of the proposed live test rests on an assumption the audit cannot close.

---

## 6. Canonical replay equivalence

Same artifact, current vs strict-compatible representation:

```
normalizeToolCalls              same status
bindGeneratedItineraryContract  same days, same stop identities
finalizeStructuredItinerary     identical values; hash differs by 2 materialised keys only
evaluateStructuralArtifact      identical ok + reasonCodes
evaluateItineraryCompleteness   identical ok + reasonCodes
evaluateTravelerFit             identical ok + reasonCodes
broken plan                     identical non-empty rejection codes
refinement ownership (migration) ok, with a passing control
```

## 7. Authorial quality risks

Unmeasurable offline, and the honest answer is that they are real:

- **`intro`, `note`, `why`, `narrativeSections[].markdown`** are free prose inside
  a constrained decode. Constrained decoding changes the sampling path; whether
  it changes prose quality cannot be established without a live run.
- **`narrativeSections` forced to `[]`** removes the model's current ability to
  express "nothing to add" by omission. Semantically equivalent to the validators,
  possibly not equivalent to the model's authoring behaviour.
- **11 nullable fields forced to be emitted** invites null-filling where the model
  would previously have stayed silent — `why` and `timeWindow` in particular
  carry real traveler value and are currently populated 9/9.

Schema validity does not imply plan quality. The live days-first run's quality
baseline (attempt-1 pass, 9/9 note+why, intro 1,089 chars, all four requested
interests) is the bar any strict test must clear.

## 8. Routing scope

Tested, not assumed:

- Refinement turns dispatch `PATCH_ITINERARY_TOOL`, a **separate schema object** —
  enabling strict on `create_itinerary` cannot reach it by shared reference.
- Non-itinerary turns dispatch `tools: []`.
- The adapter opts in **per tool** (`strict: tool.strict === true`), so scope is
  exactly what is set and nothing else.
- Comparison and other structured artifacts do not use this tool.

One latent trap worth naming: the *other* strict path,
`request.structuredOutput.strict !== false`, **defaults to true**. No production
call site uses it today, so nothing is silently strict — but a future caller
passing `structuredOutput` would get strict without asking.

## 9. Repair / validation implications

Strict decoding constrains shape only. Every failure class actually observed
live is value-level:

```
zero_duration_stops           a number that is 0 — schema-valid
missing_requested_hike        an absent experience — schema-valid
missing_experience_anchor     a day composition problem — schema-valid
traveler-fit incompatibility  a fit judgement against evidence — schema-valid
```

A test constructs a schema-perfect artifact that still fails with
`zero_duration_stops` + `empty_day`. **The repair ledger and normal routing remain
authoritative.** Strict would remove `tool_output_invalid` as a failure mode and
nothing else — and that mode did not appear in either live run.

---

## 10. Recommendation: **STRICT FEASIBLE — LOW/MODERATE RISK**, but do not test it *for ordering*

The mechanical work is genuinely small: drop two cardinality keywords, close two
`additionalProperties` on the `alternatives` item schemas, move 19 properties into
`required` with 11 of them already nullable. Replay equivalence holds, migration
is safe, routing scope is contained, and the output tax is ~+5.3%.

**But the reason to do it does not hold up.** The entire payoff rests on §5, which
is LIVE-UNPROVEN: nothing establishes that strict mode enforces key order. The
projected prize is ~3.3 s of Day-1 availability — and the last experiment
projected a similar shift and delivered 0.2 percentage points.

So the recommendation is conditional, and the condition is cheap:

> **Do not spend a live run on ordering until the ordering premise is
> established from provider documentation.** That is a reading task, not a
> benchmark. If the docs state that structured outputs follow schema property
> order, this becomes a well-scoped low-risk change worth one controlled live
> test. If they do not, formally class this as option 2 (high risk relative to
> payoff) and stop.

I cannot close that question offline — it needs the provider's current docs.

## 11. Disposition of `TOP_LEVEL_OUTPUT_ORDER`

**Keep, with the expiry the brief asked for.** It is inert, provably
semantics-preserving (28 tests), and is exactly the order wanted if strict ever
enforces ordering.

**Remove immediately if** the documentation check in §10 finds no ordering
guarantee, or if strict is otherwise ruled out. At that point it becomes
misleading dead intent and should not survive a second decision cycle.

---

## Test results

```
new suite      24 tests pass   strictModeFeasibility
sweep         312 tests pass   19 suites (schema, binding, finalize, validators,
                               patch, refinement, shadow, canonical hashing)
```


---

# ORDERING PREMISE: CONFIRMED (2026-08-28)

§5 was the blocker, and it is closed against current provider documentation:

> **Structured Outputs → Key ordering.** "Structured Outputs ensure that
> generated content follows the exact order of keys defined in the provided
> schema."

> **Function calling → Strict mode.** "Strict mode ensures that function calls
> reliably adhere to the provided function schema… schemas must have
> `additionalProperties` set to false, and all fields in `properties` must be
> marked as required. Optional fields can be handled by including `null` as a
> type option."

The ordering guarantee is stated in the Structured Outputs guide; strict function
calling is documented as the same enforcement mechanism applied to tools. The
residual — that the ordering sentence is not restated verbatim on the
function-calling page — is exactly what one live run settles, and it is now a
documented expectation rather than a hypothesis.

Recommendation upgraded: **STRICT FEASIBLE — LOW/MODERATE RISK. One controlled
live experiment is justified.**

---

# PREP PASS (offline, complete)

## 1. Gated switch

`TRAILIE_CREATE_ITINERARY_STRICT`, resolved through the existing
`itineraryGenerationConfig` seam (`createItineraryStrictEnabled()`), default OFF,
only an exact case/space-tolerant `"true"` enables it. Read exactly once, on the
`create_itinerary` branch.

**Production is byte-identical to today** with the flag off: no `strict` key on
the tool, original `required` sets, both `alternatives` item schemas still open.
Asserted.

## 2. Strict-compatible representation

Applied *behind the same switch*, not unconditionally — forcing every property to
be required under `strict: false` would push the model to emit nulls for no
benefit. `toStrictSchema` recursively:

- sets `additionalProperties: false` on every object, closing the two
  `alternatives` item schemas;
- moves every declared property into `required`, **in the same order as
  `properties`** so the ordering signal and the required list cannot disagree;
- widens declared fields to nullable.

Zero remaining incompatibilities across all five variants: no object without
`additionalProperties: false`, no optional property.

## 3. `minItems` / `maxItems` retained

`narrativeSections.maxItems: 3` and `alternatives.minItems: 1` survive the
transform, asserted.

## 4. Nullability is a declared decision, not a blanket rule

`STRICT_NULLABLE_FIELDS = { note, when, heading }`.

- `alternatives[].name` stays **required and non-null**: a fallback without a
  name is not actionable, and `hasActionableOutdoorBackup` reads exactly that
  field.
- `note` / `when` / `heading` become **nullable**: descriptive, and their absence
  today means "not supplied", which `null` represents faithfully.
- Optional **arrays** are deliberately excluded — they become required and emit
  `[]`, already proven indistinguishable from absent.

Descriptions, enums, field names and stop-field ordering are all preserved,
asserted field-by-field.

## 5. Migration behaviour preserved

The previously measured behaviour still holds: the finalized hash differs by
exactly two materialised keys (`walkingDistanceMiles`, stop `alternatives`), no
value changes, and refinement ownership tolerates the representation change with
a passing control.

## 6. Scope pinned

`PATCH_ITINERARY_TOOL` carries no `strict` key; the flag is read once, on the
create branch only; non-itinerary turns still dispatch `tools: []`. Asserted.

## 7. Replays

Healthy plan → identical structural / completeness / traveler-fit verdicts, all
`ok: true`. Broken plan → identical non-empty reason codes.

## Test results

```
strictModeFeasibility    38 tests pass
targeted sweep          392 tests pass  (25 suites)
full server suite     4,770 tests pass  (348 suites)
```

Unchanged pre-existing failures: 11 tests in 6 suites (`liveScope` asserts a
Claude route that is now OpenAI; `compositePreflight` PHASES 21-vs-20 drift;
`factsWebSearch.live` needs network; `auth`/`parks`/`blogController` fail at
Babel transform time in `services/reactEmailRenderer.js`). Identical count and
identical suites before and after this pass.

## What the live experiment must show

A clean PASS is **not** "generation got faster". It is:

```
actual top-level order      days → intro → …
daysStart position          ~0% of the artifact stream, not ~22%
Day 1 position              materially earlier than ~48%
allDaysComplete             materially before toolComplete
quality                     attempt-1 pass, 9/9 note+why, all interests covered
```

Projected shape if per-day production stays at the measured ~4.0–4.5 s: Day 1
~11–12 s, Day 3 ~19–20 s, prose ~20–24 s, tool complete ~24 s — roughly **12 s**
between Day 1 existing and tool completion versus ~7.5–8.5 s today. Still a
projection: constrained decoding can change token rate, reasoning behaviour or
prose quality.

**Revert criteria, fixed in advance:** if strict degrades attempt reliability or
plan quality, or imposes a meaningful latency tax, revert `strict`, delete
`TOP_LEVEL_OUTPUT_ORDER`, and close ordering permanently.


---

# LIVE STRICT RESULT — 2026-08-28: **PARTIAL**

`artifacts/trailie-strict-days-first-2026-08-28/`, $0.052671, one turn, attempt-1 pass.

**Ordering: enforced exactly.** `days → intro → narrativeSections → alternatives`.
The documented guarantee holds on the function-calling tool path — the one
residual this audit could not close offline. No provider error, no refusal, no
`tool_output_invalid`.

**Timing: large shift.** Day 1 moved from 48.9% to **26.9%** of the artifact
stream (13,341 → 8,597 ms); `allDaysComplete` is now strictly before
`toolComplete` (79.8%) for the first time; the completed-Day-1 window grew from
7,531 ms / 51.1% to **12,085 ms / 73.1%**.

**Tax: the reason it is PARTIAL.** +25.4% output tokens, +45% model-emitted
bytes, +12.8% spend — model time flat, so constrained decoding showed no latency
penalty in this sample. The cause is mechanical and not null-padding:

| | strict:false | strict:true |
| --- | ---: | ---: |
| stop-level `alternatives` populated | 0 of 9 | **9 of 9** |
| `narrativeSections` | 0 | 1 |
| `intro` (the spoken answer) | 1,089 chars | **859 chars** |

**Forcing a field required did not make the model emit `[]`. It made the model
fill it** — on a turn that never requested a backup — while the traveler-facing
answer shrank 21%.

Coordinates were null in BOTH runs (`TRAILIE_TIER1_BIND_COORDINATES` off), so
that is not a strict effect. Plan-level `alternatives` in the canonical plan is
server-derived (`collectStructuredAlternatives` adds `parent`; the strict-required
`when` is absent), so it is not a strict violation either.

---

# CONTRACT CORRECTION — schema-required ≠ content-required (offline, complete)

The defect to fix is not "can strict populate alternatives" — it demonstrably
can. It is the opposite: **can strict reliably emit `[]` when nothing is
warranted?**

`STRICT_EMPTY_ARRAY_GUIDANCE` appends a normative empty-state clause to the three
arrays strict forces to exist:

```
SCHEMA-REQUIRED, NOT CONTENT-REQUIRED: this array must be present, and [] is the
correct value. Use [] unless <the specific condition>. Do not invent/create
<content> merely because the field is required.
```

Applied to `$.days[].stops[].alternatives`, `$.narrativeSections`, and
`$.alternatives`.

**Only in the strict representation.** In the non-strict schema those arrays
really are optional, so calling them "schema-required" would be false. Production
descriptions are byte-identical, asserted.

**Contradiction guard.** When a backup WAS requested, `requireAlternatives`
already rewrites `$.alternatives` to "REQUIRED … you MUST populate" with
`minItems: 1`. The empty-state clause is suppressed for that field in that case —
telling the model both "you MUST populate" and "use []" would be incoherent.
Stop-level `alternatives` still receives the clause even then: a trip-level Plan B
is not a request for a fallback at every stop.

The correction changes descriptions only — order, required sets, nullability and
cardinality bounds are untouched, asserted.

## Test results

```
strictModeFeasibility    51 tests pass
targeted sweep          405 tests pass  (25 suites)
full server suite     4,783 tests pass  (348 suites)
```

Unchanged pre-existing failures: 11 tests in 6 suites, identical before and after.

## The two live cases this unblocks

Not a plain-answer turn — routing tests already prove plain answers never receive
the tool, so it would buy nothing.

**Case A — no backup requested.** The THRO benchmark prompt, unchanged. The
production candidate. Expected: order still days-first; stop `alternatives` 0/9;
trip `alternatives` `[]`; `narrativeSections` `[]` unless genuinely useful; Day 1
still near ~27%; output-token tax down toward the ~5% mechanical representation
overhead.

**Case B — backup explicitly requested.** Proves the stronger empty-array
language did not overcorrect. Verified offline that the detector
(`userRequestsBackupPlan`) fires on the candidate wording, so the turn will
actually exercise `requireAlternatives`:

```
false  (base prompt — Case A)
true   "... Also give me a backup plan in case the scenic drive is closed."
true   "... Include a Plan B in case of bad weather."
true   "... What are my backup options if roads close?"
```

Expected: `alternatives` populated meaningfully, backup validation satisfied, no
empty-array suppression where content was actually requested.

## What would make strict production-worthy

| Requirement | Bar | Status |
| ----------- | --- | ------ |
| Ordering | `days` reliably first | **met** (n=1) |
| Latency opportunity | Day 1 materially earlier, ~12 s window | **met** (n=1) |
| Optional content | no-backup request produces `[]` | **untested — Case A** |
| Quality | attempt-1 reliability, intro/note/why hold | met except intro length (n=1) |
