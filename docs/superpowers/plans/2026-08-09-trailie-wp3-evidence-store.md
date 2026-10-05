# Trailie WP3 Evidence Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Trailie's canonical public-evidence models and atomic store primitives without integrating them into the live request path.

**Architecture:** Five strict Mongoose models provide durable structure and indexes. Focused entity, freshness-policy, lease, and store services provide deterministic resolution, fenced immutable versioning, and bounded retention while model hooks retain privacy defense in depth.

**Tech Stack:** Node.js CommonJS, Mongoose 7, MongoDB transactions, Jest 29, mongodb-memory-server, provider-disabled test harness.

## Global Constraints

- No NPS, RIDB, web-cache, or other provider migration.
- No broker, fetch-plan, prompt, route, frontend, or production evidence read/write change.
- Every canonical shared write calls `assertPublicEvidenceWrite({ item, sourceRequest })`.
- `expiresAt` never has a TTL index; only `deleteAfter` controls canonical evidence deletion.
- Raw staging defaults to 7 days, is capped at 30 days, and bounds excerpts at 4,000 characters.
- Every canonical evidence write verifies a live lease's `leaseKey`, `ownerId`, and `fencingToken`.
- All tests run with provider access denied.

---

### Task 1: Model, key, and policy contracts

**Files:**
- Modify: `server/src/models/TrailieEntity.js`
- Modify: `server/src/models/TrailieEvidence.js`
- Modify: `server/src/models/TrailieEvidenceRaw.js`
- Modify: `server/src/models/TrailieEvidenceConflict.js`
- Modify: `server/src/models/TrailieEvidenceRefreshLease.js`
- Modify: `server/src/utils/evidenceKey.js`
- Create: `server/src/config/evidencePolicies.js`
- Test: `server/src/models/__tests__/trailieEvidenceModels.test.js`
- Test: `server/src/utils/__tests__/evidenceKey.test.js`
- Test: `server/src/config/__tests__/evidencePolicies.test.js`

**Interfaces:**
- Produces: `buildEvidenceKeys(item)`, `getEvidencePolicy(topic)`, `evaluateEvidenceFreshness(evidence, options)`.

- [ ] Write failing policy/property tests for all v2 freshness classes, critical stale rejection, date/scope/source/claim key isolation, TTL separation, and strict schemas.
- [ ] Run the focused tests and confirm failures are caused by missing policy behavior.
- [ ] Implement the minimal policy and schema/key changes.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Canonical entity resolution

**Files:**
- Create: `server/src/services/evidenceEntityService.js`
- Create: `server/src/services/__tests__/evidenceEntityService.test.js`

**Interfaces:**
- Produces: `normalizeEntityAlias(value)`, `resolveEntity({ EntityModel, entityId, alias, providerId })`, and `upsertEntity({ EntityModel, entity })`.

- [ ] Write failing tests proving aliases normalize deterministically, provider IDs round-trip, ambiguity is rejected, and duplicate upserts are idempotent.
- [ ] Run the focused tests and confirm the expected missing-module/API failure.
- [ ] Implement atomic lookup/upsert with model injection and no provider calls.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Refresh leases and fencing

**Files:**
- Create: `server/src/services/evidenceRefreshLeaseService.js`
- Create: `server/src/services/__tests__/evidenceRefreshLeaseService.test.js`

**Interfaces:**
- Produces: `acquireEvidenceRefreshLease`, `verifyEvidenceRefreshLease`, `releaseEvidenceRefreshLease`, `LEASE_OUTCOME`, and stable stale-lease error codes.

- [ ] Write failing tests for first acquisition, live contention, expired reclaim, increasing fencing tokens, wrong owner, expired lease, stale token, release, and duplicate-key races.
- [ ] Run the focused tests and confirm the service is missing.
- [ ] Implement acquisition as one atomic `findOneAndUpdate`, using the unique lease key as the contention boundary.
- [ ] Implement verification/release predicates that include lease key, owner, token, and explicit expiry checks.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Canonical evidence store

**Files:**
- Create: `server/src/services/evidenceStoreService.js`
- Create: `server/src/services/__tests__/evidenceStoreService.test.js`

**Interfaces:**
- Consumes: `buildEvidenceKeys`, `assertPublicEvidenceWrite`, `verifyEvidenceRefreshLease`, `TrailieEvidence`, and `TrailieEvidenceRefreshLease`.
- Produces: `upsertEvidenceVersion({ EvidenceModel, LeaseModel, startSession, candidate, sourceRequest, lease, now })` and `getCurrentEvidence(...)`.

- [ ] Write failing tests proving privacy validation precedes persistence and lease validation rejects missing/expired/wrong-owner/stale-token writes.
- [ ] Write failing tests for idempotent same-content writes and changed-content supersession (`A.isCurrent=false`, `B.isCurrent=true`, `B.supersedesEvidenceId=A`).
- [ ] Write a failing concurrency test proving duplicate active versions cannot survive.
- [ ] Run the focused suite and confirm failures reflect the missing store behavior.
- [ ] Implement transactional lease verification, deterministic keys, idempotency, and immutable supersession.
- [ ] Run the focused suite and confirm it passes.

### Task 5: Index rollout and isolation verification

**Files:**
- Create: `server/scripts/create-trailie-evidence-indexes.js`
- Create: `server/src/services/__tests__/evidenceStoreIsolation.test.js`
- Modify: `server/src/models/__tests__/trailieEvidenceModels.test.js`

**Interfaces:**
- Produces: an explicit `--apply` index-creation script that uses `createIndexes()` and never drops existing indexes.

- [ ] Write failing structural tests for safe index creation and absence of evidence-store imports from the four live AI routes.
- [ ] Implement the dry-run/apply script without adding it to application startup.
- [ ] Run all WP3 tests through `scripts/run-provider-disabled-tests.js`.
- [ ] Run the frozen WP2 classifier/route suites and compare against the pre-WP2 baseline manifest.
- [ ] Review the final diff to confirm only WP3-owned backend/docs files changed and no live route was wired.

