'use strict';

/**
 * Phase 9C.1D.5C-B — authoritative experience-relationship contract.
 *
 * Synthetic ids only. The shapes deliberately mirror the Mist Trail case —
 * a trail, the trailhead that serves it (and another trail), and a waterfall
 * on it — so later seed work cannot turn a trailhead or a waterfall into an
 * alias for a trail.
 */

const {
  RELATIONSHIP_TYPES,
  SATISFYING_RELATIONSHIPS,
  candidateHash,
  validateRelationshipCandidate,
  promoteToAuthoritative,
  buildRelationshipIndex,
  toRelationshipEvidence,
  fromRelationshipEvidence,
} = require('../experienceRelationships');
const { buildEvidenceKeys } = require('../evidenceKey');
const { assertPublicEvidenceWrite } = require('../evidencePrivacy');

const PARK = 'nps:park:synth';
const TRAIL = `${PARK}:experience:ridge-trail`;
const TRAIL_ALT = `${PARK}:experience:ridge-trail-official-listing`;
const TRAILHEAD = `${PARK}:place:ridge-and-canyon-trailhead`;
const OTHER_TRAIL = `${PARK}:experience:canyon-trail`;
const WATERFALL = `${PARK}:place:upper-cascade`;
const UNRELATED_HIKE = `${PARK}:experience:meadow-loop`;

const NOW = new Date('2026-09-15T12:00:00.000Z');
const REVIEWERS = ['maintainer:primary'];

function candidate(subjectEntityId, relationship, objectEntityId, over = {}) {
  return {
    subjectEntityId,
    relationship,
    objectEntityId,
    contextEntityId: PARK,
    source: {
      url: 'https://www.nps.gov/synth/planyourvisit/ridge-trail.htm',
      title: 'Ridge Trail - Synthetic National Park',
      publisher: 'National Park Service',
      excerpt: 'The Ridge Trail begins at the Ridge and Canyon Trailhead.',
    },
    sourceCheck: {
      checkedAt: '2026-09-10T00:00:00.000Z',
      httpStatus: 200,
      finalUrl: 'https://www.nps.gov/synth/planyourvisit/ridge-trail.htm',
      excerptFound: true,
    },
    proposedBy: { kind: 'agent', id: 'agent:curation-assistant' },
    ...over,
  };
}

function review(c, over = {}) {
  return {
    candidateHash: candidateHash(c),
    decision: 'approved',
    reviewMethod: 'human',
    reviewerId: 'maintainer:primary',
    reviewedAt: '2026-09-12T00:00:00.000Z',
    reviewAfter: '2027-09-12T00:00:00.000Z',
    ...over,
  };
}

const promote = (c, r) => promoteToAuthoritative({ candidate: c, review: r, trustedReviewerIds: REVIEWERS, now: NOW });
const index = (entries) => buildRelationshipIndex({ entries, trustedReviewerIds: REVIEWERS, now: NOW });
const approved = (c) => ({ candidate: c, review: review(c) });

describe('vocabulary', () => {
  test('exactly three relationship types; only same_as satisfies', () => {
    expect(Object.values(RELATIONSHIP_TYPES).sort()).toEqual(['access_point_for', 'part_of', 'same_as']);
    expect([...SATISFYING_RELATIONSHIPS]).toEqual(['same_as']);
  });
});

describe('mechanical candidate validation', () => {
  test('a well-formed official candidate passes mechanics', () => {
    expect(validateRelationshipCandidate(candidate(TRAILHEAD, 'access_point_for', TRAIL))).toEqual({ ok: true, reasons: [] });
  });

  test.each([
    ['self relationship', candidate(TRAIL, 'same_as', TRAIL), 'self_relationship'],
    ['self relationship, case-insensitive', candidate(TRAIL, 'same_as', TRAIL.toUpperCase()), 'self_relationship'],
    ['unsupported type', candidate(TRAIL, 'near', TRAILHEAD), 'unsupported_relationship'],
    ['missing subject', candidate('', 'same_as', TRAIL), 'invalid_subject_entity_id'],
    ['version-specific evidence id', candidate('ev:abc123', 'same_as', TRAIL), 'invalid_subject_entity_id'],
    ['object outside park context', candidate(TRAIL, 'same_as', 'nps:park:other:experience:x'), 'object_outside_context'],
    ['http source', candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { ...candidate(0, 0, 0).source, url: 'http://www.nps.gov/synth/x.htm' } }), 'source_not_https'],
    ['non-official host', candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { ...candidate(0, 0, 0).source, url: 'https://www.alltrails.com/trail/ridge' } }), 'source_host_not_allowlisted'],
    ['lookalike host', candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { ...candidate(0, 0, 0).source, url: 'https://nps.gov.example.com/x' } }), 'source_host_not_allowlisted'],
    ['missing title', candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { ...candidate(0, 0, 0).source, title: '' } }), 'missing_source_title'],
    ['missing excerpt', candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { ...candidate(0, 0, 0).source, excerpt: ' ' } }), 'invalid_source_excerpt'],
    ['excerpt not found on source', candidate(TRAIL_ALT, 'same_as', TRAIL, { sourceCheck: { ...candidate(0, 0, 0).sourceCheck, excerptFound: false } }), 'excerpt_not_verified_on_source'],
    ['unreachable source', candidate(TRAIL_ALT, 'same_as', TRAIL, { sourceCheck: { ...candidate(0, 0, 0).sourceCheck, httpStatus: 404 } }), 'source_not_reachable'],
    ['redirected off allowlist', candidate(TRAIL_ALT, 'same_as', TRAIL, { sourceCheck: { ...candidate(0, 0, 0).sourceCheck, finalUrl: 'https://example.com/x' } }), 'source_final_url_not_allowlisted'],
  ])('%s is rejected', (_label, c, reason) => {
    const out = validateRelationshipCandidate(c);
    expect(out.ok).toBe(false);
    expect(out.reasons).toContain(reason);
  });

  test('the content hash is stable under key order and changes when the claim changes', () => {
    const a = candidate(TRAILHEAD, 'access_point_for', TRAIL);
    const reordered = JSON.parse(JSON.stringify({ objectEntityId: a.objectEntityId, ...a }));
    expect(candidateHash(reordered)).toBe(candidateHash(a));
    expect(candidateHash({ ...a, relationship: 'same_as' })).not.toBe(candidateHash(a));
    expect(candidateHash({ ...a, source: { ...a.source, excerpt: 'A different sentence entirely here.' } })).not.toBe(candidateHash(a));
  });
});

describe('human approval gate', () => {
  test('an approved, well-formed candidate becomes authoritative', () => {
    const c = candidate(TRAIL_ALT, 'same_as', TRAIL);
    const out = promote(c, review(c));
    expect(out.ok).toBe(true);
    expect(out.relationship).toMatchObject({
      subjectEntityId: TRAIL_ALT, relationship: 'same_as', objectEntityId: TRAIL,
      verification: { reviewMethod: 'human', reviewerId: 'maintainer:primary' },
    });
    expect(Object.isFrozen(out.relationship)).toBe(true);
  });

  test('an official URL without any review stays non-authoritative', () => {
    const out = promote(candidate(TRAIL_ALT, 'same_as', TRAIL), null);
    expect(out.ok).toBe(false);
    expect(out.reasons).toContain('missing_human_review');
  });

  test.each([
    ['rejected decision', (c) => review(c, { decision: 'rejected' }), 'review_not_approved'],
    ['pending decision', (c) => review(c, { decision: 'pending_review' }), 'review_not_approved'],
    ['non-human method', (c) => review(c, { reviewMethod: 'model' }), 'review_not_human'],
    ['reviewer not trusted by the server', (c) => review(c, { reviewerId: 'agent:curation-assistant' }), 'reviewer_not_trusted'],
    ['approval bound to a different candidate', (c) => review(c, { candidateHash: 'sha256:0000' }), 'review_hash_mismatch'],
    ['reviewed before the source was checked', (c) => review(c, { reviewedAt: '2026-09-01T00:00:00.000Z' }), 'review_predates_source_check'],
    ['review in the future', (c) => review(c, { reviewedAt: '2026-10-01T00:00:00.000Z' }), 'review_in_future'],
    ['review expired', (c) => review(c, { reviewedAt: '2025-01-01T00:00:00.000Z', reviewAfter: '2026-01-01T00:00:00.000Z' }), 'review_expired'],
    ['review window too long', (c) => review(c, { reviewAfter: '2030-01-01T00:00:00.000Z' }), 'review_window_too_long'],
    ['email as reviewer identity', (c) => review(c, { reviewerId: 'someone@example.com' }), 'reviewer_not_trusted'],
  ])('%s → not authoritative', (_label, makeReview, reason) => {
    const c = candidate(TRAIL_ALT, 'same_as', TRAIL, { sourceCheck: { ...candidate(0, 0, 0).sourceCheck, checkedAt: '2026-09-10T00:00:00.000Z' } });
    const out = promote(c, makeReview(c));
    expect(out.ok).toBe(false);
    expect(out.reasons).toContain(reason);
  });

  test('a payload claiming human verification is ignored — only a trusted review record counts', () => {
    const c = candidate(TRAIL_ALT, 'same_as', TRAIL, { verifiedBy: 'human', humanVerified: true, status: 'authoritative' });
    expect(promote(c, null).ok).toBe(false);
  });

  test('no trusted reviewers configured → nothing is authoritative', () => {
    const c = candidate(TRAIL_ALT, 'same_as', TRAIL);
    expect(promoteToAuthoritative({ candidate: c, review: review(c), trustedReviewerIds: [], now: NOW }).ok).toBe(false);
  });

  test('a human-approved candidate missing required provenance is still rejected', () => {
    const c = candidate(TRAIL_ALT, 'same_as', TRAIL, { source: { url: 'https://www.nps.gov/synth/x.htm', title: 'T', publisher: 'National Park Service' } });
    const out = promote(c, review(c));
    expect(out.ok).toBe(false);
    expect(out.reasons).toContain('invalid_source_excerpt');
  });
});

describe('relationship index — satisfaction matrix', () => {
  const entries = [
    approved(candidate(TRAIL_ALT, 'same_as', TRAIL)),
    approved(candidate(TRAILHEAD, 'access_point_for', TRAIL)),
    approved(candidate(TRAILHEAD, 'access_point_for', OTHER_TRAIL)),
    approved(candidate(WATERFALL, 'part_of', TRAIL)),
  ];
  const idx = () => index(entries).index;

  test('6B: authoritative identity/access/containment relationships never manufacture activity groups', () => {
    const relationships = idx();
    const day = { stops: [TRAIL_ALT, TRAILHEAD, WATERFALL, TRAIL].map((id) => ({ id, name: id })), relationships };
    const { normalizeDayActivityGroups } = require('../activityGroupValidation');
    expect(normalizeDayActivityGroups(day)).toEqual([]);
    expect(day.activityGroups).toBeUndefined();
  });

  test('exact identity satisfies', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: TRAIL })).toBe(true);
  });

  test('direct authoritative same_as satisfies, in both directions', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: TRAIL_ALT })).toBe(true);
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL_ALT, candidateEntityId: TRAIL })).toBe(true);
  });

  test('access_point_for never satisfies its target (the trailhead is not the trail)', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: TRAILHEAD })).toBe(false);
  });

  test('a trailhead serving two trails does not make those trails equivalent', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: OTHER_TRAIL })).toBe(false);
    expect(idx().equivalentIdentities(TRAIL)).not.toContain(OTHER_TRAIL);
  });

  test('part_of never satisfies its parent (the waterfall is not the trail)', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: WATERFALL })).toBe(false);
  });

  test('the parent does not satisfy an explicit request for the child, and the child satisfies itself', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: WATERFALL, candidateEntityId: TRAIL })).toBe(false);
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: WATERFALL, candidateEntityId: WATERFALL })).toBe(true);
  });

  test('context relationships are exposed as context, never as equivalence', () => {
    expect(idx().contextFor(TRAIL)).toEqual({ accessPoints: [TRAILHEAD], parts: [WATERFALL], partOf: [], accessPointFor: [] });
    expect(idx().equivalentIdentities(TRAIL)).toEqual([TRAIL, TRAIL_ALT].sort());
  });

  test('no relationship lets an unrelated same-category experience or an unresolved stop satisfy', () => {
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: UNRELATED_HIKE })).toBe(false);
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: null })).toBe(false);
    expect(idx().satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: '' })).toBe(false);
  });

  test('pending (unreviewed) same_as does not satisfy and is reported as pending', () => {
    const out = index([{ candidate: candidate(UNRELATED_HIKE, 'same_as', TRAIL), review: null }]);
    expect(out.index.satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: UNRELATED_HIKE })).toBe(false);
    expect(out.pending).toHaveLength(1);
  });
});

describe('equivalence traversal is direct only (V1)', () => {
  test('A same_as B and B same_as C does NOT make A equivalent to C', () => {
    const A = `${PARK}:experience:a`; const B = `${PARK}:experience:b`; const C = `${PARK}:experience:c`;
    const idx = index([approved(candidate(A, 'same_as', B)), approved(candidate(B, 'same_as', C))]).index;
    expect(idx.satisfiesNamedRequirement({ requiredEntityId: A, candidateEntityId: C })).toBe(false);
    expect(idx.equivalentIdentities(B)).toEqual([A, B, C].sort());
  });

  test('a same_as cycle terminates and stays direct', () => {
    const A = `${PARK}:experience:a`; const B = `${PARK}:experience:b`; const C = `${PARK}:experience:c`;
    const idx = index([
      approved(candidate(A, 'same_as', B)), approved(candidate(B, 'same_as', C)), approved(candidate(C, 'same_as', A)),
    ]).index;
    expect(idx.equivalentIdentities(A)).toEqual([A, B, C].sort());
  });
});

describe('normalization, duplicates and conflicts', () => {
  test('duplicate records for the same relationship normalize to one deterministic record, regardless of input order', () => {
    const first = candidate(TRAILHEAD, 'access_point_for', TRAIL);
    const second = candidate(TRAILHEAD, 'access_point_for', TRAIL, {
      source: { ...first.source, url: 'https://www.nps.gov/synth/planyourvisit/trailheads.htm' },
      sourceCheck: { ...first.sourceCheck, finalUrl: 'https://www.nps.gov/synth/planyourvisit/trailheads.htm' },
    });
    const a = index([approved(first), approved(second)]);
    const b = index([approved(second), approved(first)]);
    expect(a.index.relationships()).toHaveLength(1);
    expect(a.index.relationships()).toEqual(b.index.relationships());
  });

  test('same_as recorded in both directions is one relationship', () => {
    const out = index([approved(candidate(TRAIL_ALT, 'same_as', TRAIL)), approved(candidate(TRAIL, 'same_as', TRAIL_ALT))]);
    expect(out.index.relationships().filter((r) => r.relationship === 'same_as')).toHaveLength(1);
  });

  test('conflicting authoritative types for one pair fail closed: neither is used, the conflict is reported', () => {
    const out = index([approved(candidate(TRAILHEAD, 'same_as', TRAIL)), approved(candidate(TRAILHEAD, 'access_point_for', TRAIL))]);
    expect(out.index.satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: TRAILHEAD })).toBe(false);
    expect(out.index.contextFor(TRAIL).accessPoints).toEqual([]);
    expect(out.conflicts).toHaveLength(1);
  });

  test('a pending proposal never overwrites an authoritative fact for the same pair', () => {
    const out = index([
      approved(candidate(TRAILHEAD, 'access_point_for', TRAIL)),
      { candidate: candidate(TRAILHEAD, 'same_as', TRAIL), review: null },
    ]);
    expect(out.index.contextFor(TRAIL).accessPoints).toEqual([TRAILHEAD]);
    expect(out.index.satisfiesNamedRequirement({ requiredEntityId: TRAIL, candidateEntityId: TRAILHEAD })).toBe(false);
    expect(out.conflicts).toEqual([]);
    expect(out.pending).toHaveLength(1);
  });

  test('invalid entries are reported as rejected with reasons, never indexed', () => {
    const out = index([approved(candidate(TRAIL, 'same_as', TRAIL))]);
    expect(out.index.relationships()).toEqual([]);
    expect(out.rejected[0].reasons).toContain('self_relationship');
  });
});

describe('evidence-store representation', () => {
  const authoritative = () => promote(candidate(TRAILHEAD, 'access_point_for', TRAIL), review(candidate(TRAILHEAD, 'access_point_for', TRAIL))).relationship;

  test('maps onto the existing relationship evidence model keyed by stable entity ids', () => {
    const item = toRelationshipEvidence(authoritative(), { observedAt: NOW });
    expect(item).toMatchObject({
      entityId: PARK,
      topic: 'activities',
      evidenceType: 'relationship',
      privacyScope: 'public',
      claim: { subjectId: TRAILHEAD, objectId: TRAIL, normalizedValue: { relationship: 'access_point_for' } },
      source: { provider: 'curated_relationship', sourceClass: 'official_owner' },
    });
    const keys = buildEvidenceKeys(item);
    expect(keys.evidenceId).toMatch(/^ev:/);
    expect(buildEvidenceKeys(toRelationshipEvidence(authoritative(), { observedAt: NOW })).evidenceId).toBe(keys.evidenceId);
    expect(() => assertPublicEvidenceWrite({ item, sourceRequest: { privacyScope: 'public' } })).not.toThrow();
  });

  test('stored relationship evidence round-trips only through re-validation', () => {
    const item = toRelationshipEvidence(authoritative(), { observedAt: NOW });
    const back = fromRelationshipEvidence(item, { trustedReviewerIds: REVIEWERS, now: NOW });
    expect(back).toMatchObject({ subjectEntityId: TRAILHEAD, relationship: 'access_point_for', objectEntityId: TRAIL });
  });

  test('tampered stored evidence is not authoritative (type flipped to same_as after approval)', () => {
    const item = JSON.parse(JSON.stringify(toRelationshipEvidence(authoritative(), { observedAt: NOW })));
    item.claim.normalizedValue.relationship = 'same_as';
    expect(fromRelationshipEvidence(item, { trustedReviewerIds: REVIEWERS, now: NOW })).toBeNull();
  });

  test('stored evidence whose reviewer is no longer trusted is not authoritative', () => {
    const item = toRelationshipEvidence(authoritative(), { observedAt: NOW });
    expect(fromRelationshipEvidence(item, { trustedReviewerIds: ['maintainer:someone-else'], now: NOW })).toBeNull();
  });
});
