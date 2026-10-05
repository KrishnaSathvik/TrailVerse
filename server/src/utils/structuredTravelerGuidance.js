'use strict';

// Recommendation polarity is structural. The server renders the stance prefix
// and binds named subjects to frozen evidence; free explanation still receives
// the existing conservative safety checks and cannot waive any constraint.
const GUIDANCE_TOOL = {
  name: 'respond_with_guidance',
  description: 'Answer with information and evidence-bound recommendations or avoidances. Use avoidance for rejected choices. Do not put recommendations inside information text.',
  input_schema: { type: 'object', additionalProperties: false, required: ['segments'], properties: {
    segments: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['stance', 'evidenceRef', 'constraintRef', 'text'], properties: {
        stance: { type: 'string', enum: ['information', 'recommend', 'avoid'] },
        evidenceRef: { type: ['string', 'null'] },
        constraintRef: { type: ['string', 'null'], enum: ['avoidExposure', null] },
        text: { type: 'string', description: 'Explanation only; do not reverse the declared stance.' },
      } } },
  } },
};
function needsStructuredGuidance(constraints) {
  const { runtimeMobilityField } = require('./canonicalRuntimeProjection');
  return require('./planningInputContract').isAvoidExposureActive(constraints, '')
    || ['maxWalkMilesPerSegment', 'maxWalkMinutesPerSegment', 'wheelchair', 'avoidStairs'].some(field => runtimeMobilityField(constraints, field));
}
function renderStructuredGuidance(input, { bundle, constraints } = {}) {
  const reasons = [];
  if (!Array.isArray(input?.segments) || !input.segments.length || input.segments.length > 16) {
    return { ok: false, text: '', reasonCodes: ['guidance_structure_invalid'] };
  }
  const paragraphs = input.segments.map(segment => {
    if (!['information', 'recommend', 'avoid'].includes(segment.stance) || typeof segment.text !== 'string') {
      reasons.push('guidance_structure_invalid'); return '';
    }
    const safety = require('./proseConstraintSafety').evaluateProseConstraintSafety({ text: segment.text, constraints });
    reasons.push(...safety.reasonCodes);
    if (segment.stance === 'information') return segment.text;
    let name;
    if (segment.constraintRef === 'avoidExposure' && segment.stance === 'avoid'
      && require('./planningInputContract').isAvoidExposureActive(constraints, '')) name = 'exposed routes';
    else {
      const records = (bundle?.evidence || []).filter(row => row.evidenceId === segment.evidenceRef);
      const place = require('./evidencePlaceCandidate').normalizeEvidencePlaceCandidates({ evidence: records })[0];
      if (!place || place.identityAmbiguous) { reasons.push('guidance_subject_unbound'); return ''; }
      name = place.canonicalName;
      if (segment.stance === 'recommend') reasons.push(...require('./candidateViability').evaluateCandidateConstraints({
        records, name, type: place.canonicalType, constraints, bundle,
      }).reasonCodes);
    }
    return `${segment.stance === 'avoid' ? 'Avoid' : 'Consider'} ${name}. ${segment.text}`.trim();
  });
  return { ok: reasons.length === 0, text: paragraphs.join('\n\n'), reasonCodes: [...new Set(reasons)] };
}
module.exports = { GUIDANCE_TOOL, needsStructuredGuidance, renderStructuredGuidance };
