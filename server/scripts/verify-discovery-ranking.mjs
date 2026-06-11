#!/usr/bin/env node
/**
 * Print top-ranked parks for golden discovery queries (requires NPS_API_KEY).
 * Usage: cd server && node scripts/verify-discovery-ranking.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const { loadCanonicalParks } = require('../src/catalog/parkCatalog');
const { filterParksBySearchQuery } = require('../src/utils/parkSearchQuery');

const GOLDEN = [
  'best national parks to visit in July with cool weather lakes or beaches',
  'quiet national parks for beginners',
  'best national parks for couples with ocean views',
  'dark sky national parks for stargazing',
];

async function main() {
  const catalog = await loadCanonicalParks();
  for (const q of GOLDEN) {
    const results = filterParksBySearchQuery(catalog, q);
    console.log(`\n=== ${q} ===`);
    results.slice(0, 5).forEach((p, i) => {
      const name = p.sourceRecord?.fullName || p.name;
      const des = p.sourceRecord?.designation || '';
      console.log(`${i + 1}. ${name} (${des})`);
    });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
