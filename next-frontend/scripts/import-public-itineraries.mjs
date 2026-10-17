#!/usr/bin/env node
// Only a reviewed, unchanged capture may cross into the public fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { buildPublicSample } from '../src/lib/publicItineraryExport.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const { validateDayCompleteness } = createRequire(import.meta.url)('../../server/src/utils/dayCompleteness');
// Explicit user-requested replacement of the reviewed local, not-yet-deployed
// batch. Default imports continue to enforce immutable existing snapshots.
const replaceLocal = process.argv.includes('--replace-reviewed-local');
const directory = resolve(process.env.ITINERARY_CAPTURE_DIR || join(here, '../../artifacts/public-itinerary-candidates'));
const concepts = JSON.parse(readFileSync(join(here, 'public-itinerary-concepts.json'), 'utf8'));
// Entire batch is checked before the public file is touched.
const samples = concepts.map(concept => {
  const bytes = readFileSync(join(directory, `${concept.slug}.json`));
  const review = JSON.parse(readFileSync(join(directory, `${concept.slug}.review.json`), 'utf8'));
  if (review.captureDigest !== createHash('sha256').update(bytes).digest('hex')) throw new Error(`${concept.slug}: capture changed after review`);
  const capture = JSON.parse(bytes);
  for (const day of capture.plan.days) {
    const issues = validateDayCompleteness(day);
    if (issues.length) throw new Error(`${concept.slug} day ${day.dayNumber}: ${issues.join(', ')}`);
  }
  return buildPublicSample(capture, concept, review);
});
const fixturePath = join(here, '../src/data/public-itineraries/index.json');
const existing = JSON.parse(readFileSync(fixturePath, 'utf8'));
for (const prior of existing) {
  const next = samples.find(sample => sample.slug === prior.slug);
  if (!next || (!replaceLocal && JSON.stringify(prior) !== JSON.stringify(next))) throw new Error(`${prior.slug}: published snapshots are immutable; use a new versioned slug`);
}
if (!process.argv.includes('--apply')) {
  console.log(`${samples.length} reviewed samples passed. Use --apply to write local public fixtures.`);
} else {
  writeFileSync(fixturePath, `${JSON.stringify(samples, null, 2)}\n`);
  console.log(`Wrote ${samples.length} reviewed public samples. No push or deployment performed.`);
}
