# Trailie Stage 14.4 — Explicit prose recovery with a fenced spend lease

**Offline implementation with deterministic providers. Zero live provider calls.**
Both flags disabled by default. Nothing committed or pushed. No automatic
background continuation. Anonymous behavior untouched.

---

## 1. Endpoint and authorization contract

```
POST /api/trips/:tripId/response/:responseId/prose
```

Mounted inside `routes/trips.js`, **below `router.use(protect)`**, so it inherits
the existing authentication seam and sits beside the ownership checks it depends
on. Authenticated request-bound SSE.

Order of operations — ownership first, spend last:

```
flag check → 404
→ trip lookup + ownership → 404
→ stored-revision validation → 404
→ lease acquisition → 409
→ Phase B
```

Four distinct failures return the **same bounded body**, so a `responseId`
cannot be probed for existence:

| Case | Response |
|---|---|
| trip does not exist | `404 {success:false, error:'Not found'}` |
| trip belongs to another user | identical |
| response not present in the trip | identical |
| plan and assistant turn disagree on identity | identical |

Asserted directly: the foreign-trip body and the missing-trip body are
`toEqual`. No lease is created and no provider is called on any of these paths.

---

## 2. Stored revision validation (`utils/storedRevisionValidation.js`)

Pure, and evaluated **before** any lease or provider work. Recovery proceeds only
when every one of these holds:

```
plan.responseId === responseId
exactly one assistant turn carries that responseId
assistant.responseId === plan.responseId
plan.itineraryHash === assistant.itineraryHash
plan.responseRevision === 1
plan.lifecycleStatus === 'itinerary_ready'
assistant.content === ''
plan.days is non-empty
hashPayload(reconstructed stored itinerary) === plan.itineraryHash
```

That last line is the one that matters: the stored hash alone proves nothing if
the row was edited underneath us, so the itinerary payload is **rehashed** and
compared. A test mutates `plan.days` and confirms the refusal.

Nothing is normalized or repaired — a refused evaluation returns no `context` at
all, so there is no half-valid object for a caller to use by accident.

**Already complete** is a first-class, cost-free outcome: a stored revision 2 (or
a legacy plan with no revision field, which normalizes to terminal) returns
`200 {alreadyComplete:true}` with **zero provider calls and no lease acquired**.

---

## 3. Phase-B-only seam (`services/proseRecoveryService.js`)

`runProseConsistency` is now exported from `trailieItineraryTurn.js` and reused
verbatim — same buffering, verification, single bounded retry, deterministic
fallback and sanitation as a live turn. No parallel Phase B exists.

The stored itinerary is **deep-frozen before generation**; a test reads
`Object.isFrozen` at four depths from inside the provider callback and asserts
all four are frozen, then proves a `push` on the frozen days array throws.

After generation, `assertItineraryUnchanged` runs. On mismatch the candidate is
discarded and deterministic prose is rendered from the **stored** revision-1
itinerary, so the successor still matches the revision 1 the client holds.

Structural tests assert the module never imports the orchestrator, the structured
generator, the corrector, `TripPlan`, `tripController`, or `privateDraftCapture`,
and contains no model write.

Proven behaviors: same `responseId` and `responseVersion` (never a new turn),
revision 2 carries exactly the stored `itineraryHash`, first-pass prose is used
when it verifies, retry is bounded to one, fallback works, artifact-bearing
drafts are stripped, and the resulting plan is accepted by the **existing**
writer as a `revisionSuccession`.

---

## 4. Lease schema and indexes

`models/TrailieProseRecoveryLease.js`

```js
{ userId, tripId, responseId, leaseToken,
  state: 'generating' | 'awaiting_persistence',
  itineraryHash, expectedContentHash,
  acquiredAt, generationCompletedAt, expiresAt }

unique: { userId: 1, responseId: 1 }
TTL:    { expiresAt: 1 }, expireAfterSeconds: 0
```

The unique index **is** the concurrency boundary. The TTL index is cleanup only —
every read path compares `expiresAt` to the current time itself, so correctness
never waits on Mongo's background deleter. A dedicated test seeds an expired
document, asserts it is still present, and shows it is immediately reclaimable.

---

## 5. Atomic acquisition and stale-owner behavior

One operation:

```js
findOneAndUpdate(
  { userId, responseId, expiresAt: { $lte: now } },  // live lease does NOT match
  { $set: { ...fresh } },
  { upsert: true, new: true }
)
```

A live lease fails the filter, so the upsert degrades to an insert that the unique
index rejects with **E11000** — and that duplicate-key error *is* the conflict
signal, mapped to `409`, never a `500`. Two `acquireRecoveryLease` calls raced
through `Promise.all` yield exactly `[acquired, conflict]` and one document.

A reclaimed lease resets `expectedContentHash` and `generationCompletedAt`, so a
new attempt never inherits the previous one's result.

**Stale-owner protection**: every transition and release filters on
`leaseToken`. Tested — after an expired lease is reclaimed by a new owner, the
previous owner's release returns `{released:false, reason:'stale_lease_token'}`
and the new lease survives untouched. The same guard blocks a stale transition.

Runtime is fenced by config (`config/proseRecoveryConfig.js`), which **throws at
load** unless:

```
PROSE_RECOVERY_LEASE_MS > PROSE_RECOVERY_MAX_RUNTIME_MS + safety margin
```

Defaults 180 s > 120 s + 30 s. The route sets a hard `AbortController` deadline at
`maxRuntimeMs`, strictly shorter than the lease, so a lease can never expire while
its own valid provider request is still permitted to run.

---

## 6. `generating → awaiting_persistence`

The transition happens **before `prose_ready` is emitted**, so there is never a
moment where prose has been sent but the fence has already dropped. Asserted: the
lease is still present after the stream completes, in state
`awaiting_persistence`, with `expectedContentHash` equal to the emitted
revision-2 `contentHash`.

Only bounded reconciliation metadata is stored. A test enumerates the document's
keys against an allowlist and asserts the serialized lease contains no prose
("Visitor Center"), no markers (`TRAILIE_`), and no prompt text.

If the transition fails — the lease was reclaimed by someone else — this request
does **not** publish its result; it emits a bounded `prose_lease_lost` error.

---

## 7. Lease cleanup after revision-2 persistence

`tripController.updateTrip` calls `retireProseRecoveryLease` **after** the
canonical write has already been accepted. This is cleanup, not persistence:

- the recovery route still cannot write trip content (structurally asserted)
- the client remains the sole persistence initiator
- `tripController` remains the trip-content writer

Cleanup runs only for `accept` **or** `idempotent`, only at `responseRevision === 2`,
and only when the recorded `expectedContentHash` and `itineraryHash` match:

| Persistence outcome | Lease |
|---|---|
| accept, revision 2, hashes match | **cleared** |
| idempotent, revision 2, hashes match | **cleared** |
| conflict | kept (`persistence_not_accepted`) |
| stale | kept |
| revision 1 | kept (`not_terminal_revision`) |
| hash mismatch | kept (`reconciliation_hash_mismatch`) |

A cleanup failure returns `lease_cleanup_failed` with a bounded code, is logged,
and is left to the TTL index — it never rolls back the successful trip write. A
test replaces `deleteOne` with a thrower and asserts the driver message does not
escape. No client ACK endpoint exists.

---

## 8. Disconnect and failure behavior

| Situation | Behavior |
|---|---|
| disconnect before provider work | lease released, **zero** provider calls |
| disconnect during Phase B | abort through the existing signal; no retry after abort; lease released since no terminal prose exists; one bounded `prose_aborted` |
| verifier/provider failure with fallback available | normal fallback contract, transition to `awaiting_persistence`, fallback revision 2 emitted |
| failure with no safe terminal revision | lease released, one bounded SSE error, **stored revision 1 unchanged** (asserted by JSON snapshot equality) |
| connection lost after `awaiting_persistence` | lease **kept** until terminal persistence or expiry — no immediate second paid generation |

---

## 9. Frontend recovery flow

`utils/proseRecoveryClient.js` adds no second state machine. It seeds the Stage
14.3 coordinator at `itinerary_visible` with the persisted revision-1 identity and
`persistedItineraryHash` already set, so:

- revision 1 is never re-written (`persistRevision1` asserted never called)
- chunk and `stream_end` suppression is active immediately
- `prose_ready` is validated against the stored context, persisted with
  `expectedPreviousRevision: 1`, `createIfMissing: false`, against the real trip id
- prose is revealed only after that write succeeds
- a matching `done` reconciles with **no third write**
- a successor with a moved `itineraryHash` or a foreign `responseId` is refused

`resolveRecoveryAvailability` is pure and takes the server capability as an
argument — a test asserts its source contains no `process.env`. It offers the
action only for a stored revision 1 on a real (non-`temp-`) trip.

`resolveRecoveryFailure` maps `409 prose_generation_in_progress` and
`409 prose_result_awaiting_persistence` to distinct bounded messages, both
**non-retryable** — auto-polling would defeat the lease. Other failures are
retryable, and a test asserts a provider error string never reaches the copy.

---

## 10. Provider-call counts for every concurrency path

| Path | Provider calls | Lease outcome |
|---|---|---|
| flag off | **0** | none acquired |
| foreign / missing trip | **0** | none acquired |
| unknown response, identity mismatch | **0** | none acquired |
| nonempty rev-1 content, bad lifecycle, rehash mismatch | **0** | none acquired |
| already complete (stored revision 2) | **0** | none acquired |
| first caller, success | **1** | `generating → awaiting_persistence` |
| second caller during generation | **0** | `409 in_progress`, fence untouched |
| second caller while awaiting persistence | **0** | `409 awaiting_persistence`, fence untouched |
| two concurrent requests | **1** total | one 200, one 409 |
| repeated click before persistence | **1** total | second is 409 |
| expired lease reclaimed | **1** | new token |
| abort during Phase B | 1 attempt, no retry | released |

At most one first attempt plus the one existing bounded prose retry. A lease loser
makes zero provider calls and consumes no token budget. `responseVersion` is never
incremented; recovery is not a new conversational turn.

---

## 11. Test results

| Suite | Tests |
|---|---|
| `services/__tests__/proseRecoveryLease.test.js` | 27 |
| `routes/__tests__/proseRecoveryRoute.test.js` | 33 |
| `services/__tests__/proseRecoveryService.test.js` | 21 |
| `utils/__tests__/storedRevisionValidation.test.js` | 19 |
| `config/__tests__/proseRecoveryConfig.test.js` | 17 |
| `routes/__tests__/persistenceOwnership.test.js` | 20 |
| **Stage 14.4 server focused** | **137 passing** |
| `utils/__tests__/proseRecoveryClient.test.js` (frontend) | **21 passing** |

```
server src/ suite            : 136 suites, 1,444 tests → 1,439 passing
route parity, early flag ON  :  24 suites,   270 tests → 270 passing
route parity, BOTH flags ON  :  24 suites,   270 tests → 270 passing
frontend full suite          :  56 files,    480 tests → 469 passing
eslint (all new files)       : 0 errors
```

The 5 server failures are the unchanged pre-existing live-data ones
(`npsParkAdapter`, `astroFacts`, `npsParkConditions`, `parkChatImages`,
`trailieFetchPlanner`) — same identity and count as the Stage 14.2A baseline; the
suite grew from 1,327 to 1,444 tests purely from this stage. The 11 frontend
failures are the same pre-existing unrelated four files.

Both flags remain **off by default**, and route parity is identical with them on.

---

## 12. Proposed Stage 14.5 — restore, share, export

### 12.1 Scope

Make every lifecycle state render correctly wherever a stored response is read
**outside** the chat: trip restore, public share, and export. Stage 14.3 already
handles in-chat restore; 14.5 covers the three consumers that were written before
revisions existed.

| Stored lifecycle | Restore | Share | Export |
|---|---|---|---|
| `itinerary_ready` (rev 1) | card + "Trip notes pending" + regenerate | itinerary only, labeled **"Trip notes not yet generated"** | itinerary only, same label |
| `prose_ready` | card + prose | per `shareScope` | full |
| `fallback_complete` | card + prose | as `prose_ready` | as `prose_ready` |
| `prose_failed` | card + "Trip notes unavailable" + retry | itinerary only, labeled unavailable | itinerary only |

A valid itinerary must be **shareable and exportable without prose** — that is the
entire point of the checkpoint.

### 12.2 Privacy hardening (the load-bearing part)

`buildSharedTripPayload` must never emit: `responseRevision`, `previousRevision`,
`expectedPreviousRevision`, `contentHash`, `itineraryHash`, `proseConsistencyMeta`,
`itineraryGenerationMeta`, `reviewMeta`, `auditTrail`, or any lease field.
`lifecycleStatus` is exposed **only** as a coarse presentation label from a
bounded map — never the raw enum.

New hard invariants to add alongside the existing set:

- no revision field in any share or export payload
- no lease field ever leaves the server
- a shared revision-1 payload contains no empty-string assistant content that a
  recipient would render as a blank bubble

### 12.3 Immutability under the recipient

`itineraryHash` is immutable from `itinerary_ready` onward, so a shared itinerary
never changes under a recipient when prose later completes — only `contentHash`
moves. 14.5 should assert exactly that with a share-then-complete-then-reshare test.

### 12.4 Files

`routes/trips.js` (`/shared/:shareId`), `utils/sharedTripPayload.js`, the export
path, and the frontend shared-trip renderer. Existing `shareScope` defaults
(`plan_only`) and canonical-version rules are untouched.

### 12.5 What 14.5 must prove

- all four lifecycle states render in restore, share and export without a blank bubble
- the forbidden-field list is absent from every share and export payload
- a pending-notes share is labeled, not broken
- completing prose does not change what an existing recipient sees of the itinerary
- legacy responses with no revision fields render exactly as they do today
- no provider calls anywhere in the stage

### 12.6 Open product decisions still unsettled

1. Does regenerate consume quota? (recommendation: yes — it is a real Phase B call)
2. Is a pending-notes plan shareable at all, or should share require completion?
3. Does a pending revision 1 stop offering regenerate after some age?

---

## Stop

Stage 14.4 complete. `TRAILIE_PROSE_RECOVERY` and `TRAILIE_EARLY_ITINERARY_EVENTS`
both off, no live provider calls, no commits.
