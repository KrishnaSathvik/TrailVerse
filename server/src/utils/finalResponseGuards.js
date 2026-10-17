'use strict';

/**
 * Final-response guards.
 *
 * Formerly the repair-output guards. The repair LLM is gone, but the checks it
 * needed still apply to any candidate final response: never ship an empty
 * answer, a bracketed hand-off placeholder, or content that lost material text
 * without an audited reason.
 */

const { PLACEHOLDER_RE, TRUNCATION_MARKER_RE } = require('./itineraryPlaceholders');

/** A candidate shorter than this fraction of the original dropped content. */
const MIN_LENGTH_RATIO = 0.6;

const REJECTION = {
  EMPTY: 'empty_output',
  PLACEHOLDER_LEAK: 'placeholder_leak',
  TOO_SHORT: 'unexplained_shortening',
};

/**
 * Why a candidate final response must be discarded, or null when it is safe.
 *
 * `expectedLength` opts into audited-mutation accounting: when supplied, the
 * length floor is skipped because the shortening is explained by the plan.
 *
 * @param {string} originalContent
 * @param {string} candidateContent
 * @param {{expectedLength?: number}} [options]
 * @returns {string|null}
 */
function getFinalResponseRejectionReason(originalContent, candidateContent, options = {}) {
  if (typeof candidateContent !== 'string' || !candidateContent.trim()) {
    return REJECTION.EMPTY;
  }

  PLACEHOLDER_RE.lastIndex = 0;
  TRUNCATION_MARKER_RE.lastIndex = 0;
  if (PLACEHOLDER_RE.test(candidateContent) || TRUNCATION_MARKER_RE.test(candidateContent)) {
    return REJECTION.PLACEHOLDER_LEAK;
  }

  if (typeof options.expectedLength === 'number') {
    return candidateContent.length === options.expectedLength ? null : REJECTION.TOO_SHORT;
  }

  const originalLength = String(originalContent || '').trim().length;
  if (originalLength > 0 && candidateContent.trim().length < originalLength * MIN_LENGTH_RATIO) {
    return REJECTION.TOO_SHORT;
  }

  return null;
}

module.exports = {
  MIN_LENGTH_RATIO,
  REJECTION,
  getFinalResponseRejectionReason,
};
