# Stage 14.7F6 — Interrupted durable states and ownership-scoped cleanup

Deterministic, zero-cost. No live provider calls, no Atlas, no global production
flags, no cache-policy change, no commit/push. Spend: **$0.00**.

---

## 1. Interruption barriers (§3)

Evaluation-only, in `stage14_7fHarness.js`. Awaited inside the harness's
persistence adapter and `onDone`; the production coordinator, reducers and route
are untouched, and no sleep-based behaviour was added anywhere.

| barrier | point |
|---|---|
| `A_before_revision_1_persist` | before the revision-1 request is issued |
| `B_during_revision_1_persist` | revision-1 request in flight |
| `C_after_revision_1_persist` | immediately after revision-1 success |
| `D_before_revision_2_persist` | `prose_ready` received, before the revision-2 request |
| `E_during_revision_2_persist` | revision-2 request in flight |
| `F_after_revision_2_persist` | immediately after revision-2 success |
| `G_before_done` | `done` received, before it reaches the coordinator |

Modes are `hold` (released explicitly by the test) and `abort`. Every scenario
reports its `barrierLog`.

Failure injection corrupts the OUTGOING payload in exactly the way each mode
describes, so the **server's own guards** do the rejecting and stored state is
genuinely untouched rather than merely reported as untouched.

---

## 2. Abort before revision 1 (§4)

Barrier A. `httpRequests: 0`, `accepted: 0`, trips `0`, leases `0`, no assistant
message, no card mount, no `itinerary_revealed`, no `pending_label_set`, and
neither `revision_1_persist_started` nor `..._succeeded` ever appears — no
delayed callback persisted anything after the abort.

## 3. Revision-1 persistence failure (§5)

Injected as a plan naming a response no assistant turn owns → bounded 4xx on the
create path. Result: `revision_1_persist_failed`, no itinerary reveal, no pending
label, zero card mounts, no prose reveal, empty rendered text, revision 2 never
persisted, `revision2TripId: null`. Visibility is fail-closed throughout.

## 4. Durable itinerary-only interruption (§6)

Barrier D, after revision 1 was durable. Exactly one trip, one plan, one
assistant turn with `content: ''`, `responseRevision: 1`,
`lifecycleStatus: itinerary_ready`; shell and plan agree on `responseId`,
`responseVersion` and `itineraryHash`; no `proseReadyAt`; no revision-2 write.

Restored through the real authenticated read endpoint and the real presentation
resolver: `showItinerary: true`, `showProse: false`, passive notes label, and no
recovery action (recovery flag false). A valid durable trip, not an orphan.

## 5. Revision 2 buffered behind a pending revision 1 (§7)

Barrier B held with Phase B ungated, so `prose_ready` genuinely arrived while the
revision-1 request was outstanding. `revision_1_persist_succeeded` precedes
`revision_2_persist_started`; exactly one revision-2 start;
`revision2TripId === revision1TripId`; `revision_2_persist_succeeded` precedes
`prose_revealed`; still exactly two accepted writes.

## 6. Revision-2 persistence failures (§8)

Four shapes — bounded 4xx validation, `conflict`, `stale`, transport. For every
one: prose never visible, revision-1 itinerary still visible (one card mount,
zero unmounts), stored `responseRevision: 1`, stored content `''`, stored
`lifecycleStatus: itinerary_ready`, no `previousRevision`, no `proseReadyAt`, and
restore still resolves to itinerary-only.

## 7. Terminal state without `done` (§9)

Barrier G — a connection dropped after revision 2 was durable but before `done`
could be reconciled. One trip, one plan, one assistant response carrying prose at
`responseRevision: 2`; restore resolves to prose-complete. The missing `done`
neither invalidates nor downgrades the accepted terminal state.

---

## 8. `done` metrics (§2, §10)

```js
{ automaticPersistenceRequestsFromDone: 0,
  intentionallyReplayedDoneRequests: 2,
  acceptedWritesFromDone: 0,
  idempotentDecisionsFromDone: 2 }
```

Normal route execution: revision 1 = 1 request, revision 2 = 1 request,
`done` = **0**. `done_reconciled` present, `terminal_persist_attempted` absent.
`persistTerminal` now increments `automaticPersistenceRequestsFromDone`, so an
automatic third write is counted separately from a test-driven replay and can
never be mistaken for one.

Mismatched `done` — wrong responseId, wrong responseVersion, wrong contentHash,
wrong itineraryHash — all rejected (`conflict`), with stored plan and
conversation byte-equivalent afterwards.

## 9. Recovery inert (§11)

Across every interruption run: `TRAILIE_PROSE_RECOVERY: 'false'`, lease documents
`0` (counted, not assumed — the lease model is now registered in the child
specifically so zero is measured), zero recovery journal entries, zero recovery
HTTP requests.

## 10. External isolation (§17)

Every run: `externalNetworkAttempts: 0`, `blockedExternalNetworkAttempts: 0`,
`liveAnthropicConstructors: 0`, `liveOpenAiConstructors: 0`,
`liveNpsServices: 0`. Local Express and local MongoDB only.

---

## 11. Cleanup ownership (§12, §13)

- The **parent** generates `evaluationRunId`, a 24-hex `evaluationUserId` and a
  run-scoped `evaluationUserEmail` *before the child exists*, and passes them into
  boot. The child creates the user with that exact `_id`, so ownership is known
  even if the child dies immediately.
- Trip ids are recorded by `handle.recordTrip(...)` the instant a write returns
  one — never at scenario end.
- Deletion requires **two** proofs: the dedicated per-run user AND this run's
  recorded trip ids or response ids. `evaluationRunId` is an additional
  condition, never the sole proof.
- Leases are scoped to owner + this run's response ids.
- There is no `deleteMany({})` and no database drop anywhere in the child.

## 12. Cleanup matrix (§14, §15)

Every case seeds a **foreign** evaluation run (real user, real trip, real models)
and proves it survives.

| case | trips before → after | foreign trips | foreign users | leases after |
|---|---|---|---|---|
| normal terminal completion | 1 → 0 | 1 → 1 | 1 → 1 | 0 |
| abort before revision 1 | 0 → 0 | 1 → 1 | 1 → 1 | 0 |
| abort after revision 1 | 1 → 0 | 1 → 1 | 1 → 1 | 0 |
| revision-2 persistence failure | 1 → 0 | 1 → 1 | 1 → 1 | 0 |
| abort after revision 2 | 1 → 0 | 1 → 1 | 1 → 1 | 0 |

Current-run users after cleanup: `0` in every case.

**Cleanup exception** (injected failure on the trip delete):

```js
{ cleanupSucceeded: false,
  boundedFailureCode: 'cleanup_trip_delete_failed',
  unresolvedEvaluationUserId: '<parent-assigned id>',
  unresolvedTripIds: [...], unresolvedResponseIds: [...] }
```

No `mongodb://`, `password`, `Bearer`, JWT prefix, provider key name or
conversation content appears in the report. The foreign run survives a *failed*
cleanup too.

**Parent timeout**: the child is terminated by its captured **positive** PID
(`handle.kill()` → `process.kill(pid, 'SIGKILL')`); no shell command, no
process-group kill, no kill-by-name. A second child booted with the *same
parent-assigned identity* then completes cleanup from ids captured before
termination — which only works because the parent decided that identity up front.

## 13. Process and port cleanup (§16)

The ephemeral port accepts connections while the child runs and refuses them
after `shutdown()` (server closed, sockets closed, mongoose closed, explicit
exit because known application timers stay referenced). Local MongoDB on
`127.0.0.1:27018` remains available. Every IPC request is now bounded by a
timeout, so a dead child produces a bounded result instead of hanging an
`afterAll` hook.

---

## 14. First-run convergence flake (§18)

**Identified cause, with a fix — not a raised timeout.** `tripController.updateTrip`
LAZILY requires `models/TrailieProseRecoveryLease` *inside* the request path, and
that model declares a unique index plus a TTL index. The first authenticated
write of a process therefore both compiles the model and starts two index builds
while the request is in flight; later writes do neither. That is exactly the
asymmetry a first-run-only failure needs.

`src/eval/modelReadiness.js` adds an explicit barrier (`TripPlan.init()`,
`User.init()`, `TrailieProseRecoveryLease.init()`) which the write-issuing route
suites await before their first request.

Deliberately **opt-in, not global**: putting it in `tests/setup.js` broke 11
tests in suites that mock their models, because `init()` on a mocked model never
resolves. That was caught and reverted within the stage.

Result: **10 consecutive isolated runs → 10 passes** (and 10/10 before the change
as well). Since the original failure never reproduced under instrumentation, this
is reported as **`unreproduced_after_readiness_hardening`** — a real removed race,
not a proven root cause.

---

## 15. Test results

- New: `stage14_7f6Interrupted` **38**, `stage14_7f6Cleanup` **9**.
- Route proof 44 (both scenarios + replay variants); F5 duplicate 13; projection 16;
  cache policy 4; frozen plan 22; adversarial 57.
- Full server non-network suite: **1797 passed, 5 failed, 156 suites** — the known
  five, unchanged.
- Full frontend suite: **735 passed, 11 failed** — exactly the four
  branch-baseline files from F5 §1, nothing else.

---

## 16. Readiness

```js
{
  staticConfigurationPreflightPassed: true,
  openAiImportSafetyPassed: true,
  npsImportSafetyPassed: true,
  fixtureValidationPassed: true,
  environmentBootstrapPassed: true,
  importSideEffectSweepPassed: true,
  dependencyIsolationConfigured: true,
  outboundGuardPassed: true,
  applicationDriverSeamReady: true,
  actualRouteDryRunPassed: true,
  externalIsolationPassed: true,
  duplicateDeliveryPassed: true,
  projectionBoundaryPassed: true,

  interruptedStateSafetyPassed: true,
  cleanupSafetyPassed: true,

  sharedCachePolicySafe: false,
  compositePreflightPassed: false,
  liveExecutionReady: false
}
```

## 17. Remaining pre-live work

1. Apply and verify an explicit safe cache policy for `/api/trips/shared/:shareId`
   (recommended: `Cache-Control: no-store`).
2. Integrate every deterministic gate into one fail-closed Stage 14.7 preflight.
