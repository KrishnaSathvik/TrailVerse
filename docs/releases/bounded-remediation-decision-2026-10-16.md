# Bounded remediation result and security decision

**Recommendation: HOLD.** One isolated Lighthouse environment and one parser-depth patch experiment were evaluated. Neither meets the acceptance criteria, so dependency changes have stopped. **Zero additional findings removed; 45 remain.** No application dependency, lockfile, runtime code, CI gate, or hosted setting changed. Application candidate stays `db419a43d49e8a8f669b21d68802a07284094e1f`.

## Execution-path review

Used the exact graph from `b43024ba`, not a new broad dependency investigation. `.github/workflows/test.yml` installs all dependencies and runs tests, coverage, lint, builds and the moderate audit gate. Jest/micromatch and ESLint/fast-glob therefore execute in CI. Nodemon is the local development watcher, not the CI test runner; its Chokidar path calls `braces.expand` for brace-containing paths.

No workflow invokes `lhci autorun`; it is the frontend's explicit `npm run lighthouse` command. The current `.lighthouserc.json` uses JSON, while LHCI's YAML reader invokes `yaml.safeLoad`, whose CLI dependency chain includes sprintf-js. Puppeteer's archive utility imports extract-zip when unpacking ZIP browser archives; package presence does not prove extraction occurred in these CI jobs. No exhaustive claim that every transitive call is unreachable is made. The unchanged audit covers installed development dependencies regardless of invocation.

## Lighthouse isolation experiment — rejected as remediation

Created a temporary standalone package with LHCI 0.15.1, a separate lockfile and the existing applicable UUID/basic-ftp/tmp overrides. Lock generation and clean `npm ci --ignore-scripts` succeeded. CLI help loads and the actual LHCI config reader preserves the existing four URLs and three runs. This establishes basic configuration compatibility, not a full browser audit. No browser launch, result upload or `autorun` was executed; the repository's upload target is public temporary storage.

The standalone moderate audit still reports **9 findings: 6 high, 3 moderate**, including sprintf-js and extract-zip. It therefore lacks an acceptable independent security disposition. Moving it out of the frontend would relocate findings, not resolve them. No separate tool environment was added to the repository or omitted from CI. Browser validation remains unchanged.

## Braces experiment — rejected as an incomplete fix

The [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still lists no patched version. The [upstream discussion](https://github.com/micromatch/braces/issues/70) includes a maintainer dispute over exposure and the utility of a nesting limit; it does not supply a released supported fix. Treat this disagreement as review evidence, not automatic dismissal of the gate.

Copied braces 3.0.3 and its Micromatch consumer into a temporary directory, leaving their package identities unchanged. The single patch experiment rejects parser-stack nesting at 100 levels for both brace and parenthesis blocks. Tested normal nested alternatives, numerical/alphabetic/zero-padded ranges, escapes, bracket literals, malformed braces, empty alternatives, extension patterns and Micromatch file matching: **117 comparisons matched the original behavior**.

Bounded subprocess probes used Node 24.9.0, a 128 MB heap cap, a five-second timeout per probe and a 9,001-character pattern (4,500 nesting levels):

| Probe | Result |
| --- | --- |
| Original expansion | Stack-exhaustion RangeError reproduced |
| Patched string compilation/expansion | Controlled SyntaxError at nesting guard |
| Prebuilt AST passed to patched expansion | Guard bypassed; stack-exhaustion RangeError reproduced |

The public API accepts prebuilt ASTs, so a parser-only guard is not a complete fix. Compilation overflow also varied across fresh processes; do not treat one non-overflow result as proof of safety. Arbitrary depth rejection also changes behavior beyond the representative cases. No maintained fork, broad compatibility proof, or independently reviewed all-entry-point fix was established. A source patch retaining version 3.0.3 also leaves the registry advisory range applicable to npm's version-based audit. No version spoof, package alias or suppression was attempted. The patch was **not adopted**.

## Validation and preserved state

- Clean application `npm ci` passed in both backend and frontend, using unchanged lockfiles and normal lifecycle behavior. The isolated Lighthouse install deliberately skipped lifecycle scripts and is not claimed to validate browser installation.
- Post-install unchanged development audits: backend **31 high**, frontend **11 high + 3 moderate**. Both fail the moderate gate.
- Post-install production-only audits: **0 backend, 0 frontend**.
- Post-install focused offline regression checks: **12 tests / 2 suites passed**, zero live provider activity. Frozen demo: 15 turns, 4 recorded refusals and 9/9 private checksums passed. No full application build or broad test rerun was needed because all candidate code and lockfiles remained unchanged.
- Findings removed this pass: **none**. Remaining roots: braces on backend/frontend; sprintf-js and extract-zip on frontend. Both extract-zip advisories remain relevant.
- Rejected experiment source, lockfile, results and audit logs are retained only as private local evidence under `artifacts/private/deployment-closeout-2026-10-16/bounded-remediation/`; they are not release dependencies.
- The previous candidate cancellation procedure, frozen demo and coordinated MCP timeout/rollback plan remain unchanged. No paid request, push, deployment, hosted configuration change or security exception implementation occurred.

## Precise security decision proposal — NOT APPROVED

Default option: retain the unchanged gate and release hold until a supported compatible fix exists. Do not continue speculative overrides.

Alternative for independent review: a temporary exception covering only the advisory/path pairs below. This would be an explicit CI policy change, not a fix that makes the existing raw audit succeed. No exception is implemented by this proposal.

| Advisory | Scope |
| --- | --- |
| GHSA-vfj7-8cjw-p6xm | braces 3.0.3 in the recorded backend Jest/nodemon and frontend ESLint chains |
| GHSA-hp3w-g68c-fv3c | sprintf-js in the recorded frontend LHCI → YAML 3 → argparse chain |
| GHSA-jmr9-qjv8-65gv | extract-zip 2.0.1 in the recorded LHCI/Puppeteer chain |
| GHSA-7pqw-9j4j-h8q3 | Same extract-zip chain; separate advisory, not implicitly covered by the first |

Proposed accountable owner: Krishna Sathvik (must accept ownership). Independent reviewer: **not assigned**; approval is blocked until a reviewer is named. Proposed expiry: **October 30, 2026**, with no automatic renewal. Exact package paths/versions must match the committed graph; any dependency drift invalidates the approval scope. Any executable remediation creates a new candidate.

Controls required before any exception takes effect (proposed, not asserted to be implemented): ephemeral least-privilege CI runners; no production credentials in untrusted PR/tooling jobs; repository-controlled glob/config inputs with review of changes; no user-supplied formatting or archive inputs; browser artifacts from approved sources with provenance/integrity checks and extraction isolated from credentials/workspace secrets; production-only audit stays zero; all nonapproved advisories continue to fail CI; raw development audit results remain visible and retained. Validate controls and exact enforcement in a separate reviewed change before approval.

Residual risks include tooling denial of service and malicious browser-archive writes even when normal inputs are trusted. A development-only classification does not eliminate supply-chain exposure. Required approval must name owner/reviewer, accept those risks, approve controls/expiry and specify enforcement. If any control cannot be verified, continue HOLD.

Approval of an exception would still not authorize deployment or a paid request. Hosted candidate cancellation/long-request verification and the coordinated MCP 180-second release remain separate gates.
