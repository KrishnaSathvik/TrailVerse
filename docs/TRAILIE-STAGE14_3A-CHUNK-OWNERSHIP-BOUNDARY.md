# Trailie Stage 14.3A — Legacy-chunk ownership boundary

**Offline frontend implementation and deterministic tests only. Zero provider calls.**
Server flag still disabled, no prose recovery, no backend change, nothing committed or pushed.

---

## 0. Verdict on the concern

**The boundary was already at valid `itinerary_ready`, not at `response_started`.**
`enteredEarlyLifecycle` was set in exactly one place —
`onItineraryReady`, *after* validation — and `onResponseStarted` never touched it.
So the prose-only sequence never lost its chunks.

My Stage 14.3 report said "once the lifecycle owns a turn", which read as though
`response_started` were the trigger. That was loose wording, not loose code. It is
now proven rather than asserted, and the flag is renamed so the sentence cannot be
written ambiguously again.

**However, the review's §7 exposed a genuine defect.** A *malformed*
`itinerary_ready` left the flag `false`, which meant the client fell all the way
back to legacy chunk rendering — displaying unpersisted prose for a response
whose revision structure it had just rejected. That is fixed here.

---

## 1. Exact activation boundary

Three concepts, deliberately never collapsed:

```js
{ responseStartedSeen, earlyRevisionActive, earlyRevisionFaulted }
```

| Event | `responseStartedSeen` | `earlyRevisionActive` | `earlyRevisionFaulted` | Chunks | `stream_end` | Terminal owner |
|---|---|---|---|---|---|---|
| `response_started` | **true** | false | false | **render** | **finalize** | legacy |
| valid `itinerary_ready` | true | **true** | false | suppress | suppress | coordinator |
| invalid `itinerary_ready` | true | false | **true** | suppress | suppress | coordinator |

Activation happens **on receipt** of the valid event, not after its persistence —
chunks arrive while revision 1 is still saving. Asserted directly: at
`status === 'saving_revision_1'`, `decideLegacyChunk(...).render === false`.

`response_started` changes nothing observable. Proven by five separate tests: it
does not suppress chunks, does not suppress `stream_end`, does not redirect
terminal persistence, creates no assistant shell or card, and emits no effects at all.

Two pure deciders carry the rule, so it is testable without React:

```js
decideLegacyChunk(state, { responseId }) → { state, render, code? }
decideLegacyStreamEnd(state)            → { state, finalize }
```

`TripPlannerChat` now calls two distinct predicates instead of one overloaded flag:
`renderLegacyChunk()` / `finalizeLegacyStream()` for display, and
`coordinator.ownsTerminalPersistence()` for the write path.

---

## 2. Structured-failure chunk behavior

```
response_started → thinking* → chunk* → stream_end → done      (no itinerary_ready)
```

Unchanged in every respect: all chunks render, `stream_end` finalizes, `done`
takes the `LEGACY_TERMINAL` path, and **exactly one** terminal write occurs. The
turn is never classified as early-revision merely because `response_started`
arrived (`earlyRevisionActive === false && earlyRevisionFaulted === false`
asserted after `done`). No `EarlyItineraryCard`, no revision-1 shell.

Flag-off and legacy streams (no typed events at all) behave identically — the
reducer starts in `idle`, and `idle` renders.

---

## 3. Early-path chunk suppression

```
response_started → itinerary_ready → chunk* → stream_end → prose_ready → done
```

Proven end to end through the real coordinator and the real message reducers:

- revision 1 begins saving immediately; the card stays hidden until it succeeds
- every chunk after `itinerary_ready` is suppressed — `rendered === []`
- no chunk creates a second assistant message or alters the pending shell's content
- `stream_end` does not finalize (`shouldFinalizeLegacyStream() === false`)
- revision 2 is the **first** prose-bearing revision displayed, and only after it persists
- matching `done` reconciles with no third write

Under a slow revision-1 save with the real production order
(`itinerary_ready → chunk → chunk → stream_end → prose_ready → done → save succeeds`):
all chunks suppressed, revision 2 and `done` buffered, then revision 1 → card →
revision 2 → prose → reconcile. **Exactly two successful writes. No temporary
prose bubble appears at any point** (asserted by the absence of `REVEAL_PROSE`
across the whole effect log, and by DOM assertion in the component test).

A revision-1 persistence **failure does not re-enable chunks**:
`earlyRevisionActive` stays `true`, so suppression persists, the card never
appears, the explicit revision 2 is discarded, and `done` gets exactly one
direct-terminal write whose content is revealed only after it succeeds.

---

## 4. Invalid-event fail-closed behavior (the fix)

| | no `itinerary_ready` | malformed `itinerary_ready` |
|---|---|---|
| classification | structured failure | **faulted** |
| chunks | render | **suppressed** |
| `stream_end` | finalizes | suppressed |
| revision 1 | not attempted | not attempted |
| terminal | `LEGACY_TERMINAL` | **`PERSIST_TERMINAL`**, reason `invalid_early_event` |
| reveal | as today | only after that write succeeds |
| writes | 1 | 1 |

The malformed payload is never repaired, a bounded contract code is recorded
(`revision_1_content_not_empty` in the test), `invalidEarlyEventCount` increments,
and a repeated `done` still yields exactly one terminal attempt.

**Two Stage 14.3 assertions were updated, not weakened.** Both encoded the old
fall-back-to-legacy behavior that this stage deliberately corrects; they now
assert the fail-closed contract and the reason slug. Persist-before-reveal is
strictly stronger under the new behavior.

---

## 5. Cross-turn isolation evidence

State lives in a closure per coordinator; `handleSendMessage` constructs one per
turn and disposes the previous one before starting the next.

- Turn A activated (suppressing) → a fresh Turn B coordinator renders normally,
  with `suppressedLegacyChunkCount === 0` and `crossTurnChunkLeakCount === 0`
- two live coordinators are independent — A suppresses, B renders, both leak-free
- a **disposed** coordinator always refuses to render and records
  `crossTurnChunkLeakCount += 1`; that is the only path by which a late chunk from
  a dead stream could reach the UI

### Transport assumption, stated explicitly

The `chunk` frame carries **no `responseId`** on the wire. The documented
assumption is: *one authenticated stream serves one active turn.* It is enforced
structurally, not by convention — each `chatStream` call creates its own
`consumeAiSseStream` closure whose callbacks are bound to that turn's coordinator,
so there is no module-level chunk state to leak (asserted by the two-live-coordinators
test). Where a caller *can* supply an identity, `decideLegacyChunk` refuses a
mismatch with `legacy_chunk_response_mismatch` rather than attributing it to the
active transaction. An unkeyed chunk is attributed to this transaction only and
is never reassigned.

Suppressed chunk text is proven never to reach persisted content: a
`UNPERSISTED-DRAFT-MARKER` chunk appears in neither revision-1 nor revision-2
write payloads, nor anywhere in the DOM.

---

## 6. Persistence and display call counts

| Path | rev 1 | rev 2 | terminal | legacy | total | chunks rendered |
|---|---|---|---|---|---|---|
| normal early flow + matching `done` | 1 | 1 | 0 | 0 | **2** | 0 |
| slow rev-1 save, everything buffered | 1 | 1 | 0 | 0 | **2** | 0 |
| revision-1 failure | 1 | 0 | 1 | 0 | **2** (1 ok) | 0 |
| **invalid `itinerary_ready`** | 0 | 0 | 1 | 0 | **1** | **0** |
| structured failure / prose-only | 0 | 0 | 0 | 1 | **1** | **all** |
| flag off / legacy | 0 | 0 | 0 | 1 | **1** | **all** |
| duplicate events + duplicate chunks | 1 | 1 | 0 | 0 | **2** | 0 |

---

## 7. Metrics results

| Counter | Early path | Structured failure | Invalid event |
|---|---|---|---|
| `suppressedLegacyChunkCount` | 2–5 (positive) | **0** | positive |
| `suppressedLegacyStreamEndCount` | 1 | **0** | 1 |
| `legacyChunksRenderedWithoutItineraryReady` | **0** | 3 (positive) | 0 |
| `invalidEarlyEventCount` | 0 | 0 | **1** |
| `crossTurnChunkLeakCount` | **0** | **0** | **0** |

`crossTurnChunkLeakCount` is asserted **zero across all four well-formed paths**,
and is proven non-trivial by the disposed-coordinator test where it reaches 1.
The four Stage 14.3 zero-counters (`displayedBeforePersistenceCount`,
`displayedPersistedMismatchCount`, `duplicateAssistantMessageCount`,
`duplicatePlanCount`) remain zero everywhere.

---

## 8. Test results

| Suite | Tests |
|---|---|
| `utils/__tests__/legacyChunkBoundary.test.js` | **37 (new)** |
| `utils/__tests__/earlyRevisionLifecycle.test.js` | 73 |
| `utils/__tests__/earlyRevisionCoordinator.test.js` | 26 |
| `utils/__tests__/earlyRevisionMessages.test.js` | 19 |
| `components/plan-ai/__tests__/earlyDeliveryIntegration.test.jsx` | 14 (6 new) |
| `components/plan-ai/__tests__/EarlyItineraryCard.test.jsx` | 8 |
| `services/__tests__/aiSseEvents.test.js` | 7 |
| `utils/__tests__/responseSavePayload.test.js` | 6 |
| **Stage 14.3 + 14.3A focused total** | **190 passing** |

All 14 required test items in §11 are covered.

```
utils + services + plan-ai suites : 29 files, 345 tests → 345 passing
frontend full suite               : 55 files, 459 tests → 448 passing
eslint (changed files)            : 0 errors
```

The 11 failures are the same pre-existing, unrelated ones (`Header`,
`WeatherWidget`, `useParkExploreIndex`, `buildDayByDayPlanFollowUp`), verified in
Stage 14.3 by stashing and reproducing them identically.

**Backend, re-verified unchanged:**

```
server src/ suite      : 131 suites, 1,327 tests → 1,322 passing  (5 pre-existing live-data)
route parity, flag ON  :  23 suites,   237 tests → 237 passing
```

Byte-identical to the Stage 14.2A baseline.

---

## 9. Did anything change outside the frontend lifecycle modules?

**No.** `git status` for `server/` and `shared/` lists exactly the same file set
as at session start — no server file was modified by Stage 14.3 or 14.3A.

Frontend files touched in 14.3A:

| File | Change |
|---|---|
| `utils/earlyRevisionLifecycle.js` | three-flag split, fault state, `decideLegacyChunk` / `decideLegacyStreamEnd`, 5 counters |
| `utils/earlyRevisionCoordinator.js` | `shouldRenderLegacyChunk`, `shouldFinalizeLegacyStream`, `ownsTerminalPersistence` |
| `components/plan-ai/TripPlannerChat.jsx` | two distinct predicates replace the single overloaded flag (3 call sites) |

No change to the card, the message reducers, the save payload, or the SSE parser.

---

## 10. Revised Stage 14.4 proposal

Both blockers you raised are treated as **design preconditions**, not
implementation details.

### 10.1 Authorization — `responseId` alone cannot select a plan

The endpoint is scoped by trip, not by response:

```
POST /api/trips/:tripId/response/:responseId/prose
```

Three checks, all before any provider call:

1. `req.user.id` owns `:tripId` (the existing `trips.js` ownership guard — reused, not reimplemented)
2. the trip's stored `plan.responseId === :responseId`
3. stored `plan.responseRevision === 1` **and** `plan.lifecycleStatus === 'itinerary_ready'`

Any failure → `404` (not `403`) so the endpoint cannot be used to probe whether a
`responseId` exists. `responseId` is a random UUID and never a capability on its own.

**Routing note:** mounting under `/api/trips` puts the ownership guard where it
already lives, but the handler must still not write the trip — it emits SSE and
the client persists revision 2, exactly as in 14.3. Stage 14.1's
`persistenceOwnership.test.js` must be extended to cover this new route so the
"AI turn logic never writes a trip" invariant keeps its teeth.

### 10.2 Duplicate provider-call prevention — a real lease, not a disabled button

Client-side disabling is insufficient: two tabs, a double-click, or a retried
request all start two paid Phase B calls. Idempotent revision-2 *persistence*
does not help — the spend already happened.

**Server-side atomic lease**, keyed by `(userId, responseId)`:

```js
// New collection, TTL-indexed. Does NOT live on TripPlan.
{ _id: `${userId}:${responseId}`, acquiredAt, expiresAt, state }
```

- acquire via `findOneAndUpdate({_id, $or:[{expiresAt:{$lt:now}}, {upsert}]}, …, {upsert:true})`
  — a single atomic op; the loser gets `409 prose_generation_in_progress`
- lease TTL ≈ Phase B p99 + margin; released on completion, failure, or abort
- a lease is **not** a job queue: nothing resumes it, nothing retries it. It only
  prevents concurrent spend, which is exactly the gap identified.
- reuses the lease mechanics already proven in `trailieReviewQueue.js`

This keeps the AI route out of trip-content writing: it writes a **lease**, which
is concurrency control, not response content. That distinction should be asserted
by extending `persistenceOwnership.test.js` — the route may touch the lease
collection and nothing else.

### 10.3 Unchanged from the earlier proposal

Phase A is never re-run; the frozen itinerary is loaded from the stored plan, so
`itineraryHash` provably cannot change (`assertItineraryUnchanged` reused). The
same typed events are emitted, so the Stage 14.3 coordinator drives recovery with
**no new client state machine** — constructed with `initialTripId` set and seeded
at `itinerary_visible`. Flag `TRAILIE_PROSE_RECOVERY`, default off. Regeneration
is always an explicit, cap-counted user action; nothing is ever generated automatically.

### 10.4 What 14.4 must prove

- ownership failure and revision-precondition failure both spend **zero** provider calls
- two concurrent regenerate requests produce **one** Phase B call and one `409`
- a lease that expires mid-flight cannot produce two revision-2 writes
- regeneration never re-runs Phase A and never changes `itineraryHash`
- exactly one revision 2 lands per `responseId`, under any retry pattern
- concurrent regenerate + a fresh turn on the same trip cannot cross-write
- the recovered response is shape-identical to a normally delivered one
  (`routeReplayCanonicalEquality` extended to the recovery route)
- `persistenceOwnership` still passes: the route writes a lease and nothing else
- flag off ⇒ `404`, and the client action does not render

### 10.5 Open product decisions still unsettled

1. Does regenerate consume quota? (recommendation: yes — it is a real Phase B call)
2. Is a pending-notes plan shareable? (Stage 14.0 §12 assumes yes, clearly labeled)
3. Does a pending revision 1 stop offering regenerate after some age?

---

## Stop

Stage 14.3A complete. Flag off, no prose recovery implemented, no backend change,
no commits, zero provider calls.
