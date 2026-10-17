'use strict';

const { diagnoseDayTypes } = require('../trailieDayTypeDiagnosis');
const { validateDayCompleteness } = require('../dayCompleteness');

const block = (kind, periods = ['morning', 'afternoon']) => ({
  kind, periods, label: 'Private label', note: 'Private note', stopIds: kind === 'outing' ? ['private-stop'] : [],
});
const day = (type = 'sightseeing', blocks = [block('outing')]) => ({
  dayNumber: 3, date: '2026-10-15', overnightLocation: 'Private hotel',
  stops: [{ id: 'private-stop', name: 'Private place', duration: 45, timeWindow: 'Morning' }],
  dayStructure: { type, summary: 'Private summary', startPeriod: 'morning', endPeriod: 'afternoon', blocks },
});

test.each([
  ['late sightseeing start', () => { const d = day(); d.dayStructure.startPeriod = 'midday'; d.dayStructure.blocks[0].periods = ['midday', 'afternoon']; return d; }, 'sightseeing_span'],
  ['early sightseeing finish', () => { const d = day(); d.dayStructure.endPeriod = 'midday'; d.dayStructure.blocks[0].periods = ['morning', 'midday']; return d; }, 'sightseeing_span'],
  ['outside-trip morning', () => day('sightseeing', [block('outside_trip', ['morning']), block('outing', ['midday', 'afternoon'])]), 'sightseeing_outside_trip'],
  ...['arrival', 'departure', 'transfer', 'rest'].map(type => [`missing ${type} block`, () => day(type), 'missing_matching_block']),
])('%s retains a replayable, located conflict', (_name, make, rule) => {
  const original = make();
  const before = structuredClone(original);
  expect(validateDayCompleteness(original)).toContain('day_type_inconsistent');
  const report = diagnoseDayTypes({ plan: { days: [original] }, issues: ['day_type_inconsistent'] });
  expect(report.status).toBe('complete');
  expect(report.days[0]).toMatchObject({ dayIndex: 0, dayNumber: 3, status: 'complete', conflicts: [expect.objectContaining({ rule })] });
  expect(validateDayCompleteness(report.days[0].replayDay)).toContain('day_type_inconsistent');
  expect(original).toEqual(before);
});

test('locates the offending block and exact conflicting periods', () => {
  const d = day('sightseeing', [block('outing', ['morning']), block('outside_trip', ['midday', 'afternoon'])]);
  expect(diagnoseDayTypes({ plan: { days: [d] } }).days[0].conflicts).toEqual([{
    code: 'day_type_inconsistent', rule: 'sightseeing_outside_trip', blockIndex: 1,
    path: 'dayStructure.blocks[1].periods', actual: { type: 'sightseeing', kind: 'outside_trip', periods: ['midday', 'afternoon'] },
    expected: { periods: ['evening'] },
  }]);
});

test('valid declarations do not produce a conflict; stop binding survives without identities', () => {
  const report = diagnoseDayTypes({ plan: { days: [day()] } });
  expect(report.days[0].conflicts).toEqual([]);
  const replay = report.days[0].replayDay;
  expect(replay.stops[0].id).toBe(replay.dayStructure.blocks[0].stopIds[0]);
  expect(JSON.stringify(report)).not.toMatch(/Private|private-stop|2026-10-15/);
});

test('does not diagnose an untouched patch day or claim reproduction without the applied candidate', () => {
  expect(diagnoseDayTypes({ plan: { days: [day('rest')] }, touchedDayNumbers: [] }).days).toEqual([]);
  expect(diagnoseDayTypes({ plan: null, issues: ['day_type_inconsistent'] }).status).toBe('plan_unavailable');
  expect(diagnoseDayTypes({ plan: { days: [day()] }, issues: ['day_type_inconsistent'] }).status).toBe('unresolved');
});

test('bounds oversized output and marks it incomplete instead of guessing', () => {
  const d = day('rest', Array.from({ length: 40 }, () => block('outing')));
  const report = diagnoseDayTypes({ plan: { days: Array.from({ length: 100 }, () => d) } });
  expect(report.status).toBe('truncated');
  expect(report.days).toHaveLength(60);
  expect(report.days[0].replayDay.dayStructure.blocks).toHaveLength(32);
  expect(report.days[0].conflicts).toEqual([]);
});
