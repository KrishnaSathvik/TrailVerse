'use strict';

const DAY_TYPES = ['sightseeing', 'arrival', 'departure', 'transfer', 'rest'];
const PERIODS = ['morning', 'midday', 'afternoon', 'evening'];
const KINDS = ['outing', 'experience', 'meal', 'downtime', 'arrival', 'departure', 'transfer', 'outside_trip'];
const DAY_STRUCTURE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['type', 'summary', 'startPeriod', 'endPeriod', 'blocks'],
  properties: {
    type: { type: 'string', enum: DAY_TYPES },
    startPeriod: { type: 'string', enum: PERIODS },
    endPeriod: { type: 'string', enum: PERIODS },
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    blocks: { type: 'array', minItems: 1, maxItems: 16, items: {
      type: 'object', additionalProperties: false,
      required: ['kind', 'periods', 'label', 'note', 'stopIds'],
      properties: {
        kind: { type: 'string', enum: KINDS },
        periods: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: PERIODS } },
        label: { type: 'string', minLength: 1, maxLength: 120 },
        note: { type: 'string', minLength: 1, maxLength: 1000 },
        startTime: { type: 'string' },
        timingReason: { type: 'string', maxLength: 400 },
        duration: { type: 'number', minimum: 0 },
        stopIds: { type: 'array', uniqueItems: true, items: { type: 'string' } },
      },
    } },
  },
};
const clock = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const text = value => typeof value === 'string' && value.trim().length > 0;

// Check declarations and arithmetic, never prescribe attractions, stop counts,
// minimum outing hours or infer the model's travel judgment from keywords.
function validateDayCompleteness(day, { required = true } = {}) {
  const issues = new Set();
  const add = code => issues.add(code);
  const shape = day.dayStructure;
  const stops = day.stops || [];
  if (!shape && !required) return []; // Do not retrofit untouched legacy schedules during a note edit.
  if (!shape) {
    if (required) add('day_structure_missing');
  } else {
    const blocks = shape.blocks;
    const from = PERIODS.indexOf(shape.startPeriod);
    const to = PERIODS.indexOf(shape.endPeriod);
    if (!DAY_TYPES.includes(shape.type) || from < 0 || to < from || !text(shape.summary) || !Array.isArray(blocks) || !blocks.length) {
      add('day_structure_invalid');
    } else {
      const covered = new Set();
      const refs = [];
      let previousPeriod = -1;
      for (const block of blocks) {
        if (!KINDS.includes(block.kind) || !text(block.label) || !text(block.note)
          || !Array.isArray(block.periods) || !block.periods.length || !Array.isArray(block.stopIds)) {
          add('day_structure_invalid'); continue;
        }
        const ranks = block.periods.map(p => PERIODS.indexOf(p));
        if (ranks.some(r => r < 0) || new Set(ranks).size !== ranks.length
          || ranks.some((r, i) => i > 0 && r <= ranks[i - 1])) add('day_structure_invalid');
        if (ranks[0] < previousPeriod) add('daypart_order_invalid');
        previousPeriod = ranks.at(-1);
        // Endpoints describe a continuous span: one big outing can cover midday
        // without manufacturing a separate lunch activity.
        for (let rank = ranks[0]; rank <= ranks.at(-1); rank += 1) covered.add(PERIODS[rank]);
        if (ranks[0] < from || ranks.at(-1) > to) add('day_scope_invalid');
        refs.push(...block.stopIds);
        if (block.duration != null && (!Number.isFinite(block.duration) || block.duration < 0)) add('day_structure_invalid');
        if (block.kind === 'outing' && !block.stopIds.length) add('day_outing_unbound');
        if (block.kind !== 'outing' && block.stopIds.length) add('day_structure_invalid');
        if (shape.type === 'sightseeing' && block.kind === 'outside_trip'
          && block.periods.some(p => p !== 'evening')) add('day_type_inconsistent');
      }
      if (PERIODS.slice(from, to + 1).some(p => !covered.has(p))) add('day_time_unaccounted');
      if (refs.length !== stops.length || new Set(refs).size !== refs.length
        || refs.some((id, i) => id !== stops[i]?.id)) add('day_stop_coverage_invalid');
      if (shape.type === 'sightseeing' && (from !== 0 || to < PERIODS.indexOf('afternoon'))) add('day_type_inconsistent');
      if (shape.type === 'sightseeing' && !stops.length && !blocks.some(b => b.kind === 'experience')) add('day_accidentally_empty');
      const honestKind = { arrival: 'arrival', departure: 'departure', transfer: 'transfer', rest: 'downtime' }[shape.type];
      if (honestKind && !blocks.some(b => b.kind === honestKind)) add('day_type_inconsistent');
    }
  }
  // Non-place commitments (ferry, flight, check-in) take part in the same
  // chronology as place outings, without acquiring fake map coordinates.
  const timeline = shape && Array.isArray(shape.blocks) ? shape.blocks.flatMap(block => block.kind === 'outing'
    ? (block.stopIds || []).map(id => stops.find(s => s.id === id)).filter(Boolean)
    : [{ ...block, nonPlace: true }]) : stops;
  const activityMinutes = timeline.reduce((sum, item) => sum + (Number.isFinite(item.duration) && item.duration > 0 ? item.duration : 0), 0);
  const travelMinutes = (day.travelEdges || []).reduce((sum, edge) => sum + (edge.status === 'verified' && Number.isFinite(edge.durationSeconds) && edge.durationSeconds > 0 ? edge.durationSeconds / 60 : 0), 0);
  if (activityMinutes + travelMinutes > 1440) add('day_exceeds_24_hours');
  let previous = null;
  for (let i = 0; i < timeline.length; i += 1) {
    const stop = timeline[i];
    const start = clock(stop.startTime);
    // Legacy accepted plans remain readable; require precision rationale when
    // creating/replacing a day or editing an already structured day.
    if (required || shape) {
      if (stop.startTime && start === null) add('clock_format_invalid');
      if (start !== null && !text(stop.timingReason)) add('clock_reason_missing');
      if (!stop.nonPlace && start === null && !text(stop.timeWindow)) add('daypart_missing');
    }
    if (start !== null) {
      if (stop.nonPlace && (!Number.isFinite(stop.duration) || stop.duration < 0)) add('commitment_duration_missing');
      if (Number.isFinite(stop.duration) && start + stop.duration > 1440) add('activity_past_midnight');
      if (previous) {
        const intervening = timeline.slice(previous.index, i);
        const activityMinutes = intervening.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
        const routeMinutes = (day.travelEdges || []).filter(e => e.status === 'verified'
          && Number.isFinite(e.durationSeconds) && e.durationSeconds >= 0
          && timeline.slice(previous.index, i).some(s => s.id === e.sourceStopId)
          && timeline.slice(previous.index + 1, i + 1).some(s => s.id === e.targetStopId))
          .reduce((sum, e) => sum + e.durationSeconds / 60, 0);
        if (start < previous.start + activityMinutes) add('activity_time_overlap');
        else if (start < previous.start + activityMinutes + routeMinutes) add('transfer_time_overlap');
      }
      previous = { index: i, start };
    }
  }
  return [...issues];
}
function validateBaseTransition(previousDay, day) {
  const normalize = value => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const before = normalize(previousDay?.overnightLocation);
  const after = normalize(day?.overnightLocation);
  // Without resolved base coordinates this verifies that a move is accounted
  // for, not its geographic feasibility or duration. Never manufacture either.
  return before && after && before !== after && day.dayStructure
    && !day.dayStructure.blocks?.some(block => block.kind === 'transfer')
    ? ['base_change_unaccounted'] : [];
}
module.exports = { DAY_STRUCTURE_SCHEMA, validateDayCompleteness, validateBaseTransition, DAY_TYPES, PERIODS };
