# Phase 9C.2A2 — ephemeral broker primitive

Implemented API:

```js
const result = await createEvidenceBrokerRuntime().dispatchEphemeral({
  requirement,
  requestId,
  signal,
  ownership: { attempt, dispatchIndex, candidateFingerprint },
});
```

The same method is available on an injected `createEvidenceBroker(...)`.
Requirements need a requirementId and provider preference/fallback list. They do
not need an invented entityId. Ownership is opaque, returned untouched, and
bound to each caller after coalescing; the broker does not validate candidate
semantics.

## Execution boundary

The existing provider map, supports/buildRequest contracts, semantic fingerprint,
coordinator waiter management, fetch/retry/classification loop, budget reservation,
normalization, attempt accounting, cost estimation and refresh event recorder are
reused. The persistent resolver retains its existing downstream path.

An explicit coordinator mode bypasses lease acquisition, contention waiting and
release. Ephemeral calls have a separate in-flight map within that coordinator:
they cannot join persistent work. Equal dedupe keys must have equal semantic
fingerprints. Only concurrent calls coalesce; settled results are removed.
Each caller receives independent copies of normalized candidates and metadata.

After normalization, ephemeral execution returns directly. It never materializes
candidates, constructs evidence keys, synthesizes absence evidence, persists or
queries evidence, evaluates coverage, or constructs/mutates an EvidenceBundle.
Adapter-supplied evidence identity/version fields are removed from returned
candidates and metadata.

## Result

- `ephemeral: true`, provider, operation, dedupeKey, semanticFingerprint.
- `status`: fulfilled, no_result, unsupported, failed, or cancelled.
- normalizedCandidates, observedAt, metadata, completeness, bounded reasonCode.
- providerAttemptCount, retryCount, latencyMs, `cost: {costStatus, costUsd}`.
- coalesced/coalescedWaiters and caller ownership.

Provider error messages, stacks and raw failure payloads are not returned.
Empty normalization stays an explicit no_result with provider completeness;
it is not converted into persistent absence evidence.

## Cancellation and accounting

Each caller can detach independently. The final waiter aborts the shared
controller delivered to provider.fetch. Checks after budget reservation, fetch,
and normalization discard late successes from providers ignoring cancellation.
A new caller cannot join abandoned, aborted work.

Cancelled waiters return promptly with attempt/retry accounting known at
detachment. Final physical totals are recorded when the underlying provider
settles; an adapter that ignores abort can delay that terminal event. Coalesced
results describe shared physical work and must not be summed as separate calls.

The budget hook runs before every fetch attempt, including the retry. Existing
estimateCost semantics are retained; no dollar prices or production budget wiring
are introduced. Physical execution emits the existing refresh event shape with
an ephemeral event-id prefix, persistedCandidateCount zero and leaseOutcome
not_applicable (added to the event schema). These are execution telemetry records,
not shared evidence artifacts. No refresh hash secret is required for ephemeral
execution: its telemetry correlation uses the existing semantic fingerprint.

## Phase boundary

No Trailie execution-service wiring, default geocode provider registration,
geocode network changes, coordinate activation, route dispatch, fingerprints or
travel-edge attachment are included. The frozen pre-generation bundle is not an
input to this method.

9C.2B1 can use this API for coordinate activation and thread cancellation into the
real geocoder. 9C.2B2 must still require stable authoritative endpoint entity
identity plus authoritative coordinates; an evidenceRef is not a place identity.

## Validation

- Broad provider-disabled evidence regressions: 50 suites passed, 592 tests passed,
  two opt-in replica-set persistence tests skipped by their existing environment
  gate. Store, lease, coverage, bundle, runtime, adapter and persistent broker
  regressions passed unchanged.
- Final focused rerun after normalization-error classification adjustment:
  four suites, 51 tests passed (including 28 ephemeral tests).
- Both runs reported zero live model constructors, live provider dispatches and
  external provider HTTP requests.
- No commits, pushes, deployments or production calls were made.
