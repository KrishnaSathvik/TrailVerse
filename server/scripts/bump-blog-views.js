#!/usr/bin/env node
/**
 * Rebalance blog view counts to feel credible for a growing NPS planning site.
 *
 * Logic (only increases — never lowers existing counts):
 *   - Base + tier bonus + age bonus (older posts earn more over time)
 *   - Scales current relative performance (a post that already outperforms keeps ranking higher)
 *   - Small deterministic jitter per slug (avoids round-number fakery)
 *   - Tier minimums: flagship park guides > seasonal > evergreen > astro niche
 *   - Very new posts (<14 days) capped so they don't leapfrog established guides
 *
 * Usage:
 *   node scripts/bump-blog-views.js           # dry-run preview
 *   node scripts/bump-blog-views.js --apply   # write to MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const APPLY = process.argv.includes('--apply');
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

function getTier(slug) {
  if (/complete-2026|2026-crowds-shuttles|2026-visitor-guide/.test(slug)) return 'flagship';
  if (/astrophotography/.test(slug)) return 'astro';
  if (/thanksgiving|memorial-day|fall|autumn|foliage|cozy-small/.test(slug)) return 'seasonal';
  return 'evergreen';
}

const TIER_MIN = { flagship: 4500, astro: 2900, seasonal: 3400, evergreen: 2700 };
const TIER_BONUS = { flagship: 2400, astro: 950, seasonal: 1500, evergreen: 1150 };
const TIER_MULT = { flagship: 11, astro: 8.5, seasonal: 9.5, evergreen: 8 };

function targetViews(post) {
  const current = post.views || 0;
  const tier = getTier(post.slug);
  const age = daysSince(post.publishedAt);
  const ageBonus = Math.min(age * 11, 2600);

  let target = Math.round(
    1100 +
    current * TIER_MULT[tier] +
    ageBonus +
    TIER_BONUS[tier] +
    slugJitter(post.slug)
  );

  target = Math.max(target, TIER_MIN[tier], current);

  if (age < 14) {
    const recentCap = age < 7 ? 3400 : 4200;
    target = Math.max(1800, Math.min(target, recentCap));
    target = Math.max(target, current);
  }

  return { target, tier, age };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  const posts = await BlogPost.find({ status: 'published' })
    .select('slug title views publishedAt')
    .sort({ views: -1 })
    .lean();

  const updates = posts.map((post) => {
    const { target, tier, age } = targetViews(post);
    return { ...post, target, tier, age, delta: target - (post.views || 0) };
  });

  updates.sort((a, b) => b.target - a.target);

  const oldTotal = updates.reduce((s, p) => s + (p.views || 0), 0);
  const newTotal = updates.reduce((s, p) => s + p.target, 0);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${updates.length} published posts`);
  console.log(`Total views: ${oldTotal.toLocaleString()} → ${newTotal.toLocaleString()}\n`);
  console.log('New views | Was | Tier      | Age | Slug');
  console.log('-'.repeat(90));

  for (const row of updates) {
    console.log(
      `${String(row.target).padStart(9)} | ${String(row.views || 0).padStart(4)} | ${row.tier.padEnd(9)} | ${String(row.age).padStart(3)}d | ${row.slug}`
    );
  }

  if (!APPLY) {
    console.log('\nNo changes written. Re-run with --apply to update MongoDB.');
    await mongoose.disconnect();
    return;
  }

  const bulk = updates.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: { $set: { views: row.target } },
    },
  }));

  const result = await BlogPost.bulkWrite(bulk);
  console.log(`\n✅ Updated ${result.modifiedCount} posts`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
