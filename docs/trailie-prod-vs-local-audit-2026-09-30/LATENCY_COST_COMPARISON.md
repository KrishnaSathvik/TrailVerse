# Latency and cost: measured evidence and limits

No new model, search, maps or other paid calls were made. This report uses source control flow, existing production logs, and three saved historical local canary records. It does not report a benchmark or extrapolate population statistics from three turns.

## What is measured

| Existing local canary record | Outcome | Model attempts / executed tool count in telemetry | Recorded turn time | Recorded successful-call model cost |
| --- | --- | --- | ---: | ---: |
| Turn 1: greeting “ready” | complete | 1 / 0 | 2.567 s | $0.0045135 |
| Turn 2: three-day Glacier request | cancelled, no final answer | 4 / 4 | 15.924 s | $0.0116908 |
| Turn 3: same Glacier request | model_failed | 2 attempts; 1 successful call recorded / 1 tool | 4.079 s | $0.005926; total cost unknown |

Source: [existing turn 1](../../artifacts/trailie-simple-canary-2026-09-29/turn-1.json), [turn 2](../../artifacts/trailie-simple-canary-2026-09-29/turn-2.json), [turn 3](../../artifacts/trailie-simple-canary-2026-09-29/turn-3.json). The artifact directory is dated September 29; request timestamps are September 30 UTC. Charges are the application's recorded pricing estimates, not reconciled provider invoices. Rounded recorded budget charge is $0.022132 across these turns, not proof that all failed-call/provider cost is known.

These recordings represent earlier simple-runtime revisions: turn 2's four calls exceed today's cap; turn 3's 56 evidence rows exceed today's per-read cap. They demonstrate a historical failure sequence, not current performance. They do not measure a successful full itinerary.

## Production observation without new traffic

A Render log query scoped to service `srv-d3il0cpr0fns73cvjq0g` and text `model` returned 12 matching entries, September 25, 02:59:38–10:08:59 UTC: **11 reviewer failures and one conflict-retry failure**, each reporting that `temperature` is deprecated for the model. This is an error-filtered sample, not an error rate. A separate `Success with Claude model` query returned no matching entries in its seven-day window; absence of that log is not absence of successful SSE calls.

The primary SSE code omits sampling temperature for certain model IDs, but review and conflict retry still send it. The review catch returns passed=true. This explains how a successful-looking final answer can coexist with an inoperative review. The error itself does not prove the exact deployed model ID. [server/src/services/aiProviderStream.js:52 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/aiProviderStream.js#L52); [server/src/services/trailieReviewerService.js:200 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/trailieReviewerService.js#L200); [server/src/routes/ai.js:2034 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L2034).

No production turn's total duration, complete token usage, client render timing or cost was established from these logs.

## Latency mechanics

| Dimension | Production | Current local |
| --- | --- | --- |
| Before first generation | Backend preparation and relevant retrieval | Admission and stored context; research comes after first model decision |
| Provider behavior | Token streaming for chat | Nonstreaming Responses calls |
| Visible progress | Source-aware thinking, then prose deltas; finalization can follow | Start/15-second keepalive; final prose after commit |
| Model rounds | Usually 1 generation; conditional postprocessing up to 5 more | At most 3 attempts, serial rounds with parallel reads within a round |
| Retry/fallback | Nonstream Claude fallback chain; SDK retry configuration not explicitly pinned in construction | Zero model SDK retries, no model fallback; evidence broker allows one classified retry |
| Deadlines | Web wrapper 2.5 s per provider stage, underlying 5–7 s HTTP timeouts; driving enrichment wait cap 2.5 s; planner narrative wait cap 8 s | 180 s per model request; no explicit total-turn deadline in simple runtime |
| Persistence | Stream plan save not awaited | Commit before successful content delivery |

Sources: [server/src/services/factsService.js:40 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/factsService.js#L40); [server/src/routes/ai.js:2250 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L2250); [server/src/services/fastItineraryPlannerService.js:17 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/fastItineraryPlannerService.js#L17); [server/src/routes/modelFirstTrailie.js:31 (local)](../../server/src/routes/modelFirstTrailie.js); [server/src/services/trailieSimpleModel.js:28 (local)](../../server/src/services/trailieSimpleModel.js).

Three 180-second requests imply up to roughly 540 seconds of **configured model wait** before additional provider/DB time, absent earlier cancellation; this is not a observed latency or a guaranteed total timeout. Promise.race wait caps in production likewise do not demonstrate that background work/billing is cancelled.

A useful accounting model is:

```text
Production first prose = context preparation + primary-model first-token delay
Production final = full generation + conditional postprocessing + final assembly
Local first accepted prose = admission + all model rounds + research waves + validation + commit
```

Thus “feels faster” may reflect time to visible content rather than lower total compute. Actual p50/p95 comparisons remain unknown.

## Cost accounting

Production SSE helper leaves `usage=null` and does not assemble a complete per-turn multi-call ledger. Extra extraction/review/repair work and possible client fallback must be included before asserting cost per answer. Local records successful call usage and registry pricing; failed calls set cost status unknown. Tool/provider cost is tracked separately and may be unknown. Local `modelCostUsd` is not an all-inclusive turn bill. [server/src/services/aiProviderStream.js:25 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/aiProviderStream.js#L25); [server/src/services/trailieSimpleRuntime.js:96 (local)](../../server/src/services/trailieSimpleRuntime.js); [server/src/services/trailieTurnLedger.js:46 (local)](../../server/src/services/trailieTurnLedger.js).

For a defensible future comparison, sum each attempt's actual uncached/cached input, output and reasoning charges according to the provider's reported billing semantics, then add paid retrieval/maps calls. Do not double-count reasoning already included in output usage. Separate completion cost, failed-attempt cost, and infrastructure cost; amortize only against comparable successful traveler outcomes. This report neither fetches current pricing nor assumes the local registry is an invoice.

## Supported conclusion

Production's prefetch and streaming plausibly improve responsiveness. Local's sequential dependencies and terminal-only delivery plausibly worsen it. Neither architecture's total cost or latency superiority is proven. The historical canary spent recorded model budget without completing the Glacier plan; today's static contract problems must be resolved in a future implementation before a paid benchmark could usefully judge model quality. No benchmark is authorized or started by this report.
