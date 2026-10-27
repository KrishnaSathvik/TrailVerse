# Chiricahua National Park (2026) — research, audit and validation

**Status:** implemented locally, uncommitted, not deployed. Blog post saved as a **draft** in the local `trailverse-dev` DB only.
**Prepared:** 2026-10-26

## 1. Verified facts

| Fact | Value | Source |
|------|-------|--------|
| Official name | Chiricahua National Park | NPS announcement; NPS API `parks?parkCode=chir` |
| Previous designation | Chiricahua National Monument (protected since 1924) | NPS announcement |
| Designation date | October 20, 2026 (signed into law) | NPS announcement |
| NPS park code | `chir` (unchanged) | NPS API |
| NPS API record | `fullName: "Chiricahua National Park"`, `designation: "National Park"` | NPS API, queried 2026-10-26 |
| Size | About 12,000 acres; boundaries unchanged | NPS announcement, NPS FAQ |
| Location | Southeastern Arizona near Willcox | NPS announcement |
| Arizona national parks | 4: Chiricahua, Grand Canyon, Petrified Forest, Saguaro | NPS API (designation + `states`) |
| Entrance fee | Free | NPS fees page |
| 2025 recreation visits | 70,406 | NPS IRMA visitation API; matches NPS FAQ |

**Known source conflict.** The NPS FAQ (`/chir/faqs.htm`) says the bill was "signed into law on September 30, 2026", and one sentence still says "63 officially designated national parks". The announcement (Oct 20) is authoritative. Neither FAQ statement is used anywhere in TrailVerse.

Official sources:
- https://www.nps.gov/chir/learn/news/chiricahua-national-monument-becomes-america-s-newest-national-park.htm
- https://www.nps.gov/chir/ , [FAQ](https://www.nps.gov/chir/faqs.htm), [Plan your visit](https://www.nps.gov/chir/planyourvisit/index.htm), [Scenic drive](https://www.nps.gov/chir/planyourvisit/scenic-drive.htm), [Hiking](https://www.nps.gov/chir/planyourvisit/hiking.htm), [Campground](https://www.nps.gov/chir/planyourvisit/bonita-canyon-campground.htm), [Fees](https://www.nps.gov/chir/planyourvisit/fees.htm)

## 2. How the national-park count is derived (verified: 64)

The NPS API (`/parks?limit=500`, 475 units on 2026-10-26) has no "is national park" flag. The count comes from:

| Component | Count |
|-----------|-------|
| Records with designation `National Park`, `National Park & Preserve`, or `National Parks` (now including `chir`) | 61 |
| `npsa`: National Park of American Samoa (designation field is blank) | +1 |
| `redw`: Redwood ("National and State Parks") | +1 |
| `seki`: Sequoia & Kings Canyon share one record but are two parks | +1 |
| **Total** | **64** |

The only differences between the repo snapshot and the live API were `chir` (renamed and redesignated) and a new unrelated unit, `dsds`. No other unit changed.

## 3. Architecture audit: where Chiricahua's status comes from

TrailVerse has **no hardcoded national-park list** for classification. Almost everything reads the live NPS `designation`, so `chir` was reclassified automatically when the NPS updated its record. The remaining issues were **static snapshots and copy**:

| System | Source of truth | State before | Action |
|--------|-----------------|--------------|--------|
| Park page `/parks/[slug]` | Live API + `park-slugs.json` for slug lookup | Prod regenerates `park-slugs.json` at build (`prebuild` → `scripts/generate-park-slugs.mjs`), so prod already served `/parks/chiricahua-national-park`. **The old `/parks/chiricahua-national-monument` URL returned 404 in production.** | Updated both committed snapshots; added permanent redirects for the old slug and for `/parks/chiricahua` |
| `/parks/chir` short code | `next.config.mjs` (generated from the snapshot) | Pointed at the monument slug in the committed snapshot | Fixed via the snapshot |
| Sitemap, daily feed, explore `nationalParksOnly`, discovery search, map marker colour, MCP | Live `designation` | Already correct | None |
| Crowd calendar (`/reports/when-to-go`, `parkCrowdFacts.json`) | `public/reports/park_data.js`, built from NPS IRMA by `scripts/build-when-to-go-data.py` | 63 parks, no CHIR | Added CHIR with **real IRMA 2021–2025 monthly averages** using the builder's own functions (the writer was checked to round-trip the existing file byte for byte). Peak month: March |
| Trailie park extraction (`server/src/utils/parkExtractor.js`) | Static `PARK_NAME_TO_CODE` + dynamic NPS map loaded at boot | Without the dynamic map, Chiricahua didn't resolve at all. With a pre-Oct-20 map, its identity was "Chiricahua National Monument" (`nps_unit`) | Added a static `chiricahua national park` entry (data only, no engine change). Old and new names both resolve to `chir`, `kind: national_park` |
| Park of the Day size (`parkSizeService`) | Static acreage table | No `chir` entry, so it fell back to "500k acres" | Added "12,000 acres" (the NPS round figure) |
| Intent landing (quiet parks) | `next-frontend/src/data/intentLandings.js` | Name was "Chiricahua National Monument" | Renamed |
| Blog/markdown park linkifier | `parkLinkifier.js` | No Chiricahua entry | Added full names only (new name, plus the old name → new page). Bare "Chiricahua" is deliberately excluded so "Chiricahua Apache" and "Chiricahua Mountains" are not linked |

### Caches (backend)
- **In-memory parks list** (`npsService`): 24h TTL; cleared on restart or deploy.
- **Mongo `parksnapshots` / `all-parks`**: used only as a fallback when the NPS API fails. Local copy is already fresh (chir = National Park).
- **Extractor dynamic map**: built once at boot and never refreshed while running. **A redeploy or restart is required.** It is now non-critical because the static entry carries the correct identity.
- **Mongo `npssnapshots` / `discover-catalog`**: 7-day TTL. A snapshot taken before Oct 20 undercounts the "Parks" facet by one until it expires or is rebuilt with `getCatalog({ force: true })`.

**Release action:** redeploying the backend refreshes everything that matters.

### Identity and user data
`chir` stays the only key everywhere: no new record, no code change. Favorites, saved trips, visited marks, reviews and map pins are keyed by `parkCode` and are unaffected.

## 4. Copy changes (present-tense counts only)

These now say 64: the crowd-calendar meta description and blog CTA, the guides FAQ, magazine copy, the fallback stats, the welcome email template, Trailie prompt lines in `factsService`, and the MCP host instructions.

**Deliberately unchanged (historically accurate):**
- `public/reports/national-parks-2025.html` ("America has 63 designated national parks. In 2025…").
- Published blog posts.
- `docs/medium/*`.
- Archived `artifacts/` and `.worktrees/`.

iOS already says 64 and gets its list from `/parks?nationalParksOnly=true`.

## 5. Blog draft

- **Source:** `docs/blog-drafts/chiricahua-64th-national-park.md`
- **Local DB:** `trailverse-dev`, `status: draft`, slug `chiricahua-national-park-americas-64th-national-park`.
- **Fields:**
  - Category: `national-parks`.
  - Featured image: NPS "View from Massai Point", hot-linked from nps.gov, not uploaded.
  - `publishedAt`: null.
- **No email on publish:** `notificationSentAt` is preset, so a later publish won't email subscribers.
- **Fact-checking:** every factual claim was checked against an official NPS page or the NPS API.
- **Removed or softened from the original draft:**
  - "First new park since New River Gorge (2020)": no official source.
  - "Established by Coolidge": not in any fetched source.
  - Echo Canyon distance: NPS gives both 3.3 and 3.4 mi, so the draft says "roughly 3.4".
- **Links:** all 15 return 200.

## 6. Validation

| Check | Result |
|-------|--------|
| New frontend regression test `src/lib/__tests__/chiricahuaRedesignation.test.js` | 9/9 pass. Covers: single `chir` record, count = 64, slug resolution, real `next.config` redirects, crowd data, linkifier (incl. "Chiricahua Apache" not linked), landing name |
| New server regression test `src/utils/__tests__/chiricahuaNationalPark.test.js` | 13/13 pass. Old and new names → `chir` under no, stale, and live dynamic maps; identity name; park size |
| Server suite (`npm test`) | 546 suites passed; 7,720 tests passed, 0 failed |
| MCP (`pytest`) | 63 passed |
| Frontend unit suite (`vitest`, excl. integration) | 1,463 passed, 67 failed in 16 files. **The same 67 fail with these changes reverted** (scratch-copy baseline). Pre-existing, unrelated (Trailie demo playback, auth, guest session) |
| Local routes (`next dev` :3100 + backend :5001) | `/parks/chir`, `/parks/chiricahua`, `/parks/chiricahua-national-monument` → 308 → `/parks/chiricahua-national-park` (200) |
| SEO on park page | Title "Chiricahua National Park: Alerts, Crowd Calendar, Map & Trailie"; canonical `/parks/chiricahua-national-park`; JSON-LD name correct; 0 "National Monument" mentions; sitemap includes the new URL |
| Park page in browser | Desktop and 390px mobile render with 0 console errors and no horizontal overflow. Weather, hours, fee (Free), campground, crowd-calendar link, Trailie CTA, and "You Might Also Like" (Grand Canyon, Petrified Forest, Saguaro) all work |
| National-park-only filter | `/api/parks/search?q=national park&state=AZ` → exactly `chir, grca, pefo, sagu` |
| Production MCP `search_parks("Chiricahua National Monument")` | Resolves to Chiricahua National Park |

Screenshots (gitignored): `artifacts/chiricahua-redesignation-2026-10-26/`.

## 7. Outstanding issues (pre-existing, not fixed here)

1. **Plural "national parks" search returns nothing.** `/api/parks/search?q=national parks in Arizona` returns 0 results, locally and in production, for every state (e.g. Utah too). The singular "national park" works. This affects MCP `search_parks` for common phrasing.
2. **Drafts are publicly readable.** `getPostBySlug` returns drafts, and `/blog/<draft-slug>` renders with `robots: index, follow`. This only matters if drafts are created in production.
3. **Gaps in the Trailie static extractor.** It has no Gateway Arch (`jeff`) entry, and it keys Guadalupe Mountains to `guad` (the real code is `gumo`).
4. **No Trailie crowd scores for Chiricahua.** `constraintEngine` `CROWD_SCORES` has no `chir` row, so it gets no crowd warnings. Left alone because the Trailie engine scope is frozen.
5. **The sitemap filters on exactly `'National Park'`.** This omits `& Preserve` units, `npsa` and `redw`. It doesn't affect `chir`.
6. **The 2025 visitation report doesn't cover Chiricahua.** The crowd calendar's "2025 visitation report" link on the CHIR card goes to that report, which ranks the 63 parks of 2025 and so doesn't include Chiricahua.
7. **New NPS unit not in the snapshot.** The live API has a unit `dsds` that the committed snapshot lacks. Production picks it up automatically at build.
8. **Blog featured image is hot-linked.** It points at nps.gov rather than going through the usual `/uploads/blog/*.webp` pipeline; upload it via admin if preferred.
