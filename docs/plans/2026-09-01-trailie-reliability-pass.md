# Trailie Reliability Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give itinerary generation attempt 1 enough machine-owned truth (composed operational prohibitions/obligations + exposure legality rules) to construct a validator-legal plan, without weakening any post-generation validator; then measure attempt-1 reliability and decompose the 191s cold evidence wall.

**Architecture:** A new deterministic composer (`operationalGenerationDirectives`) harvests operational facts from the frozen EvidenceBundle, resolves them against the traveler (vehicle arithmetic, declared capabilities, avoid-exposure state), and emits composed *consequences* — HARD prohibitions and ACTION obligations — plus a per-turn exposure-legality directive. The execution service composes this once per turn (itinerary modes only) and passes it into the frozen Prompt-v2 snapshot, where it lands in the private trip-state JSON alongside the existing `accessRules`/`backupPlan` patterns. No validator changes; `constraints.operational` stays unpopulated (waking `applyOperationalConstraints`'s dormant removal consumers is explicitly out of scope — see trailie-consumer-activation-audit). R3 adds follow-page discrimination to existing evidence spans and two artifacts harnesses: a cold-path decomposition and a 4-case reliability matrix.

**Tech Stack:** Node/Express server, Jest-style tests via `npm run test:non-network` (server/), artifacts harness pattern from `trailie-rollout-readiness-gate/harness.js` (scripted turns) and `trailie-rollout-gate6-live-chain/live.js` (budgeted live runs).

**Hard scope limits (user-mandated):** No commit, no push, no deploy. No validator weakening. No prompt-tuning beyond the composed directives. No model/provider changes. No presentation work. No raw-evidence prose dumping into the prompt.

---

## Established facts (from code reading, 2026-09-01)

- `constraints.operationalEvidence` is written nowhere; `resolveOperationalConstraints` returns `[]` on every turn ([ai.js:1253](server/src/routes/ai.js), [trailieOperationalConstraints.js:62-71](server/src/utils/trailieOperationalConstraints.js)). `formatOperationalConstraintBlock` is imported in ai.js:261 and never called.
- Operational facts live in the frozen bundle: `operationalFactsFromBundle(bundle)` ([operationalFactExtraction.js:485](server/src/utils/operationalFactExtraction.js)) — the same source the traveler-fit veto reads at [trailieV2ExecutionService.js:2883](server/src/services/trailieV2ExecutionService.js).
- Prompt-v2 is built ONCE per turn at [trailieV2ExecutionService.js:1767](server/src/services/trailieV2ExecutionService.js), AFTER `frozenBundle` exists; the same snapshot reaches every attempt. So attempt 1 gets whatever we compose here.
- `buildTrailiePromptV2` puts machine-composed structures in the private-state JSON (`accessRules`, `backupPlan` precedents, [trailiePromptV2.js:135-154](server/src/prompts/trailiePromptV2.js)).
- Vehicle arithmetic is fully machine-owned: `resolveTravelerVehicle`, `assessVehicleDimensionFit`, `describeVehicleDimensionConflict` ([vehicleDimensionContract.js](server/src/utils/vehicleDimensionContract.js)).
- Capability/class semantics: `CLASS_FOR_KIND`, `TYPE_TO_KIND`, `declaredCapabilities` ([travelerFitEvaluation.js:61-136,219](server/src/utils/travelerFitEvaluation.js)). HARD_CAPABILITY = validity; ACTION_REQUIRED = obligation travels with recommendation.
- Exposure fail-closed veto: `evaluateHardExposureEligibility` → `constraint_eligibility_unknown` ([hardConstraintEligibility.js:72-87](server/src/utils/hardConstraintEligibility.js)); surfaced as the `operational_eligibility` fail stage at [trailieV2ExecutionService.js:2807-2817](server/src/services/trailieV2ExecutionService.js). Arming: `isAvoidExposureActive(constraints, userText)` ([planningInputContract.js:201](server/src/utils/planningInputContract.js)). Confirmed-low evidence lives at `candidate.claim.normalizedValue.exposureLevel`.
- The generic contract text (taskContracts line 27) already states the exposure rule; what attempt 1 lacks is the per-turn *legal pool* (which stops in evidence are confirmed low) — that is the composed delta.
- Evidence waves already carry labeled spans (`structured` / `web_discovery` / `official_pages`, [layeredEvidenceBroker.js:55-58](server/src/services/layeredEvidenceBroker.js)) and per-refresh `latencyMs` events ([evidenceBrokerService.js:327](server/src/services/evidenceBrokerService.js)). Multi-page follows (limit 3) are separate requirements with `:follow2`/`:follow3` id suffixes but share the `topic` used in span meta — follows are currently indistinguishable in the timeline.
- Wiring-test pattern: `artifacts/trailie-rollout-readiness-gate/harness.js` drives the REAL `executeTrailieV2Turn` with scripted `executeResponses`; `seen.generation[0]` is the dispatched attempt-1 request (prompt inspectable).

## Pre-registered bars (do not reinterpret after measuring)

1. **Glacier:** with a bundle carrying the GTSR 21-ft `vehicle_dimension` fact and a traveler stating a 24-ft RV, the attempt-1 prompt must contain a composed prohibition stating BOTH numbers and the subject name; validator unchanged.
2. **Zion exposure:** with `avoidExposure` active, the attempt-1 prompt must contain the exposure directive (never author exposureLevel; do not rely on unverified exposure-relevant stops; prefer non-exposure-relevant experiences; name the confirmed-low pool or state it is empty).
3. **Ordinary trip:** with no matching facts and no armed exposure constraint, the prompt must be byte-identical to today's. No rule → no block.
4. **ACTION_REQUIRED:** a permit fact composes an obligation ("may include; keep the requirement attached"), never a prohibition.

---

### Task 1: `operationalGenerationDirectives` composer (R1+R2 core)

**Files:**
- Create: `server/src/utils/operationalGenerationDirectives.js`
- Test: `server/src/utils/__tests__/operationalGenerationDirectives.test.js`

API:

```js
composeOperationalGenerationDirectives({ evidenceBundle, constraints, userPrompt })
// → null when nothing applies, else Object.freeze({
//     hardProhibitions: [{ subjectName, kind, text }],
//     obligations:      [{ subjectName, kind, text }],
//     exposure: null | { confirmedLowNames: [...], text },
//   })
```

Rules (all deterministic, reusing existing machine owners — no new regexes over traveler text):
- `vehicle_dimension` fact + `resolveTravelerVehicle` → `assessVehicleDimensionFit`:
  - `incompatible` → hardProhibition: ``The traveler's ${kindLabel} is ${X} ft. ${subject} permits vehicles up to ${Y} ft. Do not plan any segment that requires driving this vehicle on ${subject} — use the park shuttle, a smaller legal vehicle, or an alternate route it permits.``
  - `unknown` (vehicle named, no length) → hardProhibition: do not rely on `${subject}`; state the `${Y}` ft limit if mentioned.
  - `compatible` / `not_applicable` / no vehicle → NO rule (bar 3).
- `VEHICLE_RESTRICTION` (kind `vehicle_capability`): skip when `declaredCapabilities` holds VEHICLE; else hardProhibition: `${subject} requires ${requirement}. This traveler has not said they have that — do not include ${subject} in the plan.`
- ACTION_REQUIRED kinds (`permit`, `water_or_shuttle_access`, `remote_self_sufficiency`, `seasonal_access`): skip when the matching capability is held; else obligation: `${subject} requires ${requirement}. You may still recommend it — if included, state that requirement with the recommendation. Do not treat it as excluded.`
- Dedupe per subject+kind; cap at 6 prohibitions + 6 obligations (deterministic order: bundle order).
- Exposure (R2): when `isAvoidExposureActive(constraints, userPrompt)`: harvest `normalizedValue.exposureLevel === 'low'` names (cap 8, bundle order). Text: traveler avoids exposed terrain; exposure-relevant stops (trails/viewpoints/overlooks) satisfy the constraint only with confirmed low exposure; the confirmed-low pool is `[names]` (or "none are confirmed in the supplied evidence"); do not rely on any other exposure-relevant stop to carry a day — build from experiences that do not depend on exposure certification (visitor centers, museums, scenic drives, lodge areas, picnic areas) plus the confirmed pool; never author or guess an exposureLevel value.

**Steps (TDD):** write failing tests for bars 1–4 plus: fits-vehicle → null; 4WD-declared traveler → no vehicle prohibition; permit-in-hand → no obligation; empty bundle + no exposure → null; Zion verbatim prompt ("3 days in Zion, easy walks only, I have a bad knee, love sunrise and sunset, no scary exposure.") arms exposure with no constraints object at all. Run `cd server && npx jest operationalGenerationDirectives --silent`; implement; green.

### Task 2: thread directives through Prompt-v2

**Files:**
- Modify: `server/src/prompts/trailiePromptV2.js` (new `operationalDirectives` input → `operationalRules` key in privateState, only when non-null)
- Test: extend `server/src/prompts/__tests__/trailiePromptV2.test.js`

Assertions: with directives, privateSuffix JSON contains the composed texts; without, output is byte-identical to a build with the parameter omitted (bar 3). Respect existing budget/truncation machinery (no new section, so no budget change).

### Task 3: wire into the execution service

**Files:**
- Modify: `server/src/services/trailieV2ExecutionService.js` — immediately before `promptSnapshot = buildPrompt({...})` (line ~1767): compose from `frozenBundle`/`frozenConstraints`/`userMessage` when `isItineraryMode(mode)`; pass `operationalDirectives`.
- Test: new `server/src/services/__tests__/trailieOperationalDirectivesWiring.test.js` using the scripted-turn pattern (copy the minimal deps shape from `artifacts/trailie-rollout-readiness-gate/harness.js`, or require it directly as that harness exports its builders):
  1. Bundle carrying a GTSR-style `vehicle_dimension` operationalFact + user message stating a 24-ft RV → `seen.generation[0]` prompt contains both numbers and the subject name.
  2. Ordinary Canyonlands turn (harness default) → prompt contains no `operationalRules` key (bar 3).
  3. Zion-verbatim prompt turn → prompt contains the exposure directive.

Then run the full non-network suite: `cd server && npm run test:non-network` — zero regressions allowed.

### Task 4: pin the two regression prompts as named fixtures

**Files:**
- Create: `server/src/services/__tests__/fixtures/reliabilityPass/glacier-rv.json`, `zion-knee.json` (userPrompt + constraints + minimal bundle candidates incl. the GTSR fact / exposure-less Zion trail candidates)
- The Task 3 test reads these fixtures so the pins survive refactors. Zion prompt is the audit's verbatim sentence; Glacier is the canonical reconstruction ("We're spending 5 days in Glacier in early October in our 24-foot RV — what about permits and Going-to-the-Sun Road?") — the audit doc does not record the exact original wording, so the fixture documents that.

### Task 5: follow-page span discrimination (R3 instrumentation)

**Files:**
- Modify: span-meta production so the `official_pages` wave's per-requirement spans carry the follow suffix (inspect [evidenceBrokerService.js:352-400](server/src/services/evidenceBrokerService.js) — the `requirement:` meta value; use `requirementId`-derived `topic:follow2` style labels, bounded).
- Test: extend the broker/layered tests only if an existing span test exists; otherwise assert via the cold harness output (Task 6). Keep the change to meta labels — no behavior change.

### Task 6: cold-path decomposition harness

**Files:**
- Create: `artifacts/trailie-reliability-pass-2026-09-01/cold-evidence.js` + `REPORT.md` stub

Runs the layered resolver for Glacier `vehicle_restrictions` (and the topics the itinerary planner would request) with a fresh/forced-refresh store, `beginSpan` wired to a local timeline, and dumps: per-wave wall, per-requirement spans (follows discriminated), per-refresh `latencyMs` events, normalization/persist counts. Answers "where did 191s go" with bounded spans: structured / discovery / official page 1..3 / normalization / store transaction. DRY-RUN mode first (providers disabled → structural check only), then one live cold run. No optimization in this pass — measurement only.

### Task 7: reliability matrix harness (R3 measurement)

**Files:**
- Create: `artifacts/trailie-reliability-pass-2026-09-01/matrix.js`

Four fixed cases, full live `executeTrailieV2Turn` per case (real broker + real OpenAI adapter, same wiring as `trailieV2RouteBridge`):
- A. Zion — bad knee + easy walks + avoid exposure + sunrise/sunset (verbatim pin)
- B. Glacier — 24-ft RV + GTSR
- C. Canyonlands — ordinary, no unusual hard constraint
- D. permit/reservation ACTION_REQUIRED case (e.g. a park whose bundle carries `reservation_required`; select from evidence at preflight)

Per case record: evidence ms (per wave), generation attempt-1 ms, attempt-1 validation PASS/codes, repair/sub-dispatches, generation attempts, total wall, model cost. Headline metrics: attempt-1 pass rate, terminal failure rate, mean generation attempts. Budget guard copied from gate6: per-case ceiling $0.40, run ceiling $1.50, observational stop $1.00, DRY_RUN + scripted rehearsal before the paid run. Also assert bar 3 live: case C's prompt snapshot carries no operationalRules block.

### Task 8: report

Write `artifacts/trailie-reliability-pass-2026-09-01/REPORT.md`: the matrix table, the cold-path decomposition, whether R1/R2 explain the retries, and the explicit next-bottleneck statement. No optimization work in this pass.
