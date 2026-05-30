# TrailVerse Content Engine (repo copy)

Canonical workflow for **park Complete Guides** and **Astro Guides**.

- **Skill (Cowork):** `SKILL.md` in this folder (cloned from Claude plugin skill)
- **Templates:** `references/article-templates.md`, `references/tone-standards.md`
- **Output layout:** `TrailVerse Blogs/Complete-Guides/`, `Astro-Guides/`, `Research/[park-slug]/`

## Cursor vs Cowork

| Tool | Cowork skill | This repo |
|------|----------------|-----------|
| Research | WebSearch, WebFetch | Run skill in Cowork, or research manually + save under `Research/` |
| Publish | Write `.md` files | Copy HTML/metadata into admin, or future import script |

## What the park page already shows

Do **not** repeat in articles: fees, hours, full trail lists, campground tables, etc.  
See `SKILL.md` → **CRITICAL: What the Park Page Already Shows**.

Point readers to `/parks/{parkCode}` for live data.

## Draft tiers

| Tier | Location | Use |
|------|----------|-----|
| **Content package** | `TrailVerse Blogs/` | Production-ready Complete + Astro guides (phases 1–5) |
| **SEO/editorial sketches** | `../seo/blog-drafts/` | Deprecated — old AI sketches removed; use content packages only |
| **Live blog** | MongoDB via admin | Published posts |

## Non-park articles

Comparisons, mistake lists, and Milky Way pillar posts are **not** in the Cowork skill today.  
See `NON-PARK-ARTICLES.md` for a lightweight template until the skill is extended.

## First content package (complete)

**Zion National Park** — `reviewStatus: needs_review`

| File | Path |
|------|------|
| Complete guide | `TrailVerse Blogs/Complete-Guides/zion-national-park-the-complete-2026-visitor-guide.md` |
| Astro guide | `TrailVerse Blogs/Astro-Guides/zion-national-park-astrophotography-guide-2026.md` |
| Research | `TrailVerse Blogs/Research/zion-national-park/` (`_research`, `_astro`, `_seo`, `_social`) |

Copy into admin blog when ready; slugs match frontmatter. Live MongoDB posts were **not** reverted — only local drafts replaced.
