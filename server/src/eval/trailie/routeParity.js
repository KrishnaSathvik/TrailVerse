'use strict';

/**
 * Stage 13 §13 — four-route parity.
 *
 * For identical synthetic provider outputs, the shared seam must produce a
 * canonically-identical response across:
 *   authenticated streaming / authenticated non-streaming /
 *   anonymous streaming / anonymous non-streaming
 *
 * Compared for exact equality (canonical content permits it here because the
 * synthetic transport is lossless): content hash, itinerary hash, sanitized prose
 * hash, consistency status, feasibility issue types, final itinerary validity.
 *
 * Intentionally allowed to differ (documented): the route variant label, the
 * streaming replay count (streaming replays selected prose; non-streaming does
 * not), and anonymous quota/conversion metadata (not part of canonical identity).
 */

const { ROUTE_VARIANTS, runOneVariant } = require('./index');

const PARITY_FIELDS = [
  ['contentHash', (r) => r.canonical.contentHash],
  ['itineraryHash', (r) => r.canonical.itineraryHash],
  ['sanitizedProseHash', (r) => r.prose.sanitizedProseHash],
  ['consistencyStatus', (r) => r.prose.consistencyStatus],
  ['finalItineraryValid', (r) => r.structured.finalItineraryValid],
  ['feasibilityIssueTypes', (r) => JSON.stringify([...r.structured.feasibilityIssueTypes].sort())],
  ['correctionCount', (r) => r.structured.correctionCount],
];

async function checkRouteParity({ scenario, provider = 'claude', model = 'synthetic-claude', generationMode = 'tool_first', consistencyMode = 'off' }) {
  const records = {};
  for (const routeVariant of ROUTE_VARIANTS) {
    // eslint-disable-next-line no-await-in-loop
    records[routeVariant] = await runOneVariant({
      scenario, provider, model, generationMode, consistencyMode, providerMode: 'recorded', routeVariant,
    });
  }

  const reference = ROUTE_VARIANTS[0];
  const mismatches = [];
  for (const [field, get] of PARITY_FIELDS) {
    const refVal = get(records[reference]);
    for (const variant of ROUTE_VARIANTS.slice(1)) {
      const val = get(records[variant]);
      if (val !== refVal) mismatches.push({ field, reference: `${reference}=${refVal}`, variant: `${variant}=${val}` });
    }
  }

  return {
    scenarioId: scenario.scenarioId,
    generationMode,
    consistencyMode,
    parity: mismatches.length === 0,
    mismatches,
    intentionalDifferences: {
      note: 'route variant label, streaming replay count, and anonymous quota metadata are intentionally variant-specific and excluded from parity comparison.',
      replayCounts: Object.fromEntries(ROUTE_VARIANTS.map((v) => [v, records[v].replayedProse])),
    },
    perVariant: Object.fromEntries(ROUTE_VARIANTS.map((v) => [v, {
      contentHash: records[v].canonical.contentHash,
      itineraryHash: records[v].canonical.itineraryHash,
      consistencyStatus: records[v].prose.consistencyStatus,
    }])),
  };
}

module.exports = { checkRouteParity, PARITY_FIELDS };
