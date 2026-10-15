# Local pin and reply polish — 2026-10-14

## Findings and changes

The prior authenticated smoke's recorded `namedPlaceDiagnostics` establish the causes:

- **Cinnamon Bay / Peace Hill:** Google returned exact names, country `VI`, and administrative region `St John`. The park context carried region `VI`. Country admission already allowed territories, but region matching rejected both (`region_mismatch`). Region matching now includes structured territory country codes alongside their administrative subdivisions. Different territories and mainland regions still fail to match.
- **Art Institute of Chicago:** Google returned `The Art Institute of Chicago`; strict name comparison rejected the leading article (`name_mismatch`). Leading `The` is now an orthographic variant. Remaining words must match; duplicate identities remain ambiguous; geographic restrictions still apply. Schools, gift shops and nearby attractions are not aliases.
- **Post-save wording:** The policy explicitly required conditional wording, and the accepted response was published unchanged. The policy and proposal-tool description now identify `response` as the success reply, written with completed-action language. The existing persistence boundary publishes that reply only after success. No regex rewriting, additional model call, or second narrative owner was added.

## Changed files in this pass

- `server/src/services/geocodePlaceService.js`
- `server/src/services/providers/namedPlaceEquivalence.js`
- `server/src/prompts/trailieModelFirstPolicy.js`
- `server/src/services/trailieSimpleGuard.js`
- `server/src/services/__tests__/namedPlaceCountry.test.js`
- `server/src/services/__tests__/trailieSimpleRuntime.test.js`
- `server/scripts/smoke-trailie-polish-local.js`
- This report.

Existing unrelated workspace edits were preserved. No commit, push or deployment.

## Verification

- Focused tests: **3 suites, 76 tests passed; exit 0; zero live-provider calls**.
- Full server suite: **540 suites passed, 1 skipped; 7,554 tests passed, 22 skipped; exit 0**. Provider-isolation counters all zero.
- Mandatory One-Brain gate: **passed; exit 0**.
- Smoke harness preflight: **passed; exit 0**, using real JWT auth and a local copy of the accepted three-day St. John plan; zero model calls.
- Four-turn live smoke: **all four scenarios passed**, with one patch retry. Approved model cap: **$0.30**; total measured model spend including the first attempt and retry: **$0.208110**. The patch retry exited 0.

The smoke uses real JWT authentication, the model-first HTTP router, and canonical Mongo persistence in a disposable loopback database. It seeds the previously accepted St. John plan locally, then runs Chicago Q&A, a Chicago plan including the Art Institute, a day-2 St. John patch including Cinnamon Bay and Peace Hill, and Tokyo. It records actual responses, grounded stops, untouched-day equality, latency and model usage. Non-model provider charges are not captured by token telemetry.

Private diagnostics and smoke outputs: `artifacts/private/polish-smoke/` (gitignored).

## Live smoke results

| Scenario | Result | HTTP latency |
|---|---|---|
| Chicago December Q&A | Answered naturally; no trip artifact | 9.7 s |
| Chicago three-day car-free plan | Persisted plan with Art Institute pin and four other grounded stops | 91.8 s |
| St. John day-2 patch | Cinnamon Bay and Peace Hill pins; days 1 and 3 byte-identical | 20.7 s (retry) |
| Tokyo | Stated U.S. scope; no international itinerary | 2.7 s |

Patch reply, verbatim:

> I replaced Day 2 with Cinnamon Bay in the morning and Peace Hill in the afternoon, with a lunch break between them. Days 1 and 3 are exactly unchanged—including Day 1’s existing Peace Hill visit, so you now have it on both days. Confirm beach access and trail conditions before heading out.

The initial patch successfully resolved both places, but the harness reserved one input token per UTF-8 byte and blocked the final generation despite sufficient actual budget. That first batch therefore exited 1. The harness now uses the installed SDK's `responses.inputTokens.count` before reserving input plus bounded maximum output. Only the patch was retried, with its cap set to the original remaining $0.140666; retry spend was $0.048776. The first batch cost $0.159334. All initial failure artifacts are retained; `combined-summary.json` records the final four-scenario result and aggregate cost.

The Chicago plan's ~92-second latency remains noticeable. These checks verify HTTP responses and saved canonical pins, not browser map rendering or broad launch readiness. All writes used disposable local MongoDB, which was stopped afterward. No commit, push or deploy.
