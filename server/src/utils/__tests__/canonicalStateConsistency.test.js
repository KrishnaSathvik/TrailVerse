'use strict';

/**
 * Canonical-state consistency — the invariant that hard constraints and the
 * planning state fed to evidence/generation may not disagree.
 *
 * Driven through buildPlanningStateFromRuntime (the real merge), not just the
 * rule table, because the defect this covers lived in the seam between them.
 */

const {
  resolveCanonicalStateConsistency, findCanonicalStateContradictions, classOfAccommodation,
} = require('../canonicalStateConsistency');
const { buildPlanningStateFromRuntime } = require('../planningState');
const { mapStayPreference } = require('../stayPreferenceMapper');

const NO_CAMPING_MESSAGE =
  'Plan a 3-day Yosemite trip for two adults who like moderate hikes, scenic viewpoints and wildlife. No camping.';

const baseConstraints = (overrides = {}) => ({
  parkCode: 'yose',
  dates: { start: '2026-09-14', end: '2026-09-16', numDays: 3 },
  groupSize: 2,
  fitnessLevel: 'moderate',
  accommodation: 'lodging',
  interests: ['hiking', 'wildlife', 'scenic viewpoints'],
  ...overrides,
});

describe('accommodation — the reported inversion', () => {
  test('"No camping." with accommodation=lodging never yields a camping state', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints(),
      formData: { accommodation: 'lodging' },
      messageText: NO_CAMPING_MESSAGE,
      parkCode: 'yose',
    });
    expect(state.lodging.type).toBe('lodging');
    expect(state.lodging.stayPreference).not.toBe('campground');
    expect(state.lodging.stayPreference).not.toBe('rv');
  });

  test('an explicit camping request still produces camping', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints({ accommodation: 'camping' }),
      messageText: "We're camping the whole trip",
      parkCode: 'yose',
    });
    expect(state.lodging.type).toBe('camping');
    expect(state.lodging.stayPreference).toBe('campground');
  });

  test('an RV campground request keeps RV camping', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints({ accommodation: null }),
      messageText: 'We need an RV campsite with hookups',
      parkCode: 'yose',
    });
    expect(state.lodging.type).toBe('camping');
    expect(state.lodging.stayPreference).toBe('rv');
  });

  test('a current explicit message overrides a stale camping state', () => {
    const previous = buildPlanningStateFromRuntime({
      constraints: baseConstraints({ accommodation: 'camping' }),
      messageText: 'We are camping',
      parkCode: 'yose',
    });
    expect(previous.lodging.type).toBe('camping');

    const next = buildPlanningStateFromRuntime({
      constraints: baseConstraints({ accommodation: null }),
      previous,
      messageText: "Actually let's stay in hotels instead",
      parkCode: 'yose',
    });
    expect(next.lodging.type).toBe('lodging');
    expect(next.lodging.stayPreference).toBe('hotel');
  });

  test('"hotel or campground works" asserts no hard exclusion', () => {
    expect(mapStayPreference({ messageText: 'Hotel or campground works' })).toEqual({
      accommodationClass: 'unknown',
      stayPreference: 'unknown',
    });
  });

  test.each([
    'No camping.',
    'we do not want to camp',
    'without camping',
    'no campgrounds please',
    'avoid camping',
    'rather not camp',
  ])('negated stay cue %p never reads as an affirmative camping preference', (messageText) => {
    expect(mapStayPreference({ messageText }).accommodationClass).not.toBe('camping');
  });

  test('canonical class values round-trip through the mapper', () => {
    expect(mapStayPreference({ rawAccommodation: 'lodging' }).accommodationClass).toBe('lodging');
    expect(mapStayPreference({ rawAccommodation: 'camping' }).accommodationClass).toBe('camping');
    expect(mapStayPreference({ rawAccommodation: 'unknown' }).accommodationClass).toBe('unknown');
  });
});

describe('interest preservation', () => {
  test('supported traveler interests survive normalization', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints(),
      messageText: NO_CAMPING_MESSAGE,
      parkCode: 'yose',
    });
    expect(state.preferences.interests).toEqual(
      expect.arrayContaining(['hiking', 'wildlife', 'scenic-drives'])
    );
  });

  test.each(['scenic viewpoints', 'scenic views', 'viewpoints', 'overlooks', 'scenery'])(
    '%p maps to the canonical scenic/viewpoint semantic',
    (label) => {
      const state = buildPlanningStateFromRuntime({
        constraints: baseConstraints({ interests: [label] }),
        parkCode: 'yose',
      });
      expect(state.preferences.interests).toContain('scenic-drives');
    }
  );

  test('an unsupported interest is dropped rather than mis-mapped', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints({ interests: ['underwater basket weaving'] }),
      parkCode: 'yose',
    });
    expect(state.preferences.interests).toEqual([]);
  });
});

describe('cross-field invariant', () => {
  test('a lodging class never keeps a camping stay preference', () => {
    const { state, contradictions } = resolveCanonicalStateConsistency({
      constraints: { accommodation: 'lodging' },
      planningState: {
        lodging: { type: 'camping', stayPreference: 'campground' },
        mobility: {}, preferences: {}, travelers: {}, dates: {}, activityPreferences: {},
      },
    });
    expect(state.lodging.type).toBe('lodging');
    expect(state.lodging.stayPreference).toBeNull();
    expect(contradictions.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'accommodation_constraint_vs_planning_state',
        'accommodation_class_vs_stay_preference',
      ])
    );
  });

  test('hard mobility flags propagate into planning state', () => {
    const { state } = resolveCanonicalStateConsistency({
      constraints: { mobility: { wheelchair: true, avoidStairs: true } },
      planningState: {
        lodging: {}, mobility: { wheelchair: null, avoidStairs: false },
        preferences: {}, travelers: {}, dates: {}, activityPreferences: {},
      },
    });
    expect(state.mobility.wheelchair).toBe(true);
    expect(state.mobility.avoidStairs).toBe(true);
  });

  test('a wheelchair traveler cannot retain a hard-hiking preference', () => {
    const { state } = resolveCanonicalStateConsistency({
      constraints: {},
      planningState: {
        lodging: {}, mobility: { wheelchair: true }, preferences: {},
        travelers: {}, dates: {}, activityPreferences: { hiking: 'hard' },
      },
    });
    expect(state.activityPreferences.hiking).toBeNull();
  });

  test('avoidExposure and a tighter walk limit resolve toward the constraint', () => {
    const { state } = resolveCanonicalStateConsistency({
      constraints: { avoidExposure: true, mobility: { maxWalkMilesPerSegment: 1 } },
      planningState: {
        lodging: {}, mobility: { maxWalkMilesPerSegment: 6 },
        preferences: { avoidExposure: false }, travelers: {}, dates: {}, activityPreferences: {},
      },
    });
    expect(state.preferences.avoidExposure).toBe(true);
    expect(state.mobility.maxWalkMilesPerSegment).toBe(1);
  });

  test('a consistent state reports no contradictions', () => {
    expect(findCanonicalStateContradictions({
      constraints: baseConstraints(),
      planningState: {
        lodging: { type: 'lodging', stayPreference: 'hotel' },
        mobility: {}, preferences: {}, travelers: { count: 2 },
        dates: { durationDays: 3 }, activityPreferences: {},
      },
    })).toEqual([]);
  });

  test('the real merge leaves no accommodation contradiction behind', () => {
    const state = buildPlanningStateFromRuntime({
      constraints: baseConstraints(),
      formData: { accommodation: 'lodging' },
      messageText: NO_CAMPING_MESSAGE,
      parkCode: 'yose',
    });
    expect(findCanonicalStateContradictions({
      constraints: baseConstraints(),
      planningState: state,
    })).toEqual([]);
  });

  test('classOfAccommodation maps both class names and concrete preferences', () => {
    expect(classOfAccommodation('lodging')).toBe('lodging');
    expect(classOfAccommodation('campground')).toBe('camping');
    expect(classOfAccommodation('hotel')).toBe('lodging');
    expect(classOfAccommodation('rv')).toBe('camping');
    expect(classOfAccommodation(null)).toBe('unknown');
  });
});
