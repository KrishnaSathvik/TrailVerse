'use strict';

const { DAY_TYPES, PERIODS, DAY_STRUCTURE_SCHEMA, validateDayCompleteness } = require('./dayCompleteness');

const KINDS = DAY_STRUCTURE_SCHEMA.properties.blocks.items.properties.kind.enum;
const LIMITS = { days: 60, blocks: 32, stops: 64, periods: 8, references: 64 };
const present = value => typeof value === 'string' && value.trim() ? '[present]' : '';
const member = (value, values) => values.includes(value) ? value : null;

// Private diagnostic projection, NOT a plan or an alternative validator. Retain
// only declarations needed to replay day_type_inconsistent, with anonymous local
// stop references. No traveler quotes, names, notes, dates, coordinates or memory.
function projectDay(day) {
  let truncated = false;
  const bounded = (value, limit) => {
    if (!Array.isArray(value)) return null;
    if (value.length > limit) truncated = true;
    return value.slice(0, limit);
  };
  const ids = new Map();
  const ref = value => {
    if (typeof value !== 'string') return null;
    if (!ids.has(value)) ids.set(value, `stop-${ids.size + 1}`);
    return ids.get(value);
  };
  const stops = bounded(day.stops || [], LIMITS.stops)?.map(stop => ({ id: ref(stop?.id) }));
  const shape = day.dayStructure;
  const replayDay = { stops, dayStructure: shape ? {
    type: member(shape.type, DAY_TYPES), summary: present(shape.summary),
    startPeriod: member(shape.startPeriod, PERIODS), endPeriod: member(shape.endPeriod, PERIODS),
    blocks: bounded(shape.blocks, LIMITS.blocks)?.map(block => ({
      kind: member(block?.kind, KINDS), label: present(block?.label), note: present(block?.note),
      periods: bounded(block?.periods, LIMITS.periods)?.map(period => member(period, PERIODS)),
      stopIds: bounded(block?.stopIds, LIMITS.references)?.map(ref),
    })),
  } : null };
  return { replayDay, truncated };
}

function describeConflicts(day) {
  // Only describe a failure confirmed by the unchanged authoritative validator.
  if (!validateDayCompleteness(day).includes('day_type_inconsistent')) return [];
  const shape = day.dayStructure;
  const conflicts = [];
  if (shape.type === 'sightseeing') {
    if (shape.startPeriod !== 'morning' || PERIODS.indexOf(shape.endPeriod) < PERIODS.indexOf('afternoon')) {
      conflicts.push({ code: 'day_type_inconsistent', rule: 'sightseeing_span',
        path: 'dayStructure', actual: { type: shape.type, startPeriod: shape.startPeriod, endPeriod: shape.endPeriod },
        expected: { startPeriod: 'morning', endPeriod: ['afternoon', 'evening'] } });
    }
    shape.blocks.forEach((block, blockIndex) => {
      if (block.kind === 'outside_trip' && block.label && block.note && Array.isArray(block.stopIds)
        && block.periods?.some(period => period !== 'evening')) {
        conflicts.push({ code: 'day_type_inconsistent', rule: 'sightseeing_outside_trip', blockIndex,
          path: `dayStructure.blocks[${blockIndex}].periods`,
          actual: { type: shape.type, kind: block.kind, periods: block.periods }, expected: { periods: ['evening'] } });
      }
    });
  }
  const kind = { arrival: 'arrival', departure: 'departure', transfer: 'transfer', rest: 'downtime' }[shape.type];
  if (kind && !shape.blocks.some(block => block.kind === kind)) {
    conflicts.push({ code: 'day_type_inconsistent', rule: 'missing_matching_block',
      path: 'dayStructure.blocks', actual: { type: shape.type, blockKinds: shape.blocks.map(block => block.kind) },
      expected: { requiredBlockKind: kind } });
  }
  return conflicts;
}

function diagnoseDayTypes({ plan, touchedDayNumbers = null, issues = [] } = {}) {
  if (!Array.isArray(plan?.days)) return { status: 'plan_unavailable', days: [] };
  const days = plan.days.slice(0, LIMITS.days).flatMap((day, dayIndex) => {
    if (Array.isArray(touchedDayNumbers) && !touchedDayNumbers.includes(day.dayNumber)) return [];
    const projection = projectDay(day);
    let conflicts = [], status = projection.truncated ? 'truncated' : 'complete';
    try { if (!projection.truncated) conflicts = describeConflicts(projection.replayDay); }
    catch { status = 'malformed_day'; }
    return [{ dayIndex, dayNumber: Number.isFinite(day.dayNumber) ? day.dayNumber : null,
      status, ...projection, conflicts }];
  });
  const truncated = plan.days.length > LIMITS.days || days.some(day => day.truncated);
  return { status: truncated ? 'truncated' : issues.includes('day_type_inconsistent') && !days.some(day => day.conflicts.length)
    ? 'unresolved' : 'complete', limits: LIMITS, days };
}

module.exports = { diagnoseDayTypes };
