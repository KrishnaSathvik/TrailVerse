'use strict';

/**
 * PHASE 4O — THE CANONICAL PLACE ADAPTER, AGAINST REAL PRODUCER OUTPUT.
 *
 * Every fixture here is a VERBATIM evidence item from the Phase 4N live Grand
 * Teton bundle. That is the point: Phase 4N's catalogue was green across 63
 * offline assertions and produced zero usable candidates live, because the
 * fixtures set `normalizedValue.placeType`, which no producer emits. A suite
 * that invents the field under test cannot fail for the reason production fails.
 */

const {
  EXPERIENCE_CLASS,
  classifyPlaceSignals,
  collectPlaceSignals,
  normalizeEvidencePlaceCandidates,
} = require('../evidencePlaceCandidate');

const FIXTURE = require('./fixtures/grandTetonPlaceEvidence.json');
const bundle = () => ({ evidence: FIXTURE.evidence });
const byName = (name) => normalizeEvidencePlaceCandidates(bundle()).find((c) => c.canonicalName === name);

describe('real NPS output: `category` is a source bucket, never a type', () => {
  it('never emits placeType or type — the field Phase 4N read', () => {
    const shapes = FIXTURE.evidence
      .map((item) => item?.claim?.normalizedValue)
      .filter((value) => value && typeof value === 'object' && value.name);
    expect(shapes.length).toBeGreaterThan(0);
    for (const value of shapes) {
      expect(value.placeType).toBeUndefined();
      expect(value.type).toBeUndefined();
      expect(typeof value.category).toBe('string');
    }
  });

  it('keeps the producer category as provenance without letting it become the type', () => {
    const taggart = byName('Taggart Lake');
    expect(taggart.sourceCategories).toContain('thingstodo');
    expect(taggart.canonicalType).toBe('hike');
  });
});

describe('positive classification from the signals the producer actually carries', () => {
  it.each([
    ['Taggart Lake', 'hike', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Christian Pond Loop', 'hike', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Snake River Overlook', 'viewpoint', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Blacktail Ponds Overlook', 'viewpoint', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Grassy Lake Road', 'scenic_drive', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Oxbow Bend', 'wildlife', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Chapel of the Transfiguration', 'walk', EXPERIENCE_CLASS.EXPERIENTIAL],
    ['Jenny Lake Visitor Center', 'visitor_center', EXPERIENCE_CLASS.LOGISTICS],
    ['Arizona Island Picnic Area', 'picnic', EXPERIENCE_CLASS.REST],
    ['Jenny Lake Lodge', 'lodging', EXPERIENCE_CLASS.REST],
  ])('%s -> %s (%s)', (name, canonicalType, experienceClass) => {
    const place = byName(name);
    expect(place).toBeDefined();
    expect(place.canonicalType).toBe(canonicalType);
    expect(place.experienceClass).toBe(experienceClass);
  });

  it.each([
    ["A Boat's Purpose"],
    ['Colter Bay Convenience Store'],
    ['Cascade Canyon Turnout'],
    ['Death Canyon Trailhead'],
    // Real data, and a fair warning about the bar: NPS files the cabins as the
    // bucket `place` with no activity type, so the machine cannot type them.
    ['Colter Bay Cabins'],
  ])('%s is UNKNOWN, not experiential — the machine knows nothing about it', (name) => {
    const place = byName(name);
    expect(place.experienceClass).toBe(EXPERIENCE_CLASS.UNKNOWN);
    expect(place.canonicalType).toBeNull();
  });

  it('every canonical experiential type is one `classifyStop` reads as an experience', () => {
    const { classifyStop } = require('../itineraryCompleteness');
    for (const place of normalizeEvidencePlaceCandidates(bundle())) {
      if (place.experienceClass !== EXPERIENCE_CLASS.EXPERIENTIAL) continue;
      // Name and narrative withheld on purpose: the TYPE alone must carry it,
      // because the type is the only thing the server supplies at merge time.
      expect(classifyStop({ name: 'x', type: place.canonicalType, duration: 60 })).toBe('experiential');
    }
  });
});

describe('one identity described by several records', () => {
  it('is one candidate, and the typed record is not lost to the untyped one', () => {
    const chapels = FIXTURE.evidence.filter((e) => e?.claim?.normalizedValue?.name === 'Chapel of the Transfiguration');
    expect(chapels.length).toBe(2);
    expect(chapels.some((e) => (e.claim.normalizedValue.activityTypes || []).length === 0)).toBe(true);

    const merged = normalizeEvidencePlaceCandidates(bundle())
      .filter((c) => c.canonicalName === 'Chapel of the Transfiguration');
    expect(merged.length).toBe(1);
    expect(merged[0].recordCount).toBe(2);
    expect(merged[0].canonicalType).toBe('walk');
  });

  it('classifies identically whichever record comes first — the old first-wins bug', () => {
    const chapels = FIXTURE.evidence.filter((e) => e?.claim?.normalizedValue?.name === 'Chapel of the Transfiguration');
    const forwards = classifyPlaceSignals([...collectPlaceSignals(chapels).values()][0]);
    const backwards = classifyPlaceSignals([...collectPlaceSignals([...chapels].reverse()).values()][0]);
    expect(backwards).toEqual(forwards);
  });
});

describe('logistics and rest signals VETO an experiential sibling', () => {
  it('a visitor centre tagged `exhibits` is still logistics', () => {
    const jenny = FIXTURE.evidence.find((e) => e?.claim?.normalizedValue?.name === 'Jenny Lake Visitor Center');
    expect(jenny.claim.normalizedValue.activityTypes).toEqual(expect.arrayContaining(['exhibits']));
    expect(byName('Jenny Lake Visitor Center').experienceClass).toBe(EXPERIENCE_CLASS.LOGISTICS);
  });
});

describe('operational facts are carried, never consumed as eligibility', () => {
  it('keeps a conditional dependency on the candidate', () => {
    expect(byName('Bearpaw and Trapper Lakes').operationalFactTypes).toContain('reservation_required');
    expect(byName('Grassy Lake Road').operationalFactTypes).toContain('vehicle_restriction');
  });

  it('leaves a restricted place fully classified — a dependency is not a disqualification', () => {
    expect(byName('Grassy Lake Road').experienceClass).toBe(EXPERIENCE_CLASS.EXPERIENTIAL);
    expect(byName('Bearpaw and Trapper Lakes').experienceClass).toBe(EXPERIENCE_CLASS.EXPERIENTIAL);
  });
});

describe('order independence', () => {
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

  const digest = (value) => require('crypto').createHash('sha256')
    .update(JSON.stringify(value), 'utf8').digest('hex');

  it('produces byte-identical candidates for 100 shuffles of the same evidence', () => {
    const baseline = digest(normalizeEvidencePlaceCandidates(bundle()));
    const digests = new Set([baseline]);
    for (let seed = 1; seed <= 100; seed += 1) {
      digests.add(digest(normalizeEvidencePlaceCandidates({ evidence: shuffle(FIXTURE.evidence, seed) })));
    }
    expect([...digests]).toEqual([baseline]);
  });
});
