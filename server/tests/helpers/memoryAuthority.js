'use strict';

const { createMemoryAuthorityVerifier } = require('../../src/services/trailieMemoryAuthority');

// Synthetic semantic verdicts for deterministic boundary tests. This is NOT a
// natural-language classifier and is never imported by application code.
function stubMemoryVerifier(relationship = 'explicit') {
  return createMemoryAuthorityVerifier({ model: async ({ input }) => ({
    completionStatus: 'completed', toolCalls: [], costStatus: 'priced', costUsd: 0,
    outputText: JSON.stringify({ verdicts: JSON.parse(input[0].content).facts.map(({ id }) => ({
      id, supported: relationship === 'explicit', relationship, reason: 'Offline semantic verdict fixture.',
    })) }),
  }) });
}

module.exports = { stubMemoryVerifier };
