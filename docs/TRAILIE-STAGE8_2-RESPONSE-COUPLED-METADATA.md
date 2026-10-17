# Stage 8.2 — Atomic Response-Coupled Metadata

**Goal:** close the last hole — a stale client could still overwrite `formData` / destination / `summary` / `provider` even though conversation + plan were protected. Now every field derived from or describing the canonical response moves as one unit.
**Status:** Implemented TDD-first, with mocked controller/model tests (no Mongo binary). Not committed/pushed. No enforcement, no Plan-AI redesign, shadow review still on-path.

---

## 1. Field classification

Decided in `tripController.updateTrip` and gated by `resolveCanonicalResponsePersistence(...).writeResponseCoupled`:

**Response-coupled — written only on `ACCEPT` (using real schema fields):**
```
plan, conversation, formData, summary, provider
```
(`parkCode`/`parkName` were never writable via the general update route; destination travels inside `formData`, which is now gated. `responseId`/`responseVersion`/`contentHash`/`itineraryHash` live inside `plan` and on the assistant message, so they move with the unit.)

**Independent — applied regardless of response version (user-intent trip management):**
```
title, status
```
`shareScope` has its own narrow path (`POST /trips/:id/share`). A general response-save is never treated as an intentional title/status edit — but an explicit title/status in the payload still applies (that's the rename/archive path).

## 2. Stale / conflict behavior

On `STALE` or `CONFLICT`, `writeResponseCoupled === false`, so `updateTrip` deletes **all** response-coupled fields from the write: stored assistant message, plan, `formData`, destination, `summary`, `provider`, and identity/hashes are preserved. The response returns `planPersistence.success:false` + `storedIdentity`. Only explicitly independent fields (title/status) may change. `IDEMPOTENT` likewise rewrites none of them (no summary/formData/timestamp churn on a retry).

## 3. Controller wiring tests (mocked model — no Mongo)

`server/src/controllers/__tests__/tripController.test.js` (`jest.mock('../../models/TripPlan')`, capturing the `$set`):

- ACCEPT → `$set` contains `plan, conversation, formData, summary, provider`.
- STALE → `$set` contains **none** of them; `planPersistence.success:false`, `outcome:'stale'`.
- CONFLICT → none written; returns `storedIdentity`.
- Stale `formData`/`summary`/destination cannot overwrite current ones.
- Independent `title`/`status` still apply alongside a stale response; `plan` does not.
- Title-only update applies through the general path.
- `updateMessageFeedback` → `updateOne` `$set` is exactly `{userFeedback, feedbackAt}`; never content/plan/summary/formData/responseId; invalid value → 400, no DB call.
- `createTrip`: duplicate terminal event → 200 existing (no create); same id different hash → 409; genuinely new → 201 create.

11/11 passing, no Mongo required.

## 4. Save-state test

`next-frontend/src/utils/saveStateFromPersistence.js` (`resolveSaveState`, `shouldAutoRetrySave`), wired into `autoSaveConversation`:
- ACCEPT / IDEMPOTENT / legacy-200 → `saved`
- STALE / CONFLICT → `sync-needed` (never a false "Saved")
- network failure → `idle`
- stale/conflict is **not** auto-retried (`shouldAutoRetrySave` always false); the client reconciles local identity from `storedIdentity` instead.

8/8 passing.

## 5. Focused and full-suite results

- **Server (jest):** 8 Stage-8.x suites — 97/97 green (adds the mocked controller suite, 11). Whole suite: 642 passing; the 8 failing suites are **only** `NPS_API_KEY` / `mongodb-memory-server` env (verified none reference Stage-8 modules; count variance is Mongo-memory flakiness).
- **Frontend (vitest):** `src/utils` — 16 files / 116 tests green. `TripPlannerChat.jsx` lint: 0 errors.

## 6. Remaining true environment-only gaps

- **Real end-to-end DB integration** (supertest against a live Mongo) is unavailable in this sandbox. The controller wiring is now covered by mocked-model tests that assert the exact `$set` payloads, so the contract is proven; only a live-DB smoke remains as an env-only gap.
- **Full browser component test** of the `sync-needed` status chip is not present (no component-test harness); the decision is covered by the `resolveSaveState` unit tests and wired into the component.
- **Version monotonicity** still relies on the deployed frontend sending `expectedPreviousVersion`; a stale client yields a safe CONFLICT (nothing overwritten), not drift.

---

## Stage 8 — final guarantee

With 8.0 → 8.1 → 8.2 in place, an accepted save now binds **one canonical version** across:

```
assistant message content
= plan / itinerary
= formData + destination
= summary
= provider
= responseId + responseVersion + contentHash + itineraryHash
```

A stale or conflicting client can change **none** of these — only its own independent title/status via their intended path. Feedback is field-scoped. New-trip creation is idempotent.

*No commit, no push, no enforcement, no Plan-AI redesign, shadow review still on-path. This closes Stage 8. Stage 9 (durable, sampled, off-critical-path shadow review keyed by responseId + contentHash + itineraryHash) can now begin.*
