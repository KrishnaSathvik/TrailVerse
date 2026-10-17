# Manual TripPlan write path audit (`usePlanWorkspace`)

**Date:** 2026-10-11
**Status:** Phase 1 implemented · Phase 2 grounded `add_place` in `manual-add-place-phase2-2026-10-11.md`
**Related:** `docs/trailie-architecture.md`, `artifacts/repo-hygiene-audit-2026-10-11/REPORT.md`

## Question

> Should manual user edits also pass through the canonical write/trust boundary?

## What existed (pre-fix)

```text
PlanWorkspace (owner UI)
  → usePlanWorkspace local `days` state
  → tripService.updateTrip(tripId, { plan: updatedPlan })
  → PUT /api/trips/:tripId
  → tripController.updateTrip
       → validateTripWriteCandidate(...)
       → resolveCanonicalResponsePersistence(...)
       → findByIdAndUpdate
```

Critical bug: the editor spread `trip.plan` (including a **stale `itineraryHash`**) and only replaced `days`. `resolveCanonicalResponsePersistence` often classified that as **IDEMPOTENT** and stripped the plan update — UI could show “saved” while Mongo never received the edited days. Rehashing client-side hit `same_version_different_hash` CONFLICT instead.

## Phase 1 (implemented)

```text
PlanWorkspace
  → tripService.applyManualMutation(tripId, { op, ... })
  → POST /api/trips/:tripId/manual-mutations
  → applyManualMutation → dayStructure stopIds rebuild
  → validateManualPlanIntegrity
  → prepareManualPlanCommit (server rehash; sync assistant itineraryHash in place)
  → validateTripWriteCandidate → CAS write
```

Ops: `remove_stop`, `move_stop`, `add_day`, `remove_day`.

Frozen: Add place (client-authored pins). Deferred: overnight/note/drag-reorder until UI exists.

Closed hole: plan-only `PUT /api/trips/:id` → `400 manual_mutation_required`. Conversation+plan response saves still use PUT.

Modules:

| File | Role |
|---|---|
| `server/src/services/manualTripMutation.js` | Pure apply + stopIds sync |
| `server/src/services/manualPlanIntegrity.js` | dayCompleteness / base transition / schema version |
| `server/src/services/trailieManualCommit.js` | `prepareManualPlanCommit` (not AI chat-turn commit) |
| `server/src/controllers/manualTripMutationController.js` | HTTP + CAS |

## Verdict

Manual edits share **write validation and CAS semantics** with AI commits. They do **not** route through the LLM or `prepareCanonicalStoreCommit` (no fabricated chat turns). AI still owns travel judgment.
