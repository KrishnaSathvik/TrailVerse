# Frozen launch decision — October 16, 2026

Latest owner direction supersedes the independent-security-approver wording below: [the repository owner decides the scoped risk](development-exception-owner-decision-2026-10-16.md). The exception is prepared locally and inactive. Existing GitHub independent code review is a merge requirement, not an invented organizational risk-approval role.

Execution update: [master protection is now applied and CI evidence collected](ci-controls-executed-2026-10-16.md). The proposal and pending-state table below describe the original decision baseline; the execution report records completed controls. Exception approval and production release remain pending.

**Current decision: HOLD.** Release readiness consists of the three gates below. Product work is locally validated; this record does not commission more itinerary changes, dependency experiments or general hardening. Local results do not substitute for hosted acceptance.

## Required gates

| Gate | Completion evidence | Current state |
| --- | --- | --- |
| 1. Protected release path and CI controls | Approved `master` protection applied and read back; prepared workflows run on a review branch/PR without incidental production deployment; expected failing security check retains all six reports; credential/input and affected archive controls demonstrated or explicitly restricted as accepted by the security reviewer | Local hardening validated. `master` was reported unprotected; no rulesets. Hosted evidence pending. |
| 2. Explicit four-advisory decision | Named risk owner and authorized independent human reviewer accept or reject the precise scope and controls. If accepted, separately reviewed enforcement blocks unapproved findings, production findings, drift, invalid evidence and expiry at `2026-10-30T00:00:00Z`; final candidate passes that approved policy | Scope reviewed by an independent agent, not approved by a human. Exception enforcement absent. Raw moderate audit still blocks. |
| 3. Candidate-hosted operational acceptance | Exact candidate and deployment IDs; effective MCP planning/general timeouts 180s/30s and matching backend configuration; bounded long-request evidence for the three existing paths; correlated cancellation and unchanged persistence; provider acknowledgment reported accurately; coordinated rollback and release approval | Not performed on the final candidate. Existing observation procedure and rollback references retained. |

Gate 1 and gate 2 preparation may overlap. A failed raw audit is expected during control verification and must remain visible; verifying artifact collection is not permission to merge around the failed check. Approval of a risk exception does not authorize deployment. If provider termination is unobservable, report that explicit unresolved result for a human decision; do not claim it passed or silently remove the requirement.

## Concrete GitHub protection proposal — awaiting approval

Target only `master`. Require pull requests with one independent approving review, dismiss stale approvals after new commits, require approval of the latest reviewable push, require resolved review conversations, and require the Test Suite `security` check with the branch up to date. Preserve any other already-required checks. Block force pushes/deletion and direct bypass, including administrator bypass. Verify the check identity from an actual workflow run before applying a status-check requirement; do not guess its integration identifier.

This proposal protects all changes, including dependencies, configuration, workflow/evaluator and approval records. The independent human reviewer still needs to be named; do not configure a fictional reviewer or claim CODEOWNERS enforcement without an actual owner. Lack of a second authorized reviewer is a specific decision dependency, not a reason to self-approve.

The user explicitly reserved GitHub-side changes for approval. Administrator access, whether available or reported, is not that approval. No settings have been changed by this record.

Before publishing the review branch/PR, confirm hosting branch filters and preview behavior, including MCP auto-deployment. Record the approved way to run CI without deploying production. If preview creation or paid services are involved, include them in that concrete authorization. Do not disable existing protections or publish to `master` just to generate evidence.

## Work that does not independently block this launch

- Unrelated lint warnings, UI polish, itinerary improvements and refactoring.
- Further speculative dependency updates or custom braces patches.
- Broad action-version pinning, tooling migrations or infrastructure redesign merely because they are recommended practices.
- Additional broad test/audit reruns without a candidate change, failed check or unresolved gate-specific question.

An improvement can become required only when concrete evidence connects it to a listed gate or the human reviewer makes it an explicit condition of risk acceptance. Record the affected gate, evidence, smallest corrective action and decision owner. Do not add a fourth open-ended hardening project. Existing mandatory checks are not waived by this classification.

## Launch decision rule

When the three gates have evidence for the same final candidate, request the explicit coordinated release decision. If any fails, record the exact failed check, evidence and responsible decision owner, and retain HOLD. Do not restart product work or expand the checklist by default.

Evidence and execution detail remain in the [CI control report](ci-control-verification-2026-10-16.md), [exception review](security-exception-review-2026-10-16.md), [candidate observation procedure](ci-and-cancellation-closeout-2026-10-16.md#prepared-candidate-observation-path), and [coordinated release plan](coordinated-release-plan-2026-10-16.md). The old application candidate remains historical evidence; the prepared executable CI changes require a new pinned candidate before release. No push, settings mutation, exception activation, hosted test or deployment is authorized by this document.
