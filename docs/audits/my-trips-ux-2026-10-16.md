# My Trips — local UX change

Status: implemented and tested locally; not committed, pushed, or deployed. This is a separate, reviewable feature diff, not an addition to the release baseline. Unrelated working-tree changes remain in place. An isolated patch is saved at `/private/tmp/trailverse-my-trips-2026-10-16.patch`.

## Verified current-state inventory

- `/chat-history` was a client page using `useTrips` → `tripService.getUserTrips` → authenticated `GET /api/trips/user/:userId`. The backend returns all nondeleted TripPlan records for that owner. Its ownership guard rejects other ordinary users; the existing admin exception is unchanged.
- TripPlan contains both `conversation` and optional `plan`. The model-first store commits ordinary conversation turns even without a plan. A separate row per conversation is therefore unnecessary for these records.
- Chat resumes at `/plan-ai/:tripId?chat=true`. The loader reads the record's embedded conversation (or existing legacy `conversationId` fallback). The itinerary alias `/plan-ai/:tripId/itinerary` redirects to `/plan-ai/:tripId/plan`, the shared trip workspace with itinerary and map tabs.
- The old list exposed active/archived views, title/preview/topic search, four sort modes, client-side Load more in groups of 12, share, archive/restore and confirmed deletion. There was no inline rename on this page, although the metadata API already supports titles.
- The old itinerary check required stops and missed legitimate pinless day structures. Every card was labeled Active Chat or Archived Chat, even when it had an itinerary. The large hero and duplicated card chrome were presentation issues.
- Archive/restore in `useTrips` used the response-save PUT endpoint. That endpoint intentionally ignores management title/status fields. The existing metadata PATCH endpoint is the correct route. The trip list's intended skipCache option was also passed as an ignored third argument to the two-argument API wrapper.
- `/api/conversations` is a separate, authenticated historical collection. It is not the source of the current list; no reliable general join to TripPlan exists. No records from that collection are guessed, merged, duplicated, or deleted by this feature. Existing legacy-linked trip loading remains unchanged.
- The main authenticated More navigation shares labels across responsive layouts. Profile saved/visited parks are a distinct park collection, not a duplicate trip library. Plan AI also reads the TripPlan list for its existing history/context behavior; it does not require a new dashboard.
- Guest migration uses `/api/auth/migrate-chat` and `migrateGuestConversation` to produce the same TripPlan representation. Existing local-history migration is handled by authentication. Neither migration path changes here.
- Existing URL protection, private robots metadata, legacy bookmarks, workspace aliases, and authentication APIs remain intact.

## Implemented behavior

- The single destination is labeled **My Trips**, keeping `/chat-history` so bookmarks and protected-route behavior remain compatible.
- Subtitle: “Your trips and conversations with Trailie, all in one place.” Compact utility header and an explicit new-trip link replace the marketing-style hero.
- All, Saved trips, Conversations and Archived filters operate over the same records. Conversations means records without a saved itinerary; saved trips retain their own Continue chat action when an embedded or explicit linked conversation exists. Distinct TripPlan IDs are never collapsed based on title, park, or prose.
- Following user review, the search bar, sorting dropdown and Active/Archived selector are removed. Newest updates appear first automatically. Archive on each card moves it to Archived; Restore returns it to the main list. Every filter change resets the visible limit to 12.
- Saved cards show the stored title/destination, structured day count, traveler-owned dates when present, and last updated date. Conversation cards show title and a short existing-message preview. Dates and destinations are not inferred from prose.
- Open trip goes directly to the existing `/plan-ai/:tripId/plan` workspace; Continue chat and Resume conversation use `/plan-ai/:tripId?chat=true` for that exact record.
- Share, delete confirmation, archive and restore remain available. Rename uses the existing metadata PATCH endpoint; archive/restore now use that endpoint too. No plan or conversation content is written by these management operations.
- Loading, retryable errors, empty categories, empty archives, and signed-out states have distinct copy. On logout the private list unmounts; switching authenticated owner IDs remounts the list, resetting its state and subscriptions.
- The new planning action uses `entry=new-trip` and does not send a prompt automatically.

## Validation

Commands run from `next-frontend/`:

```sh
npx vitest run src/components/my-trips/__tests__/MyTrips.test.jsx src/hooks/__tests__/useTrips.test.jsx
npx playwright test --config=playwright.my-trips.config.mjs
npx eslint src/app/chat-history/page.jsx src/app/chat-history/layout.js src/components/my-trips src/lib/myTrips.js src/hooks/useTrips.js src/services/tripService.js
```

- Vitest: 9 tests passed. Coverage includes saved/pinless plans, conversation-only records, nonfabricated associations, exact action URLs, pagination, archives, rename/share/delete, loading/error/retry/empty states, owner changes/logout, and metadata-only mutations.
- Playwright: 2 tests passed at 1440px and 390px using the installed Chrome executable. Tested the actual page, filters, card Archive → Archived → Restore, keyboard focus, horizontal overflow, Open trip → real workspace with Map tab, and Resume conversation → restored message. No page exceptions or console errors in the final fixture runs.
- The repository's default Chromium executable was missing, so the dedicated config selects installed Chrome and uses the existing local dev server. An initial fixture mismatch returned JSON to a maps script and the wrong providers envelope; both fixture issues were corrected before the passing run.
- Lint: zero errors; one pre-existing `useTrips` exhaustive-deps warning for `loadTrips`.
- `git diff --check` passed.

Commands run from `server/`:

```sh
npm run test:non-network -- src/controllers/__tests__/tripController.test.js --runInBand
npm run test:non-network -- src/services/__tests__/guestConversationMigration.test.js src/utils/__tests__/guestCanonicalPlanMigration.test.js --runInBand
```

- Controller suite: 19 tests passed, including added list ownership and mixed-record tests, existing response-write safeguards and metadata protections.
- Guest migration suites: 8 tests passed, covering selected-conversation migration, retry idempotence, rollback, and canonical identity preservation.
- Provider isolation reports zero live provider constructions, dispatches, or external provider HTTP requests.

## Screenshots

- Desktop: `next-frontend/test-results/my-trips/my-trips-My-Trips-at-1440px/my-trips-1440.png`
- Mobile: `next-frontend/test-results/my-trips/my-trips-My-Trips-at-390px/my-trips-390.png`

Screenshots use synthetic records and were visually inspected. Browser API responses, authentication and socket traffic are fixture-backed; no real user records or paid model calls were used. Google Maps script loading is stubbed; this verifies workspace access and the Map tab, not map-provider rendering.

## Isolated file manifest

| File | Purpose |
| --- | --- |
| `next-frontend/src/app/chat-history/page.jsx` | Auth-aware My Trips route; owner-keyed list lifecycle. |
| `next-frontend/src/app/chat-history/layout.js` | My Trips title and description; retains private robots. |
| `next-frontend/src/components/my-trips/MyTrips.jsx` | Responsive cards, category/archive filters, management actions and states. |
| `next-frontend/src/lib/myTrips.js` | Pure classification, metadata, sorting/filtering and exact record URLs. |
| `next-frontend/src/components/common/Header.jsx` | Shared responsive navigation label. |
| `next-frontend/src/app/features/FeaturesPageClient.jsx` | Feature label/copy points to My Trips. |
| `next-frontend/src/hooks/useTrips.js` | Loading/retry handling and metadata-only archive/restore. |
| `next-frontend/src/services/tripService.js` | Correct uncached list request configuration. |
| `next-frontend/src/components/my-trips/__tests__/MyTrips.test.jsx` | Page and presentation behavior coverage. |
| `next-frontend/src/hooks/__tests__/useTrips.test.jsx` | Retry and metadata mutation coverage. |
| `server/src/controllers/__tests__/tripController.test.js` | Read ownership and mixed-history coverage; no server runtime changes. |
| `next-frontend/tests/e2e/my-trips.spec.js` | Fixture-only responsive/navigation/browser checks and screenshots. |
| `next-frontend/playwright.my-trips.config.mjs` | Isolated browser config using installed Chrome. |
| `docs/audits/my-trips-ux-2026-10-16.md` | Inspection findings, scope, limitations and verification record. |

## Remaining limits

- The existing API returns the full owner list; pagination and category filtering remain client-side. No production data-volume claim is made.
- Standalone records in the separate Conversation collection still have no general My Trips integration. This feature preserves the previous page's accessible history and does not fabricate a relationship or introduce a migration.
- No new `/my-trips` route was introduced. The public label changes, while the established private URL remains `/chat-history`.
- No AI runtime, prompt, tool, schema, memory, itinerary mutation, or guest migration implementation changes. Hosted configuration and the release decision documents were not changed for this task.
