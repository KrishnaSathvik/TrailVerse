'use strict';

const loadSubject = () => {
  try {
    return require('../evidenceKey');
  } catch {
    return {};
  }
};

const base = {
  entityId: 'nps:park:yose',
  topic: 'alerts_closures',
  scope: {
    geographicEntityIds: ['nps:park:yose'],
    validFrom: null,
    validThrough: null,
    audience: 'public',
    locale: 'en-US',
  },
  source: { provider: 'nps', sourceId: 'alert-1' },
  evidenceType: 'live_state',
  claim: {
    identity: 'tioga-road-vehicle-status',
    text: 'Tioga Road is closed to vehicles.',
    normalizedValue: 'closed',
    subjectId: 'nps:road:tioga',
  },
};

describe('Trailie evidence canonical keys', () => {
  test('exports a deterministic key builder', () => {
    expect(loadSubject().buildEvidenceKeys).toEqual(expect.any(Function));
  });

  test('normalizes ordering and superficial casing without collapsing claim versions', () => {
    const { buildEvidenceKeys } = loadSubject();
    const a = buildEvidenceKeys(base);
    const b = buildEvidenceKeys({
      ...base,
      entityId: ' NPS:PARK:YOSE ',
      scope: {
        ...base.scope,
        geographicEntityIds: ['NPS:PARK:YOSE'],
      },
      claim: { ...base.claim, text: '  Tioga Road is closed to vehicles.  ' },
    });

    expect(a).toEqual(b);
    expect(a.logicalKey).toMatch(/^lek:/);
    expect(a.canonicalKey).toMatch(/^evk:/);
    expect(a.evidenceId).toMatch(/^ev:/);
  });

  test('date-bounded scope does not collide with current scope', () => {
    const { buildEvidenceKeys } = loadSubject();
    const current = buildEvidenceKeys(base);
    const dated = buildEvidenceKeys({
      ...base,
      scope: {
        ...base.scope,
        validFrom: '2026-10-10T00:00:00.000Z',
        validThrough: '2026-10-12T23:59:59.000Z',
      },
    });

    expect(dated.logicalKey).not.toBe(current.logicalKey);
    expect(dated.canonicalKey).not.toBe(current.canonicalKey);
  });

  test('different campground subjects and different providers do not collide', () => {
    const { buildEvidenceKeys } = loadSubject();
    const campgroundA = buildEvidenceKeys({
      ...base,
      topic: 'campgrounds',
      claim: { ...base.claim, identity: 'campground-a-status', subjectId: 'ridb:facility:a' },
    });
    const campgroundB = buildEvidenceKeys({
      ...base,
      topic: 'campgrounds',
      claim: { ...base.claim, identity: 'campground-b-status', subjectId: 'ridb:facility:b' },
    });
    const lowerAuthoritySource = buildEvidenceKeys({
      ...base,
      source: { provider: 'reputable-web', sourceId: 'article-9' },
    });

    expect(campgroundA.logicalKey).not.toBe(campgroundB.logicalKey);
    expect(lowerAuthoritySource.logicalKey).not.toBe(buildEvidenceKeys(base).logicalKey);
  });

  test('changed claim content keeps the logical key but creates a new immutable version key', () => {
    const { buildEvidenceKeys } = loadSubject();
    const before = buildEvidenceKeys(base);
    const after = buildEvidenceKeys({
      ...base,
      claim: {
        ...base.claim,
        text: 'Tioga Road is open to vehicles.',
        normalizedValue: 'open',
      },
    });

    expect(after.logicalKey).toBe(before.logicalKey);
    expect(after.canonicalKey).not.toBe(before.canonicalKey);
    expect(after.evidenceId).not.toBe(before.evidenceId);
  });
});
