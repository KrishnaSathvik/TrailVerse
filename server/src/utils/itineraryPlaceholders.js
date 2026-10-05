'use strict';

/**
 * Single source of truth for the bracketed "the rest lives elsewhere" artifacts a
 * model emits when it gives up mid-response, e.g.
 *   [ITERARY note continues in structured data]
 *
 * Shared by the final-response guards, itinerary artifact stripping, and reviewer
 * output validation so the pattern cannot drift between them.
 */

/**
 * Bracketed hand-off notes. `\](?!\()` keeps markdown links intact — `[label](url)`
 * must never have its label excised.
 */
const PLACEHOLDER_RE =
  /\[[^\]\n]{0,120}(?:structured data|continues? (?:in|below|above)|truncated|omitted|remainder of|rest of the (?:plan|itinerary|response))[^\]\n]{0,120}\](?!\()/gi;

/** Bare `...[truncated]` style markers left by input truncation. */
const TRUNCATION_MARKER_RE = /\.{3}\[truncated\]/gi;

/**
 * Locate placeholder spans without mutating anything.
 * A placeholder alone on its line yields the whole line (plus one newline) so
 * removal does not leave an orphaned blank paragraph.
 *
 * @returns {Array<{start: number, end: number, text: string, standaloneLine: boolean}>}
 */
function findPlaceholderSpans(content) {
  const source = String(content || '');
  const spans = [];

  for (const re of [PLACEHOLDER_RE, TRUNCATION_MARKER_RE]) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      const start = match.index;
      const end = start + match[0].length;

      const lineStart = source.lastIndexOf('\n', start - 1) + 1;
      const nextNewline = source.indexOf('\n', end);
      const lineEnd = nextNewline === -1 ? source.length : nextNewline;
      const standaloneLine =
        source.slice(lineStart, start).trim() === '' && source.slice(end, lineEnd).trim() === '';

      spans.push({
        start: standaloneLine ? lineStart : start,
        end: standaloneLine && nextNewline !== -1 ? nextNewline + 1 : end,
        text: match[0],
        standaloneLine,
      });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Remove placeholder spans, reporting exactly what was removed so the caller can
 * include it in expected-length accounting. Never strips silently.
 *
 * @returns {{content: string, removed: Array<Object>, lengthDelta: number}}
 */
function stripPlaceholderSpans(content) {
  const source = String(content || '');
  const spans = findPlaceholderSpans(source);
  if (spans.length === 0) return { content: source, removed: [], lengthDelta: 0 };

  let output = source;
  let lengthDelta = 0;

  // Highest offset first so earlier spans keep their offsets.
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, span.start) + output.slice(span.end);
    lengthDelta -= span.end - span.start;
  }

  return { content: output, removed: spans, lengthDelta };
}

/** Audit record carrying no response text — only identity, span, and size. */
function describePlaceholderRemoval(span, index) {
  return {
    auditId: `placeholder-${index}`,
    start: span.start,
    end: span.end,
    length: span.end - span.start,
    standaloneLine: span.standaloneLine,
  };
}

module.exports = {
  PLACEHOLDER_RE,
  TRUNCATION_MARKER_RE,
  findPlaceholderSpans,
  stripPlaceholderSpans,
  describePlaceholderRemoval,
};
