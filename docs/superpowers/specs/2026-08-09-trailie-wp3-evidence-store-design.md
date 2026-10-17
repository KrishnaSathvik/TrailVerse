# Trailie WP3 Evidence Store Design

## Goal

Add the canonical public-evidence persistence layer defined by the Trailie AI Architecture v2 specification without reading from it, writing to it, or otherwise changing any live Trailie request path.

## Scope

WP3 owns five isolated Mongoose collections (`TrailieEntity`, `TrailieEvidence`, `TrailieEvidenceRaw`, `TrailieEvidenceConflict`, and `TrailieEvidenceRefreshLease`), deterministic evidence keys, freshness/retention policy, entity lookup, immutable evidence versioning, refresh-lease fencing, and the public-write privacy invariant.

WP3 does not migrate NPS, RIDB, web, or other provider caches. It does not add a broker, provider adapter, fetch-plan change, prompt change, route integration, or production evidence read/write.

## Architecture

Provider adapters introduced in later work packages will produce public candidate evidence. The canonical store boundary validates the candidate schema and privacy scope, builds deterministic logical/version keys, verifies a current refresh lease, and commits the immutable version. Adapters never receive direct model-write authority.

Focused modules preserve the boundaries:

- `evidencePolicies` owns freshness and retention constants.
- `evidenceEntityService` normalizes aliases/provider IDs and resolves canonical entities.
- `evidenceRefreshLeaseService` atomically acquires or reclaims leases and issues fencing tokens.
- `evidenceStoreService` evaluates freshness and performs idempotent or superseding writes.
- Mongoose models own strict document validation and indexes as a final defense.

## Identity and keys

Entity IDs are immutable canonical identities such as `nps:park:yose`. Alias and provider-ID lookup may resolve to that identity, but aliases never become evidence cache keys.

An evidence logical key contains normalized entity, topic, temporal/geographic scope, source identity, evidence type, and claim identity. Claim content is excluded from the logical key and included in the immutable version key. Consequently, a changed claim retains one logical history while receiving a new `evidenceId` and `canonicalKey`.

## Versioning and concurrency

Unchanged content is idempotent and returns the existing version. Changed content is written in a MongoDB transaction: lock by logical-key/current-state predicates, mark the old version non-current, and insert the new current version with `supersedesEvidenceId`. Unique indexes enforce one immutable canonical version and at most one current version per logical key.

Every canonical evidence write requires a live refresh lease. Lease acquisition is a single atomic upsert/reclaim operation. Reclaim increments `fencingToken`; a live lease causes a bounded conflict result. Store writes validate `leaseKey`, `ownerId`, `fencingToken`, and `expiresAt` inside the write transaction. Owner ID is checked in addition to the numeric token because MongoDB TTL cleanup can eventually delete an expired lease document and allow a later numeric token to restart.

## Freshness and retention

`observation.expiresAt` is only the fresh/stale boundary. `observation.staleUntil` is the maximum permissible stale boundary. `retention.deleteAfter` is the only TTL deletion boundary for canonical evidence. Critical safety requirements never consume stale evidence.

Raw staging defaults to seven days, is capped at thirty days, stores bounded excerpts rather than full copyrighted pages, and uses `deleteAfter` for TTL cleanup.

## Privacy

Every shared canonical or raw write calls `assertPublicEvidenceWrite({ item, sourceRequest })`. Strict schemas and recursive inspection reject user/account/session/trip/conversation identifiers, raw prompts or queries, exact private origins, personal constraints, and nested private metadata. Privacy failure aborts the write; there is no permissive fallback.

## Failure behavior

Expected lease contention returns a bounded conflict outcome. Missing, expired, wrong-owner, or stale-token leases reject canonical writes with stable error codes. Duplicate-key and transient-transaction races are retried only through MongoDB transaction semantics; they never overwrite history. Validation and privacy errors are not retried.

## Verification

Provider-disabled tests cover deterministic keys, entity alias/provider resolution, schema/index registration, freshness boundaries, retention TTL separation, raw retention limits, privacy rejection, idempotent upsert, immutable supersession, concurrent current-version uniqueness, conflict linkage, lease reclaim, and stale-owner fencing. Structural verification confirms no AI route imports or calls the new store.

