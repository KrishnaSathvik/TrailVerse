# TrailVerse Mobile (iOS)

Expo + Expo Router app for TrailVerse. Feature logic only — UI/UX is designed separately.

**Design north star:** [`docs/plans/ios-design-brief.md`](../docs/plans/ios-design-brief.md) — journeys, capabilities, Figma checklist, wiring map.

## Setup

```bash
cd packages/trailverse-api && npm install
cd ../../mobile && npm install
```

## Run

```bash
# From repo root (API must be running for live data)
npm run dev:backend   # terminal 1
npm run dev:mobile    # terminal 2 → press i for iOS simulator
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` for device testing (use your machine LAN IP, not `127.0.0.1`):

```
EXPO_PUBLIC_API_URL=http://192.168.x.x:5001/api
```

## Structure

| Path | Purpose |
|------|---------|
| `app/(tabs)/` | Explore, Map, Trailie, You |
| `app/park/[slug].tsx` | Park detail + lazy tabs |
| `app/compare.tsx` | Compare flow |
| `app/login.tsx` | Auth |
| `src/hooks/` | TanStack Query feature hooks |
| `src/providers/` | Auth + Query |
| `src/lib/` | API singleton, offline cache, deep links |
| `../packages/trailverse-api/` | Shared TypeScript API client |

## Universal Links (AASA)

Routes are served by Next.js (deploy with frontend to Vercel):

- `https://www.nationalparksexplorerusa.com/.well-known/apple-app-site-association`
- `https://www.nationalparksexplorerusa.com/apple-app-site-association`

**Required Vercel env:** `APPLE_TEAM_ID` — your 10-character Apple Developer Team ID.

Validate after deploy:

```bash
curl -sI https://www.nationalparksexplorerusa.com/.well-known/apple-app-site-association
# Content-Type: application/json
```

## Map

Map tab uses **Apple MapKit** via `react-native-maps` (full-bleed map, pins, search, bottom sheet). Simulator and device builds only — not supported in Expo web.
