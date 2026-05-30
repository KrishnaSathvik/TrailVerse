#!/usr/bin/env node
/**
 * Round 2: meta descriptions + shorter titles for remaining posts.
 * Slugs unchanged. Run: node scripts/apply-blog-seo-round2.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const UPDATES = [
  {
    slug: 'arches-national-park-the-complete-2026-visitor-guide',
    excerpt:
      'Arches dropped timed entry for 2026. Best seasons, Delicate Arch timing, fees, and what catches visitors off guard every season.',
  },
  {
    slug: 'yosemite-national-park-the-complete-2026-visitor-guide',
    excerpt:
      'Yosemite after timed entry ended: crowd patterns, must-see valleys, fees, and when to visit in 2026.',
  },
  {
    slug: 'arches-national-park-astrophotography-guide',
    metaDescription:
      'Shoot the Milky Way through North Window Arch at Arches. Bortle 2 skies, best months, gear, and Nikon Z6II settings.',
  },
  {
    slug: 'death-valley-astrophotography-guide',
    metaDescription:
      'Death Valley Bortle 1 dark skies: Milky Way locations, safe summer limits, best seasons, and Z6II camera settings.',
  },
  {
    slug: 'grand-teton-astrophotography-guide',
    title: 'Grand Teton Astrophotography Guide (2026)',
    metaDescription:
      'Grand Teton Milky Way guide: Bortle 2 skies, 12-month visibility, best photo spots, and Z6II settings for 2026.',
    excerpt:
      'Grand Teton Bortle Class 2 skies, Milky Way calendar, top shooting locations, and Nikon Z6II settings for 2026.',
  },
  {
    slug: 'canyonlands-national-park-astrophotography-guide',
    metaDescription:
      'Mesa Arch Milky Way at Canyonlands: Gold-tier dark skies, timing, access, and full astro camera settings.',
  },
  {
    slug: 'the-best-national-parks-for-first-timers-where-to-start-your-adventure',
    title: 'Best National Parks for First-Timers (2026)',
    metaDescription:
      'Five beginner-friendly parks with big payoff: Yellowstone, Grand Canyon, Yosemite, Zion & more—fees, timing, and first-trip tips.',
  },
  {
    slug: 'memorial-day-weekend-2026-national-park-traffic-gas-and-crowd-tips',
    title: 'Memorial Day 2026: Park Crowds, Gas & Traffic',
    metaDescription:
      'Memorial Day park crowds, gas prices, free-entry Monday, and traffic tactics to avoid the worst lines in 2026.',
  },
  {
    slug: 'best-national-parks-for-thanksgiving-skip-dinner-chase-sunsets',
    title: 'Best National Parks for Thanksgiving Weekends',
    metaDescription:
      'Mild weather and fewer crowds: Grand Canyon, Joshua Tree, Zion, Death Valley & more for Thanksgiving week trips.',
  },
  {
    slug: '7-cozy-small-town-escapes-that-define-autumn-magic',
    metaDescription:
      'Seven autumn small towns for leaf-peeping weekends—from Vermont villages to Door County and Leavenworth.',
  },
  {
    slug: 'autumn-in-americas-national-parks-where-to-go-when-the-crowds-fade',
    title: "Best National Parks for Fall (Fewer Crowds)",
    metaDescription:
      'Fall color without summer crowds: Acadia, Great Smoky Mountains, Zion in autumn, and when to book your trip.',
  },
  {
    slug: 'the-ultimate-fall-foliage-road-trip-guide-3-spectacular-routes-you-cant-miss',
    title: 'Fall Foliage Road Trips: 3 Best Routes',
    metaDescription:
      'Three leaf-peeping drives: New England classics, Blue Ridge Parkway overlooks, and Michigan’s Upper Peninsula.',
  },
  {
    slug: 'thanksgiving-flying-one-page-checklist-print-friendly',
    metaDescription:
      'Printable Thanksgiving flight checklist: best fly days, TSA rules, airport timing, delay scripts, and drive-vs-fly math.',
  },
  {
    slug: 'thanksgiving-air-travel-2025-how-to-survive-the-chaos-when-its-already-too-late-to-change-plans',
    title: 'Thanksgiving Air Travel: Last-Minute Survival Tips',
    metaDescription:
      'Late Thanksgiving flights: shutdown delays, crowded airports, and practical tactics when plans are already booked.',
    seoNoindex: true,
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  for (const item of UPDATES) {
    const post = await BlogPost.findOne({ slug: item.slug });
    if (!post) {
      console.warn(`SKIP (not found): ${item.slug}`);
      continue;
    }

    if (item.title) post.title = item.title;
    if (item.excerpt) post.excerpt = item.excerpt;
    if (item.metaDescription) post.metaDescription = item.metaDescription;
    if (item.seoNoindex !== undefined) post.seoNoindex = item.seoNoindex;

    await post.save();
    const metaLen = (post.metaDescription || '').length;
    console.log(`OK: ${item.slug}`);
    console.log(`    title (${post.title.length}): ${post.title}`);
    if (post.metaDescription) console.log(`    meta (${metaLen}): ${post.metaDescription}`);
    if (item.excerpt) console.log(`    excerpt (${post.excerpt.length} chars)`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
