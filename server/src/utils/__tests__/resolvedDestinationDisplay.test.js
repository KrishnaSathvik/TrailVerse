'use strict';

const { resolveDestinationDisplayName } = require('../resolvedDestinationDisplay');

describe('resolved destination display metadata', () => {
  test('unrelated message text cannot rewrite an active Mount Rainier destination', () => {
    expect(resolveDestinationDisplayName({
      resolvedMetadata: { parkName: 'Mount Rainier National Park', parkCode: 'mora' },
      activeTripContext: {
        primaryDestination: { name: 'Mount Rainier National Park', parkCode: 'mora' },
      },
      userText: 'Which glacier viewpoints are easiest to reach?',
    })).toBe('Mount Rainier National Park');
  });

  test.each([
    ['Glacier National Park', 'glac'],
    ['Sequoia National Park', 'sequ'],
    ['Olympic National Park', 'olym'],
    ['Badlands National Park', 'badl'],
    ['Crater Lake National Park', 'crla'],
    ['Lake Mead National Recreation Area', 'lake'],
  ])('preserves the generic resolved entity display name: %s', (parkName, parkCode) => {
    expect(resolveDestinationDisplayName({
      resolvedMetadata: { parkName, parkCode },
    })).toBe(parkName);
  });

  test('does not promote a stop-like extracted name over the active resolved entity', () => {
    expect(resolveDestinationDisplayName({
      resolvedMetadata: {},
      allExtractedParks: [{ parkName: 'Glacier Viewpoint' }],
      activeTripContext: {
        primaryDestination: { name: 'Mount Rainier National Park', parkCode: 'mora' },
      },
    })).toBe('Mount Rainier National Park');
  });
});
