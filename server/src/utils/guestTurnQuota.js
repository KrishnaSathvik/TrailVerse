'use strict';

/**
 * Stage 14.8A.2 §4 — the canonical guest quota calculation.
 *
 *   completedGuestTurns = count(unique logical turns where status === 'completed'
 *                               and a terminal assistant response exists)
 *   remainingAllowance  = max(0, ALLOWANCE - completedGuestTurns)
 *
 * Pure and I/O-free so both the model and the turn ledger can share exactly one
 * definition. Nothing here may count user-role messages, pending requests,
 * failed attempts, aborted streams, `response_started`, duplicate terminal
 * callbacks, or retried persistence writes.
 */

const { ANONYMOUS_USER_MESSAGE_LIMIT } = require('../config/anonymousChatLimits');

const GUEST_TURN_ALLOWANCE = ANONYMOUS_USER_MESSAGE_LIMIT;

/** A turn counts only when it is completed AND carries a terminal assistant response. */
function isCompletedTurn(turn) {
  if (!turn || turn.status !== 'completed') return false;
  const content = turn.assistantMessage?.content;
  return typeof content === 'string' && content.length > 0;
}

function countCompletedTurns(turns) {
  const seen = new Set();
  for (const turn of turns || []) {
    if (!isCompletedTurn(turn)) continue;
    if (seen.has(turn.turnId)) continue; // uniqueness, not array length
    seen.add(turn.turnId);
  }
  return seen.size;
}

function remainingAllowance(completedGuestTurns, allowance = GUEST_TURN_ALLOWANCE) {
  return Math.max(0, allowance - completedGuestTurns);
}

function findPendingTurn(turns) {
  return (turns || []).find((turn) => turn?.status === 'pending') || null;
}

module.exports = {
  GUEST_TURN_ALLOWANCE,
  isCompletedTurn,
  countCompletedTurns,
  remainingAllowance,
  findPendingTurn,
};
