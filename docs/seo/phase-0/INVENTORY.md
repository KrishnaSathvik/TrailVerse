# Phase 0 — GSC export inventory

**Last sync:** 2026-05-24 (from project root zips)

## Zips found in project root (3)

| File | Type | URLs in Table.csv | Imported to |
|------|------|------------------:|-------------|
| `https___www.nationalparksexplorerusa.com_-Coverage-2026-05-24.zip` | Main summary (counts only) | — | `exports/coverage-main/` |
| `https___www.nationalparksexplorerusa.com_-Coverage-Drilldown-2026-05-24.zip` | Blocked by robots.txt | 5 | `exports/drilldown-blocked-by-robots/` |
| `https___www.nationalparksexplorerusa.com_-Coverage-Drilldown-2026-05-24 (1).zip` | Indexed, though blocked by robots.txt | 75 | `exports/drilldown-indexed-blocked-by-robots/` |

**Tracker:** 80 unique URLs → `url-action-tracker.csv` (all `phase1_headers_removal`)

## Waiting on GSC validation (6 drilldown exports)

**Status (2026-05-24):** These issues were in **Started** validation in the main export. While Google is validating, the issue rows often **disappear or can’t be drilled into** in the Pages report — so URL-level exports aren’t available yet. That’s expected.

Page counts from `exports/coverage-main/Critical issues.csv` (snapshot before/during validation):

| Issue | Pages | Export when |
|-------|------:|-------------|
| Not found (404) | 27 | Issue reappears in GSC after validation ends |
| Page with redirect | 27 | Same |
| Crawled - currently not indexed | 111 | Same |
| Discovered - currently not indexed | 14 | Same |
| Excluded by ‘noindex’ tag | 2 | Same |
| Alternate page with proper canonical tag | 1 | Same |

**When validation finishes** (Passed, Failed, or issue returns with updated counts):

1. **Indexing → Pages** → open each issue again
2. **Export** drilldown ZIP → project root
3. Run `import-root-zips.py` + `merge-gsc-exports.py`

**If validation passes:** counts may drop to 0 — export any remaining URLs before they clear.

**If validation fails:** issue returns with URLs — export immediately for Phase 2/4 triage.

## Phase 0 completion

- [x] Import existing 3 zips
- [x] 80 robots URLs in tracker
- [ ] 6 drilldown zips — **blocked: GSC validation in progress** (~182 URLs when available)
- [ ] GSC temporary removal: `https://www.nationalparksexplorerusa.com/_next/static/`

**Parallel track (unblocked):** Phase 1 + Phase 3 can start without the 6 exports.
