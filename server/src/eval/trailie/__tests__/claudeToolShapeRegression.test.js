'use strict';

/**
 * Stage 13.4 fixture → Stage 13.5 fix verification.
 *
 * The real claude-sonnet-5 create_itinerary call returned `input.days` as a JSON
 * STRING (a `{"days":[...]}` wrapper) — a complete, non-truncated response that the
 * strict validator rejected. Stage 13.5 adds bounded, claude-gated normalization,
 * so the observed shapes now FLIP to COMPLETE, while the schema/validator stay
 * strict and the repair stays narrow (claude + create_itinerary only).
 */

const { normalizeToolCalls, STRUCTURED_STATUS, TOOL_NAME } = require('../../../services/structuredItineraryGenerator');
const { isValidToolItinerary } = require('../../../utils/itineraryToolSchema');

const CANONICAL_DAYS = [{
  id: 'day-1', dayNumber: 1, label: 'Day 1 — South Rim',
  stops: [{ id: 'stop-1-1', order: 0, type: 'trail', name: 'Rim Trail', note: 'Easy', startTime: '09:00', duration: 90 }],
}];

const OBSERVED_STRINGIFIED_WRAPPED = { days: JSON.stringify({ days: CANONICAL_DAYS }) };
const STRINGIFIED_ARRAY = { days: JSON.stringify(CANONICAL_DAYS) };
const NATIVE_OK = { days: CANONICAL_DAYS };
const STRINGIFIED_MISSING_STOPS = { days: JSON.stringify([{ id: 'day-1', dayNumber: 1, label: 'Day 1' }]) };

const norm = (input, provider = 'claude', stopReason = 'tool_use') =>
  normalizeToolCalls({ toolCalls: [{ name: TOOL_NAME, input, id: 't1' }], stopReason, maxBytes: 200000, provider });

describe('Stage 13.5 — stringified tool-argument repair (observed live shape flips to COMPLETE)', () => {
  it('observed stringified WRAPPER now normalizes → COMPLETE with metadata', () => {
    const r = norm(OBSERVED_STRINGIFIED_WRAPPED);
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.toolInputNormalization).toBe('stringified_days_wrapper');
    expect(r.itineraryData.days).toEqual(CANONICAL_DAYS);
  });

  it('stringified ARRAY now normalizes → COMPLETE', () => {
    const r = norm(STRINGIFIED_ARRAY);
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.toolInputNormalization).toBe('stringified_days_array');
  });

  it('native canonical input completes with normalization=none (not rebuilt)', () => {
    const r = norm(NATIVE_OK);
    expect(r.status).toBe(STRUCTURED_STATUS.COMPLETE);
    expect(r.toolInputNormalization).toBe('none');
    expect(r.itineraryData).toEqual(NATIVE_OK);
  });

  it('validator remains STRICT: a normalized payload with missing stops still fails', () => {
    const r = norm(STRINGIFIED_MISSING_STOPS);
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
    expect(r.validationErrors).toContain('invalid_itinerary_shape');
    expect(r.toolInputNormalization).toBe('stringified_days_array'); // parsed, then rejected on shape
  });

  it('the repair is NARROW: without the claude gate the stringified shape stays rejected', () => {
    expect(norm(OBSERVED_STRINGIFIED_WRAPPED, 'openai').status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
    expect(norm(OBSERVED_STRINGIFIED_WRAPPED, null).status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
  });

  it('does not mutate the caller payload', () => {
    const input = { days: JSON.stringify({ days: CANONICAL_DAYS }) };
    norm(input);
    expect(typeof input.days).toBe('string');
  });

  it('malformed JSON in days is still rejected (not silently accepted)', () => {
    const r = norm({ days: '{bad json' });
    expect(r.status).toBe(STRUCTURED_STATUS.MALFORMED_TOOL);
    expect(r.normalizationFailureCode).toBe('invalid_json');
  });
});
