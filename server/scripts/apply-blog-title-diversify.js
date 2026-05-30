#!/usr/bin/env node
/**
 * Diversify repetitive "2026 Visitor Guide" titles (slugs unchanged).
 * Run: node scripts/apply-blog-title-diversify.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

const UPDATES = [
  {
    slug: 'grand-teton-national-park-the-complete-2026-visitor-guide',
    title: 'Grand Teton 2026: Jenny Lake, Crowds & Best Seasons',
    excerpt:
      'No timed entry in 2026, but fees and closures still matter. Jenny Lake, crowd patterns, best seasons, and what to book before you drive into Grand Teton.',
    metaDescription:
      'Grand Teton 2026 without timed entry: Jenny Lake trails, crowd timing, fees, and the seasons that actually work for first-time visitors.',
  },
  {
    slug: 'death-valley-national-park-the-complete-2026-visitor-guide',
    title: 'Death Valley 2026: When It’s Actually Safe to Visit',
    excerpt:
      'Summer heat can be dangerous—spring superbloom and winter light are the sweet spots. 2026 fees, safe trails, and how desert seasons change your plan.',
    metaDescription:
      'When Death Valley is safe to visit in 2026: heat limits, superbloom timing, fees, and the seasons that beat a miserable summer drive.',
  },
  {
    slug: 'yosemite-national-park-the-complete-2026-visitor-guide',
    title: 'Yosemite 2026: Crowds, Parking & Valley Access',
    excerpt:
      'Reservations are gone, but crowds are not. Valley parking, entrance waits, 2026 fees, and the months that still make sense after timed entry ended.',
    metaDescription:
      'Yosemite 2026 after timed entry ended: parking reality, crowd patterns, valley access, fees, and when to visit without losing half a day in line.',
  },
  {
    slug: 'canyonlands-national-park-the-complete-2026-guide',
    title: 'Canyonlands 2026: Island in the Sky vs the Needles',
    excerpt:
      'Pick the right district first—Island in the Sky vs the Needles, White Rim logistics, 2026 fees, and trails worth your time in Utah’s biggest overlooked park.',
    metaDescription:
      'Canyonlands 2026: Island in the Sky vs the Needles, permits, fees, and how to plan a trip without treating it like a smaller Arches.',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const item of UPDATES) {
    const post = await BlogPost.findOne({ slug: item.slug });
    if (!post) {
      console.warn('SKIP:', item.slug);
      continue;
    }
    post.title = item.title;
    post.excerpt = item.excerpt;
    post.metaDescription = item.metaDescription;
    await post.save();
    console.log('OK:', post.title);
  }
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
