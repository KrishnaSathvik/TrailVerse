'use strict';

/**
 * Stage 8.1 — narrow feedback command.
 *
 * Thumbs up/down must NOT round-trip the whole conversation (that let a click on
 * an older rendered state rewrite canonical assistant content). This builds a
 * field-scoped update that can only touch userFeedback + its timestamp, keyed to
 * a single message id. It can never modify message content, response identity,
 * hashes, version, plan, or itinerary.
 */

const FEEDBACK_VALUES = ['up', 'down', null];

/**
 * @param {'up'|'down'|null} feedback
 * @param {number} messageId - conversation subdoc id
 * @returns {{valid: boolean, setDoc?: Object, arrayFilters?: Array}}
 */
function buildFeedbackUpdate(feedback, messageId) {
  if (!FEEDBACK_VALUES.includes(feedback)) {
    return { valid: false };
  }
  return {
    valid: true,
    setDoc: {
      'conversation.$[m].userFeedback': feedback,
      'conversation.$[m].feedbackAt': new Date(),
    },
    arrayFilters: [{ 'm.id': messageId }],
  };
}

module.exports = { FEEDBACK_VALUES, buildFeedbackUpdate };
