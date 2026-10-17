# Stage 14.7P — Canonical itinerary drift diagnosis and live-evidence repair

Date: 2026-08-06  
Mode: deterministic, provider denied  
Decision retained: `STAGE14_7_LIVE_CONFIRMATION_FAILED`

## Outcome

The preserved three-day itinerary is valid and remains canonically identical from accepted Phase A through authenticated restore and frontend selection. The reported `itinerary_invalid`, `identity_not_stable`, `restore_hash_mismatch`, and `restore_plan_mismatch` were evaluator comparison bugs, not production itinerary drift. No production itinerary behavior was changed.

Paid execution remains blocked. The new scenario is defined but unauthorized, the current cumulative caps cannot cover the complete future plan, and `liveExecutionReady` is false.

## Preserved paid evidence and cumulative exposure

Neither historical ledger nor consumption marker was modified.

| Scenario | Run | Requests | Input | Output | Cost basis | Cost | State |
|---|---|---:|---:|---:|---|---:|---|
| `basic-02-three-day` | `stage147g-msga12h5-30340b` | 3 | 60,000 | 20,000 | conservative | $0.320000 | consumed |
| `basic-02-three-day-model-fix-validation-1` | `stage147g-mshqzkal-cda9db` | 2 | 37,714 | 7,733 | settled actual | $0.152758 | consumed |
| Cumulative | — | 5 | 97,714 | 27,733 | conservative + actual | $0.472758 | permanent |

The canonical resolver reads both private evidence ledgers and fails closed if either is absent, malformed, non-finite, or inconsistent. The immutable source-file hashes are recorded in `artifacts/private/stage14_7P-cumulative-exposure.json`.

## Exact `itinerary_invalid` diagnosis

Validation was performed on the preserved Phase-A provider itinerary from the captured SSE transcript.

```json
{
  "valid": true,
  "category": "evaluator_comparison_bug",
  "failures": []
}
```

There are therefore no JSON paths, expected contracts, or observed invalid types to report. The provider output satisfies the supported day/stop contract and contains exactly three days.

The false result was caused by the evaluator reading `turn.state.canonicalPlan.days`; the coordinator stores accepted snapshots at `turn.state.revision1.canonicalPlan` and `turn.state.revision2.canonicalPlan`. Identity also read `event.responseId`, although the real event contract carries `event.response.responseId`. Restore comparisons repeated the nonexistent top-level state lookup. These comparisons evaluated missing values rather than the captured itinerary.

The bounded validator now reports `code`, `jsonPath`, `expectedContract`, `observed`, and `source` for any future invalid field and distinguishes provider output, deterministic normalization, persistence transformation, fallback, and validator-shape failures.

## Canonical A–I identity diff

After excluding the documented presentation/lifecycle fields, every transition has the same SHA-256 canonical frozen-plan hash:

`892ab8020351190b5cfc5de23efc014bf7d9b1ad5f1e54badd19a88fbf59f58d`

| Left | Right | Frozen hash equal |
|---|---|---|
| A accepted Phase-A plan | B itinerary-ready revision 1 | yes |
| B itinerary-ready revision 1 | C revision-1 persistence payload | yes |
| C revision-1 persistence payload | D stored revision-1 trip | yes |
| D stored revision-1 trip | E prose-ready revision 2 | yes |
| E prose-ready revision 2 | F revision-2 persistence payload | yes |
| F revision-2 persistence payload | G stored revision-2 trip | yes |
| G stored revision-2 trip | H authenticated restore response | yes |
| H authenticated restore response | I frontend-selected restored state | yes |

All field differences are bounded metadata projections. The complete hash-only mismatch records are in `artifacts/private/stage14_7P-captured-replay.json`; no plan text is included. They comprise eight D→E revision/lifecycle fields (`auditTrail`, `contentHash`, `generatedAt`, `lifecycleStatus`, `previousRevision`, `proseReadyAt`, `responseRevision`, `reviewMeta`) and one F→G `generatedAt` representation. Each is classified `expected_projection_difference`. There are zero `prohibited_plan_mutation` records.

The accepted revision-1 canonical plan is the authoritative frozen-plan boundary. It owns the itinerary hash, complete days/activities, destination identity, warnings, and contract-permitted evidence. Revision 2 reuses that frozen content and adds prose/lifecycle metadata; persistence and restore preserve its canonical serialization.

## Repairs

No production itinerary, serializer, persistence, or restore defect was proven, so none was changed.

Evaluator and evidence repairs:

- Compare the actual revision-1 and revision-2 coordinator snapshots and the nested response ID.
- Build and qualify the complete A–I canonical diff.
- Compute `lifecycleJournalMatches` from the actual journal. The exact ten entries produce `true`; missing input produces `lifecycle_journal_result_missing` rather than false.
- Report `currentRun`, `priorExposure`, and `cumulative` separately and reconcile all four dimensions as `prior + current = cumulative`.
- Retain bounded future provider evidence: provider request ID, ledger attempt ID, dispatch authorization ID, provider, four model-identity fields, and usage source. Qualification requires a unique one-to-one row per provider HTTP request.
- Add explicit Mongo process, port, fresh connection, ping, target, existing Mongoose-state, shared-resource cleanup, and shutdown-race diagnostics.
- Seed and count a foreign user/trip/lease owner directly before and after current-run cleanup.

## Mongo root cause and foreign records

The historical `localMongoStillAvailable = false` was a `diagnostic_bug`: the result was not measured/populated. The zero-provider replay measured the same running local Mongo before and after cleanup without restarting it:

| Check | Before | After |
|---|---:|---:|
| mongod process running | true | true |
| port 27018 listening | true | true |
| fresh connection succeeds | true | true |
| ping succeeds | true | true |
| existing Mongoose readyState | 1 | 1 |
| cleanup closed shared resource | false | false |
| ping raced shutdown | false | false |

Foreign application records were unchanged: users 1→1, trips 1→1, leases 0→0. Fixture teardown then removed only the explicitly created foreign IDs.

## Captured transcript replay

The exact 83,376-byte captured transcript (83,074 JavaScript characters) was driven through the real SSE parser, coordinator/reducers, revision payload builders, isolated persistence, authenticated owner restore, and stored presentation resolver.

```json
{
  "itineraryValid": true,
  "lifecycleJournalMatches": true,
  "identityStable": true,
  "restoreHashMatches": true,
  "restorePlanMatches": true,
  "persistenceHttpRequests": 2,
  "acceptedWrites": 2,
  "automaticPersistenceRequestsFromDone": 0,
  "providerCalls": 0
}
```

## Future scenario and feasibility

`basic-02-three-day-canonical-fix-validation-2` reuses the original Grand Canyon scenario definition, has its own immutable ID, links to both consumed attempts, has no consumption marker, has `executionAuthorized: false`, and is absent from the paid executable manifest. `basic-03-seven-day` remains available and cannot run alone.

The production reservation/retry policy projects four bounded provider attempts per future scenario:

| Future scenario | Requests | Input | Output | Worst-case cost |
|---|---:|---:|---:|---:|
| three-day canonical-fix validation | 4 | 80,000 | 34,000 | $0.50 |
| seven-day | 4 | 80,000 | 40,000 | $0.56 |

```json
{
  "cumulativeProjectedRequests": 13,
  "cumulativeProjectedCostUsd": 1.532758,
  "cumulativeProjectedInputTokens": 257714,
  "cumulativeProjectedOutputTokens": 101733,
  "currentCaps": {
    "requests": 12,
    "costUsd": 1.5,
    "inputTokens": 240000,
    "outputTokens": 100000
  },
  "cumulativeBudgetFeasible": false,
  "blockingCaps": [
    "max_requests",
    "max_total_cost_usd",
    "max_input_tokens",
    "max_output_tokens"
  ],
  "minimumCapsForCompletePlan": {
    "requests": 13,
    "costUsd": 1.532758,
    "inputTokens": 257714,
    "outputTokens": 101733,
    "applied": false
  }
}
```

No cap was changed.

## Regression results

Stage-scoped and authoritative qualification are green:

- Exact captured-transcript replay: 1/1 passed.
- Stage 14.7 server suite: 292/292 passed.
- Receipt/composite contract: 67/67 passed after refreshing its version and phase-T assertions.
- Deterministic composite preflight: all 20 phases passed, exit 0, zero provider calls, $0.00 provider cost.

The established repository-wide suites were also run. They are not fully green for unrelated pre-existing expectations, which were not changed as part of this evidence-only stage:

- Provider-disabled server: 2,232/2,241 assertions passed in the full run. Four stale 14.7 receipt assertions from that run were then repaired and the complete 67-test receipt suite passed, leaving five unrelated assertion failures (follow-up classification, park search ranking, network-dependent NPS gallery/conditions, and a date-sensitive astronomy fixture) plus three existing Jest JSX-transform suite-load failures (`parks`, `auth`, and `blogController`).
- Full frontend: 745/756 passed. The 11 unrelated failures are one stale day-by-day fallback string, two fetch-mock signatures now receiving an `AbortSignal`, one obsolete weather loader selector, and seven Header tests whose `ThemeSwitcher` mock lacks `SegmentedThemeSkeleton`.

The Stage 14.7P paths and the complete deterministic composite are green; the repository-wide deviations above remain visible rather than being weakened or hidden.

## Readiness and stop boundary

The `14.7O.1` receipt is invalidated. The deterministic composite preflight mints and immediately validates `14.7P.1`, fingerprinting the canonical serializer/hash, frozen-plan owner, revision payloads, persistence/restore projections, lifecycle/accounting/provider/Mongo/foreign evidence code, captured replay, replacement definition, and feasibility projector.

Receipt SHA-256: `2828c657f331d84f98549f0c21fd9526e57ce890859b4a66b76a8803d22883de`.

Expected readiness semantics:

```json
{
  "liveExecutorTechnicalReady": true,
  "canonicalIdentityPassed": true,
  "liveEvidenceReportingPassed": true,
  "localMongoAvailabilityPassed": true,
  "foreignRecordPreservationPassed": true,
  "futureScenarioDefined": true,
  "futureScenarioAuthorized": false,
  "liveExecutionReady": false
}
```

No new replacement or seven-day scenario was authorized or executed. No Atlas connection, internal acceptance test, production flag change, deployment, commit, or push was performed.
