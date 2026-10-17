'use strict';

/**
 * PARK-WIDE OPERATIONAL RULES — trip-level, not stop-level.
 *
 * Some constraints belong to a park, a road or a canyon, not to any one stop:
 * a shuttle season that closes a scenic drive to private vehicles, shuttle-only
 * access into a canyon, a timed-entry reservation. They are read ONLY from an
 * official owner page's own text (never model prose), kept with their source and
 * excerpt, and resolved against the traveler's dates. An undated trip is told the
 * rule exists and to check the schedule; a year we cannot confirm is never guessed.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = `(${MONTHS.join('|')})`;
const PLACE_NOUN = '(?:Drive|Road|Highway|Parkway|Loop|Canyon|Valley|Route|Pass|Corridor|Island|Area)';
const NAME = `((?:[A-Z][\\w'’.-]*\\s+){0,3}${PLACE_NOUN})`;
const MAX_ITEMS = 3;

const VEHICLE_CLOSED = new RegExp(`${NAME}\\s+(?:is|are)\\s+closed to (?:private|personal) vehicles\\b`);
const VEHICLE_PROHIBITED = new RegExp(`(?:[Pp]rivate|[Pp]ersonal) vehicles (?:are )?(?:not (?:allowed|permitted)|prohibited) on\\s+${NAME}`);
const TRANSFER_ONLY = new RegExp(`[Aa]ccess (?:into|to)\\s+${NAME}\\s+is (?:by|via) (shuttle|ferry|boat)(?: bus)? only`);
const ACCESSIBLE_ONLY = new RegExp(`${NAME}\\s+is accessible only by (shuttle|ferry|boat)`);
const RESERVATION = /\b(timed[- ]entry|vehicle) (?:reservations?|permits?|tickets?) (?:is |are )?required\b/i;
const SEASON_LABEL = /\bduring (the [a-z ]*?season)\b/i;

const clean = value => String(value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const sentences = text => clean(text).split(/(?<=[.!?])\s+/);
const seasonalWords = /\bseason\b|\bduring\b|\bfrom\b[^.]*\b(?:through|until|to)\b|\bpart of the year\b/i;
const negated = (sentence, index) => /\b(?:no|not|never)\s+(?:\w+\s+){0,2}$/i.test(sentence.slice(Math.max(0, index - 24), index));
const pad = n => String(n).padStart(2, '0');

/** Explicit schedule periods near schedule wording; yearless periods stay yearless. */
function schedulePeriods(text) {
  const out = [];
  const flat = clean(text);
  const range = new RegExp(`${MONTH}\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?\\s*(?:to|through|until|-|–)\\s*(?:${MONTH}\\s+)?(\\d{1,2})(?:,\\s*(\\d{4}))?`, 'gi');
  for (const m of flat.matchAll(range)) {
    const window = flat.slice(Math.max(0, m.index - 300), m.index + m[0].length + 100);
    if (!/shuttle|season|service|operat|required|reservation|closed|open/i.test(window)) continue;
    const fromMonth = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    const toMonth = m[4] ? MONTHS.indexOf(m[4].toLowerCase()) + 1 : fromMonth;
    const year = m[6] || m[3] || null;
    const period = { from: `${pad(fromMonth)}-${pad(m[2])}`, to: `${pad(toMonth)}-${pad(m[5])}`, ...(year ? { year: Number(year) } : {}) };
    if (!out.some(p => p.from === period.from && p.to === period.to && p.year === period.year)) out.push(period);
  }
  return out;
}

/**
 * @returns {Array<Object>} park-wide rules stated on an official owner page.
 */
function officialPageParkRules({ title = null, text, url = null, parkCode = '', parkName = '', observedAt = null } = {}) {
  if (!text || !url) return [];
  const rules = [];
  const periods = schedulePeriods(text);
  const base = sentence => ({ parkCode: String(parkCode || '').toLowerCase(), parkName: parkName || null,
    sourceUrl: url, sourceTitle: title || null, excerpt: sentence.slice(0, 400), observedAt: observedAt || null,
    authority: 'official_owner' });
  for (const sentence of sentences(text)) {
    const vehicle = sentence.match(VEHICLE_CLOSED) || sentence.match(VEHICLE_PROHIBITED);
    if (vehicle && !negated(sentence, vehicle.index)) {
      const season = sentence.match(SEASON_LABEL)?.[1] || null;
      rules.push({ ...base(sentence), kind: 'private_vehicle_restriction', subject: vehicle[1].trim(), seasonLabel: season,
        seasonal: Boolean(season) || seasonalWords.test(sentence),
        requiredMode: /\bshuttle\b/i.test(sentence) ? 'shuttle' : /\bferry|boat\b/i.test(sentence) ? 'ferry' : null, periods });
    }
    const transfer = sentence.match(TRANSFER_ONLY) || sentence.match(ACCESSIBLE_ONLY);
    if (transfer && !negated(sentence, transfer.index)) {
      rules.push({ ...base(sentence), kind: 'transfer_required', subject: transfer[1].trim(),
        requiredMode: transfer[2].toLowerCase() === 'boat' ? 'ferry' : transfer[2].toLowerCase(), seasonal: seasonalWords.test(sentence), periods });
    }
    const reservation = sentence.match(RESERVATION);
    if (reservation && !negated(sentence, reservation.index)) {
      const own = schedulePeriods(sentence);
      rules.push({ ...base(sentence), kind: 'reservation_required', subject: parkName || null,
        reservationKind: /timed/i.test(reservation[1]) ? 'timed-entry' : 'vehicle',
        seasonal: own.length > 0 || seasonalWords.test(sentence), periods: own.length ? own : periods });
    }
  }
  return rules;
}

function periodRange(period, year) {
  const from = `${year}-${period.from}`;
  const to = period.to < period.from ? `${year + 1}-${period.to}` : `${year}-${period.to}`;
  return { from, to };
}

/** applies | not_applicable | date_dependent — never a guessed year. */
function applicability(rule, dates = {}) {
  if (!rule.seasonal) return 'applies';
  const start = dates.startDate, end = dates.endDate || dates.startDate;
  if (!start || !rule.periods?.length) return 'date_dependent';
  const tripYear = Number(start.slice(0, 4));
  const pageYear = rule.observedAt ? new Date(rule.observedAt).getUTCFullYear() : null;
  const usable = rule.periods.filter(p => p.year ? p.year === tripYear : pageYear === tripYear);
  if (!usable.length) return 'date_dependent';
  return usable.some(p => { const r = periodRange(p, p.year || tripYear); return start <= r.to && end >= r.from; })
    ? 'applies' : 'not_applicable';
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function travelerText(rule, state) {
  const mode = rule.requiredMode;
  if (rule.kind === 'private_vehicle_restriction') {
    if (!rule.seasonal) return `Private vehicles aren’t allowed on ${rule.subject}${mode ? ` — use the ${mode}` : ''}.`;
    if (state === 'applies') return `${capitalize(rule.seasonLabel || 'the restricted season')} covers your dates, so private vehicles aren’t allowed on ${rule.subject}${mode ? ` — plan to use the ${mode}` : ''}.`;
    return `During ${rule.seasonLabel || 'part of the year'}, private vehicles aren’t allowed on ${rule.subject}. Check the current ${mode ? `${mode} schedule` : 'access rules'} once your travel dates are set.`;
  }
  if (rule.kind === 'transfer_required') {
    if (!rule.seasonal || state === 'applies') return `Access into ${rule.subject} is by ${mode} only${rule.seasonal ? ' during your dates' : ''}.`;
    return `For part of the year, access into ${rule.subject} is by ${mode} only. Check the current schedule once your travel dates are set.`;
  }
  const park = rule.subject || 'This park';
  if (!rule.seasonal) return `${park} requires a ${rule.reservationKind} reservation to enter.`;
  if (state === 'applies') return `${park} requires a ${rule.reservationKind} reservation during your dates — book before you go.`;
  return `${park} requires a ${rule.reservationKind} reservation for part of the year. Check whether it applies once your travel dates are set.`;
}

/**
 * Trip-level "Things to know" items from official park-wide rules. A shuttle-only
 * transfer already implied by a private-vehicle restriction with the same mode is
 * one rule family, said once.
 */
function tripGuidanceFromRules(rules = [], dates = {}) {
  const items = [];
  const seen = new Set();
  const order = { reservation_required: 0, private_vehicle_restriction: 1, transfer_required: 2 };
  const sorted = [...rules].sort((a, b) => order[a.kind] - order[b.kind]);
  for (const rule of sorted) {
    if (rule.kind === 'transfer_required' && sorted.some(r => r.kind === 'private_vehicle_restriction'
      && r.parkCode === rule.parkCode && r.requiredMode === rule.requiredMode)) continue;
    const key = `${rule.parkCode}|${rule.kind}|${String(rule.subject || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const state = applicability(rule, dates);
    if (state === 'not_applicable') continue;
    items.push({ kind: rule.kind, text: travelerText(rule, state), applicability: state,
      parkCode: rule.parkCode || null, source: rule.sourceUrl, sourceTitle: rule.sourceTitle || null });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

module.exports = { officialPageParkRules, tripGuidanceFromRules, applicability, schedulePeriods };
