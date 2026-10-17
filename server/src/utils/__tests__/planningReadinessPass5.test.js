'use strict';

/**
 * Planning Readiness Pass #5 — normalized planning-state persistence + reload.
 * No providers / models / network.
 */

const {
  PLANNING_STATE_SCHEMA_VERSION,
  emptyPlanningState,
  normalizePersistedPlanningState,
  buildPlanningStateFromRuntime,
  planningStateToConstraintSeed,
  planningStateContainsEvidence,
  resolvePlanningStateForWrite,
  applyTripScopeRefinement,
} = require('../planningState');
const { parseConstraints } = require('../constraintEngine');
const { buildTripState } = require('../tripStateBuilder');

function roundTrip(constraintsOrState, followUpMessage = '') {
  const state =
    constraintsOrState?.schemaVersion
      ? constraintsOrState
      : buildPlanningStateFromRuntime({ constraints: constraintsOrState });
  const written = resolvePlanningStateForWrite({
    incomingPlanningState: state,
    conversation: followUpMessage
      ? [{ role: 'user', content: followUpMessage }]
      : [{ role: 'user', content: 'reload' }],
    previousPlanningState: state,
  });
  // Simulate reload: parse with persisted state + empty/new message
  const reloaded = parseConstraints(
    { planningState: written, formData: {} },
    followUpMessage || ''
  );
  return { written, reloaded, state };
}

function saveThenReload(initialMessage, followUpMessage = '') {
  const first = parseConstraints({ formData: {} }, initialMessage);
  const persisted = buildPlanningStateFromRuntime({ constraints: first });
  const afterFollowUp = parseConstraints(
    { planningState: persisted, formData: {} },
    followUpMessage || ''
  );
  const saved = resolvePlanningStateForWrite({
    incomingPlanningState: afterFollowUp.planningState,
    previousPlanningState: persisted,
    conversation: [
      { role: 'user', content: initialMessage },
      ...(followUpMessage ? [{ role: 'user', content: followUpMessage }] : []),
    ],
  });
  const reloaded = parseConstraints({ planningState: saved, formData: {} }, '');
  return { first, afterFollowUp, saved, reloaded };
}

describe('Planning Readiness Pass #5 — persistence / reload', () => {
  test('CASE A — party round trip', () => {
    const { reloaded, saved } = saveThenReload(
      'Family of 4 with 2 kids, camping trip.'
    );
    expect(saved.travelers.travelParty).toBe('family');
    expect(saved.travelers.count).toBe(4);
    expect(saved.travelers.hasChildren).toBe(true);
    expect(saved.travelers.childrenCount).toBe(2);
    expect(reloaded.travelParty).toBe('family');
    expect(reloaded.groupSize).toBe(4);
    expect(reloaded.hasChildren).toBe(true);
    expect(reloaded.childrenCount).toBe(2);
  });

  test('CASE B — interest round trip', () => {
    const { saved, reloaded } = saveThenReload(
      'We want hiking, photography, and wildlife.'
    );
    expect(saved.preferences.interests).toEqual(
      expect.arrayContaining(['hiking', 'photography', 'wildlife'])
    );
    expect(reloaded.interests).toEqual(
      expect.arrayContaining(['hiking', 'photography', 'wildlife'])
    );
  });

  test('CASE C — interest removal survives reload (no transcript resurrection)', () => {
    const { saved, reloaded } = saveThenReload(
      'Interests: hiking and photography.',
      'Remove hiking.'
    );
    expect(saved.preferences.interests).toContain('photography');
    expect(saved.preferences.interests).not.toContain('hiking');
    expect(reloaded.interests).toContain('photography');
    expect(reloaded.interests).not.toContain('hiking');

    // Silent reload must not resurrect hiking from persisted removal.
    const silent = parseConstraints({ planningState: saved, formData: {} }, '');
    expect(silent.interests).not.toContain('hiking');

    // Explicit re-add via latest message is allowed.
    const reAdd = parseConstraints({ planningState: saved, formData: {} }, 'Also add hiking.');
    expect(reAdd.interests).toEqual(expect.arrayContaining(['hiking', 'photography']));
  });

  test('CASE D — budget round trip with derived ceiling rebuild', () => {
    const { saved, reloaded } = saveThenReload(
      'Budget $300 per person for two adults.'
    );
    expect(saved.budgetConstraint.scope).toBe('per_person_total');
    expect(saved.budgetConstraint.amount).toBe(300);
    // Persist without relying on stale derivedTripCeiling — recompute on normalize
    const normalized = normalizePersistedPlanningState({
      ...saved,
      budgetConstraint: {
        ...saved.budgetConstraint,
        derivedTripCeiling: 99999, // stale
      },
    });
    expect(normalized.ok).toBe(true);
    expect(normalized.state.budgetConstraint.derivedTripCeiling).toBe(600);
    expect(reloaded.budgetConstraint.amount).toBe(300);
    expect(reloaded.budgetConstraint.scope).toBe('per_person_total');
    expect(reloaded.budgetConstraint.derivedTripCeiling).toBe(600);
  });

  test('CASE E — budget remove remains cleared', () => {
    const { saved, reloaded } = saveThenReload(
      'Budget under $600 total.',
      'Forget the budget.'
    );
    expect(saved.budgetConstraint?.cleared).toBe(true);
    expect(reloaded.budgetConstraint?.cleared).toBe(true);
    expect(reloaded.budget).toBeNull();

    // Old transcript saying $600 must not restore when planningState cleared
    const silent = parseConstraints({ planningState: saved, formData: {} }, '');
    expect(silent.budgetConstraint.cleared).toBe(true);
  });

  test('CASE F — accommodation change', () => {
    const { saved, reloaded } = saveThenReload(
      'Hotel lodging please.',
      "Actually let's camp."
    );
    expect(saved.lodging.type).toMatch(/camp/i);
    expect(reloaded.accommodation).toMatch(/camp/i);
  });

  test('CASE G — pace survives and updates', () => {
    const first = saveThenReload('Relaxed pace trip.');
    expect(first.saved.preferences.pace).toBe('relaxed');
    expect(first.reloaded.pace).toBe('relaxed');

    const second = saveThenReload('Relaxed pace trip.', 'Make it more packed.');
    expect(second.saved.preferences.pace).toBe('packed');
    expect(second.reloaded.pace).toBe('packed');
  });

  test('CASE H — multi-park stable ids/order', () => {
    const { saved, reloaded } = saveThenReload(
      'Visit Arches then Canyonlands then Capitol Reef.'
    );
    expect(saved.tripScope?.destinations?.length).toBeGreaterThanOrEqual(2);
    const codes = (saved.tripScope.destinations || []).map((d) => d.parkCode).filter(Boolean);
    expect(codes.length).toBeGreaterThanOrEqual(2);
    expect(reloaded.tripScope.destinations.map((d) => d.entityId)).toEqual(
      saved.tripScope.destinations.map((d) => d.entityId)
    );
  });

  test('CASE I — road trip semantics', () => {
    const { saved, reloaded } = saveThenReload(
      'Road trip from Denver to Rocky Mountain National Park then Great Sand Dunes, loop, max 4 hours drive a day.'
    );
    expect(saved.tripScope?.type).toBe('road_trip');
    expect(saved.tripScope?.routeShape).toBe('loop');
    expect(saved.tripScope?.maxDailyDriveMinutes).toBe(240);
    expect(reloaded.tripScope.type).toBe('road_trip');
    expect(reloaded.tripScope.routeShape).toBe('loop');
    expect(reloaded.maxDailyDriveMinutes).toBe(240);
  });

  test('CASE J — road-trip remove + one-way; no stale legs', () => {
    const first = parseConstraints(
      { formData: {} },
      'Road trip from Denver visiting Arches, Canyonlands, and Capitol Reef as a loop.'
    );
    const persisted = buildPlanningStateFromRuntime({ constraints: first });
    const refined = applyTripScopeRefinement(
      persisted.tripScope,
      "Skip Canyonlands and don't return to the start."
    );
    expect(refined.routeShape).toBe('one_way');
    const names = (refined.destinations || []).map((d) =>
      String(d.displayName || d.parkCode || '').toLowerCase()
    );
    expect(names.some((n) => n.includes('canyonlands'))).toBe(false);
    const legKeys = (refined.routeLegs || []).map(
      (l) => `${l.fromEntityId}->${l.toEntityId}`
    );
    expect(legKeys.every((k) => !k.toLowerCase().includes('canyonlands'))).toBe(true);

    const saved = resolvePlanningStateForWrite({
      incomingPlanningState: buildPlanningStateFromRuntime({
        constraints: { ...first, tripScope: refined },
        previous: persisted,
      }),
      previousPlanningState: persisted,
      conversation: [
        { role: 'user', content: 'Road trip from Denver visiting Arches, Canyonlands, and Capitol Reef as a loop.' },
        { role: 'user', content: "Skip Canyonlands and don't return to the start." },
      ],
    });
    const reloaded = parseConstraints({ planningState: saved, formData: {} }, '');
    expect(reloaded.tripScope.routeShape).toBe('one_way');
    expect(
      (reloaded.tripScope.destinations || []).some((d) =>
        String(d.displayName || '').toLowerCase().includes('canyonlands')
      )
    ).toBe(false);
  });

  test('CASE K — latest override patches multiple fields', () => {
    const { saved, reloaded } = saveThenReload(
      '3-day trip, hotel, budget $1000.',
      'Actually 4 days, camp, under $700.'
    );
    expect(saved.dates.durationDays).toBe(4);
    expect(saved.lodging.type).toMatch(/camp/i);
    expect(saved.budgetConstraint.amount).toBe(700);
    expect(reloaded.dates.numDays).toBe(4);
    expect(reloaded.accommodation).toMatch(/camp/i);
    expect(Number(reloaded.budgetConstraint.amount)).toBe(700);
  });

  test('CASE L — untouched fields survive interest-only change', () => {
    const { saved, reloaded } = saveThenReload(
      'Family of 4 with 2 kids, camping, budget $800, hiking and wildlife.',
      'Add photography.'
    );
    expect(saved.travelers.travelParty).toBe('family');
    expect(saved.travelers.count).toBe(4);
    expect(saved.travelers.childrenCount).toBe(2);
    expect(saved.lodging.type).toMatch(/camp/i);
    expect(saved.budgetConstraint.amount).toBe(800);
    expect(saved.preferences.interests).toEqual(
      expect.arrayContaining(['hiking', 'wildlife', 'photography'])
    );
    expect(reloaded.travelParty).toBe('family');
    expect(reloaded.childrenCount).toBe(2);
    expect(reloaded.budgetConstraint.amount).toBe(800);
  });

  test('CASE M — legacy trip without planningState', () => {
    const constraints = parseConstraints(
      {
        formData: {
          parkCode: 'zion',
          groupSize: 2,
          accommodation: 'hotel',
          interests: ['hiking'],
          budget: '500',
        },
      },
      'Couple trip, easy hikes.'
    );
    expect(constraints.groupSize).toBe(2);
    expect(constraints.hasConstraints).toBe(true);
    const tripState = buildTripState({
      metadata: { formData: { parkCode: 'zion', groupSize: 2 } },
      constraints,
      savedTripPlan: { parkCode: 'zion', parkName: 'Zion National Park', formData: { groupSize: 2 } },
      lastUserMessage: 'Couple trip, easy hikes.',
    });
    expect(tripState.destination.parkCode).toBe('zion');
    expect(tripState.travelers.count).toBe(2);
  });

  test('CASE N — malformed state fails safe', () => {
    const n = normalizePersistedPlanningState({
      schemaVersion: PLANNING_STATE_SCHEMA_VERSION,
      travelers: { travelParty: 'dinosaurs', count: -5, childrenCount: 99 },
      preferences: { pace: 'teleport', interests: ['hiking', '!!!'] },
      tripScope: { type: 'road_trip', routeShape: 'teleport', destinations: [] },
    });
    expect(n.ok).toBe(true);
    expect(n.state.travelers.travelParty).toBeNull();
    expect(n.state.travelers.count).toBeNull();
    expect(n.state.preferences.pace).toBeNull();
    expect(n.state.tripScope.routeShape).toBe('unknown');
    expect(() =>
      parseConstraints({ planningState: n.state, formData: {} }, '')
    ).not.toThrow();
  });

  test('CASE O — unknown schema version', () => {
    const n = normalizePersistedPlanningState({
      schemaVersion: 'future-v99',
      travelers: { travelParty: 'family', count: 4 },
    });
    expect(n.ok).toBe(false);
    expect(n.reason).toBe('unknown_schema_version');
    // Compatibility: ignore invalid snapshot, fall back to formData
    const c = parseConstraints(
      {
        planningState: { schemaVersion: 'future-v99', travelers: { count: 4 } },
        formData: { groupSize: 2 },
      },
      ''
    );
    expect(c.groupSize).toBe(2);
  });

  test('CASE P — evidence exclusion', () => {
    const dirty = {
      schemaVersion: PLANNING_STATE_SCHEMA_VERSION,
      travelers: { count: 2, travelParty: 'couple' },
      evidenceBundle: { weather: true },
      weather: { temp: 70 },
      budgetAssessment: { status: 'ok' },
      alerts: [],
    };
    const n = normalizePersistedPlanningState(dirty);
    expect(n.ok).toBe(true);
    expect(n.state.evidenceBundle).toBeUndefined();
    expect(n.state.weather).toBeUndefined();
    expect(n.state.budgetAssessment).toBeUndefined();
    expect(planningStateContainsEvidence(dirty)).toBe(true);
    expect(planningStateContainsEvidence(n.state)).toBe(false);

    const built = buildPlanningStateFromRuntime({
      constraints: parseConstraints({}, 'Couple, camping, $400 budget.'),
    });
    expect(built.budgetAssessment).toBeUndefined();
    expect(built.evidenceBundle).toBeUndefined();
  });

  test('CASE Q — user-supplied cost survives once', () => {
    const { saved, reloaded } = saveThenReload(
      'Hotel already booked for $450. Camping otherwise.'
    );
    const costs = saved.userSuppliedCosts || [];
    expect(costs.some((c) => c.basis === 'user_supplied' && Number(c.amountMin) === 450)).toBe(
      true
    );
    expect(
      (reloaded.costComponents || []).filter(
        (c) => c.basis === 'user_supplied' && Number(c.amountMin) === 450
      ).length
    ).toBe(1);
  });

  test('CASE R — single-park backward compat', () => {
    const c = parseConstraints(
      { formData: { parkCode: 'arch', numDays: 2, groupSize: 2 } },
      '2-day trip for a couple.'
    );
    expect(c.parkCode).toBe('arch');
    expect(c.groupSize).toBe(2);
    expect(c.dates.numDays).toBe(2);
    const state = buildTripState({
      metadata: { formData: { parkCode: 'arch' } },
      constraints: c,
      lastUserMessage: '2-day trip for a couple.',
    });
    expect(state.destination.parkCode).toBe('arch');
  });

  test('CASE S — multi-turn save: rev2 authoritative', () => {
    const rev1 = parseConstraints({}, 'Family of 4, budget $1000, hiking.');
    const s1 = buildPlanningStateFromRuntime({ constraints: rev1 });
    const rev2 = parseConstraints(
      { planningState: s1 },
      'Add photography and make the budget $700.'
    );
    const s2 = buildPlanningStateFromRuntime({ constraints: rev2, previous: s1 });
    const written = resolvePlanningStateForWrite({
      incomingPlanningState: s2,
      previousPlanningState: s1,
      conversation: [
        { role: 'user', content: 'Family of 4, budget $1000, hiking.' },
        { role: 'user', content: 'Add photography and make the budget $700.' },
      ],
    });
    expect(written.budgetConstraint.amount).toBe(700);
    expect(written.preferences.interests).toEqual(
      expect.arrayContaining(['hiking', 'photography'])
    );
    expect(written.travelers.count).toBe(4);
    const reloaded = parseConstraints({ planningState: written }, '');
    expect(reloaded.budgetConstraint.amount).toBe(700);
    expect(reloaded.interests).toContain('photography');
  });

  test('CASE T — write resolves once; schema version stamped', () => {
    const c = parseConstraints({}, 'Solo camping trip, budget $400.');
    const a = resolvePlanningStateForWrite({
      incomingPlanningState: c.planningState,
      conversation: [{ role: 'user', content: 'Solo camping trip, budget $400.' }],
    });
    const b = resolvePlanningStateForWrite({
      incomingPlanningState: a,
      previousPlanningState: a,
      conversation: [{ role: 'user', content: 'Solo camping trip, budget $400.' }],
    });
    expect(a.schemaVersion).toBe(PLANNING_STATE_SCHEMA_VERSION);
    expect(b.schemaVersion).toBe(PLANNING_STATE_SCHEMA_VERSION);
    expect(b.budgetConstraint.amount).toBe(a.budgetConstraint.amount);
    expect(b.travelers.travelParty).toBe('solo');
  });

  test('emptyPlanningState has required shape', () => {
    const e = emptyPlanningState();
    expect(e.schemaVersion).toBe(PLANNING_STATE_SCHEMA_VERSION);
    expect(e.travelers).toBeDefined();
    // P1-1: null = field absent (legacy fallback allowed); [] = explicit empty.
    expect(e.preferences.interests).toBeNull();
  });

  test('planningStateToConstraintSeed maps party/budget/interests', () => {
    const seed = planningStateToConstraintSeed({
      schemaVersion: PLANNING_STATE_SCHEMA_VERSION,
      travelers: { count: 4, travelParty: 'family', hasChildren: true, childrenCount: 2 },
      preferences: { interests: ['hiking'], pace: 'relaxed' },
      budgetConstraint: {
        kind: 'numeric',
        amount: 800,
        scope: 'trip_total',
        currency: 'USD',
        explicit: true,
        cleared: false,
      },
      lodging: { type: 'camping' },
    });
    expect(seed.travelParty).toBe('family');
    expect(seed.groupSize).toBe(4);
    expect(seed.childrenCount).toBe(2);
    expect(seed.interests).toContain('hiking');
    expect(seed.pace).toBe('relaxed');
    expect(seed.budgetConstraint.amount).toBe(800);
  });
});
