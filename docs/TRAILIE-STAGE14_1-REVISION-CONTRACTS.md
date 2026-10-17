# Trailie Stage 14.1 — Response identity, revision, and persistence contracts

**Offline implementation and tests only. Zero provider calls.**
No SSE events emitted, no frontend changes, no flags enabled, nothing committed.

Architecture decision implemented: **client-initiated, persist-before-reveal checkpoint.**
The server remains read-only for trip persistence.

---

## 1. Ownership invariant — locked by test

`server/src/routes/__tests__/persistenceOwnership.test.js` (20 tests) fails loudly if
a future change reintroduces a server-side writer:

- The six turn-orchestration modules (`trailieItineraryTurn`,
  `toolFirstItineraryOrchestrator`, `structuredItineraryGenerator`,
  `finalizeItinerary`, `canonicalResponse`, `responseIdentity`) import **no**
  persistence writer and issue **no** model write.
- `routes/ai.js` does not import `tripController`, and every `TripPlan` usage is
  read-only (`findById(...).select(...).lean()` for active-trip context).
  It never calls `.save()`.
- `planPersistence.js` and `canonicalPersistence.js` are pure — no mongoose, no `await`.
- `tripController` is imported by `routes/trips.js` **and nothing else**.

The AI route still creates no trip, updates no trip, persists no assistant message,
persists no plan, and launches no fire-and-forget write.

## 2. Stable identity seam

New: `server/src/utils/responseIdentity.js` → `createTurnResponseIdentity()`.

Minted **at turn admission**, before `prepareChatContext` and before Phase A, in both
authenticated routes (`/chat` and `/chat-stream`). Threaded into
`buildCanonicalOutbound`, which now uses it instead of minting a second identity.

- One identity per logical server turn.
- The same `responseId` serves revision 1, revision 2, and terminal
  structured-failure / prose-only responses.
- `responseVersion` keeps Stage 8 semantics exactly (`priorResponseVersion + 1`).
- Identity is a random UUID — **raw client input never contributes**, so no user text
  can leak into an identifier that is persisted, shared, and exported.
- `responseIdentity` is optional on `buildCanonicalOutbound`; omitted, the function
  behaves exactly as before.

The anonymous routes build no canonical envelope today (confirmed: `envelope.responseId`
appears only in the two authenticated `done` payloads), so there is nothing to thread
there. That matches the Stage 14.0 finding that anonymous has no canonical identity.

## 3. Revision fields

Optional on the canonical envelope (`buildCanonicalTrailieResponse`) and on
`TripPlan.conversation[]`:

```js
{ responseRevision, previousRevision, lifecycleStatus, itineraryReadyAt, proseReadyAt }
```

`responseRevision` is the switch: without it the envelope keeps **pre-Stage-14 shape
exactly** — the revision keys are not present at all. Revision fields are never hashed.

| | Revision 1 | Revision 2 |
|---|---|---|
| `responseRevision` | 1 | 2 |
| `previousRevision` | `null` | 1 |
| `lifecycleStatus` | `itinerary_ready` | `prose_ready` \| `fallback_complete` |
| `content` | `""` | sanitized terminal prose |
| `contentHash` | `hash("")` | `hash(prose)` |
| `itineraryHash` | frozen itinerary hash | **exactly the revision-1 hash** |

**Durable vs transient states** are separated in code:
`DURABLE_LIFECYCLE_STATUSES` = `itinerary_ready`, `prose_ready`, `fallback_complete`,
`prose_failed`. `TRANSIENT_LIFECYCLE_STATUSES` = `generating_itinerary`,
`generating_prose` — SSE-only, never persisted. A test asserts the sets are disjoint.

## 4. `responseVersion` semantics preserved

`responseVersion` remains the per-trip logical **turn** counter. Both revisions of one
turn occupy the **same** version slot. Ordering is now the pair:

```
(responseVersion, responseRevision)
```

## 5. Persistence comparison matrix

Implemented in `decidePersistenceOutcome`:

| Incoming vs stored | Outcome | Reason |
|---|---|---|
| nothing stored | `ACCEPT` | `no_existing_identity` |
| nothing stored, but `expectedPreviousRevision` set | `CONFLICT` | `expected_revision_but_none_stored` |
| newer `responseVersion` | `ACCEPT` | `newer_version` |
| older `responseVersion` | `STALE` | `older_version` |
| same version, higher revision, itinerary unchanged, CAS ok | `ACCEPT` | `newer_revision` |
| same version, higher revision, **itinerary changed** | `CONFLICT` | `revision_itinerary_hash_changed` |
| same version, higher revision, wrong `expectedPreviousRevision` | `CONFLICT` | `revision_base_mismatch` |
| same version, revision jump (1 → 3) | `CONFLICT` | `revision_jump` |
| same version, lower revision | `STALE` | `older_revision` |
| same version + revision, hashes match | `IDEMPOTENT` | `identical_write` |
| same version + revision, hashes differ | `CONFLICT` | `same_version_different_hash` |
| different `responseId`, same version | `CONFLICT` | `different_response_same_version` |

**Legacy rule:** a missing `responseRevision` — on the incoming write **or** on an
already-stored row — normalizes to **terminal revision 2**. Mixed old-client/new-server
behavior is covered by tests: legacy-vs-legacy stays `IDEMPOTENT`; a legacy terminal
write over a stored revision 1 is read as the normal succession; a revision-1 write
against a stored legacy terminal response is `STALE` and cannot regress it.

## 6. Direct-terminal compatibility

A terminal revision 2 is accepted **without** an existing revision 1 whenever it is a
valid newer logical turn and it does not claim a base revision. This keeps working:
authenticated non-streaming, anonymous routes, flag-off behavior, and existing clients
that ignore `itinerary_ready`. **No response is required to perform two writes.**

The discriminator is `expectedPreviousRevision`: present ⇒ "I succeed a stored
revision 1"; absent ⇒ direct terminal.

## 7. Atomic revision writes

**Revision 1** persists as one unit through the existing `updateTrip` /`createTrip`
path: assistant shell with `content: ""` + frozen canonical plan + `responseId` +
`responseVersion` + `responseRevision: 1` + `itineraryHash` + `lifecycleStatus`.

**Revision 2** is detected via `resolution.revisionSuccession` and:

- locates the assistant turn by `responseId` and **updates it in place**
  (`mergeTerminalRevisionIntoConversation`), preserving the stored message's `id` and
  `timestamp` so the client sees the same message gain content;
- collapses any duplicate assistant message carrying that `responseId` to exactly one;
- carries `days` and `itineraryHash` over **from the stored plan verbatim**, so a
  terminal revision structurally cannot mutate the itinerary — belt and braces with the
  upstream hash-equality check;
- rejects the complete atomic unit on conflict (`writePlan` and `writeConversation`
  both false).

## 8. New-trip idempotency

Unchanged key: `userId + plan.responseId`. New `CREATE_ACTION.UPDATE_EXISTING` ensures a
revision-2 create lands on the trip revision 1 created (HTTP 409 carrying `tripId`)
rather than creating a second trip.

Tested: revision-1 create repeated twice; revision-2 update repeated twice; revision 2
after an idempotent revision-1 response; concurrent revision-1 attempts converging on
one trip; **revision 2 arriving before revision-1 persistence completes → refused with
`expected_revision_but_none_stored`, so no partial trip is ever constructed.**

## 9. Client checkpoint rule (contract for 14.3)

Encoded as server-side contract tests in `revisionClientContract.test.js`:

```
receive revision 1 → persist revision 1 → reveal card ONLY after persistence succeeds
```

While revision 1 is saving: Phase B continues on the server; a received revision 2 is
**buffered**; it is neither persisted nor displayed before revision 1 succeeds.

**Per your correction #2, there is no server-side guard requiring an acknowledgment.**
SSE is one-way and the server does not own the client's save request. Phase B begins as
soon as the itinerary is finalized and frozen. Ordering is enforced entirely by the
client; the server's role is to *refuse* an out-of-order write, which the tests prove.

On revision-1 persistence failure: do not reveal the card, do not persist the buffered
revision 2 against a nonexistent revision 1, and let the terminal `done` path save the
complete response once — proven to yield exactly one trip.

## 10. `done` compatibility

Language corrected from "byte-identical" to **backward-compatible, additive, complete,
and self-sufficient**. Tests prove: every pre-Stage-14 field keeps its meaning and
value; added keys are exactly `responseRevision`, `previousRevision`, `lifecycleStatus`;
a client that strips unknown fields still saves a terminal `done` (and cannot then be
regressed by a late revision 1); flag-off is one terminal persistence operation; the new
fields never alter content or itinerary hashes.

## 11. No recovery endpoint

`GET /api/ai/response/:responseId` was **not** implemented. Under request-bound Phase B
with client-owned persistence there is no durable server-side revision separate from the
trip; reload recovery comes from the trip endpoint (stored revision 1 → itinerary +
"Generate trip notes"; stored revision 2 → itinerary + prose). Deferred unless detached
or queued Phase B is later approved.

## 12. Duplicate semantics — stated precisely

- **Duplicate persistence of one `responseId`** — guaranteed idempotent (tested).
- **Duplicate AI generation request** — mints a *new* `responseId` and is **not**
  solved by `plan.responseId`. A test documents this: two requests produce two
  identities, and a same-slot collision surfaces as `CONFLICT` (rejected), never a
  silent dedupe. Cross-request generation idempotency needs a stable client request key
  and is recorded as later product/transport work. Stage 14.3 must disable duplicate
  submission in the UI while a response is active.

## 13. Test results (all offline)

| Suite | Tests |
|---|---|
| `routes/__tests__/persistenceOwnership.test.js` | 20 |
| `utils/__tests__/responseRevisions.test.js` | 45 |
| `utils/__tests__/revisionClientContract.test.js` | 10 |
| **New total** | **75** |

Full server suite: **128 suites, 1,239 tests → 1,234 passing.**
The 5 failures are the same pre-existing live-data ones from Stage 13.9A
(`npsParkAdapter`, `astroFacts`, `npsParkConditions`, `parkChatImages`,
`trailieFetchPlanner`) — unchanged in count and identity.

Two existing assertions were updated, not weakened: `planPersistence.test.js` and
`canonicalPersistence.test.js` compared the identity tuple with exact `toEqual`, and the
tuple legitimately gained `responseRevision` / `revisionExplicit`. Both now assert the
legacy-normalizes-to-terminal behavior explicitly.

---

## 14. Proposed Stage 14.2 typed-event contract

Additive SSE events. `done` continues to be emitted, complete and self-sufficient.
Gated by `TRAILIE_EARLY_ITINERARY_EVENTS` (default off ⇒ none of these are emitted).

```ts
// Emitted at turn admission, immediately after headers.
type ResponseStarted = {
  type: 'response_started';
  responseId: string;
  responseVersion: number;
  requiresStructuredItinerary: boolean;
  lifecycleStatus: 'generating_itinerary';   // transient, never persisted
};

// Emitted after finalize + freeze. The client persists this, THEN reveals.
type ItineraryReady = {
  type: 'itinerary_ready';
  responseId: string;
  responseVersion: number;
  responseRevision: 1;
  previousRevision: null;
  lifecycleStatus: 'itinerary_ready';
  expectedPreviousRevision: null;      // rev 1 claims no base
  contentHash: string;                 // hash("")
  itineraryHash: string;
  canonicalPlan: object;               // persist VERBATIM (existing shape)
  itineraryData: object;               // presentation-safe frozen itinerary
  feasibilityIssues: object[];
  planScore: object | null;
  confidence: object | null;
  parkName: string | null;
  parkNames: string[];
  parkImages: object[];
  itineraryReadyAt: string;            // ISO
};

type ProseGenerationStarted = {
  type: 'prose_generation_started';
  responseId: string;
  lifecycleStatus: 'generating_prose'; // transient, never persisted
};

// Emitted once, AFTER full verification. Never a partial or unverified draft.
type ProseReady = {
  type: 'prose_ready';
  responseId: string;
  responseVersion: number;
  responseRevision: 2;
  previousRevision: 1;
  expectedPreviousRevision: 1;         // intra-turn compare-and-swap
  lifecycleStatus: 'prose_ready' | 'fallback_complete';
  source: 'model' | 'fallback';
  content: string;                     // sanitized terminal prose
  contentHash: string;
  itineraryHash: string;               // MUST equal the itinerary_ready value
  proseReadyAt: string;
};

type ResponseComplete = {
  type: 'response_complete';
  responseId: string;
  responseRevision: 1 | 2;
  lifecycleStatus: 'prose_ready' | 'fallback_complete' | 'prose_failed';
};

type ResponseFailed = {
  type: 'response_failed';
  responseId: string;
  lifecycleStatus: 'prose_failed';
  code: 'structured_failed' | 'prose_failed' | 'prose_aborted';  // bounded slugs only
};
```

**Emission order** (streaming, itinerary path):

```
thinking* → response_started → itinerary_ready → prose_generation_started
          → prose_ready → done → response_complete
```

Prose-only path: `response_started → prose_generation_started → prose_ready → done`.

**Hard rules for 14.2**

1. `done` remains the terminal, self-sufficient event; a client that ignores every new
   type behaves exactly as today.
2. No event carries raw tool arguments, provider output, alignment markers, verifier
   internals, prompts, or environment values.
3. `response_failed.code` is a bounded slug — never a provider error string.
4. Transient `lifecycleStatus` values appear only in events, never in a payload the
   client persists.
5. `itinerary_ready.itineraryHash === prose_ready.itineraryHash`, asserted server-side
   before `prose_ready` is written.
6. Route parity: all four routes keep identical canonical output;
   `routeReplayCanonicalEquality` must still pass with the flag on and off.
7. Non-streaming routes emit no new events (they return one body) and continue writing
   a single direct-terminal revision 2.

---

## Stop

Stage 14.1 complete. No typed SSE events emitted, no frontend behavior implemented, no
flags enabled, no provider calls made.
