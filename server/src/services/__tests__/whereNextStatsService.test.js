'use strict';

const {
  volumeTier,
  publicLeadersAllowed,
  countsAllowed,
} = require('../whereNextStatsService');

describe('whereNextStatsService volume floors', () => {
  it('treats 12 votes as early (no public leaderboard)', () => {
    expect(volumeTier(12)).toBe('early');
    expect(publicLeadersAllowed('early')).toBe(false);
    expect(countsAllowed('early')).toBe(false);
  });

  it('uses growing for 50–199', () => {
    expect(volumeTier(50)).toBe('growing');
    expect(volumeTier(199)).toBe('growing');
    expect(publicLeadersAllowed('growing')).toBe(false);
  });

  it('allows ranked names at 200 without counts', () => {
    expect(volumeTier(200)).toBe('healthy');
    expect(publicLeadersAllowed('healthy')).toBe(true);
    expect(countsAllowed('healthy')).toBe(false);
  });

  it('allows counts at 1000+', () => {
    expect(volumeTier(1000)).toBe('large');
    expect(countsAllowed('large')).toBe(true);
  });
});
