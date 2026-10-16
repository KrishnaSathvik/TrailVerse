# Temporary development-dependency exception — review record

Follow-up: [CI control verification and local remediation](ci-control-verification-2026-10-16.md) records live GitHub protection gaps and proposed workflow changes. The baseline findings below are preserved; they are not claims about an approved or deployed remediation.

**Status: REVIEW ONLY / NOT APPROVED. Deployment remains HOLD.** The user commissioned Option B review on October 16, 2026. This authorizes preparing and assessing the exception, not activating it, changing CI policy, publishing code, provisioning a candidate host, or deploying. No new audit or dependency experiment was run for this review.

## Decision requested

Consider accepting the residual risk of the four advisory/path pairs below temporarily, subject to independently verified controls and a separately reviewed enforcement change. Proposed expiry is **2026-10-30T00:00:00Z** (the start of October 30 UTC; no automatic renewal). The approver must explicitly accept this cutoff. Missing approval, missing control evidence, or expiry means HOLD.

Proposed risk owner: **Krishna Sathvik — acceptance pending**. Authorized independent security approver: **unassigned**. An independent agent technical assessment is review input, not organizational approval. Record the named human approver, authority, decision, UTC timestamp, evidence references, and approved enforcement revision before activation.

## Frozen scope and evidence

Application candidate: `db419a43d49e8a8f669b21d68802a07284094e1f`. Review baseline HEAD: `13365e010c2dbf04b0f355d2c80ea909292d451d`. Backend/frontend lockfiles and `.github/workflows/test.yml` have no diff between those revisions.

The [bounded experiment report](bounded-remediation-decision-2026-10-16.md) records 31 backend high findings and 11 frontend high plus 3 moderate findings: **45 propagated package findings, four root advisories**, with zero reported production findings in each application tree. These are prior results, not a fresh scan or a claim of zero security risk. The parser patch was rejected after prebuilt-AST expansion bypassed its guard; it was never adopted.

| Advisory | Exact installed scope | Exposure and residual risk |
| --- | --- | --- |
| GHSA-vfj7-8cjw-p6xm | `server/node_modules/braces` and `next-frontend/node_modules/braces`, both 3.0.3 | Recorded Jest/nodemon and ESLint/micromatch paths. Test/lint tooling executes in CI; crafted nested patterns can exhaust the stack. Repository-controlled inputs reduce exposure only if changes are reviewed and untrusted jobs isolated. |
| GHSA-hp3w-g68c-fv3c | `next-frontend/node_modules/sprintf-js`, 1.0.3 | Recorded LHCI → YAML 3 → argparse path. Current Lighthouse config is JSON; this does not prove all formatter inputs are trusted. Review formatting-input exposure and tooling denial-of-service risk. |
| GHSA-jmr9-qjv8-65gv | `next-frontend/node_modules/extract-zip`, 2.0.1 | Recorded LHCI/Lighthouse/Puppeteer browser-archive path. Untrusted archives can compromise extraction safety; approved download provenance alone is insufficient isolation. |
| GHSA-7pqw-9j4j-h8q3 | Same exact extract-zip location/version and recorded consumer graph | A separate advisory requiring its own decision; approval of the other extract-zip advisory does not cover it. |

The complete permitted consumer paths are the nodes and edges in [the recorded graph](remaining-ci-dependency-paths-2026-10-16.json), not arbitrary uses of these package names. Nested edges marked `prod` describe dependency relationships, not necessarily application production reachability; confirm the root classification separately. The root workspace audit remains outside this exception.

SHA-256 anchors measured locally during review:

| File | SHA-256 |
| --- | --- |
| `server/package-lock.json` | `3c4e9df241b504af1be94a0d7a14f5d8ad2cf9104e53c06d3e55a2cbca1bbcfb` |
| `next-frontend/package-lock.json` | `c40cbab8f675764219471e6e1158d7c5db444e4497b14d22451a33db2f59d44f` |
| `remaining-ci-dependency-paths-2026-10-16.json` | `564693615c871444c96f8e793a26e10efdc9a565182959425549ac675658d8a0` |

## Controls: evidence needed before activation

| Required control | Evidence currently available | Acceptance requirement |
| --- | --- | --- |
| Ephemeral, least-privilege tooling jobs | `test.yml` uses `ubuntu-latest`; explicit workflow token permissions are absent | Explicit minimal token permissions, checkout credential handling, runner isolation and bounded job execution reviewed; confirm repository/organization settings. |
| No production credentials in untrusted tooling | Test jobs show fixture settings; security job references `SNYK_TOKEN`; no blanket credential-isolation proof | Demonstrate secret/token availability by event and job, including internal PRs; isolate credential-bearing work from untrusted installs/tool execution. Do not print secret values. |
| Reviewed glob/config inputs | Existing source-controlled inputs; no proof of enforced review protection | Show protected review requirements for dependency, glob/config, workflow and exception changes; reject user-supplied formatter/pattern inputs. |
| Browser provenance and isolated extraction | No `lhci autorun` invocation in `test.yml`; explicit local Lighthouse command remains available | Document approved artifacts and integrity/provenance verification, plus extraction without credentials or sensitive workspace access; include local tooling or explicitly prohibit affected operations during the exception. |
| Production dependency gate remains clean | Prior backend/frontend production audits report zero | Enforce production checks independently of this exception, retaining reports; a production finding cannot be waived by this record. |
| Visible raw audits and narrow enforcement | Moderate audit command is unchanged; sequential shell failure can prevent later scans; raw JSON retention is not configured | Collect every required tree's audit result even when another fails, retain raw output and exit codes, then evaluate policy; scan failure is never a clean result. |

None of the gaps above is silently accepted as an implemented control.

## Enforcement change acceptance contract — not implemented

1. Keep collecting full development audits. Never clear this gate by omitting dev dependencies, raising the severity threshold, masking exit codes, renaming packages, or matching only package names/counts.
2. Bind approval to the exact advisory ID, workspace, installed version/location, consumer graph and lockfile hashes. Any drift requires review; a new candidate must be identified for executable or dependency changes.
3. Resolve propagated audit entries to their advisory leaves. Every leaf and installed path must be approved; an entry containing both approved and unapproved causes must fail. Unknown or unresolved relationships fail closed.
4. Reject absent/expired approval, malformed or missing reports, unsupported audit schemas, registry/network errors, unknown advisory IDs, changed paths/versions/graphs, and production findings. Evaluate UTC expiry on every run; approval cannot authorize runs at or after the cutoff.
5. Retain raw reports for root, frontend and backend, production reports, policy result, candidate revision, lockfile hashes, approval reference and control evidence in access-appropriate CI artifacts. Preserve at least through expiry and the subsequent release review. Findings remain visible even when an approved exception allows the policy check to pass.
6. Require meaningful fixtures proving exact permitted findings pass only with valid approval; unknown/mixed findings, drift, production exposure, expiry boundary, missing approval, malformed data and unavailable registry all fail. Verify all scan outputs are captured despite a failing earlier scan.
7. Protect the evaluator, approval record and required CI check from unreviewed modification/bypass. Revoke approval on control failure or scope drift. Expiry restores blocking automatically; renewal needs a new decision.

This contract is a review specification, not an active waiver. Review the concrete implementation and its evidence before enabling it. A dependency risk acceptance does not itself approve the enforcement implementation.

## Remaining release gates

After the security decision and verified enforcement, obtain separate authorization for the exact candidate-hosted acceptance environment and bounded live requests. Use the [prepared cancellation procedure](ci-and-cancellation-closeout-2026-10-16.md#prepared-candidate-observation-path) and [coordinated release plan](coordinated-release-plan-2026-10-16.md).

Required evidence remains: candidate deployment identities and effective settings; long-request completion on MCP, website nonstreaming and streaming paths; correlated disconnect, backend/SDK cancellation, independently evidenced provider termination, and unchanged persistence after cancellation. Missing provider acknowledgment remains unverified, not a pass. The coordinated MCP planning timeout of 180 seconds remains proposed; general timeout remains 30 seconds. No hosted test or setting change occurred in this review.

## Approval record

Independent technical assessment completed October 16 by the separate `security_review` agent using the committed workflow/configuration, recorded dependency graph and retained private frontend audit. **Recommendation: retain HOLD; scope is sufficient for a decision packet, but controls and enforcement are not verified.** The reviewer confirmed all four advisory scopes, including the two distinct extract-zip advisories, and independently identified the control gaps listed above. No new audit, exploit experiment or external request was performed. This is an independent agent assessment, not a named human security approver's sign-off.

| Field | Current value |
| --- | --- |
| Technical review | Completed by independent agent; HOLD pending controls, enforcement and authorized approval |
| Accountable owner acceptance | Pending |
| Authorized independent approver / authority | Unassigned |
| Decision and UTC timestamp | Not approved |
| Approved advisory/path pairs and scope hashes | Proposed above; not approved |
| Control evidence and enforcement revision | Pending |
| Expiry accepted | Proposed `2026-10-30T00:00:00Z`; pending |
| Residual risk acceptance | Pending explicit acceptance of tooling denial of service and archive/supply-chain exposure |
| Candidate-hosted test authorization | Not granted by this record |
| Deployment authorization | HOLD; not granted |
