'use strict';

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(SERVER_ROOT, rel), 'utf8');

describe('Stage 14.7N — regression-provider isolation structure', () => {
  test('ordinary Jest discovery structurally excludes every live-test pattern', () => {
    const config = require(path.join(SERVER_ROOT, 'jest.config.js'));
    const patterns = config.testPathIgnorePatterns || [];
    const candidates = [
      '/repo/src/a.live.test.js',
      '/repo/src/a.live.spec.js',
      '/repo/src/live/a.test.js',
    ];
    for (const candidate of candidates) {
      expect(patterns.some((pattern) => new RegExp(pattern).test(candidate))).toBe(true);
    }
    expect(patterns.some((pattern) => new RegExp(pattern).test('/repo/src/services/__tests__/factsWebSearch.live.test.js'))).toBe(true);
  });

  test('authoritative non-network and explicit live commands are separate', () => {
    const pkg = require(path.join(SERVER_ROOT, 'package.json'));
    expect(pkg.scripts['test:non-network']).toBe('node scripts/run-provider-disabled-tests.js');
    expect(pkg.scripts['test:live']).toBe('node scripts/run-live-tests.js');
    expect(pkg.scripts.test).toBe('npm run test:non-network');
    expect(pkg.scripts['test:non-network']).not.toMatch(/live/i);
  });

  test('provider-disabled bootstrap precedes every ordinary test module', () => {
    const config = require(path.join(SERVER_ROOT, 'jest.config.js'));
    expect(config.setupFiles).toContain('<rootDir>/tests/providerDisabledBootstrap.js');
    expect(read('tests/providerDisabledBootstrap.js')).toContain("TRAILIE_TEST_PROVIDER_MODE = 'deny_live'");
  });

  test('the broad command cannot discover factsWebSearch.live.test.js', () => {
    const config = require(path.join(SERVER_ROOT, 'jest.config.js'));
    const target = '/repo/src/services/__tests__/factsWebSearch.live.test.js';
    expect(config.testPathIgnorePatterns.some((pattern) => new RegExp(pattern).test(target))).toBe(true);
  });

  test('composite preflight has a provider-isolation phase and no live-test reachability', () => {
    const composite = require('../compositePreflight');
    expect(composite.PHASES).toContain('S_regression_provider_isolation');
    const src = read('src/eval/stage14_7/compositePreflight.js');
    expect(src).not.toMatch(/factsWebSearch\.live\.test|run-live-tests|test:live/);
    expect(src).toMatch(/regressionProviderIsolationPassed/);
    expect(src).toMatch(/compositePreflightExcludesLiveTests/);
  });

  test('the accidental-call incident is separate, bounded, and usage-unknown', () => {
    const incident = JSON.parse(read('../artifacts/private/stage14_7N-accidental-provider-incident.json'));
    expect(incident).toEqual(expect.objectContaining({
      incidentType: 'unexpected_live_provider_calls_from_regression_suite',
      sourceSuite: 'factsWebSearch.live.test.js',
      providerCallsObserved: 4,
      provider: 'claude',
      usageKnown: false,
      costKnown: false,
      stage14_7ScenarioCalls: 0,
      stage14_7ScenarioConsumptionChanged: false,
    }));
    expect(JSON.stringify(incident)).not.toMatch(/api[_-]?key|authorization|prompt|response|email/i);
  });

  test('preflight version is refreshed', () => {
    expect(require('../preflightVersion').PREFLIGHT_VERSION).toBe('14.7R.1');
  });
});
