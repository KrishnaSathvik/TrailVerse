'use strict';

const {
  resolveCanonicalFactStatus,
  CANONICAL_FACT_STATUS,
} = require('../canonicalFacts');

describe('resolveCanonicalFactStatus', () => {
  test('no slot requested → not_requested', () => {
    expect(
      resolveCanonicalFactStatus([
        { requested: false, ok: false },
        { requested: false, ok: false },
      ])
    ).toBe(CANONICAL_FACT_STATUS.NOT_REQUESTED);
  });

  test('all requested slots succeeded → available', () => {
    expect(
      resolveCanonicalFactStatus([
        { requested: true, ok: true },
        { requested: false, ok: false },
      ])
    ).toBe(CANONICAL_FACT_STATUS.AVAILABLE);
  });

  test('every requested slot failed → fetch_failed', () => {
    expect(
      resolveCanonicalFactStatus([
        { requested: true, ok: false },
        { requested: true, ok: false },
      ])
    ).toBe(CANONICAL_FACT_STATUS.FETCH_FAILED);
  });

  test('some requested slots succeeded and some failed → partial', () => {
    expect(
      resolveCanonicalFactStatus([
        { requested: true, ok: true },
        { requested: true, ok: false },
      ])
    ).toBe(CANONICAL_FACT_STATUS.PARTIAL);
  });

  test('empty input → not_requested', () => {
    expect(resolveCanonicalFactStatus([])).toBe(CANONICAL_FACT_STATUS.NOT_REQUESTED);
  });
});
