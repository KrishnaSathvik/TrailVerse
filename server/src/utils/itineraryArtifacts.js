'use strict';

/**
 * Isomorphic itinerary-artifact stripper (server / CommonJS copy).
 *
 * The ESM frontend copy at next-frontend/src/utils/itineraryArtifacts.js MUST
 * stay byte-for-byte equivalent in behavior. Both are pinned to the shared
 * fixtures at shared/itineraryArtifacts.fixtures.json; editing one stripper
 * without the other (and the fixtures) fails one of the two test suites.
 *
 * Purpose: produce the SAME display/persistence content on both sides so the
 * `contentUnchanged` streaming gate is trustworthy and what the user saw equals
 * what gets saved. Scope is strictly the [ITINERARY_JSON] artifact family —
 * hand-off placeholders remain finalResponseGuards' concern (those REJECT a
 * response; silently stripping a truncation marker would ship a broken answer).
 */

// Ordered removal rules. Order matters: fenced blocks first so their bodies are
// not partially consumed, then complete bracket blocks, then a truncated open
// marker, then orphan closes, then bare labels.
const RULES = [
  {
    type: 'fenced_json',
    re: /```(?:json)?\s*(?:\r?\n)?\s*(?:ITINERARY_JSON|itinerary[\s_-]?json)[\s\S]*?```/gi,
  },
  { type: 'complete_block', re: /\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/gi },
  { type: 'unterminated_open', re: /\[ITINERARY_JSON\][\s\S]*$/gi },
  { type: 'orphan_close', re: /\[\/ITINERARY_JSON\]/gi },
  { type: 'bare_label', re: /^[ \t]*ITINERARY_JSON[ \t]*:?[ \t]*\r?\n?/gim },
];

/**
 * @param {string} content
 * @returns {{content: string, changed: boolean, removedSpans: Array<{type:string,text:string}>, artifactTypes: string[]}}
 */
function stripItineraryArtifacts(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return { content: content == null ? '' : String(content), changed: false, removedSpans: [], artifactTypes: [] };
  }

  const removedSpans = [];
  let working = content;

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    working = working.replace(rule.re, (match) => {
      removedSpans.push({ type: rule.type, text: match });
      return '';
    });
  }

  const cleaned = working.replace(/\n{3,}/g, '\n\n').trim();
  const artifactTypes = [...new Set(removedSpans.map((s) => s.type))];

  return {
    content: cleaned,
    changed: removedSpans.length > 0,
    removedSpans,
    artifactTypes,
  };
}

module.exports = { stripItineraryArtifacts };
