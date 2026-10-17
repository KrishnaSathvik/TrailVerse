# Stage 14.7F7 — Shared-route no-store and final composite preflight

The last deterministic, zero-cost stage before the two-scenario live confirmation.
No live provider calls, no Atlas, no global rollout flags, no canary planning, no
commit/push. Spend: **$0.00**.

---

## 1. Shared route and middleware placement

```
GET /api/trips/shared/:shareId       server/src/routes/trips.js
router.use('/shared/:shareId', ...)  same file, immediately above the handler
                                     and above router.use(protect)
```

Applied as middleware *before* the handler so the header is present on the
success path and on bounded errors alike:

```js
res.set('Cache-Control', 'no-store');
```

Nothing else changed: share scopes, response bodies, revision-1 notes status,
revision-2 prose visibility, `plan_only` behaviour, owner restore and export are
all untouched, and ETags are **not** disabled globally.

## 2. Cache headers

```js
{
  revision1CacheControl:   'no-store',
  revision2CacheControl:   'no-store',
  missingShareCacheControl:'no-store',
  vary: null,
  revision1Etag: 'W/"…"',
  revision2Etag: 'W/"…"'   // differs from revision 1
}
```

No `public`, no `s-maxage`, no `immutable`, no positive `max-age`. `plan_only`
and `plan_plus_explanation` both carry the header, with scope semantics
unchanged.

## 3. ETag / revalidation

Revision-1 and revision-2 ETags differ. A request carrying **revision 1's**
`If-None-Match` after revision 2 lands returns **200 with the revision-2 body**,
not a stale `304`. A request carrying the current ETag may return 200 or 304 per
existing Express behaviour, and retains `no-store` either way.

```js
{ applicationSharedCachePolicySafe: true,
  deployedSharedCachePolicyVerified: false }
```

The second stays false: this stage does not deploy or contact production.
Deployed header verification belongs to the canary plan and needs no further
live generation.

---

## 4. Composite preflight architecture

`server/eval/run-stage14_7-early-visibility-two.js` is now a thin entrypoint over
`server/src/eval/stage14_7/compositePreflight.js`.

The old script answered "are we ready?" from environment variables alone and
printed `Preflight PASSED` — the most dangerous kind of green, because it
described the configuration rather than the system. Static configuration is now
**one phase among fourteen**, and readiness is computed from freshly executed
phases rather than read from a file.

| phase | what it executes |
|---|---|
| A | fixture validation |
| B | isolated-Mongo guard **and** a real loopback ping |
| C/D/E | import-safety, side-effect sweep, constructor + outbound isolation |
| F | evaluation model/index readiness barrier |
| G | shared-route no-store suite |
| H/I | both actual authenticated-route scenarios + replay variants |
| J | duplicate/replay at the real persistence endpoint |
| K | restore, projection boundaries, canonical succession |
| L | interruption matrix |
| M | cleanup ownership matrix |
| N | final zero-provider / zero-spend reconciliation |

Child processes use `spawnSync(command, argvArray)` with no shell, and verdicts
come from the JSON reporter — never scraped text.

## 5. Gate results

```
  ok  static_configuration            ok  H_three_day_actual_route
  ok  A_fixture_validation            ok  I_seven_day_actual_route
  ok  B_isolated_mongo_guard_and_ping ok  J_duplicate_and_replay
  ok  C_fresh_child_env_bootstrap     ok  K_restore_and_projection
  ok  D_import_side_effect_sweep      ok  L_interruption_matrix
  ok  E_constructor_outbound_isolation ok M_cleanup_ownership_matrix
  ok  F_model_index_readiness         ok  N_final_zero_reconciliation
  ok  G_shared_route_no_store
```

`failedPhases: []`, exit code **0**.

Static configuration verifies all fifteen required items, including the real
production names (`TRAILIE_ITINERARY_GENERATION_MODE` etc.) and that the obsolete
`TRAILIE_ITINERARY_MODE` is **not set** — it has also been removed from the
scenario child's flag set, so no executable Stage 14.7 path sets it.

## 6–9. Route, replay, interruption and cleanup summaries

Both scenarios: `persistenceHttpRequests: 2, acceptedWrites: 2,
idempotentWrites: 0, staleWrites: 0, conflictWrites: 0,
automaticPersistenceRequestsFromDone: 0`, exact ten-entry journal,
persistence-before-reveal, itinerary revealed before revision 2 arrives, Phase B
released by `itinerary_revealed`, one card mount, no suppressed-chunk leakage.

Replay: duplicate revision 1 at revision 1 → idempotent; stale revision 1 after
revision 2 → stale; duplicate revision 2 → idempotent; replayed matching `done` →
idempotent reconciliation; mismatched `done` → fail closed. One assistant turn,
one plan, one card mount, byte-equivalent final state, no third automatic write.

Interruption: all ten cases from F6 re-executed with the approved durable-state
and restore outcomes; recovery inert throughout.

Cleanup: fresh `evaluationRunId` / `evaluationUserId` / `responseIds` /
`createdTripIds` per invocation; current-run trips, users and leases all `0`
afterwards; foreign-run records preserved; local Mongo available; ephemeral ports
closed.

## 10. Isolation and spend

```js
{ liveProviderCalls: 0, liveProviderCostUsd: 0,
  liveOpenAiConstructors: 0, liveAnthropicConstructors: 0, liveNpsServices: 0,
  externalNetworkAttempts: 0, blockedExternalNetworkAttempts: 0,
  syntheticAnthropicCallsAreDeterministic: true }
```

Synthetic Anthropic activity is counted separately and labelled deterministic, so
`liveAnthropicConstructors: 0` keeps its meaning.

## 11. Readiness receipt

Written to the gitignored `artifacts/private/stage14_7-readiness-receipt.json`
after a successful composite, then immediately re-validated.

Contains `preflightVersion`, `createdAt`, `gitHead`, **29 file hashes**,
`scenarioIds`, `sanitizedMongoTarget` (host/port/db only), `modelAllowlist`,
`costCaps`, a `configurationFingerprint` digest, and the composite result. No
credentials, no full URIs, no tokens, no prompts, no user data.

Hashed: the live runner, composite preflight, scenario child and parent driver,
AI streaming route, trips route, trip controller, trip model, write contract,
frozen-succession helper, plan/canonical persistence, projection helpers, shared
payload, stored-presentation resolver, frontend SSE parser, coordinator, reducers,
lifecycle, persistence-decision helper, export builder, isolation/cleanup
utilities, and both lockfiles.

`validateReceipt` refuses on: a changed file hash, changed configuration, changed
scenario ids, changed cost caps, changed model allowlist, changed Mongo target, a
receipt not showing zero spend, incomplete cleanup, or a missing receipt — each
as a bounded reason string, all reasons returned together.

## 12. Regression

- **Server:** 1854 passed, 5 failed, 157 suites — the known five, unchanged.
- **Frontend:** 735 passed, 11 failed — exactly the four branch-baseline files
  classified in F5 §1.
- New this stage: `compositePreflight` 51, shared cache policy 10.

## 13. Final readiness

```js
{
  preflightVersion: '14.7F7.1',
  applicationSharedCachePolicySafe: true,
  deployedSharedCachePolicyVerified: false,
  actualRouteDryRunPassed: true,
  externalIsolationPassed: true,
  duplicateDeliveryPassed: true,
  projectionBoundaryPassed: true,
  interruptedStateSafetyPassed: true,
  cleanupSafetyPassed: true,
  compositePreflightPassed: true,
  liveExecutionReady: true,
  liveProviderCalls: 0,
  liveProviderCostUsd: 0,
  readinessReceiptValid: true,
  failedPhases: []
}
```

## 14. The live command

Identical to the preflight command with `TRAILIE_EVAL_PREFLIGHT_ONLY` removed:

```bash
cd server

TRAILIE_EVAL_LIVE_PROVIDERS=true \
TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5" \
CLAUDE_PRIMARY_MODEL="claude-sonnet-5" \
TRAILIE_ITINERARY_GENERATION_MODE=tool_first \
TRAILIE_ROLLOUT_KILL_SWITCH=false \
TRAILIE_ROLLOUT_TOOL_FIRST_RATE=1 \
TRAILIE_PROSE_CONSISTENCY_MODE=enforce \
TRAILIE_EARLY_ITINERARY_EVENTS=true \
TRAILIE_PROSE_RECOVERY=false \
TRAILIE_REVIEW_ENQUEUE_ENABLED=false \
TRAILIE_EVAL_TEST_MONGODB_URI="mongodb://127.0.0.1:27018/trailverse_eval_14_7" \
TRAILIE_EVAL_MAX_TOTAL_COST_USD=0.75 \
TRAILIE_EVAL_MAX_REQUESTS=12 \
TRAILIE_EVAL_MAX_INPUT_TOKENS=180000 \
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=50000 \
TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true \
node eval/run-stage14_7-early-visibility-two.js
```

In this build that command re-runs the full composite, writes a fresh receipt and
exits **2** — live execution is deliberately withheld until it is separately
authorized. `ANTHROPIC_API_KEY` must be present in the environment for the live
step; it is never printed or recorded.

## 15. Cost ceiling

The live maximum remains **$0.75**, enforced by `TRAILIE_EVAL_MAX_TOTAL_COST_USD`,
verified by static phase, and recorded in the receipt so a changed cap invalidates
it.
