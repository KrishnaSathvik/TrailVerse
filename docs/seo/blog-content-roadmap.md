# Blog content roadmap — TrailVerse

**Updated:** 2026-05-24  
**Positioning:** Practical national park planning from someone who actually travels—crowds, fees, rule changes, and honest tradeoffs—not generic listicles.

**Related:** [phase-4-tier-a-parks.md](./phase-4-tier-a-parks.md), GSC exports under `docs/seo/phase-0/exports/performance/`

---

## What’s done (May 2026)

| Layer | Status |
|--------|--------|
| Titles | SEO-focused, diversified on 4 guides (no slug changes) |
| `metaDescription` | All 20 published posts |
| Hero excerpts | Aligned with titles |
| Slug lock + `previousSlugs` redirects | Code shipped |
| High-traffic guides + Yosemite news | Strong title/body match verified |

**Scripts (re-runnable):**

- `server/scripts/apply-blog-seo-updates.js` — round 1 titles/meta
- `server/scripts/apply-blog-seo-round2.js` — remaining meta + titles
- `server/scripts/apply-blog-excerpt-alignment.js` — hero excerpts
- `server/scripts/apply-blog-title-diversify.js` — de-duplicate “Visitor Guide” pattern

---

## GSC-informed gaps (last 3 months)

Traffic is **blog-heavy**; park pages rank poorly on short codes (`/parks/zion`, `/parks/grca`). New posts should **link to canonical `/parks/{full-slug}`** and support Tier A parks.

| Query theme | Impressions (approx) | Clicks | Opportunity |
|-------------|---------------------:|-------:|-------------|
| `zion national park` | 253+ | ~0 | No Zion 2026 guide yet |
| `grand canyon national park` | 165+ | 0 | No GC guide yet |
| `acadia`, `glacier`, `california national parks` | 96–130 | 0 | State/cluster guides |
| `best national parks for first time visitors` | 59+ | 0 | Expand first-timers → comparisons |
| `yellowstone timed entry 2026` | 45+ | 0 | Covered; keep internal links fresh |
| `zion crowd calendar` | 15+ | 0 | Tool/calendar tie-in |

---

## Priority queue

### P0 — Next 30 days (highest ROI)

| # | Article idea | Type | Why | Link to |
|---|----------------|------|-----|---------|
| 1 | **Yosemite vs Yellowstone for First-Timers** | Comparison | First-timer queries + two whale guides | Both 2026 guides, `/parks/yosemite-*`, `/parks/yellowstone-*` |
| 2 | **Zion vs Bryce Canyon: Best Utah Park for 3 Days** | Comparison | Zion GSC demand, Mighty Five cluster | Zion, Bryce park pages; Canyonlands/Arches guides |
| 3 | **Zion National Park 2026: Crowds, Shuttles & What Changed** | Guide | Top query gap, 857 imp on `/parks/zion` code URL | Canonical Zion park page |
| 4 | **9 National Park Mistakes First-Timers Make in 2026** | Mistakes | Emotional + shareable; supports existing first-timers post | First-timers post + Tier A guides |
| 5 | **Best National Parks for Milky Way Photography (2026)** | Astro pillar | Unifies 4 astro guides; niche moat | All astro posts |

### P1 — 30–60 days

| # | Article idea | Type | Why |
|---|----------------|------|-----|
| 6 | Grand Canyon 2026: South Rim Crowds, Fees & First Visit | Guide | `grand canyon` queries, Tier A |
| 7 | Rocky Mountain vs Grand Teton for Summer Trips | Comparison | Decision content; RMNP Tier A |
| 8 | Best Utah National Park If You Hate Crowds | Comparison | Utah cluster SEO + differentiation |
| 9 | Why Your Yosemite Trip Might Be Miserable in July | Mistakes | Seasonal anxiety; links Yosemite guides |
| 10 | The Biggest Yellowstone Planning Mistakes in 2026 | Mistakes | Extends whale post |
| 11 | Beginner Astro Settings for National Parks (Z6II workflow) | Astro | Authority + gear grounding |
| 12 | Moon Phase Planning for National Park Astro Trips | Astro | Unique, links calendar/tools |

### P2 — 60–90 days (logistics + Discover)

| # | Article idea | Type |
|---|----------------|------|
| 13 | Best Airports for National Park Road Trips | Logistics |
| 14 | Renting a Car for National Parks: What Actually Matters | Logistics |
| 15 | What National Park Reservations Confuse People Most (2026) | Logistics |
| 16 | National Parks That Look Better Online Than in Person | Mistakes / honest |
| 17 | Acadia 2026: Fall Foliage, Parking & First Timer Tips | Guide |
| 18 | Glacier 2026: Going-to-the-Sun, Timed Entry & Crowds | Guide |
| 19 | How I Plan Astro Shots in National Parks (field workflow) | Astro / brand |
| 20 | Best Campsites for Night Photography in Utah Parks | Astro |

---

## Astro cluster (hub-and-spoke)

**Pillar (new):** Best National Parks for Milky Way Photography (2026)

**Spokes (published):**

- Grand Teton Astrophotography Guide (2026)
- Death Valley Astrophotography Guide
- Arches National Park Astrophotography Guide
- Canyonlands National Park Astrophotography Guide

**Cross-link rule:** Every 2026 guide “Night Sky” / astro section → matching spoke + pillar.

**Future spokes:** Beginner settings, moon phase, campsites, “how I plan a shoot” (personal voice).

---

## Comparison post template

Use the same structure for shareability and SEO:

1. **Who each park is for** (1 paragraph each)
2. **Crowds & timing** (2026-specific)
3. **Fees & logistics**
4. **3-day sample itinerary** (sketch)
5. **Clear verdict:** “Choose X if…, Choose Y if…”
6. **CTAs:** canonical park page + Plan AI + related blog

**Target length:** 1,800–2,500 words (match existing guides).

---

## Title patterns (avoid fatigue)

| Use for | Pattern examples |
|---------|------------------|
| Rule-change news | `{Park} Ends Timed Entry for 2026: Waits & What Changed` |
| Deep guides | `{Park} 2026: {specific hook}` — not always “Visitor Guide” |
| Comparisons | `{A} vs {B} for {audience/season}` |
| Mistakes | `{N} Mistakes…` / `Why Your {Park} Trip Might…` |
| Astro | `{Park} Astrophotography Guide` or `{topic} for Milky Way` |
| Logistics | Question-style: `When Is Death Valley Actually Safe to Visit?` |

**Keep slug stable** when retitling; update excerpt + `metaDescription` together.

---

## Distribution (non-SEO)

| Channel | Content type |
|---------|----------------|
| Reddit (r/NationalPark, r/yosemite, etc.) | News posts, comparison verdicts |
| Pinterest | Fall routes, cozy towns, astro shots |
| Newsletter | Rule-change roundups, Memorial Day–style timely posts |
| Internal | Homepage “Planning” module → top 5 posts |

---

## Success metrics (90 days)

| Metric | Baseline (May 2026) | Target |
|--------|---------------------|--------|
| Blog clicks (GSC, 3 mo) | ~64 | 120+ |
| Posts with meta + aligned excerpt | 20/20 | Maintain |
| Comparison / mistakes posts published | 0 | 4+ |
| Zion + Grand Canyon guides live | 0 | 2 |
| Astro pillar + cross-links | 4 spokes only | Pillar live, 8+ internal links from guides |

---

## Review cadence

- **Monthly:** GSC Performance export → add rows to gap table above
- **After each publish:** URL Inspection → Request indexing
- **Quarterly:** Retire or `noindex` stale seasonal (e.g. outdated holiday travel)
