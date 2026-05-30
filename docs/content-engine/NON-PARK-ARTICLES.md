# Non-park articles (outside content engine v0.1)

The Cowork **trailverse-content-engine** skill only defines:

- `[park]-complete-guide.md`
- `[park]-astrophotography-guide.md` (Bortle 1–4)

These **P0 SEO articles** need a sibling template (future skill version):

| Type | Examples | Target words |
|------|----------|--------------|
| Comparison | Yosemite vs Yellowstone; Zion vs Bryce | 1,400–1,800 |
| Mistakes | 9 First-Timer Mistakes 2026 | 1,200–1,500 |
| Pillar | Best Parks for Milky Way 2026 | 1,500–2,000 |

## Shared rules (same as park guides)

- Do not duplicate park page fee/hour/trail tables
- Link to `/parks/{slug}` and existing `/blog/` guides
- Excerpt 145–160 chars (hook, not description)
- Tone: `references/tone-standards.md` Article 1 voice
- Max 4 sentences per paragraph
- FAQ block (4 Q&A) + JSON-LD FAQ schema in `seoSchema` field at publish

## Comparison structure

1. **Intro** — who this is for, 30-second verdict
2. **Side-by-side table** — crowds, trip shape, best season (not fees)
3. **Park A deep slice** — 2–3 paragraphs
4. **Park B deep slice** — 2–3 paragraphs
5. **3-day sample itineraries** (optional)
6. **Who should skip which**
7. **Final pick** + links to Complete Guides

## Mistakes structure

1. Intro — planning myths vs 2026 reality
2. **9 numbered mistakes** — mistake / reality / fix (each ~120 words)
3. Pre-trip checklist
4. Link to first-timers + crowd calendar

## Pillar structure (astro)

1. How we rank (Bortle, access, foreground, season)
2. Tier 1 parks with links to **existing** astro guides
3. Moon phase + season table
4. Z6II starter settings (not a full park guide)
5. Safety + sample multi-night loop

## Where sketches live

`docs/seo/blog-drafts/` — copy into engine format before final review.
