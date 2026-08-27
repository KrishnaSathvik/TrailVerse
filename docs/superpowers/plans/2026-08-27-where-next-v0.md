# Where Next V0 — Implementation Plan

> **For agentic workers:** Execute top to bottom. Product spec: `docs/plans/2026-08-27-001-feature-where-next-v0-plan.md`. No product-scope changes unless a genuine blocker.

**Goal:** Ship `/where-next`: any destination accepted, silent NPS match, one active pick per session, Explore/Trailie only when `park_code` exists.

**Architecture:** One Mongo collection of active picks (upsert by `sessionId`). Match is a pure function over the existing park catalog search. Next.js page is in-page steps (`search → confirm → when → result`), not nested routes. Analytics use existing `user_action` + `metadata.action`.

**Tech stack:** Express + Mongoose, Next.js App Router (JSX), Vitest (UI), Jest (API), existing `GET /api/parks/search`.

## Global Constraints

- One active pick per `sessionId`; Glacier → Japan replaces Glacier.
- Silent match only on Choose "{typed text}"; Glacier vs Glacier Bay stays unmatched.
- When? after confirmation, optional.
- Matched NPS → Explore + Trailie. Unmatched → counted, no fake CTA, no coverage copy.
- Public rankings: matched NPS only. Raw text never in analytics payloads.
- Volume floors: `<50` / `50–199` / `200–999` / `1000+`.
- No map, Places, share cards, destination CMS, sitewide trending, state-hub matching.
- Search stays on `/where-next` (inline results under the pill). No overlay or extra search page.

## File map

| Layer | Create | Modify |
|---|---|---|
| DB | `server/src/models/DestinationPick.js` | — |
| Match | `server/src/services/whereNextMatchService.js` | — |
| Rank | `server/src/services/whereNextStatsService.js` | — |
| API | `server/src/controllers/whereNextController.js`, `server/src/routes/whereNext.js` | `server/src/app.js` |
| Client lib | `next-frontend/src/lib/whereNext.js`, `next-frontend/src/services/whereNextService.js` | `next-frontend/src/utils/analytics.js` |
| UI | `next-frontend/src/app/where-next/page.jsx`, `WhereNextClient.jsx`, `components/where-next/*` | `sitemap.ts`, `Footer.jsx`, `PrivacyPageClient.jsx` |
| Tests | match/stats/controller Jest; WhereNextResult + copy Vitest | — |

## Pipeline

### 1. Model

`DestinationPick`: unique `sessionId`; `rawInput` (required, max 120); `normalizedText`; `parkCode` nullable; `canonicalType` `nps|null`; `canonicalName` nullable; `travelWindow` enum or null; `source` max 64; optional `userId`; timestamps.

### 2. API

| Method | Path | Role |
|---|---|---|
| POST | `/api/where-next/pick` | Upsert active pick. Body: `sessionId`, `rawInput`, optional `parkCode` (explicit NPS selection), `source`. |
| PATCH | `/api/where-next/pick` | Set `travelWindow` (`fall_2026` \| `winter_2026_27` \| `spring_2027` \| `summer_2027` \| `someday` \| null). |
| GET | `/api/where-next/me?sessionId=` | Active pick + stats snapshot. |
| GET | `/api/where-next/stats` | Volume tier + public leaders (matched only, empty until 200). |

Write limiter: 20 req / 15 min / IP (skip localhost in development). `optionalAuth` stores `userId` if present.

### 3. Matching

- Explicit `parkCode` from an NPS suggestion: validate against catalog, set `canonicalType: nps`.
- Choose typed text: `silentMatchRawInput(q)` — exact `fullName` unique **or** unique `fullName` prefix among catalog search hits. `Glacier` prefixes two parks → unmatched. No state-hub match.

### 4. Session

Client `localStorage` key `trailverse_where_next_session` (UUID). Distinct from analytics `tv_session_id`.

### 5. UI state

In-page: `search` → `confirm` → `when` → `result`. Returning session with a pick opens `result`. Change pick returns to `search`.

Mobile search: full-screen sheet; last row always Choose "{query}".

### 6. Analytics

`logWhereNext(action, { parkCode, travelWindow, source, matched })` via `user_action`. Never pass `rawInput`.

### 7. Privacy

New subsection under Information We Collect. Bump `LAST_UPDATED` to August 27, 2026.

### 8. Tests (acceptance)

- AE1 Banff: no forbidden copy, no Explore/Trailie
- AE2 Glacier suggestion: correct two hrefs
- AE3 12 votes: no numbered leaderboard
- AE4 unmatched strings absent from public leaders
- AE5 Yosemite → Italy replaces active count
- AE6 Vermont typed: no state-hub CTA
- Ambiguous `Glacier` typed: `parkCode` null
- Analytics helper rejects raw-text keys

### 9. Rollout / measurement

Quiet footer link. Track pick rate, When? completion, match rate, Explore/Trailie CTR on first 100 visitors. No homepage hero.

## Rank copy keys

Server sends `volumeTier`: `early` | `growing` | `healthy` | `large`. Frontend maps copy. Public `leaders` only for `healthy` and `large`.
