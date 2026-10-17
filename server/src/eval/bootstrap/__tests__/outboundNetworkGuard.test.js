'use strict';

/**
 * Stage 14.7D2 §6 — outbound-network guard.
 *
 * These tests deliberately ATTEMPT blocked connections. That is the point: a
 * sweep reporting `externalNetworkAttempts: 0` only means something if the
 * guard demonstrably blocks when something does try.
 *
 * No test here reaches a real external host — every attempt is refused
 * synchronously by the guard before a socket is opened.
 */

const http = require('http');
const https = require('https');
const net = require('net');

const { installOutboundNetworkGuard, IMPORT_PHASE_CODE, RUNTIME_BLOCK_CODE, classify } = require('../outboundNetworkGuard');

let guard;
const installTestGuard = (options = {}) => installOutboundNetworkGuard({
  ...options,
  recordProviderTripwires: false,
});
afterEach(() => {
  if (guard) { guard.uninstall(); guard = null; }
});

describe('§6 — destination classification never retains the destination', () => {
  test('classes are coarse and safe', () => {
    expect(classify('api.anthropic.com', 443)).toBe('external_https');
    expect(classify('example.net', 80)).toBe('external_http');
    expect(classify('127.0.0.1', 27018)).toBe('loopback_mongo');
    expect(classify('127.0.0.1', 51234)).toBe('loopback_http');
  });
});

describe('§6 — external destinations are blocked', () => {
  beforeEach(() => { guard = installTestGuard(); });

  test('external HTTPS is blocked', () => {
    expect(() => https.request({ hostname: 'api.anthropic.com', port: 443, path: '/v1/messages' }))
      .toThrow(IMPORT_PHASE_CODE);
  });

  test('external HTTP is blocked', () => {
    expect(() => http.request({ hostname: 'example.net', port: 80, path: '/' }))
      .toThrow(IMPORT_PHASE_CODE);
  });

  test('https.get is blocked (it does not route through the patched request)', () => {
    expect(() => https.get({ hostname: 'developer.nps.gov', port: 443, path: '/api/v1/parks' }))
      .toThrow(IMPORT_PHASE_CODE);
  });

  test('raw socket creation to an external host is blocked', () => {
    expect(() => net.connect({ host: 'api.openai.com', port: 443 })).toThrow(IMPORT_PHASE_CODE);
  });

  test('net.Socket.prototype.connect is blocked — the MongoDB driver path', () => {
    const socket = new net.Socket();
    expect(() => socket.connect({ host: 'cluster0.example.mongodb.net', port: 27017 })).toThrow(IMPORT_PHASE_CODE);
    socket.destroy();
  });

  test('Atlas is always blocked, including its default port', () => {
    expect(() => net.connect({ host: 'cluster0.abcd.mongodb.net', port: 27017 })).toThrow();
    const summary = guard.summary();
    expect(summary.blockedExternalNetworkAttempts).toBeGreaterThan(0);
  });

  test('global fetch to an external host rejects', async () => {
    await expect(fetch('https://api.anthropic.com/v1/messages')).rejects.toThrow(IMPORT_PHASE_CODE);
  });

  test('a mongodb+srv destination is refused as its own class', async () => {
    await expect(fetch('mongodb+srv://user:pw@cluster.example.net/db')).rejects.toThrow();
    expect(guard.summary().byClass.mongodb_srv).toBeGreaterThan(0);
  });
});

describe('§6 — permitted loopback destinations', () => {
  beforeEach(() => { guard = installTestGuard(); });

  test('loopback MongoDB on 27018 is allowed and recorded as non-external', () => {
    // Refused by the OS (nothing is listening) rather than by the guard.
    let guardBlocked = false;
    try { net.connect({ host: '127.0.0.1', port: 27018 }).destroy(); }
    catch (e) { guardBlocked = e.code === IMPORT_PHASE_CODE; }
    expect(guardBlocked).toBe(false);
    expect(guard.summary().byClass.loopback_mongo).toBeGreaterThan(0);
    expect(guard.summary().externalNetworkAttempts).toBe(0);
  });

  test('a registered ephemeral loopback HTTP port is allowed', () => {
    guard.allowHttpPort(45999);
    let guardBlocked = false;
    try { const s = net.connect({ host: '127.0.0.1', port: 45999 }); s.destroy(); }
    catch (e) { guardBlocked = e.code === IMPORT_PHASE_CODE; }
    expect(guardBlocked).toBe(false);
  });

  test('an unregistered loopback port is refused once a restriction exists', () => {
    guard.allowHttpPort(45999);
    expect(() => net.connect({ host: '127.0.0.1', port: 46000 })).toThrow();
  });
});

describe('§6 — phase-sensitive bounded codes', () => {
  beforeEach(() => { guard = installTestGuard(); });

  test('an import-phase request fails as unexpected_import_side_effect', () => {
    try { https.request({ hostname: 'api.openai.com', port: 443 }); throw new Error('should have thrown'); }
    catch (e) { expect(e.code).toBe(IMPORT_PHASE_CODE); }
  });

  test('a runtime request fails with the bounded dependency code', () => {
    guard.setPhase('runtime');
    try { https.request({ hostname: 'api.openai.com', port: 443 }); throw new Error('should have thrown'); }
    catch (e) { expect(e.code).toBe(RUNTIME_BLOCK_CODE); }
  });
});

describe('§6 — diagnostics leak nothing', () => {
  beforeEach(() => { guard = installTestGuard(); });

  test('no hostname, path, query, credential or header is retained', () => {
    try { https.request({ hostname: 'api.anthropic.com', port: 443, path: '/v1/messages?key=sk-secret-value', headers: { authorization: 'Bearer sk-secret-value' } }); } catch { /* expected */ }
    try { net.connect({ host: 'user:password@cluster0.mongodb.net', port: 27017 }); } catch { /* expected */ }

    const serialized = JSON.stringify({ attempts: guard.attempts, summary: guard.summary() });
    expect(serialized).not.toContain('api.anthropic.com');
    expect(serialized).not.toContain('sk-secret-value');
    expect(serialized).not.toContain('/v1/messages');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('mongodb.net');
    expect(serialized).toContain('external_https');
  });

  test('the thrown error exposes only a destination class', () => {
    try { https.request({ hostname: 'secret-internal-host.example.org', port: 443, path: '/private' }); }
    catch (e) {
      expect(e.message).toBe(IMPORT_PHASE_CODE);
      expect(e.destinationClass).toBe('external_https');
      expect(JSON.stringify({ m: e.message, d: e.destinationClass })).not.toContain('secret-internal-host');
    }
  });
});

describe('§6 — lifecycle', () => {
  test('uninstall restores every patched entry point', () => {
    const originals = {
      httpRequest: http.request, httpsRequest: https.request,
      httpGet: http.get, httpsGet: https.get,
      socketConnect: net.Socket.prototype.connect
    };
    const g = installTestGuard();
    expect(http.request).not.toBe(originals.httpRequest);
    g.uninstall();
    expect(http.request).toBe(originals.httpRequest);
    expect(https.request).toBe(originals.httpsRequest);
    expect(http.get).toBe(originals.httpGet);
    expect(https.get).toBe(originals.httpsGet);
    expect(net.Socket.prototype.connect).toBe(originals.socketConnect);
  });

  test('double installation is refused rather than silently stacking', () => {
    guard = installTestGuard();
    expect(() => installTestGuard()).toThrow('outbound_guard_already_installed');
  });
});
