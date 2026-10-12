// Public export boundary — re-exports the shared deep allowlist and keeps
// Sample/Demo capture helpers here. Never spread a model/database object into
// a fixture shipped to visitors.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const shared = require(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../shared/publicPlanExport.cjs',
));

export const {
  PUBLIC_PLAN_FIELDS,
  exportPublicPlan,
  projectPublicPlan,
  isPublicUrl,
  image,
} = shared;

export const REVIEW_CHECKS = [
  'identity', 'resolvedPlaces', 'mapCoverage', 'duplicates', 'routing', 'pacing',
  'wording', 'imagery', 'privacy', 'cardPromise', 'visibleParity', 'dayCompleteness',
];

export function validateCapture(capture, concept) {
  const errors = [];
  const plan = capture?.plan;
  if (!capture?.saved || !capture?.tripId) errors.push('Trip was not saved');
  if (!capture?.itineraryHash) errors.push('Missing canonical hash');
  if (capture?.sourceResponseId && capture.sourceResponseId !== plan?.responseId) {
    errors.push('Latest response did not produce this saved plan');
  }
  if (capture?.prompt !== concept.prompt) errors.push('Prompt does not match the supplied concept');
  if (!capture?.response?.trim()) errors.push('Missing exact Trailie response');
  if (plan?.days?.length !== concept.days) errors.push('Duration does not match card promise');
  const stops = (plan?.days || []).flatMap((day) => day.stops || []);
  if (!stops.length) errors.push('No stops');
  if (/partial (?:trip|itinerary|.*framework)|(?:not yet|not been) added|outside the saved trip|outside the saved stops|not yet.*saved stop|could not reliably be placed|couldn[’']t reliably place|saved (?:trip|itinerary) (?:remains |is )unchanged|haven[’']t been able to save/i.test(`${capture?.response || ''} ${plan?.intro || ''}`)) {
    errors.push('Trip explicitly reports missing central experiences');
  }
  for (const item of stops) {
    if (!item.canonicalPlaceId) continue; // Non-place rest/meal blocks are reviewed separately.
    const loc = item.location;
    if (!loc || loc.status !== 'resolved' || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)
      || Math.abs(loc.lat) > 90 || Math.abs(loc.lon) > 180 || (loc.lat === 0 && loc.lon === 0)
      || loc.sourceEntity !== item.canonicalPlaceId) {
      errors.push(`Unresolved canonical location: ${item.name}`);
    }
  }
  if (!capture?.mapCoverage || capture.mapCoverage.mapped < 1 || capture.mapCoverage.missing > 0) {
    errors.push('Incomplete map coverage');
  }
  if (!capture?.images?.length || capture.images.some((item) => !item.verified || !isPublicUrl(item.url))) {
    errors.push('Imagery has not passed verification');
  }
  if (/responseId|itineraryHash|canonicalPlan|tool_call|costUsd|inputTokens/i.test(JSON.stringify(exportPublicPlanSafe(plan)))) {
    errors.push('Internal wording in public plan');
  }
  return errors;
}

function exportPublicPlanSafe(plan) {
  return plan?.days?.length ? exportPublicPlan(plan) : {};
}

export function buildPublicSample(capture, concept, review) {
  const errors = validateCapture(capture, concept);
  if (review?.itineraryHash !== capture.itineraryHash) errors.push('Review does not match canonical hash');
  for (const check of REVIEW_CHECKS) {
    if (review?.checks?.[check] !== true) errors.push(`Review required: ${check}`);
  }
  if (!review?.description?.trim()) errors.push('Missing reviewed card description');
  if (errors.length) throw new Error(errors.join('\n'));
  // Same rule as the Demo installer (sanitizePlan): owner-facing diagnostics never ship in a public fixture.
  const plan = exportPublicPlan(capture.plan);
  delete plan.feasibilityIssues;
  return {
    slug: concept.slug,
    title: concept.title,
    prompt: concept.prompt,
    description: review.description,
    tags: shared.strings(concept.tags),
    images: capture.images.map(image),
    plan,
  };
}
