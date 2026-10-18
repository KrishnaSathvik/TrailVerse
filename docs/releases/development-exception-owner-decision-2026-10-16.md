# Owner decision: temporary development-tool exception

**Decision received and activated locally at 2026-10-16T19:39:53Z.** See the [owner-decision transcription, scope verification and activation results](development-exception-activation-2026-10-16.md). The proposal below is preserved as the decision baseline; its inactive/pending wording is historical. Publication, hosted changes and deployment are still unauthorized.

**Prepared locally, inactive, not pushed.** The repository owner's explicit risk decision is the remaining approval for this exception; the latest user instruction supersedes the earlier proposal for a separate organizational security approver. Existing GitHub independent PR-review requirements still apply to merging code and are not removed by owner risk acceptance.

## Exact scope

Policy: [development-exception.json](../../.github/security/development-exception.json). Current state is `proposed`, with `approval: null`.

| Advisory | Permitted development paths and versions |
| --- | --- |
| GHSA-vfj7-8cjw-p6xm | Backend and frontend `node_modules/braces`, 3.0.3; only the recorded consumer graphs |
| GHSA-hp3w-g68c-fv3c | Frontend `node_modules/sprintf-js`, 1.0.3; recorded LHCI/YAML/argparse graph |
| GHSA-jmr9-qjv8-65gv | Frontend `node_modules/extract-zip`, 2.0.1; recorded LHCI/Lighthouse/Puppeteer graph |
| GHSA-7pqw-9j4j-h8q3 | Same extract-zip node, separately authorized advisory |

Expires **2026-10-30T00:00:00Z**; no automatic renewal. Scope SHA-256:

`86ac582ea55d17d50fc9d6b092650152747c671f5fd32d9a2c0211177a30a54e`

The policy pins root/frontend/backend manifests and lockfiles, the previously reviewed dependency graph, the complete vulnerability records and the five advisory/path combinations. Full finding fingerprints include names, severities, advisory identities and ranges, locations, and propagation edges. Only npm's `fixAvailable` recommendation is excluded: a suggested upgrade is not a new vulnerability. Any finding change, even a partial reduction, requires review instead of automatically expanding or recalibrating the exception.

## Enforcement prepared

[Evaluator](../../scripts/ci/development-exception.mjs) runs after [the collector](../../scripts/ci/collect-security-audits.mjs) has attempted all six audits. With a valid, dated owner approval bound to the scope hash, only the two exact recorded development reports may receive an accepted policy disposition. Raw exit code 1, raw failure, complete reports and advisory details remain retained. The summary records which policy applied and the approval reference.

The following continue to block: every production finding; every root-workspace finding; new or changed findings (including low severity); unknown or mixed advisories; changed paths, manifests or lockfiles; unresolved propagation; incomplete scans; registry/network failures; invalid report/schema/counts; unexpected exit codes; missing/revoked/malformed approval; and expiry. Jest's cyclic dependency graph is checked for reachability to actual approved advisory leaves rather than being accepted merely because it contains a cycle.

The record is protected-source evidence of a human decision, not a digital signature or automatic authentication of an approver. Its integrity relies on the already-applied branch protection and code review. There is no environment-variable bypass, package-name blanket suppression or production exception.

Validation: **34 offline tests passed**, including replay of the retained six reports from GitHub run `38954603182`, expiry boundaries, tampering/drift, mixed findings, scan failures, raw-output retention and integrated approved-versus-proposed collector behavior. Synthetic approval was written only to disposable test directories and removed afterward. Current source remains unapproved. Workflow YAML parses; `git diff --check` passes. No registry query, fresh audit, paid request or hosted change was made in this preparation.

## Decision required from KrishnaSathvik

Approve or reject this specific statement:

> As repository owner, I accept the residual tooling denial-of-service and malicious-archive/supply-chain risks of the four advisory/path combinations in scope `86ac582ea55d17d50fc9d6b092650152747c671f5fd32d9a2c0211177a30a54e`, under the implemented CI controls, until October 30, 2026 at 00:00 UTC. I approve activating this exact exception locally. Production findings, new/changed findings, dependency drift and scan failures must continue to block. This decision does not authorize a push, paid requests, hosted setting changes or deployment.

This accepts a temporary residual risk, not a claim that the affected packages are safe. Existing local Lighthouse use and malicious code within development tooling remain part of that residual risk; this mechanism does not sandbox arbitrary local commands. The CI browser path uses pinned preinstalled browsers and the security job executes no dependency installs/lifecycle scripts.

Only after that decision, record `status: approved` and an approval object containing the actual `approvedBy: KrishnaSathvik`, UTC `approvedAt`, actual `decisionReference`, and the identical `scopeSha256`. Do not fabricate a decision reference or approval timestamp. Rejection or no reply leaves the current gate blocking.

## Remaining release checklist

1. Owner accepts or rejects the above risk; activate locally only if approved, then rerun the focused tests.
2. Obtain separate authorization to publish the exception and run normal required CI. The verification branch intentionally skips broad application jobs on push; use an ordinary reviewed PR/CI path so frontend, backend, browser/E2E, integration and other required checks actually complete. Satisfy existing PR review and required checks; do not bypass protection.
3. Pin the complete candidate after the final executable change and retain its CI evidence. `6392da99` is prior control evidence, not the candidate containing this uncommitted exception change.
4. Obtain authorization for the bounded hosted acceptance exercise: effective MCP planning/general timeouts 180s/30s, website's existing 120-second nonstreaming constraints, long streaming completion, and cancellation with unchanged persistence. Report provider termination evidence honestly.
5. Only after acceptance and separate release authorization, execute the existing coordinated backend/MCP/frontend deployment and rollback plan.

No AI architecture, prompts, itinerary logic, demo recordings, dependency versions, GitHub settings or hosted configuration changed in this preparation. There is no new general audit requirement.
