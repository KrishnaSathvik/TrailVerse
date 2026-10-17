# CI and candidate cancellation closeout

**HOLD.** Application candidate remains `db419a43d49e8a8f669b21d68802a07284094e1f`. This pass changes only release documentation/evidence, not executable code, dependencies, policies, or hosted configuration. Preserve `fa525a96` as the hosted read-only inspection checkpoint and the existing pinned rollback plan.

## Dependency decision

Both unchanged `npm audit --audit-level moderate` gates were rerun and exited **1**: backend **31 high**; frontend **11 high + 3 moderate**. Total **45**. No additional compatible fix was established; no speculative override applied. Current registry checks still report braces 3.0.3, sprintf-js 1.1.3 and extract-zip 2.0.1 as latest. Latest Micromatch 4.0.8 and compatible Puppeteer browsers 2.13.2 still depend on the affected packages. LHCI latest remains 0.15.1.

[Exact installed dependency graph](remaining-ci-dependency-paths-2026-10-16.json) records versions, installed locations, requested ranges and dependency edges from `npm explain` (90 backend edges, 15 frontend edges). Representative root paths:

- Backend: Jest 29 tooling → micromatch → braces; nodemon → chokidar → braces. The shared Jest graph accounts for many propagated findings, not distinct root vulnerabilities.
- Frontend: eslint-config-next 16.3.8 → @next/eslint-plugin-next → fast-glob → micromatch → braces.
- Frontend: @lhci/cli → @lhci/utils → js-yaml 3 → argparse 1 → sprintf-js.
- Frontend: @lhci/cli / @lhci/utils → Lighthouse 12.6.1 → Puppeteer Core 24 → @puppeteer/browsers 2 → extract-zip.

The prior backend YAML override already removed its sprintf-js chain. Lighthouse's `safeLoad` call prevents reusing that override unchanged. Picomatch is not a drop-in implementation of braces parsing/expansion. Puppeteer browsers 3 is not an established compatible override for Puppeteer 24. npm's suggested major downgrades to old nodemon, eslint-config-next and LHCI are not accepted fixes.

**Exact decision required:** retain the unchanged gate and release hold pending an upstream compatible fix or a separately scoped, reviewed tooling patch; alternatively, explicitly commission a time-limited security-exception proposal. An exception would need the four specific GHSA IDs in the audit inventory, affected paths, risk owner, expiry, compensating controls, and continued failure for every unapproved advisory. It changes security policy and requires separate approval before implementation. No exception is approved here. Merely acknowledging applicability, omitting development dependencies, or renaming a vulnerable package does not clear the existing command. Recommended current disposition: keep the hold; do not experiment further with forced versions.

## Prepared candidate observation path

Use the existing model-first telemetry, not the old deployed legacy stream. An explicitly authorized candidate environment, isolated acceptance user/data, log access and read-only persistence access are prerequisites. No environment was provisioned and no live request was sent.

1. Record exact frontend/backend/MCP deployment IDs and candidate revision. Verify `X-Trailie-Runtime: model_first`. Select the existing v2 transport using its supported deployment flag and request negotiation; capture the initial `response_started.responseId` before disconnecting. Legacy `thinking` omits this identifier, so a legacy run without another proven correlation channel is insufficient. Record client turn ID and acceptance user/session identity privately.
2. Before the request, capture the isolated user's TripPlan IDs and canonical hashes; for a guest run capture only the dedicated AnonymousSession's completed-turn count and assistant response IDs. Record UTC and monotonic client start/abort times. Use a single separately authorized request with a fixed maximum duration and no automatic retry. A test must establish the provider was in flight at disconnect; otherwise mark it inconclusive.
3. Retrieve only the matching `[Trailie model_first]` terminal event and `[Trailie model_first stage]` events by `responseId`. Existing fields include `terminalStatus`, `calls[].requestStartedAt`, `failedAt`, `errorClass`, `errorCode`, `upstreamRequestId`, `mutationAccepted`, `canonicalBefore` and `canonicalAfter`. A `runtime_done` status of `cancelled` plus a model-attempt error `responses_cancelled` supports local abort handling. It does not expose the exact abort-event timestamp; report that timestamp as unavailable rather than substituting request completion time.
4. `calls[].upstreamRequestId` comes from the provider response header/error when available. Record an SDK abort error as **local SDK/request termination**, not provider-server termination. If no upstream ID was received, leave it null. Provider-side termination is confirmed only by independent provider evidence tied to that ID; otherwise label it **not observable / unverified**, even if local cancellation passes. Do not infer zero billing or token usage from absent usage fields.
5. After terminal cancellation, reread only the acceptance user's/session's persistence state. Require unchanged canonical hashes, no new acceptance-user trip, no assistant message carrying the cancelled `responseId`, and no increment in completed guest turns for a guest run. Compare before/after snapshots; missing `commit_done` is supplementary evidence, never a substitute for persistence inspection. Cost-ledger absence is not proof either: the route invokes its durable turn-ledger write on the complete path, while cancelled terminal telemetry goes to the observer log.
6. Distinguish four results: client disconnect observed; local backend/SDK cancellation observed; provider-side termination confirmed or unavailable; persistence unchanged or failed. If the terminal event never arrives within the approved observation window, mark inconclusive and stop—do not repeat paid requests automatically. A cancellation arriving after a completed commit is not a valid pre-commit cancellation test.

Minimal evidence record (all fields begin unknown):

```json
{
  "candidate": "db419a43d49e8a8f669b21d68802a07284094e1f",
  "deploymentIds": {},
  "responseId": null,
  "clientTurnId": null,
  "clientAbortAt": null,
  "providerInFlightAtAbort": null,
  "backendTerminalStatus": null,
  "sdkErrorClass": null,
  "sdkErrorCode": null,
  "upstreamRequestId": null,
  "localTerminationObserved": null,
  "providerTerminationConfirmed": null,
  "providerEvidenceReference": null,
  "persistenceBeforeReference": null,
  "persistenceAfterReference": null,
  "unwantedCommit": null,
  "billingOutcome": "unknown"
}
```

Store only the bounded evidence fields in the release report. Do not publish full terminal telemetry, prompts, conversation content, credentials or unrelated user records. The observability limit above is explicit: no new production logging code is needed for a first controlled local-termination/persistence observation, but existing telemetry alone cannot promise provider-server acknowledgment.

## Validation and next release decision

Focused offline checks: **12 tests passed in 2 suites** (`sseStream` and `trailieSimpleModelTelemetry`), with zero provider constructors, dispatches or external provider HTTP requests. They verify disconnect guards and telemetry surfaces, not hosted provider termination. No production build rerun was needed for documentation-only changes. Audit commands fail as stated above.

Next decision is the CI security disposition, not deployment approval. Once it is resolved, obtain separate approval for the exact candidate-hosted acceptance environment and one bounded live test, including cost/duration limits and treatment of unavailable provider acknowledgment. The coordinated MCP 30→180 setting remains deferred to the approved release procedure; do not alter the website's independent 120-second limits blindly. Any future executable fix creates a new candidate requiring relevant regression tests, audits and hosted acceptance against that revision.
