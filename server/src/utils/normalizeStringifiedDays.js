'use strict';

/**
 * Stage 13.5 — bounded defensive normalization for a stringified `days` tool arg.
 *
 * Real claude-sonnet-5 occasionally returns the create_itinerary tool input with
 * `days` as a JSON STRING (either a stringified array, or a stringified
 * `{"days":[...]}` wrapper) instead of a native array. This helper repairs ONLY
 * those two shapes, safely and once, then hands off to the UNCHANGED strict schema
 * + runtime validator. It never loosens validation: a repaired payload with a bad
 * itinerary shape still fails normally downstream.
 *
 * Safety contract:
 *   - JSON.parse only (never eval); parse at most ONCE; no recursive decode.
 *   - Bounded input string length.
 *   - Parsed value must be an array, or an object whose `days` is an array.
 *   - Reject: malformed JSON, primitives, nested stringification, oversized input,
 *     ambiguous wrappers (object without a usable `days` array).
 *   - Never mutate the input; return a shallow copy when repaired.
 *   - Only touches `days`; unrelated fields are untouched.
 */

const MAX_STRINGIFIED_DAYS_BYTES = 300000;

/**
 * @returns {{ input:Object, normalization:'none'|'stringified_days_array'|
 *   'stringified_days_wrapper'|'normalization_failed',
 *   failureCode: 'invalid_json'|'unsupported_parsed_type'|'nested_stringification'|
 *   'oversized_input'|'ambiguous_wrapper'|null }}
 */
function normalizeStringifiedDays(input, { maxStringBytes = MAX_STRINGIFIED_DAYS_BYTES } = {}) {
  const none = { input, normalization: 'none', failureCode: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return none;
  if (typeof input.days !== 'string') return none; // native (or absent) → do nothing

  const raw = input.days;
  if (Buffer.byteLength(raw, 'utf8') > maxStringBytes) {
    return { input, normalization: 'normalization_failed', failureCode: 'oversized_input' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw); // single parse — no recursive decode
  } catch {
    return { input, normalization: 'normalization_failed', failureCode: 'invalid_json' };
  }

  if (Array.isArray(parsed)) {
    return { input: { ...input, days: parsed }, normalization: 'stringified_days_array', failureCode: null };
  }

  if (parsed && typeof parsed === 'object') {
    // A wrapper that still stringifies its days is rejected (no double-decode).
    if (typeof parsed.days === 'string') {
      return { input, normalization: 'normalization_failed', failureCode: 'nested_stringification' };
    }
    if (Array.isArray(parsed.days)) {
      return { input: { ...input, days: parsed.days }, normalization: 'stringified_days_wrapper', failureCode: null };
    }
    return { input, normalization: 'normalization_failed', failureCode: 'ambiguous_wrapper' };
  }

  return { input, normalization: 'normalization_failed', failureCode: 'unsupported_parsed_type' };
}

module.exports = { normalizeStringifiedDays, MAX_STRINGIFIED_DAYS_BYTES };
