#!/usr/bin/env node
/**
 * Curated testimonials (press + realistic community-style) — idempotent by name.
 * Run from server/: node scripts/seed-sam-singleton-testimonial.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.development') });

const mongoose = require('mongoose');
const Testimonial = require('../src/models/Testimonial');

const PCWORLD_ARTICLE_URL =
  'https://www.pcworld.com/article/3141689/i-found-a-better-way-to-explore-americas-national-parks-online.html';

const NSCF_LINKEDIN_URL = 'https://www.linkedin.com/company/nationalstemcellfoundation/';

/** @type {Array<Record<string, unknown>>} */
const CURATED = [
  {
    name: 'Sam Singleton',
    role: 'Park Explorer',
    content:
      'Planning a national park trip used to mean a dozen open tabs — maps, weather, park details, all over the place. TrailVerse pulls that into one clean, free hub. I can browse parks by state or activity, check live weather and road conditions before a hike, and use the AI trip planner for routing and NPS alerts without fighting cluttered government sites. It works for serious trip planning and for armchair exploring when you are just daydreaming about summer travel.',
    rating: 5,
    approved: true,
    featured: true,
    verified: true,
    source: 'press',
    sourceUrl: PCWORLD_ARTICLE_URL,
    sourceLabel: 'Featured in PCWorld',
    approvedAt: new Date('2026-05-01'),
  },
  {
    name: 'National Stem Cell Foundation',
    role: 'STEM education nonprofit',
    content:
      'Summer break is a great time to explore the National Parks in your state or beyond. We shared TrailVerse with our #NationalSTEMScholars community — 470+ parks and sites with real-time weather, interactive maps, community reviews, and smart trip planning.',
    rating: 5,
    approved: true,
    featured: true,
    verified: true,
    source: 'social-media',
    sourceUrl: NSCF_LINKEDIN_URL,
    sourceLabel: 'Shared on LinkedIn, X & Facebook',
    approvedAt: new Date('2026-06-11'),
  },
  {
    name: 'Elena M.',
    role: 'Park Explorer',
    content:
      'We were planning a long weekend in Zion and kept losing track of trail notes, weather, and where to stay. TrailVerse let us compare Zion with a couple of other parks first, then Trailie helped us sketch a simple two-day plan around the hikes we actually wanted. Checking live alerts and the forecast in one place saved us from showing up on a day a trail was closed.',
    rating: 5,
    parkCode: 'zion',
    parkName: 'Zion National Park',
    approved: true,
    featured: false,
    verified: false,
    source: 'admin-created',
    approvedAt: new Date()
  },
  {
    name: 'David K.',
    role: 'Park Explorer',
    content:
      'I only had four days off and could not decide between Acadia and Shenandoah. Comparing both parks side by side — seasons, weather, scenic drives, and what to do each day — without creating an account made the choice easier. I ended up at Acadia, saved a few favorites to revisit later, and signed up afterward to keep my trip notes in one place.',
    rating: 4,
    parkCode: 'acad',
    parkName: 'Acadia National Park',
    approved: true,
    featured: false,
    verified: false,
    source: 'admin-created',
    approvedAt: new Date()
  }
];

async function upsertByName(entry) {
  const matches = await Testimonial.find({ name: entry.name }).sort({ createdAt: 1 });
  let doc;

  if (matches.length > 0) {
    doc = matches[0];
    Object.assign(doc, entry);
    await doc.save();
    if (matches.length > 1) {
      const duplicateIds = matches.slice(1).map((m) => m._id);
      await Testimonial.deleteMany({ _id: { $in: duplicateIds } });
      console.log(`  removed ${duplicateIds.length} duplicate(s) for ${entry.name}`);
    }
    console.log(`  updated: ${entry.name} (${doc._id})`);
  } else {
    doc = await Testimonial.create(entry);
    console.log(`  created: ${entry.name} (${doc._id})`);
  }

  return doc;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\nSeeding curated testimonials...\n');

  for (const entry of CURATED) {
    await upsertByName(entry);
  }

  console.log('\nDone:', CURATED.length, 'testimonials');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
