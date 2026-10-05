'use strict';

/**
 * Stage 14.7D2 §6 — outbound-network guard.
 *
 * Installed in the evaluation child BEFORE any application, route, provider,
 * NPS, weather, image, context or search module is imported, so an import-time
 * request is caught as `unexpected_import_side_effect` rather than silently
 * succeeding.
 *
 * Diagnostics discipline: attempts are recorded only as a destination CLASS
 * (`loopback_mongo`, `loopback_http`, `external_https`, `external_http`,
 * `mongodb_srv`, `unknown`). No hostname, URL, path, query string, credential,
 * header or body is ever retained or logged.
 */

const net = require('net');
const http = require('http');
const https = require('https');

const IMPORT_PHASE_CODE = 'unexpected_import_side_effect';
const RUNTIME_BLOCK_CODE = 'external_network_blocked';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MONGO_PORT = 27018;

/**
 * Stage 14.8E.2 §7 — an additional loopback Mongo port, for running evaluation
 * suites against a fresh instance. Loopback only, and additive: 27018 stays
 * allowed, and nothing external becomes reachable.
 */
const EXTRA_MONGO_PORT = (() => {
  const uri = process.env.TRAILIE_EVAL_TEST_MONGODB_URI || '';
  const match = /^mongodb:\/\/127\.0\.0\.1:(\d+)\//.exec(uri);
  return match ? Number(match[1]) : null;
})();

const isMongoPort = (port) => port === MONGO_PORT || (EXTRA_MONGO_PORT != null && port === EXTRA_MONGO_PORT);

/** Stage 14.7G §7 — the one external class a live run may produce. */
const APPROVED_PROVIDER_CLASS = 'approved_claude_provider';

let state = null;

/**
 * Maps a destination to a bounded DEPENDENCY LABEL from a fixed vocabulary.
 * This keeps diagnostics useful ("which dependency escaped isolation?") without
 * retaining the hostname itself — the label set is closed and contains no
 * caller-supplied text.
 */
const DEPENDENCY_LABELS = [
  [/(^|\.)openweathermap\.org$/, 'weather'],
  [/(^|\.)nps\.gov$/, 'nps'],
  [/(^|\.)googleapis\.com$/, 'google_maps'],
  [/(^|\.)mapbox\.com$/, 'geocoding'],
  [/(^|\.)search\.brave\.com$/, 'web_search_brave'],
  [/(^|\.)serper\.dev$/, 'web_search_serper'],
  [/(^|\.)tavily\.com$/, 'web_search_tavily'],
  [/(^|\.)anthropic\.com$/, 'anthropic'],
  [/(^|\.)openai\.com$/, 'openai'],
  [/(^|\.)resend\.com$/, 'email'],
  [/(^|\.)unsplash\.com$/, 'park_images'],
  [/(^|\.)mongodb\.net$/, 'atlas'],
  [/(^|\.)ridb\.recreation\.gov$/, 'ridb_permits'],
  [/(^|\.)recreation\.gov$/, 'ridb_permits'],
  [/(^|\.)sunrise-sunset\.org$/, 'astro'],
  [/(^|\.)api\.sunrisesunset\.io$/, 'astro'],
  [/(^|\.)open-meteo\.com$/, 'weather'],
  [/(^|\.)weather\.gov$/, 'weather'],
  [/(^|\.)wikipedia\.org$/, 'context_wiki'],
  [/(^|\.)nominatim\.openstreetmap\.org$/, 'geocoding']
];

function dependencyLabel(host) {
  const h = String(host || '').toLowerCase();
  for (const [pattern, label] of DEPENDENCY_LABELS) {
    if (pattern.test(h)) return label;
  }
  return 'unlabelled_external';
}

/** Classifies a destination without retaining it. */
function classify(host, port) {
  const h = String(host || '').toLowerCase();
  const p = Number(port);
  if (!LOOPBACK_HOSTS.has(h)) {
    if (p === 443) return 'external_https';
    if (p === 80 || p === 8080) return 'external_http';
    return 'external_other';
  }
  if (isMongoPort(p)) return 'loopback_mongo';
  return 'loopback_http';
}

/**
 * Loopback Mongo on 27018 and loopback ephemeral HTTP are the only allowances.
 *
 * Stage 14.7G §7 — a LIVE Stage 14.7 run additionally permits exactly one
 * external destination: Claude. That allowance is opt-in per install
 * (`liveClaudeAllowed`), never a global relaxation, and the decision is
 * delegated to `stage14_7/liveNetworkAllowlist.js` so exact-host matching is
 * defined in one place. With the flag off, behaviour is byte-for-byte what it
 * was before: every external host is blocked, Anthropic included.
 */
function isAllowed(host, port, allowedHttpPorts, liveClaudeAllowed = false, protocol = null) {
  const h = String(host || '').toLowerCase();
  const p = Number(port);
  if (!LOOPBACK_HOSTS.has(h)) {
    if (!liveClaudeAllowed) return false;
    const { classifyLiveDestination, CLASS } = require('../stage14_7/liveNetworkAllowlist');
    const verdict = classifyLiveDestination({ host, port, protocol, liveClaudeAllowed: true });
    return verdict.allowed && verdict.destinationClass === CLASS.CLAUDE;
  }
  if (isMongoPort(p)) return true;
  // Ephemeral Express listener: allowed once the parent records its port, and
  // any loopback port when no restriction has been registered yet.
  if (allowedHttpPorts.size === 0) return p > 0;
  return allowedHttpPorts.has(p);
}

function record(destinationClass, phase, blocked, dependency) {
  state.attempts.push({ destinationClass, phase, blocked, dependency });
}

function boundedError(destinationClass, phase) {
  const code = phase === 'import' ? IMPORT_PHASE_CODE : RUNTIME_BLOCK_CODE;
  const error = new Error(code);
  error.code = code;
  error.destinationClass = destinationClass;
  return error;
}

/** Pulls host/port out of the many shapes Node's HTTP APIs accept. */
function hostPortFrom(options, defaultPort) {
  if (typeof options === 'string') {
    try {
      const u = new URL(options);
      return { host: u.hostname, port: u.port || defaultPort };
    } catch {
      return { host: 'unknown', port: defaultPort };
    }
  }
  if (options instanceof URL) {
    return { host: options.hostname, port: options.port || defaultPort };
  }
  if (options && typeof options === 'object') {
    const host = options.hostname || options.host || options.path || 'unknown';
    return { host: String(host).split(':')[0], port: options.port || defaultPort };
  }
  return { host: 'unknown', port: defaultPort };
}

/**
 * Installs the guard.
 * @returns handle with phase control, counters and uninstall.
 */
function installOutboundNetworkGuard({
  allowedHttpPorts = [], liveClaudeAllowed = false, recordProviderTripwires = true,
} = {}) {
  if (state) throw new Error('outbound_guard_already_installed');

  state = {
    phase: 'import',
    attempts: [],
    // Stage 14.7G §7 — opt-in, per install. Defaults to the deterministic
    // behaviour so no existing caller changes meaning.
    liveClaudeAllowed: Boolean(liveClaudeAllowed),
    // Negative-control suites deliberately probe blocked provider URLs. They
    // opt out explicitly so those synthetic probes do not masquerade as an
    // application/provider attempt in the process-wide containment ledger.
    recordProviderTripwires: Boolean(recordProviderTripwires),
    // §11 — provider transport counters, kept apart.
    providerHttpRequests: 0,
    providerSocketConnections: 0,
    allowedHttpPorts: new Set(allowedHttpPorts),
    originals: {
      socketConnect: net.Socket.prototype.connect,
      httpRequest: http.request,
      httpsRequest: https.request,
      httpGet: http.get,
      httpsGet: https.get,
      fetch: global.fetch
    }
  };

  const gate = (host, port, protocol = null, via = 'socket') => {
    const allowed = isAllowed(host, port, state.allowedHttpPorts, state.liveClaudeAllowed, protocol);
    // §7 — an ALLOWED external destination is the approved provider and is
    // recorded under its own class, so `externalNonProviderNetworkAttempts` can
    // be counted without conflating the one permitted call with an escape.
    const destinationClass = allowed && !classify(host, port).startsWith('loopback')
      ? APPROVED_PROVIDER_CLASS
      : classify(host, port);
    const isExternal = !destinationClass.startsWith('loopback') && destinationClass !== APPROVED_PROVIDER_CLASS;
    // Label external destinations only; loopback needs no attribution.
    const dependency = isExternal ? dependencyLabel(host) : null;
    if (!allowed && state.recordProviderTripwires && via === 'http'
      && (dependency === 'anthropic' || dependency === 'openai')) {
      const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
      recordExternalProviderHttpRequest(dependency === 'openai' ? 'openai' : 'claude');
    }
    if (allowed) {
      record(destinationClass, state.phase, false, dependency);
      // Stage 14.7I §11 — HTTP requests and socket connections are counted
      // SEPARATELY. The Stage 14.7 live run saw 4 approved-Claude connections
      // against 3 ledger attempts, and one number could not explain the other.
      // Connection reuse and pooling make socket count a poor proxy for request
      // count, so correlation is done against HTTP requests only.
      if (destinationClass === APPROVED_PROVIDER_CLASS) {
        if (via === 'http') state.providerHttpRequests += 1;
        else state.providerSocketConnections += 1;
      }
      return null;
    }
    record(destinationClass, state.phase, true, dependency);
    const error = boundedError(destinationClass, state.phase);
    error.dependency = dependency;
    return error;
  };

  // ── Socket connections ──
  // Socket.prototype.connect is the single chokepoint: net.connect and
  // net.createConnection both build a Socket and delegate to it, and the
  // MongoDB driver constructs `new net.Socket()` directly. Guarding only here
  // means one attempt is recorded per connection rather than two.
  //
  // Argument shapes seen in practice:
  //   [[options, cb]]   already normalized by net.connect  ← the common case
  //   [options, cb]     direct socket.connect(options)
  //   [port, host, cb]  direct socket.connect(port, host)
  const parseConnectArgs = (args) => {
    let first = args[0];
    // net.connect hands the prototype a normalized [options, cb] array.
    if (Array.isArray(first)) first = first[0];

    if (first && typeof first === 'object') {
      return { host: first.host || first.path || 'localhost', port: first.port };
    }
    if (typeof first === 'number') {
      return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: first };
    }
    return { host: 'unknown', port: 0 };
  };

  net.Socket.prototype.connect = function guardedConnect(...args) {
    const { host, port } = parseConnectArgs(args);
    const err = gate(host, port);
    if (err) throw err;
    return state.originals.socketConnect.apply(this, args);
  };

  // ── http.request / https.request (covers axios' default transport) ──
  const wrapRequest = (original, defaultPort, protocol) => function guardedRequest(...args) {
    const { host, port } = hostPortFrom(args[0], defaultPort);
    const err = gate(host, port, protocol, 'http');
    if (err) throw err;
    return original.apply(this, args);
  };
  http.request = wrapRequest(state.originals.httpRequest, 80, 'http:');
  https.request = wrapRequest(state.originals.httpsRequest, 443, 'https:');
  // Node's http.get closes over the internal `request`, not the export, so
  // patching request alone would leave .get unguarded.
  http.get = wrapRequest(state.originals.httpGet, 80, 'http:');
  https.get = wrapRequest(state.originals.httpsGet, 443, 'https:');

  // ── global fetch ──
  if (typeof state.originals.fetch === 'function') {
    global.fetch = function guardedFetch(input, init) {
      const target = typeof input === 'string' ? input : (input && input.url) || '';
      let host = 'unknown';
      let port = 443;
      let protocol = null;
      try {
        const u = new URL(target);
        host = u.hostname;
        port = u.port || (u.protocol === 'http:' ? 80 : 443);
        protocol = u.protocol;
        if (u.protocol === 'mongodb+srv:') {
          const e = boundedError('mongodb_srv', state.phase);
          record('mongodb_srv', state.phase, true);
          return Promise.reject(e);
        }
      } catch { /* unparseable target stays 'unknown' and is refused */ }
      const err = gate(host, port, protocol, 'http');
      if (err) return Promise.reject(err);
      return state.originals.fetch.call(this, input, init);
    };
  }

  return {
    /** Import phase ends once application modules are loaded. */
    setPhase(phase) { state.phase = phase; },
    allowHttpPort(port) { state.allowedHttpPorts.add(Number(port)); },
    get attempts() { return state.attempts.slice(); },
    /** Bounded counters for the readiness object. */
    summary() {
      const external = state.attempts.filter((a) => a.destinationClass.startsWith('external') || a.destinationClass === 'mongodb_srv');
      const approvedProvider = state.attempts.filter((a) => a.destinationClass === APPROVED_PROVIDER_CLASS);
      return {
        externalNetworkAttempts: external.length,
        blockedExternalNetworkAttempts: external.filter((a) => a.blocked).length,
        // §14 — everything external that is NOT the one approved provider. This
        // is the counter the isolation requirement is stated in terms of, and it
        // stays 0 in both deterministic and live mode.
        externalNonProviderNetworkAttempts: external.length,
        approvedClaudeProviderAttempts: approvedProvider.length,
        // §11 — the two transport counts, reported separately so a correlation
        // check can use the meaningful one.
        providerHttpRequests: state.providerHttpRequests,
        providerSocketConnections: state.providerSocketConnections,
        liveClaudeAllowed: state.liveClaudeAllowed,
        importPhaseAttempts: state.attempts.filter((a) => a.phase === 'import' && a.blocked).length,
        byClass: state.attempts.reduce((acc, a) => {
          acc[a.destinationClass] = (acc[a.destinationClass] || 0) + 1;
          return acc;
        }, {}),
        // Which dependency escaped isolation, from a closed label vocabulary.
        byDependency: external.reduce((acc, a) => {
          acc[a.dependency || 'unlabelled_external'] = (acc[a.dependency || 'unlabelled_external'] || 0) + 1;
          return acc;
        }, {})
      };
    },
    uninstall() {
      if (!state) return;
      net.Socket.prototype.connect = state.originals.socketConnect;
      http.request = state.originals.httpRequest;
      https.request = state.originals.httpsRequest;
      http.get = state.originals.httpGet;
      https.get = state.originals.httpsGet;
      if (state.originals.fetch) global.fetch = state.originals.fetch;
      state = null;
    }
  };
}

module.exports = {
  installOutboundNetworkGuard,
  dependencyLabel,
  IMPORT_PHASE_CODE,
  RUNTIME_BLOCK_CODE,
  classify
};
