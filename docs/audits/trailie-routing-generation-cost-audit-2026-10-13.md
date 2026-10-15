# Trailie routing and generation-cost audit — 2026-10-13

**Verdict:** Keep GPT-6.1 Sol and the current model-first architecture. The second pasted recommendation is directionally sound, but both documents overstate how much proposed functionality is absent today. The measured bottleneck is upstream model-call time, especially initial composition and correction. A leaner output contract is a reasonable experiment, not a demonstrated cure. Multi-agent planning is not justified by the evidence reviewed.

This is an audit of the current, substantially modified working tree and existing local captures, not production certification. No runtime, prompt, configuration, deployment, or provider state was changed. No paid model/provider replay was performed. The only new file is this report. Earlier reports are historical evidence; current code takes precedence where they differ.

## 1. Verified measurements

Source: `artifacts/trailie-zion-bryce-live-validation-postfix-2026-10-13/cases/zion-bryce/turn-3-telemetry.json`.

| Stage | Measured seconds | Input tokens | Output tokens | Recorded model cost |
| --- | ---: | ---: | ---: | ---: |
| Model selects research | 6.391 | 6,124 | 170 | $0.017009 |
| Provider work, including finalization | 3.168 | — | — | Unknown |
| Initial proposal | 50.769 | 15,481 | 2,505 | $0.063751 |
| Memory verifier | 5.253 | 772 | 138 | $0.002924 |
| Corrected proposal | 37.995 | 23,306 | 2,451 | $0.082774 |
| Persistence | 0.024 | — | — | — |

The runtime measured **103.635 seconds**; the existing report rounds the enclosing planning turn to 103.7 seconds. Composition plus correction consumed **88.764 seconds, about 85.6%**. Recorded model cost for that turn was **$0.166457**. These are adapter-calculated token costs, not independently reconciled invoices or total provider costs.

Removing the correction would arithmetically leave approximately **65.6 seconds**, not 20–40 seconds. Removing all provider work would save at most approximately 3.2 seconds in this particular capture. These are counterfactual bounds, not benchmark results.

The adapter is non-streaming. Response-header timing near completion establishes an upstream wait, but cannot separate queueing, prefill, decoding, and network delay. The claim that JSON construction specifically caused all 50.8 seconds is not established. Initial composition reported zero reasoning tokens; correction reported 20. Output tokens and timings are known, but decoding-only throughput is not.

## 2. Findings against the pasted recommendations

### A. Adaptive answer/research/plan behavior already exists

The policy explicitly says ordinary conversation needs no structured output. The runtime uses `toolChoice: 'auto'`, accepts plain text when there are no tool calls, offers one research request when needed, and validates a trip only when a mutation is proposed. Targeted `plan_patch` support also exists.

Evidence: [policy](../../server/src/prompts/trailieModelFirstPolicy.js:19), [runtime](../../server/src/services/trailieSimpleRuntime.js:155), [proposal contract](../../server/src/services/trailieSimpleGuard.js:57).

The same five-turn Zion/Bryce capture demonstrates this:

| Turn | Behavior | Trip mutation | Runtime seconds |
| --- | --- | --- | ---: |
| 1 | Comparison with research | No | 28.341 |
| 2 | Feasibility answer without research | No | 11.989 |
| 3 | Compose, validate, correct, save | Yes | 103.635 |
| 4 | Research, then clarify ambiguous edit | No | 22.081 |
| 5 | Logistics answer without research | No | 21.732 |

Conversation persistence still occurs on non-mutating turns; “no trip mutation” does not mean “no database write.”

**Implication:** Do not build a new intent classifier or six separate pipelines on the premise that every question currently generates an itinerary. The remaining conversational problem includes substantial context and buffered delivery even on a single-call answer. The observed feasibility answer carried 5,810 input tokens; the logistics answer carried 10,432.

### B. Sol already produces a reduced proposal, not the complete persisted TripPlan

`trailieSimpleGuard.js` derives smaller plan and stop schemas from the canonical schema. The model selects activities, day structure, timing, explanations and evidence references. The guard then binds canonical identity, coordinates, source references, operational caveats and trusted route information from evidence.

Evidence: [schema projection](../../server/src/services/trailieSimpleGuard.js:27), [evidence enrichment](../../server/src/services/trailieSimpleGuard.js:300).

Measured current serialized sizes:

- Policy: **15,976 bytes**.
- Proposal tool definition: **9,649 bytes**.
- Within its properties: creation-plan schema **3,252 bytes**, patch schema **4,365 bytes**, memory schema **1,080 bytes**.

These are schema/input bytes, not generated-output token counts. Many fields are optional. The tool also lacks `strict: true`; the adapter consequently sends `strict: false`. Application validation enforces correctness, rather than API strict structured-output guarantees. Enabling strict mode is not a one-line remedy because the schema needs compatibility review and day-type semantics would still require validation.

**Implication:** A leaner proposal could shorten repeated explanatory strings, reference syntax or duplicate semantic declarations. However, the obvious deterministic enrichment is already implemented. Quantify actual raw output by field before promising savings. Do not derive day purpose, pacing, activity choice, durations or transfer intent through a hidden deterministic planner.

### C. Correction payload deduplication is already implemented

The current runtime retains the rejected function call once, removes its former extra `originalProposal` copy, and removes the duplicate nested grounded-place catalog. Correction evidence uses `modelEvidenceValue`, which omits raw source detail passages.

Evidence: [correction construction](../../server/src/services/trailieSimpleRuntime.js:306), [earlier measured repair](trailie-zion-bryce-live-release-readiness-2026-10-13.md).

The latest correction feedback is 17,154 bytes. It still produces 2,451 output tokens after a 2,505-token initial proposal. Reducing correction output, not repeating the completed input deduplication, is the next relevant experiment.

An initial-plan correction cannot simply use the existing persisted-plan patch mechanism: `existingCanonicalPlan` is null before the first save. A repair-delta experiment would need an immutable rejected-proposal base, bounded permitted changes, deterministic application of those changes and full revalidation before the first commit. This is a contract change, not an existing patch feature.

### D. The exact day-type failure is still unknown; the new capture remains insufficient

The trace proves that the first proposal failed only with `day_type_inconsistent`, then the correction passed. The original rejected content was overwritten in this capture. Calling it merely a mislabeled otherwise-good day is an unsupported assumption.

The current capture now retains ordered proposal rounds, but `sanitizePlan` records only day type, summary, stop names and block kinds. It omits `startPeriod`, `endPeriod`, block periods and stop bindings; patches are reduced to a boolean rather than their operations. The guard returns aggregated issue codes rather than locating this issue at a specific day/block.

Evidence: [sanitization](../../server/src/utils/trailieDiagnosisCapture.js:91), [round capture](../../server/src/utils/trailieDiagnosisCapture.js:136), [day checks](../../server/src/utils/dayCompleteness.js:71), [aggregation](../../server/src/services/trailieSimpleGuard.js:415).

A provider-free probe confirmed that two sightseeing days with the same captured type, summary, stop names and block kinds can differ in validity: a morning-to-afternoon outing passes; changing its declared start and outing start to midday yields `day_type_inconsistent`. The saved diagnostic projection cannot distinguish those cases.

**Priority:** Record bounded day/block locations and the actual conflicting declarations. Capture enough patch/rejected-proposal structure for reproduction. Keep the guard intact. The earlier report's assertion that the next replay will necessarily expose the exact mismatch is too strong.

### E. SSE progress exists, but model text is buffered

`createSimpleModel` awaits a complete Responses result without `stream: true`. The HTTP route emits progress and heartbeats while it waits, then sends the full content delta after runtime completion and persistence.

Evidence: [model adapter](../../server/src/services/trailieSimpleModel.js:18), [HTTP delivery](../../server/src/routes/modelFirstTrailie.js:169).

**Implication:** The proposed 1–3-second answer-start target requires measurement and likely delivery-path work; an SSE endpoint alone cannot provide token streaming. Answer-only streaming is a separate opportunity, provided mixed text/tool responses, factual grounding, failure handling and persistence semantics are respected. Proposed itineraries must remain unpublished until accepted. Progress indicators must not be counted as useful answer content.

### F. Caching deserves a concrete experiment

All model calls in the five-turn capture report zero cache-read tokens. Most non-verifier input tokens were instead billed as cache writes. The current runtime places a changing timestamp, saved plan and memory in top-level instructions, appends different round instructions, and changes the tool list after research. These are plausible impediments to reuse, not a proven diagnosis of every miss.

The shared adapter supports explicit caching, but the current model-first adapter does not supply `promptCaching` and replaces the shared builder's generated input. Merely switching on that shared option would not preserve its injected developer-message breakpoint without adjusting this integration.

Evidence: [context construction](../../server/src/services/trailieSimpleRuntime.js:69), [round/tool changes](../../server/src/services/trailieSimpleRuntime.js:160), [request override](../../server/src/services/trailieSimpleModel.js:22), [cache construction](../../server/src/services/providers/openaiResponsesAdapter.js:55).

Official documentation confirms automatic caching, exact rendered-prefix matching, tool/configuration sensitivity, explicit breakpoints and cache diagnostics. Test a stable policy/tool prefix with dynamic context later; measure reuse and billed token categories. Do not promise a proportional reduction in output generation time. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

### G. Service tiers are real, but the current adapter and accounting do not support the experiment yet

Official documentation confirms GPT-6.1 Sol, low-through-max reasoning, tool calling through Responses, $2 input/$10 output per million standard short-context tokens, Fast at 2× and Ultrafast at 6× standard prices. Cached input is $0.10 and cache writes $2.50 per million. [Sol model specification](https://developers.openai.com/api/docs/models/gpt-6.1-sol). The October 8 Ultrafast release is confirmed by the [API changelog](https://developers.openai.com/api/docs/changelog).

The local adapter sends no `service_tier`; do not infer the actual billed service tier from that omission alone. `priceProviderCall` selects rates by provider/model/date and accepts no tier, while the generic ledger initializes `serviceTier` to null. Before comparing paid tiers, pass and record requested/served tier and calculate tier-aware cost. Otherwise a faster call could still be incorrectly priced at Standard rates.

Evidence: [request builder](../../server/src/services/providers/openaiResponsesAdapter.js:72), [pricing function](../../server/src/services/trailieTurnLedger.js:46).

### H. Memory verification is dependent work in the current contract

The verifier checks the exact fields, values and quotes produced by the planner. Its receipt is bound to those values and traveler text. Those inputs do not exist before composition, so moving the current verifier in parallel with composition is not a scheduling-only change. The runtime already drops unsupported memory-only updates and revalidates an otherwise valid plan instead of spending a correction on memory alone.

Evidence: [verification and memory-only recovery](../../server/src/services/trailieSimpleRuntime.js:229), [receipt binding](../../server/src/services/trailieMemoryAuthority.js:8).

Do not move constraint-sensitive verification after persistence. Its measured 5.3 seconds is worth understanding, but substantially smaller than composition and correction.

### I. Multi-agent research does not target this run's critical path

Park activity reads, named-place work, route reads and independent topic reads already use bounded concurrent provider work in `trailieTravelData.js`. Provider work occupied about 3% of this planning turn.

The official multi-agent beta exists, but recommends bounded independent work and cautions about sequential dependencies and shared mutable state. It does not establish that itinerary splitting will be faster. [OpenAI multi-agent documentation](https://developers.openai.com/api/docs/guides/responses-multi-agent).

Keep one authority for the plan and commit. Consider parallel planning only after defining genuinely independent outputs, reconciliation cost and quality gates. Do not make that experiment a prerequisite for fixing known single-planner limitations.

## 3. Recommended order

1. **Complete correction observability.** Preserve conflicting day periods, issue locations, raw output size and reproducible rejected/accepted proposal structure in bounded private captures. Avoid another replay that still cannot identify the original failure.
2. **Benchmark a narrow Sol output change.** Use frozen evidence and identical traveler inputs. Compare baseline against leaner prose/reference representation or a bounded correction delta, one change at a time. Preserve all model-owned decisions, memory authority and canonical acceptance checks.
3. **Measure caching and faster tiers separately.** Fix request/response tier telemetry and pricing before a paid comparison. Establish cache behavior with unchanged tools/policy and dynamic context placed later. Keep Sol low as the baseline.
4. **Improve answer-only grounding and delivery.** The captured logistics answer made no research call and introduced an unsupported seasonal time-zone qualification. Mutation guards do not audit plain-text answers. Address factual behavior alongside streaming, rather than making an unreliable answer arrive sooner.
5. **Reconsider parallel agents only if a remaining bottleneck benefits.** No new Luna comparison is recommended; the user's prior model decision remains the baseline. This audit did not rerun or independently reproduce that older quality comparison.

Use the existing Demo conversations plus direct answers, ambiguous edits and hard-constraint cases. The historical full-Demo capture contains 21 turns, 11 proposed-mutation turns and three corrections; it is a small, earlier cohort, not a production failure rate. Compare accepted-plan latency, useful-answer latency, input/output/cache tokens, correctly priced costs, correction frequency, factual quality and unchanged-day/persistence parity. Use repeated paired runs before declaring a latency win; keep browser presentation and production release gates separate.

OpenAI's latency guidance supports fewer generated tokens, fewer dependent requests, independent parallel work and streaming; these are general principles, not evidence for Trailie's proposed numerical targets. [OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization).

## 4. Validation and limits

- Read both pasted documents, project rules, architecture/day-shape contracts, current runtime/guard/model/research/memory/pricing/capture code and existing audit reports.
- Independently extracted timings, token usage, cost and mutation outcomes from the five-turn local capture; counted the older 21-turn cohort.
- Measured current policy/tool schema bytes through provider-free module imports.
- Ran the provider-free day-shape probe described above; it confirmed the diagnostic ambiguity.
- Checked current official OpenAI documentation for model/tier claims, caching, multi-agent behavior and latency guidance.
- No new live performance measurements, production-state verification, browser checks or full regression suite were run. Existing reports' test results were not represented as fresh results.
