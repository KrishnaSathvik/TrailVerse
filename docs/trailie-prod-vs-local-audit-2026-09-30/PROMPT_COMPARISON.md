# Prompt and input comparison

Production means deployed commit `324faaaf68334db41ded82b8d8c777f6fd5de76a`. Local means the current simple runtime. This comparison measures **compiled text**, not source-file size, and distinguishes fixed instructions from whole requests.

## What production actually gives Claude

Production's buddy prompt explicitly teaches a travel product: lead with a pick, justify its tradeoff, answer yes/no first, shorten comparisons, give realistic hiking details, name what to skip, preserve a conversational voice, and stop when the question is answered. It includes examples for natural planning openers and inline uncertainty. Its priority order is safety, feasibility, time, fitness, budget, preference. These are useful product decisions, not obsolete architecture. [server/src/prompts/claudeBuddyPrompt.js:9 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/prompts/claudeBuddyPrompt.js#L9); [server/src/prompts/coreTrailiePolicy.js:56 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/prompts/coreTrailiePolicy.js#L56).

Claude is not always given this buddy prompt: specific itinerary requests use `buildOpenAIArchitectPrompt`, selected by response mode independent of provider. Both include shared safety/context/product policy. A comparison uses buddy voice. [server/src/utils/trailieResponseMode.js:30 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/utils/trailieResponseMode.js#L30).

The assembled prompt adds current date, client session context, saved preferences, explicit user constraints, preflight/conflicts, relevant live fact blocks, data availability, discovery candidates, active-trip state, structured JSON context, and task-specific reminders. Profile history is appended afterward. Production is therefore neither a tiny prompt nor a clean single-context representation. Facts and instructions can be repeated across prose and structured blocks. [server/src/routes/ai.js:1087 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L1087); [server/src/routes/ai.js:1460 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L1460).

### Preserve the judgment; remove contradictions

| Useful production instruction | Why it helps | Problem to avoid carrying forward |
| --- | --- | --- |
| Decide first, then explain tradeoff | Gives a useful answer without interrogation | “Always pick” must not override genuinely missing safety-critical facts |
| Natural opener and logistics | Makes a trip feel planned for a person | Rigid duplicated opener/format mandates can become templates |
| Stop after answering | Avoids agentic “I can research more” loops | Discovery-specific mandatory follow-up bullets can conflict |
| Known/Unknown profile framing | Reduces invented traveler attributes | Personalization overlay also asks for a greeting/profile reference; later instructions suppress it |
| Live data beats assumptions | Grounds current claims | “Never hedge” and direct negative claims conflict with unknown-data semantics |
| Structured itinerary accompanies planning | Powers real artifacts | Broad “always JSON” conflicts with narrow-first intake |

Other production weaknesses: estimated coordinates are explicitly allowed; permit example instructs “No permits required” if permits are absent; insider rhetoric implies personal experience and encourages unsupported certainty. Static crowd data and broad timing rules are not current access evidence. Preserve travel judgment without these claims. These are internal prompt findings, not travel advice. [server/src/prompts/claudeBuddyPrompt.js:215 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/prompts/claudeBuddyPrompt.js#L215).

## What local gives Sol

The fixed instructions say “thoughtful U.S. travel companion,” answer directly, batch brief research, distinguish evidence from unknowns, cite current facts, obey memory quotes, ground stops/routes, use bounded patches, and never claim an unaccepted save. This is good operational discipline but lacks production's concrete travel-composition and response-quality guidance. The old `trailiePromptV2` files do **not** supply the active simple runtime prompt. [server/src/services/trailieSimpleRuntime.js:7 (local)](../../server/src/services/trailieSimpleRuntime.js).

The tool descriptions require model knowledge of provider selection, topic codes, temporal scopes, evidence IDs, coordinate dependencies, query provenance, plan schema, memory groups and patch semantics. Thus a shorter prompt still places more orchestration responsibility on the model. Removing a large legacy prompt did not automatically preserve Trailie's product behavior.

## Actual fixed-input measurements

Measured offline from pure prompt builders and the exact current tool-schema transformation; no providers constructed or contacted for these measurements. JavaScript string length counts UTF-16 code units; UTF-8 bytes are also reported. `characters / 4` is a rough sizing heuristic **not a tokenizer count**, and should not be used for billing or cross-model performance claims.

| Exact measured component | Characters | UTF-8 bytes | Rough chars/4 |
| --- | ---: | ---: | ---: |
| Production compiled buddy base | 32,741 | 32,998 | 8,186 |
| Production compiled architect base | 34,401 | 34,653 | 8,601 |
| Local fixed INSTRUCTIONS | 1,645 | 1,645 | 412 |
| Local OpenAI `read_travel` tool JSON | 2,234 | 2,234 | 559 |
| Local OpenAI mutation tool JSON | 5,897 | 5,897 | 1,475 |
| Local serialized two-tool array | 8,134 | 8,134 | 2,034 |
| Local fixed instructions + tool array | **9,779** | **9,779** | **2,445** |

Production SSE supplies no tool schemas; nonstream architect can additionally supply `create_itinerary`. Local's final synthesis omits tools, but still receives its saved context and accumulated native conversation/tool results.

### Whole-request construction and limits

| Component | Production | Current local |
| --- | --- | --- |
| Fixed base | Buddy or architect above | INSTRUCTIONS above |
| History | Over 20 messages: latest 15 nonsystem; heuristic summary has delivery caveat | Latest 40, 24,000 chars total, 12,000 per item |
| Saved plan | Client-formatted itinerary plus backend saved form/context | Full serialized canonical plan, no separate cap |
| Traveler | DB favorites/visited, client history/preferences, merged trip state | Trip-local planningState and history; no DB profile enrichment |
| Live facts | Backend-condensed text and structured context before model | Tool results after model requests; max 8 rows / 12 KB evidence per result |
| Subsequent calls | Conditional extract/retry/review payloads, different shapes | Same base/context, accumulated native outputs/results resent |
| Current message | Client message history | Last user message or body message; 30,000-char limit |

A local turn with 12 reads could accumulate roughly 144 KB of evidence alone before framing, plus native outputs, plan and memory. That is a **configured upper-budget illustration**, not an observed prompt or a forecast. Production's dynamically assembled full prompt has no comparable measured total in this audit.

Existing canary records show provider-reported input token counts of 1,706 on greeting; 1,748 → 2,030 → 2,215 → 2,419 on historical Glacier turn 2; 1,927 on turn 3's first successful request. Those recordings precede today's schema/loop revision and are **not** measurements of today's 9,779-character baseline. Exact production input tokens and paired same-scenario local tokens remain unavailable.

## Conclusion supported by evidence

The baseline-size hypothesis is contradicted by the measurements. The **role burden** hypothesis is supported by the source: production supplies curated facts and editorial decisions; local asks the model to orchestrate infrastructure and writes. Dynamic context could still become large locally, but no captured production/local pair establishes that it caused the reported degradation.
