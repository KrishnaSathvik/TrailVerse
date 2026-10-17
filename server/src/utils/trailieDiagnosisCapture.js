'use strict';

/**
 * Investigation-only capture for root-cause diagnosis.
 * Enabled only when TRAILIE_DIAGNOSIS_CAPTURE=true and NODE_ENV !== production.
 * Writes under gitignored artifacts/private/diagnosis/. Never alters runtime outcomes.
 */

const fs = require('fs');
const path = require('path');
const { diagnoseDayTypes } = require('./trailieDayTypeDiagnosis');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PRIVATE_DIR = path.join(REPO_ROOT, 'artifacts', 'private', 'diagnosis');
const GITIGNORE_MARKER = 'artifacts/private';

function enabled(env = process.env) {
  return String(env.TRAILIE_DIAGNOSIS_CAPTURE || '').toLowerCase() === 'true'
    && String(env.NODE_ENV || '').toLowerCase() !== 'production';
}

function destinationOk() {
  try {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    return gi.split(/\r?\n/).some((line) => line.trim().replace(/\/+$/, '') === GITIGNORE_MARKER);
  } catch {
    return false;
  }
}

function clip(value, max = 400) {
  if (typeof value !== 'string') return value ?? null;
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

const SUITABILITY_FIELDS = ['category', 'difficulty', 'exposureLevel', 'walkingDistanceMiles', 'authority'];

// Model-facing facts are `{ evidenceId, topic, fact, value, source, authority }`
// (trailieTravelData research()). Older shapes are still read for safety.
function sanitizeModelContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const facts = Array.isArray(ctx.facts)
    ? ctx.facts.slice(0, 48).map((fact) => {
      const value = fact?.value && typeof fact.value === 'object' ? fact.value : {};
      const suitability = Object.fromEntries(SUITABILITY_FIELDS
        .filter((key) => value[key] != null).map((key) => [key, value[key]]));
      return {
        evidenceId: fact?.evidenceId || null,
        topic: fact?.topic || null,
        subject: clip(value.name || fact?.subject || fact?.claim?.subject, 120),
        text: clip(fact?.fact || fact?.text || fact?.claim?.text || fact?.summary, 320),
        source: clip(typeof fact?.source === 'string' ? fact.source : fact?.source?.url || fact?.sourceUrl, 200),
        sourceClass: fact?.authority || null,
        ...(Object.keys(suitability).length ? { suitability } : {}),
      };
    })
    : [];
  return {
    factCount: facts.length,
    omittedFactCount: ctx.omittedFactCount ?? null,
    note: clip(ctx.note, 200),
    facts,
    namedPlaceResolutions: Array.isArray(ctx.namedPlaceResolutions)
      ? ctx.namedPlaceResolutions.slice(0, 40).map((row) => ({
        requestedName: clip(row.requestedName, 120),
        status: row.status || null,
        mapEligible: row.mapEligible === true,
        evidenceRef: row.evidenceRef || null,
      }))
      : [],
    unresolved: Array.isArray(ctx.unresolved)
      ? ctx.unresolved.slice(0, 20).map((row) => ({
        reason: clip(row.reason || row.reasonCode, 200),
        name: clip(row.name || row.requestedName, 120),
      }))
      : [],
    parkWideAccessCount: Array.isArray(ctx.parkWideAccess) ? ctx.parkWideAccess.length : 0,
  };
}

function sanitizePlan(plan) {
  if (!plan?.days?.length) return null;
  return {
    parkName: plan.parkName || null,
    dayCount: plan.days.length,
    intro: clip(plan.intro, 400),
    days: plan.days.map((day, index) => ({
      dayNumber: day.dayNumber || index + 1,
      label: clip(day.label, 120),
      summary: clip(day.dayStructure?.summary, 200),
      type: day.dayStructure?.type || null,
      stopNames: (day.stops || []).slice(0, 12).map((stop) => clip(stop.name, 80)),
      blockKinds: (day.dayStructure?.blocks || []).map((block) => block.kind).slice(0, 12),
    })),
  };
}

function recordFile(responseId, kind) {
  return path.join(PRIVATE_DIR, `${String(responseId).replace(/[^a-zA-Z0-9._-]/g, '_')}__${kind}.json`);
}

function writeRecord(responseId, kind, payload) {
  if (!enabled() || !destinationOk() || !responseId) return null;
  try {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const file = recordFile(responseId, kind);
    let merged = { capturedAt: new Date().toISOString(), responseId, kind, ...payload };
    if (fs.existsSync(file)) {
      try {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        merged = { ...existing, ...merged, capturedAt: existing.capturedAt || merged.capturedAt };
      } catch { /* replace */ }
    }
    fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
    return file;
  } catch {
    return null;
  }
}

// The full evidence bundle is kept (private, gitignored) so a later A/B can
// replay exactly what this turn saw instead of re-fetching.
function captureResearch({ responseId, request, modelContext, toolTelemetry, evidence = null }) {
  return writeRecord(responseId, 'research', {
    frozen: { request: request || null, modelContext: modelContext || null, evidence: Array.isArray(evidence) ? evidence : null },
    request: request ? {
      destination: clip(request.destination, 200),
      question: clip(request.question, 400),
      topics: Array.isArray(request.topics) ? request.topics.slice(0, 8) : null,
      places: Array.isArray(request.places) ? request.places.slice(0, 24).map((name) => clip(name, 80)) : null,
    } : null,
    modelContext: sanitizeModelContext(modelContext),
    toolTelemetry: toolTelemetry || null,
  });
}

function captureProposal({ responseId, proposed, issues, accepted, evaluatedPlan = null, touchedDayNumbers = null }) {
  if (!enabled() || !destinationOk() || !responseId) return null;
  // A patch must be diagnosed against the guard's applied candidate, never
  // against a guessed reconstruction or the previously accepted plan.
  const plan = evaluatedPlan || (proposed?.plan_patch ? null : proposed?.plan || proposed);
  const operations = proposed?.plan_patch?.operations;
  const round = {
    proposed: sanitizePlan(proposed?.plan || proposed),
    hasPlanPatch: Boolean(proposed?.plan_patch),
    issues: Array.isArray(issues) ? issues.slice(0, 24) : [],
    accepted: accepted === true,
    dayTypeDiagnosis: {
      source: evaluatedPlan ? 'guard_candidate' : proposed?.plan_patch ? 'unavailable_patch_candidate' : 'proposal',
      ...diagnoseDayTypes({ plan, touchedDayNumbers, issues }),
    },
    patchOperations: Array.isArray(operations) ? operations.slice(0, 16).map((op, operationIndex) => ({
      operationIndex,
      op: ['update_day', 'update_stop', 'add_stop', 'remove_stop', 'reorder_stops'].includes(op?.op) ? op.op : null,
      dayNumber: Number.isFinite(op?.dayNumber) ? op.dayNumber : null,
    })) : null,
    patchOperationsTruncated: Array.isArray(operations) && operations.length > 16,
  };
  let proposalRounds = [];
  if (enabled() && destinationOk() && responseId) {
    try {
      const existing = JSON.parse(fs.readFileSync(recordFile(responseId, 'proposal'), 'utf8'));
      if (Array.isArray(existing.proposalRounds)) proposalRounds = existing.proposalRounds;
      else if (existing.proposed || existing.hasPlanPatch) {
        proposalRounds = [{
          proposed: existing.proposed || null,
          hasPlanPatch: existing.hasPlanPatch === true,
          issues: Array.isArray(existing.issues) ? existing.issues : [],
          accepted: existing.accepted === true,
        }];
      }
    } catch { /* first proposal round */ }
  }
  return writeRecord(responseId, 'proposal', { ...round, proposalRounds: [...proposalRounds, round] });
}

function captureTerminal({ responseId, telemetry, canonicalPlan, content }) {
  return writeRecord(responseId, 'terminal', {
    status: telemetry?.terminalStatus || null,
    mutationProposed: telemetry?.mutationProposed === true,
    mutationAccepted: telemetry?.mutationAccepted === true,
    mutationIssues: telemetry?.mutationIssues || [],
    mutationRounds: telemetry?.mutationRounds || [],
    corrections: telemetry?.corrections ?? null,
    tools: telemetry?.tools || [],
    canonicalPlan: sanitizePlan(canonicalPlan),
    contentPreview: clip(content, 600),
    timings: telemetry?.timings || null,
    modelCostUsd: telemetry?.modelCostUsd ?? null,
  });
}

module.exports = {
  PRIVATE_DIR,
  enabled,
  captureResearch,
  captureProposal,
  captureTerminal,
};
