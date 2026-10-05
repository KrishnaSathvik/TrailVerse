'use strict';

/**
 * Stage B — bounded semantic resolution for the small remainder deterministic
 * understanding genuinely cannot read.
 *
 * Measured on the unchanged 300-sample corpus, that remainder is 7.3% of turns:
 * elliptical references (5.7%), unclear destination relationships (1.0%), and
 * comparisons whose second entity did not resolve (0.7%). Nothing else reaches
 * this module — not low confidence, not non-travel, not an underspecified user.
 *
 * This is a CLASSIFICATION call. It refines the canonical TurnUnderstanding and
 * never speaks to the traveler, retrieves evidence, or invents traveler facts.
 *
 * The dispatcher is always injected; this module constructs no provider, so it
 * cannot make a live call by accident. With no dispatcher the deterministic
 * understanding passes through untouched.
 */

const { normalizeUserText } = require('../utils/lexicalNormalization');
const {
  resolveRuntimeActivityPreference,
  runtimeMobilityField,
} = require('../utils/canonicalRuntimeProjection');
const {
  TASK_FAMILIES,
  ARTIFACTS,
  OPERATIONAL_SUBJECTS,
  RESOLUTION_STRENGTH,
} = require('./turnUnderstanding');
const { DESTINATION_RELATIONSHIPS } = require('../utils/destinationRelationship');

const SEMANTIC_RESOLVER_VERSION = 'trailie-turn-semantics-v2';
/** Classification only — the cheapest tier that reads intent reliably. */
const SEMANTIC_MODEL = 'gpt-6-luna';
// Lowest effort this model accepts. It does NOT support 'minimal' — that value
// is rejected with HTTP 400 unsupported_value before inference, which the
// 2026-08-18 live calibration hit on all five dispatches. Supported values are
// 'none', 'low', 'medium', 'high', 'xhigh', 'max'; 'low' matches LUNA_LOW in
// trailieModelRouter. Pre-flight now probes this combination before spending.
const SEMANTIC_REASONING_EFFORT = 'low';
const MAX_INPUT_CHARS = 1200;
const MAX_CONTEXT_TURNS = 4;
const MAX_CONTEXT_CHARS = 800;

/**
 * The ONLY reasons that may spend a semantic call. Gating on reasons rather
 * than on a confidence threshold is deliberate: a low score is not evidence
 * that a model can help, and it is how a 7% escape hatch would quietly become
 * a call on every turn.
 */
const PRODUCTION_TRIGGER_REASONS = Object.freeze([
  'elliptical_reference',
  'unclear_destination_relationship',
  'unresolved_comparison_entity',
]);

/** Fields a patch may carry. Anything else is ignored. */
const PATCHABLE_FIELDS = Object.freeze([
  'taskFamily',
  'destinationRelationship',
  'continuationOfActiveDecision',
  'resolvedReference',
  'requestedArtifact',
  'forbiddenArtifacts',
  'operationalSubjects',
  'explicitConstraints',
  'topicShift',
  'reasonCodes',
  'confidence',
]);

const GROUNDABLE_CONSTRAINTS = Object.freeze([
  'avoidExposure',
  'walkingTolerance',
  'maxWalkMilesPerSegment',
  'hiking',
  'pace',
]);

const CONSTRAINT_VALUES = Object.freeze({
  avoidExposure: [true, false],
  walkingTolerance: ['limited'],
  hiking: ['none', 'easy', 'moderate', 'hard'],
  pace: ['relaxed', 'moderate', 'packed'],
});

/** Keys that would mean the model invented a canonical identity. */
const FORBIDDEN_PATCH_KEYS = Object.freeze(['entityId', 'parkCode', 'destinationRefs', 'canonicalId']);

const OUTCOMES = Object.freeze({
  RESOLVED: 'resolved',
  PARTIAL: 'partially_resolved',
  UNRESOLVED: 'unresolved',
  INVALID: 'invalid_output',
  GROUNDING_REJECTED: 'grounding_rejected',
  DISPATCHER_ERROR: 'dispatcher_error',
  NOT_ATTEMPTED: 'not_attempted',
});

// ---------------------------------------------------------------------------
// Trigger gate
// ---------------------------------------------------------------------------

/**
 * Eligibility is decided by named reasons only.
 */
function shouldResolveSemantically(understanding) {
  const reasons = Array.isArray(understanding?.semanticResolutionReasons)
    ? understanding.semanticResolutionReasons
    : [];
  const triggerReasons = reasons.filter((reason) => PRODUCTION_TRIGGER_REASONS.includes(reason));
  // Belt and braces: a self-determined or underspecified turn can never qualify
  // even if a reason leaked onto it.
  const excluded = ['non_travel', 'meta_help'].includes(understanding?.taskFamily)
    || understanding?.underspecified === true;
  return {
    eligible: triggerReasons.length > 0 && !excluded,
    triggerReasons,
  };
}

// ---------------------------------------------------------------------------
// Input contract — deliberately small
// ---------------------------------------------------------------------------

function boundedContext(recentTurns = []) {
  const turns = Array.isArray(recentTurns) ? recentTurns.slice(-MAX_CONTEXT_TURNS) : [];
  const mapped = turns.map((turn) => ({
    role: turn?.role === 'assistant' ? 'assistant' : 'user',
    content: normalizeUserText(turn?.content || '').slice(0, MAX_CONTEXT_CHARS / MAX_CONTEXT_TURNS),
  })).filter((turn) => turn.content);
  return mapped;
}

/**
 * Only what is needed to resolve the reference. No evidence bundle, no history
 * beyond the immediate context, no personalization, no provider metadata.
 */
function buildSemanticRequest({
  understanding,
  activeDecision = null,
  recentTurns = [],
  resolvedEntities = [],
  travelerConstraints = null,
} = {}) {
  const text = normalizeUserText(understanding?.normalizedText || understanding?.originalText || '');
  const { triggerReasons } = shouldResolveSemantically(understanding);
  return {
    version: SEMANTIC_RESOLVER_VERSION,
    model: SEMANTIC_MODEL,
    reasoningEffort: SEMANTIC_REASONING_EFFORT,
    web: false,
    retrieval: false,
    task: 'refine_turn_understanding',
    triggerReasons,
    input: {
      message: text.slice(0, MAX_INPUT_CHARS),
      recentContext: boundedContext(recentTurns),
      activeDecision: activeDecision || understanding?.priorJob || null,
      deterministic: {
        taskFamily: understanding?.taskFamily || null,
        taskStrength: understanding?.taskStrength || null,
        destinationRelationship: understanding?.destinationRelationship || null,
        requestedArtifact: understanding?.requestedArtifact || null,
        forbiddenArtifacts: understanding?.forbiddenArtifacts || [],
      },
      // Names only — the model may reference them, never mint new ones.
      resolvedDestinations: (resolvedEntities || [])
        .map((entity) => entity?.displayName || entity?.parkName)
        .filter(Boolean)
        .slice(0, 6),
      travelerConstraints: travelerConstraints
        ? {
          // Canonical projection, not `constraints.mobility` alone — that layer
          // is turn-local and is empty on every refinement turn.
          maxWalkMilesPerSegment: runtimeMobilityField(travelerConstraints, 'maxWalkMilesPerSegment'),
          walkingTolerance: runtimeMobilityField(travelerConstraints, 'walkingTolerance'),
          avoidExposure: travelerConstraints?.avoidExposure ?? null,
          hiking: resolveRuntimeActivityPreference(travelerConstraints, 'hiking'),
        }
        : null,
    },
    schema: {
      patchableFields: PATCHABLE_FIELDS,
      taskFamily: TASK_FAMILIES,
      requestedArtifact: ARTIFACTS,
      destinationRelationship: DESTINATION_RELATIONSHIPS,
      operationalSubjects: OPERATIONAL_SUBJECTS,
      constraints: GROUNDABLE_CONSTRAINTS,
    },
  };
}

// ---------------------------------------------------------------------------
// Validation + grounding
// ---------------------------------------------------------------------------

function isBoundedConfidence(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function containsSpan(haystacks, span) {
  const needle = String(span || '').trim().toLowerCase();
  if (needle.length < 3) return false;
  return haystacks.some((text) => String(text || '').toLowerCase().includes(needle));
}

function isGroundedConstraint(constraint, haystacks) {
  if (!constraint || typeof constraint !== 'object') return false;
  if (!GROUNDABLE_CONSTRAINTS.includes(constraint.field)) return false;
  const allowed = CONSTRAINT_VALUES[constraint.field];
  if (allowed && !allowed.includes(constraint.value)) return false;
  if (constraint.field === 'maxWalkMilesPerSegment') {
    const n = Number(constraint.value);
    if (!Number.isFinite(n) || n <= 0 || n > 30) return false;
  }
  const span = constraint.supportingSpan || constraint.span;
  return containsSpan(haystacks, span);
}

/** Deep scan: a patch must never carry a canonical identity. */
function containsForbiddenIdentity(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PATCH_KEYS.includes(key)) return true;
    if (child && typeof child === 'object' && containsForbiddenIdentity(child, depth + 1)) return true;
  }
  return false;
}

function validateSemanticPatch(patch, { normalizedText = '', contextText = '' } = {}) {
  const errors = [];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { valid: false, errors: ['semantic_patch_not_object'] };
  }
  if (containsForbiddenIdentity(patch)) errors.push('semantic_patch_invented_identity');

  if (patch.taskFamily != null && !TASK_FAMILIES.includes(patch.taskFamily)) errors.push('task_family_invalid');
  if (patch.requestedArtifact != null && !ARTIFACTS.includes(patch.requestedArtifact)) {
    errors.push('requested_artifact_invalid');
  }
  if (patch.forbiddenArtifacts != null
    && (!Array.isArray(patch.forbiddenArtifacts)
      || patch.forbiddenArtifacts.some((item) => !ARTIFACTS.includes(item)))) {
    errors.push('forbidden_artifacts_invalid');
  }
  if (patch.destinationRelationship != null
    && !DESTINATION_RELATIONSHIPS.includes(patch.destinationRelationship)) {
    errors.push('destination_relationship_invalid');
  }
  if (patch.operationalSubjects != null
    && (!Array.isArray(patch.operationalSubjects)
      || patch.operationalSubjects.some((item) => !OPERATIONAL_SUBJECTS.includes(item)))) {
    errors.push('operational_subjects_invalid');
  }
  if (patch.confidence != null && !isBoundedConfidence(patch.confidence)) errors.push('confidence_invalid');
  if (patch.continuationOfActiveDecision != null && typeof patch.continuationOfActiveDecision !== 'boolean') {
    errors.push('continuation_invalid');
  }
  if (patch.topicShift != null && typeof patch.topicShift !== 'boolean') errors.push('topic_shift_invalid');

  const haystacks = [normalizedText, contextText];
  if (patch.explicitConstraints != null) {
    if (!Array.isArray(patch.explicitConstraints)) {
      errors.push('constraints_invalid');
    } else if (patch.explicitConstraints.some((c) => !isGroundedConstraint(c, haystacks))) {
      errors.push('constraint_not_grounded');
    }
  }
  // A resolved reference must quote real language too.
  if (patch.resolvedReference != null) {
    const span = patch.resolvedReference.supportingSpan || patch.resolvedReference.span;
    if (!containsSpan(haystacks, span)) errors.push('reference_not_grounded');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Merge with explicit precedence
// ---------------------------------------------------------------------------

/**
 * Precedence:
 *   1. explicit deterministic facts and prohibitions
 *   2. canonical traveler state
 *   3. grounded semantic resolution of genuinely ambiguous fields
 *   4. weak deterministic inference
 *   5. unknown
 */
function mergeSemanticPatch(understanding, patch, { triggerReasons = [] } = {}) {
  const merged = { ...understanding };
  const fieldsPatched = [];
  const deterministicIsExplicit = understanding.taskStrength === RESOLUTION_STRENGTH.EXPLICIT;

  // taskFamily — never overrides an explicit deterministic reading.
  if (patch.taskFamily && !deterministicIsExplicit && patch.taskFamily !== understanding.taskFamily) {
    merged.taskFamily = patch.taskFamily;
    fieldsPatched.push('taskFamily');
  }

  // destinationRelationship — only where determinism was actually unsure.
  const relationshipAmbiguous = understanding.destinationRelationship === 'unknown'
    || (understanding.destinationRelationshipConfidence ?? 0) < 0.75;
  if (patch.destinationRelationship && relationshipAmbiguous
    && triggerReasons.some((r) => r === 'unclear_destination_relationship' || r === 'unresolved_comparison_entity')) {
    merged.destinationRelationship = patch.destinationRelationship;
    merged.destinationRelationshipConfidence = Math.min(patch.confidence ?? 0.7, 0.85);
    fieldsPatched.push('destinationRelationship');
  }

  // A prohibition found by EITHER stage stands; the model can add one but never
  // remove one.
  if (Array.isArray(patch.forbiddenArtifacts) && patch.forbiddenArtifacts.length) {
    const union = [...new Set([...(understanding.forbiddenArtifacts || []), ...patch.forbiddenArtifacts])];
    if (union.length !== (understanding.forbiddenArtifacts || []).length) {
      merged.forbiddenArtifacts = union;
      fieldsPatched.push('forbiddenArtifacts');
    }
  }

  // requestedArtifact — refused outright when it contradicts a prohibition, and
  // never allowed to manufacture a required structure policy.
  if (patch.requestedArtifact
    && !merged.forbiddenArtifacts.includes(patch.requestedArtifact)
    && !deterministicIsExplicit) {
    merged.requestedArtifact = patch.requestedArtifact;
    fieldsPatched.push('requestedArtifact');
  }

  if (Array.isArray(patch.operationalSubjects) && patch.operationalSubjects.length) {
    const union = [...new Set([...(understanding.operationalSubjects || []), ...patch.operationalSubjects])];
    if (union.length !== (understanding.operationalSubjects || []).length) {
      merged.operationalSubjects = union;
      fieldsPatched.push('operationalSubjects');
    }
  }

  // Constraints — a deterministic value for the same field always wins, because
  // the traveler stated it explicitly in a form we already parsed.
  if (Array.isArray(patch.explicitConstraints) && patch.explicitConstraints.length) {
    const existing = new Set((understanding.explicitConstraints || []).map((c) => c.field));
    const additions = patch.explicitConstraints
      .filter((c) => !existing.has(c.field))
      .map((c) => ({
        field: c.field,
        value: c.value,
        source: 'semantic_resolver',
        span: c.supportingSpan || c.span,
        confidence: Number.isFinite(c.confidence) ? c.confidence : (patch.confidence ?? 0.7),
      }));
    if (additions.length) {
      merged.explicitConstraints = [...(understanding.explicitConstraints || []), ...additions];
      fieldsPatched.push('explicitConstraints');
    }
  }

  if (typeof patch.continuationOfActiveDecision === 'boolean'
    && patch.continuationOfActiveDecision !== understanding.continuationOfActiveDecision) {
    merged.continuationOfActiveDecision = patch.continuationOfActiveDecision;
    fieldsPatched.push('continuationOfActiveDecision');
  }
  if (typeof patch.topicShift === 'boolean' && patch.topicShift !== understanding.topicShift) {
    merged.topicShift = patch.topicShift;
    fieldsPatched.push('topicShift');
  }
  if (patch.resolvedReference) {
    merged.resolvedReference = {
      kind: patch.resolvedReference.kind || 'unspecified',
      span: patch.resolvedReference.supportingSpan || patch.resolvedReference.span,
      description: patch.resolvedReference.description || null,
    };
    fieldsPatched.push('resolvedReference');
  }

  // A forbidden artifact can never leave a required structure policy behind.
  if (merged.forbiddenArtifacts.includes('itinerary')) merged.structurePolicy = 'optional';

  merged.understandingSource = fieldsPatched.length ? 'semantic' : 'deterministic';
  merged.semanticResolutionReasons = [];
  merged.needsSemanticResolution = false;
  merged.reasonCodes = [...new Set([
    ...(understanding.reasonCodes || []),
    ...(fieldsPatched.length ? ['semantic_resolution_applied'] : []),
  ])];

  return { merged, fieldsPatched };
}

// ---------------------------------------------------------------------------
// Entry point — at most ONE call, never retried
// ---------------------------------------------------------------------------

async function resolveTurnSemantically({
  understanding,
  dispatch = null,
  activeDecision = null,
  recentTurns = [],
  resolvedEntities = [],
  travelerConstraints = null,
  now = () => Date.now(),
} = {}) {
  if (!understanding) throw new Error('understanding_required');

  const telemetry = {
    attempted: false,
    triggerReasons: [],
    model: SEMANTIC_MODEL,
    outcome: OUTCOMES.NOT_ATTEMPTED,
    fieldsPatched: [],
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    estimatedCost: null,
  };

  const gate = shouldResolveSemantically(understanding);
  telemetry.triggerReasons = gate.triggerReasons;
  if (!gate.eligible || !dispatch || typeof dispatch !== 'function') {
    return { understanding, telemetry };
  }

  const request = buildSemanticRequest({
    understanding, activeDecision, recentTurns, resolvedEntities, travelerConstraints,
  });
  telemetry.attempted = true;
  const startedAt = now();

  let raw;
  try {
    // Exactly one dispatch. No retry loop, no provider escalation: a failed
    // classification must never become expensive generation.
    raw = await dispatch(request);
  } catch (error) {
    telemetry.outcome = OUTCOMES.DISPATCHER_ERROR;
    telemetry.latencyMs = now() - startedAt;
    telemetry.errorCode = typeof error?.code === 'string' ? error.code : 'dispatch_error';
    return { understanding, telemetry };
  }
  telemetry.latencyMs = now() - startedAt;
  telemetry.inputTokens = raw?.usage?.inputTokens ?? null;
  telemetry.outputTokens = raw?.usage?.outputTokens ?? null;
  telemetry.estimatedCost = raw?.cost?.costUsd ?? null;

  const patch = raw && typeof raw === 'object' && raw.patch ? raw.patch : raw;
  const contextText = boundedContext(recentTurns).map((t) => t.content).join(' ');
  const validation = validateSemanticPatch(patch, {
    normalizedText: normalizeUserText(understanding.normalizedText || understanding.originalText || ''),
    contextText,
  });

  if (!validation.valid) {
    telemetry.outcome = validation.errors.some((e) => /grounded|invented_identity/.test(e))
      ? OUTCOMES.GROUNDING_REJECTED
      : OUTCOMES.INVALID;
    telemetry.errors = validation.errors;
    // Deterministic understanding stands. No fabricated job, no crash.
    return { understanding, telemetry };
  }

  if (patch.unresolved === true) {
    telemetry.outcome = OUTCOMES.UNRESOLVED;
    return { understanding, telemetry };
  }

  const { merged, fieldsPatched } = mergeSemanticPatch(understanding, patch, {
    triggerReasons: gate.triggerReasons,
  });
  telemetry.fieldsPatched = fieldsPatched;
  telemetry.outcome = fieldsPatched.length ? OUTCOMES.RESOLVED : OUTCOMES.UNRESOLVED;
  return { understanding: merged, telemetry };
}

module.exports = {
  SEMANTIC_RESOLVER_VERSION,
  SEMANTIC_MODEL,
  SEMANTIC_REASONING_EFFORT,
  PRODUCTION_TRIGGER_REASONS,
  PATCHABLE_FIELDS,
  GROUNDABLE_CONSTRAINTS,
  OUTCOMES,
  shouldResolveSemantically,
  buildSemanticRequest,
  validateSemanticPatch,
  mergeSemanticPatch,
  resolveTurnSemantically,
};
