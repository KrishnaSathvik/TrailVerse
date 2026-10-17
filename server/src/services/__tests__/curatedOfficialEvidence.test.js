'use strict';

/**
 * Phase 9C.1D.5C-C — curated official-source evidence pipeline.
 *
 * Synthetic records only (the shipped seed is empty). Real Yosemite ids are used
 * once, to prove an emitted `same_as` cannot yet change named-experience
 * satisfaction (that is 5C-D).
 */

const path = require('path');
const {
  parseTrustedRelationshipReviewers,
  getTrustedRelationshipReviewers,
} = require('../../config/trustedRelationshipReviewers');
const { candidateHash } = require('../../utils/experienceRelationships');
const {
  experienceHash,
  validateCuratedExperience,
  promoteCuratedExperience,
} = require('../../utils/curatedExperienceRecords');
const {
  loadCuratedDataset,
  buildCuratedAuthority,
  createCuratedOfficialEvidenceProvider,
} = require('../providers/curatedOfficialEvidenceProvider');
const { createCuratedEvidenceOverlay } = require('../curatedEvidenceOverlay');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { assertPublicEvidenceWrite } = require('../../utils/evidencePrivacy');
const { evaluateRequirementCoverage } = require('../evidenceCoverageEvaluator');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
} = require('../../utils/namedExperienceRequirements');

const NOW = new Date('2026-09-15T12:00:00.000Z');
const PARK = 'nps:park:synth';
const TRAIL = `${PARK}:experience:ridge-trail`;
const TRAILHEAD = `${PARK}:place:ridge-and-canyon-trailhead`;
const WATERFALL = `${PARK}:place:upper-cascade`;
const TRUSTED = ['maintainer:primary'];

const SOURCE = Object.freeze({
  url: 'https://www.nps.gov/synth/planyourvisit/ridge-trail.htm',
  title: 'Ridge Trail - Synthetic National Park',
  publisher: 'National Park Service',
  excerpt: 'The Ridge Trail begins at the Ridge and Canyon Trailhead.',
});
const CHECK = Object.freeze({
  checkedAt: '2026-09-10T00:00:00.000Z', httpStatus: 200, finalUrl: SOURCE.url, excerptFound: true,
});

const experience = (over = {}) => ({
  entityId: TRAIL, contextEntityId: PARK, canonicalName: 'Ridge Trail', category: 'trail',
  activityTypes: ['hike'], source: { ...SOURCE }, sourceCheck: { ...CHECK }, ...over,
});
const relationship = (subjectEntityId, rel, objectEntityId, over = {}) => ({
  subjectEntityId, relationship: rel, objectEntityId, contextEntityId: PARK,
  source: { ...SOURCE }, sourceCheck: { ...CHECK }, proposedBy: { kind: 'agent', id: 'agent:curation-assistant' }, ...over,
});
const review = (hash, over = {}) => ({
  candidateHash: hash, decision: 'approved', reviewMethod: 'human', reviewerId: 'maintainer:primary',
  reviewedAt: '2026-09-12T00:00:00.000Z', reviewAfter: '2027-09-12T00:00:00.000Z', ...over,
});

function provider(dataset, over = {}) {
  return createCuratedOfficialEvidenceProvider({
    dataset, trustedReviewerIds: TRUSTED, now: () => NOW, ...over,
  });
}

// ---------------------------------------------------------------------------
describe('trusted reviewer configuration', () => {
  test('parses maintainer:primary', () => {
    expect(parseTrustedRelationshipReviewers('maintainer:primary').reviewerIds).toEqual(['maintainer:primary']);
  });

  test('absent or empty config trusts nobody', () => {
    expect(getTrustedRelationshipReviewers({})).toEqual([]);
    expect(getTrustedRelationshipReviewers({ TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS: '   ' })).toEqual([]);
  });

  test('duplicates collapse deterministically; whitespace/comma separated; case folded', () => {
    const out = parseTrustedRelationshipReviewers(' maintainer:parks-editor-1, Maintainer:Primary maintainer:primary,maintainer:primary ');
    expect(out.reviewerIds).toEqual(['maintainer:parks-editor-1', 'maintainer:primary']);
  });

  test('malformed and email-like ids are rejected, never trusted', () => {
    const out = parseTrustedRelationshipReviewers('maintainer:primary someone@example.com primary :x x: a:b@c');
    expect(out.reviewerIds).toEqual(['maintainer:primary']);
    expect(out.rejected).toEqual(expect.arrayContaining(['someone@example.com', 'primary', ':x', 'x:']));
  });

  test('getTrustedRelationshipReviewers reads the server env key', () => {
    expect(getTrustedRelationshipReviewers({ TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS: 'maintainer:primary' })).toEqual(['maintainer:primary']);
  });
});

// ---------------------------------------------------------------------------
describe('data files: separation and self-declared trust', () => {
  const files = (contents) => (p) => {
    const name = path.basename(p);
    if (!(name in contents)) throw new Error('ENOENT');
    return JSON.stringify(contents[name]);
  };

  test('each file contributes only its own array; extra keys (e.g. trustedReviewers) are ignored and reported', () => {
    const { dataset, issues } = loadCuratedDataset({
      dir: '/virtual',
      readFile: files({
        'experiences.json': { schemaVersion: 1, experiences: [experience()] },
        'relationshipCandidates.json': { schemaVersion: 1, candidates: [], approved: true },
        'reviews.json': { schemaVersion: 1, reviews: [], trustedReviewers: ['agent:curation-assistant'] },
      }),
    });
    expect(dataset.experiences).toHaveLength(1);
    expect(issues).toEqual(['candidates:ignored_field:approved', 'reviews:ignored_field:trustedReviewers']);
  });

  test('a review naming an untrusted reviewer confers nothing even if the data file claims trust', () => {
    const exp = experience();
    const out = buildCuratedAuthority({
      dataset: { experiences: [exp], candidates: [], reviews: [review(experienceHash(exp), { reviewerId: 'agent:curation-assistant' })] },
      trustedReviewerIds: TRUSTED,
      now: NOW,
    });
    expect(out.experiences).toEqual([]);
    expect(out.diagnostics.experiences.rejected).toBe(1);
  });

  test('missing/malformed files yield no records and a diagnostic, never an exception', () => {
    const { dataset, issues } = loadCuratedDataset({ dir: '/virtual', readFile: files({ 'reviews.json': { schemaVersion: 2, reviews: [] } }) });
    expect(dataset).toEqual({ experiences: [], candidates: [], reviews: [] });
    expect(issues).toEqual(['candidates:unreadable', 'experiences:unreadable', 'reviews:unsupported_schema_version']);
  });
});

// ---------------------------------------------------------------------------
describe('curated experience records', () => {
  test('a well-formed record validates; an approved trusted review promotes it', () => {
    expect(validateCuratedExperience(experience())).toEqual({ ok: true, reasons: [] });
    const exp = experience();
    const out = promoteCuratedExperience({ record: exp, review: review(experienceHash(exp)), trustedReviewerIds: TRUSTED, now: NOW });
    expect(out.ok).toBe(true);
    expect(out.experience).toMatchObject({ entityId: TRAIL, canonicalName: 'Ridge Trail', verification: { reviewMethod: 'human' } });
  });

  test.each([
    ['entity outside its park context', { entityId: 'nps:park:other:experience:ridge-trail' }, 'experience_entity_outside_context'],
    ['entity not in the experience namespace', { entityId: `${PARK}:place:ridge-trail` }, 'experience_entity_outside_context'],
    ['version-specific id', { entityId: 'ev:abc' }, 'invalid_experience_entity_id'],
    ['empty name', { canonicalName: ' ' }, 'invalid_canonical_name'],
    ['unsupported category', { category: 'restaurant' }, 'unsupported_category'],
    ['non-official source', { source: { ...SOURCE, url: 'https://www.alltrails.com/x' } }, 'source_host_not_allowlisted'],
    ['excerpt not found', { sourceCheck: { ...CHECK, excerptFound: false } }, 'excerpt_not_verified_on_source'],
  ])('%s is rejected', (_label, over, reason) => {
    expect(validateCuratedExperience(experience(over)).reasons).toContain(reason);
  });

  test('an unreviewed experience is pending, not authoritative', () => {
    const out = buildCuratedAuthority({ dataset: { experiences: [experience()], candidates: [], reviews: [] }, trustedReviewerIds: TRUSTED, now: NOW });
    expect(out.experiences).toEqual([]);
    expect(out.diagnostics.experiences.pending).toBe(1);
  });

  test('two different records claiming one entity id conflict and neither is emitted', () => {
    const a = experience();
    const b = experience({ canonicalName: 'Ridge Trail Loop' });
    const out = buildCuratedAuthority({
      dataset: { experiences: [a, b], candidates: [], reviews: [review(experienceHash(a)), review(experienceHash(b))] },
      trustedReviewerIds: TRUSTED, now: NOW,
    });
    expect(out.experiences).toEqual([]);
    expect(out.diagnostics.experiences.conflicts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('proposal/review join is by candidateHash only', () => {
  test('a review whose hash matches no record is an orphan and authorizes nothing', () => {
    const rel = relationship(TRAILHEAD, 'access_point_for', TRAIL);
    const out = buildCuratedAuthority({
      dataset: { experiences: [], candidates: [rel], reviews: [review('sha256:not-this-one')] },
      trustedReviewerIds: TRUSTED, now: NOW,
    });
    expect(out.relationships).toEqual([]);
    expect(out.diagnostics.relationships.pending).toBe(1);
    expect(out.diagnostics.orphanReviews).toBe(1);
  });

  test('editing a candidate after approval voids the approval', () => {
    const approvedVersion = relationship(TRAILHEAD, 'access_point_for', TRAIL);
    const edited = relationship(TRAILHEAD, 'same_as', TRAIL);
    const out = buildCuratedAuthority({
      dataset: { experiences: [], candidates: [edited], reviews: [review(candidateHash(approvedVersion))] },
      trustedReviewerIds: TRUSTED, now: NOW,
    });
    expect(out.relationships).toEqual([]);
  });

  test('a later rejection supersedes an earlier approval of the same record', () => {
    const rel = relationship(TRAILHEAD, 'access_point_for', TRAIL);
    const hash = candidateHash(rel);
    const out = buildCuratedAuthority({
      dataset: { experiences: [], candidates: [rel], reviews: [review(hash), review(hash, { decision: 'rejected', reviewedAt: '2026-09-13T00:00:00.000Z' })] },
      trustedReviewerIds: TRUSTED, now: NOW,
    });
    expect(out.relationships).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('provider emission', () => {
  const exp = experience();
  const access = relationship(TRAILHEAD, 'access_point_for', TRAIL);
  const part = relationship(WATERFALL, 'part_of', TRAIL);
  const full = () => ({
    experiences: [exp],
    candidates: [access, part],
    reviews: [review(experienceHash(exp)), review(candidateHash(access)), review(candidateHash(part))],
  });

  test('approved trusted records are emitted as authoritative fact + relationship evidence for their park', () => {
    const items = provider(full()).evidenceFor(PARK);
    expect(items.map((i) => [i.evidenceType, i.source.provider]).sort()).toEqual([
      ['fact', 'curated_experience'], ['relationship', 'curated_relationship'], ['relationship', 'curated_relationship'],
    ]);
    const fact = items.find((i) => i.evidenceType === 'fact');
    expect(fact.claim.normalizedValue.name).toBe('Ridge Trail');
    const rel = items.find((i) => i.claim.subjectId === TRAILHEAD);
    expect(rel.claim).toMatchObject({ subjectId: TRAILHEAD, objectId: TRAIL, normalizedValue: { relationship: 'access_point_for' } });
    expect(provider(full()).evidenceFor('nps:park:other')).toEqual([]);
  });

  test.each([
    ['pending (no review)', (d) => ({ ...d, reviews: d.reviews.filter((r) => r.candidateHash !== candidateHash(access)) })],
    ['rejected', (d) => ({ ...d, reviews: d.reviews.map((r) => (r.candidateHash === candidateHash(access) ? { ...r, decision: 'rejected' } : r)) })],
    ['expired', (d) => ({ ...d, reviews: d.reviews.map((r) => (r.candidateHash === candidateHash(access) ? { ...r, reviewedAt: '2025-09-12T00:00:00.000Z', reviewAfter: '2026-09-01T00:00:00.000Z' } : r)) })],
    ['untrusted reviewer', (d) => ({ ...d, reviews: d.reviews.map((r) => (r.candidateHash === candidateHash(access) ? { ...r, reviewerId: 'maintainer:unknown' } : r)) })],
  ])('%s relationship is not emitted', (_label, mutate) => {
    const items = provider(mutate(full())).evidenceFor(PARK);
    expect(items.some((i) => i.claim.subjectId === TRAILHEAD)).toBe(false);
    expect(items.some((i) => i.claim.subjectId === WATERFALL)).toBe(true);
  });

  test('malformed source check is not emitted', () => {
    const bad = relationship(TRAILHEAD, 'access_point_for', TRAIL, { sourceCheck: { ...CHECK, httpStatus: 500 } });
    const items = provider({ experiences: [], candidates: [bad], reviews: [review(candidateHash(bad))] }).evidenceFor(PARK);
    expect(items).toEqual([]);
  });

  test('conflicting approved relationships are not emitted and are counted', () => {
    const a = relationship(TRAILHEAD, 'access_point_for', TRAIL);
    const b = relationship(TRAILHEAD, 'same_as', TRAIL);
    const p = provider({ experiences: [], candidates: [a, b], reviews: [review(candidateHash(a)), review(candidateHash(b))] });
    expect(p.evidenceFor(PARK)).toEqual([]);
    expect(p.diagnostics().relationships.conflicts).toBe(1);
  });

  test('zero trusted reviewers → nothing emitted even for fully approved records', () => {
    expect(provider(full(), { trustedReviewerIds: [] }).evidenceFor(PARK)).toEqual([]);
  });

  test('emitted evidence has deterministic keys and passes the public-write privacy policy', () => {
    const first = provider(full()).evidenceFor(PARK);
    const second = provider(full()).evidenceFor(PARK);
    expect(first.map((i) => i.evidenceId)).toEqual(second.map((i) => i.evidenceId));
    for (const item of first) {
      expect(item.evidenceId).toBe(buildEvidenceKeys(item).evidenceId);
      expect(() => assertPublicEvidenceWrite({ item, sourceRequest: { privacyScope: 'public' } })).not.toThrow();
    }
  });

  test('diagnostics are bounded counts with no review internals', () => {
    const d = provider(full()).diagnostics();
    expect(d).toMatchObject({ trustedReviewerCount: 1, experiences: { authoritative: 1 }, relationships: { authoritative: 2 } });
    expect(JSON.stringify(d)).not.toMatch(/maintainer|sha256|nps\.gov/);
  });

  test('provider shape: supports activities for a curated park only; fetch never proves absence', async () => {
    const p = provider(full());
    expect(p.supports({ topic: 'activities', entity: { entityId: PARK } })).toBe(true);
    expect(p.supports({ topic: 'fees', entity: { entityId: PARK } })).toBe(false);
    expect(p.estimateCost()).toMatchObject({ costUsd: 0 });
    const request = p.buildRequest({ topic: 'activities', entity: { entityId: PARK } });
    const fetched = await p.fetch(request);
    expect(fetched.completeness).toMatchObject({ isComplete: false, emptyMeans: 'unknown' });
    expect((await p.normalize(fetched.raw)).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('shipped seed (Phase 9C.1D.5C-E3: four approved Yosemite records)', () => {
  const APPROVED = [
    'sha256:334f2c28012f02faca3faabe76bc5fc1bbeb794d2d4ebda2cdc5af098f763d48',
    'sha256:46ccf445440ee08bfa5d6c6aeb0112adb11c1870084fc09030ec62931f36c745',
    'sha256:889e720fe516228f474519fddaaf222958140eec703d0f215997ed609aa9b37c',
    'sha256:b0245572180b194c3eb805c58b5ba0bf71b852c6a93236147daa2f75c5e354e8',
  ];

  test('the real data directory loads cleanly: three experiences, one relationship, four human reviews — hashes all approved', () => {
    const { dataset, issues } = loadCuratedDataset();
    expect(issues).toEqual([]);
    expect(dataset.experiences).toHaveLength(3);
    expect(dataset.candidates).toHaveLength(1);
    const recordHashes = [...dataset.experiences.map(experienceHash), ...dataset.candidates.map(candidateHash)].sort();
    expect(recordHashes).toEqual(APPROVED);
    expect(dataset.reviews.map((r) => r.candidateHash).sort()).toEqual(APPROVED);
    expect(dataset.reviews.every((r) => r.decision === 'approved' && r.reviewMethod === 'human' && r.reviewerId === 'maintainer:primary')).toBe(true);
  });

  test('without server trust the shipped provider is inert: records exist, nothing is emitted, no failure', async () => {
    const p = createCuratedOfficialEvidenceProvider({ trustedReviewerIds: [] });
    expect(p.hasRecords()).toBe(true);
    expect(p.evidenceFor('nps:park:yose')).toEqual([]);
    expect(p.supports({ topic: 'activities', entity: { entityId: 'nps:park:yose' } })).toBe(false);
    const fetched = await p.fetch(p.buildRequest({ topic: 'activities', entity: { entityId: 'nps:park:yose' } }));
    expect(await p.normalize(fetched.raw)).toEqual([]);
    expect(p.diagnostics()).toMatchObject({ trustedReviewerCount: 0, experiences: { authoritative: 0 }, relationships: { authoritative: 0 }, loadIssues: [] });
  });

  test.each([
    ['untrusted, Yosemite', [], 'nps:park:yose'],
    ['trusted, non-Yosemite context', TRUSTED, 'nps:park:zion'],
  ])('the overlay returns the resolver bundle object unchanged (%s)', async (_label, trusted, entityId) => {
    const bundle = buildEvidenceBundle({ requestId: 'r', resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: [] }], candidates: [] });
    const overlay = createCuratedEvidenceOverlay({
      resolver: { resolveEvidence: async () => bundle },
      provider: createCuratedOfficialEvidenceProvider({ trustedReviewerIds: trusted }),
    });
    const out = await overlay.resolveEvidence({ requirements: [{ requirementId: 'acts', topic: 'activities', entity: { entityId } }], requestId: 'r' });
    expect(out).toBe(bundle);
  });
});

// ---------------------------------------------------------------------------
describe('overlay with records supplements without changing resolution', () => {
  test('curated evidence ids are appended to the activities resolution; statuses and other resolutions unchanged', async () => {
    const exp = experience();
    const p = provider({ experiences: [exp], candidates: [], reviews: [review(experienceHash(exp))] });
    const base = buildEvidenceBundle({
      requestId: 'r',
      resolutions: [
        { requirementId: 'acts', status: 'satisfied_partial', evidenceIds: [] },
        { requirementId: 'fees', status: 'missing', evidenceIds: [] },
      ],
      candidates: [],
    });
    const overlay = createCuratedEvidenceOverlay({ resolver: { resolveEvidence: async () => base }, provider: p });
    const out = await overlay.resolveEvidence({
      requestId: 'r',
      requirements: [
        { requirementId: 'acts', topic: 'activities', entity: { entityId: PARK } },
        { requirementId: 'fees', topic: 'fees', entity: { entityId: PARK } },
      ],
    });
    expect(out.resolutions.map((r) => [r.requirementId, r.status])).toEqual([['acts', 'satisfied_partial'], ['fees', 'missing']]);
    expect(out.resolutions[0].evidenceIds).toHaveLength(1);
    expect(out.resolutions[1].evidenceIds).toEqual([]);
    expect(out.summary).toEqual(base.summary);
    expect(out.evidence[0].claim.normalizedValue.name).toBe('Ridge Trail');
  });
});

// ---------------------------------------------------------------------------
describe('planner / coverage acceptance', () => {
  const { planEvidenceRequirements } = require('../evidencePlannerService');

  test('the activities requirement now accepts relationship evidence, with fact still first', () => {
    const reqs = planEvidenceRequirements({
      turnId: 't', userPrompt: 'Plan a 1 day trip to Zion National Park with an easy hike.',
      intent: { primaryIntent: 'full_trip', verticals: ['itinerary'], entities: [] },
      resolvedEntities: [{ entityId: 'nps:park:zion', entityType: 'national_park', parkCode: 'zion', displayName: 'Zion National Park', latitude: 37.3, longitude: -113.0, resolutionConfidence: 1 }],
    });
    const acts = reqs.find((r) => r.topic === 'activities');
    expect(acts.evidenceTypes).toEqual(['fact', 'description', 'relationship']);
  });

  const exp = experience();
  const access = relationship(TRAILHEAD, 'access_point_for', TRAIL);
  const items = provider({ experiences: [exp], candidates: [access], reviews: [review(experienceHash(exp)), review(candidateHash(access))] }).evidenceFor(PARK);
  const factItem = items.find((i) => i.evidenceType === 'fact');
  const relItem = items.find((i) => i.evidenceType === 'relationship');
  const activitiesRequirement = {
    requirementId: 'acts', topic: 'activities', entity: { entityId: PARK, entityType: 'national_park' },
    evidenceTypes: ['fact', 'description', 'relationship'], minimumAuthorityClass: 'official_owner',
    freshnessClass: 'stable', maxAgeSeconds: 30 * 86400, maxStaleSeconds: 90 * 86400, criticality: 'optional',
  };

  test('relationship evidence alone does NOT satisfy activities (it is supplementary)', () => {
    const out = evaluateRequirementCoverage(activitiesRequirement, [relItem], { now: NOW });
    expect(out.status).toBe('missing');
    expect(out.evidenceIds).toEqual([]);
  });

  test('alongside a fact, relationship evidence is accepted and selected', () => {
    const out = evaluateRequirementCoverage(activitiesRequirement, [factItem, relItem], { now: NOW });
    expect(out.status).toMatch(/^satisfied_/);
    expect(out.evidenceIds.sort()).toEqual([factItem.evidenceId, relItem.evidenceId].sort());
  });

  test('campground relationship evidence is unaffected (relationship-only still satisfies campgrounds)', () => {
    const campRequirement = { ...activitiesRequirement, requirementId: 'camp', topic: 'campgrounds', evidenceTypes: ['relationship', 'fact'] };
    const campRel = { ...relItem, topic: 'campgrounds' };
    const out = evaluateRequirementCoverage(campRequirement, [campRel], { now: NOW });
    expect(out.status).toMatch(/^satisfied_/);
  });

  test('curated relationships are never rendered as evidence blocks; curated experiences render without review internals', () => {
    const bundle = buildEvidenceBundle({
      requestId: 'r',
      resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: [factItem.evidenceId, relItem.evidenceId] }],
      candidates: [factItem, relItem],
    });
    const out = renderEvidenceBundleForPrompt({ bundle, requirements: [activitiesRequirement], userRequest: 'hike Ridge Trail', maxTokens: 1200 });
    expect(out.includedEvidenceIds).toEqual([factItem.evidenceId]);
    expect(out.text).toContain('Ridge Trail');
    expect(out.text).not.toMatch(/maintainer|sha256|reviewedAt|candidateHash/);
  });
});

// ---------------------------------------------------------------------------
describe('named-experience behavior unchanged (same_as is not integrated until 5C-D)', () => {
  const YOSE = require(path.join(__dirname, 'fixtures/namedExperience/yose-activities-2026-09-15.json'));
  // Stable namespaced ids for real fixture places. Named-experience resolution
  // never reads relationship endpoints (that is 5C-D), so any stable id works.
  const entityIdOf = (name) => {
    expect(YOSE.candidates.some((c) => c.claim.normalizedValue.name === name)).toBe(true);
    return `nps:park:yose:place:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  };
  const yoseBundle = (extra = []) => buildEvidenceBundle({
    requestId: 'y',
    resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: [...YOSE.candidates.map((c) => c.evidenceId), ...extra.map((e) => e.evidenceId)] }],
    candidates: [...YOSE.candidates, ...extra],
  });
  const plan = (names) => ({ days: [{ dayNumber: 1, stops: names.map((name, i) => ({ id: `s${i}`, name, type: 'viewpoint', duration: 60 })) }] });

  test('an emitted authoritative same_as (Tunnel View ↔ Glacier Point) does not let Tunnel View satisfy "visit Glacier Point"', () => {
    const tunnel = entityIdOf('Tunnel View');
    const glacier = entityIdOf('Glacier Point');
    const sameAs = {
      subjectEntityId: tunnel, relationship: 'same_as', objectEntityId: glacier, contextEntityId: 'nps:park:yose',
      source: { ...SOURCE, url: 'https://www.nps.gov/yose/x.htm' }, sourceCheck: { ...CHECK, finalUrl: 'https://www.nps.gov/yose/x.htm' },
    };
    const emitted = createCuratedOfficialEvidenceProvider({
      dataset: { experiences: [], candidates: [sameAs], reviews: [review(candidateHash(sameAs))] },
      trustedReviewerIds: TRUSTED, now: () => NOW,
    }).evidenceFor('nps:park:yose');
    expect(emitted).toHaveLength(1);

    const withRelationship = yoseBundle(emitted);
    const withoutRelationship = yoseBundle();
    const requests = extractNamedExperienceRequests('visit Glacier Point');
    const reqsWith = resolveNamedExperienceRequirements({ requests, evidenceBundle: withRelationship });
    const reqsWithout = resolveNamedExperienceRequirements({ requests, evidenceBundle: withoutRelationship });
    expect(reqsWith).toEqual(reqsWithout);
    const sat = evaluateNamedExperienceSatisfaction({ itineraryData: plan(['Tunnel View']), requirements: reqsWith, evidenceBundle: withRelationship });
    expect(sat.ok).toBe(false);
  });

  test('the Mist Trail request still resolves unavailable with the curated overlay present but empty', () => {
    const requests = extractNamedExperienceRequests('I want to hike the Mist Trail, including Vernal Fall as a stop');
    const out = resolveNamedExperienceRequirements({ requests, evidenceBundle: yoseBundle() });
    expect(out.map((r) => r.status)).toEqual(['unavailable', 'unavailable']);
  });
});
