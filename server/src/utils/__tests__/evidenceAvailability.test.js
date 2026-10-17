'use strict';

/**
 * PHASE 4O — HARD UNAVAILABILITY.
 *
 * The alerts here are VERBATIM Grand Teton alert evidence from the Phase 4N live
 * bundle, including the one that made this necessary: the catalogue offered
 * `Death Canyon Trailhead` while the same frozen bundle said it was closed.
 *
 * The bar is conservative on purpose. A false exclusion silently shrinks the
 * recommendation universe and nothing downstream can notice, so these tests
 * spend as much effort on what must NOT be excluded as on what must.
 */

const {
  buildUnavailablePlaceIndex,
  expandSharedPrefixConjunction,
  hardUnavailableReason,
  subjectFromTitle,
  subjectsFromText,
} = require('../evidenceAvailability');

const FIXTURE = require('./fixtures/grandTetonPlaceEvidence.json');
const bundle = () => ({ evidence: FIXTURE.evidence });
const alerts = () => FIXTURE.evidence.filter((item) => item.topic === 'alerts_closures');

describe('the real closure that Phase 4N shipped past', () => {
  it('marks Death Canyon Trailhead unavailable', () => {
    const index = buildUnavailablePlaceIndex(bundle());
    const reason = hardUnavailableReason('death canyon trailhead', index);
    expect(reason).toBeTruthy();
    expect(reason.alertTitle).toBe('Death Canyon Trailhead Construction Closure');
  });

  it('reaches it two independent ways — the title and the closure sentence', () => {
    const closure = alerts().find((a) => a.claim.normalizedValue.title === 'Death Canyon Trailhead Construction Closure');
    expect(subjectFromTitle(closure.claim.normalizedValue.title)).toBe('death canyon trailhead');
    expect(subjectsFromText(closure.claim.text)).toEqual(
      expect.arrayContaining(['death canyon road', 'death canyon trailhead'])
    );
  });
});

describe('only the park\'s own `Park Closure` classification counts', () => {
  it('ignores a Caution alert, even one that announces a FUTURE closure', () => {
    const caution = alerts().find((a) => a.claim.normalizedValue.title === 'Construction in the South End of the Park');
    expect(caution.claim.normalizedValue.category).toBe('Caution');
    // "Expected to close 9/7" — a closure that has not happened is not a closure.
    expect(caution.claim.text).toMatch(/Expected to close/);
    const index = buildUnavailablePlaceIndex(bundle());
    expect(hardUnavailableReason('moose-wilson road', index)).toBeNull();
  });

  it('leaves every catalogued experience in this bundle alone except the closed one', () => {
    const index = buildUnavailablePlaceIndex(bundle());
    for (const name of ['taggart lake', 'jenny lake loop', 'snake river overlook', 'oxbow bend', 'grassy lake road']) {
      expect(hardUnavailableReason(name, index)).toBeNull();
    }
  });
});

describe('conditional dependencies are NOT unavailability', () => {
  it('keeps a permit place and a 4WD place selectable', () => {
    const index = buildUnavailablePlaceIndex(bundle());
    expect(hardUnavailableReason('bearpaw and trapper lakes', index)).toBeNull();
    expect(hardUnavailableReason('grassy lake road', index)).toBeNull();
  });
});

describe('exact identity equality — near misses are not closures', () => {
  it('does not exclude a place whose name merely appears inside a closure subject', () => {
    const closed = { ...alerts()[0] };
    const alert = {
      topic: 'alerts_closures',
      claim: {
        text: 'Jenny Lake Boat Dock Closure: Jenny Lake Boat Dock is closed for the season.',
        normalizedValue: { title: 'Jenny Lake Boat Dock Closure', category: 'Park Closure' },
      },
    };
    void closed;
    const index = buildUnavailablePlaceIndex({ evidence: [alert] });
    expect(hardUnavailableReason('jenny lake boat dock', index)).toBeTruthy();
    // The loop is a different place, and shares only a prefix.
    expect(hardUnavailableReason('jenny lake loop', index)).toBeNull();
    expect(hardUnavailableReason('jenny lake', index)).toBeNull();
  });

  it('distributes a shared prefix only onto a bare head noun', () => {
    expect(expandSharedPrefixConjunction('Death Canyon Road and Trailhead'))
      .toEqual(['death canyon road', 'death canyon trailhead']);
    // Two full phrases: nothing is distributed, because inventing a prefix
    // would invent an identity.
    expect(expandSharedPrefixConjunction('Taggart Lake and Bradley Lake'))
      .toEqual(['taggart lake', 'bradley lake']);
  });
});

describe('a closure that names a real experience removes it before any spend', () => {
  it('excludes a catalogued hike named by an official Park Closure', () => {
    // Producer-SHAPED, using the real alert schema; only the prose differs, so
    // the rule can be exercised on an identity this bundle actually enumerates.
    const alert = {
      topic: 'alerts_closures',
      claim: {
        text: 'Taggart Lake Trail Closure: Taggart Lake is closed to all use while crews replace the bridge.',
        normalizedValue: { title: 'Taggart Lake Trail Closure', category: 'Park Closure' },
      },
    };
    const index = buildUnavailablePlaceIndex({ evidence: [...FIXTURE.evidence, alert] });
    const reason = hardUnavailableReason('taggart lake', index);
    expect(reason).toBeTruthy();
    expect(reason.ruleCode).toBe('official_closure_statement');
  });
});

describe('an empty or closure-free bundle excludes nothing', () => {
  it('returns an empty index', () => {
    expect(buildUnavailablePlaceIndex({ evidence: [] }).size).toBe(0);
    expect(hardUnavailableReason('anything', new Map())).toBeNull();
  });
});
