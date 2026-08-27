'use strict';

jest.mock('../../models/DestinationPick', () => {
  const fn = jest.fn();
  fn.TRAVEL_WINDOWS = [
    'fall_2026',
    'winter_2026_27',
    'spring_2027',
    'summer_2027',
    'someday',
  ];
  fn.findOne = jest.fn();
  fn.findOneAndUpdate = jest.fn();
  fn.countDocuments = jest.fn();
  fn.aggregate = jest.fn();
  return fn;
});

jest.mock('../parkSearchService', () => ({
  executeParkSearch: jest.fn(),
}));

jest.mock('../../catalog/parkCatalog', () => ({
  loadCanonicalParks: jest.fn(),
}));

const DestinationPick = require('../../models/DestinationPick');
const { executeParkSearch } = require('../parkSearchService');
const { loadCanonicalParks } = require('../../catalog/parkCatalog');
const { upsertPick, buildStats } = require('../whereNextPickService');

function pickDoc(over = {}) {
  return {
    sessionId: 'session-abc-123',
    rawInput: 'Yosemite',
    normalizedText: 'yosemite',
    parkCode: 'yose',
    canonicalType: 'nps',
    canonicalName: 'Yosemite National Park',
    travelWindow: null,
    source: null,
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  DestinationPick.countDocuments.mockResolvedValue(12);
  DestinationPick.aggregate.mockResolvedValue([]);
  DestinationPick.findOne.mockResolvedValue(null);
});

describe('upsertPick — one active destination', () => {
  it('replaces Yosemite with Italy so Yosemite is no longer the active pick (AE5)', async () => {
    executeParkSearch.mockResolvedValue({ parks: [] });
    DestinationPick.findOne.mockResolvedValue(pickDoc());
    DestinationPick.findOneAndUpdate.mockResolvedValue(
      pickDoc({
        rawInput: 'Italy',
        normalizedText: 'italy',
        parkCode: null,
        canonicalType: null,
        canonicalName: null,
      })
    );

    const result = await upsertPick({
      sessionId: 'session-abc-123',
      rawInput: 'Italy',
    });

    expect(result.changed).toBe(true);
    expect(result.pick.parkCode).toBeNull();
    expect(result.pick.displayName).toBe('Italy');
    const update = DestinationPick.findOneAndUpdate.mock.calls[0][1];
    expect(update.$unset.parkCode).toBe(1);
    expect(update.$set.normalizedText).toBe('italy');
    expect(update.$set.travelWindow).toBeNull();
  });
});

describe('buildStats — public rankings', () => {
  it('does not expose a numbered leaderboard at 12 votes (AE3)', async () => {
    DestinationPick.countDocuments.mockResolvedValue(12);
    const stats = await buildStats({ parkCode: 'yose' });
    expect(stats.volumeTier).toBe('early');
    expect(stats.leaders).toEqual([]);
    expect(DestinationPick.aggregate).not.toHaveBeenCalled();
  });

  it('omits unmatched free-text rows from leaders (AE4)', async () => {
    DestinationPick.countDocuments.mockResolvedValue(250);
    DestinationPick.aggregate.mockResolvedValue([
      { _id: 'yose', count: 40, canonicalName: 'Yosemite National Park' },
      { _id: 'glac', count: 22, canonicalName: 'Glacier National Park' },
    ]);
    const stats = await buildStats({});
    expect(stats.leaders.map((row) => row.parkCode)).toEqual(['yose', 'glac']);
    expect(stats.leaders.some((row) => /banff/i.test(row.name || ''))).toBe(false);
  });
});
