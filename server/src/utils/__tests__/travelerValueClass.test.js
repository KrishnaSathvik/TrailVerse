'use strict';

/**
 * ATTEMPT-1 QUALITY (2026-09-02) — generic traveler-value semantics.
 *
 * Diagnosis (artifacts/trailie-attempt1-quality-2026-09-02): evidence bundles
 * are rich (Badlands 38 primary experiences, Olympic 130) but the architect's
 * offered window is tiny (6–19 blocks) and ranking had NO traveler-value
 * dimension — an NPS "[Sign] … Wayside" place candidate outranked real named
 * activities, so a Day-2 refinement pool was 18 wayside signs + 1 trailhead,
 * and Badlands offered 6 of 93 candidates while the model back-filled the rest
 * from world knowledge (out of catalogue).
 *
 * This classifier is GENERIC: name/activity-type semantics, no park-specific
 * rules. "Evidence-backed place" ≠ "worth putting in someone's vacation".
 */

const { travelerValueClass, VALUE_CLASS } = require('../travelerValueClass');

const klass = (name, activityTypes = [], topic = 'activities') =>
  travelerValueClass({ name, activityTypes, topic });

describe('MICRO_POI — informational objects never masquerade as experiences', () => {
  test.each([
    ['[Sign] Age of the Forest Wayside #258f'],
    ['[Sign] Granite Story Wayside #12x'],
    ['Riverbend Interpretive Panel'],
    ['Summit Elevation Marker'],
    ['Old Faithful Historic Plaque'],
    ['Trailhead Information Kiosk'],
    ['Milepost 17 Pullout Sign'],
  ])('%s', (name) => {
    expect(klass(name)).toBe(VALUE_CLASS.MICRO_POI);
  });

  test('a wayside that mentions a trail is still a sign, not a trail', () => {
    expect(klass('[Sign] Marymere Falls Trail Wayside #100a')).toBe(VALUE_CLASS.MICRO_POI);
  });
});

describe('LOGISTICS', () => {
  test.each([
    ['Wilderness Access Parking Area'],
    ['Storm King Shuttle Hub'],
    ['South Entrance Station'],
    ['Ferry Terminal Dock'],
  ])('%s', (name) => {
    expect(klass(name)).toBe(VALUE_CLASS.LOGISTICS);
  });
});

describe('REST', () => {
  test('picnic areas are rest, not destination experiences', () => {
    expect(klass('East Beach Picnic Area')).toBe(VALUE_CLASS.REST);
  });
});

describe('SUPPORTING_EXPERIENCE', () => {
  test.each([
    ['Ben Reifel Visitor Center', ['visitor_center', 'exhibits']],
    ['Hoh Rain Forest Visitor Center', []],
    ['Zion Human History Museum', []],
    ['Kalaloch Ranger Station', []],
    ['Lake Crescent Lodge', []],
    ['Hurricane Ridge Visitor Contact Station', []],
    ['Badlands Amphitheater', []],
  ])('%s', (name, types) => {
    expect(klass(name, types)).toBe(VALUE_CLASS.SUPPORTING_EXPERIENCE);
  });
});

describe('PRIMARY_EXPERIENCE', () => {
  test.each([
    ['Yellow Mounds Overlook', []],
    ['Fernline Trail', ['hiking']],
    ['Copper Basin Overlook', []],
    ['Madison Falls', []],
    ['Drive Badlands Loop Road (Highway 240)', ['scenic_drive']],
    ['Hall of Mosses Trail', ['hiking']],
    ['Sunrise Point', ['photography']],
    ['Windswept Dunes Boardwalk', []],
  ])('%s', (name, types) => {
    expect(klass(name, types)).toBe(VALUE_CLASS.PRIMARY_EXPERIENCE);
  });

  test('activity types can make an unnamed-pattern candidate primary', () => {
    expect(klass('Go to the Beach', ['beach_walking'])).toBe(VALUE_CLASS.PRIMARY_EXPERIENCE);
    expect(klass('Stargazing Program', ['stargazing'])).toBe(VALUE_CLASS.PRIMARY_EXPERIENCE);
  });
});

describe('UNKNOWN stays unknown', () => {
  test('no signal → UNKNOWN, never a guess', () => {
    expect(klass('Chapter 7 Land Deed Record', [])).toBe(VALUE_CLASS.UNKNOWN);
    expect(klass('', [])).toBe(VALUE_CLASS.UNKNOWN);
    expect(klass(null, [])).toBe(VALUE_CLASS.UNKNOWN);
  });
});
