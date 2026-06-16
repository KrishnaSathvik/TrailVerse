# Publish checklist — 470+ Parks, Not 63

**Draft:** `docs/medium/02-470-parks-not-63.md`  
**Verified against codebase:** 2026-06-13  
**Target publication:** Javarevisited (Medium)

---

## Verification summary (codebase)

| Claim in article | App / code source | Status |
|------------------|-------------------|--------|
| 470+ NPS units | 474 entries in `park-slugs.json`; UI copy uses “470+” | ✅ |
| Google says 63 National Parks | Common public stat; NPS designation count | ✅ |
| Explore “National Parks Only” toggle | `ExplorePageClient.jsx` — default on | ✅ |
| Toggle shows ~64 parks | `parkController.js` filter (designation + name match) | ✅ Fixed in draft (was “63” only) |
| Discover: activity, type, topic, state | `/discover`, `DiscoverPageClient.jsx` | ✅ |
| Nav label “Explore by Activity” | `browseHub.js` → Header **More** menu | ✅ Fixed in draft |
| Compare 2–4 parks | `ComparePageClient.jsx` `maxParks = 4` | ✅ |
| 5 free guest messages, 48h reset | `anonymousChatLimits.js`, `guestChatUrl.js` | ✅ Fixed in draft |
| No account for explore/map/compare/discover/guides | `proxy.js` — only profile/chat-history/home gated | ✅ |
| ChatGPT app + Claude MCP | `/chatgpt`, `/mcp`, `mcp-server/` | ✅ Added MCP link |
| Intent landing URLs | `intentLandings.js` + extended | ✅ Added deep links |
| Boston National Historical Park example | `park-slugs.json` code `bost` | ✅ Added slug link |
| Guide slug | `guides.js` `best-free-national-park-trip-planner` | ✅ |

---

## Medium publish steps

1. **Sign in** to [Medium](https://medium.com) → New story.
2. **Publication:** Submit to **Javarevisited** (matches your other TrailVerse posts).
3. **Title:** `470+ Parks, Not 63: Why You’re Missing Most of the NPS Map`
4. **Subtitle:** `The famous sixty-three are only one kind of NPS place. Here’s the rest of the map—and how TrailVerse helps you plan the full system, not just the poster parks.`
5. **Body:** Paste from `02-470-parks-not-63.md` (skip the `#` title and `**Subtitle:**` line — Medium has separate fields).
6. **Formatting:** Keep tables, bold links, and numbered lists; Medium supports these.
7. **Tags (5 max):** `National Parks`, `Travel`, `Road Trip`, `United States`, `Outdoor`
8. **Canonical / SEO:** Medium does not support canonical to your site; compensate by:
   - Linking 8–10 TrailVerse URLs in-body (draft already has this)
   - After publish, add a short blurb + link on `/guides/best-free-national-park-trip-planner` or site blog (optional)
9. **Cross-link:** In your three existing Medium posts, add one line in “More from Krishna” is automatic; manually add a comment or update pinned profile link to the new post when live.

---

## Post-publish (TrailVerse site — optional SEO boost)

- [ ] Share link on TrailVerse social / newsletter if applicable  
- [ ] Add “Related reading” link from `/guides/best-free-national-park-trip-planner` to Medium URL (when live)  
- [ ] Submit URL to Google Search Console if not indexed within 2 weeks  

---

## Changes made during verification (2026-06-13)

1. Subtitle: “Missing Half” → **“Missing Most of the NPS Map”** (63/474 ≠ half)
2. National Parks Only count: **~64 on toggle** vs Google’s 63 — explained briefly
3. **5 free guest messages** + 48h reset (was vague “trial messages”)
4. **More menu** for Discover nav (not primary nav)
5. Discover walkthrough: **Type → Monuments/Seashores**
6. Added **Boston park page link**, **intent landing links**, **Claude MCP** mention
7. Removed internal “Publishing notes” footer from draft body
8. First person: “we built” → **“I built”** (matches your other Medium voice)
