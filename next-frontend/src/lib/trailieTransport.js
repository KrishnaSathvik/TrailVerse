/**
 * WP10F-3 — web-side transport negotiation flag.
 *
 * Activating the canonical v2 wire is DUAL-GATED: the client opts in AND the
 * server independently allows it (TRAILIE_TRANSPORT_V2). This module owns only
 * the client half. It reads a SEPARATE, explicitly public build-time variable —
 * the browser never reads the server kill switch — and defaults OFF, so normal
 * production behavior stays legacy even after this lands.
 *
 * When the flag is on, the client sends the exact negotiation signal the server
 * resolver already understands (`resolveTrailieTransportDialect`): the header
 * `x-trailie-transport: v2`. Sending it while the server switch is off is safe —
 * the server still resolves legacy and the client's normalizer handles legacy.
 * This is presentation/rollout gating, not authorization.
 */

/** The negotiation signal understood by the server's dialect resolver. */
export const TRAILIE_V2_HEADER = 'x-trailie-transport';
export const TRAILIE_V2_SIGNAL = 'v2';

const isEnabled = (value) => String(value || '').trim().toLowerCase() === 'true';

/** Default OFF. Fail closed on any non-"true" value. */
export function shouldNegotiateTrailieV2() {
  return isEnabled(process.env.NEXT_PUBLIC_TRAILIE_TRANSPORT_V2);
}

/**
 * The negotiation header to merge into a streaming request, or an empty object
 * when the client has not opted in. Callers spread this into their headers.
 */
export function trailieV2NegotiationHeaders() {
  return shouldNegotiateTrailieV2() ? { [TRAILIE_V2_HEADER]: TRAILIE_V2_SIGNAL } : {};
}
