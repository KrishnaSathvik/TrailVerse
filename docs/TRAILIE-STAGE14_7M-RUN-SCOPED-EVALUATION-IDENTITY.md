# Stage 14.7M — Run-scoped evaluation identity contract

Date: 2026-08-05 (America/Chicago)

## 1. Corrected non-execution status

The Stage 14.7L invocation stopped before `provider_dispatch_authorized`. Its
preserved result is:

```text
LIVE_EXECUTION_NOT_STARTED
evaluation_fixture_invalid
```

It is not `STAGE14_7_LIVE_CONFIRMATION_FAILED`. The bounded evidence is stored
in `artifacts/trailie-stage14_7M-non-execution.json` with zero dispatch
authorizations, calls, tokens, cost, and scenario consumption. No consumed or
voided-provider-attempt record was created for that invocation.

## 2. Production and fixture email-contract comparison

The production `User` schema and evaluation fixture validator previously had
separate copies of the same restrictive regex. Both rejected plus-addressing,
but the live identity generator emitted a plus-address. They now delegate to
`server/src/validation/emailValidation.js`, which preserves the production
syntax and adds the production-wide 254-character bound. The repair does not
broaden signup behavior. The schema's existing 2–3 character TLD limitation is
recorded and the generated `example.com` address satisfies it.

## 3. Canonical run-scoped identity implementation

`server/src/eval/stage14_7/evaluationIdentity.js` is now the one identity seam.
It returns `evaluationRunId`, a valid 24-hex `evaluationUserId`, and the exact
canonical `evaluationUserEmail`. The executor, deterministic preflight,
authentication fixture, scenario child, frontend harness, and real subprocess
driver all use this seam. The historical shared fallback address is prohibited.

## 4. Generated-address format

The local part is:

```text
stage147eval<first-24-allowlisted-run-id-characters><12-char-sha256-prefix>
```

and the domain is `example.com`. Only lowercase ASCII letters and digits from
the run ID are retained through an explicit allowlist. The digest prevents
punctuation-normalization collisions. The value is stable within a run,
distinct across tested run IDs, bounded in length, and contains no credentials
or user-provided data.

## 5. Real subprocess boot and authentication evidence

The actual default runner path generated the identity rather than substituting
a test-only address. The child passed fixture validation and actual `User`
schema validation, booted the application, created the evaluation user,
authenticated, completed deterministic revision 1 and revision 2 persistence,
restored `prose_complete`, replayed flag-off with zero provider calls, and shut
down cleanly. No live provider was constructed, no external request occurred,
and no live scenario marker was written by this integration path.

## 6. Invalid-identity non-consumption

Negative controls cover plus-addressing, empty input, invalid TLD, overlength
input, punctuation normalization, same-run stability, cross-run uniqueness,
invalid ObjectId, and the prohibited shared fallback. An invalid generated
identity returns `evaluation_identity_invalid` before cumulative-exposure
resolution, manifest authorization, markers, reservation, dispatch
authorization, child boot, or network access.

## 7. Run-scoped cleanup

The cleanup matrix passed for normal completion, abort before revision 1, abort
after revision 1, revision-2 persistence failure, abort after revision 2,
bounded cleanup failure, and parent timeout cleanup. Each successful cleanup
removed the current evaluation user and trips. A separately seeded historical
evaluation user and trip remained byte-equivalent through current-run cleanup
and were then removed only by their exact fixture teardown.

## 8. Scenario state before and after

The state was preserved across the repair and all deterministic verification:

```json
{
  "basic-02-three-day": "consumed",
  "basic-02-three-day-model-fix-validation-1": "available",
  "basic-03-seven-day": "available"
}
```

Neither remaining live scenario was executed.

## 9. Fresh receipt

The preflight-only authoritative runner completed static configuration plus
phases A–R and minted
`artifacts/private/stage14_7-readiness-receipt.json` with
`preflightVersion: 14.7M.1`. Immediate validation passed. The receipt hashes the
canonical email validator, identity generator, production schema wiring,
fixture validator, executor and subprocess wiring, negative tests,
authoritative runner, and lockfiles. Its readiness fields include:

```text
compositePreflightPassed             true
readinessReceiptValid                true
evaluationIdentityContractPassed     true
runScopedIdentityPassed              true
realSubprocessPathQualified          true
liveExecutorTechnicalReady           true
liveScenarioManifestReady            true
cumulativeExposureResolved           true
cumulativeBudgetFeasible             true
liveExecutionReady                   true
replacementScenarioAvailable         true
sevenDayScenarioAvailable            true
liveProviderCalls (preflight)         0
liveProviderCostUsd (preflight)       0
```

## 10. Regression results

- Targeted server identity/accounting/dispatch regression: 11 suites, 376 passed.
- Deterministic frontend route/replay/interruption/cleanup matrix: 5 files,
  131 passed.
- Full provider-disabled server suite: 159 suites passed, 3 failed, 2 skipped;
  2,183 tests passed, 3 failed, 6 skipped. The three failures are unchanged,
  unrelated branch-baseline drift in `trailieFetchPlanner`, `astroFacts`, and
  `npsParkAdapter`. Provider/search keys were explicitly shadowed empty.
- Exact full frontend suite: 65 files passed, 4 failed; 744 tests passed and 11
  failed. This exactly matches the established branch baseline in
  `Header.test.jsx`, `useParkExploreIndex.test.js`, `WeatherWidget.test.jsx`, and
  `buildDayByDayPlanFollowUp.test.js`.
- `git diff --check`: passed.

No Stage 14 lifecycle, identity, persistence, restore, replay, cleanup,
accounting, manifest, or dispatch-policy regression failed.

## 11. Prior exposure and cumulative caps

The Stage 14.7 ledger remains unchanged:

```text
Prior:      3 requests, $0.32, 60,000 input, 20,000 output
Caps:       12 requests, $1.50, 240,000 input, 100,000 output
Projected:  11 requests, $1.38, 220,000 input, 94,000 output
```

The identity failure added no Stage 14.7 exposure and neither remaining
scenario was consumed.

## 12. Provider-call boundary incident and stop decision

The repair and authoritative `14.7M.1` preflight themselves made zero provider
calls and spent $0.00. However, an attempted branch-wide server regression
command discovered `factsWebSearch.live.test.js`. Because that test loads the
repository `.env` directly, it made four real Claude web-search summarization
calls before the command was stopped. Their token usage and cost were not
captured by the Stage 14.7 ledger. Search-provider requests also occurred.

Therefore the overall work session cannot truthfully claim the requested zero
provider calls or zero spend, even though Stage 14.7 scenario exposure remains
unchanged and the fresh receipt correctly reports zero calls within its bounded
preflight. Stage 14.7M's technical identity contract is green, but the
operational zero-call requirement was breached. No live confirmation or
internal acceptance testing is authorized automatically from this report.

Work stops here. No Atlas connection, production flag change, Vercel change,
commit, push, live scenario, or internal acceptance test was performed.
