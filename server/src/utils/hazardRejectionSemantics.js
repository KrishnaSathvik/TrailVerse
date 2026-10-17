'use strict';

/**
 * Shared RECOMMENDATION vs REJECTION semantics for hazard prose.
 *
 * Two independent validators judge whether an answer offers a traveler
 * something their hard constraint forbids:
 *
 *   - `proseConstraintSafety.js`  → `exposure_constraint_contradiction`
 *   - `itineraryCompleteness.js`  → `exposure_prose_conflict`
 *
 * Both had the same defect from opposite directions, and they disagreed with
 * each other on real generated prose. The question neither could answer is the
 * only question that matters:
 *
 *     is the hazardous thing RECOMMENDED, or is it REJECTED?
 *
 * "Take the exposed cliff route"      → recommended → violation.
 * "This route avoids exposed terrain" → rejected    → compliant.
 *
 * The two validators keep their own hazard vocabularies — one judges what an
 * answer offers a traveler, the other judges a stop's prose against structured
 * metadata, and those responsibilities are not the same. Only the polarity
 * question is shared, so only the polarity question lives here.
 *
 * DESIGN RULES
 *  - Bounded grammar, not an open synonym dictionary. Inflection is handled by
 *    explicit suffix alternation on a small closed verb family.
 *  - Polarity is SCOPED. One rejection verb must not sanitise unrelated hazard
 *    language elsewhere in the sentence: "The trail avoids exposed terrain but
 *    ends at an exposed scrambling section" is still a violation.
 *  - Soft discourse boundaries (`:`, `;`, dashes, `.`, newlines) do NOT by
 *    themselves end a rejection: "Keep B off the plan: it has drop-offs"
 *    elaborates the rejection. Hard lexical resets (`but`, `however`, …) do.
 *  - Default is RECOMMENDED. An unqualified, ungoverned hazard mention is an
 *    offer. Nothing is assumed safe.
 *  - No destination names. Grammar and hazard nouns only.
 */

const { normalizeUserText } = require('./lexicalNormalization');

/**
 * Avoidance verbs, inflected. `\bavoid\b` was the original defect: it matches
 * the imperative "Avoid the cliff" but not "avoids"/"avoiding", because `\b`
 * fails against the following `s`. Every member here carries its own inflection
 * alternation so the family is covered by grammar rather than by listing
 * sentences.
 */
const AVOIDANCE_VERB_SOURCE =
  'avoid(?:s|ed|ing)?|skip(?:s|ped|ping)?|bypass(?:es|ed|ing)?|omit(?:s|ted|ting)?'
  + '|exclud(?:e|es|ed|ing)|forgo(?:es|ing)?|forego(?:es|ing)?|sidestep(?:s|ped|ping)?'
  + '|remov(?:e|es|ed|ing)|discard(?:s|ed|ing)?|reject(?:s|ed|ing)?'
  // Do not match the hazard noun "drop-offs" as the avoidance verb "drop".
  + '|drop(?:s|ped|ping)?(?![- ]?offs?\\b)'
  + '|(?:stay|keep|remain|steer|stick)(?:s|ed|ing)?\\s+(?:well\\s+)?(?:clear\\s+of|away\\s+from|back\\s+from)'
  + '|(?:leave|leaves|leaving|left)\\s+(?:it|that|them|those)?\\s*out'
  + '|rule(?:s|d)?\\s+out';

/**
 * Every frame under which a following hazard phrase is REJECTED rather than
 * offered: avoidance verbs, contrastive substitution, verbal negation, and
 * absence prepositions.
 */
const REJECTION_FRAME_SOURCE = [
  AVOIDANCE_VERB_SOURCE,
  '(?:rather\\s+than|instead\\s+of|in\\s+place\\s+of|as\\s+opposed\\s+to|as\\s+an\\s+alternative\\s+to)',
  // Comparative preference: the complement after than/to/over is rejected.
  // "a better fit than Overlook, which has drop-offs" must not read as
  // offering those drop-offs. Bounded grammar only — no place-name lists.
  '(?:better|safer|preferable|nicer|easier|gentler|calmer)\\b(?:(?![.!?;:\\n])[\\s\\S]){0,48}?\\bthan',
  '(?:more\\s+(?:suitable|appropriate|compatible|gentle|relaxed|peaceful|forgiving))\\b(?:(?![.!?;:\\n])[\\s\\S]){0,48}?\\bthan',
  '(?:prefer(?:s|red)?|favor(?:s|ed)?)\\b(?:(?![.!?;:\\n])[\\s\\S]){0,48}?\\b(?:to|over)\\b',
  '(?:choose|chooses|choosing|pick|picks|picking)\\b(?:(?![.!?;:\\n])[\\s\\S]){0,40}?\\bover\\b',
  '(?:compared\\s+to|versus|\\bvs\\.?\\b)',
  '(?:unlike)\\b',
  "(?:do\\s+not|does\\s+not|don'?t|doesn'?t|did\\s+not|didn'?t|won'?t|will\\s+not|wouldn'?t|would\\s+not|never(?!\\s+mind\\b)|no\\s+need\\s+to)",
  '(?:not\\s+recommend(?:ed)?|not\\s+suitable|unsuitable|not\\s+a\\s+good\\s+fit|isn\'?t\\s+a\\s+good\\s+fit|out\\s+of\\s+range)',
  // Explicit "wouldn't send/take you to X because …" — X is rejected.
  "(?:wouldn'?t|would\\s+not|won'?t|will\\s+not)\\s+(?:send|take|put|direct)\\s+(?:you|anyone)\\s+to\\b",
  // "keep X off the plan" / "keep X off your list" — X is rejected.
  '(?:keep|keeps|keeping|kept)\\b(?:(?![.!?;:\\n])[\\s\\S]){0,60}?\\boff\\b',
  '(?:well\\s+)?(?:away\\s+from|clear\\s+of|free\\s+of)',
  'without',
  // Degree-of-unsuitability. "it is TOO exposed for you" is the REASON for a
  // rejection, not an offer of the hazard.
  '(?:too|overly)',
].join('|');

const REJECTION_FRAME = new RegExp(`\\b(?:${REJECTION_FRAME_SOURCE})`, 'gi');

/**
 * Verbs that OFFER something to the traveler. Reaching one flips polarity back
 * to recommended, which is what stops a single early rejection from laundering
 * a later offer. Copular/possessive verbs are included because "…, and it has
 * drop-offs" offers the drop-offs just as much as "take the ledge" does.
 */
const RECOMMENDATION_FRAME = new RegExp(
  '\\b(?:'
  + 'takes?|taking|uses?|using|does?|doing|tr(?:y|ies|ying)|adds?|adding'
  + '|includes?|including'
  // Verb "plan to/plan a …" only — not the noun in "photo plan" / "off your plan".
  + '|planning|plans?(?=\\s+(?:to|on|a|an|the|your|our)\\b)|heads?|heading|go(?:es)?|going'
  + '|walks?|walking|hikes?|hiking|climbs?|climbing|follows?|following'
  + '|continues?|continuing|tackles?|tackling|visits?|visiting'
  + '|chooses?|choosing|picks?|picking|books?|booking|opts?\\s+for|starts?|starting'
  + '|finish(?:es)?|finishing|ends?|ending|crosses|cross(?:ing)?|traverses?|traversing'
  + '|runs?|running|features?|featuring|offers?|offering|involves?|involving'
  + '|requires?|requiring|reach(?:es)?|reaching|ascends?|ascending|descends?|descending'
  + '|scrambles?|scrambling|links?|linking|has|have|had|is|are|was|were'
  // Experiential offer verbs. Without these, a rejection of something
  // UNRELATED laundered a later offer: "…without a permit and still ENJOY
  // the exposed ledge".
  + '|enjoys?|enjoying|explores?|exploring|experiences?|experiencing'
  + '|lingers?|lingering|wanders?|wandering|photographs?|photographing'
  + '|watch(?:es)?|watching|spends?|spending|returns?|returning'
  + '|sees?|seeing|stands?|standing|drives?|driving|rides?|riding'
  + ')\\b',
  'gi',
);

/**
 * Hard lexical discourse resets END rejection inheritance.
 *
 * Soft punctuation (`:`, `;`, dashes, `.`, newlines) is deliberately NOT a
 * reset: "I'd keep B off your plan: the NPS describes drop-offs there" must
 * keep the hazard under the rejection. A comma is also not a boundary.
 *
 * "instead of" remains a rejection frame; bare "instead," resets stance.
 */
const HARD_DISCOURSE_RESET = new RegExp(
  '\\b(?:but|however|although|though|except\\s+for|except|aside\\s+from|apart\\s+from'
  + '|other\\s+than|whereas|while|yet|that\\s+said|on\\s+the\\s+other\\s+hand'
  + '|instead(?!\\s+of\\b)|another\\s+option|a\\s+different\\s+option'
  + '|meanwhile|separately)\\b',
  'gi',
);

/** @deprecated alias — callers/tests may still refer to POLARITY_RESET. */
const POLARITY_RESET = HARD_DISCOURSE_RESET;

/**
 * A recommendation verb that is the COMPLEMENT of an open rejection is part of
 * the rejection, not a new offer: "do not TAKE", "avoid TAKING", "rather than
 * TAKING". Only near-adjacency with light filler counts, so "Skip the shuttle,
 * and hike the exposed traverse" still reads as an offer of the traverse.
 */
const NEGATION_COMPLEMENT_GAP = /^\s*(?:(?:ever|to|then|even|simply|just|really|also)\s+)*$/i;

/**
 * A relative clause modifies the noun phrase it hangs off, so it inherits that
 * phrase's polarity: "avoid the Watchman Trail, WHICH HAS moderate drop-offs"
 * describes the rejected trail, it does not offer the drop-offs.
 * Allow a short determiner/name run before the clause verb ("which NPS describes").
 */
const RELATIVE_CLAUSE_TAIL = /\b(?:which|that|where|who|whose)\s+(?:\w+\s+){0,4}$/i;

/**
 * "instead of X because the latter/X has drop-offs" — the because-clause
 * explains why the rejected option fails the constraint. Block offer verbs in
 * the reason NP so "skip breakfast because you should take the exposed ledge"
 * still flips to a recommendation.
 */
const REJECTION_REASON_OFFER =
  'take|takes|taking|try|tries|trying|enjoy|enjoying|recommend|recommending'
  + '|should|must|need|hike|hiking|walk|walking|go|going|use|using|visit|visiting'
  + '|choose|choosing|pick|picking|head|heading';
const REJECTION_REASON_GAP = new RegExp(
  '^\\s*(?:[\\w\'’\\-]+[\\s,]+){0,10}(?:because|since)\\s+'
  + '(?:'
  + '(?:(?:the\\s+)?(?:latter|former)|it|that|this|they|those|which)\\b'
  + '|(?!' + REJECTION_REASON_OFFER + '\\b)[\\w\'’\\-]+'
  + '(?:\\s+(?!' + REJECTION_REASON_OFFER + '\\b)[\\w\'’\\-]+){0,3}'
  + ')'
  + '\\s*$',
  'i',
);

/**
 * "Skip B — it has drop-offs" / "Skip B. It has drop-offs" / "over B: B has":
 * anaphora or same-token restatement of the rejected entity after soft
 * punctuation. Do not allow an arbitrary new name (that would launder
 * "Avoid B. C has drop-offs").
 */
const REJECTED_ENTITY_RESTATE =
  /^\s*(?:[\w'’\-]+[\s,.;:–—]*){0,12}(?:[-–—,:;.]\s*)?(?:it|that|this|they|those|the\s+(?:trail|route|path|ledge|ridge|overlook|section|area|walk|hike|option))\s*$/i;
const REJECTED_ENTITY_NAME_RESTATE =
  /^\s*([A-Za-z][\w'’\-]*)\s*[-–—,:;.]\s*\1\s*$/i;

/** Strong cues that a previously rejected entity is now being offered again. */
const ENTITY_RECOMMEND_CUE =
  /\b(?:recommend(?:s|ed|ing)?|favorite|favourite|best\b|worth(?:\s+it)?|make\s+(?:it|that|this|[A-Za-z][\w'-]*)\s+your|still\s+(?:my|the|our)\s+(?:favorite|favourite|best)|sunrise\s+(?:choice|option|stop|pick))\b/i;

/**
 * Qualifiers that assert the ABSENCE or smallness of the hazard immediately
 * following them. Bounded to a short window so a distant "no" cannot license a
 * later hazard ("There is no shuttle, and the trail runs along an exposed
 * ledge" stays a violation).
 */
const COMPATIBLE_QUALIFIER =
  /(?:\b(?:no|not|non|without|zero|low|minimal|little|limited|negligible|slight|mild)\b|\bfree of\b|\bhardly any\b|\bnot much\b|\b(?:well\s+)?away from\b)[\s-]+(?:\w+[-\s]+){0,4}$/i;

/**
 * Conditional-concern hedging. "Check with a ranger if exposure concerns you"
 * neither offers the hazard nor claims its absence — it hands the decision back
 * to the traveler. Shared so both validators scrub it identically; when only one
 * of them stripped it, the two disagreed on the same clause.
 */
const CONCERN_HEDGE =
  /\bif\s+(?:the\s+|any\s+)?[\w-]+\s+concerns?\s+you\b|\bcheck\s+(?:with\s+)?(?:a\s+)?ranger[^.]{0,40}\b(?:exposure|drop[- ]?offs?|ledges?|cliffs?|heights?)\b|\b(?:exposure|drop[- ]?off|ledge|cliff|height)\s+concerns?\b/gi;

/** Remove hedged mentions before polarity is judged. */
function stripConcernHedges(text) {
  return normalizeUserText(text).replace(CONCERN_HEDGE, ' ')
    // Camera exposure is not terrain exposure. Remove only the photographic
    // phrase, so an exposed ledge in the same sentence remains a violation.
    .replace(/\b(?:long[- ]exposures?|exposure (?:bracketing|compensation|settings?|times?)|bracket(?:ed|ing)? exposures?)\b/gi, 'camera technique');
}

function allMatches(pattern, text) {
  const scan = new RegExp(pattern.source, 'gi');
  const out = [];
  for (const match of String(text).matchAll(scan)) {
    out.push({ start: match.index, end: match.index + match[0].length });
  }
  return out;
}

/** Where the last hard discourse reset before `index` ends. Soft punctuation
 *  does not cut scope — rejection explanations may cross `:`, `;`, dashes, `.`. */
function governingStart(text, index) {
  let start = 0;
  for (const reset of allMatches(HARD_DISCOURSE_RESET, text)) {
    if (reset.start >= index) break;
    if (reset.end > start) start = Math.min(reset.end, index);
  }
  return start;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort rejected-entity NP after the last rejection operator in `governing`.
 * Tokens only — no destination gazetteer.
 */
function extractRejectedEntity(governing) {
  const rejections = allMatches(REJECTION_FRAME, governing);
  if (!rejections.length) return null;
  const last = rejections[rejections.length - 1];
  const span = governing.slice(last.start, last.end);
  const after = governing.slice(last.end);
  // "keep NAME off" — entity sits inside the rejection span.
  const keepOff = /\b(?:keep|keeps|keeping|kept)\s+((?:[\w'’\-]+[\s-]*){1,6}?)\s+off\b/i.exec(span);
  if (keepOff?.[1]) return keepOff[1].trim().replace(/\s+/g, ' ');
  const np = /^\s+(?:the\s+|this\s+|that\s+|those\s+)?([A-Za-z][\w'’\-]*(?:\s+[A-Za-z][\w'’\-]*){0,4})/i.exec(after);
  if (!np?.[1]) return null;
  // Cut the NP before causal/relative continuation ("Avoid B because …").
  const name = np[1].trim().split(/\s+(?:because|since|as|with|which|that|who)\b/i)[0].trim();
  if (!name) return null;
  if (/^(?:it|that|this|they|those|there|because|since|as|and|or|but)$/i.test(name)) return null;
  return name;
}

/**
 * Soft boundary between governing rejection and the hazard — diagnostics only.
 */
function softBoundaryBefore(text, index) {
  const between = text.slice(governingStart(text, index), index);
  let found = null;
  for (const match of between.matchAll(/:|;|[-–—]|\.|\n/g)) {
    if (match[0] === ':') found = 'colon';
    else if (match[0] === ';') found = 'semicolon';
    else if (/[-–—]/.test(match[0])) found = 'dash';
    else if (match[0] === '.') found = 'period';
    else if (match[0] === '\n') found = 'newline';
  }
  return found;
}

/**
 * After a hard stance reset, recommending an entity previously rejected for a
 * hazard is itself a contradiction — even if the second clause omits the
 * hazard noun ("Avoid B because it's exposed. But B is still my favorite.").
 */
function findReRecommendedRejectedEntity(source, hazardPattern) {
  const rejected = new Map();
  for (const match of source.matchAll(new RegExp(hazardPattern.source, 'gi'))) {
    if (hazardIsRecommended(source, match.index)) continue;
    const governing = source.slice(governingStart(source, match.index), match.index);
    if (resolvePolarity(governing) !== 'rejection') continue;
    const entity = extractRejectedEntity(governing);
    if (entity) rejected.set(entity.toLowerCase(), entity);
  }
  if (!rejected.size) return null;

  for (const reset of allMatches(HARD_DISCOURSE_RESET, source)) {
    const window = source.slice(reset.end, reset.end + 220);
    if (!ENTITY_RECOMMEND_CUE.test(window)) continue;
    // A clear new-option lead resets entity continuity for this window.
    if (/^\s*(?:another\s+option|a\s+different|consider|for\s+[A-Z])/i.test(window)
      && !ENTITY_RECOMMEND_CUE.test(window.slice(0, 40))) {
      continue;
    }
    for (const [key, entity] of rejected) {
      if (new RegExp(`\\b${escapeRegExp(entity)}\\b`, 'i').test(window)) {
        return {
          phrase: entity,
          index: reset.end,
          reason: 'rejected_hazard_entity_re_recommended',
        };
      }
    }
  }
  return null;
}

/**
 * Resolve the polarity governing the end of `governing`.
 * Nearest operator wins; a rejection's own verbal complement and any relative
 * clause hanging off the rejected phrase do not count as new offers.
 */
function resolvePolarity(governing) {
  const rejections = allMatches(REJECTION_FRAME, governing);
  const inRejection = (op) => rejections.some((r) => op.start >= r.start && op.start < r.end);
  const operators = [
    ...rejections.map((r) => ({ ...r, kind: 'rejection' })),
    ...allMatches(RECOMMENDATION_FRAME, governing)
      .filter((r) => !inRejection(r))
      .map((r) => ({ ...r, kind: 'recommendation' })),
  ].sort((a, b) => a.start - b.start);

  let polarity = 'recommendation';
  let rejectionEnd = -1;
  for (const operator of operators) {
    if (operator.kind === 'rejection') {
      polarity = 'rejection';
      rejectionEnd = operator.end;
      continue;
    }
    if (polarity === 'rejection') {
      const gap = governing.slice(rejectionEnd, operator.start);
      // Relative clauses and "because the latter/it …" reasons elaborate the
      // rejected entity; they must not flip polarity via has/is.
      if (
        NEGATION_COMPLEMENT_GAP.test(gap)
        || RELATIVE_CLAUSE_TAIL.test(gap)
        || REJECTION_REASON_GAP.test(gap)
        || REJECTED_ENTITY_RESTATE.test(gap)
        || REJECTED_ENTITY_NAME_RESTATE.test(gap)
      ) {
        rejectionEnd = operator.end;
        continue;
      }
    }
    polarity = 'recommendation';
  }
  return polarity;
}

/**
 * Is the hazard mention at `index` something the answer OFFERS?
 * @returns {boolean} false when rejected or when its absence is claimed.
 */
function hazardIsRecommended(text, index) {
  const source = String(text || '');
  const governing = source.slice(governingStart(source, index), index);
  const following = source.slice(index);
  // In "replace X with Y", X is rejected and Y is offered. Keep the
  // second half positive even if both noun phrases contain a hazard.
  const replacement = /\breplac(?:e|es|ed|ing)\b([^.!?;:]*)$/i.exec(governing);
  const replacementPrefix = replacement?.[1].replace(/\bwith\s+uncertain\s*$/i, '');
  const replacementTail = following.split(/[.!?;:]/)[0];
  if (replacement && !/\b(?:with|but|however|then|yet|take|try|enjoy|continue|visit)\b/i.test(replacementPrefix)
    && !/\b(?:but|however|then|yet|take|try|enjoy|continue|visit)\b/i.test(replacementTail.split(/\bwith\b/i)[0])) return false;
  // Separable rejection: "leave [hazard noun phrase] out". A later
  // contrast/new offer is outside this bounded noun phrase.
  if (/\b(?:leave|leaves|leaving|left)\s+(?:(?:the|those|these|all)\s+)?$/i.test(governing)
    && /^[^.!?;:,]{0,55}\bout\b/i.test(following)
    && !/\b(?:but|and|then)\b/i.test(following.split(/\bout\b/i)[0])) return false;
  // "Take the exposed hike out of the plan" removes an activity. Require
  // the removal particle and a plan scope (or clause end), so taking a ridge
  // "out of town" or taking an exposed route "out for a walk" stays an offer.
  const removal = /\b(?:take|takes|taking|taken|took)\s+([^.!?;:,]{0,100})$/i.exec(governing);
  if (removal && !/\b(?:but|and|then|with|try|enjoy|continue|visit)\b/i.test(removal[1])
    && /^[^.!?;:,]{0,55}\b(?:hikes?|trails?|routes?|overlooks?|outings?|options?)\s+out(?:\s+of\s+(?:(?:the|our|your)\s+)?(?:plan|itinerary|trip|schedule|days?\s+\d+(?:[-–]\d+)?|(?:\d+|two|three|four|five|six|seven)\s+days))?\s*(?=[.!?;:,]|$)/i.test(following)
    && !/\b(?:but|and|then)\b/i.test(following.split(/\bout\b/i)[0])) return false;
  if (/^(?:exposure|heights?)\s+(?:preference|constraint|limit|concern)\b/i.test(following)) return false;
  // Reasons attached to an explicit removal inherit its negative polarity.
  // Do not let that scope cross "but/then/instead" into another offer.
  if (/\b(?:excluded?|removed?|left\s+out|omitted?)\b[^.!?;:]*\bbecause\b/i.test(governing)
    && !/\b(?:but|however|then|instead|yet)\b/i.test(governing.split(/\bbecause\b/i).pop())
    && !/\b(?:take|try|enjoy|continue|visit|recommend)\b/i.test(governing.split(/\bbecause\b/i).pop())) return false;
  if (/\brather\b[^.!?;:]{0,80}\bthan\s+(?:add|take|try)\b[^.!?;:]{0,40}$/i.test(governing)
    && !/\b(?:but|however|then|yet)\b/i.test(governing.split(/\bthan\b/i).pop())) return false;
  if (COMPATIBLE_QUALIFIER.test(governing)) return false;
  return resolvePolarity(governing) === 'recommendation';
}

/**
 * First hazard mention the answer actually offers, or null.
 * @param {string} text
 * @param {RegExp} hazardPattern caller-owned hazard vocabulary.
 */
function findRecommendedHazard(text, hazardPattern) {
  const source = stripConcernHedges(text);
  if (!source) return null;
  for (const match of source.matchAll(new RegExp(hazardPattern.source, 'gi'))) {
    if (hazardIsRecommended(source, match.index)) {
      return { phrase: match[0], index: match.index };
    }
  }
  return findReRecommendedRejectedEntity(source, hazardPattern);
}

function hasRecommendedHazard(text, hazardPattern) {
  return findRecommendedHazard(text, hazardPattern) != null;
}

/**
 * Internal stance diagnostics for each hazard mention. Traveler-facing copy
 * never sees these labels — they exist so validators can explain polarity.
 */
function analyzeHazardStances(text, hazardPattern) {
  const source = stripConcernHedges(text);
  const mentions = [];
  if (!source) return mentions;
  for (const match of source.matchAll(new RegExp(hazardPattern.source, 'gi'))) {
    const start = governingStart(source, match.index);
    const governing = source.slice(start, match.index);
    const recommended = hazardIsRecommended(source, match.index);
    const polarity = resolvePolarity(governing);
    const entity = extractRejectedEntity(governing);
    const boundary = softBoundaryBefore(source, match.index);
    let stance = 'NEUTRAL_DESCRIPTION';
    let relation = null;
    if (recommended) {
      stance = 'POSITIVE_RECOMMENDATION';
      relation = boundary && polarity === 'rejection' ? 'STANCE_RESET' : null;
    } else if (COMPATIBLE_QUALIFIER.test(governing)) {
      stance = 'NEUTRAL_DESCRIPTION';
    } else if (polarity === 'rejection') {
      stance = 'EXPLICIT_AVOIDANCE';
      relation = boundary ? 'EXPLANATION' : 'REJECTION_SCOPE';
    } else {
      stance = 'NEGATIVE_WARNING';
    }
    mentions.push({
      phrase: match[0],
      index: match.index,
      stance,
      hazardAttribute: match[0].toLowerCase(),
      entity: entity || null,
      boundary,
      relation,
      governingClause: governing.slice(-120).trim() || null,
      contradiction: recommended,
      reason: recommended
        ? 'hazard_offered_under_active_constraint'
        : stance === 'EXPLICIT_AVOIDANCE'
          ? (boundary
            ? 'hazard_explanation_inherits_rejection_across_boundary'
            : 'hazard_in_rejected_or_contrastive_complement')
          : stance === 'NEUTRAL_DESCRIPTION'
            ? 'hazard_absence_or_compatible_qualifier'
            : 'hazard_warned_not_offered',
    });
  }
  return mentions;
}

module.exports = {
  hasRecommendedHazard,
  findRecommendedHazard,
  hazardIsRecommended,
  analyzeHazardStances,
  resolvePolarity,
  stripConcernHedges,
  governingStart,
  CONCERN_HEDGE,
  AVOIDANCE_VERB_SOURCE,
  REJECTION_FRAME_SOURCE,
  COMPATIBLE_QUALIFIER,
  HARD_DISCOURSE_RESET,
  POLARITY_RESET,
};
