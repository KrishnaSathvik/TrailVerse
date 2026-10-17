import { describe, it, expect } from 'vitest';
import { buildQuickFillSummaryParts } from '@/lib/quickFillSummary';
import { createUntouchedFormData, touchFormField } from '@/lib/formDataProvenance';

/**
 * P0-4: the Quick Fill summary message speaks AS the traveler ("Here are my
 * trip details: …"). It may only state fields the traveler touched — the
 * wizard's untouched defaults (groupSize 2, 'moderate', 'camping') are not
 * the traveler's words.
 */

const WIZARD_DEFAULTS = {
  parkCode: '',
  startDate: '',
  endDate: '',
  groupSize: 2,
  budget: 'moderate',
  interests: [],
  fitnessLevel: 'moderate',
  accommodation: 'camping',
};

describe('buildQuickFillSummaryParts', () => {
  it('partially touched form: only the touched fields appear', () => {
    let form = createUntouchedFormData(WIZARD_DEFAULTS);
    form = touchFormField(form, { parkCode: 'yose' });
    form = touchFormField(form, { startDate: '2026-10-01', endDate: '2026-10-04' });

    const parts = buildQuickFillSummaryParts(form, 'Yosemite National Park');
    expect(parts).toEqual([
      '**Destination:** Yosemite National Park',
      '**Dates:** 2026-10-01 to 2026-10-04',
    ]);
  });

  it('a fully filled-in form states everything the traveler chose', () => {
    let form = createUntouchedFormData(WIZARD_DEFAULTS);
    form = touchFormField(form, {
      parkCode: 'zion',
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      groupSize: 4,
      interests: ['hiking', 'photography'],
      budget: 'luxury',
      fitnessLevel: 'easy',
      accommodation: 'lodge',
    });
    const parts = buildQuickFillSummaryParts(form, 'Zion National Park');
    expect(parts).toEqual([
      '**Destination:** Zion National Park',
      '**Dates:** 2026-06-01 to 2026-06-03',
      '**Group size:** 4',
      '**Interests:** hiking, photography',
      '**Budget:** luxury',
      '**Fitness level:** easy',
      '**Accommodation:** lodge',
    ]);
  });

  it('explicitly confirming a default value keeps it', () => {
    let form = createUntouchedFormData(WIZARD_DEFAULTS);
    form = touchFormField(form, { parkCode: 'zion', groupSize: 2 });
    const parts = buildQuickFillSummaryParts(form, 'Zion National Park');
    expect(parts).toContain('**Group size:** 2');
  });

  it('legacy form data without provenance keeps the old behavior', () => {
    const legacy = { parkCode: 'zion', groupSize: 4, budget: '1200', interests: [], startDate: '', endDate: '', fitnessLevel: '', accommodation: '' };
    const parts = buildQuickFillSummaryParts(legacy, 'Zion National Park');
    expect(parts).toEqual([
      '**Destination:** Zion National Park',
      '**Group size:** 4',
      '**Budget:** 1200',
    ]);
  });
});
