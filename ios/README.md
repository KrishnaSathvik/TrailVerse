# TrailVerse iOS (Native SwiftUI)

Native iOS app for TrailVerse — **SwiftUI**, **SwiftData**, **MapKit**, **ActivityKit** (later).

Expo prototype archived at git tag **`trailverse-expo-archive`**.

## Prerequisites

- Xcode 16+ (iOS 17 deployment target)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- TrailVerse backend running for live API (`cd server && npm run dev`)

## Generate Xcode project

```bash
cd ios
xcodegen generate
open TrailVerse.xcodeproj
```

Set your **Apple Developer Team** in the TrailVerse target signing settings.

## Bundle ID

`com.nationalparksexplorerusa.trailverse` — matches Universal Links AASA on Vercel (`APPLE_TEAM_ID`).

## Local API

Debug builds default to `http://127.0.0.1:5001/api`. Override in the TrailVerse scheme:

```
TRAILVERSE_API_URL = http://192.168.x.x:5001/api
```

## Structure

```
TrailVerse/
├── App/              # Entry, tabs, router, environment
├── Core/
│   ├── DesignSystem/ # TV* tokens and components
│   ├── API/
│   ├── Authentication/
│   └── Persistence/
└── Features/         # Home, Explore, ParkDetail, Trailie, …
```

## Design system

Web audit: `docs/plans/ios-web-design-audit.md`  
Swift tokens: `TrailVerse/Core/DesignSystem/`

## Build phases (current)

| Phase | Status |
|-------|--------|
| 1. Archive Expo | Done — tag `trailverse-expo-archive` |
| 2. Design audit | Done |
| 3. SwiftUI design system | Done (foundation) |
| 4. Xcode scaffold | Done — run `xcodegen generate` |
| 5. Journey 1 | Done — onboarding, auth, explore, park detail, Trailie SSE, trip save |
| 6. Journey 2 | Done — saved parks, live weather, Universal Link routing |
| 7. Journey 3 | Done — interactive map pins, park compare |
| 8. Trip revisions | Not started (backend) |
| 9. Today / Live Activity | Not started |
| 10. TrailVerse Pro | Not started |

## API contract

iOS uses existing Express routes today. Versioned mobile API (`/api/mobile/v1/*`) and OpenAPI → Swift codegen are planned in `packages/api-schema/` (TBD).

Reference client: `packages/trailverse-api/` (TypeScript, web + documentation).

## Journey 1 flow (manual test)

1. Start backend: `cd server && npm run dev`
2. Run app in Simulator (Debug → `127.0.0.1:5001/api`)
3. **Onboarding** → Get Started (auth sheet) or Explore as Guest
4. **Home → Explore** → tap a park → **Plan with Trailie** (prefills park context)
5. **Trailie** — guest SSE chat (5 msg limit banner); sign in to save
6. **Save Trip** (authed) → appears under **Trips** tab
7. Sign in uses existing `POST /api/auth/login` (same account as web)

## Journey 2 flow (manual test)

1. **Park detail** — live weather card from `GET /api/parks/:code/weather`
2. **Save** — heart toggle calls `POST/DELETE /api/users/saved-parks` (auth required)
3. **Saved tab** — lists synced parks; tap opens park detail
4. **Deep links** — Simulator: Open URL `https://www.nationalparksexplorerusa.com/parks/yellowstone-national-park`
   - Routes to Home → park detail (slug resolved to NPS code)
   - `/plan-ai?park=yell&name=Yellowstone` → Trailie tab with park context

## Journey 3 flow (Map + Compare)

1. **Map tab** — 64 national park pins from live API coordinates
2. Tap a pin → sheet with View Park / Plan with Trailie / Add to Compare
3. **Home → Compare parks** — pick 2–4 parks, loads `POST /api/parks/compare`
4. Side-by-side columns: weather, crowds, best months, rating, states
5. **Park detail → Compare this park** — pre-fills first park in compare flow
6. Deep link: `https://www.nationalparksexplorerusa.com/compare?parks=yell,yose`
