'use strict';

/**
 * THE RECOMMENDATION BOUNDARY, ON REAL EVIDENCE.
 *
 * Phase 4M proved a repair cannot introduce an identity the frozen bundle never
 * enumerated. Phase 4L §5 is why: an unenumerated stop that also declares
 * nothing binds to no fact and therefore reads `compatible` — no evidence read
 * as safe.
 *
 * Phase 4N then proved that the boundary alone is not a catalogue. Every fixture
 * in this file is VERBATIM output of the real NPS producer, captured from the
 * live Grand Teton bundle the 4N dispatch ran against, because the previous
 * version of this suite invented `normalizedValue.placeType` — a field no
 * producer emits — and so was green while production could not merge a single
 * operation.
 */

const { buildEvidenceBoundRepairCandidates, resolveCandidateRef, stableRank } = require('../evidenceBoundRepairCandidates');

const FIXTURE = require('./fixtures/grandTetonPlaceEvidence.json');
const bundle = (extra = []) => ({ evidence: [...FIXTURE.evidence, ...extra] });
const emptyPlan = () => ({ days: [{ dayNumber: 1, stops: [] }] });
const build = (over = {}) => buildEvidenceBoundRepairCandidates({
  bundle: bundle(), candidatePlan: emptyPlan(), repairScope: null, ...over,
});
const names = (result) => result.candidates.map((c) => c.canonicalName);

describe('positive eligibility: the machine must KNOW a candidate is an experience', () => {
  it('offers the places it can positively classify', () => {
    expect(names(build())).toEqual(expect.arrayContaining([
      'Taggart Lake', 'Jenny Lake Loop', 'Christian Pond Loop',
      'Snake River Overlook', 'Blacktail Ponds Overlook',
      'Grassy Lake Road', 'Moose-Wilson Road', 'Oxbow Bend',
      'Chapel of the Transfiguration',
    ]));
  });

  it.each([
    ["A Boat's Purpose", 'an audio-tour narration title'],
    ['Colter Bay Convenience Store', 'a shop'],
    ['Colter Bay Cabins', 'accommodation'],
    ['Cascade Canyon Turnout', 'an untyped roadside place'],
  ])('does not offer %s (%s) — Phase 4N did', (name) => {
    expect(names(build())).not.toContain(name);
  });

  it.each([
    ['Arizona Island Picnic Area', 'rest'],
    ['Jenny Lake Lodge', 'rest'],
  ])('does not offer %s — it is %s, which is exactly what the failing day already has', (name) => {
    expect(names(build())).not.toContain(name);
  });

  it('counts why each identity was dropped', () => {
    const { audit } = build();
    expect(audit.placeIdentities).toBeGreaterThan(0);
    expect(audit.excludedUnknownClass).toBeGreaterThan(0);
    expect(audit.excludedNotExperiential).toBeGreaterThan(0);
    expect(audit.byExperienceClass.unknown).toBeGreaterThan(0);
  });

  it('offers everything it can classify when the caller does not demand an experience', () => {
    const permissive = build({ requireExperiential: false });
    expect(names(permissive)).toContain('Jenny Lake Visitor Center');
    // Still never an identity with no canonical type: the server has to be able
    // to supply one, and there is nothing to supply.
    expect(names(permissive)).not.toContain('Colter Bay Convenience Store');
  });
});

describe('the server owns the type, so every candidate carries one', () => {
  it('states a canonical type for every ref', () => {
    for (const candidate of build().candidates) {
      expect(typeof candidate.canonicalType).toBe('string');
      expect(candidate.canonicalType.length).toBeGreaterThan(0);
      expect(candidate.experienceClass).toBe('experiential');
    }
  });

  it('keeps the producer category as provenance only', () => {
    const taggart = build().candidates.find((c) => c.canonicalName === 'Taggart Lake');
    expect(taggart.sourceCategories).toContain('thingstodo');
    expect(taggart.canonicalType).toBe('hike');
  });
});

describe('conditional dependency vs hard unavailability', () => {
  it('KEEPS a place that needs a permit or a particular vehicle', () => {
    const offered = names(build());
    expect(offered).toContain('Bearpaw and Trapper Lakes');
    expect(offered).toContain('Grassy Lake Road');
    const restricted = build().candidates.find((c) => c.canonicalName === 'Grassy Lake Road');
    expect(restricted.operationalFactTypes).toContain('vehicle_restriction');
  });

  it('REMOVES a place an official Park Closure says is closed, before any spend', () => {
    const closure = {
      topic: 'alerts_closures',
      claim: {
        text: 'Taggart Lake Trail Closure: Taggart Lake is closed to all use while crews replace the bridge.',
        normalizedValue: { title: 'Taggart Lake Trail Closure', category: 'Park Closure' },
      },
    };
    const result = buildEvidenceBoundRepairCandidates({
      bundle: bundle([closure]), candidatePlan: emptyPlan(),
    });
    expect(names(result)).not.toContain('Taggart Lake');
    // Two: the injected one, and `Death Canyon Trailhead` — the real closure
    // Phase 4N shipped past. Availability is judged before class, so a closed
    // place is reported as closed whether or not it was classifiable.
    expect(result.audit.excludedHardUnavailable).toBe(2);
    expect(result.audit.hardUnavailable.map((h) => h.placeKey).sort())
      .toEqual(['death canyon trailhead', 'taggart lake']);
    // and nothing else moved
    expect(names(result)).toContain('Jenny Lake Loop');
  });
});

describe('identities already in the plan', () => {
  it('are never offered back', () => {
    const plan = { days: [{ dayNumber: 1, stops: [{ name: 'Taggart Lake', type: 'hike', duration: 90 }] }] };
    const result = buildEvidenceBoundRepairCandidates({ bundle: bundle(), candidatePlan: plan });
    expect(names(result)).not.toContain('Taggart Lake');
    expect(result.audit.excludedAlreadyInPlan).toBe(1);
  });
});

describe('an unusable catalogue declines rather than improvising', () => {
  it('declines on an empty bundle', () => {
    const result = buildEvidenceBoundRepairCandidates({ bundle: { evidence: [] }, candidatePlan: emptyPlan() });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(['repair_evidence_catalog_unavailable']);
  });

  it('declines when every identity is unclassifiable — the 4N shape', () => {
    const untyped = FIXTURE.evidence.filter((item) => {
      const value = item?.claim?.normalizedValue;
      return value?.name && (value.activityTypes || []).length === 0 && value.category === 'place';
    });
    expect(untyped.length).toBeGreaterThan(0);
    const result = buildEvidenceBoundRepairCandidates({
      bundle: { evidence: untyped }, candidatePlan: emptyPlan(),
    });
    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
    expect(result.reasonCodes).toEqual(['repair_evidence_catalog_unavailable']);
  });
});

describe('selection is invariant to the order the bundle arrived in', () => {
  const shuffle = (list, seed) => {
    const copy = [...list];
    let state = seed;
    for (let i = copy.length - 1; i > 0; i -= 1) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const j = state % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  it('gives one fingerprint across 100 shuffles', () => {
    const baseline = build().fingerprint;
    const seen = new Set([baseline]);
    for (let seed = 1; seed <= 100; seed += 1) {
      seen.add(buildEvidenceBoundRepairCandidates({
        bundle: { evidence: shuffle(FIXTURE.evidence, seed) }, candidatePlan: emptyPlan(),
      }).fingerprint);
    }
    expect([...seen]).toEqual([baseline]);
  });

  it('gives the same ref for the same identity across 100 shuffles', () => {
    const baseline = new Map(build().candidates.map((c) => [c.placeKey, c.ref]));
    for (let seed = 1; seed <= 100; seed += 1) {
      const shuffled = buildEvidenceBoundRepairCandidates({
        bundle: { evidence: shuffle(FIXTURE.evidence, seed) }, candidatePlan: emptyPlan(),
      });
      expect(new Map(shuffled.candidates.map((c) => [c.placeKey, c.ref]))).toEqual(baseline);
    }
  });
});

describe('the cap truncates depth, not kinds — Phase 4N kept only A through F', () => {
  it('is not an alphabetical prefix', () => {
    const capped = build({ limit: 4 });
    const alphabetical = [...names(build())].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)).slice(0, 4);
    expect(names(capped)).not.toEqual(alphabetical);
  });

  it('keeps every canonical type represented under a tight cap', () => {
    const all = build();
    const allTypes = new Set(all.candidates.map((c) => c.canonicalType));
    const capped = build({ limit: allTypes.size });
    expect(new Set(capped.candidates.map((c) => c.canonicalType))).toEqual(allTypes);
  });

  it('never exceeds the cap and always numbers refs from 1', () => {
    const capped = build({ limit: 3 });
    expect(capped.count).toBe(3);
    expect(capped.candidates.map((c) => c.ref)).toEqual([1, 2, 3]);
  });

  it('ranks by an identity hash, so lexical position carries no authority', () => {
    expect(stableRank('taggart lake')).toBe(stableRank('taggart lake'));
    expect(stableRank('taggart lake')).not.toBe(stableRank('jenny lake loop'));
  });
});

describe('ref resolution', () => {
  it('round-trips every ref to its machine-owned identity', () => {
    const { candidates } = build();
    for (const candidate of candidates) {
      expect(resolveCandidateRef(candidates, candidate.ref)).toBe(candidate);
    }
  });

  it('refuses a ref outside the set, and anything that is not an integer', () => {
    const { candidates, count } = build();
    expect(resolveCandidateRef(candidates, count + 1)).toBeNull();
    expect(resolveCandidateRef(candidates, 0)).toBeNull();
    expect(resolveCandidateRef(candidates, '1')).toBeNull();
    expect(resolveCandidateRef(null, 1)).toBeNull();
  });
});

test('generic facility exhibits alone do not establish a primary repair candidate', () => {
  const place = build().candidates.find(p => p.canonicalName === 'Jenny Lake Visitor Center');
  expect(place).toBeUndefined();
});
