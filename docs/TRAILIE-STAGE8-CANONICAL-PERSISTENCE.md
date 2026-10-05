# Stage 8 — Canonical Response & Single-Writer Persistence

**Model chosen:** Option 1 — *server owns canonical response **creation**; frontend is the single persistence **initiator***. The browser never rebuilds or re-strips content; it submits the server's envelope verbatim.
**Status:** Implemented TDD-first. Not committed, not pushed. No reviewer enforcement. No Plan-AI redesign. Shadow review still on the request path (moving it off is Stage 9).

---

## 1. Canonical response-envelope shape

`buildCanonicalTrailieResponse(...)` → `server/src/utils/canonicalResponse.js`:

```js
{
  responseId,          // stable id (generated if absent)
  responseVersion,     // per-trip monotonic counter (priorResponseVersion + 1)
  content,             // artifact-stripped processed prose (NEVER the raw stream)
  contentHash,         // sha256 of canonical content
  itineraryData,       // structured plan (or null)
  itineraryHash,       // sha256 of deterministically-serialized itinerary (or null)
  planScore, corrections, feasibilityIssues,
  provider, model,
  reviewMeta,          // shadow metadata (counts/ids only)
  createdAt,           // ISO — NEVER hashed
  rawStreamContentHash // diagnostics only; never authoritative
}
```

`stableStringify` sorts object keys recursively and preserves array order, so key insertion order and `createdAt` can never change a hash.

## 2. Which writer was removed

**Removed:** the server-side fire-and-forget plan writers `saveStreamItineraryToTrip` / `saveItineraryToTrip` (the `void TripPlan.findByIdAndUpdate(tripId,{plan})` in `/chat-stream` and the `await` variant in `/chat`). These raced the frontend's `updateTrip` — F-PERSIST-1. The functions are deleted, not just unused, so they can't be reintroduced.

## 3. Authoritative persistence flow

```
server: processAssistantResponse → buildCanonicalOutbound()
          → envelope (content/hashes/version) + canonicalPlan (buildPlanDocument + identity + reviewMeta + auditTrail)
        → emits them in the `done` SSE event (/chat-stream) or response body (/chat)
frontend: onDone → selectPlanToPersist({data, currentPlan})  → returns data.canonicalPlan VERBATIM
        → autoSaveConversation → tripService.updateTrip/createTrip { conversation, plan: canonicalPlan }
server: tripController.updateTrip → resolvePlanPersistence({incomingPlan, existingPlan: trip.plan})
        → ACCEPT: write plan · IDEMPOTENT/STALE/CONFLICT: keep stored plan, still apply conversation
```

The plan slot now has exactly one authoritative writer path, guarded server-side regardless of client behavior. `metadata.priorResponseVersion` (the stored plan's version, echoed by the client) drives the monotonic version.

## 4. Hash / version / idempotency rules

`decidePersistenceOutcome` / `resolvePlanPersistence` → `server/src/utils/planPersistence.js`:

| Situation | Outcome | Writes plan? |
|---|---|---|
| nothing stored | ACCEPT | yes |
| newer `responseVersion` | ACCEPT | yes |
| older `responseVersion` | STALE | no |
| same id+version, matching hashes | IDEMPOTENT | no (success) |
| same id+version, different hashes | CONFLICT | no |
| different id at same version slot | CONFLICT | no |
| incoming plan has no identity (legacy client) | ACCEPT | yes (back-compat) |
| no `plan` field in the update | — | no (conversation-only update) |

The persisted plan carries `{responseId, responseVersion, contentHash, itineraryHash}` (via `buildPlanDocument({identity})`) so `extractPlanIdentity` can read it back on the next write.

## 5. Shared stripper behavior

One isomorphic `stripItineraryArtifacts(content) → {content, changed, removedSpans, artifactTypes}`:
- `server/src/utils/itineraryArtifacts.js` (CommonJS) and `next-frontend/src/utils/itineraryArtifacts.js` (ESM) — behavior-identical.
- Both pinned to `shared/itineraryArtifacts.fixtures.json`; each suite asserts the same `content`/`artifactTypes`, so drift fails CI.
- Handles: `complete_block`, `unterminated_open` (token-limit truncation), `orphan_close`, `fenced_json`, `bare_label`; collapses `\n{3,}` and trims both ends.
- `streamDisplayContent.stripItineraryJsonForDisplay` now delegates to it, so the browser has no weaker regex set (closes F-STREAM-1).

## 6. Streaming-to-final equality proof

`contentUnchanged` is computed with the **isomorphic** stripper on both sides:
```js
contentUnchanged =
  stripItineraryArtifacts(streamResult.fullContent).content ===
    stripItineraryArtifacts(response.content).content &&
  !contentChangedByValidation && !(correctionsApplied.length > 0);
```
The server's shipped `response.content` is itself produced by the same stripper. Therefore, when `contentUnchanged === true`, the browser may keep its streamed DOM and **no artifact can remain visible that the server considered removed** — the divergence in F-STREAM-1 is gone. `contentHash` travels in the `done` payload for downstream verification.

## 7. Restore / share / export behavior

- **Restore:** history restores `trip.conversation` (assistant content the frontend displayed = the server-canonical content) and `trip.plan` (the canonical plan with identity).
- **Share (F-PERSIST-2, raised to medium):** `buildSharedTripPayload` + new `TripPlan.shareScope` (default `plan_only`). Public payload excludes user chat messages and private `formData` by default; strips `reviewMeta`/`auditTrail`/hashes/`responseId` from the plan. Scopes: `plan_only` (default) → `plan_plus_explanation` (assistant messages only) → `full_conversation` (explicit owner opt-in, includes formData). `POST /trips/:id/share` accepts `{scope}`.
- **Export/PDF:** consumes the restored `trip.plan` (canonical) — unchanged code path, now fed canonical data.

## 8. Focused tests (all passing)

- `itineraryArtifacts` server (12) + frontend (10) vs shared fixtures — parity.
- `canonicalResponse` (13) — strip-before-hash, order-insensitive hashes, createdAt excluded, id/version defaults.
- `planPersistence` (16) — every idempotency/stale/conflict rule + controller guard + legacy fallback + delayed-stale-write.
- `trailiePipelineUtils` buildPlanDocument identity embedding (2).
- `sharedTripPayload` (9) — plan_only excludes user msgs/formData; plan_plus assistant-only; full opt-in; internals stripped.
- `persistCanonicalPlan` frontend (4) — persists server plan verbatim, never rebuilds.

## 9. Full-suite results

- **Server (jest):** all 5 Stage-8 suites green (58 tests). Broader suite: 575 passing; 9 suites fail **only** on missing `NPS_API_KEY` and `mongodb-memory-server` in this sandbox — confirmed none reference Stage-8 modules (pre-existing env failures).
- **Frontend (vitest):** `src/utils` — 15 files / 108 tests green. `TripPlannerChat.jsx` lint: 0 errors (6 pre-existing exhaustive-deps warnings, none in edited regions).

## 10. Remaining migration / compatibility risks

- **Legacy trips / old clients:** plans without envelope identity are accepted (no guard) so nothing breaks mid-rollout; they gain protection once re-saved by an updated client. Old shared trips default to `plan_only` (safe).
- **Version monotonicity depends on the client echoing `priorResponseVersion`.** A client that doesn't send it stamps version 1 each time → `CONFLICT` on a second write to the same slot (plan kept, not corrupted). Acceptable and safe, but full protection needs the frontend deployed.
- **Feedback command not yet narrowed (Stage-8 spec §8):** thumbs-up/down still round-trips via `updateTrip` with the full conversation. It no longer corrupts the plan (same identity → IDEMPOTENT, plan untouched), but a dedicated narrow feedback endpoint is still worth adding.
- **Review telemetry still rides in `plan.reviewMeta`** (stripped from shares). The separate durable telemetry structure (Stage-8 spec §7) is deferred to Stage 9's off-critical-path review.
- **Anonymous routes** emit the isomorphic-stripper `contentUnchanged` fix but not the envelope (guests don't persist trips) — intentional.
- **End-to-end assertions not yet automated:** "restored == saved == displayed" and "PDF/export == canonical" are unit-covered at the seams but need an integration test (blocked here by Mongo/NPS env).

---

*No commit, no push, no Plan-AI redesign, no reviewer enforcement. Stage 9 (durable, sampled, off-critical-path shadow review keyed by responseId + contentHash + itineraryHash) can now build on a stable canonical response identity.*
