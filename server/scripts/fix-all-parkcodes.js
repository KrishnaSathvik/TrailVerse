/**
 * One-time migration script to fix parkCodes across all collections.
 * Visited parks and favorites were stored with slug-format parkCodes
 * (e.g., "grand-canyon-national-park") instead of NPS codes (e.g., "grca").
 *
 * Usage: node server/scripts/fix-all-parkcodes.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const VisitedPark = require('../src/models/VisitedPark');
const Favorite = require('../src/models/Favorite');

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

async function fixCollection(Model, name, slugToCode) {
  // Find records with slug-format parkCodes (longer than 4 chars)
  const slugRecords = await Model.find({
    parkCode: { $regex: /^.{5,}$/ }
  });

  console.log(`\n[${name}] Found ${slugRecords.length} records with slug-format parkCodes`);

  if (slugRecords.length === 0) return { fixed: 0, notFound: 0, duplicates: 0 };

  let fixed = 0;
  let notFound = 0;
  let duplicates = 0;

  for (const record of slugRecords) {
    const npsCode = slugToCode[record.parkCode];
    if (npsCode) {
      // Check if this user already has a record with the NPS code (would cause duplicate key error)
      if (record.user) {
        const existing = await Model.findOne({
          user: record.user,
          parkCode: npsCode
        });
        if (existing && existing._id.toString() !== record._id.toString()) {
          // Duplicate — delete the slug version since NPS code version exists
          console.log(`  DELETE duplicate: ${record.parkCode} -> ${npsCode} (user ${record.user}, keeping existing)`);
          await Model.deleteOne({ _id: record._id });
          duplicates++;
          continue;
        }
      }

      console.log(`  ${record.parkCode} -> ${npsCode}`);
      record.parkCode = npsCode;
      await record.save();
      fixed++;
    } else {
      console.log(`  WARNING: No NPS code for slug "${record.parkCode}"`);
      notFound++;
    }
  }

  return { fixed, notFound, duplicates };
}

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Fetch all parks from NPS API (not just national parks — include monuments etc.)
  const url = `https://developer.nps.gov/api/v1/parks?limit=500&api_key=${NPS_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  // Build slug -> NPS code mapping for ALL parks (not just national parks)
  const slugToCode = {};
  for (const park of json.data) {
    const slug = generateSlug(park.fullName);
    slugToCode[slug] = park.parkCode;
  }

  console.log(`Built mapping for ${Object.keys(slugToCode).length} parks`);

  const visitedResult = await fixCollection(VisitedPark, 'VisitedParks', slugToCode);
  const favoriteResult = await fixCollection(Favorite, 'Favorites', slugToCode);

  console.log('\n=== Summary ===');
  console.log(`VisitedParks: fixed=${visitedResult.fixed}, duplicates=${visitedResult.duplicates}, notFound=${visitedResult.notFound}`);
  console.log(`Favorites:    fixed=${favoriteResult.fixed}, duplicates=${favoriteResult.duplicates}, notFound=${favoriteResult.notFound}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
