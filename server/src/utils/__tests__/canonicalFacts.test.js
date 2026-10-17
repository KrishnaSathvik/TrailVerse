const {
  AUTHORITY,
  STATUS,
  CACHE_STATUS,
  makeFactId,
  buildParkCanonicalFacts,
  buildFactBundle,
  factSupportsRequirementClaim,
  factSupportsAbsenceClaim,
} = require('../canonicalFacts');
const {
  isClosureCategory,
  isCautionCategory,
  isInformationCategory,
} = require('../../utils/npsAlertUtils');

const categoryFns = { isClosureCategory, isCautionCategory, isInformationCategory };
const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

function buildFor(parkCode, parkName, overrides = {}) {
  return buildParkCanonicalFacts({
    parkCode,
    parkName,
    park: { entranceFees: [] },
    parkAlerts: [],
    parkPermits: [],
    parkCampgrounds: [],
    parkVisitorCenters: [],
    retrievedAt: RETRIEVED_AT,
    cacheStatus: CACHE_STATUS.UNKNOWN,
    ...categoryFns,
    ...overrides,
  });
}

describe('canonical fact identity', () => {
  test('same-titled closures in two parks get unique ids', () => {
    const alert = { id: 'closure-0', title: 'Road closed', category: 'Park Closure' };

    const glac = buildFor('glac', 'Glacier National Park', { parkAlerts: [alert] });
    const olym = buildFor('olym', 'Olympic National Park', { parkAlerts: [alert] });

    const glacClosure = glac.find((f) => f.category === 'closure');
    const olymClosure = olym.find((f) => f.category === 'closure');

    expect(glacClosure.id).not.toBe(olymClosure.id);
    expect(glacClosure.id).toBe('nps:glac:closure:closure-0');
    expect(olymClosure.id).toBe('nps:olym:closure:closure-0');
  });

  test('falls back to a deterministic content hash when the source has no id', () => {
    const a = makeFactId({ source: 'nps', parkCode: 'glac', category: 'closure', text: 'Road closed' });
    const b = makeFactId({ source: 'nps', parkCode: 'glac', category: 'closure', text: 'Road closed' });
    const c = makeFactId({ source: 'nps', parkCode: 'glac', category: 'closure', text: 'Trail closed' });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('colons in a source id cannot forge the id structure', () => {
    const id = makeFactId({
      source: 'nps',
      parkCode: 'glac',
      category: 'closure',
      sourceId: 'evil:id:injection',
    });
    expect(id.split(':')).toHaveLength(4);
  });

  test('bundle dedupes by id and survives a JSON round trip', () => {
    const alert = { id: 'closure-0', title: 'Road closed', category: 'Park Closure' };
    const bundle = buildFactBundle([
      buildFor('glac', 'Glacier National Park', { parkAlerts: [alert] }),
      buildFor('glac', 'Glacier National Park', { parkAlerts: [alert] }),
      buildFor('olym', 'Olympic National Park', { parkAlerts: [alert] }),
    ], { retrievedAt: RETRIEVED_AT });

    const closures = bundle.facts.filter((f) => f.status === STATUS.ACTIVE_CLOSURE);
    expect(closures).toHaveLength(2);
    expect(bundle.parkCodes.sort()).toEqual(['glac', 'olym']);

    const revived = JSON.parse(JSON.stringify(bundle));
    expect(revived.byId[closures[0].id].text).toBe('Road closed');
    expect(Object.keys(revived.byId)).toHaveLength(bundle.facts.length);
  });
});

describe('permit status semantics', () => {
  test('a Recreation.gov listing cannot support "permit required"', () => {
    const facts = buildFor('glac', 'Glacier National Park', {
      parkPermits: [
        { id: 'F123', name: 'Timed Entry Reservation', type: 'Timed Entry', reservationUrl: 'https://recreation.gov/x' },
      ],
    });

    const permit = facts.find((f) => f.category === 'permit');
    expect(permit.authority).toBe(AUTHORITY.LISTING_ONLY);
    expect(permit.status).toBe(STATUS.LISTING_ONLY);
    expect(factSupportsRequirementClaim(permit)).toBe(false);
    expect(permit.text).toMatch(/does not confirm/i);
    expect(permit.url).toBe('https://recreation.gov/x');
  });

  test('an empty permit result cannot support "no permit required"', () => {
    const facts = buildFor('glac', 'Glacier National Park', { parkPermits: [] });

    const permit = facts.find((f) => f.category === 'permit');
    expect(permit.status).toBe(STATUS.LISTING_NOT_FOUND);
    expect(factSupportsAbsenceClaim(permit)).toBe(false);
    expect(factSupportsRequirementClaim(permit)).toBe(false);
    expect(permit.text).toMatch(/does NOT confirm that no permit is required/i);
  });

  test('an empty alert feed cannot support "nothing is closed"', () => {
    const facts = buildFor('glac', 'Glacier National Park', { parkAlerts: [] });

    const closure = facts.find((f) => f.category === 'closure');
    expect(closure.status).toBe(STATUS.LISTING_NOT_FOUND);
    expect(factSupportsAbsenceClaim(closure)).toBe(false);
    expect(factSupportsRequirementClaim(closure)).toBe(false);
  });

  test('an active NPS closure does support a closure claim', () => {
    const facts = buildFor('glac', 'Glacier National Park', {
      parkAlerts: [{ id: 'a1', title: 'Going-to-the-Sun Road closed', category: 'Park Closure' }],
    });

    const closure = facts.find((f) => f.status === STATUS.ACTIVE_CLOSURE);
    expect(closure.authority).toBe(AUTHORITY.AUTHORITATIVE);
    expect(factSupportsRequirementClaim(closure)).toBe(true);
  });
});

describe('freshness is reported honestly', () => {
  test('retrieval time is never presented as a source update time', () => {
    const facts = buildFor('glac', 'Glacier National Park', {
      parkAlerts: [{ id: 'a1', title: 'Road closed', category: 'Park Closure' }],
    });

    for (const fact of facts) {
      expect(fact.retrievedAt).toBe(RETRIEVED_AT);
      expect(fact.sourceUpdatedAt).toBeNull();
      expect(fact.cacheStatus).toBe(CACHE_STATUS.UNKNOWN);
      expect(fact).not.toHaveProperty('fetchedAt');
    }
  });
});

describe('fact routing terms', () => {
  test('terms carry content words and drop boilerplate', () => {
    const facts = buildFor('glac', 'Glacier National Park', {
      parkAlerts: [{ id: 'a1', title: 'Going-to-the-Sun Road closed above Logan Creek', category: 'Park Closure' }],
    });

    const closure = facts.find((f) => f.status === STATUS.ACTIVE_CLOSURE);
    expect(closure.terms).toEqual(expect.arrayContaining(['logan', 'creek', 'closed']));
    expect(closure.terms).not.toContain('the');
    expect(closure.terms).not.toContain('and');
  });
});
