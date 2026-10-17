# Trailie WP5A Evidence Broker + NPS Shadow Design

## Goal

WP5A proves that a provider-neutral Evidence Broker can resolve public `EvidenceRequirement[]` into an immutable per-turn `EvidenceBundle` through shared storage and one authoritative structured adapter. NPS is the first adapter, but the broker contract must accept later RIDB, weather, Maps, astronomy, fee-free, and web adapters without redesign.

WP5A is observational only. Legacy Trailie fetching, canonical fact construction, prompts, models, responses, frontend payloads, and persistence remain authoritative and unchanged.

## Scope

WP5A includes:

- requirement-oriented evidence lookup above the immutable WP3 claim store;
- scope, evidence-type, authority, freshness, conflict, and absence evaluation;
- provider selection, physical-request grouping, budgets, and retries;
- distributed leases and in-process waiter coalescing;
- NPS fetch/normalize/error-classification behavior;
- privacy-guarded, fenced, versioned persistence;
- immutable bundle construction and coverage evaluation;
- bounded turn telemetry, shared refresh events, and legacy semantic comparison;
- shadow execution across all four Trailie chat routes.

WP5A excludes RIDB, weather, Maps, astronomy, fee-free, web search, prompt migration, model changes, and any evidence read that can influence the production answer path.

## Ownership Boundaries

### Evidence Planner

Declares what public evidence the turn requires. It does not query stores, choose endpoints, or execute providers.

### Evidence Store

Stores immutable public claims and their versions. It does not decide whether a set of claims satisfies a requirement.

### Provider Adapter

Knows how to describe and execute provider operations, normalize physical responses into public candidates, declare response completeness, estimate physical cost, and classify provider errors. It never imports Mongo models or the evidence store and never decides freshness, authority, conflicts, retention, persistence, or final coverage.

### Evidence Broker

Owns candidate usability, store reuse, provider selection, request grouping, refresh ownership, budgets, retries, privacy validation, persistence, and final resolution coverage.

## Provider Contract

Every adapter implements:

```js
supports(requirement)
estimateCost(request)
buildRequest(requirement, context)
// -> { provider, operation, parameters, dedupeKey, publicCanonicalRequest }
fetch(request, { signal })
// -> { raw, metadata, completeness, providerAttempts }
normalize(raw, request, metadata)
// -> EvidenceCandidate[]
classifyError(error)
// -> bounded provider error classification
```

Normalization runs once per physical response, never once per requirement. The broker evaluates the resulting candidates independently against every grouped requirement.

The adapter supplies a canonical public request representation. The broker validates that it contains no private fields and derives a keyed `refreshKeyHash` from it. A hash must never be derived directly from raw prompts, addresses, coordinates, or other private request input.

## Requirement Keys and Physical Refresh Keys

A requirement key identifies logical coverage. A physical refresh key identifies one provider operation.

```text
requirementKey:
  requirement contract identity

dedupeKey / leaseKey:
  provider + operation + normalized public parameters
```

NPS examples:

```text
nps|parks|yose
nps|alerts|yose
nps|campgrounds|yose
nps|visitor-centers|yose
```

The broker groups equivalent physical requests by `dedupeKey` and acquires the distributed lease on that key. A dedupe key is never merely a provider plus entity.

Before coalescing, the broker computes a stable semantic fingerprint of the normalized operation and parameters. The same `dedupeKey` with a different fingerprint is an internal invariant violation; neither request is silently selected.

## Requirement-Oriented Store Lookup

`queryEvidenceForRequirement(requirement, { now })` queries current claims by public entity and topic, returning all possible candidates rather than manufacturing a requirement-to-store-key shortcut.

The coverage evaluator independently checks each candidate for:

- exact or permitted temporal/geographic scope;
- accepted evidence type;
- minimum authority;
- freshness and the requirement's stale allowance;
- conflict status;
- proven absence compatibility.

Rejected candidates remain outside the bundle. Only bounded rejection counters and reason codes survive.

## Resolution Flow

```text
EvidenceRequirement[]
  -> validate unique requirement identities
  -> requirement-oriented store query
  -> evaluate candidates
  -> freeze immediate fresh/stale-safe outcomes where permitted
  -> select provider for unresolved requirements
  -> build physical requests
  -> validate dedupe-key integrity
  -> group by dedupeKey
  -> reserve physical budget
  -> acquire physical refresh lease
  -> fetch once or coalesce/wait
  -> normalize once per response
  -> validate candidates independently
  -> assert public privacy
  -> fenced versioned writes
  -> re-query unresolved hard/missing requirements
  -> evaluate final coverage
  -> construct immutable EvidenceBundle
  -> emit shadow telemetry only
```

Fresh store hits cause zero provider dispatches. Stale-safe evidence is delivered to the current bundle and may trigger a shared asynchronous refresh for future turns. Hard or zero-stale requirements await a bounded refresh and never receive stale evidence.

## Final Coverage and Diagnostics

Final statuses are:

```text
satisfied_fresh
satisfied_stale_safe
satisfied_partial
missing
conflicted
unsupported
cancelled
```

Candidate rejection and infrastructure diagnostics are reason codes, including:

```text
candidate_expired
candidate_wrong_scope
candidate_wrong_evidence_type
candidate_insufficient_authority
candidate_conflicted
candidate_privacy_rejected
absence_not_proven
provider_timeout
provider_rate_limited
provider_unavailable
provider_not_configured
provider_response_invalid
provider_budget_exhausted
refresh_wait_timeout
refresh_lease_lost
```

Normal evidence/provider failures remain per requirement. `resolveEvidence()` rejects the whole input only for invalid broker input or internal invariants. The same `requirementId` with a different normalized contract is invalid. Separate requirement IDs may legitimately express different freshness or authority contracts over the same topic.

## Stale Evidence Semantics

Stale-safe evidence freezes the current-turn resolution as `satisfied_stale_safe`. Its refresh can update the shared store and append a shared refresh event, but it cannot upgrade or otherwise rewrite the current bundle or turn resolution.

Hard or zero-stale requirements treat stale evidence as unusable, await the bounded refresh path, and freeze only after the refresh/re-query result is known.

## Absence Semantics

An empty response is not absence evidence. Proven absence requires all of:

- the requirement permits `proves_absent`;
- the adapter declares the physical response complete for the required topic/entity/time scope;
- the provider has sufficient authority;
- the broker validates scope and freshness.

When allowed, the broker persists an explicit negative EvidenceItem with a negative claim and bounded `absenceProof` containing provider completeness, completeness scope, observation time, and rule code. Otherwise final coverage remains missing with `absence_not_proven`.

## Shared Refresh Lifecycle

An in-process refresh record contains:

```js
{
  dedupeKey,
  semanticFingerprint,
  promise,
  controller,
  waiterCount,
  scheduledOwner,
  lease: { ownerId, fencingToken },
  state: "pending" | "fetching" | "persisting" | "settled" | "aborted"
}
```

Caller cancellation detaches that caller. Shared work continues while another waiter or scheduled owner remains. When the final non-scheduled waiter cancels, the lifecycle state determines whether the physical request can be aborted safely. Lease release is conditional on the current owner and fencing token.

An expired owner can neither write evidence nor release a newer owner's lease. After a fencing rejection it re-queries shared storage; it never reacquires and replays its old result.

Across backend processes, contenders use bounded store polling until evidence appears, the lease expires, cancellation fires, or the wait budget ends.

## Budgets and Retry Policy

Budgets and reservations are physical-refresh scoped and checked before lease acquisition and immediately before dispatch.

- Authentication, invalid request, missing configuration, cancellation: no retry.
- Rate limit: no immediate blind retry; use allowed stale evidence or remain missing.
- Timeout or transient unavailable: at most one broker-controlled retry when both request and time budgets permit.
- Candidate privacy/schema rejection: drop the candidate without refetching solely for that candidate.

Adapter-internal NPS attempts must be reported in `providerAttempts`. Physical-refresh telemetry owns physical cost. Known zero cost uses `costStatus: "known", costUsd: 0`; missing pricing uses `costStatus: "unknown", costUsd: null`.

## NPS Adapter Operations

WP5A supports:

- `destination_identity`;
- `overview`;
- `activities`;
- `fees`;
- `hours`;
- `alerts_closures`;
- `campgrounds`;
- `visitor_services`.

Identity, overview, fees, hours, and profile-sourced activities share the park-profile operation. Alerts, campgrounds, and visitor centers remain distinct operations. Each normalized candidate retains official NPS provenance and topic-specific claim identity.

The NPS adapter may reuse the existing lazy `getNpsService()` seam, but it cannot reuse prompt-formatting orchestration or import `factsService`, because those paths mix retrieval with legacy answer formatting.

## EvidenceBundle Contract

```js
{
  schemaVersion: "trailie-evidence-bundle-v1",
  brokerVersion: "evidence-broker-v1.0.0",
  requestId,
  createdAt,
  resolutions,
  evidence,
  summary
}
```

Bundle values are plain objects, arrays, strings, numbers, booleans, and null. Dates are ISO strings. Mongoose documents, Dates, Maps, Sets, and Buffers are converted before recursive freezing.

Resolutions preserve input requirement order. Evidence is deduplicated and sorted lexically by `evidenceId`. Resolutions reference evidence by `evidenceIds`; they never embed evidence records.

The bundle contains only evidence referenced by final resolutions. Every resolution evidence ID resolves to exactly one bundle item, every bundle item is referenced, and no evidence ID is duplicated.

`RequirementResolution` contains:

```js
{
  requirementId,
  status,
  evidenceIds,
  reasonCodes,
  candidateSummary,
  refresh: { needed, refreshKeyHash, outcome, reasonCode },
  cacheStatus,
  maxEvidenceAgeMs,
  authorityClasses,
  providersUsed,
  conflictStatus,
  latencyMs
}
```

`cacheStatus` is one of `fresh_hit`, `stale_safe_hit`, `miss`, `refreshed`, `coalesced`, or `not_applicable`. Age and authority/provider fields describe selected evidence only.

## Telemetry Artifacts

WP5A separates three artifacts:

1. `EvidenceBundle`: evidence delivered to one turn.
2. `RequirementResolution[]`: logical coverage for that turn.
3. `EvidenceRefreshEvent`: append-only shared physical retrieval behavior.

Turn telemetry records bounded requirement metadata and references a keyed `refreshKeyHash`. It distinguishes `coalescedRequirements` from `coalescedWaiters`.

`EvidenceRefreshEvent` is an immutable terminal record appended once when a physical refresh settles. It records provider, operation, start/completion times, requirement count, waiter peak, lease outcome, provider attempts, retries, candidate/persistence/rejection counts, outcome, reason code, latency, and cost status/value. Physical provider cost exists once on the refresh event and is not copied into every coalesced turn. In-flight state belongs to the lease and in-process coalescer, not a mutable event record.

Asynchronous stale refresh completion appends one terminal shared refresh event. It never rewrites historical turn coverage.

Telemetry excludes raw prompts/responses, claim text, user/session identifiers, provider request parameters, coordinates, raw errors/bodies, credentials, and unhashed refresh keys.

## Legacy Semantic Comparison

WP5A compares legacy NPS fetching with broker resolution using topic/freshness metadata only:

```js
{
  legacyFetchedNps,
  legacyTopics,
  brokerTopicsCovered,
  semanticCoverageMatch,
  missingLegacyTopics,
  additionalBrokerTopics,
  freshnessDifferences
}
```

No raw legacy fact or broker claim text enters comparison telemetry.

## Shadow Isolation

The broker runs only after the legacy request has completed its authoritative fetch decisions. Its requirements and bundle are never passed to `fetchRelevantFacts`, prompt assembly, model routing, canonical response construction, persistence, or response serialization.

The shadow wrapper has a hard timeout and catches broker, Mongo, adapter, and telemetry failures. A catastrophic shadow failure records only bounded infrastructure status. It cannot reject, delay beyond the wrapper budget, mutate, or replace the legacy Trailie result on any of the four chat routes.

## Mandatory Test Matrix

Tests cover:

- bundle selected-only evidence, deterministic ordering, primitive timestamps, deep immutability, and referential integrity;
- duplicate requirement identity validation and independent stricter contracts;
- fresh, stale-safe, hard/zero-stale, partial, missing, conflict, unsupported, and cancellation outcomes;
- candidate rejection counters for expiry, scope, type, authority, conflict, and privacy;
- explicit proven absence versus unknown empty results;
- NPS adapter topic support, purity, normalization, completeness, and bounded errors;
- requirement-oriented multi-claim lookup;
- zero-call cache reuse, idempotency, supersession, privacy, sibling candidate isolation, and fencing;
- semantic dedupe-key collision refusal;
- profile requirement grouping and operation-specific separation;
- twenty concurrent alerts callers producing one physical fetch and nineteen coalesced waiters;
- cancellation detach, final-waiter abort, lifecycle races, distributed polling, and fenced release;
- physical budgets, bounded retries, attempt accounting, and cost ownership;
- four-route parity, prompt/output isolation, telemetry privacy, and catastrophic shadow failure isolation;
- the Yosemite A/B/C cross-user reuse proof.

All tests use injected provider adapters or fixtures under the provider-disabled harness. WP5A tests perform zero live NPS or other provider calls.

## Freeze Criteria

WP5A freezes only when the mandatory matrix passes, provider isolation counters remain zero, the full provider-disabled suite introduces no failures beyond the frozen baseline, and structural tests prove broker output cannot alter the live Trailie execution path.
