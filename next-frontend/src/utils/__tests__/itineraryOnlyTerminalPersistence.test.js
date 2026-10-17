import { describe, it, expect } from 'vitest';
import {
  ITINERARY_ONLY_COMPLETE,
  resolveItineraryOnlyTerminalPersistence,
} from '../itineraryOnlyTerminalPersistence';

describe('resolveItineraryOnlyTerminalPersistence', () => {
  it('NO-OPs itinerary_only_complete without a write', () => {
    const r = resolveItineraryOnlyTerminalPersistence({
      reason: ITINERARY_ONLY_COMPLETE,
      tripId: 'trip-probe-a',
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.result).toEqual({
      ok: true,
      tripId: 'trip-probe-a',
      outcome: 'IDEMPOTENT',
    });
  });

  it('still writes for true terminal / recovery reasons', () => {
    for (const reason of [
      'revision_1_failed',
      'revision_2_failed',
      'revision_2_uncertain',
      'invalid_early_event',
      'missing_prose_ready',
      null,
      undefined,
    ]) {
      expect(resolveItineraryOnlyTerminalPersistence({ reason }).shouldWrite).toBe(true);
    }
  });
});
