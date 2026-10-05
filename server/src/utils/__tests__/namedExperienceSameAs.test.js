'use strict';

/**
 * Phase 9C.1D.5C-D — direct authoritative `same_as` in named-experience
 * resolution, pinning and satisfaction.
 *
 * Synthetic frozen bundles: NPS-shaped place facts carrying stable
 * `normalizedValue.entityId`, plus curated experience and relationship evidence
 * produced by the REAL 5C-C provider (so every relationship passed the real
 * authority gate before it reached the bundle).
 */

const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
  pinnedEvidenceIdsFor,
  requiredNamedPlacesPromptBlock,
  namedRequirementsRepairLine,
  MAX_SAME_AS_EQUIVALENTS,
} = require('../namedExperienceRequirements');
const { entityIdForEvidence, stableEntityKey } = require('../stableEvidenceEntity');
const { candidateHash } = require('../experienceRelationships');
const { experienceHash } = require('../curatedExperienceRecords');
const { createCuratedOfficialEvidenceProvider } = require('../../services/providers/curatedOfficialEvidenceProvider');
const { buildEvidenceBundle } = require('../evidenceBundle');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { createRepairLedger } = require('../repairLedger');

const NOW = new Date('2026-09-15T12:00:00.000Z');
const TRUSTED = ['maintainer:primary'];
const PARK = 'nps:park:zion';

const X = `${PARK}:experience:ridge-trail`; // curated experience "Ridge Trail"
const Y = `${PARK}:place:AAAA1111-0000-4000-8000-000000000001`; // NPS "Ridge Trail Official Listing"
const Y_TODO = `${PARK}:thingstodo:AAAA1111-0000-4000-8000-000000000001`; // same NPS record, other collection
const Z = `${PARK}:place:BBBB2222-0000-4000-8000-000000000002`; // NPS "Canyon Rim Trail"
const T = `${PARK}:place:CCCC3333-0000-4000-8000-000000000003`; // NPS "Ridge and Canyon Trailhead"
const W = `${PARK}:place:DDDD4444-0000-4000-8000-000000000004`; // NPS "Upper Cascade"
const U = `${PARK}:place:EEEE5555-0000-4000-8000-000000000005`; // NPS "Meadow Loop Trail"

const SOURCE = {
  url: 'https://www.nps.gov/zion/planyourvisit/ridge-trail.htm',
  title: 'Ridge Trail', publisher: 'National Park Service',
  excerpt: 'The Ridge Trail begins at the Ridge and Canyon Trailhead.',
};
const CHECK = { checkedAt: '2026-09-10T00:00:00.000Z', httpStatus: 200, finalUrl: SOURCE.url, excerptFound: true };
const review = (hash, over = {}) => ({
  candidateHash: hash, decision: 'approved', reviewMethod: 'human', reviewerId: 'maintainer:primary',
  reviewedAt: '2026-09-12T00:00:00.000Z', reviewAfter: '2027-09-12T00:00:00.000Z', ...over,
});

let seq = 0;
function npsPlace(entityId, name, activityTypes = ['hike']) {
  seq += 1;
  return {
    evidenceId: `ev:nps-${seq}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    entityId: PARK, topic: 'activities', evidenceType: 'fact', privacyScope: 'public',
    claim: { identity: `place:${entityId}`, text: `${name}: an official place.`, normalizedValue: { entityId, destinationId: PARK, name, category: 'place', activityTypes }, qualifiers: ['named_place_candidate'], polarity: 'positive' },
    source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/zion/index.htm' },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none', scopeMatch: 'exact' },
  };
}

const PLACES = {
  Y: npsPlace(Y, 'Ridge Trail Official Listing'),
  Z: npsPlace(Z, 'Canyon Rim Trail'),
  T: npsPlace(T, 'Ridge and Canyon Trailhead'),
  W: npsPlace(W, 'Upper Cascade', ['waterfall']),
  U: npsPlace(U, 'Meadow Loop Trail'),
};

const ridgeTrailExperience = {
  entityId: X, contextEntityId: PARK, canonicalName: 'Ridge Trail', category: 'trail', activityTypes: ['hike'],
  source: SOURCE, sourceCheck: CHECK,
};
const rel = (subjectEntityId, relationship, objectEntityId) => ({
  subjectEntityId, relationship, objectEntityId, contextEntityId: PARK, source: SOURCE, sourceCheck: CHECK,
});

/** Curated evidence via the real provider: only approved, trusted, non-conflicting records emerge. */
function curatedEvidence({ relationships = [], experiences = [ridgeTrailExperience], reviewOver = {} } = {}) {
  return createCuratedOfficialEvidenceProvider({
    dataset: {
      experiences,
      candidates: relationships,
      reviews: [...experiences.map((e) => review(experienceHash(e))), ...relationships.map((r) => review(candidateHash(r), reviewOver))],
    },
    trustedReviewerIds: TRUSTED,
    now: () => NOW,
  }).evidenceFor(PARK);
}

function bundle(extra = []) {
  const items = [...Object.values(PLACES), ...extra];
  return buildEvidenceBundle({
    requestId: 'same-as',
    resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: items.map((i) => i.evidenceId) }],
    candidates: items,
  });
}

const resolve = (b, text = 'I want to hike Ridge Trail', over = {}) => resolveNamedExperienceRequirements({
  requests: extractNamedExperienceRequests(text), evidenceBundle: b, trustedReviewerIds: TRUSTED, now: NOW, ...over,
});
const plan = (stops) => ({
  days: [{ id: 'd1', dayNumber: 1, label: 'x', stops: stops.map((s, i) => (typeof s === 'string' ? { id: `s${i}`, name: s, type: 'trail', duration: 90 } : { id: `s${i}`, duration: 90, type: 'trail', ...s })) }],
});
const satisfy = (b, reqs, stops) => evaluateNamedExperienceSatisfaction({ itineraryData: plan(stops), requirements: reqs, evidenceBundle: b });

const STANDARD = () => bundle(curatedEvidence({
  relationships: [rel(X, 'same_as', Y), rel(Y, 'same_as', Z), rel(T, 'access_point_for', X), rel(W, 'part_of', X)],
}));

// ---------------------------------------------------------------------------
describe('stable entity adapter', () => {
  test('NPS facts use normalizedValue.entityId; curated experiences use claim.subjectId; others are null', () => {
    const curated = curatedEvidence().find((i) => i.evidenceType === 'fact');
    expect(entityIdForEvidence(PLACES.Y)).toBe(stableEntityKey(Y));
    expect(entityIdForEvidence(curated)).toBe(X);
    const relItem = curatedEvidence({ relationships: [rel(T, 'access_point_for', X)] }).find((i) => i.evidenceType === 'relationship');
    expect(entityIdForEvidence(relItem)).toBeNull();
    expect(entityIdForEvidence({ ...PLACES.Y, source: { provider: 'brave' } })).toBeNull();
    expect(entityIdForEvidence({ ...PLACES.Y, claim: { normalizedValue: { name: 'Ridge Trail Official Listing' } } })).toBeNull();
  });

  test('NPS place and thingstodo views of one record share a key; a curated experience never collapses into NPS', () => {
    expect(stableEntityKey(Y)).toBe(stableEntityKey(Y_TODO));
    expect(stableEntityKey(X)).toBe(X);
    expect(stableEntityKey('ev:abc')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('allowed satisfaction set', () => {
  test('exact identity satisfies, unchanged', () => {
    const b = STANDARD();
    const reqs = resolve(b);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ status: 'resolved', canonicalPlaceName: 'Ridge Trail', exactEntityId: X });
    const out = satisfy(b, reqs, ['Ridge Trail']);
    expect(out.ok).toBe(true);
    expect(out.satisfiedBy).toEqual([expect.objectContaining({ relationship: 'exact', entityId: X, requestedName: 'Ridge Trail' })]);
  });

  test('direct authoritative same_as X→Y lets Y satisfy X, recorded as same_as', () => {
    const b = STANDARD();
    const reqs = resolve(b);
    expect(reqs[0].allowedEntityIds).toEqual([X, stableEntityKey(Y)]);
    const out = satisfy(b, reqs, ['Ridge Trail Official Listing']);
    expect(out.ok).toBe(true);
    expect(out.satisfiedBy[0]).toMatchObject({ relationship: 'same_as', entityId: stableEntityKey(Y), evidenceId: PLACES.Y.evidenceId });
  });

  test('reverse recording Y→X also works', () => {
    const b = bundle(curatedEvidence({ relationships: [rel(Y, 'same_as', X)] }));
    expect(satisfy(b, resolve(b), ['Ridge Trail Official Listing']).ok).toBe(true);
  });

  test('a same_as recorded against the thingstodo view of Y still admits the place view of Y', () => {
    const b = bundle(curatedEvidence({ relationships: [rel(X, 'same_as', Y_TODO)] }));
    expect(satisfy(b, resolve(b), ['Ridge Trail Official Listing']).ok).toBe(true);
  });

  test('X↔Y and Y↔Z does NOT let Z satisfy X (direct only)', () => {
    const b = STANDARD();
    const reqs = resolve(b);
    expect(reqs[0].allowedEntityIds).not.toContain(stableEntityKey(Z));
    expect(satisfy(b, reqs, ['Canyon Rim Trail']).ok).toBe(false);
  });

  test.each([
    ['access_point_for (the trailhead)', 'Ridge and Canyon Trailhead'],
    ['part_of (the waterfall on it)', 'Upper Cascade'],
    ['an unrelated same-category trail', 'Meadow Loop Trail'],
  ])('%s cannot satisfy', (_label, stopName) => {
    const b = STANDARD();
    expect(satisfy(b, resolve(b), [stopName]).ok).toBe(false);
  });

  test('a spoofed model evidenceRef cannot satisfy; identity is re-derived from the stop name', () => {
    const b = STANDARD();
    const out = satisfy(b, resolve(b), [{ name: 'Lunch break', type: 'custom', evidenceRef: PLACES.Y.evidenceId, canonicalPlaceName: 'Ridge Trail Official Listing' }]);
    expect(out.ok).toBe(false);
  });

  test('multiple direct equivalents are bounded and deterministic', () => {
    const extras = [1, 2, 3, 4, 5, 6].map((n) => npsPlace(`${PARK}:place:FFFF000${n}-0000-4000-8000-00000000000${n}`, `Ridge Trail Listing ${String.fromCharCode(64 + n)}`));
    const rels = extras.map((e) => rel(X, 'same_as', e.claim.normalizedValue.entityId));
    const b1 = bundle([...extras, ...curatedEvidence({ relationships: rels })]);
    const b2 = bundle([...extras, ...curatedEvidence({ relationships: [...rels].reverse() })]);
    const a = resolve(b1)[0];
    expect(a.allowedEntityIds).toHaveLength(1 + MAX_SAME_AS_EQUIVALENTS);
    expect(resolve(b2)[0].allowedEntityIds).toEqual(a.allowedEntityIds);
  });
});

// ---------------------------------------------------------------------------
describe('relationship authority is the frozen bundle, re-validated every turn', () => {
  test('unreviewed / pending same_as never reaches the bundle, so contributes nothing', () => {
    const provider = createCuratedOfficialEvidenceProvider({
      dataset: { experiences: [ridgeTrailExperience], candidates: [rel(X, 'same_as', Y)], reviews: [review(experienceHash(ridgeTrailExperience))] },
      trustedReviewerIds: TRUSTED, now: () => NOW,
    });
    const b = bundle(provider.evidenceFor(PARK));
    const reqs = resolve(b);
    expect(reqs[0].allowedEntityIds).toBeUndefined();
    expect(satisfy(b, reqs, ['Ridge Trail Official Listing']).ok).toBe(false);
  });

  test('the same bundle loses the equivalence when the reviewer is no longer trusted this turn', () => {
    const b = STANDARD();
    const reqs = resolve(b, undefined, { trustedReviewerIds: [] });
    expect(reqs[0].allowedEntityIds).toBeUndefined();
    expect(satisfy(b, reqs, ['Ridge Trail Official Listing']).ok).toBe(false);
  });

  test('the same bundle loses the equivalence once the review has expired this turn', () => {
    const b = STANDARD();
    const reqs = resolve(b, undefined, { now: new Date('2027-10-01T00:00:00.000Z') });
    expect(reqs[0].allowedEntityIds).toBeUndefined();
  });

  test('a tampered relationship item in the bundle contributes nothing', () => {
    const items = curatedEvidence({ relationships: [rel(X, 'access_point_for', Y)] }).map((item) => {
      if (item.evidenceType !== 'relationship') return item;
      const copy = JSON.parse(JSON.stringify(item));
      copy.claim.normalizedValue.relationship = 'same_as';
      return copy;
    });
    const b = bundle(items);
    expect(resolve(b)[0].allowedEntityIds).toBeUndefined();
  });

  test('conflicting relationships for one pair are dropped — reduced coverage, never a failed turn', () => {
    const sameAs = curatedEvidence({ relationships: [rel(X, 'same_as', Y)] }).filter((i) => i.evidenceType === 'relationship');
    const access = curatedEvidence({ relationships: [rel(Y, 'access_point_for', X)] });
    const b = bundle([...access, ...sameAs]);
    const reqs = resolve(b);
    expect(reqs[0].status).toBe('resolved');
    expect(reqs[0].allowedEntityIds).toBeUndefined();
    expect(satisfy(b, reqs, ['Ridge Trail']).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('pinning, prompt and ledger', () => {
  test('all allowed identities present in the bundle are pinned, as ONE obligation', () => {
    const b = STANDARD();
    const reqs = resolve(b);
    expect(reqs).toHaveLength(1);
    const pinned = pinnedEvidenceIdsFor(reqs);
    const xId = b.evidence.find((i) => entityIdForEvidence(i) === X).evidenceId;
    expect(pinned).toEqual(expect.arrayContaining([xId, PLACES.Y.evidenceId]));
    expect(pinned).not.toContain(PLACES.Z.evidenceId);
    expect(pinned).not.toContain(PLACES.T.evidenceId);
    expect(pinned).not.toContain(PLACES.W.evidenceId);
  });

  test('prompt keeps the traveler wording and lists equivalents as the same place, not as extra requirements', () => {
    const block = requiredNamedPlacesPromptBlock(resolve(STANDARD()));
    expect(block.places).toEqual([{ travelerAskedFor: 'Ridge Trail', placeName: 'Ridge Trail', alsoAcceptedAs: ['Ridge Trail Official Listing'] }]);
    expect(block.equivalentsNote).toMatch(/SAME place/);
    expect(block.equivalentsNote).toMatch(/do not add a stop for each/);
  });

  test('repair line and ledger preserve the original request and name only the authoritative equivalent', () => {
    const reqs = resolve(STANDARD());
    const line = namedRequirementsRepairLine(reqs);
    expect(line).toContain('"Ridge Trail"');
    expect(line).toContain('"Ridge Trail Official Listing"');
    expect(line).not.toMatch(/Canyon Rim|Trailhead|Upper Cascade|Meadow Loop/);
    const ledger = createRepairLedger({ userPrompt: 'I want to hike Ridge Trail', namedExperienceRequirements: reqs });
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['missing_requested_named_experience_1'] });
    const contract = ledger.buildRepairContract();
    expect(contract).toContain('explicit traveler requirement: "Ridge Trail"');
    expect(contract).toContain('"Ridge Trail Official Listing"');
    expect(contract).not.toMatch(/Canyon Rim|Ridge and Canyon Trailhead|Upper Cascade/);
  });

  test('completeness clears the obligation through same_as and exposes exact vs same_as internally', () => {
    const b = STANDARD();
    const reqs = resolve(b);
    const out = evaluateItineraryCompleteness({
      itineraryData: plan([{ name: 'Ridge Trail Official Listing', type: 'trail', duration: 180 }]),
      userPrompt: 'I want to hike Ridge Trail', evidenceBundle: b, namedExperienceRequirements: reqs,
    });
    expect(out.reasonCodes).not.toContain('missing_requested_named_experience_1');
    expect(out.namedExperienceSatisfaction).toEqual([expect.objectContaining({ relationship: 'same_as' })]);
  });
});

// ---------------------------------------------------------------------------
describe('5B behavior preserved', () => {
  test('without relationships the requirement carries no equivalence fields and the prompt block is unchanged', () => {
    const b = bundle(curatedEvidence());
    const reqs = resolve(b);
    expect(reqs[0]).not.toHaveProperty('allowedEntityIds');
    expect(reqs[0]).not.toHaveProperty('equivalents');
    expect(pinnedEvidenceIdsFor(reqs)).toEqual(reqs[0].evidenceIds);
    expect(requiredNamedPlacesPromptBlock(reqs)).toEqual({
      instructions: expect.any(String),
      places: [{ travelerAskedFor: 'Ridge Trail', placeName: 'Ridge Trail' }],
    });
  });

  test('same_as cannot conjure an identity: an unresolvable named feature stays unavailable', () => {
    const b = STANDARD();
    const reqs = resolve(b, 'I want to hike Ghost Falls Trail');
    expect(reqs.map((r) => r.status)).toEqual(['unavailable']);
  });
});
