'use strict';

/**
 * WP10 — transport v2 enablement seam.
 *
 * The canonical v2 wire dialect is OFF by default and gated entirely here so no
 * route reads process.env ad hoc (mirrors the itineraryGenerationConfig seam).
 * This is a server-side kill switch, not a client capability: a client that
 * signals v2 is still rendered as legacy while this is off. Only an exact,
 * case-insensitive "true" enables it.
 */
function trailieTransportV2Enabled() {
  return String(process.env.TRAILIE_TRANSPORT_V2 || '').trim().toLowerCase() === 'true';
}

module.exports = {
  trailieTransportV2Enabled,
};
