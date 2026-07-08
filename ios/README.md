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
| 5. Journey 1 | In progress — Explore, Park, Trailie wired to existing `/api/*` |
| 6. Trip revisions | Not started (backend) |
| 7. Today / Live Activity | Not started |
| 8. TrailVerse Pro | Not started |

## API contract

iOS uses existing Express routes today. Versioned mobile API (`/api/mobile/v1/*`) and OpenAPI → Swift codegen are planned in `packages/api-schema/` (TBD).

Reference client: `packages/trailverse-api/` (TypeScript, web + documentation).
