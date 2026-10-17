# Trailie Stage 14.2 — Typed authenticated-streaming events and route contracts

**Offline implementation and tests only. Zero provider calls.**
Flag not enabled, no frontend changes, persistence-before-reveal not implemented,
nothing committed or pushed.

---

## 0. The two compatibility corrections, applied first

### `done` remains direct-terminal (Preferred contract)

`buildCanonicalOutbound` builds the `done` envelope **without** revision fields, so
it normalizes to terminal revision 2 and carries **no** `expectedPreviousRevision`.
An old client that ignores `itinerary_ready` and saves only `done` therefore cannot
hit `expected_revision_but_none_stored`.

The explicit successor lives on the `prose_ready` payload instead, as a sibling of
the envelope (`outbound.expectedPreviousRevision`) rather than inside it — so the
terminal payload structurally cannot inherit it. A source-level test asserts the
`done` block contains no `expectedPreviousRevision`.

All four required cases pass:

| Case | Outcome |
|---|---|
| no stored response + terminal `done` | `ACCEPT` |
| stored explicit rev 1 + explicit `prose_ready` rev 2 | `ACCEPT` |
| stored explicit rev 1 + old-client terminal `done` | `ACCEPT` (`newer_revision`) |
| stored explicit rev 2 + identical `done` | `IDEMPOTENT` |
| stored explicit rev 2 + differing `done` hashes | `CONFLICT` |

### Lifecycle status participates in semantic idempotency

`extractPlanIdentity` now carries `lifecycleStatus`, and same-revision comparison
adds `lifecycleStatusesEquivalent`. Same `responseId` / version / revision and
identical hashes but a **different durable status** →
`CONFLICT: same_revision_different_lifecycle_status`.

One documented equivalent: an **absent** status matches any durable status. Without
it, an upgraded client re-saving a legacy row byte-for-byte would spuriously
conflict. `prose_ready` vs `fallback_complete` genuinely conflict. Timestamps
(`itineraryReadyAt`, `proseReadyAt`, `generatedAt`) stay outside semantic equality —
a retry may legitimately carry a later clock reading.

---

## 1. Feature-flag seam

`TRAILIE_EARLY_ITINERARY_EVENTS`, default **off**, resolved through the existing
`getItineraryGenerationConfig()` seam as `config.earlyItineraryEvents`.

- Only the authenticated streaming route reads it (asserted: no route references
  `process.env.TRAILIE_EARLY_ITINERARY_EVENTS`).
- Gated additionally on `genConfig.isToolFirst && userRequestedItinerary`.
- Off ⇒ every emitter method is a no-op, **no revision envelope is constructed**,
  and the event sequence is exactly pre-Stage-14.
- Only a case-insensitive `"true"` enables it.

## 2. Final event sequence

```
thinking* → response_started → itinerary_ready → prose_generation_started
          → prose_ready → done
```

`response_started` is emitted immediately after turn admission (the stable
`responseId` already exists before Phase A). **No `response_complete`** — `done` is
the terminal server event and clients may stop reading at it; a separate completion
event is deferred. Existing `error` behavior is untouched.

## 3. Event payloads

```js
response_started         { responseId, requiresStructuredItinerary: true }

itinerary_ready          { response: <rev1 envelope>, canonicalPlan: <rev1 plan> }
  response:              { responseId, responseVersion, responseRevision: 1,
                           previousRevision: null, lifecycleStatus: 'itinerary_ready',
                           content: '', contentHash: hash(''), itineraryHash,
                           itineraryReadyAt, … standard envelope fields }

prose_generation_started { responseId }        // transport/UI only, never persisted

prose_ready              { response: <rev2 envelope>, canonicalPlan: <terminal plan>,
                           expectedPreviousRevision: 1 }
  response:              { responseId, responseVersion, responseRevision: 2,
                           previousRevision: 1,
                           lifecycleStatus: 'prose_ready' | 'fallback_complete',
                           content, contentHash, itineraryHash, proseReadyAt }
```

`expectedPreviousRevision` sits **beside** the envelope, not inside it — that is what
keeps `done` direct-terminal.

## 4/5. Revision construction

Both built by `server/src/utils/earlyRevisionEvents.js` from the **same frozen
finalized itinerary**, reusing `buildCanonicalTrailieResponse` and
`buildPlanDocument` — no parallel serializer.

Revision 1 deliberately carries **no** `auditTrail` and **no** `reviewMeta`: both
describe the complete response, and shadow review is scheduled only at the terminal
revision. Revision 2 carries forward revision 1's `itineraryReadyAt`.

Tests prove both payloads are persistable **verbatim** through the existing writer —
`resolveCreateIdempotency` accepts the revision-1 plan as a create, and
`resolveCanonicalResponsePersistence` accepts the revision-2 plan as a succession.
No frontend reconstruction is required anywhere.

## 6. Identity and itinerary-hash invariants

One UUID per turn flows through `response_started`, `itinerary_ready`, `prose_ready`,
and the `done` envelope. Both revisions share one `responseVersion` — revisioning
never consumes another turn slot.

Before `prose_ready`, `assertItineraryUnchanged` compares the envelope hash **and**
the plan hash. On mismatch: `prose_ready` is not emitted, a bounded code
(`revision_itinerary_hash_mismatch` / `revision_itinerary_data_mismatch`) is logged,
and the response falls through to the direct-terminal `done` — which needs no stored
revision 1, so the user still gets a complete, savable response. Mutation tests prove
the guard is load-bearing (a changed label and an added stop are both caught), and
the persistence layer rejects a mutated succession independently.

## 7. Disconnect behavior

The server never waits for a persistence acknowledgment — SSE is one-way. Phase B
begins as soon as the itinerary is frozen and the event is written.

`onItineraryReady` returns `false` when `signal.aborted || res.writableEnded`, which
aborts the turn **before** any Phase B provider call. Tested: returning false spends
zero prose calls; aborting the signal inside the hook spends zero prose calls; no
server-side write is attempted in any path.

## 8. Structured-failure and fallback

A prose-only outcome **never** fires `onItineraryReady` (the hook is gated on
`ORCHESTRATION_OUTCOME.ITINERARY_READY`), so no empty revision-1 plan is ever
manufactured and the existing terminal path is preserved — verified behaviorally.
`response_started` may already have been emitted; it implies no durable checkpoint.

Deterministic fallback uses the **identical** revision-2 contract; a test asserts the
envelope and plan key sets are identical to model prose and only `lifecycleStatus`
differs.

## 9. Sanitation

All payloads go through the existing canonical builders. Tests assert no
`[ITINERARY_JSON]`, no `create_itinerary` / `tool_use` / `input_schema`, no
`TRAILIE_*` markers, no prompts, no env values, no `artifacts/private` paths, no
rejected drafts, and no verifier internals. Artifact-bearing prose is stripped by the
shared seam — `'Real prose.\n\n[ITINERARY_JSON]…'` becomes exactly `'Real prose.'`.

## 10. SSE writer

All emission goes through `writeSseEvent`. `EARLY_EVENT` is a bounded enum. The
`createEarlyEventEmitter` coordinator guarantees at most one of each event and
`sealTerminal()` blocks anything after `done` — proven by driving every method five
times and after sealing.

## 11. Metrics hooks (§15)

`timeToItineraryReadyMs`, `timeToProseReadyMs`, `timeToResponseCompleteMs`, all from
one monotonic turn start, attached to the existing `logAIRequest` record as
`earlyDelivery`. Null when the flag is off. Internal metadata only.

## 12. Test results

| Suite | Tests |
|---|---|
| `utils/__tests__/earlyRevisionEvents.test.js` | 40 |
| `routes/__tests__/earlyEventRouteScope.test.js` | 15 |
| **New this stage** | **55** |

Full server suite: **130 suites, 1,294 tests → 1,289 passing.** The 5 failures are
the same pre-existing live-data ones (`npsParkAdapter`, `astroFacts`,
`npsParkConditions`, `parkChatImages`, `trailieFetchPlanner`).

**Route parity, both flag states:**

```
flag off (default): routes + liveWiring          → 83/83 passing
flag on:            routes + full eval suite     → 236/236 passing
```

`trailieRouteContract`, `routeReplayCanonicalEquality`, `toolFirstIntegration`, and
`requestPathReviewScheduling` all pass in both states — the other three routes are
provably unchanged.

Two existing assertions updated (not weakened): `planPersistence.test.js` and
`canonicalPersistence.test.js` compare the identity tuple with exact `toEqual`, and it
gained `lifecycleStatus`. Both now document the absent-status equivalence.

---

## 13. Stage 14.3 frontend persist-before-reveal contract

```
on `response_started`
  → record responseId; disable duplicate submission for this turn

on `itinerary_ready`
  → DO NOT RENDER YET
  → persist payload.response + payload.canonicalPlan VERBATIM through the existing
    writer (createTrip if no trip, else updateTrip); send NO expectedPreviousRevision
  → on success  → set currentTripId, reveal the itinerary card,
                  show "Preparing trip notes…" (presentation state only)
  → on failure  → do NOT reveal; do NOT persist any buffered revision 2;
                  wait for `done` and persist it once as a direct terminal

on `prose_generation_started`
  → presentation only; never persisted

on `prose_ready`
  → if revision 1 is still saving → BUFFER; do not persist, do not display
  → once revision 1 has succeeded → persist payload.response + payload.canonicalPlan
    with expectedPreviousRevision: payload.expectedPreviousRevision (1)
  → on success → append prose by UPDATING the assistant message matched on
    responseId (never append a second message)
  → on conflict/stale → reconcile to storedIdentity; do not auto-retry

on `done`
  → if revision 2 already persisted → treat as confirmation; no second write
  → else → persist as today (direct terminal, no expectedPreviousRevision)
```

**Invariants the frontend must uphold**

1. Nothing is revealed before its persistence succeeded — what the user sees is
   always already recoverable.
2. Revision 2 is never persisted or displayed before revision 1 succeeds.
3. The itinerary card is keyed on `itineraryHash` so `prose_ready` cannot remount it;
   expanded-day state and card interactions survive.
4. The assistant message is reduced by `responseId` — update, never append.
5. No auto-scroll on prose arrival.
6. Exactly one trip per turn; `currentTripId` comes from the revision-1 write.
7. Duplicate submission is disabled while a response is active (this is the mitigation
   for duplicate *generation*, which `plan.responseId` does not solve).
8. The frontend never reads the server flag; it reacts to events it receives.

---

## Stop

Stage 14.2 complete. Flag off by default, no frontend behavior implemented, no
persistence-before-reveal, zero provider calls.
