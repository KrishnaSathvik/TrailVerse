'use strict';

const reliableAstronomicalService = require('../reliableAstronomicalService');

describe('reliableAstronomicalService moon phase', () => {
  test('July 1 2026 matches astronomicalService waning gibbous', () => {
    const moon = reliableAstronomicalService.calculateMoonPhase(new Date('2026-07-01T12:00:00'));
    expect(moon.moonPhase).toBe('Waning Gibbous');
    expect(moon.moonIllumination).toBeGreaterThan(85);
  });
});
