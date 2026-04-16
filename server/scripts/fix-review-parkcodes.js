/**
 * One-time migration script to fix review parkCodes.
 * Reviews were stored with slug-format parkCodes (e.g., "grand-canyon-national-park")
 * instead of NPS codes (e.g., "grca"). This script fixes them.
 *
 * Usage: node server/scripts/fix-review-parkcodes.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const ParkReview = require('../src/models/ParkReview');

const NPS_API_KEY = process.env.NPS_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

function generateSlug(fullName) {
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Fetch all national parks from NPS API
  const url = `https://developer.nps.gov/api/v1/parks?limit=500&api_key=${NPS_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  // Build slug -> NPS code mapping
  const slugToCode = {};
  for (const park of json.data) {
    if (park.designation && park.designation.includes('National Park')) {
      const slug = generateSlug(park.fullName);
      slugToCode[slug] = park.parkCode;
    }
  }

  console.log(`Built mapping for ${Object.keys(slugToCode).length} national parks`);

  // Find reviews with slug-format parkCodes (longer than 4 chars = slug, not NPS code)
  const slugReviews = await ParkReview.find({
    parkCode: { $regex: /^.{5,}$/ }
  });

  console.log(`Found ${slugReviews.length} reviews with slug-format parkCodes`);

  if (slugReviews.length === 0) {
    console.log('Nothing to fix!');
    await mongoose.disconnect();
    return;
  }

  let fixed = 0;
  let notFound = 0;

  for (const review of slugReviews) {
    const npsCode = slugToCode[review.parkCode];
    if (npsCode) {
      console.log(`  ${review.parkCode} -> ${npsCode} (review ${review._id})`);
      review.parkCode = npsCode;
      await review.save();
      fixed++;
    } else {
      console.log(`  WARNING: No NPS code found for slug "${review.parkCode}" (review ${review._id})`);
      notFound++;
    }
  }

  console.log(`\nDone! Fixed: ${fixed}, Not found: ${notFound}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
