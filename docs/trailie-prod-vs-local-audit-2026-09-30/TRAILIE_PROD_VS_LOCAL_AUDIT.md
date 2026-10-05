# Trailie production versus local: forensic audit

Audit date: September 30, 2026. Deployment metadata and logs inspected around 16:30–16:44 UTC. **Audit only: no application edits, model requests, travel-provider requests, database writes, deployments, prompt edits, or new canaries.** Only these nine reports were added; production source was extracted into `/private/tmp` from its exact Git object.

## Answer

Production has a stronger travel-editorial contract, prefetches useful facts before asking Claude to answer, and streams visible prose. Local preserves better ownership, canonical state and source-integrity ideas, but loses much of the travel voice and introduces incompatible tool, planning, and map contracts. These are concrete implementation explanations for the reported experience; this audit does **not** establish that Claude intrinsically outperforms GPT-6 Sol.

Two initial hypotheses need correction: production's prompt is substantially **larger**, not smaller, at baseline; production is **not always one model call**, although its ordinary chat retrieval is backend-led rather than a model research loop.

## Exact production identity

| Surface | Authoritative evidence | Resolved revision |
| --- | --- | --- |
| Frontend | Vercel `get_deployment` on `www.nationalparksexplorerusa.com`; deployment `dpl_7g7RP2X5JtWupyovhHpGFudVjuDH`, READY, target production, source git, aliases include both public domains | `324faaaf68334db41ded82b8d8c777f6fd5de76a` |
| Backend | Render `list_services` maps `https://trailverse.onrender.com` to `srv-d3il0cpr0fns73cvjq0g`; `list_deploys` identifies `dep-d9p3tmjl550s73fo7tr0` as **live**, finished `2026-08-04T19:36:26.754236Z` | `324faaaf68334db41ded82b8d8c777f6fd5de76a` |
| GitHub corroboration | `github_fetch_commit` for the exact SHA confirms repository, commit and message | [Exact commit](https://github.com/KrishnaSathvik/TrailVerse/commit/324faaaf68334db41ded82b8d8c777f6fd5de76a) |
| Local | Working tree at HEAD `477b2f9604ea02f2ce09b3c8ba186700e2bd5b46`, with extensive tracked and untracked edits | Working files, **not HEAD alone** |

Frontend deployment URL: `trail-verse-53zvn25dh-shadowdevils-projects-ae938de8.vercel.app`. Repository: `KrishnaSathvik/TrailVerse`; production branch metadata says `master`, not `main`. Render root is `server/`, Standard plan, Oregon, one instance; auto-deploy is **off**. Vercel reports region `iad1`. Frontend's deployed Next config explicitly rewrites production `/api/*` to this Render backend: [next-frontend/next.config.mjs:162 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/next-frontend/next.config.mjs#L162). These metadata establish the deployed source revision; they do not reveal all environment overrides or private runtime payloads.

Links: [Vercel deployment](https://vercel.com/shadowdevils-projects-ae938de8/trail-verse/7g7RP2X5JtWupyovhHpGFudVjuDH), [Render backend](https://dashboard.render.com/web/srv-d3il0cpr0fns73cvjq0g).

Production source was read using `git archive 324faaaf68334db41ded82b8d8c777f6fd5de76a`; the local Git object and GitHub commit agree. No checkout, branch switch, fetch, reset, or source replacement was performed. The Vercel project-detail connector had a schema mismatch; resolving the live domain through deployment metadata succeeded independently.

## Evidence standard

- **Verified source:** behavior established by the resolved production source or current local working files. This proves code paths and contracts, not how often a model chooses them.
- **Observed historical:** saved earlier canary artifacts or existing production logs, with their dates and limitations.
- **Inference:** likely contribution to perceived quality; not a measured A/B result.
- **Unknown:** deployed environment overrides, exact production provider snapshot behind an alias, full production request token counts, comparative latency percentiles and total cost.

The protected production `/api/ai/providers` endpoint returned `Not authorized`; no login or chat was attempted. Source defaults to `claude-sonnet-5`, with environment and request overrides on applicable routes. Exact effective model/version for a sampled production turn remains **unverified**. Current local construction defaults to `gpt-6-sol`, medium reasoning; the local `.env` declares development. No running-process chat was invoked to prove a restarted process loaded these files.

## Behavior comparison

“Supported” below means a traced implementation exists, not guaranteed model success.

| Behavior | Production at deployed SHA | Current local model-first | Why it matters |
| --- | --- | --- | --- |
| Understands simple question | Buddy/compare prompt; backend intent and context heuristics | Raw current message reaches Sol; no legacy intent gate | Local removes brittle interpretation but also loses detailed product examples |
| Answers without unnecessary clarification | Decision-first comparison, answer yes/no first; targeted intake for vague plans | Generic answer-directly instruction; model chooses clarification | Production's specific answer-first contract is stronger; it still has conflicting intake rules |
| Research stops at right time | Backend fetch phase, bounded search fallback; no native research loop in SSE generation | At most 3 model calls, 12 executed read-tool invocations; final call has no tools | A hard stop is not necessarily a viable completion path |
| Current information reaches answer | Formatted live blocks plus structured availability/context injected before generation | Native tool outputs include evidence; empty filtered results can still say fulfilled | Evidence availability and successful transport are distinct |
| Natural response quality | Explicit voice, word ranges, tradeoffs, no generic closers, natural uncertainty examples | 1,645-character generic policy emphasizing tool/state obligations | Product personality and judgment were not carried into the new path |
| Travel judgment | Safety → feasibility → time → fitness → budget → preference; pacing/drive/trail examples | Hard checks on evidence and some constraints, little positive travel composition guidance | Valid state is not the same as an enjoyable trip |
| Creates real itinerary | Streaming JSON markers; extraction/correction/review; separate deterministic planner route | Mutation tool required; fresh multi-stop planning needs more dependency rounds than available | Ordinary place → route → proposal cannot complete under current loop contract |
| Map integration | Numeric coordinates become pins; Directions rendering and straight-line fallback | Canonical map expects provenance and explicit edges absent from simple creation schema | Local can accept a plan whose geography does not render |
| Remembers traveler | Form, saved plan metadata, favorites/visited, client session context, history heuristics | Owner-loaded trip history and typed trip memory; current-turn quotes | Local has stronger provenance; not equivalent to global traveler-profile memory |
| Handles follow-ups | Client sends history/current itinerary; active destination resolution | Stored history bounded at 40 messages/24,000 characters plus full saved plan | Local is authoritative, but prior-turn evidence is not reused by its tool guard |
| Changes correct trip/day | Primarily advisory edits; full replacement paths and non-CAS saves | Owner-scoped load, explicit trip selection, bounded patches, CAS; day scope optional | Preserve local integrity, but do not overclaim semantic day understanding |
| Tool calls per turn | 0 native research tool calls on stream; multiple backend API calls; optional output tool on nonstream | 0–12 reads executed, plus mutation proposal/correction; providers may retry | Tool count is not HTTP count or cost |
| Model calls per turn | 1 ordinary generation; up to 5 additional post-generation calls on applicable chat paths | 1–3 attempts total, no model retry/fallback | Neither “production always one” nor “current local unlimited loop” is true |
| Latency | Prose arrives before postprocessing finishes | Nonstream model requests; content published only after acceptance/persistence | Local's apparent silence can worsen even with fewer tokens |
| Cost | Streaming usage not captured by helper; full total unknown | Successful call pricing recorded; failures/provider costs can be unknown | No valid comparative dollars-per-success estimate exists |
| Failure behavior | Graceful facts failure, model fallback on nonstream, reviewer failure treated as passed | No accepted mutation on guard/CAS failure; generic terminal error; no automatic client retry | Production hides some failures; local exposes failure but can discard useful work |

See the focused reports for source references supporting each row.

## Highest-confidence findings

1. **Round budget prevents a fresh multi-stop canonical plan.** Evidence starts empty each turn. First round retrieves stops; second retrieves routes referencing their evidence IDs; the third disables `propose_trip_update`. Mutation and research cannot share a batch. More articulate model behavior cannot make these mutually incompatible requirements satisfiable. One-stop-per-day plans and memory-only proposals are exceptions, not a solution for normal itineraries.
2. **NPS coordinate shape is incompatible with the simple tool boundary.** NPS named activities expose `normalizedValue.coordinates.latitude/longitude`; simple route/weather endpoint resolution and stop copying read flat `normalizedValue.latitude/longitude`. Materialization preserves the claim without flattening. Good source data can therefore fail downstream grounding.
3. **Map contract is not produced.** The simple new-plan schema omits `coordinateSource`, `travelEdges`, and `activityGroups`; its guard adds no coordinate provenance. The canonical map requires an approved coordinate source and draws transfers only from explicit edges.
4. **Prompt size does not support the smaller-production hypothesis.** Production buddy base: 32,741 characters; architect: 34,401. Local base plus serialized OpenAI tool definitions: 9,779, before dynamic context and framing. Whole live requests were not captured.
5. **Production has a verified hidden failure.** Existing Render logs on September 25 contain 11 reviewer errors and one conflict-retry error for deprecated `temperature` in the returned sample. Reviewer catches return passed=true. This is existing production evidence, not a new test.
6. **Historical local evidence is version-sensitive.** Saved canary turn 2 made four model calls, which is impossible in today's three-call runtime. Its zero-evidence research loop is real historical evidence, not proof of identical current behavior.

## Deliverables

- [Production runtime](PRODUCTION_RUNTIME_FLOW.md)
- [Local runtime](LOCAL_RUNTIME_FLOW.md)
- [Prompts and input size](PROMPT_COMPARISON.md)
- [Model/tool loops](MODEL_TOOL_LOOP_COMPARISON.md)
- [State and memory](STATE_MEMORY_COMPARISON.md)
- [Itinerary and map contract](ITINERARY_MAP_OUTPUT_COMPARISON.md)
- [Latency and cost](LATENCY_COST_COMPARISON.md)
- [Final Trailie recommendation: five answers only](FINAL_TRAILIE_RECOMMENDATION.md)

## Audit limitations and preservation

No live conversations or benchmark were run. Existing user reports motivate the investigation, but this is not a controlled quality comparison. No production secrets or customer conversation contents were copied. Source hashes below identify the local files examined; the separate source-preservation check compared 1,965 application files before report writing and after it. Historical test reports were read, not rerun, and their offline passes are not evidence of live travel quality.

Tooling note: the session reports Vercel CLI 56.4.1 versus 61.1.0; upgrading with `npm i -g vercel@latest` is recommended for future CLI work. This audit used connector metadata and did not install or upgrade anything.

## Local source fingerprints
- `server/src/routes/modelFirstTrailie.js` — SHA-256 `c204da0f3bf473e989321f053fe3c3a820a3911b946e5b446c1327e9a32b113b`
- `server/src/config/trailieRuntimeSelection.js` — SHA-256 `b3bda6c4e5224ded440693db7f160c87b87d19a061a7204355eb6e49df1180d6`
- `server/src/services/trailieSimpleRuntime.js` — SHA-256 `5dbefa9af92f01dd7a3774c4cc9927b644b7e119af0c2a8907815a62a1257f8d`
- `server/src/services/trailieSimpleModel.js` — SHA-256 `36260118f023f0bb254f57293fb43c11fde14e2fa28ccc3702ce30ff71f9eed9`
- `server/src/services/trailieSimpleTools.js` — SHA-256 `178648e1631e0fc62047349cbf30eb7b97fce143d4322fe6657b5eff1cf7b9bb`
- `server/src/services/trailieSimpleGuard.js` — SHA-256 `d58ee2b39a0f5255fd7e07b78067edfc45d719c9c615f719488c562cf988ef9c`
- `server/src/services/trailieSimpleStore.js` — SHA-256 `27fdb18676dcb0764704a5a3d7694503acb4b8fc7aa20964bd41c3d3f241ae35`
- `server/src/services/trailieSimpleGuestStore.js` — SHA-256 `82b8da12636551602d6fd522e2e4b1d78c324805872baa1c52aa834fe2ce0a3d`
- `server/src/services/providers/npsEvidenceProvider.js` — SHA-256 `6d965add5e4b106d6a832715d852bf6152a44a4ba8880b48d14f7cdbaf32cea9`
- `next-frontend/src/lib/itineraryMapStops.js` — SHA-256 `7bc73ae5eacd454be712dc55ecbb8b24e869e220f78207debf8466619879642b`
- `next-frontend/src/services/aiService.js` — SHA-256 `dff71febc1a98e840b9c7563baf72cf82fa2cb3c5def6e206f5fa55b5287558a`
- `next-frontend/src/components/plan-ai/TripPlannerChat.jsx` — SHA-256 `bb687b4381efc7659dc18944405b22dc11d6ee7a1838f124133bf1984110999c`

## Report verification

All nine requested reports exist. Every relative report/source link and production GitHub source path/line anchor was checked against the extracted revision. SHA-256 comparison found **0 changes across 1,965 application files** during report writing. No application tests were run, because this pass made no application changes and did not authorize live calls.
