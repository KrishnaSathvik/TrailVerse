'use strict';

/**
 * Phase 12G — visible itinerary completeness contract.
 *
 * Asserts intro + days + after_plan closing on canonical full itineraries.
 * Never exact prose. Does not reopen architecture, identity, or routing.
 */

const {
  ensureFullItineraryClosing,
  visibleItineraryContract,
} = require('../visibleItineraryCompleteness');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');

function destPlan(overrides = {}) {
  return {
    parkName: 'Zion National Park',
    intro: 'With two relaxed days in Zion, I would keep the trip on canyon scenery and easy walks rather than trying to cover every major trail.',
    days: [
      {
        id: 'd1',
        dayNumber: 1,
        label: 'Canyon viewpoints',
        stops: [
          {
            id: 's1', order: 0, type: 'viewpoint', name: 'Canyon Overlook',
            note: 'Short scenic overlook.', startTime: '09:00', duration: 90,
            latitude: 37.21, longitude: -112.95,
          },
        ],
      },
      {
        id: 'd2',
        dayNumber: 2,
        label: 'River corridor',
        stops: [
          {
            id: 's2', order: 1, type: 'walk', name: 'Pa\'rus Trail',
            note: 'Easy paved walk.', startTime: '08:30', duration: 120,
            latitude: 37.20, longitude: -112.98,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function constraints(planningState) {
  return { planningState };
}

function afterPlan(plan) {
  return (plan.narrativeSections || []).filter((section) => (
    section.placement === 'after_plan' && String(section.markdown || '').trim()
  ));
}

describe('full itinerary visible grammar', () => {
  test('missing after_plan is not synthesized without a material dependency', () => {
    const next = ensureFullItineraryClosing(destPlan(), {
      constraints: constraints({
        preferences: { pace: 'relaxed' },
        activityPreferences: { hiking: 'easy' },
      }),
    });
    const contract = visibleItineraryContract(next);
    expect(contract.intro).toBeTruthy();
    expect(contract.days.length).toBeGreaterThan(0);
    expect(contract.closing).toBeNull();
  });

  test('faithful model after_plan is kept', () => {
    const authored = 'The two days stay light: canyon viewpoints are grouped together, and the river morning has room for shuttle waits.';
    const next = ensureFullItineraryClosing(destPlan({
      narrativeSections: [{ placement: 'after_plan', heading: null, markdown: authored }],
    }), {
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    expect(afterPlan(next)).toHaveLength(1);
    expect(afterPlan(next)[0].markdown).toBe(authored);
  });

  test('canned closings are dropped without inventing a generic replacement', () => {
    const next = ensureFullItineraryClosing(destPlan({
      narrativeSections: [{
        placement: 'after_plan',
        heading: 'Before you go',
        markdown: 'Have a great trip! Let me know if you need anything else. Always check conditions before traveling.',
      }],
    }), {
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    expect(visibleItineraryContract(next).closing).toBeNull();
  });

  test('prose-only payloads are not forced into itinerary grammar', () => {
    const prose = { intro: 'Acadia is the better fit for a coastal weekend.', days: [] };
    expect(ensureFullItineraryClosing(prose)).toEqual(prose);
  });

  test('partial refinements are not given a full-plan closing', () => {
    const plan = destPlan({
      narrativeSections: [],
    });
    const next = ensureFullItineraryClosing(plan, { isPartialRefinement: true });
    expect(afterPlan(next)).toEqual([]);
  });
});

describe('presentation-contract fixtures', () => {
  test('model-authored after_plan note is kept when present', () => {
    const authored = 'Afternoons are hot, so the canyon viewpoints stay in the cooler morning window.';
    const next = ensureFullItineraryClosing(destPlan({
      intro: 'A two-day canyon trip with easy walks and room to linger.',
      narrativeSections: [{ placement: 'after_plan', heading: null, markdown: authored }],
    }), {
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    expect(visibleItineraryContract(next).closing.markdown).toBe(authored);
  });

  test('mobility alone does not invent an after_plan note', () => {
    const next = ensureFullItineraryClosing(destPlan(), {
      constraints: constraints({
        mobility: { walkingTolerance: 'limited', maxWalkMilesPerSegment: 2 },
      }),
    });
    expect(visibleItineraryContract(next).closing).toBeNull();
  });

  test('exposure preference alone does not invent an after_plan note', () => {
    const next = ensureFullItineraryClosing(destPlan(), {
      constraints: constraints({ preferences: { avoidExposure: true } }),
    });
    expect(visibleItineraryContract(next).closing).toBeNull();
  });

  test('photography preference alone does not invent an after_plan note', () => {
    const next = ensureFullItineraryClosing(destPlan({
      intro: 'A photography-first two days with sunrise viewpoints.',
    }), {
      constraints: constraints({
        activityPreferences: { photography: true, photographyTiming: 'sunrise' },
      }),
    });
    expect(visibleItineraryContract(next).closing).toBeNull();
  });

  test('multi-destination itinerary without material dependency has no forced after_plan note', () => {
    const next = ensureFullItineraryClosing({
      parkName: null,
      intro: 'Two parks in one trip, with the driving kept realistic.',
      days: [
        {
          id: 'd1', dayNumber: 1, label: 'Arches morning',
          stops: [{ id: 's1', order: 0, type: 'viewpoint', name: 'Delicate Arch Viewpoint', note: 'n', startTime: '08:00', duration: 90, parkName: 'Arches National Park' }],
        },
        {
          id: 'd2', dayNumber: 2, label: 'Canyonlands overlooks',
          stops: [{ id: 's2', order: 0, type: 'viewpoint', name: 'Grand View Point', note: 'n', startTime: '09:00', duration: 90, parkName: 'Canyonlands National Park' }],
        },
      ],
    }, {
      constraints: constraints({ preferences: { minimizeDriving: true } }),
    });
    expect(visibleItineraryContract(next).closing).toBeNull();
  });

  test('material shuttle dependency adds a specific verification sentence', () => {
    const next = ensureFullItineraryClosing(destPlan({
      days: [{
        id: 'd1', dayNumber: 1, label: 'Canyon floor',
        stops: [{
          id: 's1', order: 0, type: 'walk', name: 'Riverside Walk',
          note: 'Reached by the park shuttle.', startTime: '09:00', duration: 90,
          requirements: [{ kind: 'water_or_shuttle_access', title: 'Park shuttle' }],
        }],
      }],
    }), {});
    const closing = visibleItineraryContract(next).closing.markdown;
    expect(closing.toLowerCase()).toMatch(/shuttle/);
    expect(closing.toLowerCase()).toMatch(/confirm|check/);
    expect(closing).not.toMatch(/always check conditions before/i);
  });

  test('visitor-center seasonal hours do not become a park-road verification', () => {
    const next = ensureFullItineraryClosing(destPlan({
      days: [{
        id: 'd1', dayNumber: 1, label: 'Scenic pullouts',
        stops: [{
          id: 's1', order: 0, type: 'visitor_center', name: 'Valley of Fire Visitor Center',
          note: 'If it is open, pause for indoor exhibits; confirm seasonal hours first.',
          startTime: '12:00', duration: 45,
        }],
      }],
    }), {
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    const closing = visibleItineraryContract(next).closing;
    expect(closing == null || !/park-road opening/i.test(closing.markdown)).toBe(true);
  });

  test('seasonal road access on a stop adds a specific verification sentence', () => {
    const next = ensureFullItineraryClosing(destPlan({
      days: [{
        id: 'd2', dayNumber: 2, label: 'High overlook',
        stops: [{
          id: 's2', order: 0, type: 'viewpoint', name: 'Lava Point Overlook',
          note: 'Use this scenic finish only if seasonal road access is open.',
          startTime: '15:00', duration: 75,
        }],
      }],
    }), {});
    const closing = visibleItineraryContract(next).closing.markdown;
    expect(closing.toLowerCase()).toMatch(/park-road|seasonal road|road opening/);
    expect(closing.toLowerCase()).toMatch(/day 2|this day/);
    expect(closing).not.toMatch(/always check conditions before/i);
  });

  test('unavailable route minutes cannot claim a numeric drive target', () => {
    const next = ensureFullItineraryClosing(destPlan({
      narrativeSections: [{
        placement: 'after_plan',
        heading: null,
        markdown: 'This keeps driving under 90 minutes each day so the cap is satisfied.',
      }],
    }), { driveMinutesAvailable: false });
    const closing = visibleItineraryContract(next).closing;
    expect(closing == null || !/90 minutes/i.test(closing.markdown)).toBe(true);
    expect(closing == null || !/cap is satisfied/i.test(closing.markdown)).toBe(true);
  });

  test('omitted model-selected stop names do not survive in the closing', () => {
    const next = ensureFullItineraryClosing(destPlan({
      narrativeSections: [{
        placement: 'after_plan',
        heading: null,
        markdown: 'Skip Phantom Ridge Trail if it is on an older draft. Canyon Overlook still carries the morning.',
      }],
    }), { removedStopNames: ['Phantom Ridge Trail'] });
    expect(visibleItineraryContract(next).closing.markdown).not.toMatch(/Phantom Ridge Trail/i);
    expect(visibleItineraryContract(next).closing.markdown).toMatch(/Canyon Overlook/i);
  });
});

describe('finalizeStructuredItinerary persists the closing on the frozen plan', () => {
  test('a full plan without material dependency freezes without forcing after_plan', async () => {
    const res = await finalizeStructuredItinerary({
      itineraryData: destPlan({ narrativeSections: [] }),
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    expect(Object.isFrozen(res.itineraryData)).toBe(true);
    expect(visibleItineraryContract(res.itineraryData).closing).toBeNull();
  });

  test('JSON restore of the frozen plan keeps the same optional closing state', async () => {
    const res = await finalizeStructuredItinerary({
      itineraryData: destPlan({
        days: [{
          id: 'd1', dayNumber: 1, label: 'Canyon floor',
          stops: [{
            id: 's1', order: 0, type: 'walk', name: 'Riverside Walk',
            note: 'Reached by the park shuttle.', startTime: '09:00', duration: 90,
            requirements: [{ kind: 'water_or_shuttle_access', title: 'Park shuttle' }],
          }],
        }],
        narrativeSections: [],
      }),
      constraints: constraints({ preferences: { pace: 'relaxed' } }),
    });
    const restored = JSON.parse(JSON.stringify(res.itineraryData));
    expect(visibleItineraryContract(restored).closing.markdown)
      .toBe(visibleItineraryContract(res.itineraryData).closing.markdown);
    expect(visibleItineraryContract(res.itineraryData).closing.markdown.toLowerCase()).toMatch(/shuttle/);
  });
});
