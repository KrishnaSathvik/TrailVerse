'use strict';

/**
 * Phase 9C.1D.5C-E3 — the four human-approved Yosemite records, end to end
 * through the REAL shipped data files, the REAL curated provider (trust read
 * from the server environment) and the REAL overlay, over the fresh NPS
 * Yosemite fixture (stable entity ids). No model dispatch anywhere.
 *
 *   A  nps:park:yose:experience:mist-trail              (experience)
 *   B  nps:park:yose:experience:vernal-fall-footbridge  (experience)
 *   C  nps:park:yose:experience:vernal-fall             (experience)
 *   D  Mist and John Muir Trailhead access_point_for A  (relationship, context only)
 */

const path = require('path');
const { createCuratedOfficialEvidenceProvider, loadCuratedDataset } = require('../providers/curatedOfficialEvidenceProvider');
const { createCuratedEvidenceOverlay } = require('../curatedEvidenceOverlay');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { experienceHash } = require('../../utils/curatedExperienceRecords');
const { candidateHash } = require('../../utils/experienceRelationships');
const { entityIdForEvidence, stableEntityKey } = require('../../utils/stableEvidenceEntity');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
  pinnedEvidenceIdsFor,
  requiredNamedPlacesPromptBlock,
} = require('../../utils/namedExperienceRequirements');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const { buildTrailiePromptV2 } = require('../../prompts/trailiePromptV2');
const { intentToPromptMode, executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { evaluateItineraryCompleteness } = require('../../utils/itineraryCompleteness');
const { resolveStopIdentities } = require('../../utils/stopIdentityResolution');
const { createStopIdentityComparator } = require('../../utils/stopExperienceIdentity');

const FIXTURE = require(path.join(__dirname, 'fixtures/namedExperience/yose-activities-2026-09-15.json'));
const ENV = 'TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS';
const YOSE = 'nps:park:yose';
const NOW = new Date('2026-09-16T12:00:00.000Z');
const REQUEST = 'Plan me a day in Yosemite Valley. I want to hike the Mist Trail in the morning, including Vernal Fall Footbridge and Vernal Fall as stops, then do one separate scenic experience later in the day.';

const A = 'nps:park:yose:experience:mist-trail';
const B = 'nps:park:yose:experience:vernal-fall-footbridge';
const C = 'nps:park:yose:experience:vernal-fall';
const TRAILHEAD = 'nps:park:yose:place:f818a5b1-a9f9-4c3a-bc57-fb960e40b4c7';
const APPROVED = [
  'sha256:334f2c28012f02faca3faabe76bc5fc1bbeb794d2d4ebda2cdc5af098f763d48',
  'sha256:46ccf445440ee08bfa5d6c6aeb0112adb11c1870084fc09030ec62931f36c745',
  'sha256:889e720fe516228f474519fddaaf222958140eec703d0f215997ed609aa9b37c',
  'sha256:b0245572180b194c3eb805c58b5ba0bf71b852c6a93236147daa2f75c5e354e8',
];

const ACTIVITIES = { requirementId: 'acts', topic: 'activities', entity: { entityId: YOSE, entityType: 'national_park' }, reasonCodes: ['itinerary_activity_support', 'requested_named_hike_or_walk'] };

const npsBundle = (requestId = 'yose') => buildEvidenceBundle({
  requestId,
  resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: FIXTURE.candidates.map((c) => c.evidenceId) }],
  candidates: FIXTURE.candidates,
});

/** Provider built exactly as production builds it: trust comes from the environment. */
function shippedProvider({ trusted, now = () => NOW }) {
  if (trusted) process.env[ENV] = 'maintainer:primary';
  else delete process.env[ENV];
  return createCuratedOfficialEvidenceProvider({ now });
}

async function overlaid({ trusted, now } = {}) {
  const overlay = createCuratedEvidenceOverlay({
    resolver: { resolveEvidence: async ({ requestId }) => npsBundle(requestId) },
    provider: shippedProvider({ trusted, now }),
  });
  return overlay.resolveEvidence({ requirements: [ACTIVITIES], requestId: 'yose' });
}

const trustedIds = () => (process.env[ENV] ? [process.env[ENV]] : []);
const resolve = (bundle) => resolveNamedExperienceRequirements({
  requests: extractNamedExperienceRequests(REQUEST), evidenceBundle: bundle, trustedReviewerIds: trustedIds(), now: NOW,
});
const plan = (names) => ({ days: [{ id: 'd1', dayNumber: 1, label: 'Valley', stops: names.map((name, i) => ({ id: `s${i}`, order: i, name, type: 'trail', duration: 90 })) }] });

let saved;
beforeEach(() => { saved = process.env[ENV]; });
afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved; });

// ---------------------------------------------------------------------------
describe('seeded files', () => {
  test('all four seeded record hashes equal the four E2-approved hashes, and nothing else is seeded', () => {
    const { dataset } = loadCuratedDataset();
    expect([...dataset.experiences.map(experienceHash), ...dataset.candidates.map(candidateHash)].sort()).toEqual(APPROVED);
    expect(dataset.experiences.map((e) => e.entityId).sort()).toEqual([A, C, B].sort());
    expect(dataset.candidates.map((c) => c.relationship)).toEqual(['access_point_for']);
  });
});

// ---------------------------------------------------------------------------
describe('trust matrix through the real provider + overlay', () => {
  test('trusted: exactly three curated experiences and one access_point_for relationship, additive to NPS', async () => {
    const base = npsBundle();
    const out = await overlaid({ trusted: true });
    const baseIds = new Set(base.evidence.map((e) => e.evidenceId));
    const curated = out.evidence.filter((e) => !baseIds.has(e.evidenceId));
    expect(curated.map((e) => [e.evidenceType, e.source.provider]).sort()).toEqual([
      ['fact', 'curated_experience'], ['fact', 'curated_experience'], ['fact', 'curated_experience'], ['relationship', 'curated_relationship'],
    ]);
    expect(curated.filter((e) => e.evidenceType === 'fact').map(entityIdForEvidence).sort()).toEqual([A, B, C].sort());
    const rel = curated.find((e) => e.evidenceType === 'relationship');
    expect(rel.claim).toMatchObject({ subjectId: TRAILHEAD, objectId: A, normalizedValue: { relationship: 'access_point_for' } });
    // Every NPS record is still there and the resolution status is unchanged.
    expect(base.evidence.every((e) => out.evidence.some((o) => o.evidenceId === e.evidenceId))).toBe(true);
    expect(out.resolutions[0].status).toBe('satisfied_fresh');
    expect(out.summary).toEqual(base.summary);
  });

  test('untrusted: the seeded files emit nothing and the resolver bundle is returned untouched', async () => {
    const overlay = createCuratedEvidenceOverlay({
      resolver: { resolveEvidence: async () => npsBundle() },
      provider: shippedProvider({ trusted: false }),
    });
    const base = await overlay.resolveEvidence({ requirements: [ACTIVITIES], requestId: 'yose' });
    expect(base.evidence).toHaveLength(FIXTURE.candidates.length);
    expect(base.evidence.some((e) => String(e.source?.provider).startsWith('curated_'))).toBe(false);
  });

  test('a non-Yosemite context is unchanged even when trusted', () => {
    expect(shippedProvider({ trusted: true }).evidenceFor('nps:park:zion')).toEqual([]);
  });

  test('after review expiry nothing curated is authoritative', async () => {
    const out = await overlaid({ trusted: true, now: () => new Date('2027-09-16T00:00:00.000Z') });
    expect(out.evidence.some((e) => String(e.source?.provider).startsWith('curated_'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('named resolution of the exact Yosemite request', () => {
  test('trusted: all three names resolve to their exact curated identities; no same_as expansion', async () => {
    const bundle = await overlaid({ trusted: true });
    const reqs = resolve(bundle);
    expect(reqs.map((r) => [r.requestedName, r.status, r.exactEntityId, r.canonicalPlaceName])).toEqual([
      ['Mist Trail', 'resolved', A, 'Mist Trail'],
      ['Vernal Fall Footbridge', 'resolved', B, 'Vernal Fall Footbridge'],
      ['Vernal Fall', 'resolved', C, 'Vernal Fall'],
    ]);
    expect(reqs.every((r) => r.allowedEntityIds === undefined && r.equivalents === undefined)).toBe(true);
  });

  test('untrusted: the exact same request is unavailable again', async () => {
    const bundle = await overlaid({ trusted: false });
    expect(resolve(bundle).map((r) => r.status)).toEqual(['unavailable', 'unavailable', 'unavailable']);
  });

  test('the full plan satisfies all three, each by its own exact identity', async () => {
    const bundle = await overlaid({ trusted: true });
    const out = evaluateNamedExperienceSatisfaction({ itineraryData: plan(['Mist Trail', 'Vernal Fall Footbridge', 'Vernal Fall']), requirements: resolve(bundle), evidenceBundle: bundle });
    expect(out.ok).toBe(true);
    expect(out.satisfiedBy.map((s) => [s.requestedName, s.entityId, s.relationship])).toEqual([
      ['Mist Trail', A, 'exact'], ['Vernal Fall Footbridge', B, 'exact'], ['Vernal Fall', C, 'exact'],
    ]);
  });

  test('Mist Trail is satisfied only by A — the trailhead (D subject) never satisfies it', async () => {
    const bundle = await overlaid({ trusted: true });
    const out = evaluateNamedExperienceSatisfaction({ itineraryData: plan(['Mist and John Muir Trailhead', 'Vernal Fall Footbridge', 'Vernal Fall']), requirements: resolve(bundle), evidenceBundle: bundle });
    expect(out.ok).toBe(false);
    expect(out.unsatisfied.map((r) => r.requestedName)).toEqual(['Mist Trail']);
  });

  test('B satisfies only the footbridge request and C only the waterfall request', async () => {
    const bundle = await overlaid({ trusted: true });
    const reqs = resolve(bundle);
    const onlyB = evaluateNamedExperienceSatisfaction({ itineraryData: plan(['Vernal Fall Footbridge']), requirements: reqs, evidenceBundle: bundle });
    expect(onlyB.unsatisfied.map((r) => r.requestedName)).toEqual(['Mist Trail', 'Vernal Fall']);
    const onlyC = evaluateNamedExperienceSatisfaction({ itineraryData: plan(['Vernal Fall']), requirements: reqs, evidenceBundle: bundle });
    expect(onlyC.unsatisfied.map((r) => r.requestedName)).toEqual(['Mist Trail', 'Vernal Fall Footbridge']);
  });

  test('untrusted, the real execution path still fails closed before any dispatch', async () => {
    delete process.env[ENV];
    let dispatches = 0;
    const provider = shippedProvider({ trusted: false });
    const result = await executeTrailieV2Turn({
      userMessage: REQUEST, conversationContext: { history: [] }, tripState: null, constraints: null, resolvedContext: {},
    }, {
      enabled: true,
      planRequirements: () => [ACTIVITIES],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requirements, requestId }) => createCuratedEvidenceOverlay({
        resolver: { resolveEvidence: async () => npsBundle(requestId) }, provider,
      }).resolveEvidence({ requirements, requestId }),
      now: () => NOW, newTurnId: () => 'turn-e3-untrusted', streamGeneration: false, responseAdapters: {},
      executeResponses: async () => { dispatches += 1; throw new Error('no model dispatch in E3'); },
    });
    expect(result.terminalReason).toBe('requested_experience_unavailable');
    expect(dispatches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('5C-E3.1 — duplicate completeness on the exact seeded plan', () => {
  // The otherwise-correct plan E3 found rejected as duplicate_base_experience.
  const seededPlan = () => ({
    days: [{
      id: 'd1', dayNumber: 1, label: 'Mist Trail and Valley views',
      stops: [
        { id: 's1', order: 1, name: 'Mist Trail', type: 'trail', duration: 120, timeWindow: 'morning' },
        { id: 's2', order: 2, name: 'Vernal Fall Footbridge', type: 'viewpoint', duration: 30, timeWindow: 'morning' },
        { id: 's3', order: 3, name: 'Vernal Fall', type: 'waterfall', duration: 45, timeWindow: 'morning' },
        { id: 's4', order: 4, name: 'Tunnel View', type: 'viewpoint', duration: 45, timeWindow: 'late afternoon' },
      ],
    }],
  });
  const complete = (bundle, extra = {}) => evaluateItineraryCompleteness({
    itineraryData: seededPlan(), userPrompt: REQUEST, evidenceBundle: bundle, namedExperienceRequirements: resolve(bundle),
    relationshipAuthority: { trustedReviewerIds: trustedIds(), now: NOW }, ...extra,
  });

  test('(13) Mist Trail + Vernal Fall Footbridge + Vernal Fall pass duplicate completeness', async () => {
    const bundle = await overlaid({ trusted: true });
    // Identity binding runs first in production; every stop binds, none is rejected.
    const bound = resolveStopIdentities({ itineraryData: seededPlan(), evidenceBundle: bundle });
    expect(bound.violations).toEqual([]);
    const out = complete(bundle, { itineraryData: bound.itineraryData });
    expect(out.reasonCodes).not.toContain('duplicate_base_experience');
    expect(out.ok).toBe(true);
  });

  test('(14) all three named requirements are still satisfied by their own exact identities', async () => {
    const bundle = await overlaid({ trusted: true });
    expect(complete(bundle).namedExperienceSatisfaction.map((s) => [s.requestedName, s.entityId, s.relationship])).toEqual([
      ['Mist Trail', A, 'exact'], ['Vernal Fall Footbridge', B, 'exact'], ['Vernal Fall', C, 'exact'],
    ]);
  });

  test('6B: a retained continuous group preserves three independent named obligations', async () => {
    const bundle = await overlaid({ trusted: true });
    const plan = seededPlan();
    plan.days[0].activityGroups = [{ id: 'mist-hike', stopIds: ['s1', 's2', 's3'] }];
    const bound = resolveStopIdentities({ itineraryData: plan, evidenceBundle: bundle });
    const { normalizeItineraryActivityGroups } = require('../../utils/activityGroupValidation');
    normalizeItineraryActivityGroups(bound.itineraryData);
    expect(bound.itineraryData.days[0].activityGroups).toEqual(plan.days[0].activityGroups);
    expect(complete(bundle, { itineraryData: bound.itineraryData }).namedExperienceSatisfaction
      .map((s) => [s.requestedName, s.entityId, s.relationship])).toEqual([
      ['Mist Trail', A, 'exact'], ['Vernal Fall Footbridge', B, 'exact'], ['Vernal Fall', C, 'exact'],
    ]);
    // Identity/access context in the same authoritative bundle creates no group.
    const ungrouped = resolveStopIdentities({ itineraryData: seededPlan(), evidenceBundle: bundle });
    normalizeItineraryActivityGroups(ungrouped.itineraryData);
    expect(ungrouped.itineraryData.days[0].activityGroups).toBeUndefined();
  });

  test('the blocker was the name classifier: without the frozen bundle the same plan is still legacy padding', () => {
    const out = evaluateItineraryCompleteness({ itineraryData: seededPlan(), userPrompt: REQUEST });
    expect(out.reasonCodes).toEqual(['duplicate_base_experience']);
  });

  test('the trailhead (D subject, access_point_for A) is never collapsed into Mist Trail by identity', async () => {
    const bundle = await overlaid({ trusted: true });
    const compare = createStopIdentityComparator({ evidenceBundle: bundle, trustedReviewerIds: trustedIds(), now: NOW });
    expect(compare({ name: 'Mist and John Muir Trailhead' }, { name: 'Mist Trail' })).toBe('distinct');
    expect(compare({ name: 'Vernal Fall Footbridge' }, { name: 'Vernal Fall' })).toBe('distinct');
    expect(compare({ name: 'Vernal Fall' }, { name: 'Vernal Fall waterfall view' })).toBe('same');
  });
});

// ---------------------------------------------------------------------------
describe('pinning into the generation evidence window (no dispatch)', () => {
  test('all three required curated identities are pinned beyond ordinary ranking; D is never a pinned identity', async () => {
    const bundle = await overlaid({ trusted: true });
    const reqs = resolve(bundle);
    const curatedIds = reqs.map((r) => r.evidenceIds[0]);
    const unpinned = renderEvidenceBundleForPrompt({ bundle, requirements: [ACTIVITIES], userRequest: REQUEST, maxTokens: 1200 });
    const pinned = renderEvidenceBundleForPrompt({ bundle, requirements: [ACTIVITIES], userRequest: REQUEST, maxTokens: 1200, pinnedEvidenceIds: pinnedEvidenceIdsFor(reqs) });
    expect(curatedIds.some((id) => !unpinned.includedEvidenceIds.includes(id))).toBe(true);
    expect(pinned.includedEvidenceIds.slice(0, 3).sort()).toEqual([...curatedIds].sort());
    for (const name of ['Mist Trail', 'Vernal Fall Footbridge', 'Vernal Fall']) expect(pinned.text).toContain(name);
    const relId = bundle.evidence.find((e) => e.evidenceType === 'relationship').evidenceId;
    expect(pinnedEvidenceIdsFor(reqs)).not.toContain(relId);
    expect(pinned.includedEvidenceIds).not.toContain(relId);
  });

  test('the real prompt builder carries three independent required places and their pinned evidence', async () => {
    const bundle = await overlaid({ trusted: true });
    const reqs = resolve(bundle);
    expect(requiredNamedPlacesPromptBlock(reqs).places).toEqual([
      { travelerAskedFor: 'Mist Trail', placeName: 'Mist Trail' },
      { travelerAskedFor: 'Vernal Fall Footbridge', placeName: 'Vernal Fall Footbridge' },
      { travelerAskedFor: 'Vernal Fall', placeName: 'Vernal Fall' },
    ]);
    const snapshot = buildTrailiePromptV2({
      mode: intentToPromptMode({ primaryIntent: 'full_trip', verticals: ['itinerary'] }),
      evidenceBundle: bundle, requirements: [ACTIVITIES], userRequest: REQUEST, namedExperienceRequirements: reqs,
    });
    expect(snapshot.prompt).toContain('requiredNamedPlaces');
    for (const name of ['Mist Trail', 'Vernal Fall Footbridge', 'Vernal Fall']) expect(snapshot.prompt).toContain(`"placeName":"${name}"`);
    expect(snapshot.prompt).not.toMatch(/maintainer:primary|sha256:/);
  });
});

// ---------------------------------------------------------------------------
describe('fresh fixture', () => {
  test('retains stable NPS entity ids, including the D subject', () => {
    const withIds = FIXTURE.candidates.filter((c) => c.claim.normalizedValue.entityId);
    expect(withIds.length).toBeGreaterThanOrEqual(250);
    const trailhead = FIXTURE.candidates.find((c) => c.claim.normalizedValue.name === 'Mist and John Muir Trailhead');
    expect(stableEntityKey(trailhead.claim.normalizedValue.entityId)).toBe(stableEntityKey(TRAILHEAD));
    expect(entityIdForEvidence(trailhead)).toBe(stableEntityKey(TRAILHEAD));
  });
});
