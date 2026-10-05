# Stage 14.8A.2 — Completion-coupled anonymous quota semantics

Deterministic, zero-provider-call repair and qualification stage. The Yosemite
prompt was **not** resent, no live provider ran, no production flag was enabled,
nothing was deployed, committed, or pushed.

## 1. Preserved state

Contract A remains authoritative and unchanged:

```js
{
  guestReceivesTypedEarlyEvents: false,
  guestUsesTripPlanRevisionPersistence: false,
  guestPersistenceOwner: "AnonymousSession",
  guestItineraryRevealPoint: "terminal successful response",
  guestQuotaIncrementPoint: "one completed logical assistant response"
}
```

No authenticated-only early revisions or `TripPlan` revision persistence were
added to the guest flow. A route-level invariant test asserts this directly
against the two anonymous handler bodies.

The failed acceptance attempt is preserved verbatim:

```js
{
  testId: "stage14_8A-guest-message-1",
  result: "FAIL_UNEXPECTED_NETWORK",
  providerCalls: 0,
  completedGuestTurns: 0,
  remainingAllowance: 5,
  retryPerformed: false
}
```

The optimistic message from that failed browser context never reached the
server, so it is excluded from quota and from history by construction — the
server has no record of it at all.

## 2. The previous defect

Both anonymous routes appended the user message to `AnonymousSession` at route
admission and then derived the limit from the user-role message count:

```js
session = await session.addMessage({ role: 'user', ... });   // admission
if (!session.canSendMessage()) { /* userMessageCount <= 5 */ }
```

Quota was therefore coupled to ARRIVAL. Any failure after admission — provider
configuration, provider HTTP, timeout, structured or prose generation failure,
stream abort, client disconnect, backend exception, or process death — left a
counted user message with no assistant response. The guest silently lost an
allowance unit for a turn that produced nothing.

The count was also derived from array length, which cannot distinguish a
completed turn from an orphan.

## 3. Canonical logical-turn contract

A guest quota unit is one unique logical turn: **one admitted user message plus
one successful terminal assistant response.**

`AnonymousSession.turns[]` (`src/models/AnonymousSession.js`):

```js
{
  turnId,            // server-generated uuid
  clientTurnId,      // stable per-submission id (client- or server-generated)
  status,            // 'pending' | 'completed' | 'failed'
  userMessage,       // held on the turn, NOT in completed history
  assistantMessage,  // written only at completion
  admittedAt,
  completedAt,
  failedAt,
  failureCode
}
```

`messages` now holds **completed history only**. A pending or failed turn never
reaches it, so completed history can never contain an orphan user message or an
empty assistant bubble, and `session-status` can be mirrored verbatim.

## 4. Authoritative completed-turn calculation

`src/utils/guestTurnQuota.js` is the single pure definition, shared by the model
and the ledger:

```js
completedGuestTurns = count(unique turnIds where status === 'completed'
                            AND assistantMessage.content is a non-empty string)
remainingAllowance  = max(0, 5 - completedGuestTurns)
```

Nothing else is counted: not user-role messages, pending requests, failed
attempts, aborted streams, client disconnects, browser exceptions,
`response_started`, internal provider attempts, duplicate `done` events,
duplicate terminal callbacks, or retried persistence writes.

`completedTurnCount` is a performance cache only.
`detectCompletedTurnCounterDrift()` compares it against the explicit records;
the records always decide, and both the focused suite and the isolated
acceptance run assert that drift is detected while the quota stays correct.

## 5. Atomic admission

`admitGuestTurn()` performs ONE conditional update that simultaneously verifies:

| condition | mechanism |
|---|---|
| `completedGuestTurns < 5` | `$expr` over `$filter` on the explicit records — not the cache |
| no other pending turn | `turns: { $not: { $elemMatch: { status: 'pending' } } }` |
| no duplicate `clientTurnId` | `turns: { $not: { $elemMatch: { clientTurnId } } }` |

and creates exactly one pending turn. Because MongoDB applies filter and update
atomically per document, two concurrent submissions cannot both be admitted:

```text
first request  → admitted
second request → guest_turn_in_progress (or an idempotent duplicate report)
```

A trusted MCP caller (`trusted: true`) is not a browser guest: it is not
allowance-limited and may have turns in flight concurrently. `clientTurnId`
de-duplication still applies, and its completed turns are still recorded, so an
untrusted guest on the same session can never gain allowance from them.

## 6. Atomic completion

`completeGuestTurn()` matches `{ turnId, status: 'pending' }` and, in one
update, sets the terminal assistant response, flips the status, pushes the
user/assistant pair into completed history, and increments the cache:

```js
{ assistantResponsesWritten: 1, completedTurnIncrement: 1, duplicateCompletionIncrement: 0 }
```

A duplicate `done`, a reconnect reconciliation, or a retried persistence write
finds no pending turn and is a no-op. Both routes complete **before** writing
the terminal event, so the quota the browser sees is the quota the database
holds.

## 7. Failure and abort behavior

`scope.fail(code)` flips `pending → failed` and releases the reservation without
touching quota. `scope.settle(code)` is the safety net in each handler's
`finally`: if a turn is still pending when the handler unwinds for any reason,
it becomes failed rather than a stuck reservation.

Covered paths and their bounded codes:

| path | code |
|---|---|
| provider configuration failure | `provider_configuration_failure` |
| provider HTTP failure | `provider_http_failure` |
| provider timeout | `provider_timeout` |
| structured generation failure | `structured_generation_failure` |
| prose generation failure | `prose_generation_failure` |
| stream abort | `stream_aborted` |
| client disconnect | `client_disconnected` |
| backend exception | `backend_exception` |
| network isolation refusal | `network_policy_refusal` |
| empty terminal response | `empty_terminal_response` |
| preflight blocker | `preflight_blocked` |
| process death after admission | `turn_abandoned` (stale sweep) |

A **preflight blocker** is treated as an input rejection, not a completed turn:
no provider ran and no assistant response was generated, so charging the guest
for "your dates are invalid" would be wrong. The blocker text is still shown;
it is simply not persisted as completed history.

### Failed-turn retention policy

The most recent **3** failed turns per session are retained for diagnostics;
older ones are pruned (`MAX_RETAINED_FAILED_TURNS`). A failed turn never counts
as completed, never restores as an assistant response, never produces an empty
assistant bubble, and never blocks the session — proven by a case that fails
eight consecutive turns and then completes one normally.

## 8. Stale pending-turn recovery

`STALE_PENDING_TURN_MS = 5 minutes` — comfortably above the slowest reviewed
guest generation, short enough that a crashed process cannot block a guest for
the remainder of the 48h session.

`releaseStalePendingTurns()` runs at every admission and at every
`session-status` read. It is scoped to one `anonymousId` and its array filter
matches `pending` only, so it is structurally incapable of altering a completed
turn — quota is unchanged by definition.

```text
pending without active execution → failed (turn_abandoned) → reservation released → quota unchanged
```

## 9. Local browser-state contract

`next-frontend/src/lib/guestTurnLifecycle.js`:

* Every submission mints a stable `clientTurnId`, sent with the request.
* The optimistic user message is inserted with `isPending: true`.
* On terminal success the pending flag clears and the turn joins the mirror.
* On any failure the turn is visibly marked `guestTurnFailed`, the pending
  marker is removed, and the composer is re-enabled — no permanent spinner.
* `selectCompletedGuestHistory()` filters the localStorage mirror to
  user/assistant pairs that actually completed, dropping pending turns, failed
  turns, trailing user messages, streaming placeholders, and empty assistant
  bubbles. A failed optimistic turn therefore cannot reappear as completed after
  a refresh.
* The mirror carries no allowance decision. `remainingAllowance` always comes
  back from the server, so localStorage is never an independent quota source.

## 10. Route and response semantics

Bounded codes returned by the anonymous routes:

```text
guest_turn_in_progress      409
guest_allowance_exhausted   200 (existing conversion UX)
guest_turn_failed           410 / 500 / 502 / 503
guest_turn_abandoned        410
```

Guest responses no longer carry `details: error.message`, provider text,
credentials, stack traces, or internal session identifiers. Detail is logged
server-side only.

The sixth-message block occurs inside `openGuestTurn`, before provider
reservation, construction, dispatch, or any external network access — the
handler returns before `prepareChatContext` is even called.

## 11. Files

| file | role |
|---|---|
| `server/src/utils/guestTurnQuota.js` | pure canonical quota calculation |
| `server/src/models/AnonymousSession.js` | `turns[]` schema, completion-coupled `canSendMessage()` |
| `server/src/services/anonymousTurnLedger.js` | atomic admit / complete / fail / stale recovery |
| `server/src/services/guestTurnScope.js` | route seam: `openGuestTurn`, `settle`, failure classification |
| `server/src/routes/ai.js` | both anonymous routes, MCP planner, `session-status` |
| `next-frontend/src/lib/guestTurnLifecycle.js` | optimistic-turn and mirror rules |
| `next-frontend/src/test-utils/stage14AcceptanceHarness.js` | `GUEST_QUOTA_CONTRACT`, `resolveGuestContract`, pre-send gate |
| `server/scripts/stage14_8a2-guest-quota-acceptance.js` | isolated-Mongo acceptance run |

## 12. Evidence

Focused suites (all green):

| suite | tests |
|---|---|
| `server/src/services/__tests__/anonymousTurnLedger.test.js` | 39 |
| `server/src/routes/__tests__/anonymousGuestTurnLifecycle.test.js` | 27 |
| `next-frontend/src/lib/__tests__/guestTurnLifecycle.test.js` | 20 |
| `next-frontend/src/__tests__/stage14AcceptanceHarness.test.js` | 13 |
| `artifacts/trailie-stage14_8A2-guest-quota.json` | 29/29 isolated-Mongo checks |

Regression:

* Server `npm run test:non-network` — 2301 passed, 11 failed across 6 suites.
* Frontend `vitest run` — 779 passed, 11 failed across 4 suites.

Both failure sets reproduce **identically** with this stage's changes stashed
(`astroFacts`, `npsParkConditions`, `parkChatImages`, `trailieFetchPlanner`,
`compositePreflight`, `npsParkAdapter`; `WeatherWidget`, `Header`,
`useParkExploreIndex`, `buildDayByDayPlanFollowUp`). They are the pre-existing
baseline and are untouched by this stage.

Provider isolation across the full server run:

```json
{"liveAnthropicConstructors":0,"liveOpenAiConstructors":0,
 "liveProviderDispatches":0,"externalProviderHttpRequests":0}
```

All provider work is synthetic and in-process. The isolated run installs the
outbound-network guard before any application module loads and reports zero
external attempts, zero Atlas attempts, and zero provider cost. The acceptance
database is emptied at the end of the run and the cleanup is verified by direct
read, so the retest's guest counter genuinely starts at zero.

## 13. Pre-send gate

`buildPreSendAcceptanceGate` gains `paidRetestAuthorized`, and
`guestContractResolved` is now **derived** from observed behavior via
`resolveGuestContract(GUEST_QUOTA_CONTRACT)` rather than asserted. Any drift
back toward admission-time quota consumption names itself in `unmet` and keeps
the gate closed.

The gate may enable the composer. The Yosemite prompt was not submitted during
this stage.
