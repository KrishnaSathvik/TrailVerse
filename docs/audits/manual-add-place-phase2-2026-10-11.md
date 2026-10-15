# Phase 2 — Grounded `add_place` (manual trip editor)

**Date:** 2026-10-11\
**Status:** contract + implementation\
**Depends on:** Phase 1 typed manual mutations (`docs/audits/manual-trip-edit-write-path-2026-10-11.md`)

## Contract

```text
User clicks Add place
        ↓
types "Tunnel View"
        ↓
frontend sends ONLY:
  { op: "add_place", dayId, query, index?, candidateId? }
        ↓
server resolves via named_place (same identity stack as Trailie)
        ↓
resolved?
 ├─ yes → build canonical stop (server coords + provenance)
 ├─ ambiguous → 400 place_ambiguous + structured choices (no write)
 └─ unresolved → 400 place_unresolved (no write, no fake pin)
        ↓
insert stop → rebuild dayStructure.stopIds
invalidate travelEdges on the touched day
prepareManualPlanCommit (rehash)
CAS save
```

### Client must not send

- coordinates / `location`
- Google / NPS / provider IDs as trusted identity
- `evidenceRef` / `canonicalPlaceId` invented by the browser
- provenance or route data

Optional `candidateId` is allowed **only** when confirming a choice the server previously returned for the same `query` (server re-resolves and matches; never trusts client coords).

### Response shapes

| Outcome | HTTP | Body |
|---|---|---|
| Accepted | 200 | `{ success, data: trip }` |
| Ambiguous | 400 | `{ code: 'place_ambiguous', query, choices: [{ candidateId, name, subtitle? }] }` |
| Unresolved | 400 | `{ code: 'place_unresolved', query }` |
| Forge attempt | 400 | `{ code: 'place_forge_rejected' }` |
| CAS conflict | 409 | `{ code: 'canonical_write_conflict' }` |

No silent fuzzy substitution. Ambiguity UX: “Which one did you mean?” with grounded choices.

### Out of scope

- `add_experience` / pinless manual experiences (Trailie chat already can)
- note edits, overnight edits, drag reorder

## Modules

| File | Role |
|---|---|
| `server/src/services/manualPlaceResolution.js` | Query → named_place resolve / ambiguous / unresolved |
| `server/src/services/manualTripMutation.js` | `add_place` insert + stopIds + clear day travelEdges |
| `server/src/controllers/manualTripMutationController.js` | Resolve then apply/commit |
| Frontend Add place input | Query-only; disambiguation picker |
