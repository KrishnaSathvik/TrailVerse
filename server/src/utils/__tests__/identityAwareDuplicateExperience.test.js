'use strict';

/**
 * Phase 9C.1D.5C-E3.1 — identity-aware `duplicate_base_experience`.
 *
 * "Are these two stops the same base experience?" is answered by authoritative
 * stable entity identity whenever BOTH stops resolve to one through the frozen
 * bundle, and by the legacy canonical-name classifier otherwise. Everything
 * downstream of that single answer — revisit semantics, same-day padding, the
 * Phase 8D.2 touched-day scope — is unchanged.
 *
 * Synthetic frozen bundles: NPS-shaped facts with stable
 * `normalizedValue.entityId`, plus curated experience/relationship evidence from
 * the REAL 5C-C provider so every relationship passed the real authority gate.
 */

const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { classifyExperienceRelationship } = require('../canonicalExperience');
const { createStopIdentityComparator } = require('../stopExperienceIdentity');
const { candidateHash } = require('../experienceRelationships');
const { experienceHash } = require('../curatedExperienceRecords');
const { createCuratedOfficialEvidenceProvider } = require('../../services/providers/curatedOfficialEvidenceProvider');
const { buildEvidenceBundle } = require('../evidenceBundle');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');

const NOW = new Date('2026-09-15T12:00:00.000Z');
const TRUSTED = ['maintainer:primary'];
const AUTHORITY = { trustedReviewerIds: TRUSTED, now: NOW };
const PARK = 'nps:park:zion';
const UUID = (n) => `${String(n).repeat(8)}-0000-4000-8000-00000000000${n}`;

const SOURCE = {
  url: 'https://www.nps.gov/zion/planyourvisit/upper-cascade.htm',
  title: 'Upper Cascade', publisher: 'National Park Service',
  excerpt: 'The Upper Cascade Footbridge crosses the creek below Upper Cascade.',
};
const CHECK = { checkedAt: '2026-09-10T00:00:00.000Z', httpStatus: 200, finalUrl: SOURCE.url, excerptFound: true };
const review = (hash, over = {}) => ({
  candidateHash: hash, decision: 'approved', reviewMethod: 'human', reviewerId: 'maintainer:primary',
  reviewedAt: '2026-09-12T00:00:00.000Z', reviewAfter: '2027-09-12T00:00:00.000Z', ...over,
});

let seq = 0;
function nps(entityId, name, { category = 'place' } = {}) {
  seq += 1;
  return {
    evidenceId: `ev:nps-${seq}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    entityId: PARK, topic: 'activities', evidenceType: 'fact', privacyScope: 'public',
    claim: { identity: `place:${entityId}`, text: `${name}: an official place.`, normalizedValue: { entityId, destinationId: PARK, name, category, activityTypes: ['hike'] }, qualifiers: ['named_place_candidate'], polarity: 'positive' },
    source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/zion/index.htm' },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none', scopeMatch: 'exact' },
  };
}
/** A web snippet that happens to name a place: it carries NO entity identity. */
function web(name) {
  seq += 1;
  return {
    evidenceId: `ev:web-${seq}`, entityId: PARK, topic: 'activities', evidenceType: 'fact', privacyScope: 'public',
    claim: { identity: `web:${seq}`, text: name, normalizedValue: { name }, qualifiers: [], polarity: 'positive' },
    source: { provider: 'web', sourceClass: 'third_party', url: 'https://example.com/x' },
    quality: { authorityClass: 'third_party', conflictStatus: 'none', scopeMatch: 'exact' },
  };
}

const curatedExperience = (slug, canonicalName, category = 'place') => ({
  entityId: `${PARK}:experience:${slug}`, contextEntityId: PARK, canonicalName, category, source: SOURCE, sourceCheck: CHECK,
});
const rel = (subjectEntityId, relationship, objectEntityId) => ({
  subjectEntityId, relationship, objectEntityId, contextEntityId: PARK, source: SOURCE, sourceCheck: CHECK,
});

function curated({ experiences = [], relationships = [], reviewOver = {} } = {}) {
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

function bundle(items) {
  return buildEvidenceBundle({
    requestId: 'identity-dup',
    resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: items.map((i) => i.evidenceId) }],
    candidates: items,
  });
}

const stop = (name, i, over = {}) => ({ id: `s${i}`, order: i, name, type: 'trail', duration: 90, ...over });
const oneDay = (names) => ({
  days: [{ id: 'd1', dayNumber: 1, label: 'Day', stops: names.map((n, i) => (typeof n === 'string' ? stop(n, i) : stop(n.name, i, n))) }],
});
const isDuplicate = (plan, evidenceBundle, authority = AUTHORITY) => evaluateItineraryCompleteness({
  itineraryData: plan, userPrompt: 'Plan a full day.', evidenceBundle, relationshipAuthority: authority,
}).reasonCodes.includes('duplicate_base_experience');

// The Vernal-Fall-shaped pair, synthetic: one name contains the other.
const FOOTBRIDGE = curatedExperience('upper-cascade-footbridge', 'Upper Cascade Footbridge');
const CASCADE = curatedExperience('upper-cascade', 'Upper Cascade', 'waterfall');
const FOOTBRIDGE_ID = FOOTBRIDGE.entityId;
const CASCADE_ID = CASCADE.entityId;

// ---------------------------------------------------------------------------
describe('authority precedence', () => {
  test('(1) distinct authoritative curated identities are NOT duplicates despite name containment', () => {
    const b = bundle(curated({ experiences: [FOOTBRIDGE, CASCADE] }));
    const compare = createStopIdentityComparator({ evidenceBundle: b, ...AUTHORITY });
    expect(compare(stop('Upper Cascade Footbridge', 0), stop('Upper Cascade', 1))).toBe('distinct');
    expect(isDuplicate(oneDay(['Upper Cascade Footbridge', 'Upper Cascade']), b)).toBe(false);
  });

  test('(2) the same two names without authoritative identity follow the legacy name classifier', () => {
    const plan = oneDay(['Upper Cascade Footbridge', 'Upper Cascade']);
    // No bundle at all.
    expect(isDuplicate(plan, null)).toBe(true);
    // A bundle whose matching records carry no entity identity.
    const b = bundle([web('Upper Cascade Footbridge'), web('Upper Cascade')]);
    expect(createStopIdentityComparator({ evidenceBundle: b, ...AUTHORITY })(plan.days[0].stops[0], plan.days[0].stops[1])).toBeNull();
    expect(isDuplicate(plan, b)).toBe(true);
    // Only ONE side resolved authoritatively → still legacy.
    const half = bundle([...curated({ experiences: [FOOTBRIDGE] }), web('Upper Cascade')]);
    expect(isDuplicate(plan, half)).toBe(true);
  });

  test('(3) two stops backed by the same stable entity stay duplicates even when evidence ids differ', () => {
    const id = `${PARK}:place:${UUID(1)}`;
    const b = bundle([nps(id, 'Canyon Overlook Trail'), nps(id, 'Canyon Viewpoint Walk')]);
    expect(b.evidence[0].evidenceId).not.toBe(b.evidence[1].evidenceId);
    // Names the legacy classifier would call distinct: identity is what joins them.
    expect(classifyExperienceRelationship(stop('Canyon Overlook Trail', 0), stop('Canyon Viewpoint Walk', 1))).toBe('distinct');
    expect(isDuplicate(oneDay(['Canyon Overlook Trail', 'Canyon Viewpoint Walk']), b)).toBe(true);
  });

  test('(4) NPS place and thingstodo views of one upstream record remain duplicates', () => {
    const b = bundle([
      nps(`${PARK}:place:${UUID(2)}`, 'Riverside Walk'),
      nps(`${PARK}:thingstodo:${UUID(2)}`, 'Hike the Gateway to the Narrows'),
    ]);
    expect(isDuplicate(oneDay(['Riverside Walk', 'Hike the Gateway to the Narrows']), b)).toBe(true);
  });

  test('(5) different entity ids joined by an authoritative direct same_as remain duplicates', () => {
    const npsId = `${PARK}:place:${UUID(3)}`;
    const withSameAs = bundle([nps(npsId, 'Cascade Falls Official Listing'), ...curated({ experiences: [CASCADE], relationships: [rel(CASCADE_ID, 'same_as', npsId)] })]);
    const without = bundle([nps(npsId, 'Cascade Falls Official Listing'), ...curated({ experiences: [CASCADE] })]);
    const plan = oneDay(['Upper Cascade', 'Cascade Falls Official Listing']);
    expect(isDuplicate(plan, without)).toBe(false);
    expect(isDuplicate(plan, withSameAs)).toBe(true);
    // Recorded in the other direction too.
    const reversed = bundle([nps(npsId, 'Cascade Falls Official Listing'), ...curated({ experiences: [CASCADE], relationships: [rel(npsId, 'same_as', CASCADE_ID)] })]);
    expect(isDuplicate(plan, reversed)).toBe(true);
    // And it overrides a name-containment pair exactly like the exact-entity case would.
    const pair = bundle(curated({ experiences: [FOOTBRIDGE, CASCADE], relationships: [rel(FOOTBRIDGE_ID, 'same_as', CASCADE_ID)] }));
    expect(isDuplicate(oneDay(['Upper Cascade Footbridge', 'Upper Cascade']), pair)).toBe(true);
  });

  test('(5b) a transitive same_as chain does NOT collapse its ends', () => {
    const mid = `${PARK}:place:${UUID(4)}`;
    const b = bundle([
      nps(mid, 'Middle Listing'),
      ...curated({ experiences: [FOOTBRIDGE, CASCADE], relationships: [rel(FOOTBRIDGE_ID, 'same_as', mid), rel(mid, 'same_as', CASCADE_ID)] }),
    ]);
    expect(isDuplicate(oneDay(['Upper Cascade Footbridge', 'Upper Cascade']), b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('(6) non-authoritative same_as never collapses distinct identities', () => {
  const sameAsBundle = (reviewOver) => bundle(curated({
    experiences: [FOOTBRIDGE, CASCADE],
    relationships: [rel(FOOTBRIDGE_ID, 'same_as', CASCADE_ID)],
    reviewOver,
  }));
  const plan = oneDay(['Upper Cascade Footbridge', 'Upper Cascade']);

  test('untrusted at validation time (authority re-validated, raw fields ignored)', () => {
    const b = sameAsBundle();
    expect(isDuplicate(plan, b, AUTHORITY)).toBe(true);
    expect(isDuplicate(plan, b, { trustedReviewerIds: [], now: NOW })).toBe(false);
    expect(isDuplicate(plan, b, { trustedReviewerIds: ['someone:else'], now: NOW })).toBe(false);
    // No authority supplied at all behaves as untrusted.
    expect(isDuplicate(plan, b, null)).toBe(false);
  });

  test('expired at validation time', () => {
    expect(isDuplicate(plan, sameAsBundle(), { trustedReviewerIds: TRUSTED, now: new Date('2027-09-13T00:00:00.000Z') })).toBe(false);
  });

  test('pending / tampered verification in the frozen evidence', () => {
    const b = sameAsBundle();
    const tampered = {
      ...b,
      evidence: b.evidence.map((item) => (item.evidenceType !== 'relationship' ? item : {
        ...item,
        claim: { ...item.claim, normalizedValue: { ...item.claim.normalizedValue, verification: { ...item.claim.normalizedValue.verification, decision: 'pending' } } },
      })),
    };
    expect(isDuplicate(plan, tampered)).toBe(false);
  });

  test('conflicting facts about the pair drop the same_as', () => {
    const b = bundle(curated({
      experiences: [FOOTBRIDGE, CASCADE],
      relationships: [rel(FOOTBRIDGE_ID, 'same_as', CASCADE_ID), rel(FOOTBRIDGE_ID, 'part_of', CASCADE_ID)],
    }));
    expect(isDuplicate(plan, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('non-identity relationships', () => {
  test('(7) access_point_for does not collapse identities (trailhead ↔ trail)', () => {
    const trailheadId = `${PARK}:place:${UUID(5)}`;
    const trail = curatedExperience('cascade-trail', 'Cascade Trail', 'trail');
    const b = bundle([nps(trailheadId, 'Cascade Trailhead'), ...curated({ experiences: [trail], relationships: [rel(trailheadId, 'access_point_for', trail.entityId)] })]);
    expect(isDuplicate(oneDay(['Cascade Trailhead', 'Cascade Trail']), b)).toBe(false);
  });

  test('(8) part_of does not collapse identities', () => {
    const b = bundle(curated({ experiences: [FOOTBRIDGE, CASCADE], relationships: [rel(FOOTBRIDGE_ID, 'part_of', CASCADE_ID)] }));
    expect(isDuplicate(oneDay(['Upper Cascade Footbridge', 'Upper Cascade']), b)).toBe(false);
  });

  test('(9) unrelated distinct resolved experiences remain distinct', () => {
    const b = bundle([nps(`${PARK}:place:${UUID(6)}`, 'Weeping Rock'), nps(`${PARK}:place:${UUID(7)}`, 'Canyon Junction Bridge')]);
    expect(isDuplicate(oneDay(['Weeping Rock', 'Canyon Junction Bridge']), b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('legacy protection is unchanged', () => {
  test('(10) unresolved fuzzy duplicates are still padding', () => {
    for (const names of [["Pa'rus Trail", "Pa'rus Trail riverside exhibits"], ['Old Faithful', 'Old Faithful Geyser']]) {
      expect(isDuplicate(oneDay(names), null)).toBe(true);
      // Catalogue present but these names are not in it.
      expect(isDuplicate(oneDay(names), bundle([nps(`${PARK}:place:${UUID(8)}`, 'Weeping Rock')]))).toBe(true);
    }
  });

  test('(10b) a resolved padding pair bound to ONE entity is still padding', () => {
    const b = bundle([nps(`${PARK}:place:${UUID(9)}`, 'Old Faithful')]);
    expect(isDuplicate(oneDay(['Old Faithful', 'Old Faithful Geyser viewing']), b)).toBe(true);
  });

  test('(11) same-day revisit semantics still apply on top of a SAME identity', () => {
    const b = bundle([nps(`${PARK}:place:${UUID(1)}`, "Pa'rus Trail")]);
    const revisit = oneDay([
      { name: "Pa'rus Trail", type: 'trail', timeWindow: 'morning' },
      { name: 'Zion Human History Museum', type: 'museum' },
      { name: "Pa'rus Trail", type: 'photography', timeWindow: 'late afternoon' },
    ]);
    expect(isDuplicate(revisit, b)).toBe(false);
    expect(isDuplicate(revisit, null)).toBe(false);
    // Same identity, same purpose → padding.
    expect(isDuplicate(oneDay(["Pa'rus Trail", "Pa'rus Trail"]), b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('(12) Phase 8D.2 touched-day refinement scope with identity', () => {
  const b = bundle(curated({ experiences: [FOOTBRIDGE, CASCADE] }));
  const days = (d1, d2, d3) => ({
    days: [d1, d2, d3].map((names, i) => ({ id: `d${i + 1}`, dayNumber: i + 1, label: `Day ${i + 1}`, stops: names.map((n, j) => stop(n, j)) })),
  });
  const refine = (plan, touchedDayNumbers, evidenceBundle = b) => evaluateItineraryCompleteness({
    itineraryData: plan, userPrompt: 'Swap the afternoon on day 2.', isRefinement: true,
    priorItineraryData: plan, touchedDayNumbers, evidenceBundle, relationshipAuthority: AUTHORITY,
  });

  test('touched↔untouched: authoritative-distinct identities no longer conflict; legacy names still do', () => {
    const plan = days(['Upper Cascade Footbridge', 'Weeping Rock'], ['Upper Cascade', 'Emerald Pools'], ['Angels Landing', 'Canyon Overlook']);
    expect(refine(plan, [2]).reasonCodes).not.toContain('duplicate_base_experience');
    const legacy = refine(plan, [2], null);
    expect(legacy.reasonCodes).toContain('duplicate_base_experience');
    const diag = legacy.dayDiagnostics.find((d) => d.dayNumber === 2);
    expect(diag.duplicateExperienceConflicts).toEqual([{
      dayNumbers: [1, 2], touchedDayNumbers: [2], conflictType: 'touched_vs_untouched', experienceIdentity: 'upper cascade',
    }]);
  });

  test('touched↔touched and touched↔untouched same-identity conflicts are still enforced', () => {
    const id = `${PARK}:place:${UUID(2)}`;
    const same = bundle([nps(id, 'Riverside Walk'), nps(`${PARK}:thingstodo:${UUID(2)}`, 'Hike the Gateway to the Narrows')]);
    const plan = days(['Riverside Walk', 'Weeping Rock'], ['Hike the Gateway to the Narrows', 'Emerald Pools'], ['Angels Landing', 'Canyon Overlook']);
    const untouched = refine(plan, [2], same);
    expect(untouched.dayDiagnostics.find((d) => d.dayNumber === 2).duplicateExperienceConflicts[0])
      .toMatchObject({ dayNumbers: [1, 2], touchedDayNumbers: [2], conflictType: 'touched_vs_untouched' });
    const both = refine(plan, [1, 2], same);
    expect(both.dayDiagnostics.find((d) => d.dayNumber === 1).duplicateExperienceConflicts[0])
      .toMatchObject({ dayNumbers: [1, 2], touchedDayNumbers: [1, 2], conflictType: 'touched_vs_touched' });
  });

  test('untouched↔untouched legacy duplicates stay ignored', () => {
    const plan = days(["Pa'rus Trail", 'Weeping Rock'], ['Emerald Pools', 'Canyon Overlook'], ["Pa'rus Trail riverside exhibits", 'Angels Landing']);
    expect(refine(plan, [2], null).reasonCodes).not.toContain('duplicate_base_experience');
  });
});

// ---------------------------------------------------------------------------
describe('(15) spoofed metadata cannot manufacture identity', () => {
  const b = bundle(curated({ experiences: [FOOTBRIDGE, CASCADE] }));
  const [footbridgeEv, cascadeEv] = ['Upper Cascade Footbridge', 'Upper Cascade']
    .map((name) => b.evidence.find((e) => e.claim.normalizedValue.name === name).evidenceId);

  test('a model-written evidenceRef cannot split one place into two identities', () => {
    const plan = oneDay([
      { name: 'Upper Cascade', evidenceRef: footbridgeEv, canonicalPlaceName: 'Upper Cascade Footbridge' },
      { name: 'Upper Cascade', evidenceRef: cascadeEv },
    ]);
    expect(isDuplicate(plan, b)).toBe(true);
  });

  test('an unresolvable name carrying a real evidenceRef stays on the legacy path', () => {
    const plan = oneDay([
      { name: 'Riverside Walk', evidenceRef: footbridgeEv },
      { name: 'Riverside Walk exhibits', evidenceRef: cascadeEv },
    ]);
    expect(isDuplicate(plan, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('renderer: pinned identities bypass fuzzy name-dedupe (E3 fix retained)', () => {
  const REQ = { requirementId: 'acts', topic: 'activities', entity: { entityId: PARK, entityType: 'national_park' }, reasonCodes: ['itinerary_activity_support'] };

  test('both prefix-related names render when pinned; unpinned dedupe is unchanged', () => {
    const b = bundle(curated({ experiences: [CASCADE, FOOTBRIDGE] }));
    const ids = Object.fromEntries(b.evidence.map((e) => [e.claim.normalizedValue.name, e.evidenceId]));
    const unpinned = renderEvidenceBundleForPrompt({ bundle: b, requirements: [REQ], userRequest: 'Plan a day', maxTokens: 4000 });
    // Ordinary behavior: one of the two canonical-name variants is deduped away.
    expect([ids['Upper Cascade'], ids['Upper Cascade Footbridge']].filter((id) => unpinned.includedEvidenceIds.includes(id))).toHaveLength(1);
    const pinned = renderEvidenceBundleForPrompt({
      bundle: b, requirements: [REQ], userRequest: 'Plan a day', maxTokens: 4000,
      pinnedEvidenceIds: [ids['Upper Cascade'], ids['Upper Cascade Footbridge']],
    });
    expect(pinned.includedEvidenceIds).toEqual(expect.arrayContaining([ids['Upper Cascade'], ids['Upper Cascade Footbridge']]));
    expect(pinned.text).toContain('Upper Cascade Footbridge');
  });
});
