/**
 * Traveler-facing projection of one canonical day. Read-only: it merges a
 * dayStructure block with the stops it references so the itinerary shows one
 * activity per traveler action, never the block and its stop as two entries.
 * Canonical storage, identity and map data are untouched.
 */
import { verifiedTransferLabel } from './tripPresentation';
import { isSupportingItineraryStop } from '@/components/itinerary/ItineraryPresentationPrimitives';
import { formatTime12 } from '@/utils/sharedTripFormat';

const PERIOD_LABEL = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening' };
const SUPPORTING_KINDS = new Set(['meal', 'downtime', 'arrival', 'departure', 'outside_trip']);

const words = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 2);

/** True when `b` adds nothing a reader would not already get from `a`. */
export function restates(a, b) {
  const x = words(a); const y = words(b);
  if (!x.length || !y.length) return !y.length;
  const set = new Set(x);
  const shared = y.filter(w => set.has(w)).length;
  return shared / y.length >= 0.7 || x.join(' ').includes(y.join(' '));
}

// Uncertainty should reduce precision, not repeat as a disclaimer in every block.
// A clause is quieted only when its subject is conditions/hours/time/duration/access
// and it merely says that is unconfirmed; advice that changes what the traveler does stays.
const UNCONFIRMED = /\b(?:unconfirmed|(?:is|are|has been|have been) not (?:been )?confirmed|(?:is|are) not confirmed|not (?:been )?confirmed)\b/i;
const TOPIC = /\b(?:conditions|hours|time|duration|access)\b/i;
const TRAILING = /,?\s+(?:because|with|as|since)\s+(?:the\s+)?(?:exact\s+)?(?:road\s+|route\s+|travel\s+|driving\s+)?(?:time|duration)s?\s+(?:is\s+|are\s+)?(?:not\s+(?:been\s+)?confirmed|unconfirmed)/gi;
function isDisclaimer(clause) {
  const match = clause.match(UNCONFIRMED);
  if (!match) return false;
  const subject = clause.slice(0, match.index).trim().split(/\s+/).filter(Boolean);
  return subject.length <= 8 && TOPIC.test(subject.join(' '));
}
export function quietUncertainty(text) {
  const input = String(text || '');
  const sentences = input.replace(TRAILING, '').split(/(?<=\.)\s+/);
  const kept = sentences.map(sentence => {
    const end = /[.!?]$/.test(sentence) ? sentence.slice(-1) : '';
    const clauses = (end ? sentence.slice(0, -1) : sentence).split(/;\s*/).filter(c => c.trim() && !isDisclaimer(c));
    return clauses.length ? `${clauses.join('; ')}${end || '.'}` : '';
  }).filter(Boolean);
  const out = kept.join(' ').trim();
  return out ? out[0].toUpperCase() + out.slice(1) : '';
}
export function planHasQuietedUncertainty(plan) {
  const texts = (plan?.days || []).flatMap(day => [
    ...(day.dayStructure?.blocks || []).map(b => b.note),
    ...(day.stops || []).flatMap(s => [s.note, s.why]),
  ]).filter(Boolean);
  return texts.some(t => quietUncertainty(t) !== String(t).trim());
}

function distinctText(parts) {
  const kept = [];
  for (const part of parts.map(p => quietUncertainty(p)).filter(Boolean)) {
    if (!kept.some(k => restates(k, part))) kept.push(part);
  }
  return kept;
}

export function daypartLabel(periods) {
  const list = (periods || []).map(p => PERIOD_LABEL[p]).filter(Boolean);
  return list.length > 1 ? `${list[0]} → ${list.at(-1)}` : list[0] || null;
}

function stopTiming(stop) {
  const clock = stop.startTime && stop.timingReason ? formatTime12(stop.startTime) : null;
  return { daypart: stop.timeWindow || null, clock, timingReason: clock ? stop.timingReason : null };
}

/** Practical note first, optional why/framing second — never restating the activity title. */
function activityCopy(title, practicalParts, whyPart) {
  const notes = distinctText(practicalParts).filter(part => !restates(title, part));
  const practical = notes[0] || null;
  const whyCandidate = whyPart && !restates(title, whyPart) && !notes.some(note => restates(note, whyPart))
    ? quietUncertainty(whyPart)
    : null;
  const why = whyCandidate || notes[1] || null;
  return {
    practical,
    why,
    text: [practical, why].filter(Boolean),
  };
}

function activityFromStops(block, stops) {
  if (stops.length === 1) {
    const [stop] = stops;
    const timing = stopTiming(stop);
    const copy = activityCopy(stop.name, [stop.note, block?.note], stop.why);
    return {
      type: 'activity', key: `stop-${stop.id}`, title: stop.name,
      daypart: timing.daypart || daypartLabel(block?.periods), clock: timing.clock, timingReason: timing.timingReason,
      duration: stop.duration > 0 ? stop.duration : null, difficulty: stop.physicalDifficulty || stop.difficulty || null,
      exposure: stop.exposureLevel || stop.exposure || null,
      ...copy,
      requirements: stop.requirements || [], alternatives: stop.alternatives || [],
      stops: [stop],
    };
  }
  // One continuous outing over several places keeps the traveler's label and
  // lists the places inside it rather than splitting into separate activities.
  const copy = activityCopy(block.label, [block.note], null);
  return {
    type: 'activity', key: `block-${stops.map(s => s.id).join('-')}`, title: block.label,
    daypart: daypartLabel(block.periods), clock: null, timingReason: null,
    duration: stops.reduce((sum, s) => sum + (Number(s.duration) || 0), 0) || null, difficulty: null, exposure: null,
    ...copy,
    requirements: stops.flatMap(s => s.requirements || []), alternatives: [],
    stops,
  };
}

function blockItem(block, index) {
  const copy = activityCopy(block.label, [block.note], null);
  const base = {
    key: `block-${index}`, title: block.label, daypart: daypartLabel(block.periods),
    clock: block.startTime && block.timingReason ? formatTime12(block.startTime) : null,
    timingReason: block.startTime && block.timingReason ? block.timingReason : null,
    duration: block.duration > 0 ? block.duration : null, ...copy, stops: [], kind: block.kind,
  };
  if (block.kind === 'transfer') return { ...base, type: 'travel' };
  if (block.kind === 'experience') return { ...base, type: 'flexible' };
  return { ...base, type: SUPPORTING_KINDS.has(block.kind) ? 'supporting' : 'flexible' };
}

function legacyStopItem(stop) {
  const item = activityFromStops(null, [stop]);
  return isSupportingItineraryStop(stop) ? { ...item, type: 'supporting' } : item;
}

/**
 * Ordered display items for a day:
 *   activity  — an outing (one or more canonical places), shown once
 *   flexible  — a pinless experience
 *   supporting — meals, downtime, arrival/departure moments
 *   travel    — transfers, rendered as light connectors
 */
export function presentDay(day) {
  const stops = day?.stops || [];
  const blocks = day?.dayStructure?.blocks || [];
  // Track by position: canonical IDs are expected to be unique, but a
  // duplicated or missing ID must still show each stop exactly once.
  const used = new Set();
  const take = id => {
    const index = stops.findIndex((s, i) => !used.has(i) && s.id === id);
    if (index < 0) return null;
    used.add(index);
    return stops[index];
  };
  const items = [];
  blocks.forEach((block, index) => {
    if (block.kind === 'outing') {
      const linked = (block.stopIds || []).map(take).filter(Boolean);
      if (linked.length) items.push(activityFromStops(block, linked));
    } else {
      items.push(blockItem(block, index));
    }
  });
  // Legacy days (no structure) and any stop a structure did not reference.
  stops.forEach((s, i) => { if (!used.has(i)) items.push({ ...legacyStopItem(s), key: `stop-${i}-${s.id || 'x'}` }); });
  items.forEach(item => { item.stopIndexes = item.stops.map(s => stops.indexOf(s)); });

  // Verified road/shuttle time attaches to the travel line already describing
  // that move, or becomes a quiet connector. Unverified time is simply omitted.
  const out = [];
  for (const item of items) {
    const first = item.stops?.[0];
    const previousStop = [...out].reverse().find(i => i.stops?.length)?.stops.at(-1);
    const edge = first && previousStop && (day.travelEdges || []).find(e => e.sourceStopId === previousStop.id && e.targetStopId === first.id);
    const label = edge ? verifiedTransferLabel(edge) : null;
    if (label) {
      const last = out.at(-1);
      if (last?.type === 'travel' && !last.travelTime) last.travelTime = label;
      else out.push({ type: 'travel', key: `edge-${previousStop.id}-${first.id}`, title: null, travelTime: label, text: [], stops: [] });
    }
    out.push(item);
  }
  // A daypart label is printed only where it changes.
  let previous = null;
  for (const item of out) {
    item.showDaypart = Boolean(item.daypart) && item.type !== 'travel' && item.daypart !== previous;
    if (item.type !== 'travel' && item.daypart) previous = item.daypart;
  }
  return out;
}

/** Count of pinless experiences in a plan, for a quiet map note. */
export function flexibleActivityCount(plan) {
  return (plan?.days || []).reduce((n, day) => n + (day.dayStructure?.blocks || []).filter(b => b.kind === 'experience').length, 0);
}
