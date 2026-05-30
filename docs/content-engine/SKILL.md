---
name: trailverse-content-engine
description: >
  This skill should be used when asked to create national park content packages
  for TrailVerse (nationalparksexplorerusa.com). Triggers on any prompt mentioning
  "TrailVerse content package", "national park guide", "astrophotography guide",
  "park blog post", "dark sky guide", or "TrailVerse content packages for [park]".
  NOTE: This skill is designed for Cowork mode only. It uses WebSearch, WebFetch,
  Write, Bash, and TodoWrite — tools available in Cowork. It will not work correctly
  in claude.ai chat or other Claude surfaces.
version: 0.1.0
---

# TrailVerse Content Engine

## Author Profile

- **Name:** Krishna
- **Camera:** Nikon Z6II (all astrophotography settings must be specific to this body)
- **Pinterest:** @travelswithkrishna | **Twitter:** @latentengineer_ | **Medium:** @codebykrishna
- **Credentials:** Google Maps Level 8, 67M+ photo views, 17 national parks visited
  *(update this count in the plugin when the number changes)*

## Environment

This skill runs in Claude (Cowork mode). Use WebSearch and WebFetch for all research.
Save all files to the mounted workspace with the Write tool.

**Workspace folder structure:**
```
TrailVerse Blogs/
├── Complete-Guides/
├── Astro-Guides/
└── Research/[park-slug]/
```

Create subfolders via Bash (`mkdir -p`) before writing files if they don't exist.

---

## CRITICAL: What the Park Page Already Shows

Every park at `/parks/{code}` already displays this data. **Never repeat it in articles.**

Excluded from articles: entrance fees, operating hours, weather/forecast, NPS alerts,
campground names/fees/reservations, all named trails (50+ on park page), permit types
and Recreation.gov links, activities list, contact info, directions, photos gallery,
NPS videos, brochure/map PDFs.

**Articles must add:** editorial storytelling, why this park specifically, honest trail
difficulty context, seasonal strategy for specific goals, astrophotography technical
guidance, SEO-targeted content, social proof, affiliate gear recommendations, FAQ schema.

---

## Two Articles Per Park

1. **`[park-slug]-complete-guide.md`** — Complete Visitor Guide (always generate)
2. **`[park-slug]-astrophotography-guide.md`** — Astrophotography Guide (only if Bortle 1–4 or DarkSky certified)

If Bortle 5+ and no DarkSky certification → generate Article 1 only, set `astrophotographyEligible: false`.

---

## Phase Decomposition

Run **Phases 1, 2, 3, and 5 in parallel**. Run **Phase 4 after 1+2+3 complete**.
Use TodoWrite to track progress.

---

### Phase 1: Research [parallel]

WebSearch/WebFetch sources:
- `nps.gov/{parkName}` — description, key features, geology/ecosystem
- `irma.nps.gov` — annual visitor stats, peak month data
- `usgs.gov` — geology and rock formations
- Top 3 Google results for "[Park Name] guide" — identify content gaps

Save output as `TrailVerse Blogs/Research/[park-slug]/[park-slug]_research.md` with:
- `parkCode` (4-letter NPS code)
- 3–5 things that make this park genuinely unique
- Visitor stats: annual total, peak months, crowd patterns
- Honest trail difficulty context — dangerous trails, where rescues happen, common mistakes
- Wildlife and park-specific safety
- Seasonal strategy: what changes by season
- Gateway town and logistics (not fees/hours — just what a traveler needs)
- Lesser-known facts, hidden gems, local knowledge
- Backcountry/permit strategy (how to actually get them, not just that they exist)

Do NOT research or include: entrance fees, exact hours, campground site counts or fees,
the named trail list, exact campground reservation links.

---

### Phase 2: Astrophotography [parallel]

Skip if park is Bortle 5+ and not DarkSky certified. Output `astrophotographyEligible: false`.

WebSearch/WebFetch sources:
- `lightpollutionmap.info` — Bortle class at park coordinates
- `darksky.org/dark-sky-places` — certification status and tier
- `nps.gov/subjects/nightskies` — NPS night sky division reports
- PhotoPills or ThePlanIt — Milky Way visibility by latitude/month

Save output as `TrailVerse Blogs/Research/[park-slug]/[park-slug]_astro.md` with:
- Bortle class (1–9) with source URL
- DarkSky certification: tier (Gold/Silver/none), date certified
- SQM reading (mag/arcsec²) per location if available
- 3 best named astrophotography locations — open southern horizon, access notes at night
- Nearest city light dome: direction, altitude, which shooting directions are clean
- Milky Way galactic core window: start/peak/end month for this park's latitude
- 2026 new moon dates for peak months (June, July, August)
- Nikon Z6II settings table (Milky Way / Star Trails / Moon + Landscape)
- 500-rule: 500 ÷ focal length = max shutter seconds
- Notable naked-eye or binocular deep-sky objects
- NPS ranger astronomy programs if any

---

### Phase 3: SEO Analysis [parallel]

Run these WebSearch queries and record top results and gaps.

Article 1 queries: "[Park] complete guide 2026", "[Park] best time to visit",
"[Park] what to know before you go", "[Park] tips first time visitor"

Article 2 queries: "[Park] astrophotography guide", "[Park] milky way photography",
"[Park] dark sky", "nikon z6ii settings [Park]", "[Park] bortle class"

Save output as `TrailVerse Blogs/Research/[park-slug]/[park-slug]_seo.md` with:
- Primary keyword per article + search volume category (high/medium/low)
- 3–4 secondary keywords per article
- Top 3 content gaps per article (what competitors are missing)
- Featured snippet opportunities (queries missing a direct answer at top)
- Recommended H1 for Article 1 and Article 2

---

### Phase 4: Writing [runs after Phases 1 + 2 + 3]

Write both articles using all phase outputs. Follow tone standards and article
structures in the reference files:

- **Tone rules:** `references/tone-standards.md`
- **Article 1 structure + metadata:** `references/article-templates.md`
- **Article 2 structure + metadata:** `references/article-templates.md`
- **Review checklists:** `references/article-templates.md`

Save articles to:
- `TrailVerse Blogs/Complete-Guides/[park-slug]-complete-guide.md`
- `TrailVerse Blogs/Astro-Guides/[park-slug]-astrophotography-guide.md`

**Voice:** First-person ("When I visited…") only if `hasPersonalExperience: true`.
Otherwise second-person ("you'll find", "plan to arrive").

---

### Phase 5: Social [parallel with Phase 4]

Generate social copy for both articles using Phase 1 and 2 outputs.
Save as `TrailVerse Blogs/Research/[park-slug]/[park-slug]_social.md`.

**Social Set A — Complete Guide:**
- Pinterest: 4 pins (best time, what people get wrong, hidden gems, packing list) — 150–200 chars each + [ARTICLE_1_URL]
- X/Twitter: 2 posts (<280 chars) — surprising fact hook + "what I wish I knew" hook
- Instagram: 1 post (100–150 word storytelling caption + 20 hashtags)
- Hashtags: #NationalParks #[ParkNameNoSpaces] #NationalPark #OutdoorTravel

**Social Set B — Astrophotography Guide:**
- Pinterest: 4 pins (Bortle callout, Z6II settings card, best months, gear checklist) — 150–200 chars + [ARTICLE_2_URL]
- X/Twitter: 2 posts (<280 chars) — Bortle stat hook + Milky Way sensory hook
- Instagram: 1 post (150–200 word astrophotography caption + 20 hashtags)
- TikTok/Reel Script: 60-second script [0–3s hook / 3–15s setup / 15–45s 3 things / 45–60s CTA]
- Hashtags: #Astrophotography #MilkyWay #DarkSky #NikonZ6II #[ParkNameNoSpaces]

---

## Final Assembly

After all phases complete:

1. Verify both articles against the review checklists in `references/article-templates.md`
2. Confirm all 6 files exist (5 if no astro guide):
   - `Research/[park-slug]/[park-slug]_research.md`
   - `Research/[park-slug]/[park-slug]_astro.md`
   - `Research/[park-slug]/[park-slug]_seo.md`
   - `Research/[park-slug]/[park-slug]_social.md`
   - `Complete-Guides/[park-slug]-complete-guide.md`
   - `Astro-Guides/[park-slug]-astrophotography-guide.md`
3. Share computer:// links to every saved file. Construct the links using the actual
   workspace path for this session — do not hardcode a session ID. The workspace folder
   is always `TrailVerse Blogs/` inside the mounted directory. Use the Write tool's
   returned path or Bash `pwd` to confirm the full path before building links.
4. Send this completion summary:

```
✅ Content package complete for [Park Name].

Articles:
- [View Complete Guide](<computer:// link to Complete-Guides/[park-full-name]-the-complete-[year]-visitor-guide.md>) (~[X] words)
- [View Astro Guide](<computer:// link to Astro-Guides/[park-full-name]-astrophotography-guide-[year].md>) (~[X] words)

Research files: TrailVerse Blogs/Research/[park-slug]/

Bortle Class: [X] | Dark Sky: [certified tier / not certified]
Review time: ~45 min (complete guide) + ~30 min (astro guide) = ~75 min total
Personal experience to add: [true/false]
```
