'use strict';

/**
 * Deterministic fail-safe rendering for reviewer findings.
 *
 * Builds ONE mutation plan against the original response offsets, applies it
 * highest-offset-first, and audits the result. Calls no LLM provider.
 */

const {
  splitIntoSections,
  validateSectionPartition,
} = require('./responseSections');
const { planDeletion } = require('./responsePatching');
const { POLICY_STATUS, POLICY_BASIS, classifyClaims, CLAIM } = require('./responsePatchPolicy');
const {
  findPlaceholderSpans,
  describePlaceholderRemoval,
} = require('./itineraryPlaceholders');

const REVIEWER_MODE = { OFF: 'off', SHADOW: 'shadow', ENFORCE: 'enforce' };
const REVIEW_STRATEGY = 'deterministic_patch_v1';

const OP_TYPE = {
  REPLACE: 'replace',
  DELETE: 'delete',
  INSERT_WARNING: 'insert_warning',
  REPLACE_SECTION: 'replace_section',
};

/** Highest applies first within a section's cap. Model severity is never consulted. */
const BASIS_PRIORITY = {
  [POLICY_BASIS.POSITIVE_CONTRADICTION]: 0,
  [POLICY_BASIS.ITINERARY_CONFLICT]: 1,
  [POLICY_BASIS.CONSTRAINT_CONFLICT]: 1,
  [POLICY_BASIS.CERTAINTY_DOWNGRADE]: 2,
  [POLICY_BASIS.WARNING_ONLY]: 3,
};

const MAX_PATCHES_PER_SECTION = 3;

/** Live-sensitive wording that justifies a notice when the reviewer itself failed. */
const LIVE_SENSITIVE_RE =
  /\b(clos(?:ed|ure|ing)|permit|reservation|timed entry|road|highway|pass\b|alert|avalanche|flood|wildfire|smoke|storm|hazard|evacuat|restrict|safety)/i;

/** Absent, malformed, or unexpected values must never enable enforcement. */
function resolveReviewerMode(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  return Object.values(REVIEWER_MODE).includes(value) ? value : REVIEWER_MODE.SHADOW;
}

// ---------------------------------------------------------------------------
// Deterministic renderers — no model prose
// ---------------------------------------------------------------------------

function factLine(fact) {
  const park = fact.parkName || fact.parkCode || null;
  const url = fact.url ? ` (${fact.url})` : '';
  return `- ${park ? `${park}: ` : ''}${fact.text}${url}`;
}

const SECTION_WARNING_HEADING = '📍 Important for this section';
const GLOBAL_WARNING_HEADING = '⚠️ Live details to verify before your trip';

function renderSectionWarning({ facts, parkNames }) {
  const scope = parkNames.length ? ` — ${parkNames.join(', ')}` : '';
  const lines = facts.map(factLine).join('\n');
  return `\n> **${SECTION_WARNING_HEADING}${scope}.** This detail could not be fully confirmed against live data.\n${lines}\n`;
}

function renderFinalVerificationBlock(groups) {
  const body = groups
    .map((group) => {
      const scope = group.parkNames.length ? `${group.parkNames.join(', ')}: ` : '';
      return `- ${scope}${group.facts.map((f) => f.text).join('; ')}`;
    })
    .join('\n');
  return `\n\n---\n**${GLOBAL_WARNING_HEADING}.** Some details could not be confirmed against live data:\n${body}\n`;
}

/** Source-grounded stand-in for a section that cannot be safely corrected. */
function renderQuarantinedSection({ sectionLabel, affectedParkNames, confirmedFacts }) {
  const scope = affectedParkNames.length ? ` for ${affectedParkNames.join(', ')}` : '';
  const heading = sectionLabel && sectionLabel.startsWith('#') ? `${sectionLabel}\n\n` : '';
  const facts = confirmedFacts.map(factLine).join('\n');
  return `${heading}This section could not be safely verified against live data${scope}, so it has been withheld. Confirmed information:\n${facts}\n\n`;
}

function renderGuardFallbackBlock(facts) {
  const lines = facts.map(factLine).join('\n');
  return `\n\n---\n**${GLOBAL_WARNING_HEADING}.**\n${lines}\n`;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

function sectionForResult(sections, result) {
  const start = result?.patch?.match?.absoluteStart;
  if (typeof start !== 'number') return null;
  return sections.find((s) => start >= s.startOffset && start < s.endOffset) || null;
}

function factsFor(result, bundle) {
  return (result.acceptedFactIds || [])
    .map((id) => bundle?.byId?.[id])
    .filter(Boolean);
}

function parkNamesFor(facts) {
  return [...new Set(facts.map((f) => f.parkName).filter(Boolean))];
}

/**
 * Which sections qualify for quarantine. Deliberately narrow — quarantine is a
 * last resort, never a response to volume or uncertainty.
 */
function selectQuarantinedSections({ sections, policyResults, bundle }) {
  const bySection = new Map();

  for (const result of policyResults) {
    if (result.status === POLICY_STATUS.APPROVED) continue;
    if (!result.derivedCritical) continue;
    if (
      result.policyBasis !== POLICY_BASIS.POSITIVE_CONTRADICTION &&
      result.policyBasis !== POLICY_BASIS.ITINERARY_CONFLICT
    ) {
      continue;
    }
    if (result.scopeSource === 'unknown' || !result.scopeSource) continue;

    const facts = factsFor(result, bundle);
    if (facts.length === 0) continue;

    const section = sectionForResult(sections, result);
    if (!section) continue;

    if (!bySection.has(section.sectionId)) bySection.set(section.sectionId, { section, results: [], facts: [] });
    const entry = bySection.get(section.sectionId);
    entry.results.push(result);
    entry.facts.push(...facts);
  }

  return [...bySection.values()].filter((entry) => entry.results.length >= 2);
}

/**
 * Build the complete mutation plan against ORIGINAL offsets.
 * @returns {{operations: Array<Object>, skippedByCap: Array<Object>, warnings: Array<Object>, quarantined: Array<Object>, rejected: Array<Object>}}
 */
function buildMutationPlan({ sections, policyResults, bundle, reviewerStatus }) {
  const operations = [];
  const skippedByCap = [];
  const rejected = [];
  const warnings = [];

  // 1. Quarantine decisions come first — they supersede everything inside.
  const quarantined =
    reviewerStatus === 'error' ? [] : selectQuarantinedSections({ sections, policyResults, bundle });
  const quarantinedIds = new Set(quarantined.map((q) => q.section.sectionId));

  for (const entry of quarantined) {
    const facts = [...new Map(entry.facts.map((f) => [f.id, f])).values()];
    operations.push({
      type: OP_TYPE.REPLACE_SECTION,
      startOffset: entry.section.startOffset,
      endOffset: entry.section.endOffset,
      replacementText: renderQuarantinedSection({
        sectionLabel: entry.section.label,
        affectedParkNames: parkNamesFor(facts),
        confirmedFacts: facts,
      }),
      sectionId: entry.section.sectionId,
      auditId: `quarantine-${entry.section.sectionId}`,
      tieRank: 3,
    });
  }

  // A reviewer/provider error is not evidence the response is wrong.
  if (reviewerStatus === 'error') {
    return { operations: [], skippedByCap: [], warnings: [], quarantined: [], rejected: [] };
  }

  // 2/3. Approved patches, capped and prioritised per section.
  const approvedBySection = new Map();
  for (const result of policyResults) {
    if (result.status !== POLICY_STATUS.APPROVED || !result.patch) continue;
    const section = sectionForResult(sections, result);
    if (!section || quarantinedIds.has(section.sectionId)) continue;
    if (!approvedBySection.has(section.sectionId)) approvedBySection.set(section.sectionId, []);
    approvedBySection.get(section.sectionId).push({ result, section });
  }

  for (const [, entries] of approvedBySection) {
    entries.sort((a, b) => {
      const pa = BASIS_PRIORITY[a.result.policyBasis] ?? 9;
      const pb = BASIS_PRIORITY[b.result.policyBasis] ?? 9;
      if (pa !== pb) return pa - pb;
      if (a.result.derivedCritical !== b.result.derivedCritical) {
        return a.result.derivedCritical ? -1 : 1;
      }
      return a.result.patch.match.absoluteStart - b.result.patch.match.absoluteStart;
    });

    entries.forEach(({ result, section }, index) => {
      const action = result.patch.issue.action;

      if (index >= MAX_PATCHES_PER_SECTION) {
        skippedByCap.push({ auditId: result.patch.match.absoluteStart, sectionId: section.sectionId });
        return;
      }

      if (action === OP_TYPE.INSERT_WARNING || action === 'add_warning') {
        warnings.push({ result, section, facts: factsFor(result, bundle) });
        return;
      }

      const { absoluteStart, absoluteEnd } = result.patch.match;

      if (action === OP_TYPE.DELETE) {
        const plan = planDeletion(sectionsSource(sections), absoluteStart, absoluteEnd);
        if (!plan) {
          rejected.push({ sectionId: section.sectionId, reason: 'unsafe_delete' });
          return;
        }
        operations.push({
          type: OP_TYPE.DELETE,
          startOffset: plan.cutStart,
          endOffset: plan.cutEnd,
          replacementText: '',
          sectionId: section.sectionId,
          auditId: `delete-${plan.cutStart}`,
          tieRank: 2,
        });
        return;
      }

      operations.push({
        type: OP_TYPE.REPLACE,
        startOffset: absoluteStart,
        endOffset: absoluteEnd,
        replacementText: String(result.patch.issue.replacementText || ''),
        sectionId: section.sectionId,
        auditId: `replace-${absoluteStart}`,
        tieRank: 2,
      });
    });
  }

  // 4. Warnings insert at the owning section's original end offset. Grouped by
  //    policyBasis + evidence so duplicate findings render once.
  const warningGroups = new Map();
  for (const warning of warnings) {
    const key = [
      warning.result.policyBasis,
      [...(warning.result.acceptedFactIds || [])].sort().join('|'),
      warning.section.sectionId,
    ].join('::');
    if (!warningGroups.has(key)) {
      warningGroups.set(key, { ...warning, facts: [], count: 0 });
    }
    const group = warningGroups.get(key);
    group.facts.push(...warning.facts);
    group.count += 1;
  }

  const finalBlockGroups = [];
  for (const [key, group] of warningGroups) {
    const facts = [...new Map(group.facts.map((f) => [f.id, f])).values()];
    const parkNames = parkNamesFor(facts);
    const unknownScope = group.result.scopeSource === 'unknown' || !group.result.scopeSource;

    if (unknownScope) {
      finalBlockGroups.push({ facts, parkNames, key });
      continue;
    }

    operations.push({
      type: OP_TYPE.INSERT_WARNING,
      startOffset: group.section.endOffset,
      endOffset: group.section.endOffset,
      replacementText: renderSectionWarning({ facts, parkNames }),
      warningType: 'section',
      policyBasis: group.result.policyBasis,
      evidenceFactIds: facts.map((f) => f.id),
      sectionId: group.section.sectionId,
      auditId: `warn-${key}`,
      tieRank: 1,
    });
  }

  if (finalBlockGroups.length > 0) {
    const contentEnd = sections.length ? sections[sections.length - 1].endOffset : 0;
    operations.push({
      type: OP_TYPE.INSERT_WARNING,
      startOffset: contentEnd,
      endOffset: contentEnd,
      replacementText: renderFinalVerificationBlock(finalBlockGroups),
      sectionId: null,
      auditId: 'warn-final-block',
      warningType: 'global',
      evidenceFactIds: finalBlockGroups.flatMap((g) => g.facts.map((f) => f.id)),
      tieRank: 0,
    });
  }

  // 5. Reject overlaps. Zero-width inserts never conflict with a span ending at
  //    the same boundary; only genuine interior overlap is rejected.
  const accepted = [];
  const spans = [...operations].sort(
    (a, b) => a.startOffset - b.startOffset || a.tieRank - b.tieRank
  );

  for (const op of spans) {
    const conflict = accepted.find((other) => {
      if (op.startOffset === op.endOffset) {
        return op.startOffset > other.startOffset && op.startOffset < other.endOffset;
      }
      if (other.startOffset === other.endOffset) {
        return other.startOffset > op.startOffset && other.startOffset < op.endOffset;
      }
      return op.startOffset < other.endOffset && other.startOffset < op.endOffset;
    });

    if (conflict) {
      rejected.push({ auditId: op.auditId, reason: 'overlapping_operation' });
      continue;
    }
    accepted.push(op);
  }

  return { operations: accepted, skippedByCap, warnings, quarantined, rejected };
}

/** The original content the sections were built from. */
function sectionsSource(sections) {
  return sections.map((s) => s.text).join('');
}

/**
 * Apply an accepted plan highest-offset-first. Ties at the same offset resolve by
 * tieRank descending, then auditId, so ordering is stable and testable.
 */
function applyMutationPlan(originalContent, operations) {
  const ordered = [...operations].sort(
    (a, b) =>
      b.startOffset - a.startOffset ||
      b.tieRank - a.tieRank ||
      String(a.auditId).localeCompare(String(b.auditId))
  );

  let content = originalContent;
  for (const op of ordered) {
    content = content.slice(0, op.startOffset) + op.replacementText + content.slice(op.endOffset);
  }
  return content;
}

function expectedLengthFor(originalContent, operations) {
  return operations.reduce(
    (total, op) => total + op.replacementText.length - (op.endOffset - op.startOffset),
    originalContent.length
  );
}

// ---------------------------------------------------------------------------
// Final-response guards
// ---------------------------------------------------------------------------

function markdownDamageScore(text) {
  const count = (re) => (text.match(re) || []).length;
  return {
    brackets: count(/\[/g) - count(/\]/g),
    parens: count(/\(/g) - count(/\)/g),
    bold: count(/\*\*/g) % 2,
    backticks: count(/`/g) % 2,
  };
}

/**
 * Audit a mutated response. Pre-existing damage is tolerated; only newly
 * introduced structural problems fail.
 */
function auditFinalResponse({ originalContent, mutatedContent, expectedLength }) {
  const reasons = [];

  if (!mutatedContent || !mutatedContent.trim()) reasons.push('empty_output');

  if (findPlaceholderSpans(mutatedContent).length > findPlaceholderSpans(originalContent).length) {
    reasons.push('placeholder_artifact_introduced');
  }
  if (/\[\/?ITINERARY_JSON\]/i.test(mutatedContent) && !/\[\/?ITINERARY_JSON\]/i.test(originalContent)) {
    reasons.push('itinerary_marker_introduced');
  }

  if (mutatedContent.length !== expectedLength) {
    reasons.push(
      `length_mismatch_expected_${expectedLength}_actual_${mutatedContent.length}`
    );
  }

  const sections = splitIntoSections(mutatedContent);
  const partition = validateSectionPartition(mutatedContent, sections);
  if (!partition.valid) reasons.push('invalid_section_partition');

  const before = markdownDamageScore(originalContent);
  const after = markdownDamageScore(mutatedContent);
  for (const key of Object.keys(before)) {
    if (Math.abs(after[key]) > Math.abs(before[key])) {
      reasons.push(`markdown_damage_${key}`);
    }
  }

  return { status: reasons.length === 0 ? 'passed' : 'failed', reasons };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @returns {Object} fail-safe result — see Stage 5 output schema.
 */
function runReviewerFailSafe({
  originalContent,
  mode,
  sections = null,
  policyResults = [],
  reviewerStatus = 'ok',
  canonicalFactBundle = { facts: [], byId: {} },
}) {
  const reviewerMode = resolveReviewerMode(mode);
  const resolvedSections = sections || splitIntoSections(originalContent);
  const placeholderSpans = findPlaceholderSpans(originalContent);

  const baseMetadata = {
    reviewerMode,
    reviewStrategy: REVIEW_STRATEGY,
    policyApproved: 0,
    wouldApply: 0,
    wouldWarn: 0,
    wouldQuarantine: 0,
    skippedByCap: 0,
    rejectedByConflict: 0,
    wouldStripPlaceholder: placeholderSpans.length > 0,
    patchesApplied: 0,
    patchesSkippedByCap: 0,
    warningsInserted: 0,
    sectionsQuarantined: 0,
    unresolvedCritical: 0,
    contentUnverified: false,
    mutationDiscarded: false,
    expectedLength: originalContent.length,
    actualLength: originalContent.length,
    lengthDelta: 0,
    placeholderDetected: placeholderSpans.length > 0,
    placeholderStripped: false,
    guardStatus: 'not_run',
    guardReasons: [],
    placeholderAudit: placeholderSpans.map(describePlaceholderRemoval),
  };

  const unresolved = policyResults.filter((r) => r.status !== POLICY_STATUS.APPROVED);
  const unresolvedCritical = unresolved.filter((r) => r.derivedCritical).length;
  // "Policy allowed it" is deliberately separate from "the planner would apply it".
  const policyApproved = policyResults.filter((r) => r.status === POLICY_STATUS.APPROVED).length;

  if (reviewerMode === REVIEWER_MODE.OFF) {
    return {
      content: originalContent,
      mode: reviewerMode,
      appliedPatches: [],
      unappliedIssues: [],
      unresolvedCritical: 0,
      insertedWarnings: [],
      sectionReplacements: [],
      expectedLength: originalContent.length,
      actualLength: originalContent.length,
      guardStatus: 'not_run',
      metadata: { ...baseMetadata, reviewStatus: 'skipped' },
    };
  }

  const plan = buildMutationPlan({
    sections: resolvedSections,
    policyResults,
    bundle: canonicalFactBundle,
    reviewerStatus,
  });

  const patchOps = plan.operations.filter(
    (op) => op.type === OP_TYPE.REPLACE || op.type === OP_TYPE.DELETE
  );
  const warningOps = plan.operations.filter((op) => op.type === OP_TYPE.INSERT_WARNING);
  const quarantineOps = plan.operations.filter((op) => op.type === OP_TYPE.REPLACE_SECTION);

  if (reviewerMode === REVIEWER_MODE.SHADOW) {
    return {
      content: originalContent,
      mode: reviewerMode,
      appliedPatches: [],
      unappliedIssues: unresolved,
      unresolvedCritical,
      insertedWarnings: [],
      sectionReplacements: [],
      expectedLength: originalContent.length,
      actualLength: originalContent.length,
      guardStatus: 'not_run',
      metadata: {
        ...baseMetadata,
        policyApproved,
        wouldApply: patchOps.length,
        wouldWarn: warningOps.length,
        wouldQuarantine: quarantineOps.length,
        skippedByCap: plan.skippedByCap.length,
        rejectedByConflict: plan.rejected.length,
        unresolvedCritical,
        contentUnverified: reviewerStatus === 'error',
      },
    };
  }

  // --- enforce -------------------------------------------------------------
  if (reviewerStatus === 'error') {
    const needsNotice = LIVE_SENSITIVE_RE.test(originalContent);
    const content = needsNotice
      ? originalContent +
        `\n\n---\n**${GLOBAL_WARNING_HEADING}.** Live conditions could not be checked for this answer — confirm closures, permits, and road status on the official park page.\n`
      : originalContent;

    return {
      content,
      mode: reviewerMode,
      appliedPatches: [],
      unappliedIssues: unresolved,
      unresolvedCritical,
      insertedWarnings: needsNotice ? ['reviewer_error_notice'] : [],
      sectionReplacements: [],
      expectedLength: content.length,
      actualLength: content.length,
      guardStatus: 'not_run',
      metadata: {
        ...baseMetadata,
        contentUnverified: true,
        warningsInserted: needsNotice ? 1 : 0,
        unresolvedCritical,
        expectedLength: content.length,
        actualLength: content.length,
        lengthDelta: content.length - originalContent.length,
      },
    };
  }

  const expectedLength = expectedLengthFor(originalContent, plan.operations);
  const mutated = applyMutationPlan(originalContent, plan.operations);
  const guard =
    plan.operations.length === 0
      ? { status: 'passed', reasons: [] }
      : auditFinalResponse({ originalContent, mutatedContent: mutated, expectedLength });

  if (guard.status === 'failed') {
    // Discard everything — never return a partially mutated response.
    const confirmed = policyResults
      .filter(
        (r) =>
          r.status === POLICY_STATUS.APPROVED &&
          r.policyBasis === POLICY_BASIS.POSITIVE_CONTRADICTION
      )
      .flatMap((r) => factsFor(r, canonicalFactBundle));

    const facts = [...new Map(confirmed.map((f) => [f.id, f])).values()];
    const content =
      facts.length > 0 ? originalContent + renderGuardFallbackBlock(facts) : originalContent;

    return {
      content,
      mode: reviewerMode,
      appliedPatches: [],
      unappliedIssues: unresolved,
      unresolvedCritical,
      insertedWarnings: facts.length > 0 ? ['guard_fallback_block'] : [],
      sectionReplacements: [],
      expectedLength,
      actualLength: content.length,
      guardStatus: 'failed',
      metadata: {
        ...baseMetadata,
        guardStatus: 'failed',
        guardReasons: guard.reasons,
        mutationDiscarded: true,
        contentUnverified: true,
        unresolvedCritical,
        expectedLength,
        actualLength: content.length,
        lengthDelta: content.length - originalContent.length,
      },
    };
  }

  return {
    content: mutated,
    mode: reviewerMode,
    appliedPatches: patchOps,
    unappliedIssues: unresolved,
    unresolvedCritical,
    insertedWarnings: warningOps,
    sectionReplacements: quarantineOps,
    expectedLength,
    actualLength: mutated.length,
    guardStatus: guard.status,
    metadata: {
      ...baseMetadata,
      policyApproved,
      patchesApplied: patchOps.length,
      patchesSkippedByCap: plan.skippedByCap.length,
      skippedByCap: plan.skippedByCap.length,
      rejectedByConflict: plan.rejected.length,
      warningsInserted: warningOps.length,
      sectionsQuarantined: quarantineOps.length,
      unresolvedCritical,
      expectedLength,
      actualLength: mutated.length,
      lengthDelta: mutated.length - originalContent.length,
      guardStatus: guard.status,
      guardReasons: guard.reasons,
    },
  };
}

module.exports = {
  REVIEWER_MODE,
  REVIEW_STRATEGY,
  OP_TYPE,
  SECTION_WARNING_HEADING,
  GLOBAL_WARNING_HEADING,
  MAX_PATCHES_PER_SECTION,
  resolveReviewerMode,
  buildMutationPlan,
  applyMutationPlan,
  expectedLengthFor,
  auditFinalResponse,
  selectQuarantinedSections,
  renderQuarantinedSection,
  renderSectionWarning,
  renderFinalVerificationBlock,
  runReviewerFailSafe,
};
