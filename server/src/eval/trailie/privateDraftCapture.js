'use strict';

/**
 * Stage 13.7 §1 — evaluation-only private draft capture.
 *
 * Purpose: during a live evaluation, retain the exact marker-bearing prose draft
 * and the verifier's structured verdict so a failed attempt can be classified
 * from direct evidence (true contradiction vs. verifier false positive vs. marker
 * failure) instead of guessed at. Stage 13.6 could not do this because drafts
 * were not retained.
 *
 * HARD SAFETY MODEL — capture happens ONLY when ALL of these hold:
 *   1. explicit flag TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true       (default false)
 *   2. evaluation environment (NODE_ENV !== 'production')
 *   3. the caller is the live-evaluation runner (providerMode supplied)
 *   4. a synthetic evaluation scenario (isSyntheticScenario === true)
 *   5. the destination artifacts/private/ is gitignored and writable
 *
 * It writes ONLY synthetic prompts/outputs and derived manifest/verifier data —
 * NEVER API keys, system prompts, hidden reasoning, environment variables, or any
 * real user context. This module lives under eval/ and must never be imported by
 * a production route or the shared chat seam (a structural test enforces that).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PRIVATE_DIR = path.join(REPO_ROOT, 'artifacts', 'private', 'stage13_7_drafts');
const GITIGNORE_MARKER = 'artifacts/private';

/** True only when the explicit flag is set AND we are not in production. */
function isPrivateCaptureEnabled() {
  return String(process.env.TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS).toLowerCase() === 'true'
    && String(process.env.NODE_ENV).toLowerCase() !== 'production';
}

/** Confirm artifacts/private is gitignored before ever writing under it. */
function isDestinationGitignored() {
  try {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    return gi.split(/\r?\n/).some((l) => l.trim().replace(/\/+$/, '') === GITIGNORE_MARKER);
  } catch {
    return false;
  }
}

/** Keep ONLY the whitelisted verifier fields — never spread the whole result. */
function pickVerifierResult(v = {}) {
  return {
    issueCodes: v.issueCodes || [],
    failurePaths: v.failurePaths || [],
    conflictingDuration: v.conflictingDurations || [],
    conflictingDifficulty: v.conflictingDifficulty || [],
    missingDayIds: v.missingDayIds || [],
    missingStopIds: v.missingStopIds || [],
    wrongDayAssignments: v.wrongDayAssignments || [],
    removedStopMentions: v.removedStopMentions || [],
    unsupportedPlanActions: v.unsupportedPlanActions || [],
    ambiguousDifficultyContext: v.ambiguousDifficultyContext || [],
    ambiguousDurationContext: v.ambiguousDurationContext || [],
  };
}

function safeSlug(s) {
  return String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Build the per-attempt capture callback for one run, or null when any gate
 * fails. The returned function matches the runTrailieItineraryTurn onProseAttempt
 * signature: ({ attempt, markerBearingDraft, verifierResult, manifest }) => void.
 *
 * @returns {{ capture: Function|null, active: boolean, reasons: string[], dir: string|null }}
 */
function makeDraftCapturer({ runId, scenarioId, providerMode, isSyntheticScenario } = {}) {
  const reasons = [];
  if (!isPrivateCaptureEnabled()) reasons.push('capture flag off or production');
  if (!providerMode) reasons.push('no live-evaluation runner (providerMode missing)');
  if (isSyntheticScenario !== true) reasons.push('scenario is not a synthetic evaluation fixture');
  if (!isDestinationGitignored()) reasons.push('artifacts/private is not gitignored');

  if (reasons.length) return { capture: null, active: false, reasons, dir: null };

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });

  const capture = ({ attempt, markerBearingDraft, verifierResult, manifest } = {}) => {
    const record = {
      capturedAt: new Date().toISOString(),
      runId: runId || null,
      scenarioId: scenarioId || null,
      providerMode,
      attempt: attempt || null,
      // Synthetic-only content: derived manifest, the model's marker-bearing draft,
      // and the whitelisted verifier verdict. No keys / prompts / env / reasoning.
      manifest: manifest || null,
      markerBearingDraft: typeof markerBearingDraft === 'string' ? markerBearingDraft : '',
      verifierResult: pickVerifierResult(verifierResult),
    };
    const file = path.join(PRIVATE_DIR, `${safeSlug(runId)}__attempt-${safeSlug(attempt)}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
  };

  return { capture, active: true, reasons: [], dir: PRIVATE_DIR };
}

module.exports = {
  PRIVATE_DIR,
  isPrivateCaptureEnabled,
  isDestinationGitignored,
  pickVerifierResult,
  makeDraftCapturer,
};
