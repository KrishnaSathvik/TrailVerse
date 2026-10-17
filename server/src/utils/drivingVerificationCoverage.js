'use strict';

// Reuses the Phase-8D.6.1 honesty contract without adding a traveler warning.
// Coverage describes represented stop edges only, never the whole journey.
function drivingVerificationInstruction(coverage = null) {
  if (!coverage) {
    return 'Verified drive-time evidence is not available at drafting time. Do not invent drive times or ' +
      'claim driving feasibility has been verified. Eligible transfers may be checked after generation; ' +
      'do not predict the outcome of those checks.';
  }
  if (coverage.status === 'none_checked') {
    return 'Verified drive-time evidence is not available for these stop transfers. Do not state specific ' +
      'unverified drive times or imply driving feasibility has been verified; exact drive times were not checked.';
  }
  if (coverage.status === 'partially_checked') {
    return 'Only some applicable stop transfers have verified drive-time estimates. Other transfers remain ' +
      'unchecked. Do not imply all driving or the daily driving limit has been verified.';
  }
  return 'All applicable stop-level drive edges have route estimates. This does not verify unrepresented ' +
    'transfers or the entire journey. Describe only the checked stop transfers, not blanket driving feasibility.';
}
function drivingCoverageClaimConflict(text, coverage) {
  if (!coverage) return false;
  const value = String(text || '');
  // Explicit whole-plan verification claims cannot be proved by stop-edge coverage.
  const blanket = /\b(?:all (?:the )?(?:drives|driving|drive times) (?:are |were |have been )?(?:verified|checked)|driving feasibility (?:is |was |has been )verified|(?:verified|checked) all (?:the )?(?:drives|driving|drive times))\b/gi;
  for (const match of value.matchAll(blanket)) {
    if (!/\b(?:not|never|cannot claim|can't claim)\s*$/i.test(value.slice(0, match.index))) return true;
  }
  // A blanket "nothing checked" statement also becomes false after success.
  return coverage.verifiedEdges > 0
    && /\b(?:exact drive times were not checked|no drive times (?:were |have been )checked)\b/i.test(value);
}
module.exports = { drivingVerificationInstruction, drivingCoverageClaimConflict };
