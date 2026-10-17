# Deployment blocker resolution — 2026-10-15

**Verdict: hold deployment.** This revision packages the intended local working tree; it does not authorize deployment. No push, deployment, hosted environment mutation, or email send was performed. This report supersedes the configuration and dependency findings in `docs/audits/local-deployment-readiness-2026-10-15.md` where stated below.

## Original critical production advisories

| Package | Resolution | Applicability and verification |
| --- | --- | --- |
| Next.js | 16.3.5 → pinned 16.3.8, matching eslint-config-next | No ImageResponse/next/og use was found, but that did not excuse the other Next advisories. Patched the package rather than granting an exception. Production audit now has zero Next findings. |
| Handlebars | 4.7.9 → 4.7.10 | Backend compiles repository-owned email templates; no user-controlled template compilation was found. Patched despite that reduced exposure. |
| proxy-addr | 2.0.7 → 2.0.8 in backend and frontend tooling lockfiles | Used by Express trust-proxy/IP handling, which affects rate limits. Patched rather than assuming hosting topology prevents spoofing. |

Also updated Axios, compression, morgan, multer, sharp, and source-map-js within compatible dependency ranges. No `npm audit fix --force` was used.

Final production audits report **zero vulnerabilities in both backend and frontend**. The root package audit is also clear. Counts refer to npm package-tree findings, not proof that the application has no vulnerabilities.

Additional targeted resolutions:

- **Nodemailer:** upgraded to fixed 10.1.1 (supports Node 20+). Verified JSON transport creation/message output offline; no email was sent. Main application delivery still uses Resend. [Advisory](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v).
- **UUID:** upgraded to 11.1.1, which retains the CommonJS `v4()` API used here. Verified `require()` and generation. The advisory concerned other version/buffer paths, but the dependency is now patched as well. [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- **Tailwind typography:** a narrowly scoped override uses postcss-selector-parser 7.1.6. Verified its actual common-trailing-pseudo API and reran the production CSS build. Did not take npm's suggested typography downgrade.
- **Vitest / coverage:** upgraded together to 4.1.11, removing the critical vulnerable worker chain. Both the full frontend suite and coverage integration were rerun. [Worker-options advisory](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [run-options advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
- **Root development tools:** compatible updates to shell-quote, lodash, glob, minimatch, and brace-expansion cleared all five root findings.

The development-inclusive audit still reports backend **38 findings (0 critical, 32 high, 6 moderate)** and frontend **31 findings (0 critical, 21 high, 5 moderate, 5 low)**. Many entries repeat dependency chains. Examples include braces through Jest/nodemon, sprintf-js, and Lighthouse tooling's archive/FTP/temp-file dependencies. Some advisories offer no compatible fixed release; npm suggests inappropriate old major downgrades. These findings are **not waived** merely because tools are development dependencies. The existing `npm audit --audit-level moderate` CI gate still fails and needs separate dependency remediation or explicit, reviewed applicability decisions. The audit threshold was not weakened.

## Runtime and build configuration

- Read-only Vercel project inspection reports **Node 24.x already selected**. Local `.vercel/project.json` was stale; no hosted setting was changed.
- Root, frontend, and backend package engines, `.nvmrc`, all checked-in Node CI jobs, and the backend Render blueprint now target Node 24. Validation runtime: Node 24.9.0.
- Frontend `npm run build` explicitly invokes `next build --webpack`. This selects the validated release path; it is not a conclusion that Turbopack is defective.
- Backend blueprint uses `npm ci` to respect the checked-in lockfile. CI Mongo service now uses Mongo 7 with its `mongosh` health check; artifact uploads use action v4.
- A deployment must use production environment values, not local `.env.local`. The final production build check explicitly supplies `NEXT_PUBLIC_API_URL=https://trailverse.onrender.com/api` and `NEXT_PUBLIC_SITE_URL=https://www.nationalparksexplorerusa.com`.
- The Vercel connector did not expose a custom build-command override. Confirm hosted build settings use the checked-in `npm run build` before deployment.
- Vercel CLI update remains preparation only: `npm i -g vercel@latest` (installed 62.2.0; update notice 64.2.0). No global upgrade or hosted migration was performed.

## MCP bypass and timeout

Local backend and MCP secrets now exist and compare equal; only presence/equality was logged. Values remain in ignored local environment files. Both Render blueprints declare the shared secret without its value. Middleware compares byte lengths before `timingSafeEqual`, avoiding a malformed Unicode-header exception. Six tests verify exact match, mismatch, malformed input, and missing-secret failure.

Planning HTTP timeout defaults, MCP blueprint, example environment, and README now use **180 seconds**; ordinary reads remain **30 seconds**. Frozen demo measurements reached 107.517 seconds, so 30 seconds was not a sound planning default. A real local HTTP test verifies that planning uses its own larger timeout and still reports a controlled timeout when its deadline is exceeded. This is an HTTP operation/inactivity budget, not proof of an overall hosted end-to-end deadline.

**Hosted configuration remains unverified:** Render requires explicit workspace selection before service inspection. Selection was requested for “My Workspace” but was not yet supplied during this pass. No claim is made that hosted secrets match, the running MCP service has the new timeout, or hosting/client deadlines permit 180 seconds. MCP Python tests ran on local Python 3.14; the blueprint targets 3.12.7.

## Production transport verification

`cd server && npm run verify:release-transport` exercises the built production Next.js server, its HTTP rewrite proxy, the full Express app (including compression/middleware), and disposable MongoDB. Only model and semantic verification dependencies are injected; provider access is disabled and outbound network guarded.

Eight checks passed across guest/authenticated × legacy/v2:

- Exactly one final event followed by actual stream EOF.
- Final response identity/hash matches the persisted database conversation.
- A stalled cost-ledger promise does not block final delivery or EOF.
- Client cancellation propagates through Next to the model signal.
- Cancellation creates no canonical trip and consumes no completed guest turn.

There were zero external network attempts and zero provider requests. The harness temporarily changes only the generated API rewrite destination to loopback and restores it during cleanup. It is not a hosted Vercel→Render test, browser-rendering test, live-provider test, or long-duration proxy timeout test. Hosted completion/cancellation and deadline verification remain release gates.

## Verification and packaging

Final validation:

- Frontend: 169 files, **1,550 tests passed**, with coverage on Vitest 4.1.11.
- Backend: **541 suites / 7,560 tests passed across the full run and focused rerun**, with 1 suite / 22 tests intentionally skipped. The first final full run had 539 passing suites and two failing evaluation suites (17 failed tests) because Vitest 4 no longer supplies `vite-node` transitively. Declaring `vite-node@3.2.4` explicitly fixed the dependency; both affected suites then passed (94 tests, 18 intentional skips). Vite remained 8.3.4 for the frontend runner. No test assertions or isolation gates were weakened.
- MCP/widget: **60 Python + 3 JavaScript tests passed**.
- Production build: **passed** under Node 24, using the checked-in npm build command, explicit production URLs, and final production dependency versions; 95 static generation entries completed.
- Production HTTP smoke: **9/9 passed**, including requested Terms/Privacy removals, exact ChatGPT plugin URL, image asset, and production 404 for the development preview route.
- Production proxy transport: **8/8 passed** against final dependencies. Provider/network counters stayed zero.
- Frontend lint: **0 errors, 143 warnings**. Build retains the existing Serwist/Browserslist dynamic-require warning; Vitest 4 reports that its OXC transformer supersedes the esbuild options retained for the standalone Vite-node launcher.
- Root/backend/frontend package metadata and lockfile dependencies agree. `git diff --check` and frozen-baseline verification pass.

The local commit packages the full intended working tree, including the pre-existing application changes and this blocker-resolution pass. It is not pushed. The default backend suite excludes quarantined legacy V2 and live-provider suites; the frontend default excludes isolated evaluation spawn suites. Do not interpret passing default suites as running those exclusions.

The frozen demo was not regenerated: 15 turns, 4 separately recorded refusals, and all 9 available private source checksums passed verification. The release includes pre-existing local changes and the legacy-suite quarantine moves, preserving the baseline. Private evidence and `.env` values are excluded from Git. No secret-pattern matches were found in added diff lines or new text files; this is a focused scan, not a claim of exhaustive credential auditing.

Evidence is retained in the ignored `artifacts/private/deployment-readiness-2026-10-15/` directory.
