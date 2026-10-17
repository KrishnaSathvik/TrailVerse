'use strict';

const {
  TRAILIE_V2_RUNTIME_FLAG,
  isTrailieV2RuntimeEnabled,
} = require('../trailieV2Runtime');

describe('WP11A runtime flag', () => {
  const original = process.env[TRAILIE_V2_RUNTIME_FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[TRAILIE_V2_RUNTIME_FLAG];
    else process.env[TRAILIE_V2_RUNTIME_FLAG] = original;
  });

  test('flag name is TRAILIE_V2_RUNTIME_ENABLED', () => {
    expect(TRAILIE_V2_RUNTIME_FLAG).toBe('TRAILIE_V2_RUNTIME_ENABLED');
  });

  test('defaults to disabled when unset', () => {
    delete process.env[TRAILIE_V2_RUNTIME_FLAG];
    expect(isTrailieV2RuntimeEnabled({ ...process.env, NODE_ENV: 'production' })).toBe(false);
  });

  test('stays disabled for any value other than the literal true', () => {
    for (const value of ['false', '1', 'yes', '', 'on', 'enabled']) {
      process.env[TRAILIE_V2_RUNTIME_FLAG] = value;
      expect(isTrailieV2RuntimeEnabled({ ...process.env, NODE_ENV: 'production' })).toBe(false);
    }
  });

  test('enables only for the exact string "true" (case/space tolerant)', () => {
    process.env[TRAILIE_V2_RUNTIME_FLAG] = 'true';
    expect(isTrailieV2RuntimeEnabled({ ...process.env, NODE_ENV: 'production' })).toBe(true);
    process.env[TRAILIE_V2_RUNTIME_FLAG] = '  True  ';
    expect(isTrailieV2RuntimeEnabled({ ...process.env, NODE_ENV: 'production' })).toBe(true);
  });
});

test.each([undefined, 'development', 'test'])('local %s always runs canonical Trailie without a version flag', NODE_ENV => { expect(isTrailieV2RuntimeEnabled({ NODE_ENV })).toBe(true); expect(isTrailieV2RuntimeEnabled({ NODE_ENV, TRAILIE_V2_RUNTIME_ENABLED: 'false' })).toBe(true); });
