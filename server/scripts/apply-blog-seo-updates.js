#!/usr/bin/env node
/**
 * Apply SEO title + meta description updates (slugs unchanged).
 * Run from server/: node scripts/apply-blog-seo-updates.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const UPDATES = [
  {
    slug: 'yellowstone-national-park-the-complete-2026-visitor-guide',
    title: 'Yellowstone 2026: Timed Entry, Crowds & Planning Guide',
    metaDescription:
      'No timed entry in 2026, but bridge work and peak crowds matter. Fees, best seasons, top trails, and planning tips for Yellowstone.',
    featured: true,
  },
  {
    slug: 'yosemite-dropped-its-reservation-system-for-2026-heres-whats-actually-happening',
    title: 'Yosemite Ends Timed Entry for 2026: Waits & What Changed',
    metaDescription:
      'Yosemite removed timed entry for 2026—then entrance waits surged. What changed, when to go, and how to plan your visit.',
    featured: true,
  },
  {
    slug: 'arches-national-park-the-complete-2026-visitor-guide',
    title: 'Arches 2026: No Timed Entry, Crowds & Visitor Guide',
    metaDescription:
      'Arches dropped timed entry for 2026. Best seasons, Delicate Arch timing, fees, and what catches visitors off guard.',
    featured: true,
  },
  {
    slug: 'grand-teton-national-park-the-complete-2026-visitor-guide',
    title: 'Grand Teton 2026: Timed Entry, Trails & Visitor Guide',
    metaDescription:
      'Grand Teton timed entry, opening dates, and fees for 2026. Best seasons, Jenny Lake trails, and planning tips.',
  },
  {
    slug: 'death-valley-national-park-the-complete-2026-visitor-guide',
    title: 'Death Valley 2026: Heat, Seasons & Visitor Guide',
    metaDescription:
      'Death Valley superbloom timing, summer heat limits, and 2026 fees. When to go, safe trails, and desert planning tips.',
  },
  {
    slug: 'canyonlands-national-park-the-complete-2026-guide',
    title: 'Canyonlands 2026: Districts, Trails & Visitor Guide',
    metaDescription:
      'Island in the Sky vs Needles, White Rim permits, and 2026 fees. Best seasons and trails for Canyonlands.',
  },
  {
    slug: 'yosemite-national-park-the-complete-2026-visitor-guide',
    title: 'Yosemite 2026: Reservations, Crowds & Visitor Guide',
    metaDescription:
      'Yosemite 2026 rules after timed entry ended. Crowd patterns, must-see valleys, fees, and when to visit.',
  },
  {
    slug: 'is-the-national-park-annual-pass-worth-it-the-honest-math-2025',
    title: 'Is the America the Beautiful Pass Worth It? (2026 Math)',
    metaDescription:
      'Break-even math for the National Park annual pass in 2026. When it pays off, family splits, and honest downsides.',
    seoNoindex: false,
  },
  {
    slug: 'thanksgiving-air-travel-2025-how-to-survive-the-chaos-when-its-already-too-late-to-change-plans',
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
    if (item.metaDescription) post.metaDescription = item.metaDescription;
    if (item.featured !== undefined) post.featured = item.featured;
    if (item.seoNoindex !== undefined) post.seoNoindex = item.seoNoindex;

    await post.save();
    console.log(`OK: ${item.slug}`);
    console.log(`    title: ${post.title}`);
    if (post.metaDescription) console.log(`    meta:  ${post.metaDescription}`);
    if (post.seoNoindex) console.log('    noindex: true');
  }

  await mongoose.disconnect();
  console.log('\nDone. Revalidate cache / request indexing in GSC for updated URLs.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
