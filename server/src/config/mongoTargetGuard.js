'use strict';

/**
 * Environment safety (audit 2026-08-31): local development was writing to the
 * production Atlas cluster because nothing between MONGODB_URI and
 * mongoose.connect() asked whether that made sense.
 *
 * The guard does NOT try to recognize "the production hostname" — a
 * fingerprint like that rots the day the cluster is renamed, and a dev
 * pointing at any shared remote cluster by accident is the same class of
 * mistake. Instead: outside production, every remote Mongo host is refused at
 * startup unless it is explicitly named in
 * MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS (comma-separated, exact hostnames).
 * Local topologies — loopback, localhost, host.docker.internal, single node
 * or replica set — always pass.
 */

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'host.docker.internal',
]);

/** Extracts the hostname list from a mongodb:// or mongodb+srv:// URI. */
function parseMongoHosts(uri) {
  if (typeof uri !== 'string') return null;
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^/@]*@)?([^/?]+)/);
  if (!match) return null;

  return match[1]
    .split(',')
    .map((hostPort) => {
      const trimmed = hostPort.trim();
      // Bracketed IPv6 ([::1]:27017) — the bracket content is the host.
      const v6 = trimmed.match(/^\[([^\]]+)\]/);
      if (v6) return v6[1].toLowerCase();
      return trimmed.split(':')[0].toLowerCase();
    })
    .filter(Boolean);
}

function isLocalHost(hostname) {
  return LOCAL_HOSTNAMES.has(hostname);
}

/**
 * @returns {{ allowed: boolean, reason: string|null, remoteHosts: string[] }}
 */
function assessMongoTarget({ uri, nodeEnv, allowRemoteHosts }) {
  if (nodeEnv === 'production') {
    return { allowed: true, reason: null, remoteHosts: [] };
  }

  const hosts = parseMongoHosts(uri);
  if (!hosts || hosts.length === 0) {
    return {
      allowed: false,
      reason: `Could not parse MongoDB hosts from MONGODB_URI — refusing to connect outside production.`,
      remoteHosts: [],
    };
  }

  const allowed = new Set(
    String(allowRemoteHosts || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );

  const remoteHosts = hosts.filter((h) => !isLocalHost(h));
  const unapproved = remoteHosts.filter((h) => !allowed.has(h));

  if (unapproved.length === 0) {
    return { allowed: true, reason: null, remoteHosts };
  }

  return {
    allowed: false,
    remoteHosts,
    reason: [
      `NODE_ENV is not "production", but MONGODB_URI points at remote host(s): ${unapproved.join(', ')}.`,
      `This may be a production database. Local development must use a local Mongo`,
      `(e.g. npm run dev:mongo — a single-node replica set, required for evidence transactions).`,
      `If you REALLY intend to use this remote database from a dev environment, set`,
      `MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS=${unapproved.join(',')} and accept that`,
      `every write, including anonymous chat sessions, lands on that cluster.`,
    ].join(' '),
  };
}

module.exports = { assessMongoTarget, parseMongoHosts };
