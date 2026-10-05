# Trailie Stage 14.2A — Revision-1 fail-safe terminal and final event order

**Offline implementation and tests only. Zero provider calls.**
Flag still off, no frontend changes, nothing committed or pushed.

---

## 1. Revision-1 snapshot seam

`buildRevisionOneOutbound` now returns a third member, `snapshot`, frozen with
`Object.freeze` and containing exactly what `itinerary_ready` published:

```js
{ responseId, responseVersion, itineraryHash,
  revision1Response, revision1CanonicalPlan, frozenItineraryData,
  feasibilityIssues, corrections, planScore, parkName, parkCode }
```

`revision1Response` and `revision1CanonicalPlan` are **reference-identical** to the
emitted objects (asserted with `toBe`), so no later path can rebuild them from
mutable route state. The route stores it once as `revisionOneSnapshot` at emission
time.

## 2. Corrected mismatch behavior

The previous fall-through was unsafe exactly as you identified: a client that had
already persisted revision 1 holds an immutable `itineraryHash`, so a terminal
`done` carrying the mismatched itinerary would be rejected as
`revision_itinerary_hash_changed` — leaving the user with an unsavable response.

New behavior on mismatch:

```
discard candidate revision-2 plan AND prose
→ log bounded code revision_itinerary_hash_mismatch
→ buildMismatchSafeTerminal(snapshot)  — deterministic prose from the frozen rev-1 itinerary
→ done built from the revision-1 canonical plan and hash
```

`prose_ready` is **not** emitted on this path. Sequence becomes:

```
response_started → thinking* → itinerary_ready → prose_generation_started → done
```

## 3. Safe terminal construction

`buildMismatchSafeTerminal` returns `{ envelope, canonicalPlan, prose, itineraryData,
usedDeterministicFallback: true }` where the envelope:

| Requirement | Implementation |
|---|---|
| same `responseId` / `responseVersion` | taken from the snapshot |
| revision-1 itinerary byte-for-value | `itineraryData: snapshot.frozenItineraryData` (same reference) |
| revision-1 itinerary hash | recomputed from the same data ⇒ identical hash (asserted) |
| sanitized deterministic prose | `renderDeterministicItineraryResponse` over the frozen itinerary |
| direct-terminal compatible | **no** `responseRevision`, `previousRevision`, or `lifecycleStatus` |
| no `expectedPreviousRevision` | never set, on envelope or plan |
| no candidate data | asserted absent by string search |

**Refusal cases** (return `null` → route emits the singular bounded error, `res.end()`,
no `done`): missing snapshot, missing frozen itinerary, renderer throw, empty prose,
and — found while testing — **an itinerary with zero days**. That last case rendered a
title-only `"## Your trip plan"`, which passed a naive emptiness check and would have
persisted as a valid terminal response. The guard now requires at least one day.

The route's failure branch is asserted to contain `type: 'error'`, `res.end()`,
`return;`, and **no** `type: 'done'`.

## 4. Old-client and new-client persistence evidence

| Case | Outcome |
|---|---|
| no stored revision 1 + safe terminal `done` | **ACCEPT** (create) |
| stored explicit revision 1 + safe terminal `done` | **ACCEPT** as revision 2 (`newer_revision`, stored 1 → incoming 2) |
| same safe terminal repeated | **IDEMPOTENT** |
| stored revision 1 + `done` with a changed itinerary hash | **CONFLICT** — still blocking |

## 5. Mutation safety

Tests drive the full mismatch flow and assert: no `prose_ready` emitted (event list is
exactly `response_started, itinerary_ready, prose_generation_started`); candidate prose
and plan never appear in any event; the candidate plan never enters `done`; `done`
carries the revision-1 hash, plan and frozen itinerary; final prose is the deterministic
fallback; the bounded code contains no plan identifiers.

**The guard is mutation-tested.** A `reuseSnapshot: false` variant bypasses snapshot
reuse and falls through to the candidate terminal — the pre-14.2A behavior. Two tests
then prove that variant is broken:

- it leaks the candidate itinerary into `done` (different hash, candidate stop names present)
- **a client holding revision 1 rejects it** with `revision_itinerary_hash_changed`

Those tests fail if the fix is reverted, which is what makes the guard load-bearing.

## 6. Final event order

`response_started` now fires immediately after `setSseHeaders`, **before** the first
`thinking` event and before `prepareChatContext`. Asserted by source-position tests.

```
success:            response_started → thinking* → itinerary_ready
                    → prose_generation_started → prose_ready → done
structured failure: response_started → thinking* → done
mismatch fail-safe: response_started → thinking* → itinerary_ready
                    → prose_generation_started → done
```

Nothing is emitted after `done` (`sealTerminal`).

### One deviation, stated explicitly

The emitter gate changed from `flag && isToolFirst && userRequestedItinerary` to
`flag && isToolFirst`. `userRequestedItinerary` is derived inside
`prepareChatContext` (`shouldRequestItineraryJson`, `ai.js:1689`) and simply does not
exist at turn admission — and the required structured-failure sequence
(`response_started → thinking* → done`) proves `response_started` must fire for turns
that never produce an itinerary.

Consequently `response_started` carries `requiresStructuredItinerary: null` rather than
`true`: at admission it is genuinely undetermined. **`itinerary_ready` is the
authoritative signal** that an itinerary is coming, and the Stage 14.3 contract below
says so. The itinerary-specific events remain correctly gated because
`onItineraryReady` only fires for a finalized, frozen itinerary.

## 7. Abort-before-Phase-A evidence

After writing `response_started` the route checks `signal?.aborted || res.writableEnded`
and returns before `prepareChatContext` — so a closed connection costs **zero provider
calls**. A source-position test asserts the guard sits between `responseStarted` and
`prepareChatContext`. The existing `onItineraryReady` disconnect guard is unchanged and
still proven behaviorally (returning false spends zero prose calls).

## 8. Timing semantics

One monotonic origin at emitter construction (turn admission). Verified that
intervening `thinking` events do not reset it, and that on the mismatch path
`timeToProseReadyMs` stays **`null`, never `0`**, while `timeToItineraryReadyMs` and
`timeToResponseCompleteMs` are recorded.

## 9. Lifecycle compatibility (directional)

| Stored | Incoming | Outcome |
|---|---|---|
| status absent (legacy) | durable status | IDEMPOTENT (compatible) |
| durable status | terminal `done`, status absent | IDEMPOTENT (compatible) |
| `prose_ready` | `fallback_complete` | **CONFLICT** (`same_revision_different_lifecycle_status`) |

## 10. Test results

| Suite | Tests |
|---|---|
| `utils/__tests__/mismatchSafeTerminal.test.js` | 32 (new) |
| `utils/__tests__/earlyRevisionEvents.test.js` | 40 |
| `utils/__tests__/responseRevisions.test.js` | 45 |
| `utils/__tests__/revisionClientContract.test.js` | 10 |
| `routes/__tests__/earlyEventRouteScope.test.js` | 16 |
| `routes/__tests__/persistenceOwnership.test.js` | 20 |
| **Focused total** | **163 passing** |

```
route parity, flag OFF :  77/77 passing
route parity, flag ON  : 237/237 passing
full non-network suite : 131 suites, 1,327 tests → 1,322 passing
```

The 5 failures are the unchanged pre-existing live-data ones (`npsParkAdapter`,
`astroFacts`, `npsParkConditions`, `parkChatImages`, `trailieFetchPlanner`).

One of my own Stage 14.2 assertions was updated, not weakened: it asserted the old
three-part gate, which 14.2A deliberately changed. It now asserts the two-part gate plus
the natural frozen-itinerary gating.

---

## 11. Final Stage 14.3 frontend persist-before-reveal contract

```
on `response_started`
  → record responseId; disable duplicate submission for this turn
  → `requiresStructuredItinerary` may be null — do NOT branch on it.
    `itinerary_ready` is the authoritative signal that an itinerary is coming.

on `itinerary_ready`
  → DO NOT RENDER YET
  → persist payload.response + payload.canonicalPlan VERBATIM through the existing
    writer (createTrip when there is no trip, else updateTrip)
  → send NO expectedPreviousRevision
  → on success → set currentTripId; reveal the itinerary card;
                 show "Preparing trip notes…" (presentation state only, never content)
  → on failure → do NOT reveal; do NOT persist any buffered revision 2;
                 wait for `done` and persist it once as a direct terminal

on `prose_generation_started`
  → presentation only; never persisted

on `prose_ready`
  → if revision 1 is still saving → BUFFER; do not persist, do not display
  → once revision 1 has succeeded → persist payload.response + payload.canonicalPlan
    with expectedPreviousRevision: payload.expectedPreviousRevision (1)
  → on success → append prose by UPDATING the assistant message matched on responseId
  → on conflict/stale → reconcile to storedIdentity; do not auto-retry

on `done`
  → terminal reconciliation, NOT a second assistant turn
  → if revision 2 already persisted with matching hashes → no second write
  → else persist as today (direct terminal, no expectedPreviousRevision).
    This is also the mismatch fail-safe path: `done` may arrive with deterministic
    fallback prose and the revision-1 itinerary, and it is always savable — with or
    without a stored revision 1.

on `error`
  → singular; a previously persisted revision 1 remains valid and recoverable
```

**Invariants the frontend must uphold**

1. Nothing is revealed before its persistence succeeded — what the user sees is always
   already recoverable.
2. Revision 2 is never persisted or displayed before revision 1 succeeds.
3. The itinerary card is keyed on `itineraryHash`, so `prose_ready` cannot remount it;
   expanded-day state and card interactions survive.
4. The assistant message is reduced by `responseId` — update, never append.
5. No auto-scroll on prose arrival.
6. Exactly one trip per turn; `currentTripId` comes from the revision-1 write.
7. Duplicate submission is disabled while a response is active — this is the mitigation
   for duplicate *generation*, which `plan.responseId` does not solve.
8. The frontend never reads the server flag; it reacts only to events it receives.
9. `done` never creates a second assistant message, in any path.

---

## Stop

Stage 14.2A complete. Flag off, no frontend implementation, zero provider calls.
