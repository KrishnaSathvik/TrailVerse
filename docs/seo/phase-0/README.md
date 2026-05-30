# Phase 0 — GSC data & removals

**Property:** `https://www.nationalparksexplorerusa.com`  
**Plan:** [`docs/plans/seo-coverage-fixes-2026-05.md`](../../plans/seo-coverage-fixes-2026-05.md)  
**Status:** In progress (started 2026-05-24)

Phase 0 is **Search Console + file organization only** — no production deploy.

---

## Progress checklist

Copy this into your notes and check off as you go:

- [x] Main coverage export archived (`exports/coverage-main/`)
- [x] Robots drilldowns archived (80 URLs in `url-action-tracker.csv`)
- [x] Performance export archived (`exports/performance/`) — Tier A parks updated in `docs/seo/phase-4-tier-a-parks.md`
- [ ] **6 remaining drilldown exports** — waiting on GSC validation (issues not visible yet)
- [ ] **Temporary removal** submitted for `/_next/static/`
- [ ] Tracker merged → `url-action-tracker.csv` has **~262 rows** (80 + 182 pending)
- [ ] Phase 0 sign-off → ready for Phase 1 PR

---

## Step 1 — Export missing drilldowns (GSC UI)

1. Open [Google Search Console](https://search.google.com/search-console)
2. Property: **https://www.nationalparksexplorerusa.com**
3. Left nav: **Indexing** → **Pages**
4. Under **Why pages aren’t indexed** (or **Page indexing** details), click each row below
5. On the issue detail page, click **Export** (top right) → download ZIP or CSV
6. Save into the matching folder under `imports/` (see table)

| GSC issue | Pages | Save export to |
|-----------|------:|----------------|
| Not found (404) | 27 | `imports/not-found-404/` |
| Page with redirect | 27 | `imports/page-with-redirect/` |
| Crawled - currently not indexed | 111 | `imports/crawled-not-indexed/` |
| Discovered - currently not indexed | 14 | `imports/discovered-not-indexed/` |
| Excluded by ‘noindex’ tag | 2 | `imports/excluded-noindex/` |
| Alternate page with proper canonical tag | 1 | `imports/alternate-canonical/` |

**Tip:** Name files clearly, e.g. `Coverage-Drilldown-not-found-2026-05-24.zip`.  
If export is a ZIP, unzip so `Table.csv` is inside the folder (same pattern as `exports/drilldown-*`).

**Already done (do not re-export unless refreshing data):**

| Issue | Location |
|-------|----------|
| Blocked by robots.txt | `exports/drilldown-blocked-by-robots/Table.csv` |
| Indexed, though blocked by robots.txt | `exports/drilldown-indexed-blocked-by-robots/Table.csv` |

---

## Step 2 — Temporary removal (`/_next/static/`)

This speeds up de-indexing **before** Phase 1 headers ship.

1. GSC → **Indexing** → **Removals**
2. **New request** → **Temporary removal**
3. Choose **Remove all URLs with this prefix:**
   ```
   https://www.nationalparksexplorerusa.com/_next/static/
   ```
4. Submit (typically ~6 months max; URLs can reappear if still linked — Phase 1 fixes that)

**Do not** remove entire domain or `/parks/`.

---

## Step 3 — Import zips from project root + merge

Drop any new GSC drilldown **ZIP** into the **repo root** (same folder as the 3 existing `https___www.nationalparksexplorerusa.com_-Coverage*.zip` files), then:

```bash
python3 docs/seo/phase-0/scripts/import-root-zips.py
python3 docs/seo/phase-0/scripts/merge-gsc-exports.py
```

`import-root-zips.py` reads each zip’s `Metadata.csv` → `Issue` and copies files into the right `exports/` or `imports/` folder.

See [`INVENTORY.md`](INVENTORY.md) for what’s already imported vs still missing.

This updates `url-action-tracker.csv` and prints a summary.

---

## Step 4 — Triage (optional spreadsheet)

Open `url-action-tracker.csv` and set `action` / `notes` for pending rows:

| `action` value | When to use |
|----------------|-------------|
| `phase1_headers_removal` | `/_next/static/*` (already set for 80 rows) |
| `phase2_redirect` | 404 or legacy URL → add 301 in `next.config.mjs` |
| `phase2_ignore_redirect` | Intentional redirect (park code → slug) |
| `phase3_noindex` | Auth/admin/shared — metadata + robots |
| `phase4_content_tier_a` | High-value park/blog — unique copy |
| `phase4_ignore` | Low value; accept non-indexed |

---

## Artifacts in this folder

| File / folder | Purpose |
|---------------|---------|
| `url-action-tracker.csv` | Master URL → issue → action list |
| `exports/` | Archived copies of exports you already provided |
| `imports/` | Drop new GSC drilldown exports here |
| `scripts/merge-gsc-exports.py` | Merge imports into tracker |

---

## Phase 0 complete when

1. All 6 pending `imports/*/` folders contain `Table.csv` (or equivalent URL list)
2. `merge-gsc-exports.py` reports **~262 tracked URLs** (80 robots + 182 from other issues; some overlap possible)
3. Temporary removal for `/_next/static/` is **Submitted** in GSC
4. You’ve skimmed 404 list for obvious quick redirects (Phase 2 prep)

Then say **“start Phase 1”** to implement headers + noindex PR.

---

## After Phase 1 deploy (not Phase 0)

GSC → Pages → **Blocked by robots.txt** → **Validate fix** (validation was **Failed** on 2026-05-24 export).
