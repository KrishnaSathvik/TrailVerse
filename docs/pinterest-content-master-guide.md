# TrailVerse Pinterest Content Master Guide

> **Purpose:** One reference doc for creating Pinterest pins for every park and every TrailVerse feature. Fill in the per-park worksheet at the bottom for each destination, then pick pin angles from the feature library.

**Last updated:** June 2026  
**Canonical site:** https://www.nationalparksexplorerusa.com

---

## How to use this guide

1. **Pick a park** (or feature-only pin with no specific park).
2. **Fill in the [Per-park worksheet](#per-park-worksheet-copy-paste-for-each-park)** — hero shot, hook, season, vibe tags.
3. **Choose 1–3 pin angles** from [Feature pin library](#feature-pin-library) (park page, compare, Trailie, discover, etc.).
4. **Match visual + copy** to [Brand & Pinterest specs](#brand--pinterest-specs).
5. **Link every pin** to the most specific URL (park page beats homepage).
6. **Track** board name, pin title, destination URL, and publish date in your spreadsheet.

---

## Brand & Pinterest specs

### Identity

| Item | Value |
|------|--------|
| **Brand** | TrailVerse |
| **Tagline** | Your Universe of National Parks Exploration |
| **AI persona** | **Trailie** — insider travel buddy (not a generic chatbot) |
| **Scope** | **470+ NPS sites** — not just the 63 “National Park” designations |
| **Free to browse** | No account required for explore, compare, park pages, discover |

### Voice (Pinterest captions)

Write like a sharp friend who’s been to the park — not a brochure.

- **Do:** contractions, specific viewpoints/trails, honest downsides, “skip the crowd, try…”
- **Do:** lead with the useful fact (best time, one must-see, one closure tip)
- **Don’t:** “revolutionary platform,” “ultimate solution,” vague hype
- **Don’t:** end with “Want me to plan more?” — give a clear CTA instead

**Caption length:** Pinterest favors searchable text. Aim for **100–300 characters** on the image overlay; **150–500 characters** in the description (keywords + CTA).

### Visual

| Element | Guideline |
|---------|-----------|
| **Primary green** | `#10b981` (buttons, accents) |
| **Dark forest** | `#064e3b` (headers, overlays) |
| **Fonts** | Geist (headlines), Bricolage Grotesque (body) — match site when designing in Canva/Figma |
| **Imagery** | Real park photos (NPS/Unsplash where licensed); avoid stock that doesn’t match the park |
| **Logo** | TrailVerse wordmark or compass icon; clear space around logo |
| **Text on image** | High contrast; max **5–8 words** on pin art for mobile readability |

### Pinterest technical

| Format | Size | Use |
|--------|------|-----|
| **Standard pin** | 1000 × 1500 px (2:3) | Default — itineraries, lists, park heroes |
| **Square** | 1000 × 1000 px | Comparisons, before/after seasons |
| **Idea pin** | 1080 × 1920 px (9:16) | Multi-step “how to plan” or “3 days in…” |

**Link:** Always use full `https://www.nationalparksexplorerusa.com/...` URLs.

### Hashtags (rotate 3–8 per pin)

`#NationalParks` `#NationalParkTrip` `#ParkTravel` `#HikingUSA` `#RoadTripUSA` `#TravelPlanning` `#TrailVerse` `#VisitNationalParks` + park-specific (`#YellowstoneNationalPark`) + vibe (`#Stargazing` `#FallColors` `#FamilyTravel`)

---

## URL cheat sheet

Base: `https://www.nationalparksexplorerusa.com`

### Core product pages

| Feature | URL | One-line value |
|---------|-----|----------------|
| **Home** | `/` | Hero search, featured parks, Park of the Day |
| **Explore** | `/explore` | Browse/filter all 470+ parks; “National Parks Only” toggle (~64) |
| **Park detail** | `/parks/{slug}` | Live weather, alerts, tabs, permits, reviews |
| **Compare** | `/compare` | Side-by-side 2–4 parks |
| **Compare (pre-filled)** | `/compare?parks={code1},{code2}` | e.g. `yell,yose` |
| **Map** | `/map` | Interactive nationwide map |
| **Discover hub** | `/discover` | Browse by activity, type, state, topic |
| **Events** | `/events` | Ranger programs & NPS events |
| **Trailie (Plan AI)** | `/plan-ai` | AI trip planner chat |
| **Guides hub** | `/guides` | Editorial + “Parks by vibe” ranked lists |
| **ChatGPT app** | `/chatgpt` | Install TrailVerse in ChatGPT |
| **Claude MCP** | `/mcp` | Connect TrailVerse to Claude |
| **Features** | `/features` | Full capability overview |
| **Blog** | `/blog` | Trip planning & park guides |

### Park URL pattern

```
/parks/yellowstone-national-park
/parks/zion-national-park
/parks/acadia-national-park
```

Slug = full park name in kebab-case (`parkToSlug(fullName)`). Short NPS codes redirect to slug.

### Discover dimension URLs

| Dimension | Hub | Example detail |
|-----------|-----|----------------|
| Activities | `/discover/activities` | `/discover/activity/hiking` |
| Park types | `/discover/types` | `/discover/type/national-monument` |
| States | `/discover/states` | `/discover/state/utah` (state grids use `/parks/state/{state}`) |
| Topics | `/discover/topics` | `/discover/topic/stargazing` |

**Nav label:** “Explore by Activity” (URL stays `/discover`).

### Park picks — ranked vibe pages

Use when the pin matches a **trip vibe** (link park + list page):

| Vibe | URL |
|------|-----|
| Couples | `/parks-for-couples` |
| Photography | `/parks-for-photography` |
| Ocean / coast | `/ocean-national-parks` |
| Fall color | `/fall-color-parks` |
| Quiet / less crowded | `/quiet-national-parks` |
| Dark sky / astro | `/dark-sky-parks` |
| Families | `/parks-for-families` |
| First-timers | `/parks-for-first-timers` |
| Dog-friendly | `/dog-friendly-parks` |
| Winter | `/winter-national-parks` |
| Accessible | `/accessible-national-parks` |
| Wildlife | `/wildlife-national-parks` |

### Editorial guides (`/guides/{slug}`)

| Guide | Slug |
|-------|------|
| Best free trip planner (2026) | `best-free-national-park-trip-planner` |
| TrailVerse vs AllTrails | `trailverse-vs-alltrails` |
| Plan parks in ChatGPT | `plan-national-parks-in-chatgpt` |
| Yosemite vs Yellowstone (first-timers) | `yosemite-vs-yellowstone-first-timers` |
| Best national park apps 2026 | `best-national-park-apps-2026` |
| TrailVerse vs Recreation.gov & NPS app | `trailverse-vs-recreation-gov-and-nps-app` |
| How to compare parks on TrailVerse | `how-to-compare-national-parks-on-trailverse` |
| Permits & reservations | `how-to-find-national-park-permits-and-reservations` |

### External distribution

| Channel | Landing | Notes |
|---------|---------|-------|
| **ChatGPT App** | `/chatgpt` | 5 tools: plan, details, compare, search, events |
| **Claude MCP** | `/mcp` | Connector: `https://trailverse-mcp.onrender.com/mcp` |
| **Voice** | Any page — mic button (bottom right) | “Talk to Trailie” — live weather, alerts, compare |

---

## Feature pin library

Use these angles repeatedly. Swap park name, photo, and URL.

---

### 1. Park detail page (`/parks/{slug}`)

**This is your #1 Pinterest destination URL** — one page per park with live data, planning CTAs, and deep links into every tab.

#### URL patterns

| Link type | Pattern | Example |
|-----------|---------|---------|
| **Canonical park page** | `/parks/{slug}` | `/parks/yellowstone-national-park` |
| **Deep link to a tab** | `/parks/{slug}?tab={tabId}` | `/parks/zion-national-park?tab=alerts` |
| **Plan with Trailie (pre-filled)** | `/plan-ai?park={npsCode}&name={encodedName}` | `/plan-ai?park=yell&name=Yellowstone%20National%20Park` |
| **Compare (park pre-selected)** | `/compare?park={npsCode}` | `/compare?park=grca` |
| **Map (park centered)** | `/map?park={npsCode}` | `/map?park=acad` |
| **Crowd calendar** (tier parks) | `/reports/when-to-go?park={CODE}` | `/reports/when-to-go?park=YELL` |

**Slug rule:** full park name in kebab-case (`yellowstone-national-park`). Short codes like `/parks/yell` redirect to the slug.

**Tab IDs for deep links:**

`overview` · `alerts` · `places` · `activities` · `tours` · `visitorcenters` · `camping` · `parking` · `facilities` · `transit` · `brochures` · `permits` · `photos` · `videos` · `webcams` · `reviews`

(`transit` only appears for parks with GTFS shuttle data — Zion, Grand Canyon, etc.)

---

#### Page anatomy (top → bottom)

Use this map when choosing **what to screenshot** or **what to promise** in pin copy.

```
┌─────────────────────────────────────────────────────────────┐
│ HERO — full-width park photo                                │
│   • Park name + state badge                                 │
│   • Mark Visited · Favorite · Share                         │
├─────────────────────────────────────────────────────────────┤
│ QUICK INFO CARDS (3-up)                                     │
│   • Hours summary                                           │
│   • Entrance fee ($ or Free)                                │
│   • Phone + link to official NPS site                       │
├─────────────────────────────────────────────────────────────┤
│ TRAILIE PLAN BLOCK — “[Park] at a glance”                   │
│   • Best time · Trip length · Don’t miss · Nearby city      │
│   • [Plan with Trailie] button → /plan-ai?park=…            │
│   • Compare parks link → /compare?park=…                    │
├─────────────────────────────────────────────────────────────┤
│ TABS (scrollable) — badge counts on Alerts / Permits / Reviews│
│   [Overview] [Alerts] [What to See] [Things to Do] …        │
│   Tab content area (lazy-loaded per tab)                    │
├──────────────────────────┬──────────────────────────────────┤
│ MAIN COLUMN            │ SIDEBAR (desktop)                  │
│                        │ • Live weather widget (5-day)      │
│                        │ • Location + View on Map           │
│                        │ • Google Maps + Directions         │
│                        │ • Around This Park (lodging, food, │
│                        │   gas, attractions nearby)         │
│                        │ • Crowd Calendar (select parks)      │
│                        │ • Planning Guides hub link         │
│                        │ • Blog / Astro guides (if exist)   │
├──────────────────────────┴──────────────────────────────────┤
│ PLANNING FAQ — common questions with tab deep links         │
├─────────────────────────────────────────────────────────────┤
│ YOU MIGHT ALSO LIKE — related parks in same state(s)        │
└─────────────────────────────────────────────────────────────┘
```

**Voice button:** “Talk to Trailie” (mic, bottom-right sitewide) pre-loads this park’s live data when opened from the park page.

---

#### What’s live vs. static (important for pin copy)

| Data | Updates | Pinterest copy tip |
|------|---------|-------------------|
| **Weather** | Live (OpenWeather) | Say “check current weather” — don’t hard-code temps on pins |
| **NPS alerts** | Live from NPS API | Strong hook: “closures today,” “is it open?” |
| **Entrance fees & hours** | NPS data (refreshed) | OK to mention “see current fee on TrailVerse” |
| **Permits / Recreation.gov links** | Pulled per park | Great for timed-entry parks (Zion, Yosemite, etc.) |
| **Events** | Live NPS feed | Link `/events` or park page + Events CTA |
| **Reviews** | User-generated | Social proof pins — “read visitor reviews” |
| **Planning snapshot** | Editorial + park traits | “Best time,” “Don’t miss” — safe for pin overlay text |
| **Crowd calendar** | Seasonal report data | “When to visit [Park]” pins |

---

#### Tab-by-tab → Pinterest pin angles

| Tab | User label | Pin angle | Deep link |
|-----|------------|-----------|-----------|
| **overview** | Overview | “Everything about [Park] in one place” | `/parks/{slug}` |
| **alerts** | Alerts | “[Park] closures & safety alerts today” | `?tab=alerts` |
| **places** | What to See | “Best viewpoints & landmarks at [Park]” | `?tab=places` |
| **activities** | Things to Do | “Hiking, camping & activities at [Park]” | `?tab=activities` |
| **tours** | Self-Guided Tours | “Free self-guided tours at [Park]” | `?tab=tours` |
| **visitorcenters** | Visitor Centers | “Visitor centers & hours at [Park]” | `?tab=visitorcenters` |
| **camping** | Where to Stay | “Campgrounds & lodging near [Park]” | `?tab=camping` |
| **parking** | Parking & Access | “Where to park at [Park]” | `?tab=parking` |
| **facilities** | Amenities | “Restrooms, food & Wi‑Fi at [Park]” | `?tab=facilities` |
| **transit** | Transit | “Shuttle schedules at [Park]” (GTFS parks) | `?tab=transit` |
| **brochures** | Brochures | “Official park brochures (PDF)” | `?tab=brochures` |
| **permits** | Permits | “[Park] permits & timed entry” | `?tab=permits` |
| **photos** | Photos | Photo carousel / inspo board fuel | `?tab=photos` |
| **videos** | Videos | “Park films & videos” | `?tab=videos` |
| **webcams** | Webcams | “See [Park] live right now” | `?tab=webcams` |
| **reviews** | Reviews | “What visitors say about [Park]” | `?tab=reviews` |

---

#### Hero & quick-info pin ideas

| Pin title (overlay) | What to show | Link |
|---------------------|--------------|------|
| `Plan Your [Park] Trip` | Hero photo + TrailVerse logo | `/parks/{slug}` |
| `[Park] — Hours, Fees & Contact` | 3 quick-info cards mockup | `/parks/{slug}` |
| `[Park] at a Glance` | Best time / trip length / don’t miss grid | `/parks/{slug}` |
| `Mark [Park] Off Your Bucket List` | Hero + “Visited” CTA vibe | `/parks/{slug}` |

---

#### Sidebar & planning pin ideas

| Pin title | Hook | Link |
|-----------|------|------|
| `[Park] Weather This Week` | Live 5-day forecast widget | `/parks/{slug}` |
| `How to Get to [Park]` | Directions + map buttons | `/parks/{slug}` |
| `Where to Stay Near [Park]` | “Around This Park” lodging/food | `/parks/{slug}` |
| `When to Visit [Park]` | Crowd calendar callout | `/reports/when-to-go?park={CODE}` |
| `Plan [Park] with Trailie` | Trailie avatar + itinerary promise | `/plan-ai?park={code}&name=…` |
| `Compare [Park] to Other Parks` | Split-screen compare graphic | `/compare?park={code}` |

---

#### High-intent pin templates (copy-paste)

**Alerts / conditions**
> Planning [Park]? Check live NPS alerts and weather before you go — closures, fees, and permits in one free page.  
> → nationalparksexplorerusa.com/parks/[slug]

**Permits / timed entry**
> [Park] timed entry & permits — Recreation.gov links pulled together on TrailVerse. Check before you book.  
> → …/parks/[slug]?tab=permits

**Itinerary**
> [Park] at a glance: best time, trip length, and what not to miss — then ask Trailie for a day-by-day plan.  
> → …/plan-ai?park=[code]

**Webcam / FOMO**
> See [Park] right now — live webcams on TrailVerse.  
> → …/parks/[slug]?tab=webcams

---

#### Pinterest boards → park page strategy

| Board type | Lead with this tab/angle |
|------------|---------------------------|
| `[Park] Travel` | Hero + overview |
| `[Park] Hiking` | `?tab=activities` or `?tab=places` |
| `National Park Permits` | `?tab=permits` |
| `Park Closures & Alerts` | `?tab=alerts` |
| `Camping National Parks` | `?tab=camping` |
| `Dark Sky / Astro` | Webcams + link to `/dark-sky-parks` if featured |

**Default CTA:** “See live conditions on TrailVerse →”  
**Primary link:** always `/parks/{slug}` unless the pin is specifically about permits, alerts, or webcams (then use deep link).

---

### 2. Explore (`/explore`)

**Best for:** “National parks list,” state trip boards, bucket lists.

**Hook ideas:**
- “470+ parks & sites — not just the famous 63.”
- “Find every NPS park in [State].”
- “National Parks Only toggle: 64 headline parks in one grid.”

**Pin types:**
| Pin title | Link |
|-----------|------|
| `All 470+ National Park Service Sites` | `/explore` |
| `Best National Parks in [State]` | `/explore` + caption mentions state filter |
| `National Parks vs Monuments — Browse Both` | `/explore` |

**Key message:** TrailVerse is the **directory** — discover before you deep-dive one park.

---

### 3. Compare (`/compare`)

**Best for:** Decision pins — “which park should I visit?”

**Hook ideas:**
- “[Park A] vs [Park B] — weather, fees, crowds side by side.”
- “Can’t pick between Utah parks? Compare them free.”
- “We compared [Park A] and [Park B] so you don’t have to.”

**Pin types:**
| Pin title | Link |
|-----------|------|
| `[Park A] vs [Park B]: Which Should You Visit?` | `/compare?parks={code1},{code2}` |
| `Compare Up to 4 National Parks Free` | `/compare` |
| `First Timer? Compare These Two Parks` | pre-filled compare URL |

**Visual:** Split image (left park / right park) + 3-row table (weather, fee, crowd).

**Codes for compare URL:** Use NPS 4-letter codes (e.g. `zion` → `zion`, `yell`, `grca`, `yose`).

---

### 4. Discover / Explore by Activity (`/discover`)

**Best for:** Activity-based boards — hiking, camping, stargazing, history.

**Hook ideas:**
- “Find parks for [hiking / stargazing / camping] across the U.S.”
- “Not sure which park? Start with what you want to do.”
- “[Activity] in national parks — browse by activity.”

**Pin types:**
| Pin title | Link |
|-----------|------|
| `National Parks for [Activity]` | `/discover/activity/{slug}` |
| `Find Your Kind of Park` | `/discover` |
| `[Park] — great for [activity]` | Park URL + mention discover in caption |

**Dimensions:** Activities, Types (monument, seashore…), States, Topics (animals, military…).

---

### 5. Events (`/events`)

**Best for:** Ranger programs, seasonal events, family travel.

**Hook ideas:**
- “Free ranger programs at [Park] this month.”
- “Star parties, guided walks & tours — live NPS events.”
- “What’s happening at national parks near you?”

**Pin types:**
| Pin title | Link |
|-----------|------|
| `Ranger Programs at [Park]` | `/events` (filter in caption) or park page Events CTA |
| `National Park Events Calendar` | `/events` |
| `Plan Around [Park] Ranger Programs` | `/plan-ai` |

---

### 6. Trailie / Plan AI (`/plan-ai`)

**Best for:** Itinerary pins, “AI trip planner,” multi-day road trips.

**Hook ideas:**
- “Ask Trailie for a [3-day] [Park] itinerary — live alerts included.”
- “Day-by-day [Park] plan in minutes (free to try).”
- “Your [Park] trip, built with live NPS data.”

**What Trailie does:**
- Day-by-day itineraries (dates, budget, group, fitness)
- Weaves in **live closures, weather, events, permits**
- Smart routing (Claude for quick tips, OpenAI for structured plans)
- Free anonymous messages; account saves history & export

**Pin types:**
| Pin title | Link |
|-----------|------|
| `Plan Your [Park] Trip with Trailie` | `/plan-ai` |
| `[X]-Day [Park] Itinerary` | `/plan-ai` |
| `AI National Park Planner — Free` | `/plan-ai` |

**Sample prompts for caption/Idea pin:**
- “Plan a 4-day Zion trip in October with two kids.”
- “Build a photography road trip through Utah parks.”
- “What should I pack for Yellowstone in September?”

---

### 7. Voice — Talk to Trailie (site-wide mic)

**Best for:** Hands-free planning, mobile travelers, tech-curious audience.

**Hook ideas:**
- “Ask Trailie out loud: ‘Any closures at [Park] right now?’”
- “Hands-free national park answers — live weather & alerts.”
- “Talk to Trailie while you browse [Park].”

**Pin types:**
| Pin title | Link |
|-----------|------|
| `Talk to Trailie — Voice Park Planning` | `/features` or park page |
| `Ask About [Park] Hands-Free` | `/parks/{slug}` |

**Sample voice questions:** weather, closures, compare two parks, events this week, parks near me.

---

### 8. Map (`/map`)

**Best for:** Road trip boards, visual planners.

**Hook ideas:**
- “Map every national park in the U.S.”
- “Plan your route — parks, campgrounds, places on one map.”
- “[Region] national parks on an interactive map.”

**Link:** `/map`

---

### 9. Guides hub & editorial (`/guides`)

**Best for:** “How to plan,” tool comparisons, SEO long-tail.

**Pin types:**
| Pin title | Link |
|-----------|------|
| `Best Free National Park Trip Planner (2026)` | `/guides/best-free-national-park-trip-planner` |
| `TrailVerse vs AllTrails — When to Use Each` | `/guides/trailverse-vs-alltrails` |
| `How to Find Park Permits & Reservations` | `/guides/how-to-find-national-park-permits-and-reservations` |
| `Yosemite vs Yellowstone for First-Timers` | `/guides/yosemite-vs-yellowstone-first-timers` |

---

### 10. Park picks / vibe pages

**Best for:** Mood boards — couples, astro, fall color, families, etc.

**Pattern:** Feature **[Park]** as one of the standouts on the vibe list.

| Example pin title | Link |
|-------------------|------|
| `Best National Parks for Couples — includes [Park]` | `/parks-for-couples` |
| `Dark Sky Parks — stargazing at [Park]` | `/dark-sky-parks` |
| `Quiet National Parks — escape crowds at [Park]` | `/quiet-national-parks` |
| `Best Parks for Photography — [Park]` | `/parks-for-photography` |

Check `next-frontend/src/data/intentLandings.js` for editorial **standout blurbs** per park on each vibe page.

---

### 11. ChatGPT app (`/chatgpt`)

**Best for:** ChatGPT users, AI travel boards.

**Hook ideas:**
- “Plan [Park] inside ChatGPT — live weather & alerts.”
- “470+ parks in ChatGPT with the TrailVerse app.”
- “‘Compare Zion and Bryce’ — right in ChatGPT.”

**5 tools:** Plan trip · Park details · Compare · Search · Events (+ multi-turn)

**Example prompts:**
- “Plan a 5-day Yellowstone trip in September.”
- “Is Going-to-the-Sun Road open right now?”
- “Compare Zion and Grand Canyon for families in June.”

**Link:** `/chatgpt`

---

### 12. Claude MCP (`/mcp`)

**Best for:** Claude users, developer-adjacent travel tech audience.

**Hook ideas:**
- “Connect Claude to live national park data.”
- “Ask Claude about [Park] with real-time NPS alerts.”
- “470+ parks inside Claude — TrailVerse MCP.”

**Link:** `/mcp` (connector URL in caption for install-minded users)

---

### 13. Blog (`/blog`)

**Best for:** Deep guides, seasonal content, astrophotography.

**Pin pattern:** Hero from post → link to `/blog/{slug}`  
Categories: trip-planning, park-guides, gear-packing, seasonal, astrophotography, budget-travel.

---

### 14. Cross-feature “stack” pins

Combine messages for higher intent:

| Stack | Pin angle | Primary link |
|-------|-----------|--------------|
| Discover → Compare → Plan | “3-step park picking” | `/discover` |
| Park page → Trailie | “Checked alerts? Now build your itinerary” | `/plan-ai` |
| Compare → Plan | “Picked your park? Plan the days” | `/plan-ai` |
| ChatGPT / Claude → Website | “Unlimited planning on the site” | `/plan-ai` |

---

## Per-park worksheet (copy-paste for each park)

```text
PARK WORKSHEET — _________________________________
Date filled: __________   Pinterest board: __________

── Identity ──
Full name:
NPS code (4 letters):
State(s):
Designation (National Park / Monument / Seashore / …):
Canonical URL: https://www.nationalparksexplorerusa.com/parks/
Compare URL (vs rival): /compare?parks=____,____
Compare URL (pre-selected): /compare?park=____
Plan with Trailie URL: /plan-ai?park=____&name=
Map URL: /map?park=____
Crowd calendar URL: /reports/when-to-go?park=____ (uppercase code)

Deep-link tabs (check pins to create):
□ ?tab=alerts  □ ?tab=permits  □ ?tab=activities  □ ?tab=camping
□ ?tab=places  □ ?tab=webcams  □ ?tab=reviews  □ ?tab=transit

── Pinterest hooks ──
One-line hook (≤8 words for pin art):
Best season to promote:
Second season angle:
Signature viewpoint / trail / drive:
Honest downside (crowds, heat, closures):
Insider tip (Trailie voice):

── Vibe tags (check all that apply) ──
□ Couples  □ Photography  □ Ocean  □ Fall color  □ Quiet
□ Dark sky  □ Families  □ First-timers  □ Dog-friendly
□ Winter  □ Accessible  □ Wildlife
→ Link matching vibe page if checked

── Discover angles ──
Top activities (hiking, camping, …):
Park type slug:
State browse link: /parks/state/{state-slug}
Topic tags (stargazing, wildlife, …):

── Pin queue (check when published) ──
□ Hero — park detail page
□ Live weather & alerts
□ Permits / timed entry
□ Compare vs [rival park]
□ [X]-day Trailie itinerary
□ Discover by [activity]
□ Events / ranger programs
□ Vibe list feature
□ Map / road trip context
□ Voice / “Ask Trailie”
□ ChatGPT example prompt
□ Blog tie-in (if post exists)

── Assets ──
Hero image source / credit:
Alt pin images (season × 2):
Brand green overlay Y/N

── SEO keywords for description ──
Primary:
Secondary:
Long-tail:
```

---

## Copy templates

### Pin titles (overlay text)

```
[Park] Trip Planner
[Park] — Live Weather & Alerts
[Park] vs [Park]: Compare Free
[X]-Day [Park] Itinerary
Best Time to Visit [Park]
[Park] Permits & Reservations
Plan [Park] with Trailie
[Park] Ranger Programs
National Parks in [State]
470+ Parks — Explore Free
```

### Description formula

```
[Hook — specific fact or question]. 
TrailVerse shows live [weather/alerts/fees] for [Park] and 470+ NPS sites. 
[CTA sentence with benefit]. 
Free to browse — no account needed.

#NationalParks #[ParkHashtag] #TrailVerse #TravelPlanning
```

### CTA lines (pick one)

- “Check live conditions →”
- “Plan your trip with Trailie →”
- “Compare parks free →”
- “Browse 470+ parks →”
- “Find ranger events →”
- “Explore by activity →”
- “Try in ChatGPT →”
- “Connect in Claude →”

---

## Example: Yellowstone (filled worksheet + 6 pins)

| # | Pin title | Type | URL |
|---|-----------|------|-----|
| 1 | Yellowstone — Live Weather & Alerts | Park detail | `/parks/yellowstone-national-park` |
| 2 | Yellowstone vs Grand Teton | Compare | `/compare?parks=yell,grte` |
| 3 | 5-Day Yellowstone Itinerary | Trailie | `/plan-ai` |
| 4 | Best Parks for Wildlife — Yellowstone | Vibe | `/wildlife-national-parks` |
| 5 | Ranger Programs in Yellowstone | Events | `/events` |
| 6 | Ask Trailie About Yellowstone | Voice | `/parks/yellowstone-national-park` |

**Sample description (pin 1):**  
“Bison jams and geyser basins — but check what's closed before you go. TrailVerse pulls live NPS alerts and weather for Yellowstone (and 470+ other sites). Free trip planning, compare, and AI itineraries. Check live conditions →”

---

## Board strategy (suggested)

| Board name | Content mix |
|------------|-------------|
| **National Park Trip Planning** | Trailie, guides, compare, permits |
| **[Park Name] Travel** | One board per tier-A park (repeat worksheet) |
| **US National Parks List** | Explore, 470+ message, state grids |
| **National Park Road Trips** | Map, compare, multi-park itineraries |
| **Hiking & Outdoor USA** | Discover activities, park trails |
| **Photography & Stargazing** | Dark sky + photography vibe pages |
| **Family National Park Vacations** | Families vibe, events, easy hikes |
| **Fall Color & Seasonal Parks** | Fall color, winter, seasonal blog posts |
| **AI Travel Tools** | ChatGPT, Claude MCP, Trailie |
| **TrailVerse Tips** | Features, how-to guides, product updates |

---

## Content calendar rhythm

| Week | Suggested focus |
|------|-----------------|
| 1 | 2× tier-A park heroes (park page links) |
| 2 | 1× compare pin + 1× discover/activity pin |
| 3 | 1× Trailie itinerary + 1× events/seasonal |
| 4 | 1× vibe list + 1× ChatGPT/Claude or guide pin |

**Seasonal spikes:** cherry blossom (DC sites), summer timed-entry, fall color (Sep–Oct), winter parks (Dec–Feb), spring break road trips (Mar–Apr).

---

## Compliance & quality

- **NPS data:** Weather/alerts/fees change — prefer “check live on TrailVerse” over hard-coding numbers on pins unless you refresh often.
- **Photos:** Use rights-cleared images; credit when required.
- **Claims:** “470+ sites” and “free to browse” are accurate; don’t promise unlimited free AI without noting anonymous limits.
- **UTM (optional):** `?utm_source=pinterest&utm_medium=social&utm_campaign={board}` for analytics.

---

## Quick reference — what TrailVerse is NOT

Helps keep Pinterest copy honest:

| TrailVerse IS | TrailVerse is NOT |
|---------------|-------------------|
| Discover → compare → plan hub for **all NPS sites** | A trail GPS app (that’s AllTrails on the hike) |
| Live **NPS alerts & weather** on park pages | Official NPS app replacement for backcountry permits |
| **Trailie** AI with live context | Generic ChatGPT without live park tools |
| Free browse, compare, park pages | Paid gate for basic park info |
| ChatGPT app + Claude MCP + website | Only a website |

---

## Related internal docs

- `docs/TRAILVERSE_BRAND_GUIDELINES.md` — colors, typography, voice
- `docs/voice-chat-social-posts.md` — voice feature angles
- `next-frontend/src/data/intentLandings.js` — vibe page standouts per park
- `next-frontend/src/data/guides.js` — editorial guide copy
- `.cursor/rules/01-frontend-pages.mdc` — full route map

---

*TrailVerse Pinterest Master Guide v1.0 — for marketing & content use.*
