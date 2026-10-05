'use strict';

/**
 * OPTION 2 — the deterministic traveler acknowledgement.
 *
 * The one-call architecture cannot ground its own explanation: the model writes
 * the sentence before the server has applied, rejected or altered the patch, so
 * `MutationSummary` does not exist yet. This renderer owns every claim about
 * what changed instead.
 *
 * The first version read like a changelog ("60 minutes to 75 minutes"). Literal
 * before/after numbers are rarely the useful thing; the direction and salience
 * are. Everything below is still derived from the artifact difference — nothing
 * is asserted that the diff does not contain.
 */

const { renderMutationAcknowledgement } = require('../mutationAcknowledgement');
const { buildMutationSummary } = require('../mutationSummary');

function plan(day2Stops) {
  return {
    days: [
      { day: 1, dayNumber: 1, stops: [{ id: 'welcome', name: 'Welcome Center', type: 'visitor_center', timeWindow: 'Morning', duration: 40, difficulty: 'easy' }] },
      { day: 2, dayNumber: 2, stops: day2Stops },
      { day: 3, dayNumber: 3, stops: [{ id: 'd3a', name: 'Uēkahuna', type: 'viewpoint', timeWindow: 'Sunrise', duration: 90, difficulty: 'easy' }] },
    ],
  };
}
const overlook = (o = {}) => ({ id: 'day2-kilauea-overlook', order: 1, name: 'Kīlauea Overlook', type: 'viewpoint', timeWindow: 'Morning', duration: 60, difficulty: 'easy', exposureLevel: 'moderate', ...o });
const sulphur = (o = {}) => ({ id: 'day2-haakulamanu', order: 2, name: 'Haʻakulamanu via Sulphur Banks Trail', type: 'trail', timeWindow: 'Late morning', duration: 45, difficulty: 'easy', exposureLevel: 'low', ...o });
const iki = (o = {}) => ({ id: 'day2-kilauea-iki-overlook', order: 3, name: 'Kīlauea Iki Overlook', type: 'viewpoint', timeWindow: 'Afternoon', duration: 60, difficulty: 'easy', ...o });

const MORNING_SCOPE = { level: 'daypart', dayNumber: 2, daypart: 'morning', resolved: true };

function ack(before, after, scope = MORNING_SCOPE) {
  return renderMutationAcknowledgement({
    summary: buildMutationSummary({ priorPlan: before, nextPlan: after }), scope,
  });
}

describe('the real 2026-08-25 mutation', () => {
  const before = plan([overlook(), sulphur(), iki()]);
  const after = plan([
    overlook({ duration: 75, timeWindow: 'Morning · unhurried caldera views and photography' }),
    sulphur({ duration: 30, timeWindow: 'Late morning · brief, easy volcanic-feature walk' }),
    iki(),
  ]);
  const text = ack(before, after);

  test('it names the referenced daypart the way the traveler did', () => {
    expect(text).toMatch(/second morning/i);
  });

  test('it describes direction, not raw minutes', () => {
    expect(text).toMatch(/more time at Kīlauea Overlook/i);
    expect(text).toMatch(/shorter stop at Haʻakulamanu/i);
    expect(text).not.toMatch(/\d+ minutes/);
    expect(text).not.toMatch(/60|75|45|30/);
  });

  test('a trail name is shortened at its "via" clause, not truncated arbitrarily', () => {
    expect(text).toContain('Haʻakulamanu');
    expect(text).not.toContain('via Sulphur Banks Trail');
  });

  test('it says what stayed put, because that is what the traveler worries about', () => {
    expect(text).toMatch(/afternoon/i);
    expect(text).toMatch(/stay(s)? as planned|unchanged|as they were/i);
  });

  test('it does not enumerate untouched days as a list', () => {
    expect(text).not.toMatch(/days 1 and 3/i);
  });
});

describe('the framing is earned, not assumed', () => {
  const before = plan([overlook(), sulphur(), iki()]);

  test('a net easing may be called easier', () => {
    const after = plan([overlook(), sulphur({ duration: 20 }), iki()]);
    expect(ack(before, after)).toMatch(/easier|more relaxed|eased/i);
  });

  test('a net addition of effort is not called easier', () => {
    const after = plan([
      overlook({ duration: 90 }), sulphur({ duration: 90 }),
      { id: 'new-hike', order: 3, name: 'Crater Rim Trail', type: 'trail', timeWindow: 'Late morning', duration: 120, difficulty: 'moderate' },
      iki(),
    ]);
    const text = ack(before, after);
    expect(text).not.toMatch(/easier|more relaxed|eased/i);
    expect(text).toMatch(/Crater Rim Trail/);
  });

  test('a pure timing change is described as timing', () => {
    const after = plan([overlook({ timeWindow: 'Early morning' }), sulphur(), iki()]);
    const text = ack(before, after);
    expect(text).toMatch(/Kīlauea Overlook/);
    expect(text).toMatch(/Early morning/i);
  });
});

describe('additions and removals are always stated', () => {
  const before = plan([overlook(), sulphur(), iki()]);

  test('a removed stop is named', () => {
    const after = plan([overlook(), iki()]);
    expect(ack(before, after)).toMatch(/dropped|removed/i);
    expect(ack(before, after)).toContain('Haʻakulamanu');
  });

  test('an added stop is named', () => {
    const after = plan([overlook(), sulphur(), { id: 'new', order: 3, name: 'Devastation Trail', type: 'trail', timeWindow: 'Late morning', duration: 30, difficulty: 'easy' }, iki()]);
    expect(ack(before, after)).toMatch(/added/i);
    expect(ack(before, after)).toContain('Devastation Trail');
  });

  test('nothing changed says exactly that', () => {
    const same = plan([overlook(), sulphur(), iki()]);
    expect(ack(same, same)).toMatch(/nothing|no changes/i);
  });
});

describe('it cannot claim what the diff does not contain', () => {
  const before = plan([overlook(), sulphur(), iki()]);
  const after = plan([overlook({ duration: 75 }), sulphur(), iki()]);
  const text = ack(before, after);

  test('no removal language when nothing was removed', () => {
    expect(text).not.toMatch(/dropped|removed|instead of|rather than/i);
  });

  test('no claims about stops it did not touch', () => {
    expect(text).not.toContain('Kīlauea Iki Overlook');
    expect(text).not.toContain('Welcome Center');
  });

  test('no difficulty claim when difficulty did not move', () => {
    expect(text).not.toMatch(/less demanding|gentler|flatter|easier walk/i);
  });
});

describe('scope shapes the closing, and its absence is handled', () => {
  const before = plan([overlook(), sulphur(), iki()]);
  const after = plan([overlook({ duration: 75 }), sulphur(), iki()]);

  test('a day-scoped refinement does not invent a daypart', () => {
    const text = ack(before, after, { level: 'day', dayNumber: 2, daypart: null, resolved: true });
    expect(text).toMatch(/day 2/i);
    expect(text).not.toMatch(/morning|afternoon/i);
  });

  test('an unresolved scope still produces a grounded sentence', () => {
    const text = ack(before, after, null);
    expect(text).toMatch(/Kīlauea Overlook/);
    expect(text.length).toBeGreaterThan(20);
  });
});
