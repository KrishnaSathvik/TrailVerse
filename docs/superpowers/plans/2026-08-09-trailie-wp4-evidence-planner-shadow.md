# Trailie WP4 Evidence Planner Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build schema-valid EvidenceRequirements and compare their compatibility projection with the unchanged legacy fetch plan in telemetry-only shadow mode.

**Architecture:** A pure planner maps WP2 classifications and resolved turn context to requirements. A separate compatibility projector/comparer translates and explains differences, while route integration only forwards a sanitized shadow result to the existing durable ledger.

**Tech Stack:** Node.js CommonJS, Jest 29, existing Trailie intent/fetch planners and turn ledger.

## Global Constraints

- No new provider calls, evidence-store reads/writes, prompt changes, model changes, or response changes.
- `trailieFetchPlanner` remains the sole production fetch decision-maker.
- Requirements declare topics/authority/provider preference, never endpoint calls.
- Safety/live wording may preserve or raise freshness and may never lower it.
- Every projection disagreement has a stable reason code.
- All four routes emit the identical sanitized planner telemetry schema.
- All tests run with provider access denied.

---

### Task 1: EvidenceRequirement contract and deterministic IDs

**Files:**
- Create: `server/src/utils/evidenceRequirement.js`
- Create: `server/src/utils/__tests__/evidenceRequirement.test.js`

**Interfaces:**
- Produces: `buildEvidenceRequirement(input)`, `validateEvidenceRequirement(value)`, taxonomy constants, and `PLANNER_VERSION`.

- [x] Write failing tests for exact keys, valid enums, deterministic IDs, public privacy, date scopes, unique providers/reasons, and invalid safety freshness.
- [x] Run the focused test and confirm the module is missing.
- [x] Implement canonical normalization, hashing, and strict validation.
- [x] Run the focused test and confirm it passes.

### Task 2: Planner and golden evidence plans

**Files:**
- Create: `server/src/services/evidencePlannerService.js`
- Create: `server/src/eval/trailieEvidencePlanGoldenFixtures.js`
- Create: `server/src/services/__tests__/evidencePlannerService.test.js`

**Interfaces:**
- Consumes: `IntentClassification`, resolved destinations, dates, constraints, active trip state, turn ID, and current time.
- Produces: `planEvidenceRequirements(context): EvidenceRequirement[]`.

- [x] Write failing golden tests for all intent baselines plus seasonal/current roads, strategy/live hotel, strategy/live flight, itinerary, full trip, live assistance, and refinement distinctions.
- [x] Confirm the focused suite fails because the planner is missing.
- [x] Implement deterministic baseline and prompt-refinement rules without provider/store imports.
- [x] Run the focused golden suite and confirm 100% pass and schema validity.

### Task 3: Compatibility projection and explainable comparison

**Files:**
- Create: `server/src/services/evidencePlannerShadowService.js`
- Create: `server/src/services/__tests__/evidencePlannerShadowService.test.js`

**Interfaces:**
- Produces: `projectLegacyFetchPlan(requirements, context)`, `compareEvidencePlanToLegacy(projected, actual)`, and `buildEvidencePlannerShadow(context)`.

- [x] Write failing tests for the exact legacy shape and every disagreement reason category.
- [x] Confirm the focused suite fails because the shadow service is missing.
- [x] Implement compatibility-only mapping, normalized comparison, and sanitized summary generation.
- [x] Run the focused suite and confirm it passes.

### Task 4: Route-neutral ledger telemetry

**Files:**
- Modify: `server/src/routes/ai.js`
- Modify: `server/src/services/trailieTurnLedger.js`
- Inspect: `server/src/models/TrailieAiTurn.js` (no change required; `evidence` is already a mixed telemetry object)
- Modify: `server/src/utils/aiLogger.js`
- Modify: `server/src/services/__tests__/turnTelemetryInstrumentationContract.test.js`
- Modify: `server/src/services/__tests__/trailieTurnLedger.test.js`
- Modify: `server/src/utils/__tests__/aiLoggerTurnLedger.test.js`

**Interfaces:**
- Route preparation produces transient `evidencePlannerShadowInput` after the legacy plan exists.
- All four `logAIRequest` calls carry the same transient input; `aiLogger` computes and retains only the sanitized shadow summary.
- `buildTurnLedgerEntry` stores the summary under `evidence.plannerShadow`.

- [x] Write failing structural and ledger tests for four-route parity, sanitized fields, and legacy fetch independence.
- [x] Confirm failures identify missing shadow telemetry.
- [x] Attach one shared transient input to all four log events and compute the shadow in the logger once the response ID exists.
- [x] Persist only bounded summary fields in the existing evidence telemetry object.
- [x] Run route/logger/ledger tests and confirm they pass.

### Task 5: Isolation and regression verification

**Files:**
- Create: `server/src/services/__tests__/evidencePlannerIsolation.test.js`
- Reference: `server/src/eval/baselines/trailie-v2-pre-wp2-server-baseline.json`

**Interfaces:**
- Structural tests enforce the WP4 no-execution boundary.

- [x] Write tests proving planner modules import no provider, store/model, prompt, or router and that production fetch inputs exclude WP2/WP4 output.
- [x] Run all WP4 tests with the provider-disabled harness.
- [x] Run combined WP2-WP4 tests and verify all provider isolation counters are zero.
- [x] Run the full provider-disabled server suite and compare failures with the frozen baseline.
- [x] Review syntax, whitespace, file scope, and route output/prompt invariants.
