# Coordinated release plan — prepared, not authorized to execute

Status: **HOLD**. This plan does not authorize a push, deployment, hosted configuration edit, or audit-policy exception. Application candidate: `db419a43d49e8a8f669b21d68802a07284094e1f`. Later documentation-only commits do not replace this pinned candidate. Any further executable or dependency change requires an updated candidate and relevant validation.

## Exact candidates and rollback references

Read-only hosting inspection on October 16 confirmed these live references:

| Component | Candidate revision / root | Current rollback reference |
| --- | --- | --- |
| Vercel frontend `trail-verse` | `db419a43d49e8a8f669b21d68802a07284094e1f`, `next-frontend/` | Deployment `dpl_3ouXjTpqu3Qf5kvVwBrTmvRkd7pk`; URL `trail-verse-g6vlrqoo9-shadowdevils-projects-ae938de8.vercel.app` |
| Render backend `srv-d3il0cpr0fns73cvjq0g` | `db419a43d49e8a8f669b21d68802a07284094e1f`, `server/` | Live commit `cffedbef29a2fd6765e1ae1b61d9d5b9c8c043ed`, deployment `dep-db0j3eugekts739u65og` |
| Render MCP `srv-d7kql4navr4c73e3gth0` | `db419a43d49e8a8f669b21d68802a07284094e1f`, `mcp-server/` | Live commit `548f584a2ef0e7c5fcb900e1f518c8e707212976`, deployment `dep-d980ttu7r5hc73968eeg` |

The frontend was deployed by CLI. The hosting response provides no source Git SHA, even with repository information requested. Do not invent a revision or rebuild an assumed equivalent; preserve the existing immutable deployment as the rollback target. Confirm that it remains available immediately before release.

## Gates before requesting release approval

1. Resolve access: strict host verification succeeds, but Render SSH returns `Permission denied (publickey)`. Enable an existing Mac public key through Render Account Settings, or provide an authenticated Dashboard Shell. Supported browser discovery currently returns no sessions. Do not repeat fingerprint discovery, disable verification, create an ephemeral instance, or treat CLI API authentication as SSH access.
2. Inspect the running processes: backend Node version and revision, MCP revision and effective planning/general timeouts, actual backend destination, and bypass-secret equality without logging values or hashes. Saved environment equality is already verified; it is distinct from running-process equality.
3. Resolve the development audit gate: 31 backend plus 14 frontend findings remain. Keep `npm audit --audit-level moderate` unchanged. Use a reviewed compatible dependency resolution, or obtain a separate explicit policy decision; applicability notes alone are insufficient. No further speculative override is part of this plan.
4. Finish deadline and provider-cancellation evidence per the separate paths below. Any candidate-hosted acceptance environment must be separately authorized: production remains on hold, and this plan does not create preview services or publish code.
5. Revalidate the final candidate after any remaining fix. Existing local build, tests and frozen-demo evidence are in the linked reports; do not represent those results as hosted candidate acceptance. Recheck production audits and the unchanged CI gate against the final locked trees.

## Three independent request-path checks

| Path | Known configuration | Acceptance evidence still required |
| --- | --- | --- |
| ChatGPT/Claude → MCP → Render backend | Saved MCP planning timeout 30s; proposed 180s; general backend timeout stays 30s | Verify actual backend URL and running values; establish external client deadlines; correlate a bounded long planning request through MCP/backend to completion without premature proxy/client timeout. HTTPX timeout phases are not a guaranteed total wall-clock budget. |
| Website nonstreaming → Vercel → Render | Axios 120s; external rewrite has a documented 120s response-wait constraint | Demonstrate completion within this path's supported budget, or separately review a transport change if longer responses are required. Do not blindly set Axios to 180s or assume a Node function duration setting changes the rewrite limit. |
| Website streaming → Vercel → Render | Short completion and client abort observed on the old live deployment | Measure first event, ongoing event activity, longest silence, final event and EOF on a long candidate stream. Observe proxy closure and cancellation separately. A 120s response-wait constraint does not prove a 120s total stream lifetime. |

For cancellation, correlate the same client turn ID, backend request ID and provider request ID. Record client disconnect, backend abort propagation, provider termination and final persistence outcome. No canonical completion should be committed after cancellation. Report quota/billing effects only when independently observable. The previous short smoke and empty cancellation-log search do not satisfy this gate. Avoid additional provider requests until correlated observation is available.

## Proposed coordinated execution order — only after gates and explicit approval

1. Refresh all live deployment IDs and nonsecret settings; stop if they differ from this plan. Preserve rollback deployments and exact configuration. Resolve MCP's master auto-deploy behavior as part of the approved release procedure before publishing any revision; a push must not trigger an uncontrolled partial release.
2. Validate candidate backend compatibility with the currently live frontend and MCP before selecting a backend-first rollout. If mixed-version compatibility is not established, stop and approve a coordinated traffic-control strategy first; do not assume a multi-service deployment is atomic.
3. Within that approved release window, deploy the exact backend candidate using Node 24 and the validated `npm ci` build path. The saved hosted command currently uses `npm install`, so changing it is an explicit item in the release approval. Check active revision, runtime, health and old-client compatibility before proceeding.
4. Deploy the exact MCP candidate with `PLAN_TRIP_TIMEOUT=180`, preserving `BACKEND_TIMEOUT=30` and the paired secrets. Apply the timeout as part of this coordinated release, never as an isolated change to the old stack. Verify active values and MCP/backend contract before proceeding.
5. Deploy/promote the exact frontend candidate using the verified Node 24 / webpack path. Verify domain routing, health, public routes, then each request path and correlated cancellation. Stop progression at the first failed gate.
6. Record new immutable deployment IDs, revisions, effective nonsecret configuration and acceptance evidence. Production sign-off requires the candidate's hosted results, not results from the previous deployment.

## Failure and rollback

Any incorrect revision/runtime, secret mismatch, failed health/contract check, premature timeout, missing final EOF, or failed cancellation/persistence check stops the rollout. Restore changed components as a coordinated compatible set using the references above; route frontend traffic back to its preserved deployment rather than rebuilding unknown source. Restore the previously recorded MCP timeout and backend build settings when reverting those components. The old 30s planning timeout is only a rollback state and keeps the release blocked. Verify health and the pre-release public behavior after rollback, and retain failure evidence without secrets.

## Scope and evidence

This pass changed documentation only. No application architecture, dependency versions, timeout values, SSH account keys, hosted services or CI policy were changed. Runtime access remains blocked; provider cancellation remains unverified. See [focused gate report](remaining-release-gates-2026-10-16.md) for prior dependency validation and [closeout report](deployment-closeout-2026-10-16.md) for local build and short hosted streaming evidence.
