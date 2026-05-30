#!/usr/bin/env node
/**
 * Align hero excerpts with current titles (≤200 chars, matches on-page subhead).
 * Run: node scripts/apply-blog-excerpt-alignment.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BlogPost = require('../src/models/BlogPost');

/** slug -> excerpt (hero subhead under title) */
const EXCERPTS = {
  'yellowstone-national-park-the-complete-2026-visitor-guide':
    'No timed entry in 2026—bridge delays, peak crowds, fees, and the trails and seasons that actually matter for Yellowstone trips.',
  'yosemite-dropped-its-reservation-system-for-2026-heres-whats-actually-happening':
    'Yosemite ended timed entry for 2026, then entrance waits hit 90+ minutes. What changed, what did not, and how to plan around summer crowds.',
  'arches-national-park-the-complete-2026-visitor-guide':
    'Arches has no timed entry in 2026. Crowd patterns, Delicate Arch timing, fees, and the seasonal surprises that catch first-time visitors.',
  'grand-teton-national-park-the-complete-2026-visitor-guide':
    'No timed entry in 2026, but new fees and trail closures matter. Jenny Lake, best seasons, crowds, and what to book before you drive in.',
  'death-valley-national-park-the-complete-2026-visitor-guide':
    'Heat limits, superbloom timing, and 2026 fees—when Death Valley is worth it, which trails are safe, and how desert seasons change your plan.',
  'canyonlands-national-park-the-complete-2026-guide':
    'Island in the Sky vs the Needles, White Rim logistics, 2026 fees, and the trails worth your time in Utah’s least-understood big park.',
  'yosemite-national-park-the-complete-2026-visitor-guide':
    'After reservations ended, Yosemite runs on crowds—not calendars. Valley access, parking reality, fees, and the months that still make sense in 2026.',
  'grand-teton-astrophotography-guide':
    'Bortle 2 skies, Milky Way seasons, and Grand Teton’s best night locations—with practical Z6II settings for 2026 astro trips.',
  'death-valley-astrophotography-guide':
    'Bortle 1 darkness at Death Valley: where to shoot the Milky Way, which months are safe, and the camera settings that work on the ground.',
  'arches-national-park-astrophotography-guide':
    'Milky Way shots through North Window and other Arches icons—dark-sky timing, Moab logistics, and night photography settings that work.',
  'canyonlands-national-park-astrophotography-guide':
    'Mesa Arch, Milky Way rises, and Canyonlands’ gold-tier dark skies—access, timing, and full astro settings for overnight shoots.',
  'the-best-national-parks-for-first-timers-where-to-start-your-adventure':
    'Five parks that reward first trips: Yellowstone, Grand Canyon, Yosemite, Zion, and more—with fees, timing, and honest beginner planning tips for 2026.',
  'memorial-day-weekend-2026-national-park-traffic-gas-and-crowd-tips':
    'Memorial Day 2026: gas prices, free-entry Monday, peak traffic windows, and crowd tactics so national park trips do not turn into parking-lot tours.',
  'best-national-parks-for-thanksgiving-skip-dinner-chase-sunsets':
    'Mild November weather and thinner crowds—Grand Canyon, Joshua Tree, Zion, Death Valley, and other parks that shine on Thanksgiving weekend.',
  'is-the-national-park-annual-pass-worth-it-the-honest-math-2025':
    'America the Beautiful Pass break-even math for 2026: when $80 pays off, family rules, senior options, and when you should skip the annual pass.',
  'autumn-in-americas-national-parks-where-to-go-when-the-crowds-fade':
    'Fall color without summer traffic—Acadia, Great Smoky Mountains, Zion in autumn, and when to book for cooler trails and fewer people.',
  'the-ultimate-fall-foliage-road-trip-guide-3-spectacular-routes-you-cant-miss':
    'Three leaf-peeping drives—New England loops, Blue Ridge Parkway overlooks, and Michigan’s Upper Peninsula—with timing tips for peak color.',
  '7-cozy-small-town-escapes-that-define-autumn-magic':
    'Seven small towns built for autumn weekends—Vermont villages, Leavenworth, Door County, and slow-paced spots where fall actually feels like fall.',
  'thanksgiving-flying-one-page-checklist-print-friendly':
    'One printable page: best fly days, airport timing, TSA rules, delay scripts, and a quick drive-vs-fly check before Thanksgiving week.',
  'thanksgiving-air-travel-2025-how-to-survive-the-chaos-when-its-already-too-late-to-change-plans':
    'Last-minute Thanksgiving flights: crowded airports, delays, and practical moves when your plans are already booked and time is short.',
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Updating excerpts...\n');

  for (const [slug, excerpt] of Object.entries(EXCERPTS)) {
    const len = excerpt.length;
    if (len > 300) {
      console.warn(`WARN ${slug}: excerpt ${len} chars exceeds schema max 300`);
    }
    const post = await BlogPost.findOneAndUpdate(
      { slug },
      { excerpt },
      { new: true }
    );
    if (!post) {
      console.warn(`SKIP: ${slug}`);
      continue;
    }
    console.log(`OK (${len}): ${post.title}`);
    console.log(`    ${excerpt}\n`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
