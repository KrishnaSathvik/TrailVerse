'use strict';

/**
 * WP10B — resolve the transport dialect for a single request.
 *
 * FAIL CLOSED to 'legacy'. The canonical v2 wire is chosen only when BOTH:
 *   (a) the server has v2 enabled (kill switch, default off), AND
 *   (b) the client explicitly signals it can parse v2.
 * Any uncertainty, malformed request, or unrecognized signal → 'legacy', so
 * every existing client keeps working with no change on its part.
 *
 * The v2 signal is a header `x-trailie-transport: v2` (or `2`), with a body
 * fallback of `metadata.transportVersion`.
 */

const { trailieTransportV2Enabled } = require('../config/trailieTransportConfig');

const V2_HEADER = 'x-trailie-transport';
const V2_SIGNALS = new Set(['v2', '2']);

/** Read a header case-insensitively from either req.get() or req.headers. */
function readHeader(req, name) {
  try {
    if (typeof req.get === 'function') {
      const v = req.get(name);
      if (v != null) return v;
    }
    const headers = req.headers;
    if (headers && typeof headers === 'object') return headers[name];
  } catch (_) {
    /* fall through to undefined */
  }
  return undefined;
}

function normalizeSignal(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

function clientSignalsV2(req) {
  const header = normalizeSignal(readHeader(req, V2_HEADER));
  if (V2_SIGNALS.has(header)) return true;

  const bodyVersion = req.body && req.body.metadata ? req.body.metadata.transportVersion : undefined;
  if (V2_SIGNALS.has(normalizeSignal(bodyVersion))) return true;

  return false;
}

/**
 * @param {Object} req  the Express request (or a plain shape in tests)
 * @param {Object} [opts]
 * @param {boolean} [opts.enabled]  server enablement; defaults to the config seam
 * @returns {'v2'|'legacy'}
 */
function resolveTrailieTransportDialect(req, { enabled = trailieTransportV2Enabled() } = {}) {
  if (!enabled || !req) return 'legacy';
  return clientSignalsV2(req) ? 'v2' : 'legacy';
}

module.exports = {
  resolveTrailieTransportDialect,
};
