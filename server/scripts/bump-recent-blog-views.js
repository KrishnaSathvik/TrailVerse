#!/usr/bin/env node
/**
 * Gradually increase view counts for recently published posts (age-based only).
 *
 * Unlike bump-blog-views.js, this does NOT multiply current views — so it is safe
 * to run weekly on new guides without inflating the whole blog library.
 *
 * Usage:
 *   node scripts/bump-recent-blog-views.js                    # dry-run, last 60 days
 *   node scripts/bump-recent-blog-views.js --apply            # write
 *   node scripts/bump-recent-blog-views.js --slug=my-post-slug # one post
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const APPLY = process.argv.includes('--apply');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const SLUG_FILTER = slugArg ? slugArg.split('=')[1] : null;
const MAX_AGE_DAYS = 60;
const TODAY = new Date();

function daysSince(date) {
  if (!date) return 0;
  return Math.max(0, Math.floor((TODAY - new Date(date)) / 86_400_000));
}

function slugJitter(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h % 97;
}

function getTier(slug, category) {
  if (category === 'national-parks') return 'national-parks';
  if (/complete-2026|2026-crowds-shuttles|2026-visitor-guide/.test(slug)) return 'flagship';
  if (/2026/.test(slug) && /national-park|glacier|yosemite|yellowstone|zion|arches/i.test(slug)) {
    return 'national-parks';
  }
  if (/astrophotography|astro/.test(slug) || category === 'astrophotography') return 'astro';
  if (/thanksgiving|memorial-day|fall|autumn|foliage|cozy-small/.test(slug)) return 'seasonal';
  return 'evergreen';
}

/** Starting floor + daily lift + jitter — caps tighten while post is new */
function gradualTarget(post) {
  const current = post.views || 0;
  const age = daysSince(post.publishedAt);
  const tier = getTier(post.slug, post.category);
  const jitter = slugJitter(post.slug) % 53;

  const base = {
    'national-parks': 380,
    flagship: 380,
    astro: 295,
    seasonal: 340,
    evergreen: 310,
  }[tier] || 310;

  const perDay = {
    'national-parks': 195,
    flagship: 195,
    astro: 158,
    seasonal: 175,
    evergreen: 142,
  }[tier] || 142;

  let target = base + age * perDay + jitter;

  if (age < 3) target = Math.min(target, 720 + jitter);
  else if (age < 7) target = Math.min(target, 1650 + jitter);
  else if (age < 14) target = Math.min(target, 3200 + jitter);
  else if (age < 30) target = Math.min(target, 4600 + jitter);

  return { target: Math.max(current, Math.round(target)), tier, age };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  const query = { status: 'published' };
  if (SLUG_FILTER) query.slug = SLUG_FILTER;

  const posts = await BlogPost.find(query)
    .select('slug title views publishedAt category')
    .sort({ publishedAt: -1 })
    .lean();

  const recent = posts.filter((p) => SLUG_FILTER || daysSince(p.publishedAt) <= MAX_AGE_DAYS);

  if (!recent.length) {
    console.log('No matching published posts.');
    await mongoose.disconnect();
    return;
  }

  const updates = recent.map((post) => {
    const { target, tier, age } = gradualTarget(post);
    return { ...post, target, tier, age, delta: target - (post.views || 0) };
  });

  updates.sort((a, b) => b.publishedAt - a.publishedAt);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${updates.length} post(s)\n`);
  console.log('Target | Was | Tier            | Age | Slug');
  console.log('-'.repeat(95));

  for (const row of updates) {
    const changed = row.delta > 0 ? '+' + row.delta : '—';
    console.log(
      `${String(row.target).padStart(6)} | ${String(row.views || 0).padStart(4)} | ${row.tier.padEnd(15)} | ${String(row.age).padStart(3)}d | ${row.slug} (${changed})`
    );
  }

  const toWrite = updates.filter((row) => row.delta > 0);
  if (!toWrite.length) {
    console.log('\nNothing to update — all recent targets already met.');
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log(`\nWould update ${toWrite.length} post(s). Re-run with --apply to write.`);
    await mongoose.disconnect();
    return;
  }

  const result = await BlogPost.bulkWrite(
    toWrite.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { views: row.target } },
      },
    }))
  );

  console.log(`\n✅ Updated ${result.modifiedCount} post(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
