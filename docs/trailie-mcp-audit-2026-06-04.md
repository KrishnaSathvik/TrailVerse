# Trailie & MCP End-to-End Audit

**Date:** 2026-06-04  
**Scope:** Website Trailie (logged-in + anonymous), MCP (ChatGPT/Claude), shared Express backend  
**Environment:** Local verification against `http://127.0.0.1:5001` + production MCP health check

---

## Executive summary

| System | Working? | Accuracy (practical) |
|--------|----------|----------------------|
| **Logged-in Trailie** | Yes | Strong for NPS/permit/alerts; web digest improves local/planning; road open/closed improved via NPS road block (see §6) |
| **Anonymous Trailie** | Yes | Good for NPS/permit/itinerary; no live web (by design); road answers rely on NPS only |
| **MCP server** | Yes (health + APIs) | Read tools: high; `plan_trip`: same anonymous AI path as guest chat |

Trailie and MCP are **not separate AI brains**. MCP read tools call Express REST directly; MCP `plan_trip` calls `POST /api/ai/chat-anonymous` → same `prepareChatContext` pipeline as guest Trailie. **Full quality (web search + profile)** is **logged-in website** only, unless production `MCP_BYPASS_KEY` is paired (bypass lifts rate limits; web search enabled for trusted MCP).

---

## 1. Architecture

```
Website /plan-ai (guest)     → POST /api/ai/chat-anonymous
Website /plan-ai (logged in) → POST /api/ai/chat | chat-stream
MCP plan_trip                → POST /api/ai/chat-anonymous (+ X-TrailVerse-MCP-Key)
MCP get_park_details, etc.   → GET/POST /api/parks/*, /api/events
```

**Shared pipeline:** `prepareChatContext()` in `server/src/routes/ai.js`

1. Extract parks from user message (message wins over stale session park on open-ended queries)
2. `fetchRelevantFacts()` — weather, NPS (+ road/conditions block when applicable), fee-free; web if logged-in or trusted MCP
3. Optional ranked discovery (`/api/parks/search`) for vague “which parks…” questions
4. Build **LIVE TRAILVERSE DATA** system prompt
5. Provider: `auto` → **Claude** default; **OpenAI** for heavy itinerary regex
6. Post-process: alert/permit footers, itinerary JSON
7. UI metadata: parks from **user message** (not assistant/footer text)

**Web search:** Brave / Serper / Tavily → relevance rank → **Claude Haiku digest** → injected into system prompt (not shown raw in UI).

---

## 2. Logged-in Trailie

### Tests (local)

| Suite | Result |
|-------|--------|
| `test-plan-ai-flows.js` (auth) | 5/5 PASS |
| `test-web-search-full-suite.js` | 10/10 PASS |
| GTSR open (manual auth chat) | Honest deferral before road block fix; see §6 |

### Strengths

- `hasWebSearch: true` for road, local, operational, trail, smoke, planning
- Angels Landing: permit ≠ closed
- Narrows permit-only: no web; correct `parkName`
- Brave primary returns results after `pw` freshness + `site:nps.gov/{code}`

### Gaps (addressed or open)

| Issue | Status |
|-------|--------|
| NPS `Park Closure` not in `category === 'Closure'` filter | **Fixed** — `npsAlertUtils.js` |
| GTSR status not in NPS facts | **Fixed** — `npsParkConditionsService.js` |
| Web snippets alone for road status | Mitigated — NPS block preferred in prompt |
| 3/4 photo grid | **Fixed** — image merge + UI layout |

---

## 3. Anonymous Trailie

### Tests

| Suite | Result |
|-------|--------|
| `test-plan-ai-flows.js` (anon) | 5/6 PASS (itinerary upsell marker edge case) |
| Angels Landing anon curl | 200, `hasLiveData: true`, no web upsell on operational Q |

### By design

- No web search (`isAnonymous && !isTrustedMcp`)
- 5 messages / 48h cap
- Upsell on lodging / road / trail / smoke categories
- NPS + weather still fetched

### Accuracy note

Without web, road answers use **NPS alerts + conditions block only** — better after §6 fix; still not a substitute for logging in for restaurant/live local data.

---

## 4. MCP

### Infrastructure

| Check | Result |
|-------|--------|
| `GET https://trailverse-mcp.onrender.com/health` | `{"status":"ok","service":"trailverse-mcp"}` |
| Production `/api/parks/zion/details` | success |
| Local Express | up on :5001 |

### Tools

| Tool | Backend | Status |
|------|---------|--------|
| `get_park_details` | `GET /api/parks/:code/details` + related | OK |
| `search_parks` | `GET /api/parks/search` | OK |
| `compare_parks` | `POST /api/parks/compare` | OK |
| `find_events` | `GET /api/events/` | OK |
| `plan_trip` | `POST /api/ai/chat-anonymous` | OK (same AI stack as anon Trailie) |

### MCP vs logged-in

| Capability | MCP `plan_trip` | Website logged-in |
|------------|-----------------|-------------------|
| NPS facts + road block | Yes | Yes |
| Web digest | Only with paired `MCP_BYPASS_KEY` | Yes |
| User profile/history | No | Yes |
| 5-msg cap | Bypassed with MCP key | N/A |

Local dev without `MCP_BYPASS_KEY` → MCP behaves like plain anonymous.

---

## 5. Web search policy (logged-in / trusted MCP)

| Category | Provider | Notes |
|----------|----------|-------|
| operational-status | Brave → backups | `site:nps.gov/{code}`, freshness `pw` |
| road-conditions | Brave → backups | NPS road block **first** |
| trail-conditions | Brave | |
| local-business | Serper | |
| planning | Tavily | |
| nps-covered (permits only) | Skip web | |

Digest: **Claude Haiku** (`trailieLiteLlm.js`), OpenAI fallback if no Anthropic key.

---

## 6. NPS road & conditions (2026-06-04 enhancement)

**Problem:** GTSR “open today?” relied on web snippets; NPS alerts used `category === 'Closure'` but API returns **`Park Closure`**, so road alerts were dropped.

**Fix:**

- `server/src/utils/npsAlertUtils.js` — closure/caution/information matching; road-related alert filter
- `server/src/services/npsParkConditionsService.js` — for road/operational queries:
  - Road alerts from NPS API (authoritative)
  - Excerpt from `https://www.nps.gov/{code}/planyourvisit/conditions.htm`
  - Injected into `fetchNPSFacts` **before** web search runs

**Example (Glacier, local API alert):**

> Going-to-the-Sun Road is open to Avalanche Creek on the west side… open to Jackson Glacier Overlook on the east side.

---

## 7. Verification commands

```bash
# Plan AI anon + auth
cd server
PLAN_AI_TEST_EMAIL=... PLAN_AI_TEST_PASSWORD=... node scripts/test-plan-ai-flows.js

# Web search full suite (auth)
node scripts/test-web-search-full-suite.js

# NPS road block unit test
npm test -- --testPathPattern=npsParkConditions|npsAlertUtils

# GTSR auth chat spot check
TEST_MESSAGE='is Going-to-the-Sun Road open right now in Glacier National Park?' \
  node scripts/test-web-search-auth-chat.js
```

---

## 8. Recommended follow-ups

1. Confirm `MCP_BYPASS_KEY` paired on Render MCP + Express; verify `hasWebSearch` on MCP `plan_trip` for local-business queries.
2. Add CI job for `test-plan-ai-flows.js` + `test-web-search-full-suite.js` with secrets.
3. Parse structured road tables from conditions.htm if NPS HTML stabilizes (currently heading + paragraph + table rows).
4. Voice path audit (OpenAI Realtime) — separate from this document.

---

## 9. Related files

| Area | Path |
|------|------|
| Chat pipeline | `server/src/routes/ai.js` |
| Facts + web | `server/src/services/factsService.js` |
| Road/conditions | `server/src/services/npsParkConditionsService.js` |
| Alert categories | `server/src/utils/npsAlertUtils.js` |
| Web classify | `server/src/services/webSearchClassifier.js` |
| MCP client | `mcp-server/server/client.py` |
| MCP tools | `mcp-server/server/main.py` |
| Photo grid UI | `next-frontend/src/components/ai-chat/MessageBubble.jsx` |
