# Trailie / TrailVerse — implementation inventory

**Date:** 24 September 2026  
**Source:** Current working tree plus dated audits. Production Render dashboard flags and deployed SHA were not sampled.  
**Use:** Decide which Applied AI / AI Systems claims the code actually supports.

This is an inventory of what is implemented. It is not a production-cutover approval.

## Verdict

TrailVerse is a production web product (Next.js on Vercel, Express + MongoDB on Render) with a large deterministic trip-planning runtime, live park data, and three separate AI surfaces. Website Trailie is a staged pipeline with a bounded OpenAI GPT-6 escalation ladder, JSON-schema itinerary tools, an evidence broker, and canonical trip persistence. It is not an autonomous tool-calling agent, and it does not use retrieval-augmented generation.

The external MCP server is real, remote, and used by ChatGPT and Claude. Website Trailie does not call it. MCP `plan_trip` hits a separate deterministic fast planner, not the GPT-6 website pipeline.

Offline conversational gates passed on 24 September (497/497). Live qualification has not. The latest paid core run (`final-check-1`) was not 4/4. Do not claim production-qualified itinerary quality.

## 1. Current architecture

| Layer | What runs |
|---|---|
| Frontend | Next.js App Router, React 19, Tailwind v4, TanStack Query. `next-frontend/`. Local `http://127.0.0.1:3000`. |
| Backend | Express, Mongoose, JWT, Socket.IO, Swagger at `/api-docs`. `server/`. Local `http://localhost:5001/api`. |
| Database | MongoDB. Required env `MONGODB_URI`. |
| Queues | No Bull, Agenda, or dedicated worker service. `setInterval` schedulers in `server.js` for blog publish, daily feed, and analytics snapshots. Shadow review is an in-process Mongo job queue, off by default. |
| Deploy | Frontend: Vercel. API: Render web service `trailverse` (`server/render.yaml`, Oregon, Node, 1536 MB). MCP: Render `trailverse-mcp` (`mcp-server/render.yaml`, Python 3.12.7, Oregon, starter). No Dockerfile in repo. |
| iOS | Native SwiftUI client of the same streaming chat routes. Rendering parity with web is not certified. |
| CI | `.github/workflows/test.yml` (frontend tests, server coverage, Playwright, integration, lint, npm audit) and `ssr-audit.yml`. |

Trailie sits inside TrailVerse as the planner at `/plan-ai`. Parks, discover, maps, blog, events, and compare are ordinary product surfaces. Trailie reads them through the Express evidence/prefetch path. Guests get 5 messages / 48 hours. Logged-in users persist `TripPlan` documents and can use web search.

## 2. LLM architecture

**Website chat generation (current router `trailie-gpt6-router`):**

| Tier | Model | Reasoning | When |
|---|---|---|---|
| Deterministic | none | — | Exact facts: fee, sunrise, fee-free date, alert count, coordinates, hours |
| Luna low | `gpt-6-luna` | low | Quick general Q&A with complete evidence and no hard constraints |
| Sol low | `gpt-6-sol` | low | Normal conversation, compare, discovery |
| Sol medium | `gpt-6-sol` | medium | Itinerary, planning, edits, ≥7 days, ≥2 hard constraints, repair, high ambiguity |
| Astra medium | `gpt-6-astra` | medium | Only after Sol medium fails validation, one same-model retry is exhausted, and the failure is not locally repairable |

Source: `server/src/config/trailieModelRouter.js`, `server/src/services/trailieModelRoutingService.js`.

Escalation on validation failure: Luna → Sol low → Sol medium → Astra → `model_escalation_exhausted`. Same-model retry at most once, and only on Sol when `locallyRepairable`. OpenAI adapter `maxRetries: 0`. Provider exceptions do not fall over to Claude.

**Claude is not on the generation ladder.** It still exists for:

- Production lite helpers (`trailieLiteComplete` → canonical `claude-sonnet-5`) used by web-search classify/summarize and the MCP fast-planner intro. Local non-production lite calls are hard-coded `gpt-6-luna`.
- Shadow section review (`CLAUDE_REVIEWER_MODEL`, default Sonnet 5). Sample rate 0 and worker disabled unless `TRAILIE_REVIEW_WORKER_ENABLED=true`. Review cannot edit the saved plan.
- Legacy helpers (`claudeService`, `openaiService` `gpt-5.4-mini` / `gpt-4.1`) used by older paths such as daily feed, not the current chat bridge.

The 23 September runtime audit still describes a GPT-5.6 Luna/Terra/Sol ladder. That document is a snapshot. The router in this tree is GPT-6 only. Pricing registry still lists older models and was called stale by that audit.

**Structured output.** Itineraries use OpenAI function tools (`create_itinerary`, patch, pushback, and contained repair tools) defined in `server/src/utils/itineraryToolSchema.js`. Default `strict: false` unless `TRAILIE_CREATE_ITINERARY_STRICT` is on. No Zod on this path.

**Context.** Prompt v2 budgets in `server/src/prompts/trailiePromptV2.js`: core 2200, contract 800, evidence 1200, trip state 800, history 900, user 800, total 6400 tokens. Overflow shrinks history, then trip state, then evidence, then user. Core/contract overflow throws `prompt_v2_budget_infeasible`. Output budget adds reasoning headroom (up to 6000 for Sol/Astra itinerary turns).

**Caching.** Explicit OpenAI prompt-cache breakpoint on the public prefix, TTL 30 minutes, `store: false`. Usage records cache read/write tokens. Evidence broker has its own fresh/stale cache. Full chat completions are not cached for replay.

**Runtime gate.** Local chat is on. Production requires `TRAILIE_V2_RUNTIME_ENABLED=true` or chat returns 503. `server/render.yaml` does not set that flag. Deployed equivalence is unknown.

## 3. MCP

One product MCP server: `mcp-server/`, Python FastMCP, `transport="streamable-http"`, `stateless_http=True`, endpoint `/mcp`.

| | Local | Production |
|---|---|---|
| URL | `http://localhost:8000/mcp` | `https://trailverse-mcp.onrender.com/mcp` |
| Health | `GET /health` | same |
| Backend | `TRAILVERSE_API_BASE` | `https://trailverse.onrender.com` |

**Tools (5), all `readOnlyHint: true`:**

| Tool | Writes? | Backend |
|---|---|---|
| `plan_trip` | Anonymous session + in-memory MCP conversation. Does not create `TripPlan`. | `POST /api/ai/plan-itinerary` |
| `get_park_details` | No | Park details, alerts, weather, campgrounds, permits, feed |
| `compare_parks` | No | Compare + summary |
| `search_parks` | No | `GET /api/parks/search` plus heuristic rerank |
| `find_events` | No | `GET /api/events` |

**Prompts (5):** `welcome`, `plan_my_trip`, `explore_park`, `compare`, `whats_happening`. Canned templates.

**Resources:** Five HTML widgets exist under `mcp-server/widgets/`, but `MCP_MARKDOWN_ONLY` defaults true and `render.yaml` does not set `MCP_ENABLE_WIDGETS`. Production is markdown-only unless the dashboard overrides that.

**Auth.** No user login on MCP tools. Shared secret `MCP_BYPASS_KEY` sent as `X-TrailVerse-MCP-Key`. Express sets `skipAnonymousRateLimit` on match (`server/src/middleware/mcpBypass.js`). MCP-side fuse: plan 120/60s, reads 300/60s. Express anonymous limit otherwise is 60 requests / 15 minutes.

**Reliability.** `client.py` has no retries. `BACKEND_TIMEOUT` and `PLAN_TRIP_TIMEOUT` default 30s in the blueprint. Errors become `isError` tool results. Conversation memory is in-process, 2 hour TTL, max 1000 sessions, lost on restart.

**Website Trailie does not invoke MCP.** Voice does not use MCP either.

Cursor rule `06-mcp-chatgpt-cloud.mdc` still says `plan_trip` calls `POST /api/ai/chat-anonymous`. The code calls `/api/ai/plan-itinerary`. That rule is stale.

`plan_trip` builds the day plan in `fastItineraryPlannerService.js` (`plannerMode: 'deterministic'`) from park candidates, alerts, weather, and events, then optionally asks the lite model for a ~120-word intro (`maybeRefineNarrative`, 180 tokens). That is not the GPT-6 sufficiency / repair / canonical pipeline.

## 4. Agent / orchestration

There is no free-form agent loop, no sub-agents, no human approval inside chat, and no LLM-planned workflow.

One website turn is a fixed pipeline in `executeTrailieTurn` (`server/src/services/trailieExecutionService.js`):

1. Admission, history, trip ownership, constraints.
2. Deterministic intent, turn understanding, and sufficiency (`answer_now`, `plan_now`, `clarify_before_plan`, `edit_now`, `pushback`, and related decisions).
3. Evidence plan, then one evidence resolution. Retries reuse the frozen bundle.
4. Prompt assembly under the token budget. Model tier selection.
5. One Responses API call (stream) with itinerary tools available. The model does not receive live NPS/weather as callable tools on this path.
6. Deterministic bind, scope, evidence, travel, and constraint validators.
7. Contained repairs (extra single dispatches with forced tool choice) or ladder escalation.
8. Finalize hash, derived logistics, presentation. Guest session write, or authenticated client-driven trip write.

Semantic LLM resolution (`semanticTurnResolver`) exists and is unwired in the production bridge.

**Deterministic code owns** classification, sufficiency, evidence selection, validation, escalation, eligibility, patch application, identity binding, and mutation safety. **The model owns** wording, travel judgment, and tool-argument content, which validators can reject.

**Voice** is a separate agent-shaped surface: OpenAI Realtime model `gpt-realtime`, voice `marin`, four tools (`get_park_details`, `search_parks`, `compare_parks`, `find_events`) executed by `POST /api/ai/voice-tool`. No `plan_trip`. Limits: 3 anonymous sessions / 24h, then 10/hour for everyone.

**State.** Turn ledger, repair ledger, and plan revision hashes are persisted with the trip or anonymous session. That is trip state, not an agent checkpoint graph.

## 5. RAG / retrieval

No vector database, embedding model, chunking pipeline, or dense retrieval in `server/`.

What exists instead:

- Mongo evidence store keyed by entity and topic (`TrailieEvidence` and related models), with fresh and stale-safe cache hits.
- Deterministic park trait search (`GET /api/parks/search`). Comments in `traitBuilder.js` describe it as non-ML. MCP adds query expansion and a name-match rerank.
- Web search for logged-in users and trusted MCP: Brave, Serper, Tavily, plus direct official-page fetch. Guests are blocked from web search.
- Citation sanitizer that turns private cite tokens into markdown links (`sanitizeTrailieCitations.js`).
- Curated official evidence and known-place overlays in repo data.

This is evidence prefetch plus keyword/trait search, not hybrid vector RAG.

## 6. Live data

External systems the backend calls:

| System | Role |
|---|---|
| NPS Developer API | Parks, alerts, activities, campgrounds, permits, visitor centers, and related park resources |
| OpenWeather | Weather and crowd-adjacent conditions |
| RIDB / Recreation.gov | Reservable facilities and activities |
| Google Maps (server proxy) | Geocode, places, distance, static maps. Key never sent to the browser. |
| GTFS | Transit tabs for parks that have a feed |
| Brave, Serper, Tavily | Web evidence |
| Local astronomy engine | Sunrise/sunset style evidence |
| Resend, Beehiiv | Email, not Trailie tools |

Express route files: 34 under `server/src/routes/`. Router method registrations: about 242. That count includes admin, auth, and internal routes.

Website Trailie does not let the chat model call these APIs as tools. The server fetches a frozen evidence bundle, then the model writes against it. Voice and MCP do expose a small tool surface that hits Express, which then calls the APIs.

## 7. AI quality / evaluation

| Gate | Result | Date |
|---|---|---|
| Unified conversational offline runner | 497/497 tests, 21/21 suites, zero live provider calls | 24 Sep |
| Core runtime offline suites | 161/161 across 10 suites | 23 Sep |
| Backend Jest during model audit | 7460 pass, 22 skip; 3 suites failed to load | 23 Sep |
| Frontend focused publication tests | 20/20 | 23 Sep |
| Local behavioral scenarios | 23/39 judged clean on the first broad pass (not a full post-fix rescore) | 23 Sep |
| Ten-case smoke | 8 pass / 2 fail (closure adaptation, Seattle) | 23 Sep |
| Funded core retry | 13 complete / 3 failed API responses across 16 turns. Response status, not 13 behavioral passes. | 23 Sep |
| Paid core `final-check-1` | Not 4/4. Wheelchair clean on that turn. Continuity failed (`stop_identity_unresolved` / `missing_experience_anchor` on “four days in Zion”). Closure incomplete. Seattle not run. | 24 Sep |
| Controlled model benchmark | 735 calls, 0 provider refusals, $2.14 model cost | 23 Sep |
| Qualified HTTP E2E | 21 turns, 9 complete / 12 failed. First-validator pass 2/21. Failed turns kept the prior plan 12/12. | 23 Sep |
| Architecture probes | 15 pass / 16 fail of 31 | 23 Sep |
| Blinded companion sample | 8 pass / 3 partial / 1 fail on 12 outputs. Primary-agent scoring, not an independent judge panel. | 23 Sep |

Deterministic validators and contained repairs are in the production ladder (schema bind, evidence, travel constraints, exposure, wheelchair/access eligibility, completeness, narrative/canonical agreement). There is no production LLM-as-judge gate. Shadow Claude review is observational and off by default. Stage 13 fixture thresholds (for example 98% structured success) are historical and explicitly not enabled.

CI runs unit, integration, and Playwright tests. It does not run paid Trailie qualification.

## 8. Observability

Present in code:

- Per-attempt ledger: tokens, cache tokens, latency, validation codes, estimated cost (`trailieExecutionService.js`, `trailieTurnLedger.js`).
- `Analytics` events including `ai_chat`, `mcp_tool_call`, `performance`, `error`. Admin `GET /api/analytics/mcp`.
- Daily token ceilings in middleware: 5,000 user / 50,000 admin.
- `GET /api/ai/token-usage`.
- Shadow review telemetry model, unused while the worker is off.
- Morgan and application logs. Health: `/health`, `/health/ping`, `/health/database`, `/health/product`.

Not present in application source: LangSmith, OpenTelemetry, Sentry, or a distributed trace product. No production dashboard numbers (requests, cache-hit rate, cost per live user) were pulled for this inventory.

## 9. Reliability

| Mechanism | Behavior |
|---|---|
| Model ladder | Validation failures escalate inside OpenAI GPT-6. Provider errors stop the turn. |
| Same-model retry | At most once, Sol only, locally repairable failures. |
| Contained repair | Extra single-shot dispatches for duration, anchors, coverage, substitution. |
| Malformed output | Schema bind rejects it. Safe prose fallback exists. Failed edits are supposed to leave the saved plan unchanged; live runs have both honored and missed that. |
| NPS 429 | About 10 minutes process-local cooldown; stale cache served (`npsService.js`). |
| HTTP cache | NodeCache, TTL 300s, max 1000 keys. |
| DB snapshots | `NpsSnapshot`, `ParkSnapshot`. |
| Rate limits | Anonymous API 60/15 min; authenticated 200/15 min. Guest Trailie 5 turns/48h. |
| Circuit breaker | No shared circuit-breaker library. |
| Workers | Schedulers are in the web process. A crashed dyno drops in-memory MCP sessions and in-flight review jobs. |
| Partial recovery | Turn can fail after some model spend and still preserve the previous canonical hash. There is no resume-from-tool-step for a half-finished agent workflow, because there is no such workflow. |

Map/route qualification is blocked locally when Google authorization is denied. Derived route artifacts are not certified.

## 10. Persistence

Important Mongo models (35 model files under `server/src/models/`): `TripPlan`, `AnonymousSession`, `User`, `UserPreferences`, `Conversation`, Trailie evidence/turn/review models (`TrailieAiTurn`, `TrailieEvidence*`, `TrailieReviewJob`, `TrailieReviewTelemetry`, `TrailieTurnPersistence`, `TrailieConversationPlan`), plus parks snapshots, blogs, analytics.

`TripPlan` stores `planningState`, `conversation[]` (with response ids, hashes, `canonicalPlan`), top-level `plan`, share scope, and provider metadata.

Anonymous sessions last 48 hours and migrate on login via `POST /api/auth/migrate-chat` into a `TripPlan`. Itinerary edits go through deterministic scope resolution and a mutation commit. Authenticated canonical save after generation is largely a client write, not a single server transaction around the model call (23 September runtime audit).

Agent scratchpads are not persisted. Evidence documents, turn ledgers, and the canonical plan are.

## 11. Security

- JWT (`protect`, `optionalAuth`) and admin RBAC (`role === 'admin'`). `JWT_SECRET` minimum 32 characters.
- Required secrets validated at boot: Mongo, JWT, NPS key, and at least one of OpenAI or Anthropic.
- Google and other provider keys stay server-side.
- `express-validator` on many routes; itinerary tool schema binding; evidence grounding rejects some invented facts.
- MCP bypass is a shared header secret, timing-safe compare, plus MCP-side rate fuse.
- Analytics events and sanitized review telemetry. No SIEM.
- Account erasure job model exists.
- Prompt-misuse controls are policy, constraint blocks, and validators. There is no published adversarial prompt-injection suite with a pass rate.
- Voice tool endpoint is public and server-validated. It cannot plan or mutate trips.

## 12. Production / deployment

| Piece | Where |
|---|---|
| Web UI | Vercel, `www.nationalparksexplorerusa.com` |
| API | Render `https://trailverse.onrender.com` |
| MCP | Render `https://trailverse-mcp.onrender.com` |
| Database | MongoDB (Atlas-style URI; cluster vendor not re-verified here) |
| Docker | Not used for these services |
| CI | GitHub Actions test + SSR audit |
| Environments | Local, disposable Mongo for qualification, production. No separate staging blueprint in `render.yaml`. |
| Scaling | Single Render web services. No worker fleet. MCP is stateless HTTP plus in-memory sessions. |
| Automated tests | Jest (`server` `test:non-network`, coverage), Vitest frontend, Playwright. Live scripts exist (`test:live`, `qualify-trailie-core-local.js`) and are manual/paid. |

## 13. Measured facts

Numbers below are from specific runs, not production telemetry.

| Fact | Value | Source |
|---|---|---|
| NPS coverage (product claim) | 470+ parks and sites; explore can filter to 64 national parks | Product copy and catalog. Not re-counted in this pass. |
| Express route registrations | ~242 across 34 route files | Static count, 24 Sep |
| MCP servers | 1 | `mcp-server/` |
| MCP tools / prompts | 5 / 5 | `mcp-server/server/main.py` |
| Voice tools | 4 | `server/src/routes/ai.js` |
| Website chat models on the ladder | 3 (`gpt-6-luna`, `gpt-6-sol`, `gpt-6-astra`) | `trailieModelRouter.js` |
| Vector indexes | 0 | Source search |
| Offline unified tests | 497/497 | 24 Sep audit |
| Backend tests (audit rerun) | 7460 pass | 23 Sep |
| Smoke | 8/10 | 23 Sep |
| E2E qualified turns | 9/21 complete | 23 Sep |
| E2E turn latency | p50 54.90 s, p95 129.52 s | 23 Sep qualified HTTP run |
| Retrieval latency in that E2E | p50 1.71 s | same |
| Controlled benchmark | 735 calls, $2.140613, 0 refusals | 23 Sep |
| Local qualification | 100 turns, 163 OpenAI calls, ~$4.65 | 23 Sep |
| Funded core retry | 42 GPT-6 dispatches (37 Sol, 5 Astra), ~$1.58 | 23 Sep |
| `final-check-1` | 25 dispatches (21 Sol, 4 Astra), ~$1.28, stopped after Continuity failed | 24 Sep |
| Astra share in the 23 Sep qualification | 19/163 calls (~12%), concentrated in failing threads | 23 Sep |
| Production MAU, cache-hit rate, failure rate | Not measured here | — |

Cost figures are harness estimates from token accounting, not invoices. They exclude most non-model API charges.

Controlled benchmark latency for generation alone (not full HTTP turns), p50 total: GPT-6 Luna 3.34 s ($0.027 cohort), Sol 4.80 s ($0.406), Astra 12.84 s ($0.249). Those are benchmark cohorts, not production SLOs.

## 14. Recent architecture (since older v6-style profiles)

Implemented in the working tree and covered by offline tests:

- Unified conversational layer: sufficiency and execution decisions (`turnSufficiencyDecision.js`, `turnUnderstanding.js`). Planning is not forced into a form. Simple questions answer immediately.
- Action and temporal resolution: booking/stop targets and undated “tomorrow” do not get guessed into mutations (`actionTargetResolution.js`, `refinementScope.js`).
- Canonical consistency: narrative cannot describe unsaved stops; display labels are separate from canonical identity; derived logistics stay hash-bound.
- GPT-6 escalation ladder (Luna → Sol → Astra), replacing the older GPT-5.6 Terra ladder described in the 23 September runtime snapshot.
- Review/repair: eligibility-before-model, contained repairs, wheelchair/exposure constraints passed into repair, closure scope, city identity rejection for destination-only stops. Shadow Claude review remains off the request path.
- Evidence broker with frozen bundles, stale-safe cache, and provenance. Not a vector index.
- MCP distribution surface for ChatGPT and Claude, separate from website orchestration.

Still open after those changes:

- Live core qualification is not 4/4 (`final-check-1` Continuity failure on an initial Zion plan).
- Accessibility repair, constraint continuity, closure adaptation, and generic city stops failed or only partly cleared in live runs.
- Google route/map qualification is unfinished.
- Production flag parity (`TRAILIE_V2_RUNTIME_ENABLED`, model IDs on Render) is unverified.
- MCP `plan_trip` is still the fast deterministic planner.

## What the implementation supports saying

Supported by code that exists and is wired:

- Designed and shipped an AI trip-planning system inside a production parks product.
- Model routing, structured tool outputs, prompt budgets, and prompt caching.
- Deterministic orchestration around an LLM: intent, sufficiency, evidence, validation, repair, escalation, canonical state.
- Live tool integrations for parks, weather, alerts, campgrounds, permits, events, maps, and web search, with the model constrained to fetched evidence on the website path.
- An external MCP server (streamable HTTP) exposing tools to ChatGPT and Claude, with auth bypass, rate limits, and timeouts.
- A separate realtime voice tool loop.
- Eval harnesses, deterministic validators, and recorded pass/fail rates — including the failures.

Not supported:

- “Agentic” multi-step tool use where the model chooses live APIs and loops until done.
- Multi-agent systems, planner/executor sub-agents, or human-in-the-loop approval.
- RAG, embeddings, vector search, or learned reranking.
- MCP as Trailie’s internal tool protocol.
- Claiming MCP itineraries are the same system as website Trailie.
- Production-qualified planning quality, measured production cost/latency SLOs, or distributed LLM observability.
- Fine-tuning.

## Primary documents

- `docs/TRAILIE-UNIFIED-CONVERSATION-AUDIT-2026-09-24.md` — latest conversational architecture audit and `final-check-1`
- `docs/TRAILIE-LOCAL-QUALIFICATION-AUDIT-2026-09-23.md` — behavioral qualification, smoke 8/10
- `docs/TRAILIE-CORE-RUNTIME-FIX-REPORT-2026-09-23.md` — repair/accessibility fixes and funded retry
- `docs/eval/trailie-audit-2026-09-23/TRAILIE_RUNTIME_AUDIT.md` — request-flow inventory; model IDs in that file are the pre-GPT-6 snapshot
- `docs/eval/trailie-audit-2026-09-23/TRAILIE_MODEL_BENCHMARK_RESULTS.md` — 735-call benchmark and E2E numbers
- `docs/TRAILIE-CAPABILITIES-ACCURACY.md` — public-claim boundaries (last reviewed 27 Aug; guest/web-search rules still match the product policy)
- `mcp-server/README.md`, `mcp-server/server/main.py`, `mcp-server/server/client.py`
- `server/src/config/trailieModelRouter.js`, `server/src/services/trailieExecutionService.js`, `server/src/services/fastItineraryPlannerService.js`
