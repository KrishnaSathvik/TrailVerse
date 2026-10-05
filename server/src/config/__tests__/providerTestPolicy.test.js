'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Stage 14.7N — provider test policy', () => {
  let policy;
  let tripwireFile;
  let originalTripwireFile;

  beforeEach(() => {
    jest.resetModules();
    originalTripwireFile = process.env.TRAILIE_TEST_TRIPWIRE_FILE;
    tripwireFile = path.join(os.tmpdir(), `trailie-provider-tripwire-test-${process.pid}-${Date.now()}.jsonl`);
    process.env.TRAILIE_TEST_TRIPWIRE_FILE = tripwireFile;
    policy = require('../providerTestPolicy');
    policy.resetProviderTestSummary();
  });

  afterEach(() => {
    delete process.env.TRAILIE_TEST_PROVIDER_MODE;
    delete process.env.TRAILIE_ALLOW_LIVE_TESTS;
    delete process.env.TRAILIE_LIVE_TEST_ACK;
    delete process.env.TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED;
    delete process.env.TRAILIE_EVAL_EXECUTE_LIVE;
    delete process.env.TRAILIE_EVAL_LIVE_PROVIDERS;
    if (originalTripwireFile === undefined) delete process.env.TRAILIE_TEST_TRIPWIRE_FILE;
    else process.env.TRAILIE_TEST_TRIPWIRE_FILE = originalTripwireFile;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try { fs.unlinkSync(tripwireFile); } catch { /* absent is fine */ }
  });

  test('deny_live beats valid keys loaded from dotenv', () => {
    process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
    process.env.ANTHROPIC_API_KEY = 'present-but-must-not-enable-live';
    expect(() => policy.assertLiveProviderAllowed({ provider: 'claude', phase: 'constructor' }))
      .toThrow(policy.LIVE_PROVIDER_FORBIDDEN_IN_TEST);
    expect(policy.getProviderTestSummary()).toEqual(expect.objectContaining({
      liveAnthropicConstructors: 1,
      liveOpenAiConstructors: 0,
      liveProviderDispatches: 0,
      externalProviderHttpRequests: 0,
    }));
  });

  test('synthetic providers remain separately identified and permitted', () => {
    process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
    expect(() => policy.assertLiveProviderAllowed({
      provider: 'claude', phase: 'dispatch', synthetic: true,
    })).not.toThrow();
    expect(policy.getProviderTestSummary()).toEqual(expect.objectContaining({
      syntheticProviderDispatches: 1,
      liveProviderDispatches: 0,
    }));
  });

  test('live tests require both exact acknowledgements', () => {
    const full = {
      TRAILIE_ALLOW_LIVE_TESTS: 'true',
      TRAILIE_LIVE_TEST_ACK: 'I_UNDERSTAND_THIS_MAKES_REAL_PROVIDER_CALLS',
    };
    expect(() => policy.assertLiveTestsAuthorized({})).toThrow('live_tests_not_authorized');
    expect(() => policy.assertLiveTestsAuthorized({ TRAILIE_ALLOW_LIVE_TESTS: 'true' }))
      .toThrow('live_tests_not_authorized');
    expect(() => policy.assertLiveTestsAuthorized({
      TRAILIE_LIVE_TEST_ACK: full.TRAILIE_LIVE_TEST_ACK,
    })).toThrow('live_tests_not_authorized');
    expect(policy.assertLiveTestsAuthorized(full)).toEqual({ authorized: true });
  });

  test('an explicitly authorized Stage 14.7 child does not require the Jest live-suite acknowledgement', () => {
    const env = {
      NODE_ENV: 'test',
      TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED: 'true',
      TRAILIE_EVAL_EXECUTE_LIVE: 'true',
      TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
    };
    expect(policy.assertLiveProviderAllowed({
      env, provider: 'claude', phase: 'constructor',
    })).toEqual({ allowed: true, synthetic: false });
  });

  test('deny_live overrides an otherwise authorized Stage 14.7 child', () => {
    const env = {
      NODE_ENV: 'test',
      TRAILIE_TEST_PROVIDER_MODE: 'deny_live',
      TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED: 'true',
      TRAILIE_EVAL_EXECUTE_LIVE: 'true',
      TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
    };
    expect(() => policy.assertLiveProviderAllowed({
      env, provider: 'claude', phase: 'constructor',
    })).toThrow(policy.LIVE_PROVIDER_FORBIDDEN_IN_TEST);
  });

  test('bounded tripwire events contain no keys, prompts, responses, or identities', () => {
    process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
    expect(() => policy.assertLiveProviderAllowed({ provider: 'openai', phase: 'dispatch' })).toThrow();
    const raw = fs.readFileSync(tripwireFile, 'utf8');
    expect(raw).toContain('openai');
    expect(raw).toContain('dispatch');
    expect(raw).not.toContain('present-but-must-not-enable-live');
    expect(raw).not.toMatch(/prompt|response|authorization|api[_-]?key|email/i);
  });
});
