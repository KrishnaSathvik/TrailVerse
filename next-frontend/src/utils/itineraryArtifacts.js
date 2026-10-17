/**
 * Isomorphic itinerary-artifact stripper (frontend / ESM copy).
 *
 * Behavior-identical twin of server/src/utils/itineraryArtifacts.js. Both are
 * pinned to shared/itineraryArtifacts.fixtures.json; editing one without the
 * other (and the fixtures) fails one of the two test suites.
 *
 * The browser MUST NOT invent its own cleaning. This is the single stripper used
 * for streamed display so that what the user sees matches the server's canonical
 * content and the `contentUnchanged` gate is trustworthy.
 */

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
export function stripItineraryArtifacts(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return {
      content: content == null ? '' : String(content),
      changed: false,
      removedSpans: [],
      artifactTypes: [],
    };
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

  return { content: cleaned, changed: removedSpans.length > 0, removedSpans, artifactTypes };
}
