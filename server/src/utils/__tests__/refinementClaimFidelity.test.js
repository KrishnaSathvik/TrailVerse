'use strict';

const {
  reconcileRefinementClaims,
  alignRefinementProse,
} = require('../refinementClaimFidelity');

const Q5_PROMPT = 'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.';

function stop(name, extra = {}) {
  return { name, type: extra.type || 'walk', duration: extra.duration || 60, ...extra };
}

const Q4_PLAN = {
  days: [
    {
      dayNumber: 1,
      label: 'Temple of Sinawava and Zion Canyon',
      stops: [
        stop('Zion Canyon Visitor Center', { type: 'visitor_center', duration: 35 }),
        stop('Temple of Sinawava', { type: 'walk', duration: 150 }),
        stop('Human History Museum', { type: 'museum', duration: 75 }),
      ],
    },
    {
      dayNumber: 2,
      label: 'Lava Point panorama and Zion’s human history',
      stops: [
        stop('Lava Point Overlook', { type: 'viewpoint', duration: 90, timeWindow: 'Late morning to early afternoon' }),
        stop('Human History Museum', { type: 'museum', duration: 75, timeWindow: 'Afternoon' }),
      ],
    },
  ],
};

const Q5_PLAN = {
  days: [
    Q4_PLAN.days[0],
    {
      dayNumber: 2,
      label: 'Lava Point panorama and Zion’s human history',
      stops: [
        stop('Lava Point Overlook', {
          type: 'viewpoint',
          duration: 75,
          timeWindow: 'Late afternoon through sunset',
        }),
        stop('Zion Human History Museum', { type: 'museum', duration: 45, timeWindow: 'Early afternoon' }),
      ],
    },
  ],
};

const REQUESTED = ['sunset_added', 'less_shuttle_reliance', 'slower_pace'];

describe('exact seeded Q4→Q5 claim fidelity', () => {
  it('does not emit less_shuttle_reliance when Day 1 shuttle-untagged headline stops are untouched', () => {
    const result = reconcileRefinementClaims({
      requestedChanges: REQUESTED,
      priorPlan: Q4_PLAN,
      nextPlan: Q5_PLAN,
      userPrompt: Q5_PROMPT,
    });
    expect(result.acceptedChanges).toEqual(expect.arrayContaining(['sunset_added', 'slower_pace']));
    expect(result.acceptedChanges).not.toContain('less_shuttle_reliance');
    expect(result.unsatisfied).toEqual(expect.arrayContaining(['less_shuttle_reliance']));
  });

  it('replaces shuttle-reduction copy with an honest bounded explanation', () => {
    const lying = 'I eased up the second day and made Lava Point Overlook the sunset finish, keeping the afternoon quiet and away from the shuttle-heavy canyon itinerary.';
    const aligned = alignRefinementProse({
      text: lying,
      reconciliation: reconcileRefinementClaims({
        requestedChanges: REQUESTED,
        priorPlan: Q4_PLAN,
        nextPlan: Q5_PLAN,
        userPrompt: Q5_PROMPT,
      }),
    });
    expect(aligned).toMatch(/sunset/i);
    expect(aligned).not.toMatch(/away from the shuttle-heavy/i);
    expect(aligned).toMatch(/shuttle/i);
    expect(aligned).toMatch(/kept|remain|did not (change|reduce)|couldn.t confirm/i);
  });

  it('aligns the exact captured Q5 traveler sentence', () => {
    const captured = 'I eased up the second day and made Lava Point Overlook the sunset finish. I also swapped the incorrectly named museum stop for Zion Human History Museum, keeping the afternoon quiet and away from the shuttle-heavy canyon itinerary.';
    const aligned = alignRefinementProse({
      text: captured,
      reconciliation: reconcileRefinementClaims({
        requestedChanges: REQUESTED,
        priorPlan: Q4_PLAN,
        nextPlan: Q5_PLAN,
        userPrompt: Q5_PROMPT,
      }),
    });
    expect(aligned).toMatch(/Lava Point Overlook/);
    expect(aligned).not.toMatch(/away from the shuttle-heavy/i);
    expect(aligned).toMatch(/couldn't confirm a shuttle-access change/i);
  });

  it('strips a live shuttle-focused claim that is not a canonical reduction', () => {
    const live = 'I made Day 2 a calmer, genuinely different outing: an easy heritage walk followed by Lava Point Overlook for sunset, so it avoids the shuttle-focused canyon stops and doesn’t repeat the same experience under a new name.';
    const aligned = alignRefinementProse({
      text: live,
      reconciliation: reconcileRefinementClaims({
        requestedChanges: REQUESTED,
        priorPlan: Q4_PLAN,
        nextPlan: Q5_PLAN,
        userPrompt: Q5_PROMPT,
      }),
    });
    expect(aligned).toMatch(/Lava Point Overlook/);
    expect(aligned).not.toMatch(/shuttle-focused/i);
    expect(aligned).not.toMatch(/avoids the shuttle/i);
    expect(aligned).toMatch(/couldn't confirm a shuttle-access change/i);
  });
});

describe('generic refinement claim fidelity', () => {
  it('fully satisfied shuttle avoidance is claimed when shuttle-tagged stops were removed', () => {
    const prior = {
      days: [{
        dayNumber: 1,
        stops: [
          stop('Visitor Center', { type: 'visitor_center' }),
          stop('Canyon shuttle to Temple', {
            type: 'walk',
            requirements: [{ kind: 'water_or_shuttle_access', title: 'Shuttle or boat access required' }],
          }),
        ],
      }],
    };
    const next = {
      days: [{
        dayNumber: 1,
        stops: [
          stop('Visitor Center', { type: 'visitor_center' }),
          stop('Pa\'rus Trail', { type: 'trail' }),
        ],
      }],
    };
    const result = reconcileRefinementClaims({
      requestedChanges: ['less_shuttle_reliance'],
      priorPlan: prior,
      nextPlan: next,
    });
    expect(result.acceptedChanges).toContain('less_shuttle_reliance');
    expect(result.unsatisfied).not.toContain('less_shuttle_reliance');
  });

  it('partial satisfaction still claims reduction when a shuttle-tagged stop was actually removed', () => {
    const shuttleStop = stop('Shuttle to the lodge', {
      type: 'transport',
      requirements: [{ kind: 'water_or_shuttle_access' }],
    });
    const prior = {
      days: [{
        dayNumber: 1,
        stops: [stop('Overlook', { type: 'viewpoint' }), shuttleStop, stop('Second shuttle hop', {
          type: 'walk',
          note: 'Take the park shuttle to the trailhead.',
        })],
      }],
    };
    const next = {
      days: [{
        dayNumber: 1,
        stops: [stop('Overlook', { type: 'viewpoint' }), shuttleStop],
      }],
    };
    const result = reconcileRefinementClaims({
      requestedChanges: ['less_shuttle_reliance'],
      priorPlan: prior,
      nextPlan: next,
    });
    expect(result.acceptedChanges).toContain('less_shuttle_reliance');
  });

  it('impossible shuttle preference is explained rather than claimed', () => {
    const plan = {
      days: [{ dayNumber: 1, stops: [stop('Rim Trail', { type: 'trail' })] }],
    };
    const result = reconcileRefinementClaims({
      requestedChanges: ['less_shuttle_reliance'],
      priorPlan: plan,
      nextPlan: plan,
    });
    expect(result.acceptedChanges).not.toContain('less_shuttle_reliance');
    expect(result.unsatisfied).toContain('less_shuttle_reliance');
    const prose = alignRefinementProse({
      text: 'Here is a quieter afternoon.',
      reconciliation: result,
    });
    expect(prose).toMatch(/shuttle/i);
    expect(prose).toMatch(/did not|couldn't|could not|kept|unchanged/i);
  });

  it('unrelated refinement keeps an untouched day byte-stable', () => {
    const day1 = {
      dayNumber: 1,
      stops: [stop('Visitor Center', { id: 'vc', type: 'visitor_center', duration: 35 })],
    };
    const prior = {
      days: [
        day1,
        { dayNumber: 2, stops: [stop('Overlook', { type: 'viewpoint', duration: 90 })] },
      ],
    };
    const next = {
      days: [
        day1,
        { dayNumber: 2, stops: [stop('Overlook', { type: 'viewpoint', duration: 60, timeWindow: 'Sunset' })] },
      ],
    };
    const result = reconcileRefinementClaims({
      requestedChanges: ['sunset_added'],
      priorPlan: prior,
      nextPlan: next,
    });
    expect(result.acceptedChanges).toEqual(['sunset_added']);
    expect(result.changedDayNumbers).toEqual([2]);
    expect(JSON.stringify(next.days[0])).toBe(JSON.stringify(prior.days[0]));
  });
});

describe('execution service wires claim fidelity before presentation', () => {
  it('reconciles requested changes against the accepted canonical delta', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '..', '..', 'services', 'trailieExecutionService.js'),
      'utf8'
    );
    expect(source).toMatch(/reconcileRefinementClaims/);
    expect(source).toMatch(/alignRefinementProse/);
    expect(source).toMatch(/acceptedChanges/);
  });
});
