'use strict';

/**
 * Stage 14.7G §7 — the ONLY external destination a live Stage 14.7 run may reach.
 *
 * The deterministic guard (`bootstrap/outboundNetworkGuard.js`) blocks every
 * external host. Live mode must open exactly one door, and the danger of opening
 * a door with a substring test is that `api.anthropic.com.attacker.example` and
 * `notanthropic.com` both "contain anthropic.com". So matching here is EXACT
 * host equality against a closed set, plus scheme and port, and never a regex
 * over a caller-supplied string.
 *
 * Classification vocabulary is closed and contains no caller text:
 *   approved_claude_provider | loopback_http | loopback_mongo | blocked_external
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MONGO_PORT = 27018;

/** Exact hosts, lowercased. Anthropic's SDK talks to this one host. */
const CLAUDE_HOSTS = new Set(['api.anthropic.com']);
const CLAUDE_PORT = 443;

const CLASS = {
  CLAUDE: 'approved_claude_provider',
  LOOPBACK_HTTP: 'loopback_http',
  LOOPBACK_MONGO: 'loopback_mongo',
  BLOCKED: 'blocked_external',
};

/**
 * Normalizes a host for comparison. Returns null for anything that is not a
 * plain hostname, so a value carrying userinfo, a port, a path or whitespace can
 * never be compared as if it were bare.
 */
function normalizeHost(host) {
  const raw = String(host == null ? '' : host).trim().toLowerCase();
  if (!raw) return null;
  // A bare hostname has none of these. Anything that does is refused rather than
  // stripped — stripping is how `evil.com#api.anthropic.com` becomes a match.
  if (/[/\\@?#\s]/.test(raw)) return null;
  // Strip ONE trailing dot (the DNS root); `a..b` and `a.` differ and only the
  // latter is a legitimate absolute form.
  const withoutRoot = raw.endsWith('.') ? raw.slice(0, -1) : raw;
  if (!withoutRoot || withoutRoot.includes('..')) return null;
  return withoutRoot;
}

/**
 * @param {Object} params
 * @param {string} params.host
 * @param {number|string} params.port
 * @param {string} [params.protocol] 'https:' | 'http:' — when known.
 * @param {boolean} [params.liveClaudeAllowed] false in deterministic mode.
 * @returns {{destinationClass: string, allowed: boolean}}
 */
function classifyLiveDestination({ host, port, protocol = null, liveClaudeAllowed = false } = {}) {
  const h = normalizeHost(host);
  const p = Number(port);

  if (h && LOOPBACK_HOSTS.has(h)) {
    if (p === MONGO_PORT) return { destinationClass: CLASS.LOOPBACK_MONGO, allowed: true };
    return { destinationClass: CLASS.LOOPBACK_HTTP, allowed: p > 0 };
  }

  // Every condition must hold. An unparseable host fails at the first.
  const isClaude = Boolean(h)
    && CLAUDE_HOSTS.has(h)
    && p === CLAUDE_PORT
    && (protocol == null || protocol === 'https:');

  if (isClaude) {
    // The host is Claude's, but that only matters when live mode authorized it.
    // In deterministic mode reaching Anthropic is itself the isolation failure.
    return liveClaudeAllowed
      ? { destinationClass: CLASS.CLAUDE, allowed: true }
      : { destinationClass: CLASS.BLOCKED, allowed: false };
  }

  return { destinationClass: CLASS.BLOCKED, allowed: false };
}

module.exports = {
  CLASS,
  CLAUDE_HOSTS,
  CLAUDE_PORT,
  MONGO_PORT,
  normalizeHost,
  classifyLiveDestination,
};
