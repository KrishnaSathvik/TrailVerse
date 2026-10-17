'use strict';

const { emptyPlanningState } = require('../../utils/planningState');
const {
  commitUnderstoodTripChange,
  isConfirmedLodgingBooking,
} = require('../tripMutationCommit');
const { resolveTravelerJob } = require('../trailieTravelerJobResolver');

function stateWithZion() {
  const state = emptyPlanningState();
  state.destination.parkName = 'Zion';
  state.dates.startDate = '2026-09-12';
  state.dates.endDate = '2026-09-17';
  state.dates.durationDays = 4;
  return state;
}

describe('trip mutation commit', () => {
  test('a committed booking can move without treating an alternative question as a move', () => {
    const prior = commitUnderstoodTripChange({ message: 'We booked a hotel in Springdale.', planningState: stateWithZion() }).planningState;
    const exploratory = commitUnderstoodTripChange({ message: 'Could St. George still make sense?', planningState: prior });
    expect(exploratory.planningState.lodging.baseTown).toBe('Springdale');
    const moved = commitUnderstoodTripChange({ message: 'Actually, we changed the booking to St. George.', planningState: prior });
    expect(moved.planningState.lodging).toMatchObject({ baseTown: 'St. George', booked: true, type: 'hotel' });
    expect(prior.lodging.baseTown).toBe('Springdale');
    expect(commitUnderstoodTripChange({ message: 'We changed the booking to Denver.', planningState: stateWithZion() }).committed).toBe(false);
  });
  test('a confirmed Springdale booking is stored as the booked base', () => {
    const result = commitUnderstoodTripChange({
      message: 'We booked a hotel in Springdale.',
      planningState: stateWithZion(),
    });
    expect(result.committed).toBe(true);
    expect(result.planningState.lodging).toMatchObject({
      type: 'hotel',
      baseTown: 'Springdale',
      booked: true,
    });
  });

  test('already booked a place commits lodging base without inventing a property', () => {
    const result = commitUnderstoodTripChange({
      message: 'We already booked a place in Springdale.',
      planningState: stateWithZion(),
    });
    expect(result.committed).toBe(true);
    expect(result.planningState.lodging).toMatchObject({
      type: 'lodging',
      stayPreference: null,
      baseTown: 'Springdale',
      booked: true,
    });
    expect(result.planningState.lodging.type).not.toBe('hotel');
    expect(result.planningState.lodging).not.toHaveProperty('propertyName');
    expect(result.planningState.lodging).not.toHaveProperty('address');
  });

  test('generic lodging phrases commit without hotel inference', () => {
    for (const message of [
      "We're staying in Springdale.",
      'Our hotel is in Springdale.',
      'We booked lodging in Moab.',
    ]) {
      const result = commitUnderstoodTripChange({
        message,
        planningState: stateWithZion(),
      });
      expect(result.committed).toBe(true);
      expect(result.planningState.lodging.booked).toBe(true);
      expect(result.planningState.lodging.baseTown).toMatch(/Springdale|Moab/);
      if (/hotel is in/i.test(message)) {
        expect(result.planningState.lodging.type).toBe('hotel');
      } else {
        expect(result.planningState.lodging.type).toBe('lodging');
        expect(result.planningState.lodging.stayPreference).toBeNull();
      }
    }
  });

  test('a hypothetical stay is not committed', () => {
    const prior = stateWithZion();
    const result = commitUnderstoodTripChange({
      message: 'What if we stayed in Springdale?',
      planningState: prior,
    });
    expect(result.committed).toBe(false);
    expect(result.planningState.lodging.booked).toBeNull();
    expect(isConfirmedLodgingBooking('Maybe we could stay in Springdale.')).toBe(false);
  });

  test('an explicit four-day request materializes draft days before any answer', () => {
    const result = commitUnderstoodTripChange({
      message: "We're going to Zion September 12–17. Give me four days.",
      planningState: stateWithZion(),
      hasExistingPlan: false,
    });
    expect(result.planningState.draftPlan.days).toHaveLength(4);
    expect(result.planningState.draftPlan.days[1].status).toBe('draft');
    expect(result.planningState.draftPlan.days[1].stops).toEqual([]);
  });

  test('sunrise photography and exposure survive as committed facts', () => {
    const exposure = commitUnderstoodTripChange({
      message: "My girlfriend doesn't like scary exposed hikes.",
      planningState: stateWithZion(),
    });
    const photo = commitUnderstoodTripChange({
      message: 'I really want sunrise photography.',
      planningState: exposure.planningState,
    });
    expect(photo.planningState.preferences.avoidExposure).toBe(true);
    expect(photo.planningState.activityPreferences).toMatchObject({
      photography: true,
      photographyTiming: 'sunrise',
    });
  });

  test('a lodging booking is not classified as a permit question', () => {
    const job = resolveTravelerJob({ userPrompt: 'We booked a hotel in Springdale.' });
    expect(job.job).not.toBe('permits_reservations');
  });

  test('a compare does not create a trip mutation', () => {
    const result = commitUnderstoodTripChange({
      message: 'Is Acadia or Shenandoah better for fall colors?',
      planningState: emptyPlanningState(),
    });
    expect(result.committed).toBe(false);
  });
});


test('changing a lodging identity invalidates all old geographic authority', () => {
  const prior = stateWithZion();
  prior.lodging = { type: 'hotel', booked: true, baseTown: 'Old Base', lat: 38, lon: -110,
    stateOrRegion: 'Old Region', country: 'US', resolutionStatus: 'resolved', resolutionSource: 'old' };
  for (const message of ['We moved our booking to New Base.', 'We booked a room in New Base and prefer quiet evenings.']) {
    const result = commitUnderstoodTripChange({ message, planningState: prior });
    expect(result.planningState.lodging).toMatchObject({ baseTown: 'New Base', lat: null, lon: null,
      stateOrRegion: null, country: null, resolutionStatus: 'unresolved', resolutionSource: null });
    expect(prior.lodging.lat).toBe(38);
  }
});
test('photography polarity is preserved at the fact transition boundary', () => {
  const prior = stateWithZion();
  prior.activityPreferences = { photography: true, photographyTiming: 'sunrise' };
  const result = commitUnderstoodTripChange({ message: "I don't like sunrise photography.", planningState: prior });
  expect(result.planningState.activityPreferences.photographyTiming).toBeNull();
  expect(result.planningState.activityPreferences.excludedPhotographyTimings).toContain('sunrise');
  expect(result.planningState.preferences.interests || []).not.toContain('photography');
  expect(prior.activityPreferences.photographyTiming).toBe('sunrise');
});
test('only a resolution bound to the new lodging identity may populate geography', () => {
  const result = commitUnderstoodTripChange({ message: 'We booked a place in New Base.', planningState: stateWithZion(),
    lodgingResolution: { baseTown: 'Old Base', place: { resolutionStatus: 'resolved', lat: 38, lon: -110 } } });
  expect(result.planningState.lodging.lat).toBeNull();
});
