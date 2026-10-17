# Remaining CI repairs for PR #48

## Security

Verified fresh reports field by field before applying the owner's conditional approval. Only the propagated `range` metadata for `jest` and `jest-resolve-dependencies` changed; advisory identities, installed nodes, paths, via/effects edges, severities and counts are unchanged. The October 30 expiry and production-zero/new-finding/drift/scan-failure checks remain intact. See security-metadata-refresh-2026-10-17.md for exact ranges and scope. All 35 policy/collector tests pass, including validation of the actual approval record; replay of the latest six CI reports is accepted.

## Backend and frontend tests

- Historical captures were missing from clean checkouts. Selected sanitized fixtures now live under `server/tests/fixtures/captured`, with enumerated Jest-only read redirection. Live evaluator defaults are unchanged, and no private acceptance records are materialized. Regression accounting and canonical-plan assertions remain in place. Identifiers are pseudonymized; credential/contact/device/network fields are scrubbed. Unknown captures still fail. Test adjudications bind sanitized fixture bytes and are not live approvals.
- Blog HTTP tests mount the real router with mocked delivery/scheduler boundaries, use the shared disposable MongoDB, current schema categories and a signed fixture token. They no longer import email JSX or connect to an inherited database.
- Child-bootstrap isolation tests supply explicit fake provider keys and an unused local Mongo URI instead of relying on a developer `.env`.
- Replay output creates its own ignored output directory.
- Frontend canonical tests use the already committed MCP contract fixture; weather weekday expectations follow the fixture timestamp in the runtime timezone.

Full frontend result: 170 files / 1,568 tests passed. Targeted backend replay resolved missing fixtures and harness failures; full backend verification is in progress at publication. Provider tripwires remain enabled; no paid calls were made.

## SSR

Two failures were stale assertions: About uses a typographic apostrophe, and Testimonials is titled “Traveler Stories.” Their strong-content requirements remain unchanged. Explore now renders actual initial park links during client-grid suspension; its audit checks current intro copy and at least one semantic park-detail link instead of requiring arbitrary park names in the first page. Intent pages retain their complete article while query-dependent return navigation resolves. Headings, body checks and route tiers are retained.

## E2E environment

- Next's development server now uses port 3000 explicitly instead of inheriting the backend's PORT=5001; its NODE_ENV is explicitly development.
- Browser-owned contexts inherit the configured base URL.
- Browser tests use the existing NPS test-adapter seam with deterministic park records, while routes and disposable MongoDB remain real. The preload refuses non-test use. No provider keys are needed.
- The test timeout is 60 seconds to accommodate cold development compilation and multi-page flows; assertions and browser projects are retained.

Local browser verification uses separate ports and installed Chrome. This worktree requires webpack because Turbopack rejects its shared node_modules symlink; hosted CI has real dependency directories. Latest hosted E2E/SSR results must be verified before release.

## Release verification update

Full local backend verification passed: 551 suites and 7,670 tests, with zero live provider calls. The hosted backend job lacked the frontend dependencies required by two subprocess qualification suites; the workflow now installs those locked dependencies before testing. Hosted frontend, integration, build, SSR and One-Brain checks passed at f2bb8d50.

The latest audit reverted only the previously documented Jest range metadata to its original values. Production findings remain zero. The owner explicitly instructed that these documented development-only findings must not block release; the fail-closed exception policy remains unchanged.

The owner removed required reviews/checks from master protection; persisted GitHub settings and an empty ruleset list confirm this. Normal merges are permitted without bypass. MCP still reports autoDeploy=yes, trigger=commit, branch=master. Merge is paused pending the owner's disabling automatic MCP deployment to preserve the requested manual backend/MCP order. No Render settings or deployments have been changed.
