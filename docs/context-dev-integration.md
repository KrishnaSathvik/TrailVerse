# Context.dev integration

Context.dev (context.dev, formerly Brand.dev) is a web data API: browser-rendered
scraping (HTML and PDF to Markdown), web search with passages, structured
extraction, and page monitors with signed webhooks. TrailVerse uses it in three
places, each behind its own flag that is **off by default**. With no key and
no flag, Trailie behaves exactly as before.

Measured results are in `docs/audits/context-dev-reader-2026-11-19.md` and
`docs/audits/context-dev-search-2026-11-19.md`.

## 1. Official-page reader (`TRAILIE_OFFICIAL_PAGE_READER=contextdev`)

**What it replaces:** the axios reader in `directOfficialPageEvidenceProvider.js`.
That reader fetches raw HTML, strips it with regexes and keeps the first
8,000 characters, which are mostly site header and navigation boilerplate. It
cannot read PDFs.

**What it does:** asks Context.dev for main-content Markdown (`mainContentOnly`,
1-day cache, PDF pages 1–12 with OCR when needed), capped at 40,000 characters.
The output is the same `{url, title, text, status}` shape, so the broker,
allowlist, relevance check, deterministic extractors and reviewer are unchanged.

**How it fails:** any Context.dev error (outage, timeout, no credits, unreadable
page) falls back to the axios reader for that page. The one exception is the
test tripwire, which is never bypassed.

**Audit (30 pages, Nov 19 2026):** the extractors found more facts on 6 pages,
fewer on 0, with 0 Context.dev failures. Median latency was 312 ms and p90
1.9 s. Examples:
- Glacier's Going-to-the-Sun Road 21 ft limit. On both official pages it sits
  past the 8,000-character cut, so today's reader never sees it.
- Acadia's Cadillac Summit Road 21 ft limit, plus 3 park-wide rules.
- Zion shuttle rules (3) and Rocky Mountain timed-entry rules (5).
- A 25 ft limit inside the Yosemite Guide PDF.

**Cost:** 1 credit per page read (cache hits count).

**Structured (JSON) extraction is deliberately NOT in the live path.** A
model-extracted value is not an official-text fact
(`docs/trailie-architecture.md`). The audit uses it only as a cross-check: it
flagged Grand Canyon's Hermit Road 22 ft limit, which the deterministic parser
misses with either reader. That is a parser backlog item.

## 2. Discovery search (`TRAILIE_WEB_SEARCH_PROVIDER=contextdev`)

**What it does:** the provider `context_dev`
(`providers/contextDevEvidenceProvider.js`) takes over the Brave and Tavily
discovery topics in both web paths (`webEvidencePolicyService` and
`trailieTravelData`). Serper topics are unchanged. Results stay `reputable_web`
source discovery; the official follow still reads the page.
- Official-only topics are restricted with `includeDomains: [nps.gov,
  recreation.gov]`.
- Highlight passages are requested only for the Tavily-role topics, where they
  replace Tavily's second extract call.

**Audit (20 of Trailie's own queries):**
- An official page from the correct park was returned for 20 of 20 queries,
  and ranked first for 15.
- Key terms appeared in the snippet or passage for 20 of 20.
- **But the median latency was 3.9 s with passages, and search alone took
  1–4.6 s.** Brave's budget is 5 s.

Keep this flag off until `node scripts/context-dev-audit.js search` has been run
where Brave and Tavily keys exist, and the latency is acceptable.

**Cost:** 1 credit per 10 results, plus 1 per 10 results with passages.

## 3. Change alerts (monitors → evidence invalidation)

`node scripts/context-dev-monitors.js sync --webhook-url
https://<api-host>/api/webhooks/context-dev` creates daily page monitors, up to
the plan's limit (Free: 10). They cover the official pages most likely to change
a plan: roads, closures, shuttles and timed entry.

On `change.detected`, `POST /api/webhooks/context-dev`:
1. Verifies `X-Context-Signature` (HMAC-SHA256 over `t.rawBody`, within
   5 minutes) against `CONTEXT_DEV_WEBHOOK_SECRETS`. **Each monitor has its own
   secret.**
2. Checks that the envelope matches the `X-Context-Id` and `X-Context-Event`
   headers.
3. Sets `observation.invalidatedAt` on every current evidence row read from that
   URL, and pulls `expiresAt` and `staleUntil` forward to now.

The coverage evaluator treats an observation invalidated after it was made as
expired, so the next turn re-reads the page. The next refresh rewrites
`observation`, which clears the marker. The handler is idempotent, so retries
and replays are safe.

**Cost:** 1 credit per page run; 10 pages run daily is about 300 credits a month.

## Operations

| Env var | Where | Purpose |
|---|---|---|
| `CONTEXT_DEV_API_KEY` | API server (Render) | Required for any of the above |
| `TRAILIE_OFFICIAL_PAGE_READER=contextdev` | API server | Turn on #1 |
| `TRAILIE_WEB_SEARCH_PROVIDER=contextdev` | API server | Turn on #2 |
| `CONTEXT_DEV_WEBHOOK_SECRETS` | API server | Comma-separated monitor secrets for #3 |

**Credit budget:** the Free plan has 1,000 credits a month. #1 at about 1–3
pages per research turn, plus #3 at about 300 a month, needs a paid plan for
production traffic. Check `key_metadata.credits_remaining` or the dashboard.

**Not used:** Answers (a second model writing cited answers conflicts with
Trailie being the only planner), people and company data, and the review
parsers (data rights unchecked).
