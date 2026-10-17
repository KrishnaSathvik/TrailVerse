# Stage 8.1 — Atomic Canonical Response Persistence

**Goal:** close the residual gap where guarding only `trip.plan` could still store conversation v3 beside plan v4. The canonical assistant message and plan are now one unit — accepted or rejected together.
**Status:** Implemented TDD-first. Not committed/pushed. No enforcement, no Plan-AI redesign, shadow review still on the request path (Stage 9). Telemetry separation deferred to Stage 9 as agreed.

---

## 1. Atomic response persistence flow

```
server: buildCanonicalOutbound → envelope {responseId, responseVersion, contentHash, itineraryHash}
        · stamped onto canonicalPlan (buildPlanDocument identity)
        · emitted in done / response
frontend: assistant message ALSO stamped with the same identity (assistantMessageForSave)
        · persists canonicalPlan verbatim (selectPlanToPersist)
        · sends expectedPreviousVersion = plan.responseVersion − 1
server: updateTrip → resolveCanonicalResponsePersistence({incomingPlan, incomingConversation, expectedPreviousVersion, existingPlan, existingConversation})
        → ONE outcome applied to BOTH:
           ACCEPT      → write conversation + plan
           IDEMPOTENT  → write neither (success)
           STALE/CONFLICT → write neither (failure) + return storedIdentity
        · title/status/formData/summary always apply (not response data)
```

The plan and the canonical assistant message can never diverge because a single decision gates both writes. `server/src/utils/canonicalPersistence.js` (`resolveCanonicalResponsePersistence`) is the pure decision; `tripController.updateTrip` applies it.

## 2. Conversation behavior on stale/conflict

- **STALE** (a newer response already landed, or the client's base is behind): the incoming conversation AND plan are both dropped from the write; stored content and plan are preserved. `success:false`.
- **CONFLICT** (same version slot, different hashes; or a version jump): both dropped; `success:false`; the response carries `planPersistence.storedIdentity` `{responseId, responseVersion, contentHash, itineraryHash}` for reconciliation.
- **IDEMPOTENT** (identical retry): neither rewritten; `success:true`.
- A full-conversation client update can no longer overwrite canonical assistant content when stale — the identity check rejects the whole unit.
- Identity is read from the plan first, then the latest assistant message carrying a `responseId`, so content-only responses (no itinerary) are guarded too.

## 3. Narrow feedback endpoint

`PATCH /trips/:tripId/messages/:messageId/feedback` → `updateMessageFeedback`.
- `buildFeedbackUpdate` (tested) produces a field-scoped `$set` that can only touch `conversation.$[m].userFeedback` and `conversation.$[m].feedbackAt`, keyed by message id via `arrayFilters`.
- It **cannot** modify message content, `responseId`, `responseVersion`, `contentHash`, `itineraryHash`, the plan, or the itinerary.
- The frontend feedback handler now calls `tripService.updateMessageFeedback(...)` instead of the debounced full-conversation `autoSaveConversation`. Analytics submission (`feedbackService`) is unchanged.

## 4. New-trip idempotency

`createTrip` now dedupes duplicate terminal events / retries:
- Owner-scoped lookup `{userId, 'plan.responseId'}` (new index added).
- `resolveCreateIdempotency` (tested): no match → create; same id+hashes → **return the existing trip** (`200 {idempotent:true}`); same id, different hashes → **409** with `storedIdentity`.
- No duplicate trip records for the same canonical response.

## 5. Version validation rules (`decidePersistenceOutcome`)

With `expectedPreviousVersion` supplied by the client:

| Incoming vs stored | Outcome |
|---|---|
| same id + version + hashes | IDEMPOTENT |
| same version, different id | CONFLICT |
| same id, same version, different hash | CONFLICT |
| version < stored | STALE |
| expectedPrev < stored (base behind) | STALE |
| expectedPrev == stored AND version == stored+1 | ACCEPT |
| version jump (> stored+1, or expectedPrev ahead) | CONFLICT |

Regeneration advances the version monotonically (new `responseId` still carries `stored+1`). Legacy writes without identity remain accepted for back-compat. (When `expectedPreviousVersion` is absent, the older lenient monotonic behavior is retained so pre-8.1 tests/clients don't break.)

## 6. Frontend reconciliation behavior

On `planPersistence.success === false` (stale/conflict), the client:
- does **not** claim "Saved" — sets `saveState = 'sync-needed'`;
- reconciles local identity from `storedIdentity` (`setCurrentPlan({...prev, ...storedIdentity})`) so the next attempt uses the correct base version;
- does not blindly retry.

Full sync UI is out of scope (no false "Saved" is the requirement, met). Deeper reconciliation (re-fetching stored prose to re-render) is a Stage-9+ UX item.

## 7. Focused tests (all passing)

- `planPersistence` (20): version rules incl. `expectedPreviousVersion`, version-jump→conflict, base-behind→stale, idempotent-despite-stale-expectation.
- `canonicalPersistence` (15): atomic ACCEPT/IDEMPOTENT/STALE/CONFLICT write flags; **never conversation-v3-beside-plan-v4**; full-conversation stale update can't overwrite canonical content; legacy passthrough; create idempotency (create / return-existing / conflict).
- `feedbackCommand` (4): only `userFeedback`+`feedbackAt`; rejects invalid values; cannot touch content/plan/hashes/version; targets by id.
- Carried forward green: `canonicalResponse` (13), `itineraryArtifacts` server (12)/frontend (10), `sharedTripPayload` (9), `trailiePipelineUtils` (8), `persistCanonicalPlan` (4), `streamDisplayContent` (4).

Mapping to the spec §9 checklist: stale/conflict reject both ✓; accept persists both atomically ✓; idempotent changes neither ✓; no v3/v4 mix ✓; full-conversation cannot overwrite canonical ✓; feedback only userFeedback ✓; feedback cannot rewrite content/plan/hashes ✓; duplicate new-trip returns existing ✓; duplicate id different hashes conflicts ✓; version jumps conflict ✓; regeneration increments version ✓. "Restored == same identity" and "save-status not 'saved' after stale/conflict" are covered by the identity-stamping + reconciliation code but assert at the seam (see §9 gaps).

## 8. Full-suite results

- **Server (jest):** 7 Stage-8/8.1 suites — 81/81 green. Whole suite: 626 passing; the 8 failing suites are **only** `NPS_API_KEY` (npsParkAdapter, prompts, npsParkConditions, parkChatImages, trailieFetchPlanner) and `mongodb-memory-server` timeouts (blogController, integration/auth, integration/parks). None reference Stage-8/8.1 modules; the run-to-run count variance is Mongo-memory-server flakiness.
- **Frontend (vitest):** `src/utils` — 15 files / 108 tests green. `TripPlannerChat.jsx` lint: 0 errors (6 pre-existing exhaustive-deps warnings, none in edited regions).

## 9. Remaining integration-test gaps

- **Route/controller tests need Mongo**, which times out in this sandbox. The contract logic is fully unit-covered (pure resolvers/commands); the remaining gap is a supertest pass asserting `updateTrip`/`createTrip`/feedback wire the pure decisions correctly (drop-plan-and-conversation on stale, 409 on create conflict, field-only feedback write). Recommend adding these where Mongo is available.
- **End-to-end "restored message + restored plan share the same responseId/version/hash"** is guaranteed structurally (both stamped from one envelope, written atomically) but not yet asserted by an integration test.
- **Frontend save-status assertion** ("not 'saved' after stale/conflict") is implemented but not covered by a component test (no component-test harness in place).
- **`feedbackAt`** added to the schema; old messages have it null (harmless).
- **Version monotonicity** still depends on the deployed frontend sending `priorResponseVersion`/`expectedPreviousVersion`; a stale client produces a safe CONFLICT (nothing corrupted), not silent drift.

---

*No commit, no push, no enforcement, no Plan-AI redesign, shadow review still on-path. With the canonical response now atomic and single-writer, Stage 9 (durable, sampled, off-critical-path shadow review keyed by responseId + contentHash + itineraryHash) can proceed safely.*
