# Deployment closeout — October 16, 2026

**Verdict: deployment remains on hold.** No deployment, push, hosted configuration change, or planning-architecture change was performed. This pass builds on local release `a3d7dfe4`.

## Dependency gate

Reviewed the 69 original package-tree findings and their root advisory chains. Compatible updates plus targeted overrides resolved **19** entries. The [complete inventory](ci-dependency-triage-2026-10-16.json) maps each original entry to its advisories, installed paths, and current status.

| Audit scope | Before | After | Critical after |
| --- | ---: | ---: | ---: |
| Backend, including development | 38 | 36 (31 high, 5 moderate) | 0 |
| Frontend, including development | 31 | 14 (11 high, 3 moderate) | 0 |
| Production dependencies | 0 | 0 | 0 |

Updates cover the identified compatible versions of picomatch, yauzl, Babel, humanfs, body-parser, brace-expansion, compression, esbuild, ip-address, js-yaml, lodash, lodash-es, qs, and Express used by Lighthouse. Scoped overrides address Serwist's pinned Browserslist (4.29.3), Lighthouse UUID (11.1.1), and get-uri's basic-ftp (6.2.3). Both temporary-file consumers use tmp 0.2.7. The tmp lockfile/install inconsistency was reconciled and both actual resolution paths were verified. No forced audit fix or unrelated major framework migration was used.

The remaining 50 entries are dependency-chain amplification of **three underlying packages**:

| Package | Applicability review | Disposition |
| --- | --- | --- |
| braces 3.0.3 | Used by test, lint, and file-watch glob machinery (Jest/micromatch, nodemon and frontend tooling). The advisory requires deeply nested input patterns; normal project patterns are repository-controlled. It is not in the production-only tree. This reduces ordinary web-request exposure but does not justify a blanket CI/supply-chain exception. | Upstream lists no patched version. Retain the finding and gate failure; replacing/patching the affected tool chain needs a separately reviewed solution. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). |
| sprintf-js 1.0.3/1.1.3 | Development CLI formatting, including argparse through js-yaml/coverage tooling and Lighthouse dependencies. Inspected argparse call sites use literal format strings; no application HTTP path to this formatter was found. This is not a proof that every transitive tool's format input is trusted. | Upstream lists no patched version. Retain finding; migrate or replace the affected CLI dependency chain rather than claim a waiver. [Advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). |
| extract-zip 2.0.1 | Lighthouse/Puppeteer browser archive installation, not application upload handling. Malicious archive contents remain a meaningful tooling/supply-chain risk even when normal downloads use trusted browser distribution endpoints. | Upstream lists no patched version. Retain finding until extraction is patched or the dependency chain is replaced. [Advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv). |

The existing **`npm audit --audit-level moderate` gate remains unchanged and fails**. Applicability documentation alone cannot make that command pass. No allowlist, severity reduction, `--omit=dev` substitution, fake version bump, or advisory suppression was introduced. npm's suggested downgrades to old Lighthouse/Next/nodemon releases were rejected as inappropriate fixes.

## Hosted configuration

Updated global Vercel CLI from 62.2.0 to **64.3.1**. Read-only CLI/API inspection confirms:

- Project `trail-verse`, root directory `next-frontend`.
- Node version **24.x**.
- `buildCommand`, `installCommand`, and `outputDirectory` overrides are **null**, using Next.js defaults. The repository has an npm build script selecting `next build --webpack`; there is no conflicting hosted custom build command.

These settings checks apply to a future deployment of the candidate revision. They do not mean the candidate is currently deployed.

Render's public MCP `/health` and backend `/health/ping` both returned HTTP 200 / `status: ok`. Those endpoints do not expose secret equality, timeout values, or active revision metadata.

The user confirmed “My Workspace” for read-only inspection. Render service/deploy metadata shows:

- Backend `srv-d3il0cpr0fns73cvjq0g`: live revision `cffedbef29a2fd6765e1ae1b61d9d5b9c8c043ed`, deployed October 3. Root `server/`, build `npm install`, start `npm start`, auto-deploy disabled.
- MCP `srv-d7kql4navr4c73e3gth0`: live revision `548f584a2ef0e7c5fcb900e1f518c8e707212976`, deployed July 9. Root `mcp-server`, Python requirements build, start `python -m server.main`, auto-deploy enabled on `master`.
- These are older deployments, not the local release candidate. The backend's hosted `npm install` command also differs from the candidate blueprint's `npm ci`; the hosted value was not changed.

### Authenticated Render follow-up after checkpoint `6d9548f6`

Render authentication now succeeds: `render whoami` identifies the authorized account. Read-only API requests verified both services belong to the confirmed workspace before inspecting selected environment settings. Secret values were compared only in memory; no values or hashes were printed or saved.

| Saved service configuration | Result |
| --- | --- |
| `MCP_BYPASS_KEY` on backend and MCP | Present on both; values match. |
| MCP `PLAN_TRIP_TIMEOUT` | **30 seconds — blocker.** The candidate's default and Blueprint specify 180 seconds. An explicit hosted value of 30 overrides that default. |
| MCP `BACKEND_TIMEOUT` | 30 seconds, matching the candidate's general-request timeout. This is separate from the planning budget. |
| Backend service-level `NODE_VERSION` | Not set directly. This does not establish the running Node version; runtime selection or environment groups may supply it. |

The compared secrets and MCP timeouts are direct service-level settings, which take precedence over linked environment groups. These findings establish saved control-plane configuration, not the environment of an already-running process. A read-only SSH attempt to inspect the running MCP timeout values reached host-key verification and failed; host-key checking was not bypassed. No remote command ran.

**Required future configuration change:** set MCP service `srv-d7kql4navr4c73e3gth0`'s `PLAN_TRIP_TIMEOUT` from `30` to `180` during the authorized release process, retaining `BACKEND_TIMEOUT=30`. No hosted setting was changed in this read-only pass. A local Blueprint edit alone does not fix the existing hosted override.

**Still unverified:** active-process secret equality and timeout values, backend active Node runtime, long-running hosted request/proxy deadlines, and provider cancellation. Authentication is no longer the blocker. The CI dependency gate and the confirmed saved MCP planning-timeout mismatch keep deployment on hold. The current hosted revisions remain older than the candidate.

The Render environment-variable skill confirms `sync: false` only prompts on initial Blueprint creation, so checking in that declaration does not establish that an existing service has the value. Service environment reads also exclude linked environment groups; any eventual comparison must account for effective precedence. [Render API documentation](https://api-docs.render.com/reference/get-env-vars-for-service).

## Hosted streaming smoke check

Performed one bounded smoke exercise against the **existing** public Vercel → Render route, using a fresh anonymous conversation and a short informational request, then a separate cancellation request. This was transport validation, not a travel-planning audit.

- Completion: HTTP 200, `text/event-stream`, first chunk at **704 ms**, final `done` at **4,042 ms**, actual EOF at **4,043 ms**.
- Cancellation: first chunk at **634 ms**, client aborted after the initial progress event; the reader observed `AbortError` at approximately **939 ms**.
- Each request had a 30-second client bound. No retries or long planning run were made.

**Limits:** client cancellation is proven; provider cancellation, absence of post-cancel persistence, and billing/quota effects are not proven without correlated backend evidence. The hosted terminal payload did not provide the candidate's canonical response/persistence identifiers. This checks the currently deployed stack, not unreleased `a3d7dfe4` or this follow-up. A four-second response does not validate a 180-second planning deadline. The previous local production-stack 8/8 tests remain valuable but do not replace these outstanding hosted gates.

## Local validation

- Updated production build passed: Node 24, explicit production public URLs, webpack, 95 static-generation entries, service-worker generation.
- Frontend: **169 files / 1,550 tests passed**.
- Focused backend: **42 tests passed**, including model-first streaming/persistence/cancellation and MCP-key handling, with zero live provider activity in these tests. The entire 7,560-test backend suite was not rerun for these two compatible test-tool patches; the October 15 full-suite evidence remains separately documented.
- Lighthouse CLI loads. Its temp-file create/cleanup lifecycle, UUID call, and FTP client API surface pass compatibility checks; this is not a live FTP integration test.
- Clean frontend `npm ci` passed. Lint has zero errors, 143 source warnings plus 3 generated coverage-script warnings. `npm ls --all` still flags debug, ansi-styles, and the optional WASM runtime; their relevant lock entries are unchanged from the baseline. The debug/ansi-styles versions satisfy the displayed ranges; the optional WASM range needs a separate dependency-tree reconciliation. This did not prevent clean install, native-platform build, or tests, but is not represented as a clean `npm ls` result.
- Frozen baseline: 15 turns, 4 recorded refusals, 9/9 private source checksums verified; no demo regenerated.

Private audit JSON, build/test logs, sanitized Vercel settings, and hosted smoke evidence are retained under `artifacts/private/deployment-closeout-2026-10-16/`. No secret values are included in this report or its inventory.
