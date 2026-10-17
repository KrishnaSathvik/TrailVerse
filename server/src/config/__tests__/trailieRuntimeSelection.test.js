'use strict';

const { selectTrailieRuntime } = require('../trailieRuntimeSelection');

describe('Step 9 Gate 1 — runtime selection', () => {
  test('unset / model_first / legacy / invalid behave as locked', () => {
    expect(selectTrailieRuntime({})).toBe('model_first');
    expect(selectTrailieRuntime({ TRAILIE_RUNTIME: undefined })).toBe('model_first');
    expect(selectTrailieRuntime({ TRAILIE_RUNTIME: 'model_first' })).toBe('model_first');
    expect(selectTrailieRuntime({ TRAILIE_RUNTIME: 'legacy' })).toBe('legacy');
    expect(selectTrailieRuntime({ TRAILIE_RUNTIME: 'typo' })).toBe('unavailable');
    // Empty string falls through to the default (falsy), same as unset.
    expect(selectTrailieRuntime({ TRAILIE_RUNTIME: '' })).toBe('model_first');
  });

  test('NODE_ENV=production never silently forces legacy', () => {
    expect(selectTrailieRuntime({ NODE_ENV: 'production' })).toBe('model_first');
    expect(selectTrailieRuntime({ NODE_ENV: 'production', TRAILIE_RUNTIME: 'model_first' })).toBe('model_first');
    expect(selectTrailieRuntime({ NODE_ENV: 'production', TRAILIE_RUNTIME: 'legacy' })).toBe('legacy');
    expect(selectTrailieRuntime({ NODE_ENV: 'production', TRAILIE_RUNTIME: 'typo' })).toBe('unavailable');
  });
});
