'use strict';

/**
 * Stage 14.7G §7 — the installed guard, not just the classifier.
 *
 * The classifier tests prove the decision is right; these prove the decision is
 * actually reached by real `https.request` / `fetch` calls, and that the
 * deterministic default is unchanged. No request in this file is allowed to
 * leave the machine: every case that would be permitted is asserted at the gate
 * and never dispatched.
 */

const https = require('https');
const http = require('http');

const { installOutboundNetworkGuard } = require('../../bootstrap/outboundNetworkGuard');

let guard = null;
let realTransport = null;

/**
 * The transport is stubbed BEFORE the guard installs, so the guard captures the
 * stub as its "original". A permitted request therefore reaches the stub and
 * never the network: this suite makes no outbound connection of any kind, which
 * is the only honest way to test a network-isolation guard.
 */
function installGuard(options = {}) {
  realTransport = {
    httpsRequest: https.request, httpRequest: http.request,
    httpsGet: https.get, httpGet: http.get,
  };
  const stub = () => ({ destroy() {}, on() {}, end() {} });
  https.request = stub; http.request = stub; https.get = stub; http.get = stub;

  guard = installOutboundNetworkGuard({ ...options, recordProviderTripwires: false });
  guard.setPhase('runtime');
  return guard;
}

afterEach(() => {
  if (guard) { guard.uninstall(); guard = null; }
  if (realTransport) {
    https.request = realTransport.httpsRequest; http.request = realTransport.httpRequest;
    https.get = realTransport.httpsGet; http.get = realTransport.httpGet;
    realTransport = null;
  }
});

/** Attempts a request and reports how the guard responded. */
function attempt(fn) {
  try {
    fn();
    return { blocked: false, code: null };
  } catch (error) {
    return { blocked: true, code: error.code, destinationClass: error.destinationClass };
  }
}

describe('deterministic mode — unchanged, Anthropic included', () => {
  beforeEach(() => { installGuard(); });

  test('Anthropic is BLOCKED when live mode was not requested', () => {
    const r = attempt(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/v1/messages' }));
    expect(r.blocked).toBe(true);
    expect(r.code).toBe('external_network_blocked');
  });

  test('every other external host is blocked', () => {
    for (const hostname of ['api.openai.com', 'api.nps.gov', 'ridb.recreation.gov', 'api.resend.com']) {
      expect(attempt(() => https.request({ hostname, port: 443, path: '/' })).blocked).toBe(true);
    }
  });

  test('the summary reports zero approved-provider attempts', () => {
    attempt(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/' }));
    const s = guard.summary();
    expect(s.approvedClaudeProviderAttempts).toBe(0);
    expect(s.liveClaudeAllowed).toBe(false);
    expect(s.externalNonProviderNetworkAttempts).toBe(1);
    expect(s.blockedExternalNetworkAttempts).toBe(1);
  });
});

describe('live mode — exactly one door', () => {
  beforeEach(() => { installGuard({ liveClaudeAllowed: true }); });

  test('Claude on 443 over https is permitted', () => {
    expect(attempt(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/v1/messages' })).blocked).toBe(false);
  });

  test('OpenAI is still blocked', () => {
    const r = attempt(() => https.request({ hostname: 'api.openai.com', port: 443, path: '/v1/chat/completions' }));
    expect(r.blocked).toBe(true);
  });

  test('NPS, RIDB, weather, images, search and email remain blocked', () => {
    for (const hostname of [
      'api.nps.gov', 'ridb.recreation.gov', 'www.recreation.gov', 'api.openweathermap.org',
      'api.unsplash.com', 'api.search.brave.com', 'api.resend.com', 'maps.googleapis.com',
    ]) {
      expect(attempt(() => https.request({ hostname, port: 443, path: '/' })).blocked).toBe(true);
    }
  });

  test('a host merely SHARING a fragment with Claude is blocked', () => {
    for (const hostname of [
      'api.anthropic.com.attacker.example',
      'anthropic.com.evil.net',
      'apianthropic.com',
      'api-anthropic.com',
      'notapi.anthropic.com.evil.net',
    ]) {
      const r = attempt(() => https.request({ hostname, port: 443, path: '/' }));
      expect(r.blocked).toBe(true);
    }
  });

  test('Claude over plain http is blocked', () => {
    expect(attempt(() => http.request({ hostname: 'api.anthropic.com', port: 80, path: '/' })).blocked).toBe(true);
  });

  test('Claude on a non-443 port is blocked', () => {
    expect(attempt(() => https.request({ hostname: 'api.anthropic.com', port: 8443, path: '/' })).blocked).toBe(true);
  });

  test('the summary separates the approved provider from escapes', () => {
    attempt(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/' }));
    attempt(() => https.request({ hostname: 'api.openai.com', port: 443, path: '/' }));
    const s = guard.summary();
    expect(s.approvedClaudeProviderAttempts).toBe(1);
    // §14 — the counter the isolation requirement is stated in: still zero-safe,
    // counting only genuine escapes, and the blocked OpenAI attempt shows here.
    expect(s.externalNonProviderNetworkAttempts).toBe(1);
    expect(s.blockedExternalNetworkAttempts).toBe(1);
    expect(s.liveClaudeAllowed).toBe(true);
  });

  test('loopback Mongo and the ephemeral Express port are unaffected', () => {
    guard.allowHttpPort(45999);
    expect(attempt(() => http.request({ hostname: '127.0.0.1', port: 45999, path: '/api/trips' })).blocked).toBe(false);
  });

  test('an import-phase Claude request is still an import-side-effect failure', () => {
    guard.setPhase('import');
    // Permitted by destination, but the PHASE is what makes it wrong: nothing
    // should reach a provider while modules are still loading.
    const r = attempt(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/' }));
    // The destination is allowed, so this does not throw; the attempt is
    // recorded under the import phase where the composite preflight sees it.
    expect(r.blocked).toBe(false);
    expect(guard.attempts.some((a) => a.phase === 'import')).toBe(true);
  });
});
