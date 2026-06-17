const { extractMessageConstraintOverrides, applyMessageConstraintOverrides } = require('../messageConstraintOverrides');
const { parseConstraints } = require('../constraintEngine');

describe('messageConstraintOverrides', () => {
  const quickFillForm = {
    parkCode: 'yose',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    groupSize: 2,
    budget: 'moderate',
    fitnessLevel: 'easy',
    accommodation: 'lodging',
    interests: ['photography', 'scenic drives'],
  };

  const overrideMsg =
    "Actually make it solo, cheaper, and remove lodge stays. I'll camp instead.";

  test('extracts solo, budget, and camping from correction message', () => {
    const overrides = extractMessageConstraintOverrides(overrideMsg);
    expect(overrides.groupSize).toBe(1);
    expect(overrides.budget).toBe('budget');
    expect(overrides.accommodation).toBe('camping');
  });

  test('applyMessageConstraintOverrides merges onto formData', () => {
    const merged = applyMessageConstraintOverrides(quickFillForm, overrideMsg);
    expect(merged.groupSize).toBe(1);
    expect(merged.budget).toBe('budget');
    expect(merged.accommodation).toBe('camping');
    expect(merged.parkCode).toBe('yose');
    expect(merged.interests).toEqual(['photography', 'scenic drives']);
  });

  test('parseConstraints prefers message overrides over stale formData', () => {
    const constraints = parseConstraints({ formData: quickFillForm }, overrideMsg);
    expect(constraints.groupSize).toBe(1);
    expect(constraints.budget).toBe('budget');
    expect(constraints.accommodation).toBe('camping');
    expect(constraints.parkCode).toBe('yose');
    expect(constraints.dates.numDays).toBe(3);
  });

  test('parseConstraints keeps formData when message has no corrections', () => {
    const constraints = parseConstraints(
      { formData: quickFillForm },
      'Can you add more photography spots?'
    );
    expect(constraints.groupSize).toBe(2);
    expect(constraints.budget).toBe('moderate');
    expect(constraints.accommodation).toBe('lodging');
  });
});
