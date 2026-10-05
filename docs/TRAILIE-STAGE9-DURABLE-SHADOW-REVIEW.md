# Stage 9 — Durable Sampled Shadow Review Off the Critical Path

**Goal:** remove all reviewer/model execution from the user-response path while
preserving exact, reproducible shadow evaluation against the canonical response
and the real evidence fetched during generation.

**Status:** Implemented TDD-first. **Not committed, not pushed.** Enforcement is
NOT enabled. Enqueue and the worker are **disabled by default**. Plan AI is not
redesigned.

---

## 1. Exact request → enqueue → worker flow

```text
generate canonical response
  → deterministic final guards (extract/correct/validate/score/strip/hash)   [request path]
  → build canonical envelope (content, itinerary, hashes, responseId)         [request path]
  → sample deterministically on responseId                                    [request path]
  → (if enabled + sampled) build immutable snapshot + bounded durable enqueue  [request path]
  → send SSE `done` / HTTP response                                           [request path ENDS]
  ────────────────────────────────────────────────────────────────────────
  → worker claims job via atomic lease                                        [off path]
  → verifies snapshot hashes (reject `invalid` before any provider call)      [off path]
  → runs runTrailieReviewPipeline forced mode:'shadow'                        [off path]
  → asserts content + itinerary byte-for-byte unchanged                       [off path]
  → writes sanitized telemetry, clears payload                                [off path]
```

The request path may perform a **single bounded durable enqueue** (strict short
timeout) but never waits for any reviewer/model call.

## 2. Code removed from the request path

`server/src/routes/ai.js`, inside `processAssistantResponse`:

- **Removed** the synchronous `await runTrailieReviewPipeline({...})` call and
  the assignment `finalContent = review.content` / `reviewMeta = review.reviewMeta`.
- **Removed** the `require('../services/trailieReviewPipeline')` import — the
  route module no longer references the model-based reviewer at all.

**Kept (deterministic, no model call):** itinerary extraction & correction,
feasibility validation, artifact stripping, empty-output guard
(`getFinalResponseRejectionReason`), canonical response construction, and
content/itinerary hashing. A structural test proves the request path calls none
of `runTrailieReviewPipeline`, `reviewSection`, or `runVerificationPass`.

Response-time `reviewMeta` is now **scheduling metadata only**:

```js
{ reviewerMode: 'shadow', reviewExecution: 'async',
  reviewQueueStatus: 'queued'|'not_sampled'|'disabled'|'enqueue_failed',
  repaired: false, patchesApplied: 0,
  reviewSampleRate, reviewSampleBucket, reviewEnqueueDurationMs }
```

The internal `reviewJobId` is **logged, never persisted** to the public envelope.

## 3. Sampling defaults and eligibility

`server/src/utils/trailieReviewSampler.js` — pure, `crypto`-hash of `responseId`
(never `Math.random`). Guarantees: same responseId → same decision; retries buy
no new chance; `sampleRate=0` → none; `sampleRate=1` → all eligible; invalid/absent
rate → `0`; missing responseId → not sampled.

**Ineligible** (never sampled): empty/whitespace responses, welcome messages,
conversion messages (`model:'conversion'` or flag), provider errors, and
`provider:'system'`. Sampling records only `bucket` + `sampleRate` — no
user-identifying data.

Config (`server/src/config/trailieReviewConfig.js`), all fail-safe:

```text
TRAILIE_REVIEW_ENQUEUE_ENABLED=false
TRAILIE_REVIEW_WORKER_ENABLED=false
TRAILIE_REVIEW_SAMPLE_RATE=0            # invalid/out-of-range → 0
TRAILIE_REVIEW_WORKER_CONCURRENCY=2
TRAILIE_REVIEW_JOB_MAX_ATTEMPTS=3
TRAILIE_REVIEW_ENQUEUE_TIMEOUT_MS=400   # bounded single-insert budget
TRAILIE_REVIEW_LEASE_MS=120000          # > max expected review duration
TRAILIE_REVIEW_PAYLOAD_RETENTION_SECONDS=172800  # 48h TTL for terminal payloads
```

## 4. Job schema and unique keys

`server/src/models/TrailieReviewJob.js` (Mongo — no existing durable queue found).

Fields: `jobId, responseId, responseVersion, contentHash, itineraryHash,
reviewerVersion, idempotencyKey, status, sampleRate, sampleBucket, attempts,
maxAttempts, nextRunAt, leaseOwner, leaseExpiresAt, payload, result, lastError,
lastErrorClass, startedAt, completedAt, payloadExpiresAt, createdAt, updatedAt`.

`status ∈ {queued, leased, completed, retry, failed, dead, invalid}`.

**Idempotency key** = `sha256(responseId + contentHash + itineraryHash +
reviewerVersion)`, enforced by a **unique index** on `idempotencyKey`.

- Exact duplicate → idempotent success (returns existing `jobId`, no 2nd job).
- Same `responseId` + `reviewerVersion`, different hashes → **conflict** (no 2nd
  billable job).
- Unique-index race on insert (E11000) resolves to the idempotent duplicate.

## 5. Snapshot contents and retention

`server/src/utils/trailieReviewSnapshot.js` — built while the generation context
and the **exact** canonical fact bundle are in scope (the worker never refetches
or reconstructs facts):

```js
{ snapshotVersion:'v1',
  canonicalResponse: { responseId, responseVersion, content, contentHash,
                       itineraryData, itineraryHash },
  canonicalFactStatus,
  canonicalFacts: [ {id,category,source,authority,status,text,parkCode,parkName,
                     validFrom,validTo,localDate,url} ],   // projected — no `terms`/raw feeds
  structuredConstraints, resolvedMetadata, parkIdentityCoverage }
```

**Excludes** conversation history, user email/profile, auth data, full/raw
prompt, provider keys, unrelated history. `resolvedMetadata` is whitelisted to
park-identity fields only.

**Retention:** the payload is short-lived operational data. It is **cleared on
successful completion**; terminal jobs that still carry a payload (`failed`,
`dead`, `invalid`) get `payloadExpiresAt = now + PAYLOAD_RETENTION_SECONDS`
(default **48h**) and a **TTL index** drops them. Durable telemetry keeps only
IDs, hashes, counts, durations, and reason codes — never full response or fact
text.

## 6. Lease / retry / dead-job behavior

- **Claim:** atomic `findOneAndUpdate` over `{status∈{queued,retry}, nextRunAt≤now,
  no live lease}` → `leased`, `attempts++`, `leaseExpiresAt = now + LEASE_MS`.
  Two workers can never lease one job; an active lease cannot be stolen.
- **Renew:** `renewLease` extends only the owning lease (long reviews stay safe).
- **Recovery:** `recoverExpiredLeases` returns expired-lease `leased` jobs to
  `retry`.
- **Retry (retryable):** bounded exponential backoff with **full jitter**,
  hard-capped at 300s. Retryable = provider timeout, transient network/DB error,
  lease loss.
- **Non-retryable:** hash mismatch, malformed/unsupported snapshot, identity
  conflict, deterministic content/itinerary mutation → terminal immediately.
- **Dead:** on a retryable failure once `attempts ≥ maxAttempts` → `dead`. Never
  retried indefinitely.

## 7. Proof `done` no longer waits for review

- `runTrailieReviewPipeline` is neither imported nor called anywhere in
  `ai.js` (structural test 4 in `trailieRouteContract.test.js`).
- The seam (`processPreparedTrailieResponse`) makes **zero** reviewer calls
  (test 1). The only awaited async in the response path is the bounded enqueue,
  which itself races a strict timeout (`enqueueTimeoutMs`) and can only resolve
  to a queue status — never a reviewer result.
- `requestPathReviewScheduling.test.js` proves the canonical `content`/hashes are
  **identical** whether enqueue is disabled, succeeds, or fails, and that an
  `enqueue_failed` result never fails the response.

## 8. Proof the worker cannot mutate canonical data

`server/src/services/trailieReviewWorker.js`:

- Forces `mode: REVIEWER_MODE.SHADOW`, `enforcementEnabled: false` **regardless
  of env** (test proves it ignores `TRAILIE_REVIEWER_MODE=enforce`).
- Recomputes hashes and rejects `invalid` **before any provider call** on drift.
- Asserts `review.content === snapshot content` byte-for-byte and the itinerary
  hash is unchanged; a diff throws a **non-retryable** error → `failed`, and no
  telemetry is recorded as passed.
- Writes only to `TrailieReviewTelemetry` (separate collection). It never touches
  `trip.plan`, conversation messages, `reviewMeta` inside the plan, save status,
  or canonical hashes. Async jobs are evaluation-only.

## 9. Telemetry schema

`server/src/models/TrailieReviewTelemetry.js` — sanitized, separate from the trip
plan: `responseId, responseVersion, contentHash, itineraryHash, reviewerVersion,
jobId, reviewStatus, attempts, durationMs, sectionsTotal/Reviewed/Failed,
reviewCoverageRatio, issuesDetected, policyApproved, hypotheticalPatchesVerified/
Failed, wouldApply/Warn/Quarantine, contentUnverified, evidenceReasonCounts,
issueTypeCounts, issues[] (capped, sanitized), createdAt, completedAt`. Unique on
`(responseId, contentHash, itineraryHash, reviewerVersion)`. No full response,
full facts, model rationale, or replacement prose. A queued job is never labeled
reviewed; a partial/error review is never labeled passed.

## 10. Tests (focused + full-suite)

New/updated suites (all pass — run from `server/`):

| Suite | Covers |
|---|---|
| `utils/__tests__/trailieReviewSampler.test.js` | determinism, 0/1 rates, invalid→0, retries, eligibility, uniformity |
| `config/__tests__/trailieReviewConfig.test.js` | fail-safe defaults, clamping, strict bool |
| `utils/__tests__/trailieReviewSnapshot.test.js` | exact identity, field projection, no PII/history, drift detection |
| `services/__tests__/trailieReviewQueue.test.js` | idempotent enqueue, conflict, atomic claim, steal-proof, lease recovery, backoff, dead, payload clear |
| `services/__tests__/trailieReviewWorker.test.js` | completion, hash-mismatch pre-provider reject, sanitized telemetry, concurrency cap |
| `services/__tests__/trailieReviewWorkerGuards.test.js` | forced shadow, mutation refusal, error≠passed, retryable provider error |
| `routes/__tests__/trailieRouteContract.test.js` | request path makes no reviewer call; structural proof |
| `routes/__tests__/requestPathReviewScheduling.test.js` | hashes unchanged across enqueue outcomes; failure never fails response |

**Focused:** `npx jest trailieReview trailieRouteContract requestPathReview
finalResponseGuards` → **10 suites / 98 tests pass**.

**Full suite:** the only failing suites (`npsParkAdapter`, `prompts`,
`parkChatImages`, `trailieFetchPlanner`, `npsParkConditions`, `blogController`,
`auth`/`parks` integration) fail identically on a clean `HEAD` (email JSX
transform + live NPS/network) — **Stage 9 introduces zero new failures**.

## 11. Remaining deployment requirements for running the worker

1. Set `TRAILIE_REVIEW_ENQUEUE_ENABLED=true` to start enqueuing (still gated by
   `TRAILIE_REVIEW_SAMPLE_RATE`, default `0` → nothing sampled).
2. Set `TRAILIE_REVIEW_SAMPLE_RATE` to a small value (e.g. `0.02`) to begin
   sampling.
3. Set `TRAILIE_REVIEW_WORKER_ENABLED=true` on the process that should run the
   worker (bootstrapped in `server.js`, gated, with graceful-shutdown drain).
4. Ensure `ANTHROPIC_API_KEY` is present wherever the worker runs — without it
   the worker stays idle.
5. Mongo TTL monitor must be active (Atlas default) so `payloadExpiresAt` drops
   terminal payloads. Confirm the retention window meets policy.
6. Optional: tune `TRAILIE_REVIEW_WORKER_CONCURRENCY`, `..._JOB_MAX_ATTEMPTS`,
   `..._LEASE_MS`, `..._ENQUEUE_TIMEOUT_MS`.

Nothing above is enabled by default.
