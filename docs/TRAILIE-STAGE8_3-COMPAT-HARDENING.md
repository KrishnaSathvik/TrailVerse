# Stage 8.3 — Persistence Compatibility Hardening

**Goal:** close two bypasses around the Stage-8 guarantee — (1) `title/status` piggybacking on response saves, and (2) the legacy path overwriting an already-canonical trip.
**Status:** Implemented TDD-first, mocked controller tests (no Mongo). Not committed/pushed. No enforcement, no Plan-AI redesign, shadow review still on-path.

---

## 1. Canonical response endpoint allowlist

`PUT /trips/:id` (`updateTrip`) now persists **only** response-coupled fields:
```
plan, conversation, formData, summary, provider
```
`title`, `status`, `archived`, `visibility`, `shareScope` are **no longer accepted here** — they are ignored on this route. A stale, conflicting, idempotent, or even accepted response save therefore cannot rename a trip or reactivate an archived one. On any rejected outcome (or an empty update) the route issues **no DB write at all** (`findByIdAndUpdate` is skipped), so retries are truly side-effect free.

## 2. Narrow metadata command

`PATCH /trips/:id/metadata` (`updateTripMetadata`) — strict allowlist `{title, status, shareScope}`, nothing else. It can never touch response-coupled fields or response identity. Empty payload → 400. The frontend's `archiveTrip`/`unarchiveTrip` now route through this endpoint (`tripService.updateTripMetadata`), and the routine auto-save no longer sends `status: 'active'` at all (`buildResponseSavePayload` omits it).

## 3. Legacy migration rules (`resolveCanonicalResponsePersistence`)

| Request | Stored trip | Behavior |
|---|---|---|
| legacy (no identity) | legacy (no identity) | `legacy_migration` — one-time write; controller stamps `responseId`, `responseVersion:1`, `contentHash`, `itineraryHash` onto the plan |
| legacy (no identity) | **canonical** | `canonical_identity_required` — rejects conversation/plan/formData/summary/provider/identity; `success:false` + `storedIdentity`; **no write** |
| canonical | any | normal version/hash rules (8.1/8.2) |

After the one migration, the trip has identity, so every later unversioned request hits `canonical_identity_required`. The legacy branch can no longer bypass version/hash protection.

## 4. Idempotent side-effect behavior

An idempotent retry deletes all response-coupled fields → `updateData` empty → the controller returns without calling `findByIdAndUpdate`. No rewrite of content, plan, formData, summary, provider, or timestamps. `title`/`status` aren't on this route, so they're untouched by definition.

## 5. Frontend auto-save payload changes

- `buildResponseSavePayload` (tested): emits `{conversation, summary, plan, provider, expectedPreviousVersion}` — **never** `status` or `title`.
- `autoSaveConversation` update path uses it (dropped the old inline `status:'active'`).
- `archiveTrip`/`unarchiveTrip` → `PATCH /metadata`.
- On `success:false` (stale / conflict / `canonical_identity_required`): `resolveSaveState` → `sync-needed` (never a false "Saved"), reconcile local identity from `storedIdentity`, no auto-retry.

## 6. Focused / full test results

**Server (jest) — 8 Stage-8.x suites, 105/105 green**, including:
- `canonicalPersistence` (26): legacy migration; legacy-cannot-overwrite-canonical; second-legacy-after-migration rejected; response-coupled gate; atomic accept/reject; version rules; create idempotency.
- `tripController` mocked (16): stale/conflict → no DB write; title/status ignored on response route; **stale `status:active` cannot reactivate an archived trip**; idempotent → no write; legacy migration stamps identity; legacy cannot overwrite canonical; metadata command changes only allowlisted fields; feedback field-scoped; create dedupe/409.
- Carried green: planPersistence, feedbackCommand, canonicalResponse, itineraryArtifacts, sharedTripPayload, trailiePipelineUtils.

Whole server suite: 650 passing; the 8 failing suites are **only** `NPS_API_KEY` / `mongodb-memory-server` env — none reference Stage-8 code.

**Frontend (vitest) — `src/utils` 17 files / 121 tests green**, including:
- `responseSavePayload` (4): never sends `status`/`title`; correct `expectedPreviousVersion`.
- `saveStateFromPersistence` (9): ACCEPT/IDEMPOTENT→saved; STALE/CONFLICT/`canonical_identity_required`→sync-needed; network→idle; no auto-retry.

`TripPlannerChat.jsx` + `tripService.js` lint: 0 errors.

Spec §5 checklist: stale can't reactivate archived ✓; conflict can't change title ✓ (route ignores it); idempotent can't change title/status ✓; accepted doesn't implicitly change title/status ✓; narrow title/status change only those ✓; feedback isolated ✓; legacy migrates a no-identity trip ✓; migration stamps identity/hashes ✓; legacy can't overwrite canonical ✓; second legacy after migration rejected ✓; `canonical_identity_required`→sync-needed ✓; auto-save no longer sends `status:active` ✓.

## 7. Remaining true environment-only gaps

- Live-DB supertest smoke (real Mongo) — unavailable here; the controller `$set` payloads and no-write paths are proven by mocked-model tests.
- Browser-level test of the `sync-needed` chip — no component-test harness; the decision is unit-covered and wired in.
- A rename UI path (if added later) must use `PATCH /metadata`; `updateTrip` will silently ignore `title`.

---

*No commit, no push, no enforcement, no Plan-AI redesign, shadow review still on-path. With 8.0→8.3, an accepted save binds one canonical version across content/plan/formData/summary/provider/identity; title/status/share are separate narrow commands; legacy can migrate once but never overwrite canonical. Stage 8 is fully hardened — Stage 9 can begin.*
