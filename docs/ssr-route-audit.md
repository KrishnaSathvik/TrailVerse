# TrailVerse route-tier SSR audit

Repeatable check: `cd next-frontend && npm run audit:ssr`

Against production by default; local preview:

```bash
BASE_URL=http://127.0.0.1:3000 npm run audit:ssr
```

Strict mode (exit 1 on regressions):

```bash
npm run audit:ssr:strict
```

## CI

Workflow: [`.github/workflows/ssr-audit.yml`](../.github/workflows/ssr-audit.yml)

| Trigger | `BASE_URL` |
|---------|------------|
| Push to `main` | Production (or repo variable `SSR_AUDIT_BASE_URL`) |
| Pull request | Vercel preview URL when the preview check is ready; else production |
| Manual | `workflow_dispatch` input `base_url` |

Set **`SSR_AUDIT_BASE_URL`** in GitHub repo variables to override the production default.

## Takeaway (retire “27% accessible”)

TrailVerse is **mostly server-first for public SEO pages**, but not purely Server Component based.

Many routes use **client components for interactivity** while still receiving metadata, route data, headings, article bodies, park names, and schema in the **first HTTP response**. That is not the same as “requires JavaScript for everything.”

**Weak no-JS surfaces** (expected to need hydration):

- `/map` — MapLibre / WebGL
- `/plan-ai` — Trailie chat app
- Auth, account, admin

**Strong or hybrid public content:**

- `/about`, `/guides`, `/chatgpt`, `/mcp`, blog posts, intent landings, discover, park pages

## Tiers

| Tier | Meaning | First HTML |
|------|---------|------------|
| **1** | Server page, content mostly in Server Components | Strong readable HTML |
| **2** | Server page fetches data → client child | Metadata + data; visible HTML **varies** |
| **3** | `'use client'` on `page.jsx` or `ssr: false` | Meta/intro often good; core UX after hydration |
| **static** | `public/reports/*.html` | Full HTML, no Next RSC |

## Tier 2 wording

> Crawlers usually receive metadata and meaningful route data in the first response, but the amount of **clean semantic HTML** varies by route. Content may live in the RSC stream (`self.__next_f`) rather than as plain `<a href="/parks/...">` cards.

## Guardrails (`--strict`)

Fails only when a route **scores below its own tier expectation**:

| Route | Expected | Fail when |
|-------|----------|-----------|
| `/about`, `/guides`, `/chatgpt`, `/mcp` | `strong` | Missing title, meta, H1, or body copy |
| `/blog`, `/blog/[slug]`, parks, discover, intent | `hybrid` | Missing title/meta/body (park names, article text) |
| `/explore` | `hybrid-thin` | Missing title/meta **and** no park keywords in HTML/RSC |
| `/map`, `/plan-ai` | `client-app` | Missing metadata/intro — **not** because loader/chat needs JS |

## Sample URLs (17 routes)

| ID | Path | Expected |
|----|------|----------|
| T1-about | `/about` | strong |
| T1-guides | `/guides` | strong |
| T1-chatgpt | `/chatgpt` | strong |
| T1-mcp | `/mcp` | strong |
| T1-privacy | `/privacy` | strong |
| T1-testimonials | `/testimonials` | strong |
| T1-magazine | `/magazine` | strong |
| T2-blog-index | `/blog` | hybrid |
| T2-blog-post | `/blog/yellowstone-national-park-the-complete-2026-visitor-guide` | hybrid |
| T2-explore | `/explore` | hybrid-thin |
| T2-park | `/parks/yellowstone-national-park` | hybrid |
| T2-discover | `/discover` | hybrid |
| T2-discover-activity | `/discover/activity/hiking` | hybrid |
| T2-intent-couples | `/parks-for-couples` | hybrid |
| T3-map | `/map` | client-app |
| T3-plan-ai | `/plan-ai` | client-app |
| static-report | `/reports/when-to-go` | static |

## What the script checks

- `<title>`, meta description, canonical (or `og:url` / streamed canonical)
- `<h1>` (required or optional per route)
- Body keywords in visible HTML; `/explore` also checks raw HTML for RSC-embedded park names
- `BAILOUT_TO_CLIENT_SIDE_RENDERING`, `self.__next_f` (informational)
- Loader strings on app routes — expected for Tier 3, not a failure
- `forbidBody` (e.g. stray `BETA` from Voice FAB) on legal/trust pages

Scores: `strong` · `hybrid` · `hybrid-thin` · `client-app` · `static` · `fail`
