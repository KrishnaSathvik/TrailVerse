'use strict';

/**
 * Planning input contract helpers (Pass #1 + Pass #2).
 * Offline, destination-agnostic. No park/trail hardcodes.
 *
 * Pass #1: numeric budget, word group sizes, trail-exposure avoid gate.
 * Pass #2: travelParty, childrenCount, free-form interests (+ add/remove/replace).
 */

const WORD_TO_NUMBER = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

const WORD_NUMBER_ALTS = Object.keys(WORD_TO_NUMBER).join('|');
const COUNT_TOKEN = `(?:\\d+|${WORD_NUMBER_ALTS})`;

/** Canonical Quick Fill interest ids (product vocabulary). */
const CANONICAL_INTERESTS = Object.freeze([
  'hiking',
  'photography',
  'wildlife',
  'camping',
  'scenic-drives',
  'water-activities',
  'stargazing',
  'history',
]);

const TRAVEL_PARTY_VALUES = Object.freeze(['solo', 'couple', 'friends', 'family', 'group']);

/**
 * Synonym → canonical interest. Order matters for first-match on overlapping text.
 * Negation is handled separately before matching.
 */
const INTEREST_SYNONYMS = Object.freeze([
  {
    id: 'hiking',
    pattern:
      /\b(?:hiking|hikes?|trails?(?:\s+walks?)?|day[- ]?hikes?|backpack(?:ing|s)?)\b/i,
  },
  {
    id: 'photography',
    pattern:
      /\b(?:photography|photos?|photographs?|taking pictures?|camera|landscape shots?)\b/i,
  },
  {
    id: 'wildlife',
    pattern: /\b(?:wildlife|animals?|birding|bird[- ]?watching|wildlife viewing)\b/i,
  },
  {
    id: 'camping',
    pattern: /\b(?:camping|campsites?|tent(?:ing)?|car camping|backcountry camping)\b/i,
  },
  {
    // `scenic-drives` is already the canonical home for viewpoint semantics —
    // itineraryCorrector expands it to ['drive','road','scenic','overlook',
    // 'viewpoint'] and evidencePlannerService keys viewpoint signals off it.
    // Only the synonym pattern was narrower than the concept, so a traveler who
    // asked for "scenic viewpoints" had that interest silently dropped.
    id: 'scenic-drives',
    pattern:
      /\b(?:scenic[- ]?drives?|scenic[- ]?driving|driving viewpoints?|road scenery|scenic roads?|scenic[- ]?(?:view(?:point)?s?|overlooks?|spots?)|view[- ]?points?|overlooks?|vistas?|scenery|scenic)\b/i,
  },
  {
    id: 'water-activities',
    pattern:
      /\b(?:water[- ]?activities?|kayak(?:ing)?|paddl(?:e|ing)|canoe(?:ing)?|rafting|boating)\b/i,
  },
  {
    id: 'stargazing',
    pattern: /\b(?:stargaz(?:e|ing)?|night sky|milky way|astronomy(?!\s+time))\b/i,
  },
  {
    id: 'history',
    pattern:
      /\b(?:history(?:\s*&\s*culture)?|historic(?:al)?(?:\s+sites?)?|cultural?\s+sites?|heritage|museums?)\b/i,
  },
]);

function parseCountToken(token) {
  if (token == null) return null;
  const raw = String(token).trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return WORD_TO_NUMBER[raw] || null;
}

/**
 * Extract a party-size count from natural language (digits or one..twelve).
 */
function extractGroupSizeFromMessage(msg) {
  const text = String(msg || '');
  if (!text.trim()) return null;

  const familyOf = text.match(new RegExp(`\\bfamily\\s+of\\s+(${COUNT_TOKEN})\\b`, 'i'));
  if (familyOf) return parseCountToken(familyOf[1]);

  const groupOf = text.match(new RegExp(`\\bgroup\\s+of\\s+(${COUNT_TOKEN})\\b`, 'i'));
  if (groupOf) return parseCountToken(groupOf[1]);

  const people = text.match(
    new RegExp(`\\b(${COUNT_TOKEN})\\s*(?:people|person|adults?|of us|travelers?|friends)\\b`, 'i')
  );
  if (people) return parseCountToken(people[1]);

  const total = text.match(new RegExp(`\\b(${COUNT_TOKEN})\\s+total\\b`, 'i'));
  if (total) return parseCountToken(total[1]);

  return null;
}

function normalizeBudgetDigits(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/[,$]/g, '').trim();
  if (!/^\d+$/.test(digits)) return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/**
 * Numeric trip budget from free-form text. Preserves dollar amount as digits.
 */
function extractNumericBudget(msg) {
  const text = String(msg || '');
  if (!text.trim()) return null;

  // Drive-time caps ("under 4 hours") and durations ("spend 3 days") are NOT
  // budgets: a number attached to a time unit is time, never money (P0-4 —
  // "spend 3 days" once became a stated $3 trip budget). The (?![\d,]) guard
  // stops backtracking from shrinking "34 days" to a bare "3".
  const capped = text.match(
    /\b(?:keep\s+(?:it\s+)?under|under|no\s+more\s+than|at\s+most|maximum|max|up\s+to|spend\s+(?:up\s+to|at\s+most)?)\s*\$?\s*([\d,]+)(?![\d,]|\s*(?:hours?|hrs?|minutes?|mins?|days?|nights?|weeks?|months?)\b)/i
  );
  if (capped) {
    const window = text.slice(Math.max(0, capped.index - 40), capped.index + capped[0].length + 40);
    const isDriveCap = /\bdriv(?:e|ing)\b/i.test(window) && !/\$/.test(capped[0]);
    if (!isDriveCap) return normalizeBudgetDigits(capped[1]);
  }

  const budgetSpend = text.match(
    /\b(?:budget|spend(?:ing)?)\s*(?:is|of|around|about|:)?\s*\$?\s*([\d,]+)(?![\d,]|\s*(?:hours?|hrs?|minutes?|mins?|days?|nights?|weeks?|months?)\b)/i
  );
  if (budgetSpend) return normalizeBudgetDigits(budgetSpend[1]);

  const makeBudget = text.match(
    /\b(?:make\s+(?:the\s+)?budget|change\s+budget\s+to|budget\s+to)\s*\$?\s*([\d,]+)/i
  );
  if (makeBudget) return normalizeBudgetDigits(makeBudget[1]);

  return null;
}

/**
 * Strip trail-exposure avoidance spans so they do not look like interest removals
 * (e.g. "don't want exposed trails" must not remove the hiking interest).
 */
function scrubExposureAvoidanceSpans(text) {
  return String(text || '').replace(
    /\b(?:no|avoid|without|don'?t|do\s+not|doesn'?t|not\s+comfortable\s+with|don'?t\s+like|do\s+not\s+like)\b[^.]{0,50}\b(?:exposed(?:\s+\w+){0,3}|exposure|drop[- ]?offs?|heights?|scary|ledges?|cliff[- ]?edges?)\b/gi,
    ' '
  );
}

/**
 * Trail/terrain exposure avoidance (hard-constraint gate).
 */
function userAvoidsTrailExposure(userText) {
  const msg = String(userText || '');
  if (!msg.trim()) return false;

  const scrubbed = msg.replace(
    /\b(?:no|avoid|without|limit|don'?t|do\s+not|doesn'?t|not\s+comfortable\s+with|don'?t\s+like|do\s+not\s+like)(?:\s+\w+){0,3}\s+exposure\s+to\s+(?:social\s+media|instagram|tiktok|facebook|phones?|screens?)\b/gi,
    ' '
  );

  return /\b(?:no|avoid|without|don'?t|do\s+not|doesn'?t|not\s+comfortable\s+with|don'?t\s+like|do\s+not\s+like)\b[^.]{0,50}\b(?:exposed(?:\s+\w+){0,3}|exposure|drop[- ]?offs?|heights?|scary|ledges?|cliff[- ]?edges?)\b/i.test(
    scrubbed
  );
}

/**
 * Durable hard-constraint arming for exposure avoidance.
 * Prefer normalized constraints.avoidExposure; current prompt may also introduce it.
 */
function isAvoidExposureActive(constraints, userText = '') {
  if (constraints?.avoidExposure === true) return true;
  if (constraints?.preferences?.avoidExposure === true) return true;
  return userAvoidsTrailExposure(userText);
}

function normalizeTravelParty(value) {
  if (value == null || value === '') return null;
  const v = String(value).trim().toLowerCase();
  return TRAVEL_PARTY_VALUES.includes(v) ? v : null;
}

function normalizeInterestId(raw) {
  if (!raw) return null;
  const text = String(raw).trim().toLowerCase();
  const v = text.replace(/_/g, '-').replace(/\s+/g, '-');
  if (v === 'history-culture' || v === 'history&culture' || v === 'culture') return 'history';
  if (v === 'scenic-drive') return 'scenic-drives';
  if (v === 'water-activity') return 'water-activities';
  if (CANONICAL_INTERESTS.includes(v)) return v;
  /**
   * Structured interests arrive as traveler-facing labels ("scenic viewpoints"),
   * not canonical ids. Exact matching alone silently dropped every one of them
   * that a form or entry context supplied, so fall back to the SAME synonym
   * vocabulary free-text extraction uses rather than maintaining a second list.
   */
  for (const { id, pattern } of INTEREST_SYNONYMS) {
    if (pattern.test(text)) return id;
  }
  return null;
}

function normalizeInterestList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const id = normalizeInterestId(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Strip negated interest spans so positive extraction does not pick them up.
 */
function scrubNegatedInterestSpans(text) {
  let scrubbed = String(text || '');
  const negationLead =
    /\b(?:no|not|don'?t|do not|doesn'?t|avoid|without|skip|never|we don'?t care about|not interested in)\b/gi;

  // Remove "no hiking" / "avoid wildlife" / "don't care about photography" style spans.
  for (const { id, pattern } of INTEREST_SYNONYMS) {
    const source = pattern.source.replace(/^\^/, '').replace(/\$$/, '');
    const neg = new RegExp(
      `\\b(?:no|not|don'?t|do not|doesn'?t|avoid|without|skip|never|we don'?t care about|not interested in)\\b[^.]{0,40}${source}`,
      'gi'
    );
    scrubbed = scrubbed.replace(neg, ' ');
  }

  // "but no hiking" already covered; also "photography but no hiking"
  void negationLead;
  return scrubbed;
}

function extractPositiveInterestsFromText(text) {
  const scrubbed = scrubNegatedInterestSpans(text);
  const found = [];
  for (const { id, pattern } of INTEREST_SYNONYMS) {
    if (pattern.test(scrubbed) && !found.includes(id)) found.push(id);
  }
  return found;
}

/**
 * Extract childrenCount only when explicitly recoverable.
 */
function extractChildrenCount(msg) {
  const text = String(msg || '');
  const withKids = text.match(
    new RegExp(`\\b(?:with|plus)\\s+(${COUNT_TOKEN})\\s*(?:young\\s+)?(?:kids?|children|toddlers?)\\b`, 'i')
  );
  if (withKids) return parseCountToken(withKids[1]);

  const kidsOnly = text.match(
    new RegExp(`\\b(${COUNT_TOKEN})\\s*(?:young\\s+)?(?:kids?|children|toddlers?)\\b`, 'i')
  );
  if (kidsOnly && !/\bfamily\s+of\s+/i.test(text.slice(Math.max(0, kidsOnly.index - 12), kidsOnly.index))) {
    // "family of four" uses COUNT_TOKEN before kids — exclude "of four" false path;
    // "two kids" is fine.
    return parseCountToken(kidsOnly[1]);
  }
  return null;
}

/**
 * Infer travelParty + related fields from language (no destination rules).
 * Does not invent party type from groupSize alone.
 *
 * @returns {{ travelParty: string|null, groupSize: number|null, hasChildren: boolean|null, childrenCount: number|null, clearChildren: boolean }}
 */
function extractTravelPartySemantics(msg) {
  const text = String(msg || '');
  const result = {
    travelParty: null,
    groupSize: null,
    hasChildren: null,
    childrenCount: null,
    clearChildren: false,
  };
  if (!text.trim()) return result;

  const noKids = /\b(?:no kids?|without kids?|adults? only|no children)\b/i.test(text);
  const justTheTwo =
    /\b(?:just the two of us|only the two of us|just us two)\b/i.test(text) ||
    (/\bactually\b/i.test(text) && /\b(?:just|only)\b.{0,24}\b(?:two of us|couple|partner)\b/i.test(text));

  if (justTheTwo) {
    result.travelParty = 'couple';
    result.groupSize = 2;
    result.hasChildren = false;
    result.childrenCount = null;
    result.clearChildren = true;
    return result;
  }

  const coupleLike =
    /\b(?:couple|two of us|with my (?:wife|husband|partner|girlfriend|boyfriend)|romantic)\b/i.test(text);
  const hasKidWords = /\b(?:kids?|children|toddler|infant|baby)\b/i.test(text);
  const friendsJoin =
    /\b(?:joining us|joining the trip|coming with us|are joining)\b/i.test(text) && /\bfriends?\b/i.test(text);

  // Mixed party: friends joining an existing party → group (do not invent friends/family)
  if (friendsJoin && (coupleLike || /\bus\b/i.test(text))) {
    result.travelParty = 'group';
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    return result;
  }

  // Couple + kids → family
  if (coupleLike && hasKidWords) {
    result.travelParty = 'family';
    result.hasChildren = true;
    const kids = extractChildrenCount(text);
    if (kids != null) {
      result.childrenCount = kids;
      result.groupSize = 2 + kids;
    }
    return result;
  }

  if (/\b(?:solo(?:\s+trip)?|alone|just me|by myself)\b/i.test(text)) {
    result.travelParty = 'solo';
    result.groupSize = 1;
    return result;
  }

  if (coupleLike) {
    result.travelParty = 'couple';
    result.groupSize = 2;
    return result;
  }

  // Explicit friends trip / N friends (before generic family-from-kids)
  if (
    /\b(?:friends?\s+trip|trip with friends|with (?:my |our )?friends)\b/i.test(text) ||
    new RegExp(`\\b(?:${WORD_NUMBER_ALTS}|\\d+)\\s+friends\\b`, 'i').test(text) ||
    (/\bfriends\b/i.test(text) && (noKids || /\bactually\b/i.test(text)))
  ) {
    result.travelParty = 'friends';
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    if (noKids) {
      result.hasChildren = false;
      result.clearChildren = true;
    }
    return result;
  }

  if (/\bfamil(?:y|ies)\b/i.test(text)) {
    result.travelParty = 'family';
    result.hasChildren = true;
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    const kids = extractChildrenCount(text);
    if (kids != null) result.childrenCount = kids;
    return result;
  }

  // Kids without "family" word still imply family traveling party
  if (hasKidWords) {
    result.travelParty = 'family';
    result.hasChildren = true;
    const kids = extractChildrenCount(text);
    if (kids != null) result.childrenCount = kids;
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    return result;
  }

  if (/\bgroup\s+of\b/i.test(text) || /\b(?:group trip|traveling as a group)\b/i.test(text)) {
    result.travelParty = 'group';
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    return result;
  }

  if (/\bfriends\b/i.test(text)) {
    result.travelParty = 'friends';
    const n = extractGroupSizeFromMessage(text);
    if (n != null) result.groupSize = n;
    return result;
  }

  if (noKids) {
    result.hasChildren = false;
    result.clearChildren = true;
  }

  return result;
}

/**
 * Interest mutation from latest message against an existing list.
 * @returns {{ interests: string[]|null, mode: 'add'|'remove'|'replace'|'none'|'seed' }}
 */
function resolveInterestMutation(msg, existingInterests = []) {
  const text = String(msg || '');
  const current = normalizeInterestList(existingInterests);

  if (!text.trim()) {
    return { interests: null, mode: 'none' };
  }

  const replaceCue =
    /\b(?:actually|instead|rather)\b.{0,80}\b(?:focus on|more interested in|prefer|we'd rather|we would rather|interested in)\b/i.test(
      text
    ) ||
    /\b(?:focus on|more interested in|we'd rather|we would rather)\b.{0,60}\b(?:instead|rather)\b/i.test(text) ||
    /\bactually we(?:'d| would)? rather focus on\b/i.test(text) ||
    /\bactually we(?:'re| are) more interested in\b/i.test(text);

  const addCue =
    /\b(?:add|also like|also want|plus|and also|include)\b/i.test(text) ||
    /\badd\s+\w+/i.test(text);

  const removeCue =
    /\b(?:remove|drop|skip|without|no more)\b/i.test(text) ||
    /\bdon'?t want\b/i.test(text);

  if (replaceCue) {
    const next = extractPositiveInterestsFromText(text);
    if (next.length > 0) return { interests: next, mode: 'replace' };
  }

  if (removeCue) {
    // Exposure-avoidance phrasing uses "don't want … trails/exposure" but is not
    // an interest removal. Scrub those spans before interest-removal matching.
    const scrubbed = scrubExposureAvoidanceSpans(text);
    const stillRemove =
      /\b(?:remove|drop|skip|without|no more)\b/i.test(scrubbed) ||
      /\bdon'?t want\b/i.test(scrubbed);
    if (stillRemove) {
      const toRemove = [];
      for (const { id, pattern } of INTEREST_SYNONYMS) {
        const source = pattern.source;
        const negNear = new RegExp(
          `\\b(?:remove|drop|skip|without|no more|don'?t want|no)\\b[^.]{0,40}${source}`,
          'i'
        );
        if (negNear.test(scrubbed)) toRemove.push(id);
      }
      if (toRemove.length > 0) {
        const next = current.filter((id) => !toRemove.includes(id));
        return { interests: next, mode: 'remove' };
      }
    }
  }

  if (addCue) {
    const added = extractPositiveInterestsFromText(text);
    if (added.length > 0) {
      const next = [...current];
      for (const id of added) if (!next.includes(id)) next.push(id);
      return { interests: next, mode: 'add' };
    }
  }

  // Initial / free-form seed when no existing interests and message mentions some
  const seeded = extractPositiveInterestsFromText(text);
  if (seeded.length > 0 && current.length === 0) {
    return { interests: seeded, mode: 'seed' };
  }

  // "also like wildlife" without strong add cue — treat as add when correction-ish
  if (/\balso\b/i.test(text) && seeded.length > 0 && current.length > 0) {
    const next = [...current];
    for (const id of seeded) if (!next.includes(id)) next.push(id);
    if (next.length !== current.length) return { interests: next, mode: 'add' };
  }

  return { interests: null, mode: 'none' };
}

module.exports = {
  WORD_TO_NUMBER,
  CANONICAL_INTERESTS,
  TRAVEL_PARTY_VALUES,
  parseCountToken,
  extractGroupSizeFromMessage,
  extractNumericBudget,
  normalizeBudgetDigits,
  userAvoidsTrailExposure,
  isAvoidExposureActive,
  normalizeTravelParty,
  normalizeInterestId,
  normalizeInterestList,
  extractPositiveInterestsFromText,
  extractChildrenCount,
  extractTravelPartySemantics,
  resolveInterestMutation,
  scrubNegatedInterestSpans,
};
