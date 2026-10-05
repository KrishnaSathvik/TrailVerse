'use strict';

/**
 * Fix Pass #3F — local/eval-only sanitized plan-stage capture.
 *
 * Retains raw → post-constraint itinerary snapshots so paid Probe failures
 * can distinguish model-thin days from post-filter thinning / prose issues.
 *
 * HARD SAFETY MODEL — capture happens ONLY when ALL of these hold:
 *   1. TRAILIE_EVAL_CAPTURE_PLAN_STAGES=true          (default false)
 *   2. NODE_ENV !== 'production'
 *   3. destination artifacts/private/ is gitignored
 *
 * Writes ONLY sanitized plan shapes + reason codes — never tokens, auth,
 * system prompts, env vars, or full user PII. Disabled by default.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PRIVATE_DIR = path.join(REPO_ROOT, 'artifacts', 'private', 'plan_stages');
const GITIGNORE_MARKER = 'artifacts/private';

function isPlanStageCaptureEnabled(env = process.env) {
  return String(env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES || '').toLowerCase() === 'true'
    && String(env.NODE_ENV || '').toLowerCase() !== 'production';
}

function isDestinationGitignored() {
  try {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    return gi.split(/\r?\n/).some((l) => l.trim().replace(/\/+$/, '') === GITIGNORE_MARKER);
  } catch {
    return false;
  }
}

function safeSlug(s) {
  return String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function sanitizeAlt(alt) {
  if (typeof alt === 'string') {
    const name = alt.trim().slice(0, 120);
    return name ? { name } : null;
  }
  if (!alt || typeof alt !== 'object') return null;
  const name = typeof alt.name === 'string' ? alt.name.trim().slice(0, 120) : '';
  if (!name) return null;
  return {
    name,
    note: typeof alt.note === 'string' ? alt.note.slice(0, 240) : null,
    when: typeof alt.when === 'string' ? alt.when.slice(0, 120) : null,
  };
}

function sanitizeAltList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeAlt).filter(Boolean).slice(0, 12);
}

function sanitizeStop(stop = {}) {
  return {
    name: typeof stop.name === 'string' ? stop.name.slice(0, 120) : null,
    type: stop.type || null,
    // Ordinal/temporal identity. The same-place revisit rule reads these, so a
    // capture that drops them cannot show why a repeat was or was not allowed.
    order: Number.isFinite(Number(stop.order)) ? Number(stop.order) : null,
    startTime: typeof stop.startTime === 'string' ? stop.startTime.slice(0, 16) : null,
    timeWindow: typeof stop.timeWindow === 'string' ? stop.timeWindow.slice(0, 80) : null,
    duration: Number.isFinite(Number(stop.duration)) ? Number(stop.duration) : null,
    exposureLevel: stop.exposureLevel || stop.exposure || null,
    difficulty: stop.difficulty || stop.physicalDifficulty || null,
    note: typeof stop.note === 'string' ? stop.note.slice(0, 240) : null,
    why: typeof stop.why === 'string' ? stop.why.slice(0, 240) : null,
    // Backup forensics — keep structured contingency fields (names/notes only).
    alternatives: sanitizeAltList(stop.alternatives),
    backupOptions: sanitizeAltList(stop.backupOptions),
  };
}

/**
 * Traveler-facing plan narration, bounded.
 *
 * Retained because it is the ONLY input to the last two validators in the
 * chain (`proseConstraintSafety`, `travelerLanguageQuality`). Dropping it is
 * what made the 2026-08-20 attempt 2 unattributable: the plan snapshot proved
 * the days were clean while the field that actually failed was never written.
 */
function sanitizeNarration(plan) {
  const intro = typeof plan?.intro === 'string' ? plan.intro.slice(0, 600) : null;
  const narrativeSections = Array.isArray(plan?.narrativeSections)
    ? plan.narrativeSections.slice(0, 3).map((section) => ({
      placement: typeof section?.placement === 'string' ? section.placement.slice(0, 32) : null,
      heading: typeof section?.heading === 'string' ? section.heading.slice(0, 120) : null,
      markdown: typeof section?.markdown === 'string' ? section.markdown.slice(0, 600) : null,
    }))
    : [];
  return { intro, narrativeSections };
}

function sanitizePlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const days = Array.isArray(plan.days)
    ? plan.days.map((day, idx) => ({
      day: Number.isFinite(Number(day?.day)) ? Number(day.day) : idx + 1,
      label: typeof day?.label === 'string' ? day.label.slice(0, 120) : null,
      stops: Array.isArray(day?.stops) ? day.stops.map(sanitizeStop) : [],
    }))
    : [];
  return {
    ...sanitizeNarration(plan),
    days,
    alternatives: sanitizeAltList(plan.alternatives),
    backupOptions: sanitizeAltList(plan.backupOptions),
    contingency: sanitizeAltList(plan.contingency),
    fallback: sanitizeAltList(plan.fallback),
  };
}

function sanitizeMutationSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const stopRef = (stop) => ({
    dayNumber: Number.isFinite(Number(stop?.dayNumber)) ? Number(stop.dayNumber) : null,
    stopId: typeof stop?.stopId === 'string' ? stop.stopId.slice(0, 120) : null,
    name: typeof stop?.name === 'string' ? stop.name.slice(0, 120) : null,
    ...(stop?.type !== undefined ? { type: stop?.type || null } : {}),
  });
  const bounded = (value) => (typeof value === 'string' ? value.slice(0, 200) : value ?? null);
  return {
    changedStops: (summary.changedStops || []).slice(0, 16).map((stop) => ({
      ...stopRef(stop),
      fieldChanges: (stop.fieldChanges || []).slice(0, 12).map((change) => ({
        field: change?.field || null,
        before: bounded(change?.before),
        after: bounded(change?.after),
      })),
    })),
    addedStops: (summary.addedStops || []).slice(0, 16).map(stopRef),
    removedStops: (summary.removedStops || []).slice(0, 16).map(stopRef),
    preservedFactualFields: (summary.preservedFactualFields || []).slice(0, 12),
    unchangedDayNumbers: (summary.unchangedDayNumbers || []).slice(0, 32),
  };
}

function sanitizePlanPatch(planPatch) {
  if (!planPatch || typeof planPatch !== 'object') return null;
  return {
    response: typeof planPatch.response === 'string' ? planPatch.response.slice(0, 400) : null,
    operations: Array.isArray(planPatch.operations)
      ? planPatch.operations.slice(0, 16).map((operation) => ({
        op: operation?.op || null,
        dayNumber: Number.isFinite(Number(operation?.dayNumber)) ? Number(operation.dayNumber) : null,
        stopId: operation?.stopId || null,
        stopName: operation?.stopName || null,
        day: operation?.day ? sanitizePlan({ days: [operation.day] }).days[0] : null,
        stop: operation?.stop ? sanitizeStop(operation.stop) : null,
        stopOrder: Array.isArray(operation?.stopOrder) ? operation.stopOrder.slice(0, 32) : [],
      }))
      : [],
  };
}

/**
 * @returns {{ capture: Function|null, active: boolean, reasons: string[], dir: string|null }}
 */
function makePlanStageCapturer({ runId = 'local', attempt = 1 } = {}) {
  const reasons = [];
  if (!isPlanStageCaptureEnabled()) reasons.push('capture flag off or production');
  if (!isDestinationGitignored()) reasons.push('artifacts/private is not gitignored');
  if (reasons.length) return { capture: null, active: false, reasons, dir: null };

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });

  /** Attempts THIS capturer (i.e. this turn) has already written. */
  const writtenAttempts = new Set();

  const capture = ({
    attempt: attemptNo = attempt,
    modelTier = null,
    rawPlan = null,
    candidatePlanPatch = null,
    mergedPlan = null,
    postNormalizationPlan = null,
    postConstraintPlan = null,
    reasonCodes = [],
    dayDiagnostics = [],
    coveragePolicy = null,
    // DELTA-TRUE FORENSICS. The deterministic difference between the prior
    // canonical plan and the applied one, recorded the moment it is known.
    mutationSummary = null,
    // MONOTONIC REPAIR FORENSICS (eval-only, like everything else here).
    // `repairInstructionSent` is the bounded, deterministic, validator-derived
    // contract handed to the NEXT attempt. Without it, "the escalation was
    // dispatched blind" is unobservable from outside the process — which is
    // exactly how the 2026-08-24 empty-escalation defect survived a paid gate.
    // System instruction text and plan stop names only; never model reasoning.
    repairInstructionSent = null,
    attemptProgress = null,
    // OPERATIONAL FIT FORENSICS (eval-only). The producer → fit chain is
    // otherwise invisible from outside the process, so a live gate cannot tell
    // "no dependency existed" from "the dependency was never produced".
    operationalFacts = null,
    travelerFit = null,
  } = {}) => {
    const record = {
      capturedAt: new Date().toISOString(),
      runId: runId || null,
      attempt: attemptNo || null,
      modelTier: modelTier || null,
      rawPlan: sanitizePlan(rawPlan),
      candidatePlanPatch: sanitizePlanPatch(candidatePlanPatch),
      mergedPlan: sanitizePlan(mergedPlan),
      postNormalizationPlan: sanitizePlan(postNormalizationPlan),
      postConstraintPlan: sanitizePlan(postConstraintPlan),
      reasonCodes: Array.isArray(reasonCodes) ? reasonCodes.slice(0, 16) : [],
      dayDiagnostics: Array.isArray(dayDiagnostics) ? dayDiagnostics.slice(0, 16) : [],
      coveragePolicy: typeof coveragePolicy === 'string' ? coveragePolicy : null,
      mutationSummary: sanitizeMutationSummary(mutationSummary),
      repairInstructionSent: typeof repairInstructionSent === 'string'
        ? repairInstructionSent.slice(0, 4000)
        : null,
      operationalFacts: Array.isArray(operationalFacts)
        ? operationalFacts.slice(0, 40).map((f) => ({
          place: typeof f?.subject?.name === 'string' ? f.subject.name.slice(0, 120) : null,
          type: f?.type || null,
          requirement: typeof f?.requirement === 'string' ? f.requirement.slice(0, 160) : null,
          confidence: f?.confidence || null,
          field: f?.provenance?.field || null,
          sourceUrl: typeof f?.provenance?.sourceUrl === 'string' ? f.provenance.sourceUrl.slice(0, 300) : null,
          excerpt: typeof f?.provenance?.excerpt === 'string' ? f.provenance.excerpt.slice(0, 200) : null,
        }))
        : null,
      travelerFit: travelerFit && typeof travelerFit === 'object'
        ? {
          ok: travelerFit.ok === true,
          reasonCodes: (travelerFit.reasonCodes || []).slice(0, 8),
          findings: (travelerFit.findings || []).slice(0, 12).map((f) => ({
            dayNumber: f?.dayNumber ?? null,
            stopName: typeof f?.stopName === 'string' ? f.stopName.slice(0, 120) : null,
            fit: f?.fit || null,
            kinds: (f?.kinds || []).slice(0, 8),
            source: f?.source || null,
          })),
        }
        : null,
      attemptProgress: attemptProgress && typeof attemptProgress === 'object'
        ? {
          progress: attemptProgress.progress || null,
          satisfied: (attemptProgress.satisfied || []).slice(0, 16),
          failed: (attemptProgress.failed || []).slice(0, 16),
          regressed: (attemptProgress.regressed || []).slice(0, 16),
          discovered: (attemptProgress.discovered || []).slice(0, 16),
        }
        : null,
    };
    const file = path.join(
      PRIVATE_DIR,
      `${safeSlug(runId)}__attempt-${safeSlug(attemptNo)}.json`
    );
    // One attempt is captured TWICE: once by validation (plans + codes) and once
    // after the repair contract for the NEXT attempt is built. Merge rather than
    // overwrite, keeping whichever side actually carries the value, so neither
    // write erases the other's fields.
    //
    // SCOPED TO THIS CAPTURER. The filename is keyed on runId+attempt only, so
    // every turn in a gate writes `<runId>__attempt-1.json`. Merging against
    // whatever happens to be on disk therefore let one turn inherit the previous
    // turn's fields: in gate #4, C1 passed on attempt 1 with `reasonCodes: []`
    // and the empty array inherited B2's `["zero_duration_stops"]`. A capturer
    // is created per turn, so "did I write this attempt?" is exactly the right
    // question — and a fresh turn always starts clean.
    let merged = record;
    try {
      if (writtenAttempts.has(String(attemptNo)) && fs.existsSync(file)) {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        merged = { ...existing };
        for (const [key, value] of Object.entries(record)) {
          const empty = value == null || (Array.isArray(value) && value.length === 0);
          if (!empty || merged[key] === undefined) merged[key] = value;
        }
      }
    } catch { merged = record; }
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
    writtenAttempts.add(String(attemptNo));
    return file;
  };

  return { capture, active: true, reasons: [], dir: PRIVATE_DIR };
}

module.exports = {
  PRIVATE_DIR,
  isPlanStageCaptureEnabled,
  isDestinationGitignored,
  sanitizeNarration,
  sanitizePlan,
  sanitizeStop,
  sanitizePlanPatch,
  makePlanStageCapturer,
};
