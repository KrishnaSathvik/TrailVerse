# CI controls executed — October 16, 2026

The controls are now implemented on branch `ci/security-controls-2026-10-16`, with executable revision `6392da99f61246c4043ba8f87fddbd299d40cc1c`. **Production remains HOLD; no exception is active.** This supersedes the earlier reports' statements that branch protection was merely proposed and no hosted CI had run.

## GitHub protection applied and read back

`master` now requires one independent approving PR review, stale-approval dismissal, approval of the latest reviewable push, resolved review conversations, and an up-to-date branch with the `security` check passing. The check is bound to GitHub Actions app ID `15368`; the hosted run confirms that exact check name and app. Administrator enforcement is enabled; force pushes and deletion are disabled. The previous state was no branch protection and no rulesets. No independent reviewer identity or risk acceptance has been fabricated.

## Executable changes

- All three workflows cover default branch `master`, declare read-only contents permission, disable checkout credential persistence and bound job duration. SSR preview discovery has only its additional read permissions.
- The security job uses lockfiles directly without installing application dependencies or executing lifecycle scripts. It collects full and production audit results for root/frontend/backend before deciding failure; no advisory is suppressed. Invalid/missing audit data or execution failure blocks.
- Raw JSON, stderr, exit codes, revision and lockfile hashes are retained for 30 days with `always()` upload. Production results must be zero; full trees retain the moderate threshold.
- Snyk runs separately, only on protected-branch push events. Its action is pinned to `11b673cfb4b0dc0d860a1323caa199d54950dcce`. It remains advisory, never a substitute for the blocking audit.
- Browser jobs use the official Playwright 1.58.2 Noble linux/amd64 image at `sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0`. CI no longer downloads/extracts browser ZIPs into the repository job. Implicit Playwright/Puppeteer downloads are disabled. A guard verifies all three installed package versions and preinstalled browser paths before use.
- A smoke job launches Chromium, Firefox and WebKit on an in-memory page. The first hosted attempt exposed Firefox's root/home-owner mismatch; the fix changes ownership of only the disposable container's `/github/home`. It does not replace HOME or change browser versions. E2E's MongoDB URL now uses the service hostname required inside the job container.

## Observed verification

Initial run: [38954357243](https://github.com/KrishnaSathvik/TrailVerse/actions/runs/38954357243), revision `756c860202e59831539e410ad70ef365d7d7119d`.

- Four offline collector tests passed in GitHub.
- Actual security-job token permissions: `Contents: read`, `Metadata: read`.
- The gate failed for moderate-or-higher findings, while raw evidence upload succeeded. Downloaded artifact contained all 13 expected files (six JSON reports, six stderr files and summary).
- Root full/production: zero. Frontend full: 11 high and 3 moderate; frontend production: zero. Backend full: 31 high; backend production: zero. **45 development findings, zero production findings**, matching prior evidence.
- Artifact `12069741488`, `security-audits-38954357243-1`, expires `2026-11-15T19:22:09Z`; archive digest `sha256:e8430481e47d2ebd4aaddb325b72164ce91008ff8408ecc2c651a130e2cabf26`.
- Credential-bearing Snyk job was skipped. Broad application suites/builds were deliberately skipped only for this verification branch; ordinary PR runs still select them. These checks do not claim full application regression acceptance.
- Local browser smoke passed all three engines using the same pinned image, with network disabled, capabilities dropped, no new privileges and only copied browser packages/scripts mounted read-only. No credentials or project environment files were mounted.

Final hosted browser-fix run: [38954603182](https://github.com/KrishnaSathvik/TrailVerse/actions/runs/38954603182), revision `6392da99f61246c4043ba8f87fddbd299d40cc1c`, completed:

- **Browser-image job passed**, including version verification and launch/page/shutdown for Chromium, Firefox and WebKit. The ownership correction passed on the actual GitHub container.
- **Security job failed only at the vulnerability gate**, as required. Collector fixture tests and artifact upload passed. Downloaded all 13 files again for this exact revision: root zero, frontend 14 development/zero production, backend 31 development/zero production.
- Final artifact `12069437252`, `security-audits-38954603182-1`, expires `2026-11-15T19:24:10Z`; archive digest `sha256:a855470131f66ee5a56bed50dea5a4f6e98bfff83b43423adbd0abec49ee7b10`.
- Overall workflow conclusion is **failure**, correctly reflecting the unresolved dependency gate, not a browser or evidence-retention failure. Snyk remained skipped. No exception evaluator or automatic approval was introduced.

## No production deployment

Before push, Render inspection confirmed MCP auto-deploy tracks only `master`, backend auto-deploy is off, and both services have previews disabled. Vercel's branch-specific `git.deploymentEnabled` entry disables deployments for this verification branch. Only that branch was pushed; no merge or master push occurred. After the push, Vercel still listed `dpl_3ouXjTpqu3Qf5kvVwBrTmvRkd7pk` as the latest deployment, and MCP still listed `dep-d980ttu7r5hc73968eeg` at `548f584a2ef0e7c5fcb900e1f518c8e707212976`.

## Remaining decision

The raw security gate is intentionally red. A named independent human reviewer must decide on the four-advisory exception and its residual risks; owner acceptance and approved enforcement remain absent. This pass establishes actual repository protection, isolated audit execution, retained evidence and a preinstalled-browser CI path. It does not claim local LHCI usage or arbitrary third-party package code is harmless. The reviewer must assess or restrict those paths explicitly within the existing exception scope. Candidate-hosted MCP deadlines/cancellation and deployment approval remain separate. No itinerary/runtime feature or dependency version changed.

References for the implemented mechanisms: [official Playwright image](https://playwright.dev/docs/docker), [Vercel branch deployment control](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). The image pin fixes the artifact identity; it is not an assertion that the image has no vulnerabilities.
