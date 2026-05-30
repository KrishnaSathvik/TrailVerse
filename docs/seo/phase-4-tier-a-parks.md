# Phase 4 Tier A — 30 priority parks

**Updated:** 2026-05-24 (GSC Performance export, last 3 months)  
**Source:** `https___www.nationalparksexplorerusa.com_-Performance-on-Search-2026-05-24.zip`  
**Archived:** `docs/seo/phase-0/exports/performance/`

## How this list was built

1. **GSC page data** — park URLs with impressions/clicks (full slugs preferred over 4-letter codes).
2. **GSC query demand** — e.g. `zion national park`, `grand canyon national park`, `acadia national park`.
3. **Blog winners** — posts already earning impressions; park pages should match and interlink (Grand Teton, Yellowstone, Yosemite, Death Valley, Arches, Canyonlands).
4. **Iconic parks** — high visitation parks not yet ranking well on `/parks/*` (Joshua Tree, Great Smoky, Bryce, etc.).

**Excluded from Tier A content work:** short-code URLs like `/parks/grca`, `/parks/zion` — fix with redirects/crawl (Phase 2), not unique copy on duplicate URLs.

---

## GSC snapshot (last 3 months)

| Metric | Value |
|--------|------:|
| Total clicks | 156 |
| Total impressions | 24,641 |
| Park URLs in export | 232 |
| Park page clicks | ~25 (most traffic is **blog** + homepage) |

**Top traffic is blog, not `/parks/`:** Grand Teton and Yellowstone 2026 guides each have **2,900–4,300** impressions. Phase 4 should **link blog → canonical park pages**.

**Short-code bleed (redirect / Phase 2):**

| URL | Impressions | Avg position |
|-----|------------:|-------------|
| `/parks/grca` | 1,224 | 66.7 |
| `/parks/zion` | 857 | 45.4 |
| `/parks/yell` | 110 | 14.3 |
| `/parks/yose` | 88 | 14.2 |

---

## Tier A — 30 parks (recommended)

| # | Park | Canonical path | GSC park page (imp / clk) | Notes |
|---|------|----------------|---------------------------|--------|
| 1 | Yosemite | `/parks/yosemite-national-park` | 281 / 4 | Strong park page; huge blog traffic |
| 2 | Grand Canyon | `/parks/grand-canyon-national-park` | 128 / 2 | + 1,224 imp on `/parks/grca` (code URL) |
| 3 | Zion | `/parks/zion-national-park` | 75 / 1 | + 857 imp on `/parks/zion`; query: 253 imp |
| 4 | Yellowstone | `/parks/yellowstone-national-park` | 135 / 1 | Blog guide 4,352 imp; crowd calendar queries |
| 5 | Grand Teton | `/parks/grand-teton-national-park` | — | Blog guide **2,978 imp**, 19 clk |
| 6 | Acadia | `/parks/acadia-national-park` | 363 / 1 | Query: 130 imp `acadia national park` |
| 7 | Glacier | `/parks/glacier-national-park` | 413 / 1 | Query: 96 imp |
| 8 | Black Canyon of the Gunnison | `/parks/black-canyon-of-the-gunnison-national-park` | 451 / 0 | High imp, pos ~9.5 |
| 9 | Death Valley | `/parks/death-valley-national-park` | — | Blog guides 691+ imp |
| 10 | Arches | `/parks/arches-national-park` | — | Blog guides 780+ imp |
| 11 | Canyonlands | `/parks/canyonlands-national-park` | — | Blog guide 391 imp |
| 12 | Big Bend | `/parks/big-bend-national-park` | 179 / 0 | |
| 13 | Crater Lake | `/parks/crater-lake-national-park` | 159 / 0 | pos ~8.5 |
| 14 | Glacier Bay | `/parks/glacier-bay-national-park-and-preserve` | 259 / 1 | |
| 15 | Rocky Mountain | `/parks/rocky-mountain-national-park` | 54 / 0 | |
| 16 | Wrangell-St. Elias | `/parks/wrangell-st-elias-national-park-and-preserve` | 168 / 0 | |
| 17 | Capitol Reef | `/parks/capitol-reef-national-park` | 39 / 0 | Utah Mighty 5 cluster |
| 18 | Bryce Canyon | `/parks/bryce-canyon-national-park` | — | Mighty 5; iconic |
| 19 | Joshua Tree | `/parks/joshua-tree-national-park` | — | Iconic; improve indexing |
| 20 | Great Smoky Mountains | `/parks/great-smoky-mountains-national-park` | — | #1 visitation |
| 21 | Olympic | `/parks/olympic-national-park` | — | |
| 22 | Everglades | `/parks/everglades-national-park` | — | |
| 23 | Denali | `/parks/denali-national-park-and-preserve` | — | |
| 24 | Sequoia & Kings Canyon | `/parks/sequoia-and-kings-canyon-national-parks` | — | `/parks/seki` 80 imp |
| 25 | Badlands | `/parks/badlands-national-park` | 23 / 0 | |
| 26 | Lassen Volcanic | `/parks/lassen-volcanic-national-park` | 57 / 0 | |
| 27 | Dry Tortugas | `/parks/dry-tortugas-national-park` | 51 / 0 | |
| 28 | Indiana Dunes | `/parks/indiana-dunes-national-park` | — | |
| 29 | White Sands | `/parks/white-sands-national-park` | — | `/parks/whsa` 80 imp |
| 30 | Mount Rainier | `/parks/mount-rainier-national-park` | — | |

Full URLs: `https://www.nationalparksexplorerusa.com` + path.

---

## Top queries to align content with

| Query | Impressions | Clicks | Avg pos |
|-------|------------:|-------:|--------:|
| zion national park | 253 | 1 | 42.4 |
| grand canyon national park | 165 | 0 | 52.3 |
| acadia national park | 130 | 0 | 42.9 |
| grand canyon | 119 | 0 | 73.1 |
| glacier national park | 96 | 0 | 69.9 |
| yellowstone crowd calendar | 26 | 2 | 10.4 |
| grand canyon crowd calendar | 19 | 2 | 9.2 |
| trailverse (brand) | 21 | 10 | 3.0 |

---

## Legacy URLs still getting traffic (Phase 2)

| URL | Impressions | Clicks |
|-----|------------:|-------:|
| `/reports/when-to-go.html` | 557 | 11 |
| `/reports/national-parks-2025.html` | 314 | 0 |

Add 301s to modern equivalents when Phase 2 runs.
