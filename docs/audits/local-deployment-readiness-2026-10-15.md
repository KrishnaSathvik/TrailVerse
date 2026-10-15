# Local deployment readiness — October 15, 2026

**Verdict: not ready for deployment sign-off.** The application builds with webpack and the public-page checks pass, but dependency advisories and deployment configuration need resolution. This audit did not push, deploy, send email, change hosted settings, or run live AI generations.

## Scope and revision

Checked the complete local working tree on `release/trailie-demo-baseline-2026-10-15`, based on `700565ee`. The initial tree contained 326 modified/deleted/untracked entries, including 89 untracked entries and 65 deletions. These are not all contained in the committed demo baseline. Required new runtime files, assets, tests, and intentional quarantine moves must be included in the release revision.

Local verification used Node 24.9.0 and the MCP virtual environment's Python 3.14. The repository root and CI still select Node 20; the MCP blueprint selects Python 3.12.7. This is not a clean-install test on the exact hosted runtimes.

## Checks

- Production webpack build: **passed**, including TypeScript, 95 static generation entries, and service-worker generation. Command: `NEXT_PUBLIC_API_URL=https://trailverse.onrender.com/api ./node_modules/.bin/next build --webpack` from `next-frontend`.
- Default `npm run build` / Turbopack: **environment-blocked**, twice reporting `binding to a port: Operation not permitted` during CSS worker evaluation, including the escalated attempt. No change was made to the default build command. Webpack success is not a successful verification of the default Turbopack pipeline.
- Production HTTP smoke: **9/9 passed** on local port 3067: Terms, Privacy, Features, ChatGPT, MCP, Testimonials, Newsletter, ChatGPT PNG, and the development-only preview route. The last route correctly returns 404; all others return 200. Checked the requested content removals and exact ChatGPT plugin URL. This was HTTP verification, not an interactive browser test.
- Frontend lint: **0 errors, 143 existing warnings** after the helper-name fix; changed files also checked separately.
- MCP: **59 Python tests and 3 JavaScript widget tests passed**.
- Frozen release baseline: **15 demo turns, 4 separately captured refusals, and 9/9 private source checksums verified**, without provider calls.
- Root, frontend, and backend package metadata match their respective lockfiles. No real `.env` files are tracked. `git diff --check` passes.
- Frontend full default suite after fixes: **169 files passed; 1,550 tests passed**.
- Backend full default suite: **540 suites passed, 1 skipped; 7,554 tests passed, 22 skipped**. Provider isolation reports zero live constructors, dispatches, or external provider HTTP requests.

## Small fixes made during this check

1. Renamed the build script's `useExistingFallback` helper to `retainExistingSlugs`; it is not a React hook and previously caused four lint errors.
2. Updated the newsletter test's stale heading expectation to the existing “Join the upcoming newsletter” copy; product copy was not changed.
3. Added `.jsx` to the server testimonial component import to distinguish it from the similarly named `testimonialBadge.js` helper on a case-insensitive filesystem.
4. Guarded saved-event reads during server rendering. The build previously logged repeated `localStorage is not defined` errors. Verified server empty state and browser bookmark lookup; the final build has neither these errors nor the testimonial import warning.

## Remaining release concerns

### Dependency advisories

Live `npm audit --omit=dev --json` reports:

| Package tree | Critical | High | Moderate | Total |
| --- | ---: | ---: | ---: | ---: |
| Backend | 2 | 4 | 3 | 9 |
| Frontend | 1 | 3 | 2 | 6 |

These are package-tree findings, not confirmed exploit paths; shared packages appear in both trees. Backend critical findings include `handlebars` and `proxy-addr`; frontend includes `next`. Other affected packages include Axios, compression, Nodemailer, sharp, and source-map-js. Remediate or explicitly assess applicability before release; no broad or major-version upgrades were applied in this audit.

The installed Next.js 16.3.5 falls within the affected package range of the [ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j). That advisory specifically requires attacker-controlled SVG input to Node ImageResponse; the source search found no `ImageResponse` or `next/og` usage. This reduces applicability of that particular finding, but does not resolve the other Next.js audit entries. [Handlebars advisory](https://github.com/advisories/GHSA-p8wg-vrv2-v86f). Full audit JSON is saved under `artifacts/private/deployment-readiness-2026-10-15/`.

### MCP configuration and latency

The local backend `.env` has no `MCP_BYPASS_KEY`, while the local MCP `.env` has one. Local end-to-end connector bypass is therefore not configured. This does **not** establish that hosted secrets are missing; hosted values were not inspected or changed. Confirm the same secret is configured on both Render services.

The checked-in MCP blueprint and client default `PLAN_TRIP_TIMEOUT` to **30 seconds**. Seven of the 15 frozen demo requests exceeded 30 seconds, with a maximum of **107.517 seconds**. Those measurements are website requests, not a current MCP load test, but indicate a concrete timeout risk. Validate the actual deployed timeout and a real connector planning request before sign-off.

The existing release baseline explicitly does not establish production streaming transport readiness. No new live AI or end-to-end production streaming test was performed here.

### Build/runtime settings and release packaging

The root `package.json` pins Node `20.x`, while [Vercel currently lists Node 22 and 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Align the selected project root, runtime setting, package engine, and CI before deploying; the frontend package itself has no engine pin. MCP was tested locally on Python 3.14 rather than the blueprint's 3.12.7.

Local development env files use localhost API/site URLs. The successful production build explicitly overrides the public API URL. Use production environment settings rather than uploading local `.env` files. Deploy the new `/brand/chatgpt.png` asset before sending email templates that reference its public URL.

Strongly recommend updating the outdated Vercel CLI before the deployment step: `npm i -g vercel@latest`.

The default backend run intentionally excludes 58 quarantined legacy V2 suites and live-provider suites. The frontend default run excludes the separate isolated-evaluation spawn suites. Passing default suites must not be represented as execution of those excluded suites.

## Evidence

Logs, audit JSON, and HTTP smoke results are retained under the gitignored `artifacts/private/deployment-readiness-2026-10-15/` directory. No secret values are included in this report.
