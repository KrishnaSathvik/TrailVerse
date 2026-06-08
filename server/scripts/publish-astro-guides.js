#!/usr/bin/env node
/**
 * Publish astrophotography guides from markdown files (YAML frontmatter + HTML or markdown body).
 *
 * Rules:
 *   - publishedAt = parent park guide publishedAt + 2 days (same time-of-day)
 *   - notificationSentAt set immediately → no subscriber emails
 *   - status: published
 *
 * Usage:
 *   node scripts/publish-astro-guides.js --dry-run path/to/guide.md [guide2.md]
 *   node scripts/publish-astro-guides.js --apply path/to/guide.md
 *
 * Frontmatter (required): title, slug, excerpt, category, author, content (HTML)
 * Optional: metaDescription, tags (comma or YAML list), readTime, featuredImage, featured, views
 *
 * Parent guide slug is inferred from frontmatter `relatedArticle` or slug pattern.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const PARENT_SLUGS = {
  'yellowstone-national-park-astrophotography-guide': 'yellowstone-national-park-the-complete-2026-visitor-guide',
  'yellowstone-astrophotography-guide': 'yellowstone-national-park-the-complete-2026-visitor-guide',
  'yosemite-national-park-astrophotography-guide': 'yosemite-national-park-the-complete-2026-visitor-guide',
  'yosemite-astrophotography-guide': 'yosemite-national-park-the-complete-2026-visitor-guide',
};

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }
  const meta = {};
  const lines = match[1].split('\n');
  let key = null;
  let list = null;

  for (const line of lines) {
    if (list) {
      if (/^\s+-\s+/.test(line)) {
        list.push(line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, ''));
        continue;
      }
      if (key) meta[key] = list;
      list = null;
      key = null;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === '') {
      list = [];
      continue;
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      key = null;
      continue;
    }
    meta[key] = val.replace(/^["']|["']$/g, '');
    key = null;
  }
  if (list && key) meta[key] = list;

  return { meta, body: match[2].trim() };
}

function parentSlugFor(meta) {
  if (meta.relatedArticle) return meta.relatedArticle.trim().toLowerCase();
  if (PARENT_SLUGS[meta.slug]) return PARENT_SLUGS[meta.slug];
  return null;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function main() {
  if (!files.length) {
    console.error('Usage: node scripts/publish-astro-guides.js [--dry-run|--apply] file.md [file2.md]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  for (const filePath of files) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      console.error(`❌ File not found: ${abs}`);
      continue;
    }

    const raw = fs.readFileSync(abs, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const slug = (meta.slug || '').trim().toLowerCase();

    if (!meta.title || !slug || !meta.excerpt) {
      console.error(`❌ ${path.basename(filePath)}: missing title, slug, or excerpt in frontmatter`);
      continue;
    }

    const existing = await BlogPost.findOne({ slug }).lean();
    if (existing) {
      console.log(`⏭️  Skip ${slug} — already exists (${existing._id})`);
      continue;
    }

    const parentSlug = parentSlugFor(meta);
    const parent = parentSlug
      ? await BlogPost.findOne({ slug: parentSlug }).select('slug publishedAt title').lean()
      : null;

    if (!parent) {
      console.error(`❌ ${slug}: parent guide not found (${parentSlug || 'unknown'})`);
      continue;
    }

    const publishedAt = addDays(parent.publishedAt, 2);
    const content = meta.content || body;
    if (!content) {
      console.error(`❌ ${slug}: no content (use HTML in frontmatter content: or body after ---)`);
      continue;
    }

    const tags = Array.isArray(meta.tags)
      ? meta.tags
      : typeof meta.tags === 'string'
        ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

    const doc = {
      title: meta.title,
      slug,
      excerpt: meta.excerpt,
      metaDescription: meta.metaDescription || meta.excerpt,
      content: content.startsWith('<') ? content : `<p>${content}</p>`,
      featuredImage: meta.featuredImage || null,
      author: meta.author || 'Krishna',
      category: meta.category || 'Astrophotography',
      tags,
      status: 'published',
      publishedAt,
      scheduledAt: null,
      readTime: Number(meta.readTime) || 14,
      featured: meta.featured === true || meta.featured === 'true',
      seoNoindex: false,
      views: Number(meta.views) || 0,
      notificationSentAt: new Date(),
    };

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${meta.title}`);
    console.log(`  slug:          ${slug}`);
    console.log(`  parent:        ${parent.slug} (${parent.publishedAt.toISOString().slice(0, 10)})`);
    console.log(`  publishedAt:   ${publishedAt.toISOString().slice(0, 19)}Z (+2 days)`);
    console.log(`  notification:  skipped (notificationSentAt preset)`);
    console.log(`  readTime:      ${doc.readTime} min`);
    console.log('');

    if (APPLY) {
      const post = await BlogPost.create(doc);
      console.log(`  ✅ Created ${post._id}\n`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
