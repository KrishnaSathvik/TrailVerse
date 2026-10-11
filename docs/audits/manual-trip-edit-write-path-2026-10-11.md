# Manual TripPlan write path audit (`usePlanWorkspace`)

**Date:** 2026-10-11
**Status:** findings only — no code change in this pass
**Related:** `docs/trailie-architecture.md`, `artifacts/repo-hygiene-audit-2026-10-11/REPORT.md`

## Question

> Should manual user edits also pass through the canonical write/trust boundary?

## What exists today

```text
PlanWorkspace (owner UI)
  → usePlanWorkspace local `days` state
  → tripService.updateTrip(tripId, { plan: updatedPlan })
  → PUT /api/trips/:tripId
  → tripController.updateTrip
       → validateTripWriteCandidate(...)   // write-contract / identity / CAS
       → resolveCanonicalResponsePersistence(...)
       → findByIdAndUpdate
```

This path does **not** call:

```text
trailieSimpleRuntime
trailieSimpleGuard.validateSimpleMutation
prepareCanonicalStoreCommit
```

So it is not a second AI planner. It **is** a second durable TripPlan writer.

## What the trips PUT does validate

`validateTripWriteCandidate` in `server/src/validation/tripWriteContract.js` runs before persistence. That contract owns conversation/plan write identity, succession, and related integrity — not travel judgment and not the full model-first day-shape / experience↔anchor trust boundary.

## What the client can mutate without the trust boundary

| Client action | Effect on stored plan |
|---|---|
| Add / remove / reorder stops | Rewrites `plan.days[].stops` |
| Add place via `AddPlaceInput` | Inserts a map-picked stop (client-authored place) |
| Add day | Appends `{ id, dayNumber, label, stops: [] }` — **no `dayStructure`** |
| Remove day / edit labels | Rewrites day list |
| Auto-save (2s debounce) + unmount flush | PUT with `{ ...trip.plan, type, version: 1, days, updatedAt }` |

`version: 1` written by the client is the plan envelope version, not `tripSchemaVersion` from `shared/tripSchemaVersion.cjs`.

## Verdict

**Yes — manual edits should eventually go through a dedicated manual-edit mutation contract** that shares the same truth checks as model-first for anything that claims spatial / operational / day-shape facts. They should not be forced through the LLM runtime.

Recommended shape (not implemented):

```text
manual edit intent
  → normalizeDraftDays(days)          // repair/require dayStructure.blocks
  → validateManualPlanMutation(plan)  // subset of trailieSimpleGuard:
                                      //   schema, coords, experience↔anchor when claimed,
                                      //   route edges if present, tripSchemaVersion
  → prepareCanonicalStoreCommit or trips PUT with the same write-candidate gate
  → persist
```

Until then, treat owner manual edit as:

| Classification | Meaning |
|---|---|
| COMPATIBILITY_REQUIRED | Product feature; do not delete |
| ARCHITECTURE_GAP | Bypasses travel trust boundary |
| Not DUPLICATE_IMPLEMENTATION of Trailie judgment | User is the editor; AI is not |

## Priority risks

1. **Empty / structureless days** — `addDay()` creates days with no `dayStructure`, which TripPlan v1 model-first validation rejects. Manual save can therefore produce plans the AI path would refuse.
2. **Client-authored pins** — map adds can introduce coordinates/names without the evidence provenance the trust boundary requires for grounded claims.
3. **DayStructure drift** — reordering or removing stops does not update `dayStructure.blocks[].stopIds`, so itinerary and map can disagree after edit.

## Non-goals for the eventual fix

- Do not route manual edits through `createSimpleRuntime` / the model.
- Do not remove PlanWorkspace / DayCardList until a replacement editor exists.
- Do not loosen `validateSimpleMutation` to accept editor drafts.

## Next implementation step (separate PR)

1. Inventory which editor mutations are allowed product-wise (reorder only vs add arbitrary places).
2. Add `validateManualPlanMutation` sharing helpers with `trailieSimpleGuard` for schema / day completeness / claimed anchors.
3. Either call it from `tripController.updateTrip` when `plan` changes without a model `responseId`, or add `PUT /api/trips/:id/manual-plan` that only the workspace uses.
4. Update `usePlanWorkspace.addDay` to emit a valid empty dayStructure (or block save until one exists).
5. Gate with focused tests; keep One-Brain green.
