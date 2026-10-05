'use strict';

const { normalizeStringifiedDays, MAX_STRINGIFIED_DAYS_BYTES } = require('../normalizeStringifiedDays');

const DAYS = [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops: [{ id: 's1', order: 0, type: 'trail', name: 'X', note: '', startTime: '09:00', duration: 60 }] }];

describe('Stage 13.5 — normalizeStringifiedDays (bounded, safe)', () => {
  it('leaves a native array payload untouched (normalization=none, not rebuilt)', () => {
    const input = { days: DAYS, extra: 'keep' };
    const r = normalizeStringifiedDays(input);
    expect(r.normalization).toBe('none');
    expect(r.input).toBe(input); // same reference — not rebuilt
  });

  it('repairs a stringified ARRAY', () => {
    const input = { days: JSON.stringify(DAYS) };
    const r = normalizeStringifiedDays(input);
    expect(r.normalization).toBe('stringified_days_array');
    expect(Array.isArray(r.input.days)).toBe(true);
    expect(r.input.days).toEqual(DAYS);
    expect(input.days).toBe(JSON.stringify(DAYS)); // original not mutated
  });

  it('repairs a stringified WRAPPER {"days":[...]}', () => {
    const input = { days: JSON.stringify({ days: DAYS }) };
    const r = normalizeStringifiedDays(input);
    expect(r.normalization).toBe('stringified_days_wrapper');
    expect(r.input.days).toEqual(DAYS);
  });

  it('rejects malformed JSON', () => {
    const r = normalizeStringifiedDays({ days: '{not valid json' });
    expect(r.normalization).toBe('normalization_failed');
    expect(r.failureCode).toBe('invalid_json');
  });

  it('rejects a parsed primitive', () => {
    const r = normalizeStringifiedDays({ days: '42' });
    expect(r.failureCode).toBe('unsupported_parsed_type');
  });

  it('rejects nested/double stringification (no recursive decode)', () => {
    const input = { days: JSON.stringify({ days: JSON.stringify(DAYS) }) };
    const r = normalizeStringifiedDays(input);
    expect(r.normalization).toBe('normalization_failed');
    expect(r.failureCode).toBe('nested_stringification');
  });

  it('rejects oversized input', () => {
    const big = 'x'.repeat(MAX_STRINGIFIED_DAYS_BYTES + 1);
    const r = normalizeStringifiedDays({ days: big });
    expect(r.failureCode).toBe('oversized_input');
  });

  it('rejects an ambiguous wrapper with no days array', () => {
    const r = normalizeStringifiedDays({ days: JSON.stringify({ foo: 1 }) });
    expect(r.failureCode).toBe('ambiguous_wrapper');
  });

  it('does not touch a payload whose days is already an array', () => {
    expect(normalizeStringifiedDays({ days: [] }).normalization).toBe('none');
  });

  it('ignores non-object inputs', () => {
    expect(normalizeStringifiedDays(null).normalization).toBe('none');
    expect(normalizeStringifiedDays('str').normalization).toBe('none');
    expect(normalizeStringifiedDays([1, 2]).normalization).toBe('none');
  });
});
