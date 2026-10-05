# Stage 11 — Tool-First Structured Itinerary Generation

**Status:** Implemented TDD-first. **Not committed, not pushed.** No reviewer
enforcement, no Plan AI redesign. Default mode is `legacy` — production behavior
is unchanged until `TRAILIE_ITINERARY_GENERATION_MODE=tool_first` is set.

Trailie no longer depends on a JSON block surviving the end of a long stream:
in tool-first mode it builds and finalizes the real itinerary first, then
explains that exact plan.

---

## 1. Phase A / Phase B architecture

```text
facts + constraints
→ Phase A: required create_itinerary tool call (NO prose)   [structuredItineraryGenerator]
→ validate / dedupe / reject ambiguous
→ finalize: normalize coords → constraints → correct → drive-enrich
            → park identity → feasibility → score → FREEZE     [finalizeItinerary]
→ Phase B: stream prose grounded in the frozen plan           [proseFromItineraryPrompt]
→ canonical response (preFinalized fast path)
```

Non-itinerary requests never enter Phase A — they remain a normal single-call
stream. The two phases are never mixed in one generation, so provider tool-stream
differences and post-tool truncation cannot corrupt the plan.

New modules: `config/itineraryGenerationConfig.js`,
`utils/structuredItineraryDecision.js`,
`services/structuredItineraryGenerator.js`, `utils/finalizeItinerary.js`,
`prompts/proseFromItineraryPrompt.js`,
`services/toolFirstItineraryOrchestrator.js`.

## 2. Provider adapter behavior

`generateStructuredItinerary({ provider, model, messages, systemPrompt,
toolSchema, … })` returns a normalized result
`{ status, itineraryData, toolCallId, provider, model, stopReason, usage,
validationErrors }`. The route/pipeline consume ONLY this — never raw
Anthropic/OpenAI tool events.

- **Anthropic adapter** — `tool_choice: { type:'tool', name:'create_itinerary' }`
  forces the call; reads `content[].tool_use` blocks; maps `stop_reason`.
- **OpenAI adapter** — `tool_choice:{type:'function',function:{name}}`; parses
  `message.tool_calls[].function.arguments` (JSON string); maps `finish_reason`.

No client → `unsupported`. Provider throw → `provider_error` (never propagates).

## 3. Tool-call validation and ambiguity handling

`normalizeToolCalls` (pure):

| Case | Result |
|---|---|
| exactly one valid `create_itinerary` | `complete` |
| no tool call | `missing_tool` (or `truncated` if stop reason was cut off) |
| unknown tool name | `malformed_tool` (`unknown_tool`) — arbitrary tools never executed |
| unparseable / invalid shape | `malformed_tool` |
| truncated stop reason + incomplete args | `truncated` |
| identical duplicate calls | deduped → `complete` |
| conflicting distinct calls | `malformed_tool` (`ambiguous_tool_calls`) — never picked by order |
| payload > `maxToolPayloadBytes` | `malformed_tool` (`tool_payload_too_large`) |

## 4. Finalization order (`finalizeStructuredItinerary`)

Deep-clones the tool payload (never mutates the caller), then:
normalize coordinates (tool coords treated as untrusted `model_estimate` →
`0,0`/invalid become null) → constraint validation → `correctItinerary`
(bounded passes) → driving-time enrichment → park-identity enrichment →
feasibility (on the FINAL corrected plan) → scoring → **deep-freeze**. The frozen
plan is authoritative; the `preFinalized` path proves prose/reviewer never mutate
it. `parkCode`, `parkName`, coordinate provenance, stop IDs, day identity,
corrections, and final feasibility issues are preserved.

## 5. SSE lifecycle (streaming, tool-first)

```text
thinking(stage: building_structured_itinerary)
thinking(stage: validating_trip)
thinking(stage: writing_response)
chunk: visible prose            ← first visible text is Phase B only
stream_end
done: canonical response + FROZEN itinerary + sanitized generation meta
```

No visible chunk is emitted before Phase A validation finishes. Partial tool
arguments, tool-call IDs, raw arguments, schema errors, and `[ITINERARY_JSON]`
markers never reach SSE. Client disconnect (`signal`) aborts both phases. `done`
does not wait for shadow review (Stage 9); `contentUnchanged` still compares
canonical displayed prose only.

## 6. Recovery behavior

- **One bounded structured retry** on recoverable failures
  (`truncated`/`provider_error`/`missing_tool`), never an unbounded loop
  (`structuredMaxAttempts = 2`). Verified: a persistently-failing provider is
  called exactly twice.
- **All structured attempts fail → `prose_only`**: stream a prose-only response,
  `hasItinerary:false`, **no invented plan, no inline JSON extraction**
  (`disableInlineItineraryExtraction` forces `itineraryData:null` and strips any
  stray `[ITINERARY_JSON]` from prose). Explicit `itineraryGenerationMode:
  'prose_only'` metadata.
- **Prose-phase failure after itinerary success** keeps the valid frozen
  itinerary and uses the existing bounded provider fallback for prose.

## 7. Rollout configuration

`TRAILIE_ITINERARY_GENERATION_MODE=legacy|tool_first` — missing/invalid →
`legacy`. In `tool_first` the legacy `[ITINERARY_JSON]` mandate and legacy tool
instruction are NOT injected into the prompt (spec §8); Phase B forbids JSON
output. Non-itinerary requests behave identically in both modes. There is no
silent fallback from `tool_first` to inline trailing JSON. Actual mode is
recorded in internal metadata. Both the authenticated streaming and non-streaming
routes use the same generator + finalization pipeline (spec §12); they differ
only in prose delivery (deltas vs. complete text).

## 8. Cost / latency observability

`timings` records `structuredDurationMs` and `proseDurationMs` separately; usage
is captured per phase (`structuredUsage`). Sanitized metadata carries only
status/count/provider/duration fields — never raw tool arguments, full prompts,
provider events, full validation payloads, or chain-of-thought (verified by
test). These stay separate from asynchronous reviewer cost. No "faster" claim is
made — the fixtures measure the two phases; real latency is a Stage 13 eval.

## 9. Focused and full-suite results

New/updated suites (all pass):

| Suite | Coverage |
|---|---|
| `structuredItineraryGenerator.test.js` | tool validation, dedupe, ambiguity, adapters, provider_error/unsupported |
| `finalizeItinerary.test.js` | freeze, no-mutate, coord normalization, feasibility-on-final |
| `toolFirstItineraryOrchestrator.test.js` | Phase A/B, thinking order, bounded retry, prose_only, metadata sanitizer, Phase B prompt |
| `structuredItineraryDecision.test.js` | requires/skip decision, mode config fail-safe |
| `toolFirstIntegration.test.js` | preFinalized uses frozen plan unchanged; prose-only never inline-extracts |

Focused Stage 11 surface: **5 suites / 37 tests**, plus regression on
`trailieRouteContract`, `requestPathReviewScheduling`, `canonicalResponse`,
`extractItineraryJSON`, `itineraryOutputInstruction`.

Full suite (`npx jest` from `server/`): **85 suites / 776 tests pass.** The 7
failing suites are the same pre-existing email-JSX-transform / live-NPS failures
that fail identically without Stage 11 — **zero new failures**.

## 15. Stage 8–10 invariants preserved

Canonical response/plan stay atomic; content/itinerary hashes stable (tool-first
uses the same `buildCanonicalOutbound`); frontend persists the server plan
verbatim; no double writer; shared artifact stripping; **no invented
coordinates** (tool coords normalized, `0,0`→null); feasibility warnings come
from the FINAL frozen itinerary; multi-park facts remain complete and scoped;
shadow review stays async/observational and `done` never waits for it; share
stays plan-only; title/status cannot piggyback on response saves.

## 10. Remaining work for Stage 12 (prose ↔ itinerary consistency)

- **Phase B prose is instruction-grounded, not yet verified.** The prompt forbids
  adding/restoring stops and changing logistics, but nothing yet *checks* that the
  streamed prose matches the frozen plan. Stage 12 should add a deterministic
  prose↔itinerary consistency evaluation (e.g., stop-name/day coverage, absence of
  removed-stop mentions) using the frozen plan as ground truth.
- **Anonymous routes** still use the legacy path; wiring them to the orchestrator
  is mechanical (same seam) and can ride Stage 12/13.
- **Real latency/cost** of two phases is unmeasured in production — a Stage 13
  eval gate should decide when to flip `tool_first` on.
- Frontend rendering of `itineraryGenerationMeta` / new `thinking(stage)` events
  is carried in the payload but not yet displayed.
```
