'use strict';

/**
 * Traveler-facing language must not narrate the evidence architecture.
 * Uncertainty is allowed; audit phrasing is not.
 */

const VIOLATIONS = Object.freeze([
  {
    id: 'architecture_evidence_supported',
    pattern: /\bevidence[- ]supported\b/i,
    rewrite: 'Name the place and why it fits in ordinary language.',
  },
  {
    id: 'architecture_supplied_information',
    pattern: /\bsupplied (?:information|evidence)\b/i,
    rewrite: 'Say "I couldn\'t verify…" instead of narrating missing inputs.',
  },
  {
    id: 'architecture_available_evidence',
    pattern: /\bavailable evidence\b/i,
    rewrite: 'Speak to the traveler, not to the evidence system.',
  },
  {
    id: 'architecture_confirmed_compatible',
    pattern: /\bconfirmed compatible\b/i,
    rewrite: 'Describe the place ("paved river walk") instead of compatibility jargon.',
  },
  {
    id: 'architecture_compatible_candidate',
    pattern: /\bcompatible (?:candidate|support(?:ing)? stop|low[- ]effort)\b/i,
    rewrite: 'Use a natural description of the stop, not "compatible candidate".',
  },
  {
    id: 'architecture_crowd_evidence',
    pattern: /\bno crowd evidence provided\b/i,
    rewrite: 'Say you couldn\'t verify a meaningful crowd advantage.',
  },
  {
    id: 'architecture_evidence_bundle',
    pattern: /\b(?:frozen\s+)?evidencebundle\b/i,
    rewrite: 'Do not mention internal evidence bundles.',
  },
  {
    id: 'architecture_exposure_level',
    pattern: /\bexposurelevel\b/i,
    rewrite: 'Do not print structured field names.',
  },
  {
    id: 'architecture_candidate_word',
    pattern: /\bcandidates?\b/i,
    rewrite: 'Name the place in ordinary language. Do not call it a candidate.',
  },
  {
    id: 'architecture_reason_code',
    pattern: /\breasoncodes?\b/i,
    rewrite: 'Do not print internal reason codes.',
  },
  {
    id: 'architecture_unresolved_exposure',
    pattern: /\bunresolved[- ]exposure\b/i,
    rewrite: 'If exposure is uncertain, say you couldn\'t confirm it is a good fit.',
  },
]);

function collectPlanText(itineraryData = null) {
  const chunks = [];
  if (!itineraryData || typeof itineraryData !== 'object') return chunks;
  if (itineraryData.intro) chunks.push(itineraryData.intro);
  for (const section of itineraryData.narrativeSections || []) {
    if (section?.heading) chunks.push(section.heading);
    if (section?.markdown) chunks.push(section.markdown);
  }
  for (const day of itineraryData.days || []) {
    if (day?.label) chunks.push(day.label);
    for (const stop of day?.stops || []) {
      if (stop?.note) chunks.push(stop.note);
      if (stop?.why) chunks.push(stop.why);
    }
  }
  for (const alt of itineraryData.alternatives || []) {
    if (typeof alt === 'string') chunks.push(alt);
    else {
      if (alt?.note) chunks.push(alt.note);
      if (alt?.when) chunks.push(alt.when);
    }
  }
  return chunks;
}

function evaluateTravelerLanguage({
  text = '',
  intro = '',
  itineraryData = null,
} = {}) {
  const haystack = [
    text,
    intro,
    ...collectPlanText(itineraryData),
  ].filter(Boolean).join('\n');

  const matches = [];
  for (const rule of VIOLATIONS) {
    if (rule.pattern.test(haystack)) matches.push(rule.id);
  }
  return {
    ok: matches.length === 0,
    reasonCodes: [...new Set(matches)],
  };
}

function buildTravelerLanguageRepairInstructions(evaluation = {}) {
  const codes = evaluation.reasonCodes || [];
  if (codes.length === 0) return '';
  return [
    'Rewrite traveler-facing text in ordinary language. Do not mention evidence systems, candidates, compatibility, or supplied information.',
    'Uncertainty is fine: "I couldn\'t verify a meaningful late-September crowd advantage for either park."',
    'Good: "The CCC cabins are a good sunset stop." Bad: "An evidence-supported sunset candidate."',
    `Triggered: ${codes.join(', ')}.`,
  ].join(' ');
}

module.exports = {
  VIOLATIONS,
  evaluateTravelerLanguage,
  buildTravelerLanguageRepairInstructions,
};
