import { describe, it, expect } from 'vitest';
import {
  createUntouchedFormData,
  touchFormField,
  selectTravelerOwnedFormData,
  getTouchedFields,
} from '@/lib/formDataProvenance';

/**
 * P0-4 (audit 2026-08-31): UI default ≠ traveler preference. Quick Fill and
 * chat form state initialize with values (groupSize 1/2, budget 'moderate',
 * accommodation 'camping') that entered the model context as traveler
 * statements — Trailie argued about a "$3 total budget" and called the
 * traveler "solo" though they never said either. Only values the traveler
 * typed, selected, or confirmed may travel as constraints.
 *
 * Provenance is explicit, never inferred from values: a traveler who
 * deliberately chooses a value that happens to equal the default keeps it.
 */

const DEFAULTS = {
  parkCode: '',
  coordinates: null,
  startDate: '',
  endDate: '',
  groupSize: 1,
  budget: '',
  interests: [],
  fitnessLevel: '',
  accommodation: '',
};

describe('formDataProvenance', () => {
  it('an untouched form owns nothing', () => {
    const form = createUntouchedFormData(DEFAULTS);
    expect(getTouchedFields(form)).toEqual([]);
    expect(selectTravelerOwnedFormData(form)).toEqual({ fieldProvenance: {} });
  });

  it('touching a field makes exactly that field traveler-owned', () => {
    let form = createUntouchedFormData(DEFAULTS);
    form = touchFormField(form, { budget: '900' });
    expect(getTouchedFields(form)).toEqual(['budget']);
    const owned = selectTravelerOwnedFormData(form);
    expect(owned.budget).toBe('900');
    expect(owned.groupSize).toBeUndefined();
    expect(owned.accommodation).toBeUndefined();
  });

  it('explicitly choosing a value equal to the default still counts as owned', () => {
    let form = createUntouchedFormData(DEFAULTS);
    form = touchFormField(form, { groupSize: 1 });
    expect(selectTravelerOwnedFormData(form).groupSize).toBe(1);
  });

  it('partially touched form: touched fields travel, defaults do not', () => {
    let form = createUntouchedFormData({ ...DEFAULTS, groupSize: 2, budget: 'moderate', accommodation: 'camping' });
    form = touchFormField(form, { parkCode: 'yose', coordinates: { lat: 37.8, lon: -119.5 } });
    form = touchFormField(form, { startDate: '2026-10-01' });
    const owned = selectTravelerOwnedFormData(form);
    expect(owned.parkCode).toBe('yose');
    expect(owned.coordinates).toEqual({ lat: 37.8, lon: -119.5 });
    expect(owned.startDate).toBe('2026-10-01');
    expect(owned.budget).toBeUndefined();
    expect(owned.groupSize).toBeUndefined();
    expect(owned.accommodation).toBeUndefined();
    expect(owned.fitnessLevel).toBeUndefined();
  });

  it('ownership survives value updates to an already-touched field', () => {
    let form = createUntouchedFormData(DEFAULTS);
    form = touchFormField(form, { budget: '500' });
    form = touchFormField(form, { budget: '900' });
    expect(selectTravelerOwnedFormData(form).budget).toBe('900');
    expect(getTouchedFields(form)).toEqual(['budget']);
  });

  it('legacy form data without a provenance map passes through unchanged', () => {
    const legacy = { parkCode: 'zion', groupSize: 4, budget: '1200' };
    expect(selectTravelerOwnedFormData(legacy)).toEqual(legacy);
  });

  it('null and undefined pass through', () => {
    expect(selectTravelerOwnedFormData(null)).toBeNull();
    expect(selectTravelerOwnedFormData(undefined)).toBeUndefined();
  });

  it('the owned view keeps the provenance map for round-trips', () => {
    let form = createUntouchedFormData(DEFAULTS);
    form = touchFormField(form, { budget: '900' });
    const owned = selectTravelerOwnedFormData(form);
    expect(owned.fieldProvenance).toEqual({ budget: 'user' });
    // Re-filtering the owned view is idempotent.
    expect(selectTravelerOwnedFormData(owned)).toEqual(owned);
  });
});
