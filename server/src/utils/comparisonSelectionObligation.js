'use strict';

/**
 * Comparison-selection obligation (Phase 12H2-C).
 *
 * Distinguishes ordinary destination comparison from an explicit request
 * that Trailie select one of the compared alternatives.
 *
 * This is not a second comparison classifier and not a new TravelerJob.
 * `destination_compare` remains the job. The obligation is a boolean fact
 * on TurnUnderstanding.
 */

const { normalizeUserText } = require('./lexicalNormalization');

const REASON_CODE = Object.freeze({
  REQUIRED: 'comparison_selection_required',
  MISSING: 'comparison_selection_missing',
  DEFERRED: 'comparison_selection_deferred',
  OUT_OF_SCOPE: 'comparison_selection_out_of_scope',
  UNRESOLVED: 'comparison_selection_unresolved_candidates',
  CRITERION_UNAVAILABLE: 'comparison_selection_criterion_unavailable',
  EXCEPTION_UNSTATED: 'comparison_selection_exception_unstated',
});

/**
 * Assistant-directed request to name one alternative. Families, not a
 * destination-specific phrase list. Traveler-capacity "we can only choose
 * one" is stripped before this runs.
 */
const ASSISTANT_SELECTION_ASK =
  /\b(?:pick(?: just)? one|choose(?: just)? one|select one|recommend one|decide(?: between them)? for me|decide for me|give me your (?:choice|pick|recommendation)|make (?:the|a) (?:choice|call|decision)(?: for me)?|choose the better fit|(?:which(?: one)? )?would you (?:pick|choose|go with|recommend)|tell me which(?: one)?(?: you(?:'d| would))?(?: choose| pick| recommend)?|which(?: one| of the two)? should (?:i|we) (?:do|pick|choose|go with|visit|book)|which is (?:the )?better(?: (?:fit|choice|option))? for this trip|help me (?:choose|pick) between|should (?:i|we) (?:pick|choose|go with))\b/i;

const TRAVELER_CAPACITY =
  /\b(?:(?:can(?:not|'t)?|could) (?:probably )?only|probably only|we can only)\b[^.?!]{0,28}\b(?:choose|pick|do|visit|manage)\b[^.?!]{0,16}\bone\b/gi;

const EXPLORATORY_COMPARE =
  /\b(?:compar(?:e|ing|ison)|trade[- ]?offs?|differences?|pros and cons|how (?:are|do|does|would) (?:they|the two) (?:differ|compare)|help me understand)\b/i;

const DEFERRAL =
  /\b(?:tell me (?:your |the )?(?:exact )?(?:dates?|timing)|before i (?:can |could )?(?:choose|pick|decide)|i cannot choose until|need (?:more )?(?:detail|dates|information) before|once you (?:tell|give) me|wait until you (?:share|tell|give)|i will wait|i'll wait)\b/i;

const SELECTION_VERB =
  /\b(?:i(?:'d| would)? (?:choose|pick|take|recommend|go with)|(?:choose|recommend|go with|pick|select|take)\b.{0,24}|better fit|the (?:better|stronger) (?:choice|fit|option)|winner)\b/i;

const SKIP_BOTH =
  /\b(?:skip both|neither of (?:them|these|those)|go(?:ing)? to .{1,40} instead)\b/i;

const STATED_EXCEPTION =
  /\b(?:cannot choose|could not (?:choose|resolve)|did not resolve|do not establish|not selecting a winner|unresolved|could not verify)\b/i;

function maskTravelerCapacity(text) {
  return String(text || '').replace(TRAVELER_CAPACITY, ' ');
}

function isAssistantSelectionAsk(text) {
  return ASSISTANT_SELECTION_ASK.test(maskTravelerCapacity(text));
}

function candidateTokens(candidate) {
  const name = String(candidate?.displayName || candidate?.name || '').toLowerCase();
  const parkCode = String(candidate?.parkCode || '').toLowerCase();
  const stripped = name
    .replace(/\b(?:national|park|parks|seashore|monument|historic|site|memorial|preserve|recreation|area|the)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = stripped.split(' ').filter((token) => token.length >= 4);
  return {
    parkCode,
    name,
    tokens,
    search: [parkCode, stripped, ...tokens].filter(Boolean),
  };
}

function mentionsCandidate(haystack, candidate) {
  const lower = String(haystack || '').toLowerCase();
  const keys = candidateTokens(candidate);
  return keys.search.some((token) => token && lower.includes(token));
}

function mentionedCandidates(haystack, candidates) {
  return (candidates || []).filter((candidate) => mentionsCandidate(haystack, candidate));
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveComparisonSelection({ text = '', destinations = [] } = {}) {
  const normalized = normalizeUserText(text);
  const required = isAssistantSelectionAsk(normalized);
  const reasonCodes = [];
  if (required) reasonCodes.push(REASON_CODE.REQUIRED);

  let exception = null;
  const count = Array.isArray(destinations) ? destinations.length : 0;
  if (required && count < 2) {
    exception = { code: REASON_CODE.UNRESOLVED, reason: 'compared_candidates_unresolved' };
    reasonCodes.push(REASON_CODE.UNRESOLVED);
  }

  return {
    required,
    exploratory: !required && EXPLORATORY_COMPARE.test(normalized),
    reasonCodes,
    exception,
  };
}

function extractInsteadName(text) {
  const match = String(text || '').match(/\bgo(?:ing)? to ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+instead\b/);
  return match ? match[1].trim() : null;
}

function findSelectedCandidate(text, candidates) {
  const hits = [];
  for (const sentence of sentences(text)) {
    if (!SELECTION_VERB.test(sentence)) continue;
    const mentioned = mentionedCandidates(sentence, candidates);
    if (mentioned.length === 1) hits.push(mentioned[0]);
    else if (mentioned.length > 1) {
      const verbAt = sentence.toLowerCase().search(SELECTION_VERB);
      let closest = mentioned[0];
      let best = Number.POSITIVE_INFINITY;
      for (const candidate of mentioned) {
        const idx = sentence.toLowerCase().indexOf(candidateTokens(candidate).tokens[0] || '');
        if (idx >= 0 && Math.abs(idx - verbAt) < best) {
          best = Math.abs(idx - verbAt);
          closest = candidate;
        }
      }
      hits.push(closest);
    }
  }
  return hits[0] || null;
}

function evaluateComparisonSelectionAnswer({
  text = '',
  candidates = [],
  required = false,
  resolvedCandidates = null,
  criterionEvidence = null,
} = {}) {
  if (!required) {
    return {
      ok: true,
      selected: null,
      deferred: false,
      exception: null,
      reasonCodes: [],
    };
  }

  const resolved = Array.isArray(resolvedCandidates) ? resolvedCandidates : candidates;
  const reasonCodes = [];

  if (resolved.length < 2) {
    const stated = STATED_EXCEPTION.test(text);
    if (stated) {
      return {
        ok: true,
        selected: null,
        deferred: false,
        exception: { code: REASON_CODE.UNRESOLVED },
        reasonCodes: [REASON_CODE.UNRESOLVED],
      };
    }
    return {
      ok: false,
      selected: null,
      deferred: false,
      exception: { code: REASON_CODE.UNRESOLVED },
      reasonCodes: [REASON_CODE.UNRESOLVED, REASON_CODE.EXCEPTION_UNSTATED],
    };
  }

  if (criterionEvidence && criterionEvidence.available === false) {
    const stated = STATED_EXCEPTION.test(text);
    if (stated) {
      return {
        ok: true,
        selected: null,
        deferred: false,
        exception: { code: REASON_CODE.CRITERION_UNAVAILABLE },
        reasonCodes: [REASON_CODE.CRITERION_UNAVAILABLE],
      };
    }
    return {
      ok: false,
      selected: null,
      deferred: false,
      exception: { code: REASON_CODE.CRITERION_UNAVAILABLE },
      reasonCodes: [REASON_CODE.CRITERION_UNAVAILABLE, REASON_CODE.EXCEPTION_UNSTATED],
    };
  }

  const skipped = SKIP_BOTH.test(text);
  const insteadName = extractInsteadName(text);
  const insteadIsCandidate = insteadName
    ? mentionedCandidates(insteadName, candidates).length > 0
    : false;
  if (skipped && !insteadIsCandidate) {
    return {
      ok: false,
      selected: null,
      deferred: false,
      exception: null,
      reasonCodes: [REASON_CODE.OUT_OF_SCOPE],
    };
  }

  const selected = findSelectedCandidate(text, candidates);
  const deferred = DEFERRAL.test(text);

  if (deferred && !selected) {
    return {
      ok: false,
      selected: null,
      deferred: true,
      exception: null,
      reasonCodes: [REASON_CODE.DEFERRED],
    };
  }

  if (!selected) {
    return {
      ok: false,
      selected: null,
      deferred: false,
      exception: null,
      reasonCodes: [REASON_CODE.MISSING],
    };
  }

  return {
    ok: true,
    selected: {
      parkCode: selected.parkCode || null,
      name: selected.displayName || selected.name || null,
    },
    deferred: false,
    exception: null,
    reasonCodes: [],
  };
}

function candidatesFromUnderstanding(understanding) {
  const dests = understanding?.subjectDestinations || [];
  return dests
    .map((destination) => ({
      displayName: destination.name || destination.displayName || null,
      parkCode: destination.parkCode || null,
    }))
    .filter((destination) => destination.displayName || destination.parkCode);
}

function candidateLabel(candidate) {
  return candidate?.displayName || candidate?.name || candidate?.parkCode || 'a compared destination';
}

function buildComparisonSelectionRepairInstructions({ reasonCodes = [], candidates = [] } = {}) {
  const names = (candidates || []).map(candidateLabel).filter(Boolean);
  const set = names.length ? names.join(', ') : 'the compared destinations';
  const codes = new Set(reasonCodes);
  if (codes.has(REASON_CODE.OUT_OF_SCOPE)) {
    return `Name one candidate from the existing set (${set}). Do not introduce a destination outside this comparison. Preserve uncertainty as qualification, not deferral.`;
  }
  if (codes.has(REASON_CODE.DEFERRED) || codes.has(REASON_CODE.MISSING)) {
    return `Make a clear selection from the existing candidates (${set}). Name one of them. Preserve uncertainty as qualification, not deferral. Do not replace the selection with a request for more detail.`;
  }
  return `Make a clear selection from the existing candidates (${set}). Preserve uncertainty as qualification, not deferral.`;
}

function comparisonSelectionPromptBlock({ required, candidates = [] } = {}) {
  if (!required) return null;
  const names = (candidates || []).map(candidateLabel).filter(Boolean);
  return {
    required: true,
    candidates: names,
    instructions: [
      'The traveler asked you to choose among the compared destinations.',
      'Name one candidate from that set.',
      'Explain why it best fits their stated priorities and the main tradeoff.',
      'You may qualify the choice with a condition that could reverse it.',
      'Do not replace the selection with a request for more detail when the available facts support a reasonable conditional recommendation.',
    ].join(' '),
  };
}

module.exports = {
  REASON_CODE,
  resolveComparisonSelection,
  evaluateComparisonSelectionAnswer,
  buildComparisonSelectionRepairInstructions,
  comparisonSelectionPromptBlock,
  candidatesFromUnderstanding,
  isAssistantSelectionAsk,
};
