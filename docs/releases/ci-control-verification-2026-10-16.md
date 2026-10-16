# CI control verification and minimal remediation

**HOLD. Exception not implemented or approved.** This pass inspected workflow source and read GitHub settings, then prepared local CI hardening. No dependency investigation, registry audit, dependency update, hosted test, push, deployment or GitHub settings mutation occurred. Previous reported counts remain historical: 45 development findings and zero application production findings.

## Verified external settings

Authenticated, read-only GitHub REST responses on October 16, 2026:

| Endpoint under `repos/KrishnaSathvik/TrailVerse` | Result |
| --- | --- |
| Repository metadata, selecting only `default_branch,private` | `default_branch: master`, `private: false` |
| `/rulesets` | Successful response with no rulesets |
| `/branches/master/protection` | HTTP 404, explicitly `Branch not protected` |
| `/actions/permissions/workflow` | `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false` |

These findings establish a real protection gap, not just unavailable evidence. The existing workflows targeted `main`/`develop` and omitted default branch `master`. No branch protection or ruleset was created: selecting required reviewers, bypass policy and required checks needs an authorized repository-administration decision. Do not treat a local CODEOWNERS file as proof of enforced review; no unassigned reviewer was invented.

## Prepared changes and limits

| Control | Local change | Verification / remaining gap |
| --- | --- | --- |
| Default-branch CI coverage | Add `master` to push/PR filters in all three workflows, preserving existing branches | Parsed all YAML and checked branch coverage. Workflows have not run on GitHub. |
| Least-privilege execution | Explicit `contents: read`, checkout `persist-credentials: false`, bounded job timeouts on hosted runners | SSR additionally gets read-only deployments/statuses for preview discovery. Source checks pass; action credentials and artifact tokens still exist, so this is not a claim of credential-free execution. |
| Snyk credential separation | Move existing advisory Snyk scan into its own push-only job with no application install steps | PR tooling jobs no longer reference SNYK_TOKEN. Snyk remains advisory as before. The unprotected push branches and mutable `snyk/actions/node@master` remain risks; separate-runner execution and actual secret availability need hosted verification. |
| Audit retention and complete collection | A dependency-free Node collector runs root/frontend/backend full and production audits, saves raw JSON/stderr plus exit codes, SHA-256 lockfile hashes and revision, then decides overall failure | No installs or lifecycle scripts in the audit job. Every scope is attempted despite earlier failures. Upload uses `always()`, missing artifacts fail, retention 30 days. Offline fixtures pass; actual upload/access/retention is not yet demonstrated. Cancellation or runner loss can still prevent upload. |
| Existing blocking policy | Full audit uses moderate threshold; independent production checks require zero findings | No allowlist, waiver or expiry evaluator exists. Audit errors, invalid JSON/schema/counts, timeouts and unexpected exits block. Production-zero enforcement is an added explicit check, not an exception. |
| Browser downloads | Set `PUPPETEER_SKIP_DOWNLOAD=true` in all workflows to suppress implicit Puppeteer-managed downloads | This is defense in depth, not an archive sandbox or proof that every caller obeys it. Explicit Playwright installation remains visible in E2E. No full browser run was performed. |

The collector uses `npm audit --package-lock-only --ignore-scripts`, full-tree `--include=dev`, and separate `--omit=dev` scans. It does not execute repository dependency lifecycle scripts or install the vulnerable tools in the security job. The authoritative inputs are committed lockfiles; build/install reproducibility is still the responsibility of the existing `npm ci` jobs. Raw audit data is retained even on policy failure. Reports contain dependency metadata and stderr, so review artifact access/contents before using private registry credentials in a future design.

## Browser and input controls remain incomplete

The checked-in workflows do not invoke LHCI, but the frontend still exposes `npm run lighthouse`. Playwright downloads and extracts browsers in the E2E runner, with access to the checked-out workspace and Actions runtime. This pass does not establish approved browser artifact checksums/provenance, all download-host overrides, extraction isolation, or safe local Lighthouse operation. Do not activate the exception until those operations have a reviewed isolation/provenance procedure or an explicit, enforceable restriction. No vulnerable package was relocated or silently excluded from audits.

Dependency/configuration/workflow changes also lack enforced independent review on the default branch. Required protection should cover manifests/lockfiles, workflow and audit scripts, glob/test/lint/browser configuration and approval records; require independent review, dismiss stale approvals, block direct/force pushes and bypasses as appropriate, and make the security check required. A named authorized owner must approve the exact repository settings and independent reviewer assignment. Until applied and inspected, this control fails.

Actions remain tag/branch referenced in existing workflows. Immutable action pinning and action-source review are outstanding supply-chain hardening, especially for the secret-bearing Snyk job. This bounded change does not claim those controls are solved.

## Validation

- `node --test scripts/ci/collect-security-audits.test.mjs`: four offline tests pass. Coverage includes clean results, unchanged moderate blocking, production low blocking, malformed/inconsistent reports, execution errors/timeouts, continuing all six scans after errors, and preserving raw output/exit codes/hashes.
- Parsed all three workflows with the installed backend js-yaml parser; verified explicit read permission, default-branch triggers, every job timeout and every checkout's disabled credential persistence. An initial attempt used an unavailable frontend YAML module; the installed backend parser completed the check.
- `git diff --check` passes. Application code and dependency manifests/lockfiles are unchanged. No fresh audit/build/provider request was run.

These are local code and fixture results. Hosted job isolation, actual raw artifact retention, branch protection and safe browser extraction are **not signed off**. A separately authorized GitHub run after review must show all six audit reports retained despite the expected failing gate, correct token permissions, and Snyk skipped on PR events.

## Decision and release continuity

The [exception review](security-exception-review-2026-10-16.md) remains unapproved, with proposed expiry `2026-10-30T00:00:00Z`. Its original workflow-gap statements describe the review baseline; this report records proposed local remediation, not deployed controls. Risk-owner acceptance and independent human approval remain pending.

The prior application candidate `db419a43d49e8a8f669b21d68802a07284094e1f` remains the historical validation reference. This pass changes executable CI/scripts, so any release incorporating it must record a new exact candidate revision and appropriate validation; the uncommitted working tree is not a pinned release candidate. Existing rollback references are unchanged. Candidate-hosted timeout/cancellation acceptance and coordinated MCP timeout changes remain separate gates. Do not push merely to obtain CI evidence: MCP auto-deployment must be accounted for first.

Implementation references: [GitHub security guidance](https://docs.github.com/en/actions/reference/security/secure-use) supports minimal permissions and reviewed workflow changes; [npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/) describes audit-level exit behavior and lockfile-based scanning. Neither source is evidence that this repository's hosted controls passed.
