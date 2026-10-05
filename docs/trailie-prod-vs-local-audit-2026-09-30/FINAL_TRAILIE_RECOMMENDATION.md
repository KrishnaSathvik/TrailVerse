# Final Trailie recommendation

## 1. Why production currently feels better

The strongest source-backed explanation is **product guidance and a more direct answer path**, not a proven Claude-versus-Sol advantage. Production teaches Trailie to choose, explain tradeoffs, pace a trip, answer before asking optional questions, use natural uncertainty, and stop after answering. The backend supplies relevant facts before generation. Streaming exposes useful prose while later work finishes.

Its base prompt is 32,741 characters in buddy mode and 34,401 in architect mode, versus local's 9,779 characters of fixed instructions plus tools. Production is not winning because its baseline prompt is smaller. It is doing more of the travel preparation and orchestration outside the model. Production can still run extraction, review and repair; “retrieve once → one Claude call” is only a simplified ordinary-answer path. See [prompt comparison](PROMPT_COMPARISON.md) and [production flow](PRODUCTION_RUNTIME_FLOW.md).

This explains plausible causes of the reported feel; no controlled live comparison establishes model superiority, and production's exact environment-selected model remains unverified beyond source defaults.

## 2. Why production still is not the experience you want

A fluent answer is not yet a coherent, reliably saved travel artifact. Production emits prose and itinerary JSON separately, can correct one after the other has appeared, permits estimated coordinates, and renders map geometry without local's source provenance requirement. Existing itinerary edits are explicitly framed as advice rather than guaranteed canonical mutations.

Persistence has multiple writers and the stream path does not await its plan save. The plan-save helper lacks an owner/version predicate. Existing production logs show review requests failing on a deprecated parameter, while the reviewer reports a pass on failure. Its strong voice also contains contradictory instructions and unsafe shortcuts such as inferring “no permits” from missing permit data. Preserve its useful travel judgment, not its certainty or hidden failure behavior. See [artifact comparison](ITINERARY_MAP_OUTPUT_COMPARISON.md) and [state comparison](STATE_MEMORY_COMPARISON.md).

## 3. Why local currently fails

Local has real integrity improvements, but several connected contracts do not permit the intended product behavior:

- **Research and mutation compete for an impossible round budget.** A fresh multi-stop plan needs place retrieval, dependent route retrieval, then a proposal. Call 3 forbids all tools; research and mutation cannot share a batch.
- **Provider output does not match tool consumers.** NPS activity coordinates are nested, while route/weather grounding and stop copying read flat fields.
- **The simple plan does not satisfy the current map contract.** Coordinate provenance and explicit transfer edges are not produced; finite coordinates alone are insufficient for canonical pins.
- **Operational discipline replaced much of the travel personality.** A short generic companion instruction does not preserve production's concrete judgment, pacing, tradeoff and response examples.
- **Failure policy can erase the completion path.** An unsupported read forces prose-only synthesis and prevents independent memory/plan proposals; a late rejected mutation has no usable correction slot.
- **The interface amplifies waiting.** Sol calls are nonstreaming and all successful content waits for commit. The user sees little useful progress through the dependency chain.

Historical canary records also show zero-evidence research and a later model failure, but those precede today's loop/schema revisions. They support the history of degradation, not a measured current failure rate or a model diagnosis. Offline replay passes establish transport/state properties, not useful travel answers. See [loop comparison](MODEL_TOOL_LOOP_COMPARISON.md).

## 4. What exact pieces should form final Trailie

| Layer | Keep from production | Keep from local | Final composition |
| --- | --- | --- | --- |
| Understanding and voice | Decision-first travel judgment, specific tradeoffs, natural planning and concise answers | Model sees traveler words without legacy semantic gatekeeping | One compact travel policy with examples; answer directly when information suffices |
| Research | Backend-managed parallel fetching, concise facts, explicit missing-data state | Source authority, freshness, native tool continuation | Model asks a travel question; backend handles provider/topic/coordinate dependencies and returns answer-ready facts |
| Research termination | A finite retrieval phase | Explicit resource limits and cancellation | Bound research separately from ability to synthesize or propose a valid artifact |
| Traveler context | Relevant form, favorites/visited and trip continuity | Owner-loaded history, typed quoted memory, stale-location invalidation | Compact relevant traveler context; separate explicit facts, assumptions and trip-specific state |
| Plan composition | Why these experiences, logistics, realistic pace, useful alternatives | Stable canonical IDs, source-bound stops/routes, hard constraints | One rich canonical itinerary with day purpose, timing, overnight base, requirements and explicit transfer relationships |
| Map | Easy access to day/stop maps | Canonical projection and honest coordinate authority | Backend emits normalized verified coordinates/provenance; all map surfaces derive from the accepted plan |
| Refinement | Natural explanation of changes | Patches, untouched-day preservation, owner and version checks | Explicit trip/day scope where available; atomic targeted edit and matching explanation |
| Presentation | Progressive useful feedback | No false saved claim; canonical identity | Stream safe conversational/progress content if supported, but publish accepted plan identity only after commit |
| Persistence | Existing collections and useful account context | Single server-owned write, CAS, hashes, guest ledger | One durable final result, no client/backend duplicate writer |
| Observability | Source-aware progress | Per-attempt usage, failure codes, tool provenance | Measure first useful content, accepted-artifact time and total cost separately; unknown stays unknown |

A representative final path should be: traveler message + relevant saved context → model direct answer or bounded travel-data request → backend completes dependent retrieval/normalization → model composes answer and optional canonical proposal → deterministic hard validation → atomic commit → matching itinerary/map/explanation. Ordinary conversation needs neither a plan nor a memory mutation. A genuine unknown should produce useful conditional advice, not automatic expansion of research.

Keep GPT-6 Sol as the current local model while designing this contract; this audit provides no evidence for another model swap. Do not interpret that as authorization to change code or run calls. This is an architectural recommendation, not an implementation started by the audit.

## 5. What should be removed rather than repaired

- **Provider plumbing as the model's user-facing job:** raw provider selection, topic/provenance assembly and multi-step coordinate dependency choreography should live behind coherent backend tools.
- **One shared research/output budget:** remove the rule that stopping research also disables an otherwise legitimate plan or memory proposal. Do not replace it with an unlimited agent loop.
- **Competing itinerary authorities:** retire JSON-marker parsing, client reconstruction and independently mutable map data as primary contract mechanisms.
- **Success-before-save and silent pass-on-error:** retire unawaited canonical persistence and reviewer-error-as-pass semantics.
- **Guessed geography and missing-data negative claims:** remove estimated coordinates masquerading as resolved pins and “no permits” inferred from absent data.
- **Duplicate interpretive/repair layers:** do not restore the local legacy intent, sufficiency, semantic-day scoring and repair cascade wholesale. Keep hard invariants where their evidence and purpose are explicit.
- **Repeated full context without a purpose:** remove redundant representations and incidental provenance from repeated prompt input; retain compact facts and durable references.
- **Quality claims based on transport tests:** remove any equation of replay success with naturalness, live retrieval success, itinerary usefulness or comparative model quality.

The final system should preserve production's ability to help the traveler and local's ability to tell the truth about what was retrieved, changed, and saved.
