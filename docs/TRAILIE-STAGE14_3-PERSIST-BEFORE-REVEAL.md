# Trailie Stage 14.3 — Frontend persist-before-reveal lifecycle

**Offline implementation and deterministic tests only. Zero provider calls.**
Flag still off by default, nothing committed or pushed, no durable Phase B
recovery, no prose regeneration, anonymous and non-streaming behavior untouched.

The invariant everything below serves:

```
nothing becomes visible until that exact revision has been persisted successfully
```

---

## 0. Two findings that changed the shape of the work

### Finding 1 — the server still replays prose as `chunk` events

`replayProseToSse` runs inside `runTrailieItineraryTurn` (`trailieItineraryTurn.js:322`)
and therefore fires **before** `earlyEvents.proseReady` (`ai.js:3185`). The real
authenticated stream is:

```
response_started → thinking* → itinerary_ready → prose_generation_started
                 → chunk* → stream_end → prose_ready → done
```

Left alone, `onChunk` would create a **second** assistant message beside the
durable revision-1 turn, and would put prose on screen **before revision 2 was
persisted** — breaking both §9 and the key invariant.

Fixed on the client, inside this stage's scope: once the lifecycle owns a turn
(`enteredEarlyLifecycle === true`), `applyStreamContent` and
`markStreamFinalizing` return immediately. Prose becomes visible only through
revision-2 persistence. No server change was made.

### Finding 2 — the chat had no itinerary card to reveal

The itinerary has always reached the chat as markdown *inside* the assistant
bubble; `currentPlan` only drove the "Plan"/PDF buttons. Revision 1 carries
`content: ""`, so "reveal the itinerary card" had no surface — it would have
revealed an empty bubble.

`EarlyItineraryCard` was added: it renders the persisted `plan.days` (reusing
`SharedTripDayCard`), surfaces `feasibilityIssues`, and owns its own collapse
state. §13 requires it to be keyed on `itineraryHash`, which is now the case.

---

## 1. Scope

Early delivery activates **only** for `authenticated streaming + typed early
events actually received`. The frontend never reads the server flag; event
presence is the switch.

| Path | Behavior |
|---|---|
| authenticated streaming, events received | new persist-before-reveal lifecycle |
| authenticated streaming, flag off | unchanged — one terminal `done` write |
| authenticated non-streaming | unchanged |
| anonymous streaming / non-streaming | unchanged (`onEarlyEvent` is not even passed to `chatAnonymousStream`) |
| legacy generation mode | unchanged |
| prose-only structured failure (no `itinerary_ready`) | unchanged |

---

## 2. The lifecycle coordinator

Race handling is **not** inline in `TripPlannerChat.jsx`. It is split in two:

| Module | Role |
|---|---|
| `src/utils/earlyRevisionLifecycle.js` | **pure** reducer + validators. No I/O, no timers, no React. Returns declarative effects. |
| `src/utils/earlyRevisionCoordinator.js` | thin side-effect driver: runs persistence, feeds results back, applies view updates, records timings. |
| `src/utils/earlyRevisionMessages.js` | pure message-list reducers (update vs append) + stored-revision presentation. |
| `src/components/plan-ai/EarlyItineraryCard.jsx` | the revealed card, `React.memo`, keyed on `itineraryHash`. |

Transactions are keyed by `(responseId, responseVersion)`. Client-only states,
never persisted:

```
idle · started · saving_revision_1 · itinerary_visible · revision_2_buffered
saving_revision_2 · saving_terminal · terminal_visible · save_failed
stream_aborted · legacy
```

The coordinator is the sole owner of revision buffering, persistence ordering,
early reveal, terminal reconciliation, duplicate suppression, and update-vs-append.

---

## 3. `response_started`

Creates a hidden pending transaction. No visible message, no trip, no
persistence, no branching on `requiresStructuredItinerary` — `null` is stored as
`expectsItinerary: null` and never read. Duplicates are idempotent; a changed
identity on the same transport turn emits `CONTRACT_ERROR: response_identity_changed`.
Thinking UI is untouched.

---

## 4. `itinerary_ready` — persist before reveal

Validated before anything else (§14 below). On acceptance the **server-built
objects are handed to the existing writer verbatim** — no reconstruction, no
rehashing, no placeholder prose, no field renaming, and `expectedPreviousRevision`
is deliberately absent so revision 1 stays a valid create.

While saving: the SSE reader is never blocked, later events are buffered, and
nothing is revealed.

**On success** (`ACCEPT` *or* `IDEMPOTENT`): set the real `currentTripId`, upsert
exactly one assistant turn keyed by `responseId`, reveal the frozen card, keep
`content: ""`, show `Preparing trip notes…` as presentation state, mark
`pendingProse`, preserve the exact `itineraryHash`.

**On failure** (stale / conflict / validation / transport): nothing is revealed,
any buffered revision 2 is discarded, `done` is retained, and exactly **one**
direct-terminal write is allowed. Existing `resolveSaveState` and
`storedIdentity` reconciliation are reused; no automatic overwrite, no auto-retry.

---

## 5. `prose_generation_started`

Presentation only. Never persisted, creates no message, does not touch the card,
and is valid before revision-1 persistence completes (asserted).

---

## 6. `prose_ready` — ordered successor persistence

Validated against the revision-1 context the client actually persisted, not
against the event's own claims. Persisted through the existing writer with
`expectedPreviousRevision: 1`, targeting the trip revision 1 created or resolved.
`createIfMissing: false` — **revision 2 can never create a trip.**

- **Revision 1 still saving** → buffered, not displayed, not persisted. One
  buffer slot; an identical duplicate is idempotent, a differing one is a
  contract conflict.
- **On success** → the existing assistant turn is *updated* by `responseId`.
  Content is filled for the first time, the pending indicator clears, and the
  card instance, its collapse state and its `itineraryHash` key are carried over
  **by reference from the stored turn** — so revision 2 structurally cannot
  replace itinerary data or remount the card. No auto-scroll.
- **Fallback prose** takes the identical path; `fallback_complete` produces no
  separate error UI (asserted: the effect and key set are the same).
- **On failure** → the saved card stays, unsaved prose is never shown, `done` is
  retained for one bounded terminal attempt.

---

## 7. `done` reconciliation matrix

| Transaction state | Behavior | Writes |
|---|---|---|
| never entered the lifecycle | `LEGACY_TERMINAL` → existing path, untouched | 1 (legacy) |
| revision 1 still saving | buffer; the revision-1 outcome decides | 0 now |
| revision 1 failed | discard successor; persist `done` once as direct terminal; reveal **only after** it succeeds | 1 |
| revision 1 ok, no `prose_ready` | persist `done` once as terminal successor | 1 |
| revision 2 saving / uncertain | buffer; after the attempt: identical → complete with no write; uncertain → one idempotent terminal attempt; hashes differ → fail closed, keep the highest persisted revision | 0 or 1 |
| revision 2 already succeeded | confirmation only — no append, no trip creation, no auto-save. A conflicting `done` is a contract error and never replaces persisted content | 0 |

---

## 8. Duplicate persistence entry points removed

For a turn that entered the lifecycle, `handleSendMessage` returns immediately
after `earlyCoordinator.drain()`: the legacy terminal block, the
`assistantMessageForSave` append, `selectPlanToPersist` and
`autoSaveConversation` **do not run**. For a turn that did not, `legacyTerminal`
sets a flag and the pre-Stage-14 path runs exactly as before.

### Persistence call counts (all measured by test)

| Path | rev 1 | rev 2 | terminal | legacy | total |
|---|---|---|---|---|---|
| normal early flow (+ matching `done`) | 1 | 1 | 0 | 0 | **2** |
| fast server / slow persistence (all buffered) | 1 | 1 | 0 | 0 | **2** |
| revision-1 failure | 1 | 0 | 1 | 0 | **2** (1 successful) |
| revision-2 hard failure + `done` | 1 | 1 | 1 | 0 | **3** |
| revision-2 uncertain + `done` | 1 | 1 | 1 | 0 | **3** |
| structured failure / flag off / legacy | 0 | 0 | 0 | 1 | **1** |
| every event duplicated | 1 | 1 | 0 | 0 | **2** |
| disconnect before revision 1 | 0 | 0 | 0 | 0 | **0** |

Two trips are never created: revision 2 and the terminal write both carry the
real `tripId`, and `currentTripIdRef` is set **synchronously** inside the create
before any racing write can read it.

---

## 9. Assistant-message and plan identity

`one responseId → one assistant turn → one canonical plan`, proven by test:

- conversation length does not increase when prose arrives
- plan count stays 1; the assistant turn keeps its `id`, `timestamp`, `responseId`
- revision 2 cannot replace `itineraryHash` or `itineraryPlan` (a tampered
  successor is ignored in favour of the stored values)
- a byte-equivalent plan object does not replace the stored one → no remount
- user messages are never duplicated by either write

---

## 10. New-trip and existing-trip

Revision 1 creates via the existing `userId + plan.responseId` idempotency key
and returns the real id; a local `temp-*` id is never used afterwards. On an
existing trip, revision 1 is the normal guarded update for the new logical turn
and revision 2 is same-turn succession. `buildResponseSavePayload` needed only
one additive change — an optional `expectedPreviousRevision`, omitted for
direct-terminal writes. Its `expectedPreviousVersion` is harmless for revision 2
because `decidePersistenceOutcome` evaluates the same-version branch first.

Concurrent timing is tested directly: `prose_ready` arriving before the
revision-1 create returns buffers, then persists against the returned real id.

---

## 11. Disconnect and component lifecycle

| Situation | Behavior |
|---|---|
| before revision 1 | no card, no persistence — unchanged from today |
| while revision 1 is saving | the started request settles; reveals if still mounted; after `dispose()` no React state is touched but the trip is still saved and recoverable |
| after revision 1 succeeded | card stays; indicator replaced with `Trip notes were not completed.`; rejected/partial prose never shown |
| after revision 2 succeeded | untouched |

No further provider or persistence calls are made automatically. `dispose()` runs
on unmount and at the start of the next turn.

---

## 12. Stored revision-1 rendering

`resolveAssistantPresentation` returns `{ showProseBubble: false, pendingLabel:
'Trip notes pending' }` for a stored `responseRevision: 1 / itinerary_ready /
content: ''`. The persisted card renders, and no empty prose bubble appears.
A completed revision 2 and a legacy response with no revision fields both render
normally. A revision-1 row that unexpectedly has content still shows its bubble.

No regenerate endpoint or action was added.

---

## 13. Card stability evidence

Keys: assistant turn → `responseId`; itinerary card → `itineraryHash`.

Two independent proofs:

1. **Component-level** — `EarlyItineraryCard` takes an `onMount` probe. It fires
   once and stays at one across a pending-label change and across a
   byte-equivalent plan object.
2. **Integration** — driving the real event sequence through the real coordinator
   and the real message reducers, `onMount` is still called exactly once after
   prose arrives; collapse state set before prose survives it.

---

## 14. Client-side safety validation

Defence in depth; the server stays authoritative. Malformed payloads are **never
repaired** — a rejected event means the turn does not enter the lifecycle, so the
unchanged terminal `done` path still produces a complete, savable response.

Rejected: mismatched response identity, mismatched `responseVersion`, changed
`itineraryHash`, invalid revision ordering (including a wrong
`expectedPreviousRevision`), nonempty revision-1 content, unsupported/transient
lifecycle status, missing canonical plan, plan/envelope hash disagreement, empty
revision-2 content, and forbidden internal content anywhere in the payload:
`<!-- TRAILIE_* -->` alignment markers, `[ITINERARY_JSON]`, `create_itinerary`,
`tool_use`, `input_schema`.

---

## 15. Metrics

One client turn origin. Timings: `timeToItineraryReadyEventMs`,
`revision1PersistenceDurationMs`, `timeToItineraryVisibleMs`,
`timeToProseReadyEventMs`, `revision2PersistenceDurationMs`,
`timeToProseVisibleMs` (prose timings stay `null`, never `0`, when prose never
arrives).

Counters: `revision1PersistenceFailure`, `revision2PersistenceFailure`,
`bufferedRevision2Count`, `doneReconciliationCount`, `duplicateEventCount`,
plus the four that must stay zero — `displayedBeforePersistenceCount`,
`displayedPersistedMismatchCount`, `duplicateAssistantMessageCount`,
`duplicatePlanCount`. These are genuine self-checks, not constants: the reducer
increments them when a reveal happens without a matching recorded persistence, or
when a second reveal is suppressed. **All four are asserted zero across every
modeled path.** Local deterministic metadata only; nothing new is sent externally.

---

## 16. Test results

| Suite | Tests |
|---|---|
| `utils/__tests__/earlyRevisionLifecycle.test.js` | 73 |
| `utils/__tests__/earlyRevisionCoordinator.test.js` | 26 |
| `utils/__tests__/earlyRevisionMessages.test.js` | 19 |
| `components/plan-ai/__tests__/earlyDeliveryIntegration.test.jsx` | 8 |
| `components/plan-ai/__tests__/EarlyItineraryCard.test.jsx` | 8 |
| `services/__tests__/aiSseEvents.test.js` | 7 |
| `utils/__tests__/responseSavePayload.test.js` | 6 (2 new) |
| **Stage 14.3 focused total** | **147 passing** |

```
frontend full suite : 54 files, 416 tests → 405 passing
```

The 11 failures are pre-existing and unrelated (`Header`, `WeatherWidget`,
`useParkExploreIndex`, `buildDayByDayPlanFollowUp`) — verified by stashing the
Stage 14.3 changes and reproducing the identical 11 failures in the identical 4 files.

**Backend, unchanged and re-verified:**

```
server src/ suite            : 131 suites, 1,327 tests → 1,322 passing
route parity, flag ON        : 23 suites,    237 tests → 237 passing
revision/persistence suites  :  8 suites,    206 tests → 206 passing
```

`131 / 1,327 / 1,322 / 5` is byte-identical to the Stage 14.2A baseline; the 5
failures are the same pre-existing live-data ones. No server file was modified in
this stage.

---

## 17. Proposed Stage 14.4 — reconnect and regeneration

**Problem it solves.** Under request-bound Phase B (option A), a disconnect after
`itinerary_ready` leaves a durable revision 1 and no prose, forever. Today the
only recovery is asking again, which mints a new `responseId` and a new turn.

### 17.1 Durable state to recover from

No new server-side revision store is needed. The trip row already carries
everything: `plan.responseId`, `plan.responseVersion`, `plan.responseRevision: 1`,
`plan.lifecycleStatus: itinerary_ready`, and the frozen `days` / `itineraryHash`.
`GET /trips/:id` is the recovery endpoint; §11 of Stage 14.1 (no
`GET /api/ai/response/:responseId`) stands.

### 17.2 New endpoint

```
POST /api/ai/response/:responseId/prose
body: { tripId, itineraryHash, expectedPreviousRevision: 1 }
```

- **Authorization**: the trip must belong to the caller and its stored plan must
  carry that `responseId`.
- **Precondition**: stored `responseRevision === 1` and stored `itineraryHash`
  equals the supplied one. Anything else → `409`, never a silent regeneration.
- **Runs Phase B only.** Phase A is not re-run; the frozen itinerary is loaded
  from the stored plan, so the itinerary provably cannot change. Reuses
  `runProseConsistency` + `assertItineraryUnchanged` unchanged.
- **Emits the same typed events** (`prose_generation_started`, `prose_ready`,
  `done`) over SSE, so the Stage 14.3 coordinator drives it with **no new client
  state machine** — it is constructed with `initialTripId` set and seeded at
  `itinerary_visible` rather than `idle`.
- **Idempotency**: keyed by `(responseId, 2)`. A regeneration racing a completed
  revision 2 is `IDEMPOTENT` or `CONFLICT` via the existing guard.
- Flag: `TRAILIE_PROSE_RECOVERY`, default off.

### 17.3 Client behavior

A stored revision 1 renders its card plus `Trip notes pending` (already shipped
in 14.3) and gains one explicit **"Generate trip notes"** action. It is disabled
while any response is active, and it is a normal cap-counted request — the user
consciously chose it, which is the §9 answer to "should abandoned prose be
completed": no automatic spend, ever.

On success the coordinator's existing `prose_ready` path fills the same assistant
turn. On failure the card stays and the action becomes available again, bounded
to one in-flight attempt.

### 17.4 What 14.4 must prove

- regeneration never re-runs Phase A and never changes `itineraryHash`
- a mismatched or absent stored revision 1 is refused with no provider spend
- exactly one revision 2 lands for one `responseId`, whatever the retry pattern
- concurrent regenerate + a fresh turn on the same trip cannot cross-write
- the recovered response is byte-identical in shape to a normally delivered one
  (`routeReplayCanonicalEquality` extended to the recovery route)
- flag off ⇒ the endpoint 404s and the action does not render

### 17.5 Open product decisions carried forward

1. Does regenerate consume quota? (recommendation: yes — it is a real Phase B call)
2. Is a pending-notes plan shareable? (§12 assumes yes, clearly labeled)
3. Is there a time limit after which a pending revision 1 stops offering regenerate?

---

## Stop

Stage 14.3 complete. Flag off, no prose regeneration, no durable Phase B
recovery, no commits, zero provider calls.
