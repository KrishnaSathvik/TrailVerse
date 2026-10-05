'use strict';

/**
 * Phase 9C.1D.5C-D — end to end through the real `executeTrailieV2Turn`,
 * scripted provider, no network. Same frozen bundle and same generated plan;
 * the ONLY difference is the server trust list read this turn.
 */

const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { candidateHash } = require('../../utils/experienceRelationships');
const { experienceHash } = require('../../utils/curatedExperienceRecords');
const { createCuratedOfficialEvidenceProvider } = require('../providers/curatedOfficialEvidenceProvider');

const PARK = 'nps:park:zion';
const X = `${PARK}:experience:ridge-trail`;
const Y = `${PARK}:place:AAAA1111-0000-4000-8000-000000000001`;
const U = `${PARK}:place:EEEE5555-0000-4000-8000-000000000005`;
const NOW = new Date('2026-09-15T12:00:00.000Z');
const SOURCE = { url: 'https://www.nps.gov/zion/planyourvisit/ridge-trail.htm', title: 'Ridge Trail', publisher: 'National Park Service', excerpt: 'The Ridge Trail begins at the Ridge and Canyon Trailhead.' };
const CHECK = { checkedAt: '2026-09-10T00:00:00.000Z', httpStatus: 200, finalUrl: SOURCE.url, excerptFound: true };
const review = (hash) => ({ candidateHash: hash, decision: 'approved', reviewMethod: 'human', reviewerId: 'maintainer:primary', reviewedAt: '2026-09-12T00:00:00.000Z', reviewAfter: '2027-09-12T00:00:00.000Z' });

const npsPlace = (entityId, name, id) => ({
  evidenceId: `ev:nps-${id}`, entityId: PARK, topic: 'activities', evidenceType: 'fact', privacyScope: 'public',
  claim: { identity: `place:${entityId}`, text: `${name}: an official place worth real time.`, normalizedValue: { entityId, destinationId: PARK, name, category: 'place', activityTypes: ['hike', 'walk'] }, qualifiers: ['named_place_candidate'], polarity: 'positive' },
  source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/zion/index.htm' },
  quality: { authorityClass: 'official_owner', conflictStatus: 'none', scopeMatch: 'exact' },
});

function frozenBundle(requestId, requirements) {
  const experience = { entityId: X, contextEntityId: PARK, canonicalName: 'Ridge Trail', category: 'trail', activityTypes: ['hike'], source: SOURCE, sourceCheck: CHECK };
  const sameAs = { subjectEntityId: X, relationship: 'same_as', objectEntityId: Y, contextEntityId: PARK, source: SOURCE, sourceCheck: CHECK };
  // Curated evidence is produced once, under the reviewer trusted at collection time.
  const curated = createCuratedOfficialEvidenceProvider({
    dataset: { experiences: [experience], candidates: [sameAs], reviews: [review(experienceHash(experience)), review(candidateHash(sameAs))] },
    trustedReviewerIds: ['maintainer:primary'], now: () => NOW,
  }).evidenceFor(PARK);
  const items = [npsPlace(Y, 'Ridge Trail Official Listing', 1), npsPlace(U, 'Meadow Loop Trail', 2), ...curated];
  return buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: items.map((i) => i.evidenceId) })),
    candidates: items,
  });
}

const stop = (name, duration, order) => ({ id: `s${order}`, order, type: 'trail', name, duration, note: `Spend real time on ${name}.`, why: `${name} fits this day.`, startTime: '', timeWindow: 'Morning' });
function toolResult(stops) {
  const input = { intro: 'A full Zion hiking day.', days: [{ id: 'd1', dayNumber: 1, label: 'Ridge Trail and a meadow walk', stops }] };
  return { provider: 'openai', model: 'gpt-5.6-terra', outputText: '', toolCalls: [{ id: 'c1', name: 'create_itinerary', input, rawArgs: JSON.stringify(input) }], completionStatus: 'complete', stopReason: 'stop', refusal: null, usage: { inputTokens: 4000, outputTokens: 900, cachedInputTokens: 0 } };
}

async function run() {
  const generation = [];
  const result = await executeTrailieV2Turn({
    userMessage: 'Plan a 1 day trip to Zion National Park for me. I want to hike Ridge Trail.',
    conversationContext: { history: [] }, tripState: null, constraints: null, resolvedContext: {},
  }, {
    enabled: true,
    planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional', reasonCodes: ['itinerary_activity_support', 'requested_named_hike_or_walk'] }],
    resolveDeterministicRender: () => ({ eligible: false }),
    detectContradiction: () => [],
    resolveEvidence: async ({ requirements = [], requestId }) => frozenBundle(requestId, requirements),
    now: () => NOW,
    newTurnId: () => 'turn-same-as',
    streamGeneration: false,
    responseAdapters: {},
    executeResponses: async (request) => {
      generation.push(request);
      return toolResult([stop('Ridge Trail Official Listing', 180, 1), stop('Meadow Loop Trail', 120, 2)]);
    },
  });
  return { result, generation };
}

const ENV = 'TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS';
let saved;
beforeEach(() => { saved = process.env[ENV]; });
afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved; });

test('trusted this turn: the same_as equivalent is pinned, offered as the same place, and satisfies the named request', async () => {
  process.env[ENV] = 'maintainer:primary';
  const { result, generation } = await run();
  const attempt1 = JSON.stringify(generation[0]);
  expect(attempt1).toContain('alsoAcceptedAs');
  expect(attempt1).toContain('Ridge Trail Official Listing');
  expect(result.status).toBe('complete');
  expect(generation).toHaveLength(1);
});

test('reviewer not trusted this turn: identical bundle and plan, but the equivalence contributes nothing', async () => {
  delete process.env[ENV];
  const { result, generation } = await run();
  expect(JSON.stringify(generation[0])).not.toContain('alsoAcceptedAs');
  expect(result.status).not.toBe('complete');
  expect(result.attempts[0].validationReasonCodes).toContain('missing_requested_named_experience_1');
});
