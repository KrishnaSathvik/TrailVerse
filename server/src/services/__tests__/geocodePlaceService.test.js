'use strict';

const {
  matchKnownPlace,
  resolvePlaceFromMessage,
} = require('../geocodePlaceService');

describe('known-place resolution', () => {
  test('prefers Valley of Fire over a later city mention', async () => {
    const prompt = 'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.';
    expect(matchKnownPlace(prompt)).toMatchObject({
      key: 'valley of fire',
      name: 'Valley of Fire State Park',
    });
    const resolved = await resolvePlaceFromMessage(prompt);
    expect(resolved).toMatchObject({
      name: 'Valley of Fire State Park',
      source: 'trailverse-known-place',
      query: 'valley of fire',
    });
    expect(resolved.lat).toBeCloseTo(36.4819, 3);
    expect(resolved.lon).toBeCloseTo(-114.5311, 3);
  });
});
