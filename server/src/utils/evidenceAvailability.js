'use strict';

/**
 * PHASE 4O — HARD UNAVAILABILITY, RESOLVED BEFORE THE MODEL SEES A CATALOGUE.
 *
 * Phase 4N offered `Death Canyon Trailhead` to the repair model while the SAME
 * frozen bundle carried an official `Park Closure` alert saying "Death Canyon
 * Road and Trailhead are closed to all use." Paying a model to select a place we
 * already know is unusable, so a validator can reject it afterwards, is waste at
 * best and a delivered mistake at worst.
 *
 * TWO CATEGORIES, DELIBERATELY NOT COLLAPSED.
 *
 *   HARD UNAVAILABLE        closed, officially unavailable — excluded HERE, before spend
 *   CONDITIONAL DEPENDENCY  permit, reservation, 4WD — KEPT, and policed after the
 *                           merge by the traveler-fit path Phase 4L proved works
 *
 * "Has an operational fact" must never become "not selectable": that would
 * delete every legitimate recommendation that happens to need a permit, and it
 * would retire the one validation path 4L showed can bind a frozen fact to a
 * repair-introduced stop.
 *
 * CONSERVATISM IS THE WHOLE DESIGN. A false exclusion silently shrinks the
 * recommendation universe, and nothing downstream can notice. So this reads only
 * alerts the park itself categorised as `Park Closure`, and matches only by
 * EXACT identity equality against a subject phrase it can name:
 *
 *   title       "Death Canyon Trailhead Construction Closure"
 *                 -> strip trailing boilerplate -> "death canyon trailhead"
 *   predicate   "Death Canyon Road and Trailhead are closed to all use."
 *                 -> subject "Death Canyon Road and Trailhead"
 *                 -> distribute the shared prefix -> "death canyon road", "death canyon trailhead"
 *
 * A closure that names no identity this bundle enumerates excludes nothing, and
 * that is the correct outcome — not a licence to guess.
 */

const CLOSURE_TOPICS = Object.freeze(['alerts_closures', 'roads']);

/** The park's own classification. Nothing here infers a closure from prose alone. */
const CLOSURE_CATEGORY = 'park closure';

/** Sentence-level closure predicates. Present tense only: a future closure is not a closure. */
const CLOSURE_PREDICATE = /\b(?:is|are)\s+closed\b|\bclosed\s+to\s+all\s+use\b|\bremains?\s+closed\b/i;

/** Words an alert title appends to the thing it is about. */
const TITLE_BOILERPLATE = /\s+(?:construction|closure|closures|closed|temporary|emergency|seasonal|update|updates|alert|notice|information)$/i;

const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Strip the trailing boilerplate an alert title appends, repeatedly. */
function subjectFromTitle(title) {
  let text = String(title || '').trim();
  if (!text) return null;
  let previous = null;
  while (text && text !== previous) {
    previous = text;
    text = text.replace(TITLE_BOILERPLATE, '').trim();
  }
  return text ? norm(text) : null;
}

/**
 * "Death Canyon Road and Trailhead" -> ["death canyon road", "death canyon trailhead"]
 *
 * A conjunction whose right side is a bare head noun inherits the left side's
 * proper-noun prefix. When the right side is already a full phrase (two or more
 * words) nothing is distributed — inventing a prefix would invent an identity.
 */
function expandSharedPrefixConjunction(phrase) {
  const text = norm(phrase);
  if (!text) return [];
  const parts = text.split(/\s+and\s+/);
  if (parts.length !== 2) return [text];
  const [left, right] = parts.map((part) => part.trim()).filter(Boolean);
  if (!left || !right) return [text];
  const leftWords = left.split(' ');
  const rightWords = right.split(' ');
  if (rightWords.length !== 1 || leftWords.length < 2) return [left, right];
  const prefix = leftWords.slice(0, -1).join(' ');
  return [left, `${prefix} ${right}`];
}

/** Subjects named by a closure sentence, if it states a closure at all. */
function subjectsFromText(text) {
  const subjects = [];
  for (const sentence of String(text || '').split(/(?<=[.!?])\s+/)) {
    const at = sentence.search(CLOSURE_PREDICATE);
    if (at < 0) continue;
    // Everything before the predicate, minus any leading "Title:" prefix the
    // producer prepends to alert prose.
    const head = sentence.slice(0, at).split(':').pop();
    const subject = norm(head);
    if (!subject || subject.split(' ').length > 8) continue;
    subjects.push(...expandSharedPrefixConjunction(subject));
  }
  return subjects;
}

/**
 * Identities a frozen bundle says are hard unavailable right now.
 *
 * @param {object} bundle frozen EvidenceBundle
 * @returns {Map<string, {ruleCode: string, alertTitle: string|null, subject: string}>}
 */
function buildUnavailablePlaceIndex(bundle) {
  const index = new Map();
  for (const item of bundle?.evidence || []) {
    if (!CLOSURE_TOPICS.includes(item?.topic)) continue;
    const normalized = item?.claim?.normalizedValue;
    if (!normalized || typeof normalized !== 'object') continue;
    if (norm(normalized.category) !== CLOSURE_CATEGORY) continue;
    const alertTitle = typeof normalized.title === 'string' ? normalized.title : null;

    const fromTitle = subjectFromTitle(alertTitle);
    if (fromTitle) {
      for (const subject of expandSharedPrefixConjunction(fromTitle)) {
        if (!index.has(subject)) index.set(subject, { ruleCode: 'official_closure_alert_title', alertTitle, subject });
      }
    }
    for (const subject of subjectsFromText(item?.claim?.text)) {
      if (!index.has(subject)) index.set(subject, { ruleCode: 'official_closure_statement', alertTitle, subject });
    }
  }
  return index;
}

/** Exact identity equality only. A near miss is not a closure. */
function hardUnavailableReason(placeKey, index) {
  if (!index || index.size === 0) return null;
  return index.get(norm(placeKey)) || null;
}

module.exports = {
  CLOSURE_CATEGORY,
  CLOSURE_TOPICS,
  buildUnavailablePlaceIndex,
  expandSharedPrefixConjunction,
  hardUnavailableReason,
  subjectFromTitle,
  subjectsFromText,
};
