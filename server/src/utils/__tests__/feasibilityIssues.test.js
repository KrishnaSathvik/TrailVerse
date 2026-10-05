'use strict';

const {
  validateItineraryFeasibility,
  feasibilityIssuesToMessages,
} = require('../extractItineraryJSON');

const GEO = 'geocoder';

describe('validateItineraryFeasibility — structured issues', () => {
  it('returns structured issues with the required shape', () => {
    const itinerary = {
      days: [
        {
          dayNumber: 1,
          label: 'Day 1',
          stops: [
            { id: 's1', type: 'trail', duration: 600, drivingTimeFromPreviousMin: 300 },
            { id: 's2', type: 'trail', duration: 600, drivingTimeFromPreviousMin: 0 },
          ],
        },
      ],
    };
    const issues = validateItineraryFeasibility(itinerary);
    expect(issues.length).toBeGreaterThan(0);
    const issue = issues[0];
    expect(issue).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: expect.any(String),
        severity: expect.any(String),
        message: expect.any(String),
        basis: expect.any(String),
      })
    );
    expect(issue).toHaveProperty('dayNumber');
    expect(issue).toHaveProperty('stopIds');
  });

  it('flags an excessively long day', () => {
    const issues = validateItineraryFeasibility({
      days: [{ dayNumber: 1, label: 'Day 1', stops: [
        { id: 'a', type: 'trail', duration: 700, drivingTimeFromPreviousMin: 300 },
        { id: 'b', type: 'trail', duration: 200, drivingTimeFromPreviousMin: 60 },
      ] }],
    });
    expect(issues.some((i) => i.type === 'excessive_activity')).toBe(true);
  });

  it('skips distance checks when coordinates are missing without presenting an engineering warning', () => {
    const issues = validateItineraryFeasibility({
      days: [{ dayNumber: 1, label: 'Day 1', stops: [
        { id: 'a', type: 'trail', duration: 60 },
        { id: 'b', type: 'trail', duration: 60 },
        { id: 'c', type: 'trail', duration: 60 },
      ] }],
    });
    const notice = issues.find((i) => i.type === 'insufficient_coordinates');
    expect(notice).toBeUndefined();
    // No backtracking claim can be made without coordinates.
    expect(issues.some((i) => i.type === 'backtracking')).toBe(false);
  });

  it('never computes distance from fabricated 0,0 defaults', () => {
    const issues = validateItineraryFeasibility({
      days: [
        { dayNumber: 1, label: 'Day 1', stops: [
          { id: 'a', latitude: 0, longitude: 0 },
          { id: 'b', latitude: 0, longitude: 0 },
        ] },
        { dayNumber: 2, label: 'Day 2', stops: [
          { id: 'c', latitude: 0, longitude: 0 },
        ] },
      ],
    });
    // 0,0 is not usable → no overnight-distance failure fabricated.
    expect(issues.some((i) => i.type === 'unrealistic_overnight')).toBe(false);
  });

  it('detects a real backtrack with trusted coordinates', () => {
    const issues = validateItineraryFeasibility({
      days: [{ dayNumber: 1, label: 'Day 1', stops: [
        { id: 'a', name: 'A', latitude: 37.0, longitude: -113.0, coordinateSource: GEO },
        { id: 'b', name: 'B', latitude: 37.5, longitude: -113.0, coordinateSource: GEO },
        { id: 'c', name: 'C', latitude: 37.02, longitude: -113.0, coordinateSource: GEO },
      ] }],
    });
    expect(issues.some((i) => i.type === 'backtracking')).toBe(true);
  });

  it('feasibilityIssuesToMessages projects to plain strings', () => {
    const issues = validateItineraryFeasibility({
      days: [{ dayNumber: 1, label: 'Day 1', stops: [
        { id: 'a', type: 'trail', duration: 700, drivingTimeFromPreviousMin: 300 },
        { id: 'b', type: 'trail', duration: 200, drivingTimeFromPreviousMin: 60 },
      ] }],
    });
    const msgs = feasibilityIssuesToMessages(issues);
    expect(msgs.every((m) => typeof m === 'string')).toBe(true);
  });

  it('issue ids are stable and dedupable across re-runs', () => {
    const itinerary = {
      days: [{ dayNumber: 1, label: 'Day 1', stops: [
        { id: 'a', type: 'trail', duration: 700, drivingTimeFromPreviousMin: 300 },
        { id: 'b', type: 'trail', duration: 200, drivingTimeFromPreviousMin: 60 },
      ] }],
    };
    const first = validateItineraryFeasibility(itinerary).map((i) => i.id);
    const second = validateItineraryFeasibility(itinerary).map((i) => i.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length); // no duplicate ids
  });
});
