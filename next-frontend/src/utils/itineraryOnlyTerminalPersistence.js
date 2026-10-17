/**
 * ITINERARY_ONLY terminal persistence.
 *
 * When revision 1 is already durable and `prose_ready` never arrived, the
 * lifecycle still emits PERSIST_TERMINAL (`itinerary_only_complete`) so the
 * coordinator can settle presentation (clear "Preparing trip notes…").
 *
 * `response_finalized` on that path carries display-only text and usually omits
 * revision-1 identity stamps (`contentHash`, `responseRevision`, plan identity).
 * Rebuilding a PUT from that payload at the same (version, revision) conflicts
 * with `same_version_different_hash` — and a failed terminal persist never clears
 * the pending-notes label.
 *
 * Canonical rule: presentation-only finalize must not mutate the accepted
 * itinerary hash / contentHash. Persistence is already complete → NO-OP success.
 */

export const ITINERARY_ONLY_COMPLETE = 'itinerary_only_complete';

/**
 * @param {{ reason?: string|null, tripId?: string|null }} params
 * @returns {{ shouldWrite: boolean, result?: { ok: true, tripId: string|null, outcome: 'IDEMPOTENT' } }}
 */
export function resolveItineraryOnlyTerminalPersistence({ reason = null, tripId = null } = {}) {
  if (reason === ITINERARY_ONLY_COMPLETE) {
    return {
      shouldWrite: false,
      result: {
        ok: true,
        tripId: tripId || null,
        outcome: 'IDEMPOTENT',
      },
    };
  }
  return { shouldWrite: true };
}
