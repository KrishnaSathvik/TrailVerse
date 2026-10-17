'use strict';

/**
 * Generic same-place detection for itinerary diversity.
 * "Pa'rus Trail" and "Pa'rus Trail riverside exhibits" are one experience.
 * "Lower Emerald Pool" and "Upper Emerald Pool" stay distinct.
 */

function normalizeExperienceName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A trailing daypart is a LABEL on a visit, not part of a place's name.
 * "Pa'rus Trail morning" and "Pa'rus Trail afternoon" are one trail; without
 * this, neither is a prefix of the other and the pair reads as two places.
 *
 * Deliberately narrow: anchored at the END, word-bounded, and only applied
 * while two or more tokens survive. "Morning Glory Pool" and "Sunset Point"
 * keep their names — the daypart there is not trailing. This normalises
 * IDENTITY only; whether a second visit is legitimate is still decided from
 * structured stop fields by `classifyExperienceRelationship`.
 */
const TRAILING_DAYPART =
  /(?:\bat\b|\bin the\b|\bfor\b)?\s*(?:early|late|mid)?\s*(?:morning|midday|noon|afternoon|evening|night|sunrise|sunset|dawn|dusk|golden hour|blue hour|first light)$/;

function stripTrailingDaypart(key) {
  let current = key;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.replace(TRAILING_DAYPART, '').replace(/\s+/g, ' ').trim();
    if (next === current) break;
    // Never strip a name down to a single token — that would start merging
    // unrelated places rather than recognising one.
    if (next.split(' ').filter(Boolean).length < 2) break;
    current = next;
  }
  return current;
}

function canonicalExperienceKey(name) {
  const base = normalizeExperienceName(name)
    .replace(/\b(the|an)\b/g, ' ')
    .replace(/\ba\b(?=\s)/g, ' ')
    .replace(/\b(riverside exhibits?|exhibits?|out and back|loop trail|area walk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripTrailingDaypart(base);
}

function isSameCanonicalExperience(leftName, rightName) {
  const left = canonicalExperienceKey(leftName);
  const right = canonicalExperienceKey(rightName);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return longer === shorter || longer.startsWith(`${shorter} `);
}

/**
 * Same PLACE is not the same EXPERIENCE.
 *
 * `isSameCanonicalExperience` answers a NAME question, and the day-diversity
 * rule used to treat its answer as the whole story. That conflated two very
 * different things:
 *
 *   padding  — "Pa'rus Trail" and "Pa'rus Trail scenic walk" back to back,
 *              one walk renamed twice to make a day look full;
 *   a revisit — the river walk in the morning and a photography stop at the
 *              same trail in late-afternoon light, with something else in
 *              between. On a relaxed, no-exposure, photography-led Zion valley
 *              day that is the RIGHT plan, and rejecting it forces Trailie to
 *              invent inferior variety it has no evidence for.
 *
 * The distinction is decided from STRUCTURED stop fields the tool schema
 * already carries — never from title text, which is exactly the heuristic this
 * replaces. A second visit must PROVE itself:
 *
 *   1. purpose — the two stops carry different `type` values, and exactly one
 *      of them is a purpose-shaped type (`photography`, `picnic`, `wildlife`,
 *      `ranger_program`) rather than a place category. That is the only
 *      place-vs-purpose distinction the enum actually encodes.
 *   2. schedule — either distinct structured dayparts (`startTime` /
 *      `timeWindow`), or at least one different experience scheduled between
 *      them.
 *
 * Anything less is `same_experience` or `unknown`, and neither may be read as a
 * legitimate revisit. Unknown fails closed on purpose: a model that omits the
 * structure gets padding treatment, not the benefit of the doubt.
 */
const PURPOSE_STOP_TYPES = new Set([
  'photography',
  'picnic',
  'wildlife',
  'ranger_program',
]);

function stopType(stop) {
  return String(stop?.type || '').toLowerCase().trim();
}

/**
 * Coarse daypart from the two structured temporal fields.
 *
 * Both are read, but note WHERE this runs: by the time day diversity is judged,
 * `normalizeSchedulePrecision` has already converted every non-operational
 * `startTime` into a canonical `timeWindow` label and blanked the clock field.
 * So `timeWindow` is the field that actually carries the signal downstream, and
 * the clock branch matters only for a raw, pre-finalization plan. The two
 * branches use the SAME thresholds so they can never disagree about one stop.
 *
 * A stop that populates neither has no temporal slot at all (null), which can
 * never satisfy the separation test.
 */
function daypartFromHour(hour) {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (hour < 12) return 'morning';
  if (hour < 15) return 'afternoon';
  return 'evening';
}

function structuredDaypart(stop) {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(stop?.startTime || '').trim());
  if (clock) {
    const daypart = daypartFromHour(Number(clock[1]));
    if (daypart) return daypart;
  }
  const window = String(stop?.timeWindow || '').toLowerCase();
  if (!window.trim()) return null;
  // Canonical labels produced by `toDaypart` are matched first, then the freer
  // phrasing a model may write when it supplied no clock time at all.
  if (/\b(sunset|golden hour|dusk|evening|night|late afternoon)\b/.test(window)) return 'evening';
  if (/\bafternoon\b/.test(window)) return 'afternoon';
  if (/\b(midday|noon|lunch)\b/.test(window)) return 'midday';
  if (/\b(sunrise|dawn|morning)\b/.test(window)) return 'morning';
  return null;
}

function hasDistinctDaypart(left, right) {
  const a = structuredDaypart(left);
  const b = structuredDaypart(right);
  return Boolean(a) && Boolean(b) && a !== b;
}

/** At least one genuinely different experience scheduled between the two visits. */
function hasSeparatingStop(interveningStops, left, right) {
  return (interveningStops || []).some((stop) => {
    const name = String(stop?.name || '').trim();
    if (!name) return false;
    return !isSameCanonicalExperience(name, left?.name)
      && !isSameCanonicalExperience(name, right?.name);
  });
}

/**
 * @param {object} stopA
 * @param {object} stopB
 * @param {{ interveningStops?: object[], identityRelation?: 'same'|'distinct'|null }} [options]
 *        `interveningStops`: stops scheduled between A and B on the same day, in order.
 *        `identityRelation`: authoritative entity verdict (stopExperienceIdentity.js).
 *        When present it REPLACES the name test for "same base place?"; null
 *        keeps the legacy canonical-name test.
 * @returns {'distinct'|'same_experience'|'same_place_distinct_visit'|'unknown'}
 */
function classifyExperienceRelationship(stopA, stopB, { interveningStops = [], identityRelation = null } = {}) {
  if (identityRelation === 'distinct') return 'distinct';
  if (identityRelation !== 'same' && !isSameCanonicalExperience(stopA?.name, stopB?.name)) return 'distinct';

  const typeA = stopType(stopA);
  const typeB = stopType(stopB);
  const purposeDistinct = Boolean(typeA) && Boolean(typeB)
    && typeA !== typeB
    && PURPOSE_STOP_TYPES.has(typeA) !== PURPOSE_STOP_TYPES.has(typeB);
  // No structured purpose difference: this is the same experience wearing two
  // names, however the titles were dressed up.
  if (!purposeDistinct) return 'same_experience';

  const separated = hasDistinctDaypart(stopA, stopB)
    || hasSeparatingStop(interveningStops, stopA, stopB);
  // Purpose differs but nothing places the two visits apart in the day. Not
  // provably padding, not provably a revisit — and `unknown` is never treated
  // as permission.
  return separated ? 'same_place_distinct_visit' : 'unknown';
}

module.exports = {
  PURPOSE_STOP_TYPES,
  normalizeExperienceName,
  canonicalExperienceKey,
  isSameCanonicalExperience,
  classifyExperienceRelationship,
  structuredDaypart,
};
