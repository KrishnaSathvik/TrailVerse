#!/usr/bin/env node
// Convert authenticated local captures to review candidates, never public fixtures.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { REVIEW_CHECKS, validateCapture } from '../src/lib/publicItineraryExport.mjs';
const base = resolve(process.argv[2] || '../artifacts/private/sample-capture-2026-10-15');
const output = resolve(process.argv[3] || join(base, 'candidates'));
const samples = JSON.parse(readFileSync(new URL('../src/data/public-itineraries/index.json', import.meta.url)));
const concepts = JSON.parse(readFileSync(new URL('./public-itinerary-concepts.json', import.meta.url)));
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const concept of concepts) {
  const directory = join(base, concept.slug);
  if (!existsSync(directory)) continue;
  const attempts = readdirSync(directory).filter(name => /^attempt-\d+\.json$/.test(name)).sort();
  if (!attempts.length) continue;
  const attempt = JSON.parse(readFileSync(join(directory, attempts.at(-1))));
  if (attempt.status !== 'captured-awaiting-review') continue;
  const turn = attempt.turns.at(-1);
  const body = turn.body;
  const plan = turn.savedPlan;
  assert(body.persisted === true && body.mutationStatus === 'accepted', 'Only accepted durable plans qualify');
  assert.equal(turn.question, concept.prompt);
  assert.equal(body.itineraryHash, plan.itineraryHash);
  assert.equal(body.responseId, plan.responseId);
  const images = [];
  for (const image of samples.find(sample => sample.slug === concept.slug).images) {
    const url = new URL(image.url);
    assert(url.protocol === 'https:' && (url.hostname === 'nps.gov' || url.hostname.endsWith('.nps.gov')));
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const verified = response.ok && (response.headers.get('content-type') || '').startsWith('image/');
    await response.body?.cancel();
    images.push({ ...image, verified });
  }
  const stops = plan.days.flatMap(day => day.stops || []);
  const capture = {
    prompt: concept.prompt, followups: [], response: body.content,
    conversation: [{ role: 'user', content: concept.prompt }, { role: 'assistant', content: body.content }],
    tripId: body.tripId, saved: true, sourceResponseId: body.responseId,
    itineraryHash: plan.itineraryHash, plan, images, latencyMs: turn.latencyMs,
    mapCoverage: {
      mapped: stops.filter(stop => stop.location?.status === 'resolved').length,
      missing: stops.filter(stop => stop.canonicalPlaceId && stop.location?.status !== 'resolved').length,
    },
  };
  capture.validationWarnings = validateCapture(capture, concept);
  const bytes = `${JSON.stringify(capture, null, 2)}\n`;
  const file = join(output, `${concept.slug}.json`);
  const reviewFile = join(output, `${concept.slug}.review.json`);
  const captureDigest = createHash('sha256').update(bytes).digest('hex');
  if (existsSync(reviewFile)) {
    assert.equal(JSON.parse(readFileSync(reviewFile)).captureDigest, captureDigest, 'Reviewed candidate changed; use a new output directory');
  } else {
    writeFileSync(reviewFile, `${JSON.stringify({ captureDigest, itineraryHash: capture.itineraryHash, description: '', checks: Object.fromEntries(REVIEW_CHECKS.map(check => [check, false])), notes: '' }, null, 2)}\n`, { mode: 0o600 });
  }
  writeFileSync(file, bytes, { mode: 0o600 });
  console.log(concept.slug, JSON.stringify(capture.validationWarnings));
}
