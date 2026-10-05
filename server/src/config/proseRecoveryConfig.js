/**
 * Stage 14.4 — explicit prose recovery.
 *
 * Two independent timing budgets, and a load-time invariant between them:
 *
 *   PROSE_RECOVERY_LEASE_MS  >  PROSE_RECOVERY_MAX_RUNTIME_MS + safety margin
 *
 * If that ever inverted, a lease could expire while its own valid provider
 * request was still permitted to run — and a second tab could then acquire the
 * lease and buy the same Phase B result. The check throws at configuration load
 * rather than failing silently in production.
 */

const DEFAULT_MAX_RUNTIME_MS = 120_000;
const DEFAULT_SAFETY_MARGIN_MS = 30_000;
const DEFAULT_LEASE_MS = 180_000;

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Only a case-insensitive "true" enables recovery. Default OFF. */
function readFlag(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function assertLeaseOutlivesRuntime({ leaseMs, maxRuntimeMs, safetyMarginMs }) {
  const required = maxRuntimeMs + safetyMarginMs;
  if (!(leaseMs > required)) {
    throw new Error(
      `[proseRecoveryConfig] PROSE_RECOVERY_LEASE_MS (${leaseMs}) must exceed ` +
        `PROSE_RECOVERY_MAX_RUNTIME_MS (${maxRuntimeMs}) + safety margin (${safetyMarginMs}) = ${required}`
    );
  }
}

function getProseRecoveryConfig() {
  const maxRuntimeMs = readInt('PROSE_RECOVERY_MAX_RUNTIME_MS', DEFAULT_MAX_RUNTIME_MS);
  const safetyMarginMs = readInt('PROSE_RECOVERY_SAFETY_MARGIN_MS', DEFAULT_SAFETY_MARGIN_MS);
  const leaseMs = readInt('PROSE_RECOVERY_LEASE_MS', DEFAULT_LEASE_MS);

  assertLeaseOutlivesRuntime({ leaseMs, maxRuntimeMs, safetyMarginMs });

  return {
    enabled: readFlag('TRAILIE_PROSE_RECOVERY'),
    leaseMs,
    maxRuntimeMs,
    safetyMarginMs,
    /** Bounded hint for a 409 response. Never a precise internal deadline. */
    retryAfterSeconds: Math.ceil(maxRuntimeMs / 1000),
  };
}

module.exports = {
  getProseRecoveryConfig,
  assertLeaseOutlivesRuntime,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_RUNTIME_MS,
  DEFAULT_SAFETY_MARGIN_MS,
};
