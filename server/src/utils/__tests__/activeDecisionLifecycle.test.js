'use strict';

const { emptyPlanningState, stampLastTravelerJob } = require('../planningState');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { buildClassifierPriorTripState } = require('../../services/trailieV2RouteBridge');

function advance(state, prompt, extra = {}) {
  const priorTripState = {
    hasActiveTrip: true,
    hasItinerary: extra.hasItinerary === true,
    lastTravelerJob: state.lastTravelerJob,
    activeDecision: state.activeDecision,
  };
  const resolved = resolveTravelerJob({ userPrompt: prompt, priorTripState });
  return {
    resolved,
    state: stampLastTravelerJob(state, resolved.job),
  };
}

describe('activeDecision lifecycle', () => {
  test('a successful airport decision supersedes duration and owns an origin follow-up', () => {
    let state = stampLastTravelerJob(emptyPlanningState(), 'trip_duration_advice');
    expect(state.activeDecision.kind).toBe('trip_duration_advice');

    state = stampLastTravelerJob(state, 'airport_strategy');
    expect(state.lastTravelerJob).toBe('airport_strategy');
    expect(state.activeDecision.kind).toBe('airport_strategy');

    const prior = buildClassifierPriorTripState({ planningState: state });
    const followUp = resolveTravelerJob({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: prior,
    });
    expect(followUp.job).toBe('origin_refinement');

    const afterFollowUp = stampLastTravelerJob(state, followUp.job);
    expect(afterFollowUp.lastTravelerJob).toBe('origin_refinement');
    expect(afterFollowUp.activeDecision.kind).toBe('airport_strategy');
  });

  test.each([
    ['Where should I stay?', 'lodging_strategy', 'Closer to the east entrance.', 'lodging_strategy'],
    ['Which campground?', 'campground_strategy', 'We have a 28-foot RV.', 'campground_strategy'],
    ['Which airport?', 'airport_strategy', "We're flying from Chicago.", 'origin_refinement'],
  ])('%s owns compatible follow-up %s', (first, firstJob, followUp, followJob) => {
    let state = emptyPlanningState();
    const firstTurn = advance(state, first);
    expect(firstTurn.resolved.job).toBe(firstJob);
    state = firstTurn.state;
    const next = advance(state, followUp);
    expect(next.resolved.job).toBe(followJob);
    expect(next.state.activeDecision.kind).toBe(firstJob);
  });

  test('itinerary owns a slower follow-up while the semantic job becomes refinement', () => {
    let state = stampLastTravelerJob(emptyPlanningState(), 'day_by_day_itinerary');
    const next = advance(state, 'Actually make it slower.', { hasItinerary: true });
    expect(next.resolved.job).toBe('itinerary_refinement');
    expect(next.state.lastTravelerJob).toBe('itinerary_refinement');
    expect(next.state.activeDecision.kind).toBe('day_by_day_itinerary');
  });
});
