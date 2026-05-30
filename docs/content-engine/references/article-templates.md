# Article Templates & Review Checklists

---

## Article 1: Complete Visitor Guide

**Target:** Anyone planning a trip — hikers, road trippers, families, first-timers.
**Word count:** 1,200–1,500 words
**Save to:** `TrailVerse Blogs/Complete-Guides/[park-full-name]-the-complete-[year]-visitor-guide.md`
(e.g. `arches-national-park-the-complete-2026-visitor-guide.md`)

### Metadata Block

```
---
parkName: [Full Park Name]
parkCode: [4-letter NPS code]
state: [State]
articleType: complete-guide
primaryKeyword: [from SEO phase]
secondaryKeywords: [array]
searchVolumeCategory: [high/medium/low]
hasPersonalExperience: [true/false]
reviewStatus: needs_review
generatedAt: [YYYY-MM-DD]
relatedArticle: [park-full-name]-astrophotography-guide-[year]

title: [H1 title exactly as written in article]
slug: [park-full-name]-the-complete-[year]-visitor-guide
# e.g. arches-national-park-the-complete-2026-visitor-guide
excerpt: [145-160 chars. Primary keyword included. Hook, not description. Example:
  "Arches dropped its timed entry system in 2026. Here's what changed, when to go,
  which trails are worth it, and what catches first-timers off guard every season."]
author: Krishna
category: National Parks
tags: [park-name], [state], national-parks, hiking, travel-guide
---
```

**Excerpt rules:** 145–160 characters exactly. Primary keyword natural in text.
Write as a hook that makes someone want to click — not a description.

### Structure

**# [H1 from SEO phase]**

INTRO (100–120 words): Primary keyword in first sentence. If there's a key 2026
update (timed entry change, new permit system, road closure) lead with it — that's
the hook. Otherwise hook with the single most surprising or useful thing about this
park. End with a one-line transition. No fees, hours, or campground names.

---

**## [2026 Breaking News — if applicable]**

Cover any significant 2026 policy change completely: what changed, what still requires
booking, parking reality, workarounds. This is what people searched for.

> 📋 **Park hours, entrance fees, live alerts, campground bookings, and trail maps are
> all on the [TrailVerse park page](/parks/{parkCode}) — this guide covers the strategy.**

If no 2026 news → place the callout box immediately after the intro instead.

---

**## Why This Park Is Worth It** (150 words)

Make the case. What does this park offer that nothing else does? Specific — reference
geology, a viewpoint, a trail section, a time of day. Not generic "stunning scenery."
Make someone who hasn't decided yet decide to go.

---

**## When to Go (And Why It Matters)** (200 words)

Tell the reader what CHANGES by season — crowds, trail conditions, wildlife, light,
permit competition. Decision framework, not a list.

| Season | Dates | Temps | Crowd | Best For | Watch Out For |
|---|---|---|---|---|---|
| Spring | Mar–May | | | | |
| Summer | Jun–Aug | | | | |
| Fall | Sep–Oct | | | | |
| Winter | Nov–Feb | | | | |

---

**## The Trails Worth Knowing About** (300 words)

DO NOT list all trails — park page has 50+ named places. Instead give editorial
opinions: which 3–4 are unmissable and why, which do people skip that they shouldn't,
which do people attempt unprepared. Write a paragraph per trail, not a data table.

Example: "Grand View Point is easy but don't underestimate what you're seeing — this
is the view that makes Canyonlands make sense." or "Syncline Loop is where most park
rescues happen. That's not a stat to impress you — it's information."

---

**## What Most People Get Wrong** (100–150 words)

One section of genuine insider advice specific to this park. Could be navigation,
logistics, planning, wildlife, or experience. Must be park-specific — not generic travel advice.

---

**## The Night Sky** (80–100 words)

Don't write the full astro guide here. Establish that this park has exceptional dark
skies, mention Bortle class and DarkSky certification in one sentence, link to Article 2.

> 🌌 **For the full astrophotography guide — Bortle class, Nikon Z6II settings, Milky
> Way calendar, and best shooting locations — read the
> [[Park Name] Astrophotography Guide](/blog/[park-full-name]-astrophotography-guide-[year]).**

---

**## Getting There & Base Camp** (100 words)

Nearest gateway town, drive time from nearest major city, one critical logistics tip
(no GPS in Maze, no gas in park, 4WD required for certain areas). No fees, no exact hours.

---

**## Gear for This Park** (4–5 items)

Each item: 2–3 sentences with WHY specific to this park's conditions.
Format: `[Product Name](affiliate-url) — [why this product]. [Park condition that makes it necessary]. [Usage tip.]`
If affiliate URL unknown: write product name + `[add affiliate URL]`.
Never use `[LINK:REI:...]` placeholder syntax.

---

**## Frequently Asked Questions**

4 Q&As as human-readable content (NOT a JSON code block). Format:

**[Question]**
[Answer in 2–3 conversational sentences with inline hyperlink on key factual claim.]

Topics: best time to visit, comparison with nearest major park, permit/access reality,
how long to spend. NOT fees/hours.

---

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Question]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Plain text answer — no markdown, no links]"
      }
    }
  ]
}
```

This JSON block goes in page `<head>` — NOT in the article body.

**Citation rule:** No Sources section. Hyperlink all factual claims inline. Every key
fact (timed entry news, Bortle class, DarkSky certification, visitor stats) needs an inline link.

---

**## [Newsletter Callout]**

> [NEWSLETTER PLACEHOLDER — insert standard TrailVerse subscribe block here once
> format is finalized. Every article should close with a newsletter CTA driving signups.]

---

## Article 2: Astrophotography Guide

**Only generate if `astrophotographyEligible: true`.**
**Target:** Photographers with mirrorless/DSLR cameras planning a dedicated dark sky trip.
**Word count:** 1,500–1,800 words
**Save to:** `TrailVerse Blogs/Astro-Guides/[park-full-name]-astrophotography-guide-[year].md`
(e.g. `arches-national-park-astrophotography-guide-2026.md`)

### Metadata Block

```
---
parkName: [Full Park Name]
parkCode: [4-letter NPS code]
state: [State]
articleType: astrophotography-guide
primaryKeyword: [from SEO phase]
secondaryKeywords: [array]
searchVolumeCategory: [high/medium/low]
bortleClass: [number]
darkSkyCertified: [true/false]
darkSkyTier: [gold/silver/none]
bestMonths: [Month1, Month2, Month3]
milkyWayWindow: "[Start] – [End], peak [Peak]"
hasPersonalExperience: [true/false]
reviewStatus: needs_review
generatedAt: [YYYY-MM-DD]
relatedArticle: [park-full-name]-the-complete-[year]-visitor-guide

title: [H1 title exactly as written in article]
slug: [park-full-name]-astrophotography-guide-[year]
# e.g. arches-national-park-astrophotography-guide-2026
excerpt: [145-160 chars. Lead with dark sky credential. Example: "[Park] is Bortle
  Class 2 — dark enough to cast Milky Way shadows. Nikon Z6II settings, Milky Way
  calendar, and best shooting locations for 2026."]
author: Krishna
category: Astrophotography
tags: [park-name], [state], astrophotography, milky-way, dark-sky, nikon-z6ii,
  night-photography, national-parks, bortle-class-[number]
---
```

### Structure

**# [H1 from SEO phase — e.g., "[Park] Astrophotography Guide: Bortle Class, Milky Way Calendar & Nikon Z6II Settings (2026)"]**

INTRO (150 words): Open with what this park's sky actually looks like — sensory,
specific. Bortle class and DarkSky status in first paragraph. For photographers only
— link back to complete guide for trip logistics.

> 📋 **For trail info, seasonal strategy, and trip logistics, see the
> [[Park Name] Complete Guide](/blog/[park-full-name]-the-complete-[year]-visitor-guide).
> This article is purely about the night sky.**

---

**## Dark Sky Data**

Featured snippet paragraph first — answers "What is [Park]'s Bortle class?" directly.

"[Park Name] holds a Bortle Class [X] rating, as measured by [source]. The park's
average Sky Quality Meter reading is [X] mag/arcsec². [Park] was certified as a
[Gold/Silver]-Tier International Dark Sky Park by DarkSky International on [date]."

- **Bortle Class:** [X] ([plain English description])
- **Sky Quality:** [X] mag/arcsec² average
- **DarkSky Certification:** [tier] — certified [date]
- **Darkest Site:** [location] (SQM [X])
- **Light Pollution Direction:** [nearest city dome, direction, altitude]

Plain English explanation of what Bortle [X] looks like — what you can see naked eye,
what the Milky Way looks like at this level.

---

**## Milky Way Visibility Calendar**

Opening: galactic core mechanics for this park's latitude — rises SE, transits due
south at X° altitude, sets SW. Why that altitude matters for shooting.

| Month | Core Visible | Hours/Month | Best Window | Notes |
|---|---|---|---|---|
[12 months, accurate for park latitude]

**2026 new moon dates for peak months:** [June, July, August — note which is best]

Light pollution geometry — which directions are clean vs. affected by nearest city dome.

---

**## Best Shooting Locations**

3 named locations from Phase 2 research. Each gets a full paragraph:

**1. [Location Name]** (SQM [X] if measured)
Why it works — horizon direction, openness, SQM. Getting there at night — parking,
walk distance, red headlamp needed. Best season/time. Foreground options. Any city
dome impact.

**2. [Location Name]** — same structure

**3. [Location Name]** — same structure

---

**## Nikon Z6II Settings**

Brief intro — Z6II strengths for astrophotography. State the 500-rule formula.
Plain English only — no sensor spec jargon.

| Scenario | ISO | Aperture | Shutter | White Balance | Lens |
|---|---|---|---|---|---|
| Milky Way Wide Field | | f/ | s | K | NIKKOR Z 14-30mm f/4 S @ 14mm |
| Star Trails (interval stack) | | f/ | s/frame | K fixed | NIKKOR Z 14-30mm f/4 S |
| Moon + Landscape | | f/ | s | K | NIKKOR Z 24-70mm f/2.8 S |

6 Z6II-specific tips (bold label + 1–2 sentences each):
1. **Long Exposure NR: OFF** — why
2. **IBIS/VR: OFF on tripod** — why
3. **Focus:** manual, 10× live view on bright star
4. **Release:** 2-second self-timer or remote
5. **Foreground blending** technique
6. **NPS policy:** no light painting on rock formations

---

**## What to Photograph (Deep Sky Objects)**

150 words. Naked-eye and binocular targets. Season-specific. 2–3 objects max.
Describe what they look like visually — not what they are scientifically.
No magnitude numbers. No cataloguing.

---

**## Ranger Programs & Astronomy Events**

NPS programs at this park — seasonal stargazing events, AstroFest if applicable.
If none, note it and suggest the nearest alternative. No tourism-brochure language.

---

**## Gear for Astrophotography at This Park**

80 words. Specific to conditions (desert heat, cold nights, distance to shooting location).
Lead with the most critical item as a bold bullet.

- **Red headlamp (mandatory)** — [park-specific reason]
- Camera: Nikon Z6II — [add affiliate URL]
- Wide lens: NIKKOR Z 14-30mm f/4 S — [add affiliate URL]
- Star tracker (optional): note when useful at this Bortle level
- PhotoPills — [add affiliate URL]
- Stellarium (free) — [link]

---

**## Frequently Asked Questions**

5 Q&As as human-readable content. Topics: Bortle class, best month, Z6II settings,
best location, moon phase. Do NOT duplicate any FAQ from Article 1.

Then JSON-LD schema block (for `<head>`, not article body) — plain text answers only.

**Citation rule:** Hyperlink all factual claims inline. No Sources section.
Bortle class, DarkSky certification date, SQM data, Milky Way timing, Z6II reference
— all need inline links.

---

**## [Newsletter Callout]**

> [NEWSLETTER PLACEHOLDER — insert standard TrailVerse subscribe block here once
> format is finalized. Every article should close with a newsletter CTA driving signups.]

---

## Review Checklists

### Article 1

- [ ] Primary keyword in first sentence
- [ ] Does NOT mention entrance fees, exact hours, or campground names/fees
- [ ] Does NOT list all trails — only 3–4 with editorial opinion
- [ ] Cross-link callout box to park page present
- [ ] Cross-link to Article 2 in Night Sky section
- [ ] FAQ does not duplicate Article 2 FAQ topics
- [ ] Affiliate placeholders marked `[add affiliate URL]`
- [ ] Minimum 5 inline hyperlinks on factual claims

### Article 2

- [ ] Primary keyword in first sentence
- [ ] Featured snippet paragraph answering "What is [Park]'s Bortle class?"
- [ ] Bortle class cited with specific source URL
- [ ] Camera settings are Nikon Z6II specific — not generic
- [ ] All 3 viewing locations are named (not "find a dark spot")
- [ ] 12-month Milky Way calendar complete
- [ ] 2026 new moon dates for peak months present
- [ ] 500-rule shutter calculations present
- [ ] Does NOT repeat trail data from Article 1
- [ ] Cross-link to Article 1 in intro callout box
- [ ] Affiliate placeholders marked `[add affiliate URL]`
- [ ] Minimum 5 inline hyperlinks including Bortle source and darksky.org
