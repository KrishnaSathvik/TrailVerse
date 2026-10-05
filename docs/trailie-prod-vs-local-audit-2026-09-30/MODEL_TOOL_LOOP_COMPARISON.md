# Model and tool-loop comparison

## Production: backend research, then generation, with conditional postprocessing

For normal streaming chat:

```text
resolve request / fetch relevant context (possibly many parallel HTTP calls)
→ Claude text stream, no research tools
→ optional conflict retry
→ optional missing-JSON extraction
→ deterministic correction
→ optional regeneration
→ drive enrichment
→ conditional review → optional repair
→ done
```

Ordinary factual chat can be one model call. An itinerary normally attempts review as well. At application dispatch-site level a streaming turn can execute **1 + 1 conflict + 1 extraction + 1 regeneration + 1 review + 1 repair = 6** model calls if the corresponding branches occur. This is not an empirical maximum for a whole user action: SDK retries and client nonstream fallback can increase request attempts. Nonstream generation can traverse a three-model Claude fallback list. [server/src/routes/ai.js:1980 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L1980); [server/src/services/aiProviderStream.js:1 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/aiProviderStream.js#L1).

`create_itinerary` on the nonstream architect path is a structured **output** tool, not an iterative search tool. The dedicated `/plan-itinerary` service is a different deterministic planner with narrative refinement; do not use its call count to describe chat.

## Local: native model-directed reads and writes

```text
call 1: answer OR research batch OR exclusive mutation
call 2: normally answer; exceptional research batch OR exclusive mutation
call 3: tools=[]; tool_choice=none; answer only
```

The code permits 3 calls total, 12 executed reads total, one correction counter. Independent reads are parallel. It uses OpenAI Responses function-call/output items, not flattened role messages. No hidden semantic router or repeated legacy repair pipeline is invoked per turn. Model SDK retries are disabled. Travel-provider fetches are different: the broker can retry a classified retryable error once and may coalesce equivalent in-flight requests. Provider HTTP counts need not equal tool counts. [server/src/services/trailieSimpleRuntime.js:81 (local)](../../server/src/services/trailieSimpleRuntime.js); [server/src/services/evidenceBrokerService.js:237 (local)](../../server/src/services/evidenceBrokerService.js).

### Finding 1: ordinary plan completion is structurally blocked

For a fresh plan with two or more stops on a day:

| Required step | Why required | Earliest slot |
| --- | --- | --- |
| Retrieve acceptable stop evidence | Model cannot supply its own trusted stop identity | Tool-enabled call 1 |
| Retrieve route with those evidence IDs | Endpoint resolver reads only prior batches' evidence | Tool-enabled call 2 |
| Propose plan using both stop and route evidence | Mutation cannot run alongside another action | Call 3, but mutation is disabled |

Evidence map starts empty even when a prior saved plan exists. The prior plan is context, not trusted evidence seeded into this map. The route guard requires a route for each adjacent pair on a changed day. Therefore current code cannot complete this normal dependency chain. Memory-only changes and plans with just one stop per day can use shorter paths; this does not invalidate the multi-stop finding. [server/src/services/trailieSimpleRuntime.js:39 (local)](../../server/src/services/trailieSimpleRuntime.js); [server/src/services/trailieSimpleRuntime.js:110 (local)](../../server/src/services/trailieSimpleRuntime.js); [server/src/services/trailieSimpleGuard.js:209 (local)](../../server/src/services/trailieSimpleGuard.js).

This is not a recommendation to remove all limits or add an unbounded fourth/fifth/sixth model turn. The dependency work should be completed behind a purpose-built backend operation, and output/mutation eligibility should not be conflated with permission to continue research.

### Finding 2: “one correction” is conditional

A mutation rejected on call 1 can be corrected on call 2. A mutation rejected on call 2 receives a tool result explicitly indicating zero remaining correction opportunities, and call 3 cannot propose a correction. The nominal `maxCorrections=1` is not a guarantee of one usable correction after research.

### Finding 3: tool failure disables unrelated completion tools

Any nonfulfilled read sets `synthesisOnly=true`. This prevents both further research **and** memory/plan proposals. A batch containing useful facts and one unsupported request can therefore answer only in prose, even if a separate memory update could safely succeed. Budget exhaustion behaves similarly. Useful facts are not automatically absent, but useful structured completion is unavailable.

### Finding 4: transport success can hide empty evidence

`read_travel` preserves the broker's status after filtering candidates by exact topic, observation/freshness, and size. A fulfilled provider fetch can return zero usable rows, which does not activate the nonfulfilled stop condition. The instructions may encourage another research round without enough explanation of what changed. The historical canary exhibits this failure in an earlier revision; the current caps and topic enum differ. [server/src/services/trailieSimpleTools.js:103 (local)](../../server/src/services/trailieSimpleTools.js).

### Finding 5: coordinate contract mismatch

NPS activity normalization places coordinates under `normalizedValue.coordinates`; the simple endpoint resolver requires flat `normalizedValue.latitude/longitude`. `materializeCandidate` preserves `candidate.claim` unchanged. A valid NPS activity therefore does not automatically become a usable route/weather/astronomy endpoint. NPS destination identity also has no coordinates. Additional geocoding can supply coordinates-only evidence but does not by itself authorize a visitable stop or satisfy a route bound to that stop's exact evidence ID. [server/src/services/providers/npsEvidenceProvider.js:317 (local)](../../server/src/services/providers/npsEvidenceProvider.js); [server/src/services/trailieSimpleTools.js:74 (local)](../../server/src/services/trailieSimpleTools.js); [server/src/services/evidenceBrokerService.js:108 (local)](../../server/src/services/evidenceBrokerService.js).

## Historical evidence: what it does and does not show

Saved canary turn 2 (September 30 UTC, directory dated September 29) requested Glacier identity, activities, roads, then a Brave request whose topic was free text. The first three tool outputs were fulfilled but had zero evidence; the fourth returned unsupported_topic. Four model calls produced no visible answer before cancellation. Turn 3 retrieved 56 evidence rows but ended model_failed on its second model attempt; the saved artifact does not establish the upstream error cause. Today's exact-topic filter, 8-row cap, topic enum and 3-call limit are different.

Sources: [turn 2](../../artifacts/trailie-simple-canary-2026-09-29/turn-2.json), [turn 3](../../artifacts/trailie-simple-canary-2026-09-29/turn-3.json). No replay or live call was initiated. Do not extrapolate a current failure rate or blame a specific provider error without the missing error record.

## Recommended retained behavior

Keep native tool continuation and hard identity checks. Move provider/topic/coordinate dependencies behind coherent travel reads; return compact answer-ready observations and usable artifact identities. Reserve a completion/write opportunity separately from research budget. Stop research on sufficiency or unsupported capability without destroying otherwise valid conversation/memory completion. Preserve a single accountable final commit.
