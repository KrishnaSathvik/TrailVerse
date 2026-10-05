'use strict';

/**
 * Exact Demo Q2 — parent park vs subordinate place identity.
 * Offline only. No destination-specific production branches under test.
 */

const {
  extractAllParksFromMessage,
  extractParkFromMessage,
  PARK_NAME_TO_CODE,
} = require('../parkExtractor');
const {
  resolveDestinationsFromMessage,
} = require('../genericDestinationResolver');

const Q2 =
  "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?";

describe('parent park vs subordinate place identity', () => {
  test('landmark catalog entries are marked subordinate (kind=landmark)', () => {
    expect(PARK_NAME_TO_CODE.get('logan pass')?.kind).toBe('landmark');
    expect(PARK_NAME_TO_CODE.get('angels landing')?.kind).toBe('landmark');
    expect(PARK_NAME_TO_CODE.get('glacier point')?.kind).toBe('landmark');
    expect(PARK_NAME_TO_CODE.get('glacier')?.kind).not.toBe('landmark');
    expect(PARK_NAME_TO_CODE.get('zion')?.kind).not.toBe('landmark');
  });

  test('A — Glacier + Logan Pass: Glacier remains primary; Logan Pass is subordinate', () => {
    const parks = extractAllParksFromMessage(
      'One day in Glacier; backup if Logan Pass is unavailable'
    );
    expect(parks).toHaveLength(1);
    expect(parks[0].parkCode).toBe('glac');
    expect(parks[0].parkName).toMatch(/^Glacier(\s+National\s+Park)?$/i);
    expect(parks[0].parkName).not.toMatch(/logan pass/i);
    expect(parks[0].mentionedPlaces?.map((p) => p.name.toLowerCase())).toEqual(
      expect.arrayContaining(['logan pass'])
    );

    const dests = resolveDestinationsFromMessage(Q2);
    expect(dests).toHaveLength(1);
    expect(dests[0].parkCode).toBe('glac');
    expect(dests[0].displayName).toMatch(/^Glacier(\s+National\s+Park)?$/i);
    expect(dests[0].displayName).not.toMatch(/logan pass/i);
    expect(dests[0].mentionedPlaces?.map((p) => String(p.name).toLowerCase())).toEqual(
      expect.arrayContaining(['logan pass'])
    );
  });

  test('B — Logan Pass alone may be focal subject with Glacier park context', () => {
    const parks = extractAllParksFromMessage('Is Logan Pass open?');
    expect(parks).toHaveLength(1);
    expect(parks[0].parkCode).toBe('glac');
    expect(parks[0].parkName).toMatch(/logan pass/i);
    // Focal place — not forced to generic Glacier identity.
    expect(parks[0].focalPlace).toBe(true);
  });

  test('C — day around Logan Pass keeps Logan Pass as focal place', () => {
    const parks = extractAllParksFromMessage('Plan a day around Logan Pass');
    expect(parks[0].parkCode).toBe('glac');
    expect(parks[0].parkName).toMatch(/logan pass/i);
    expect(parks[0].focalPlace).toBe(true);
  });

  test('D — Zion remains primary when Angels Landing is an avoidance subject', () => {
    const parks = extractAllParksFromMessage('Plan Zion, but avoid Angels Landing');
    expect(parks).toHaveLength(1);
    expect(parks[0].parkCode).toBe('zion');
    expect(parks[0].parkName).toMatch(/^Zion(\s+National\s+Park)?$/i);
    expect(parks[0].parkName).not.toMatch(/angels landing/i);
    expect(parks[0].mentionedPlaces?.map((p) => p.name.toLowerCase())).toEqual(
      expect.arrayContaining(['angels landing'])
    );
  });

  test('E — Yosemite remains destination when Glacier Point is included', () => {
    // "glacier point" is a Yosemite landmark; must not steal identity via "glacier" park key either.
    const parks = extractAllParksFromMessage('Plan Yosemite and include Glacier Point');
    const yose = parks.find((p) => p.parkCode === 'yose');
    expect(yose).toBeTruthy();
    expect(yose.parkName).toMatch(/^Yosemite(\s+National\s+Park)?$/i);
    expect(yose.parkName).not.toMatch(/glacier point/i);
    expect(yose.mentionedPlaces?.map((p) => p.name.toLowerCase())).toEqual(
      expect.arrayContaining(['glacier point'])
    );
    // Must not invent a separate Glacier NP destination from the "Glacier Point" phrase alone
    // when Yosemite + Glacier Point are the ask.
    const glac = parks.find((p) => p.parkCode === 'glac');
    expect(glac).toBeFalsy();
  });

  test('singular extractParkFromMessage prefers park identity over longer landmark alias', () => {
    const hit = extractParkFromMessage(Q2);
    expect(hit.parkCode).toBe('glac');
    expect(hit.parkName).toMatch(/^Glacier(\s+National\s+Park)?$/i);
  });
});
