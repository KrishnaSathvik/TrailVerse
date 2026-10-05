'use strict';

/**
 * Trailie review orchestration.
 *
 * The model is a DETECTOR ONLY: it returns quotes and suggested patches for one
 * section at a time. It never sees or returns the whole response, never returns
 * itinerary data, and never rewrites anything. All authority, criticality, and
 * mutation decisions are code-owned downstream.
 *
 * Replaces the deleted repair pipeline (REPAIR_SYSTEM_PROMPT / repairTrailieResponse).
 */

const { CLAUDE_REVIEWER_MODEL } = require('../config/aiModels');
const {
  splitIntoSections,
  buildReviewWindows,
  describeSectioning,
} = require('../utils/responseSections');
const { resolveIssueMatch } = require('../utils/responsePatching');
const {
  evaluateIssuePolicy,
  buildSectionScope,
  POLICY_STATUS,
} = require('../utils/responsePatchPolicy');
const {
  runReviewerFailSafe,
  resolveReviewerMode,
  REVIEWER_MODE,
  REVIEW_STRATEGY,
} = require('../utils/reviewerFailSafe');
const { FACT_EVIDENCE_REASON, CANONICAL_FACT_STATUS } = require('../utils/canonicalFacts');
const { runVerificationPass } = require('../utils/reviewVerification');

/**
 * Why one section ended up with no usable evidence. Keeps "we never asked",
 * "we asked and it failed", and "we had facts but none applied here" distinct so
 * downstream verification never treats them identically.
 */
function classifyEmptySectionReason({ canonicalFactStatus, bundleTotal }) {
  if (canonicalFactStatus === CANONICAL_FACT_STATUS.NOT_REQUESTED) {
    return FACT_EVIDENCE_REASON.FACTS_NOT_REQUESTED;
  }
  if (canonicalFactStatus === CANONICAL_FACT_STATUS.FETCH_FAILED || bundleTotal === 0) {
    return FACT_EVIDENCE_REASON.FACTS_UNAVAILABLE;
  }
  return FACT_EVIDENCE_REASON.NO_RELEVANT_FACT;
}

const MAX_CONCURRENCY = Number(process.env.TRAILIE_REVIEWER_MAX_CONCURRENCY) || 4;
const SECTION_MAX_CHARS = Number(process.env.TRAILIE_REVIEWER_SECTION_MAX_CHARS) || 6000;
const REVIEW_TIMEOUT_MS = Number(process.env.TRAILIE_REVIEWER_TIMEOUT_MS) || 12000;

const REVIEWER_SYSTEM_PROMPT = `You are Trailie's consistency detector. You do NOT rewrite responses.

You receive ONE section of a response plus the canonical facts that apply to it.
Report only problems you can quote verbatim from the section's own text.

Rules:
- Quote EXACTLY as it appears, including markdown emphasis, links, and bullet syntax.
- Cite evidence only by the ids given in "facts". Never invent an id.
- A Recreation.gov listing never proves a permit is currently required.
- An empty alert feed never proves something is open.
- Do not report style, tone, or writing-quality issues.

Return ONLY valid JSON:
{
  "issues": [
    {
      "type": "closure_conflict" | "unsupported_claim" | "constraint_violation" | "missing_permit_warning" | "drive_time_issue" | "prose_json_mismatch",
      "severity": "low" | "medium" | "high",
      "exactQuote": "verbatim text from this section",
      "recommendedAction": "replace" | "delete" | "add_warning",
      "replacementText": "suggested wording, or empty for delete",
      "evidenceFactIds": ["fact-id"],
      "rationale": "one short internal note"
    }
  ]
}

Return {"issues": []} when the section is consistent with its facts.`;

/** Facts the model is allowed to see for one section. Never the whole bundle. */
function selectFactsForSection({ section, scope, bundle, itineraryEvidence }) {
  const text = String(section.text || '').toLowerCase();
  const selected = new Map();

  for (const fact of bundle.facts || []) {
    const inScope = !fact.parkCode || scope.sectionParkCodes.includes(fact.parkCode);
    if (!inScope) continue;

    const isCritical = ['closure', 'caution', 'permit', 'road'].includes(fact.category);
    const lexicalHit = (fact.terms || []).some((term) => term.length >= 4 && text.includes(term));

    if (isCritical || lexicalHit) selected.set(fact.id, fact);
  }

  for (const fact of itineraryEvidence.facts || []) {
    if (fact.text && text.includes(String(fact.text).toLowerCase())) selected.set(fact.id, fact);
  }

  return [...selected.values()];
}

/** Only the fields the detector needs — no internal bookkeeping. */
function projectFactForReviewer(fact) {
  return {
    id: fact.id,
    category: fact.category,
    source: fact.source,
    authority: fact.authority,
    status: fact.status,
    text: fact.text,
    parkCode: fact.parkCode || null,
    parkName: fact.parkName || null,
    validFrom: fact.validFrom || null,
    validTo: fact.validTo || null,
    localDate: fact.localDate || null,
    url: fact.url || null,
  };
}

function buildSectionReviewPayload({ window, scope, facts, itineraryExcerpt, constraints }) {
  return JSON.stringify(
    {
      sectionId: window.sectionId,
      sectionLabel: window.label,
      reviewText: window.reviewText,
      ownedRangeDescription:
        'Only quote text inside this section. Surrounding context is provided for reading only.',
      sectionScope: scope,
      immutableItineraryExcerpt: itineraryExcerpt,
      constraints: constraints?.hasConstraints
        ? { fitnessLevel: constraints.fitnessLevel, hasChildren: constraints.hasChildren }
        : null,
      facts: facts.map(projectFactForReviewer),
    },
    null,
    2
  );
}

function parseReviewerIssues(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.issues) ? parsed.issues : null;
  } catch {
    return null;
  }
}

/**
 * Split an oversized section into review units that keep the same canonical
 * ownership and non-overlapping owned subranges. Never truncates.
 */
function splitOversizedWindow(window, maxChars) {
  const ownedLength = window.ownedEndOffset - window.ownedStartOffset;
  if (ownedLength <= maxChars) return [window];

  const units = [];
  const parts = Math.ceil(ownedLength / maxChars);
  const step = Math.ceil(ownedLength / parts);

  for (let i = 0; i < parts; i += 1) {
    const ownedStartOffset = window.ownedStartOffset + i * step;
    const ownedEndOffset = Math.min(window.ownedEndOffset, ownedStartOffset + step);
    if (ownedEndOffset <= ownedStartOffset) continue;

    units.push({
      ...window,
      sectionId: `${window.sectionId}#${i}`,
      parentSectionId: window.sectionId,
      ownedStartOffset,
      ownedEndOffset,
      reviewStartOffset: Math.max(window.reviewStartOffset, ownedStartOffset - 200),
      reviewEndOffset: Math.min(window.reviewEndOffset, ownedEndOffset + 200),
    });
  }

  return units;
}

/** Bounded-concurrency map that never lets one rejection cancel its siblings. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (err) {
        results[index] = { status: 'error', error: err.message, item: items[index] };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

function withTimeout(promise, ms, onTimeout) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(onTimeout()), ms)),
  ]);
}

/** Review one window. Returns a per-section status; never throws. */
async function reviewSection({ anthropic, window, scope, facts, itineraryExcerpt, constraints, model }) {
  const base = { sectionId: window.sectionId, issues: [] };
  if (!anthropic) return { ...base, status: 'error' };

  const payload = buildSectionReviewPayload({ window, scope, facts, itineraryExcerpt, constraints });

  try {
    const call = anthropic.messages
      .create({
        model: model || CLAUDE_REVIEWER_MODEL,
        max_tokens: 1500,
        temperature: 0.1,
        system: REVIEWER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: payload }],
      })
      .then((result) => {
        const raw = (result.content || [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
        const issues = parseReviewerIssues(raw);
        return issues === null
          ? { ...base, status: 'malformed' }
          : { ...base, status: 'ok', issues };
      });

    return await withTimeout(call, REVIEW_TIMEOUT_MS, () => ({ ...base, status: 'timeout' }));
  } catch (err) {
    return { ...base, status: 'error', error: err.message };
  }
}

function itineraryExcerptFor(itineraryData) {
  if (!itineraryData?.days) return null;
  return {
    days: itineraryData.days.map((day) => ({
      id: day.id,
      label: day.label,
      stops: (day.stops || []).map((stop) => ({
        id: stop.id,
        name: stop.name,
        parkCode: stop.parkCode || null,
      })),
    })),
  };
}

/**
 * Full review pipeline. Returns prose and metadata ONLY — itineraryData is never
 * returned or modified here.
 *
 * @returns {Promise<{content: string, reviewMeta: Object}>}
 */
async function runTrailieReviewPipeline({
  anthropic,
  responseContent,
  itineraryData = null,
  constraints = null,
  canonicalFactBundle = { facts: [], byId: {} },
  canonicalFactStatus = null,
  resolvedMetadata = {},
  allExtractedParks = [],
  userMessage = '',
  responseMode = 'buddy',
  provider = 'claude',
  mode = process.env.TRAILIE_REVIEWER_MODE,
  enforcementEnabled = process.env.TRAILIE_REVIEWER_ENFORCEMENT_ENABLED === 'true',
  logPrefix = '[Trailie Review]',
}) {
  const requestedMode = resolveReviewerMode(mode);
  // Enforcement additionally requires an explicit kill-switch-safe flag.
  const reviewerMode =
    requestedMode === REVIEWER_MODE.ENFORCE && !enforcementEnabled
      ? REVIEWER_MODE.SHADOW
      : requestedMode;

  const { sections, unterminatedFence } = describeSectioning(responseContent);
  const bundleSummary = summarizeCanonicalBundle(canonicalFactBundle);
  const baseMeta = {
    canonicalFactStatus,
    ...bundleSummary,
    sectionsWithNoFacts: [],
    sectionEvidenceReasons: {},
    reviewerRan: false,
    reviewerMode,
    reviewStrategy: REVIEW_STRATEGY,
    reviewStatus: 'skipped',
    reviewerPassed: true,
    reviewerSeverity: 'none',
    reviewerIssueTypes: [],
    sectionsTotal: sections.length,
    sectionsReviewed: 0,
    sectionsFailed: 0,
    sectionsTimedOut: 0,
    reviewCoverageRatio: 0,
    issuesDetected: 0,
    policyApproved: 0,
    wouldApply: 0,
    wouldWarn: 0,
    wouldQuarantine: 0,
    patchesApplied: 0,
    repaired: false, // deprecated — retained for downstream consumers
    verificationRan: false,
    verificationFailedSections: [],
    contentUnverified: false,
    factIdsBySection: {},
    unterminatedFence,
  };

  if (reviewerMode === REVIEWER_MODE.OFF || !sections.length) {
    return { content: responseContent, reviewMeta: baseMeta };
  }

  const windows = buildReviewWindows(responseContent, sections).flatMap((w) =>
    splitOversizedWindow(w, SECTION_MAX_CHARS)
  );

  const resolvedParkCodes = [
    resolvedMetadata?.parkCode,
    ...allExtractedParks.map((p) => p.parkCode),
  ].filter(Boolean);

  const itineraryEvidence = { facts: [] };
  const itineraryExcerpt = itineraryExcerptFor(itineraryData);
  const factIdsBySection = {};

  const prepared = windows.map((window) => {
    const section = sections.find((s) => window.sectionId.startsWith(s.sectionId)) || sections[0];
    const scope = buildSectionScope({
      section,
      itineraryData,
      resolvedParkCodes,
      bundle: canonicalFactBundle,
    });
    const facts = selectFactsForSection({
      section,
      scope,
      bundle: canonicalFactBundle,
      itineraryEvidence,
    });
    factIdsBySection[window.sectionId] = facts.map((f) => f.id);
    return { window, section, scope, facts };
  });

  const reviewResults = await mapWithConcurrency(prepared, MAX_CONCURRENCY, (unit) =>
    reviewSection({
      anthropic,
      window: unit.window,
      scope: unit.scope,
      facts: unit.facts,
      itineraryExcerpt,
      constraints,
    })
  );

  const sectionsReviewed = reviewResults.filter((r) => r?.status === 'ok').length;
  const sectionsTimedOut = reviewResults.filter((r) => r?.status === 'timeout').length;
  const sectionsFailed = reviewResults.filter(
    (r) => r?.status === 'error' || r?.status === 'malformed'
  ).length;

  // Deterministic match → policy for every reported issue.
  const policyResults = [];
  const issueTypes = new Set();

  reviewResults.forEach((result, index) => {
    if (result?.status !== 'ok') return;
    const unit = prepared[index];

    for (const issue of result.issues) {
      issueTypes.add(issue.type);
      const match = resolveIssueMatch({
        content: responseContent,
        section: unit.section,
        reviewWindow: unit.window,
        issue: { ...issue, action: issue.recommendedAction },
      });

      policyResults.push({
        ...evaluateIssuePolicy({
          issue: { ...issue, action: issue.recommendedAction },
          match,
          section: unit.section,
          sectionScope: unit.scope,
          canonicalFactBundle,
          itineraryData,
          constraints,
        }),
        // Tag the owning section so verification can attribute a failure to it.
        sectionId: unit.window.sectionId,
      });
    }
  });

  // Stage 6B — verify the hypothetical corrections shadow review would apply,
  // against the same real evidence. Read-only: it never mutates or applies.
  const verification = runVerificationPass({
    policyResults,
    canonicalFactBundle,
    itineraryData,
    constraints,
  });

  const failSafe = runReviewerFailSafe({
    originalContent: responseContent,
    mode: reviewerMode,
    sections,
    policyResults,
    reviewerStatus: sectionsReviewed === 0 && windows.length > 0 ? 'error' : 'ok',
    canonicalFactBundle,
  });

  // Shadow mode must be structurally incapable of changing the response.
  if (reviewerMode === REVIEWER_MODE.SHADOW && failSafe.content !== responseContent) {
    console.error(`${logPrefix} Shadow mode produced a content diff — discarding review output`);
    return {
      content: responseContent,
      reviewMeta: { ...baseMeta, reviewerRan: true, reviewStatus: 'error', reviewerPassed: false },
    };
  }

  const coverage = windows.length ? sectionsReviewed / windows.length : 0;
  const reviewStatus =
    sectionsReviewed === 0 ? 'error' : coverage < 1 ? 'partial' : 'ok';

  return {
    content: failSafe.content,
    reviewMeta: {
      ...baseMeta,
      reviewerRan: true,
      reviewerModel: CLAUDE_REVIEWER_MODEL,
      reviewStatus,
      // Incomplete coverage can never be reported as a clean pass.
      reviewerPassed: reviewStatus === 'ok' && policyResults.every((r) => !r.derivedCritical),
      reviewerSeverity: policyResults.some((r) => r.derivedCritical) ? 'high' : 'none',
      reviewerIssueTypes: [...issueTypes],
      sectionsReviewed,
      sectionsFailed,
      sectionsTimedOut,
      reviewCoverageRatio: Number(coverage.toFixed(3)),
      sectionsWithNoFacts: Object.keys(factIdsBySection).filter(
        (sectionId) => (factIdsBySection[sectionId] || []).length === 0
      ),
      sectionEvidenceReasons: Object.fromEntries(
        Object.keys(factIdsBySection)
          .filter((sectionId) => (factIdsBySection[sectionId] || []).length === 0)
          .map((sectionId) => [
            sectionId,
            classifyEmptySectionReason({
              canonicalFactStatus,
              bundleTotal: bundleSummary.canonicalFactsTotal,
            }),
          ])
      ),
      issuesDetected: policyResults.length,
      policyApproved: policyResults.filter((r) => r.status === POLICY_STATUS.APPROVED).length,
      wouldApply: failSafe.metadata.wouldApply,
      wouldWarn: failSafe.metadata.wouldWarn,
      wouldQuarantine: failSafe.metadata.wouldQuarantine,
      patchesApplied: failSafe.metadata.patchesApplied,
      verificationRan: verification.verificationRan,
      verificationFailedSections: verification.verificationFailedSections,
      hypotheticalPatchesVerified: verification.hypotheticalPatchesVerified,
      hypotheticalPatchesFailed: verification.hypotheticalPatchesFailed,
      // Unverified if the fail-safe couldn't confirm review OR any hypothetical
      // correction failed verification against the real evidence.
      contentUnverified: failSafe.metadata.contentUnverified || verification.contentUnverified,
      guardStatus: failSafe.guardStatus,
      factIdsBySection,
      itineraryParkIdentityCoverage: measureParkIdentityCoverage(itineraryData),
      provider,
      responseMode,
      userMessagePresent: Boolean(userMessage),
    },
  };
}

/**
 * Counts-and-ids-only summary of a canonical bundle for shadow metadata. Never
 * includes fact text — production metadata must not persist full evidence.
 */
function summarizeCanonicalBundle(bundle) {
  const facts = bundle?.facts || bundle?.all || [];
  const bySource = Object.create(null);
  const byPark = Object.create(null);

  for (const fact of facts) {
    bySource[fact.source] = (bySource[fact.source] || 0) + 1;
    if (fact.parkCode) byPark[fact.parkCode] = (byPark[fact.parkCode] || 0) + 1;
  }

  return {
    canonicalFactsTotal: facts.length,
    canonicalFactsBySource: { ...bySource },
    canonicalFactsByPark: { ...byPark },
    factMergeErrors: bundle?.mergeErrors ? [...bundle.mergeErrors] : [],
  };
}

function measureParkIdentityCoverage(itineraryData) {
  let stopsTotal = 0;
  let stopsWithParkCode = 0;

  for (const day of itineraryData?.days || []) {
    for (const stop of day.stops || []) {
      stopsTotal += 1;
      if (stop.parkCode) stopsWithParkCode += 1;
    }
  }

  return { stopsTotal, stopsWithParkCode, stopsUnknownPark: stopsTotal - stopsWithParkCode };
}

module.exports = {
  REVIEWER_SYSTEM_PROMPT,
  MAX_CONCURRENCY,
  SECTION_MAX_CHARS,
  REVIEW_TIMEOUT_MS,
  selectFactsForSection,
  projectFactForReviewer,
  buildSectionReviewPayload,
  parseReviewerIssues,
  splitOversizedWindow,
  mapWithConcurrency,
  reviewSection,
  measureParkIdentityCoverage,
  runTrailieReviewPipeline,
};
