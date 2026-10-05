'use strict';

/**
 * MACHINE-OWNED REFINEMENT SCOPE.
 *
 * Two live runs proved the same thing twice: asking the model to re-author a
 * target the machine had already resolved is an unnecessary failure surface.
 * Terra emitted `stopId: null, stopName: "Mauna Loa Road"` for a stop the
 * execution layer knew as `mauna-loa-road`, and after the repair it escaped
 * targeting altogether with `update_day`, rewriting an afternoon nobody
 * mentioned — which day-scoped ownership could not see.
 *
 * The deterministic system owns WHICH object the traveler meant and HOW MUCH of
 * the plan may move. The model owns WHAT the change should be.
 *
 * Offline fixtures. No providers, no model, no network.
 */

const {
  resolveRefinementScope,
  scopeAllowsOperation,
  evaluateScopedOwnership,
  bindOperationsToScope,
  SCOPE_LEVELS,
} = require('../refinementScope');

/** The real persisted Hawaiʻi v1 plan. */
function hawaiiPlan() {
  return {
    intro: 'Three relaxed days at Hawaiʻi Volcanoes.',
    days: [
      {
        day: 1, dayNumber: 1, stops: [
          { id: 'welcome-center', order: 1, name: 'Welcome Center', type: 'visitor_center', timeWindow: 'Morning', duration: 40, difficulty: 'easy', exposureLevel: 'low' },
          { id: 'steam-vents', order: 2, name: 'Kūkamāhuākea (Steam Vents)', type: 'landmark', timeWindow: 'Late morning', duration: 35, difficulty: 'easy', exposureLevel: 'low' },
          { id: 'kilauea-overlook', order: 3, name: 'Kīlauea Overlook', type: 'viewpoint', timeWindow: 'Afternoon', duration: 60, difficulty: 'easy', exposureLevel: 'moderate' },
        ],
      },
      {
        day: 2, dayNumber: 2, stops: [
          { id: 'mauna-loa-road', order: 1, name: 'Mauna Loa Road scenic drive', type: 'scenic_drive', timeWindow: 'Morning through midday', duration: 105, difficulty: 'easy', exposureLevel: 'moderate' },
          { id: 'kipukapuaulu', order: 2, name: 'Kīpukapuaulu', type: 'landmark', timeWindow: 'Afternoon', duration: 75, difficulty: 'easy', exposureLevel: 'low' },
        ],
      },
      {
        day: 3, dayNumber: 3, stops: [
          { id: 'uekahuuna-photo', order: 1, name: 'Uēkahuna sunrise or golden-hour photography', type: 'viewpoint', timeWindow: 'Sunrise or late afternoon golden hour', duration: 90, difficulty: 'easy', exposureLevel: 'moderate' },
          { id: 'kilauea-overlook-return', order: 2, name: 'Kīlauea Overlook return visit', type: 'viewpoint', timeWindow: 'After sunrise or before/after golden hour', duration: 50, difficulty: 'easy', exposureLevel: 'moderate' },
        ],
      },
    ],
  };
}

const LIVE_PROMPT = 'The second morning sounds like a little too much. '
  + "We'd rather take that part easier and spend more time enjoying the views.";

const scopeFor = (text, plan = hawaiiPlan()) => resolveRefinementScope({ text, priorPlan: plan });

describe('A — the machine resolves the referent, not the model', () => {
  test('"the second morning" resolves to day 2 morning and its one stop', () => {
    expect(scopeFor(LIVE_PROMPT)).toMatchObject({
      level: SCOPE_LEVELS.DAYPART,
      dayNumber: 2,
      daypart: 'morning',
      allowedStopIds: ['mauna-loa-road'],
      singularTargetId: 'mauna-loa-road',
      resolved: true,
    });
  });

  test('a daypart with several stops offers a finite choice, not a singular target', () => {
    const scope = scopeFor('The first morning feels rushed, can we slow it down?');
    expect(scope).toMatchObject({
      level: SCOPE_LEVELS.DAYPART,
      dayNumber: 1,
      daypart: 'morning',
      allowedStopIds: ['welcome-center', 'steam-vents'],
      singularTargetId: null,
      resolved: true,
    });
  });

  test('a whole-day reference scopes to the day, not a daypart', () => {
    expect(scopeFor('Redo day two, it is way too busy.')).toMatchObject({
      level: SCOPE_LEVELS.DAY,
      dayNumber: 2,
      daypart: null,
      allowedStopIds: ['mauna-loa-road', 'kipukapuaulu'],
      resolved: true,
    });
  });

  test('a named stop scopes to that stop', () => {
    expect(scopeFor('Can we make Kīpukapuaulu a bit shorter?')).toMatchObject({
      level: SCOPE_LEVELS.STOP,
      allowedStopIds: ['kipukapuaulu'],
      singularTargetId: 'kipukapuaulu',
      resolved: true,
    });
  });

  test('an unresolvable reference fails closed with no targets', () => {
    const scope = scopeFor('Can we take that part easier?');
    expect(scope.resolved).toBe(false);
    expect(scope.allowedStopIds).toEqual([]);
    expect(scope.singularTargetId).toBeNull();
    expect(scope.reasonCodes).toContain('refinement_target_unresolved');
  });

  test('a daypart that contains no stops resolves nothing rather than guessing', () => {
    const scope = scopeFor('The third evening is too much.');
    expect(scope.resolved).toBe(false);
    expect(scope.allowedStopIds).toEqual([]);
  });
});

describe('B — the resolved target is bound by the server', () => {
  test('a singular target is injected, so free-typed identity cannot miss', () => {
    const scope = scopeFor(LIVE_PROMPT);
    // Exactly what terra emitted live on attempt 1.
    const bound = bindOperationsToScope({
      operations: [{ op: 'update_stop', dayNumber: 2, stopId: null, stopName: 'Mauna Loa Road', stop: { duration: 60 } }],
      scope,
    });
    expect(bound.ok).toBe(true);
    expect(bound.operations[0]).toMatchObject({
      op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road',
    });
    expect(bound.reasonCodes).toContain('patch_target_bound_by_scope');
  });

  test('with several allowed targets the model may choose only from that set', () => {
    const scope = scopeFor('The first morning feels rushed, can we slow it down?');
    const ok = bindOperationsToScope({
      operations: [{ op: 'update_stop', dayNumber: 1, stopId: 'steam-vents', stop: { duration: 20 } }],
      scope,
    });
    expect(ok.ok).toBe(true);
    expect(ok.operations[0].stopId).toBe('steam-vents');

    const outside = bindOperationsToScope({
      operations: [{ op: 'update_stop', dayNumber: 1, stopId: 'kilauea-overlook', stop: { duration: 20 } }],
      scope,
    });
    expect(outside.ok).toBe(false);
    expect(outside.reasonCodes).toContain('patch_target_outside_scope');
  });

  test('a name is accepted only when it resolves to an allowed id', () => {
    const scope = scopeFor('The first morning feels rushed, can we slow it down?');
    const bound = bindOperationsToScope({
      operations: [{ op: 'update_stop', dayNumber: 1, stopName: 'Kūkamāhuākea (Steam Vents)', stop: { duration: 20 } }],
      scope,
    });
    expect(bound.ok).toBe(true);
    expect(bound.operations[0].stopId).toBe('steam-vents');
  });

  test('an unresolved scope binds nothing and mutates nothing', () => {
    const scope = scopeFor('Can we take that part easier?');
    const bound = bindOperationsToScope({
      operations: [{ op: 'update_stop', dayNumber: 2, stopName: 'anything', stop: {} }],
      scope,
    });
    expect(bound.ok).toBe(false);
    expect(bound.reasonCodes).toContain('refinement_target_unresolved');
  });
});

describe('C — scope constrains operation breadth', () => {
  test('a daypart request may not authorize a whole-day rewrite', () => {
    const scope = scopeFor(LIVE_PROMPT);
    const verdict = scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 2 } });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonCode).toBe('patch_operation_exceeds_requested_scope');
  });

  test('the same operation is fine when the traveler asked for the day', () => {
    const scope = scopeFor('Redo day two, it is way too busy.');
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 2 } }).ok).toBe(true);
  });

  test('a whole-plan request authorizes broad operations', () => {
    const scope = scopeFor('The whole trip is too packed, please relax the entire itinerary.');
    expect(scope.level).toBe(SCOPE_LEVELS.WHOLE_PLAN);
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 3 } }).ok).toBe(true);
  });

  test('a day request may not rewrite a different day', () => {
    const scope = scopeFor('Redo day two, it is way too busy.');
    expect(scopeAllowsOperation({ scope, operation: { op: 'update_day', dayNumber: 3 } }))
      .toMatchObject({ ok: false, reasonCode: 'patch_operation_exceeds_requested_scope' });
  });

  test('stop operations inside a daypart are allowed', () => {
    const scope = scopeFor(LIVE_PROMPT);
    expect(scopeAllowsOperation({
      scope, operation: { op: 'update_stop', dayNumber: 2, stopId: 'mauna-loa-road' },
    }).ok).toBe(true);
  });
});

describe('D — hierarchical ownership', () => {
  const scope = () => scopeFor(LIVE_PROMPT);

  test('D1 positive: only the requested morning stop moves', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    Object.assign(after.days[1].stops[0], {
      timeWindow: 'Morning · flexible and unhurried', duration: 120,
      note: 'Turn around whenever you feel ready.',
    });
    expect(evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: scope() }))
      .toMatchObject({ ok: true, reasonCodes: [] });
  });

  test('D2 negative: the live attempt-2 whole-day replacement is a scope violation', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    after.days[1].stops = [
      { id: 'kilauea-overlook-d2', order: 1, name: 'Kīlauea Overlook', type: 'viewpoint', timeWindow: 'Morning', duration: 60, difficulty: 'easy' },
      { id: 'sulphur-banks', order: 2, name: 'Haʻakulamanu via Sulphur Banks Trail', type: 'trail', timeWindow: 'Late morning', duration: 45, difficulty: 'easy' },
      { id: 'kilauea-iki-overlook', order: 3, name: 'Kīlauea Iki Overlook', type: 'viewpoint', timeWindow: 'Afternoon', duration: 60, difficulty: 'easy' },
    ];
    const verdict = evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: scope() });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonCodes).toContain('refinement_mutation_outside_requested_scope');
    expect(verdict.outsideScope.removed).toContain('kipukapuaulu');
  });

  test('D3 ripple: the afternoon may shift in time when the morning grows', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    Object.assign(after.days[1].stops[0], { duration: 135 });
    // Same stop, retained, only its clock position moves.
    Object.assign(after.days[1].stops[1], { timeWindow: 'Later afternoon' });
    expect(evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: scope() }))
      .toMatchObject({ ok: true });
  });

  test('a ripple may not change what an out-of-scope stop IS', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    Object.assign(after.days[1].stops[0], { duration: 135 });
    Object.assign(after.days[1].stops[1], { duration: 20, note: 'Shortened to fit.' });
    const verdict = evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: scope() });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonCodes).toContain('refinement_mutation_outside_requested_scope');
  });

  test('unrelated days are still protected', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    after.days[2].stops.pop();
    const verdict = evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: scope() });
    expect(verdict.ok).toBe(false);
    expect(verdict.outsideScope.removed).toContain('kilauea-overlook-return');
  });

  test('a day-scoped request may legitimately replace that day', () => {
    const before = hawaiiPlan();
    const after = hawaiiPlan();
    after.days[1].stops = [
      { id: 'new-a', order: 1, name: 'A calmer morning', type: 'viewpoint', timeWindow: 'Morning', duration: 60 },
    ];
    const dayScope = scopeFor('Redo day two, it is way too busy.');
    expect(evaluateScopedOwnership({ priorPlan: before, nextPlan: after, scope: dayScope }))
      .toMatchObject({ ok: true });
  });
});
