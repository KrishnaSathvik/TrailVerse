'use strict';

/**
 * Stage 13.1 §8 — blinded manual-labeling artifact.
 *
 * Produces a BLINDED evaluation sheet. The evaluator view shows ONLY the user
 * request, the frozen itinerary, the final selected prose, relevant synthetic
 * facts, and final feasibility warnings. It deliberately OMITS provider, model,
 * first-attempt-vs-retry, fallback status, the automated verifier verdict, and
 * automated issue codes — the verifier must never be its own ground truth.
 *
 * Without live outputs the sheet is seeded from the SYNTHETIC fixtures (clearly
 * labeled synthetic) so the schema is ready; every label field is empty and
 * `labelStatus=not_collected`.
 */

const { stripAlignmentMarkers } = require('../../utils/proseAlignmentMarkers');

const LABEL_FIELDS = [
  'itineraryComplete', 'itineraryConstraintCompliant', 'proseMatchesItinerary',
  'unsupportedStopAdded', 'correctedStopRestored', 'factualConflict', 'userUsable',
  'severity', 'notes',
];

function itinerarySummary(scenario) {
  const first = (scenario.structuredResponses || []).find((r) => r.kind === 'complete');
  const itin = first?.itinerary;
  if (!itin) return '(no structured itinerary)';
  return (itin.days || [])
    .map((d) => `${d.label || d.id}: ${(d.stops || []).map((s) => s.name).join(' → ')}${d.overnightLocation ? ` [overnight: ${d.overnightLocation}]` : ''}`)
    .join(' | ');
}

function finalProse(scenario) {
  const p = (scenario.proseResponses || []).find((x) => x.content);
  return p ? stripAlignmentMarkers(p.content).trim().replace(/\s+/g, ' ') : '';
}

/** @returns {{rows, meta}} blinded rows (label fields empty, awaiting collection) */
function buildManualLabelingArtifact(scenarios) {
  const labelable = scenarios.filter((s) => s.userRequestedItinerary && (s.structuredResponses || []).some((r) => r.kind === 'complete'));
  const rows = labelable.map((s) => ({
    sampleId: s.scenarioId,
    dataKind: 'synthetic_fixture',
    userRequest: s.userPrompt,
    itinerary: itinerarySummary(s),
    finalProse: finalProse(s),
    feasibilityWarnings: '(populated from live output)',
    labelStatus: 'not_collected',
    ...Object.fromEntries(LABEL_FIELDS.map((f) => [f, ''])),
  }));
  return {
    meta: {
      status: 'not_collected',
      blinded: true,
      omittedFromEvaluatorView: ['provider', 'model', 'firstAttemptVsRetry', 'fallbackStatus', 'automatedVerifierVerdict', 'automatedIssueCodes'],
      protocol: 'Two independent labels for critical scenarios where practical; report agreement rate, disagreements, resolution method, major/critical count. Gate: 0 major/critical inconsistencies.',
      note: 'Rows seeded from synthetic fixtures for schema readiness. Regenerate from LIVE outputs before labeling.',
    },
    rows,
  };
}

function toCsv(artifact) {
  const cols = ['sampleId', 'dataKind', 'userRequest', 'itinerary', 'finalProse', 'feasibilityWarnings', 'labelStatus', ...LABEL_FIELDS];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = artifact.rows.map((r) => cols.map((c) => esc(r[c])).join(','));
  return [cols.join(','), ...rows].join('\n');
}

module.exports = { LABEL_FIELDS, buildManualLabelingArtifact, toCsv };
