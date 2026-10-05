/**
 * Stage 14.5 §4 — bounded public capability flags.
 *
 * The browser must never read a server flag such as `TRAILIE_PROSE_RECOVERY`.
 * It reads a SEPARATE, explicitly public build-time variable whose only job is
 * to decide whether an affordance renders.
 *
 * This is presentation gating, not authorization: the recovery endpoint
 * independently enforces its own server flag and ownership checks, so a stale
 * browser bundle with the capability baked in still cannot reach a disabled
 * route — it just gets a 404.
 */

const isEnabled = (value) => String(value || '').trim().toLowerCase() === 'true';

/** Default OFF. Nothing here exposes environment values or internal config. */
export function getTrailieCapabilities() {
  return {
    trailieProseRecoveryEnabled: isEnabled(process.env.NEXT_PUBLIC_TRAILIE_PROSE_RECOVERY),
  };
}

/** Shared viewers never receive a capability, whatever the build says. */
export function getSharedViewerCapabilities() {
  return { trailieProseRecoveryEnabled: false };
}
