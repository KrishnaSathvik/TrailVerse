# PR #48 release infrastructure follow-up

## Changes

- Replaced the nonexistent `patrickedigital/wait-for-vercel-preview` action with a repository-owned GitHub deployment lookup. It requires the exact PR head SHA, Vercel bot provenance, Preview environment, successful latest deployment status, and an HTTPS Vercel preview origin. Lookup is bounded to ten minutes. PR audits never fall back to production.
- Parks integration tests now mount the real public router, controller, cache and error handler with a fixed NPS provider boundary. Previously importing the whole app loaded unrelated email JSX before tests could start. The old tests also assumed authenticated park browsing, obsolete response fields and nonexistent nested weather/events/reviews routes, used Vitest APIs in Jest, and relied on live NPS data. Current tests cover public access, identities, filtering, pagination, field projection, activities, missing parks, provider failures and cache isolation. No application behavior changed.
- E2E's disposable Actions MongoDB service uses the Docker hostname `mongodb`. Explicitly allowed that exact hostname in that job through the existing database guard configuration; production and ordinary local database safeguards are unchanged.
- Published the existing bounded development-tool exception following the owner's explicit reply: “Publish the existing bounded exception.” Original approval, scope hash and October 30 00:00 UTC expiry are unchanged. This authorizes publication, not bypassing independent PR review. Four exact advisories account for 45 propagated development findings; raw findings remain retained. Production findings, drift, new findings and scan failures remain blocking.

## Validation

- Preview selection: 12 offline tests passed, including wrong SHA/provenance/environment, pending/failed status, unsafe URL and API failure.
- Security collector and policy: 34 offline tests passed. Replayed retained CI reports against the actual release manifests, lockfiles and approved policy: accepted; production reports contain zero findings. This is retained-report evidence, not a fresh registry scan.
- Integration: all 4 suites / 42 tests passed. Test teardown releases the controller’s module-startup cache timer so Jest can exit normally.

## Remaining CI blockers from fb5ff3ba

The completed GitHub run exposed more failures than the earlier in-progress snapshot: backend 27 failed suites (92 failed tests, 7,541 passed), frontend 3 failed files (4 failed tests, 1,564 passed), E2E startup failed. Backend failures include uncommitted historical/private capture dependencies, email JSX loading in the blog test, and evaluation guard assertions. Frontend failures include missing historical contract fixtures and a weather weekday assertion. No tests have been skipped to hide these failures, and private captures have not been published wholesale. These require bounded fixture/test-harness follow-up; they are not evidence of a new itinerary runtime defect.

Build, lint, Vercel preview and One-Brain passed on fb5ff3ba. New CI results must be checked after publication. Independent approval remains required. No merge, deployment or hosted setting change is part of this follow-up.
