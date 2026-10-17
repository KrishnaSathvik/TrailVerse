'use strict';

const {
  PROMPT_TOKENIZER_ID,
  countPromptTokens,
  truncatePromptTokens,
} = require('../utils/promptTokenAccounting');
const { CORE_POLICY_ID, TRAILIE_CORE_POLICY_V2 } = require('./trailieCorePolicyV2');
const { getTaskContractV2 } = require('./trailieTaskContractsV2');
const { renderEvidenceBundleForPrompt } = require('./evidenceBundlePromptRenderer');
const { packRefinementEvidence } = require('./refinementEvidencePacking');
const {
  buildBackupCandidateContext,
  formatBackupCandidatePromptBlock,
} = require('../utils/backupCandidateContext');
const { splitPromptConstraints } = require('../utils/trailieOperationalConstraints');
const {
  pinnedEvidenceIdsFor,
  requiredNamedPlacesPromptBlock,
} = require('../utils/namedExperienceRequirements');

const DEFAULT_BUDGETS = Object.freeze({
  coreTokens: 2200,
  contractTokens: 800,
  evidenceTokens: 1200,
  tripStateTokens: 800,
  historyTokens: 900,
  userTokens: 800,
  totalTokens: 6400,
});

function stableValue(value, seen = new WeakSet()) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => stableValue(item, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (typeof value[key] !== 'function') output[key] = stableValue(value[key], seen);
  }
  seen.delete(value);
  return output;
}

function makeSection(header, content, maxTokens) {
  const headerTokens = countPromptTokens(header);
  const limit = Math.max(headerTokens, Math.floor(Number(maxTokens) || 0));
  const payload = truncatePromptTokens(String(content || ''), limit - headerTokens);
  const text = payload.text ? `${header}\n${payload.text}` : header;
  return { text, tokens: countPromptTokens(text), headerTokens, truncated: payload.truncated };
}

function renderRecentHistory(history, maxPayloadTokens) {
  const selected = [];
  let tokens = 0;
  const normalized = Array.isArray(history) ? history : [];
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const item = normalized[index] || {};
    const role = ['user', 'assistant', 'tool'].includes(item.role) ? item.role : 'unknown';
    const block = `${role.toUpperCase()}: ${String(item.content || '').trim()}`;
    const blockTokens = countPromptTokens(block);
    if (tokens + blockTokens > maxPayloadTokens) {
      if (selected.length === 0 && maxPayloadTokens > 0) {
        selected.unshift(truncatePromptTokens(block, maxPayloadTokens).text);
      }
      break;
    }
    selected.unshift(block);
    tokens += blockTokens;
  }
  return selected.join('\n');
}

function normalizeBudgets(input = {}) {
  const output = {};
  for (const [key, fallback] of Object.entries(DEFAULT_BUDGETS)) {
    const value = Number(input[key]);
    output[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }
  return output;
}

function budgetError() {
  const error = new Error('Prompt-v2 budget cannot contain immutable policy sections');
  error.code = 'prompt_v2_budget_infeasible';
  return error;
}

function buildTrailiePromptV2({
  mode,
  evidenceBundle,
  requirements = [],
  tripState = null,
  constraints = null,
  history = [],
  userRequest = '',
  // R1 — machine-composed operational consequences (prohibitions, obligations,
  // exposure legal pool) from the frozen bundle. Composed upstream, once per
  // turn; null on ordinary turns so the prompt is byte-identical without it.
  operationalDirectives = null,
  // Phase 9C.1D.5B — explicit named-experience requirements resolved to evidence
  // identity upstream. Empty/null on ordinary turns: prompt byte-identical.
  namedExperienceRequirements = null,
  // Phase 12H2-C — present only when the traveler asked Trailie to choose.
  comparisonSelection = null,
  // Phase 12H2-D — present only when a prose fallback/alternative was requested.
  actionableContingency = null,
  evidenceAnnotations = null,
  budgets: budgetOverrides = {},
  refinementRequest = null,
} = {}) {
  const requiredNamedPlaces = requiredNamedPlacesPromptBlock(namedExperienceRequirements);
  const pinnedEvidenceIds = pinnedEvidenceIdsFor(namedExperienceRequirements);
  const { planningJob, primaryEvidenceBudget } = require('./primaryEvidencePacking');
  const job = planningJob({ mode, constraints, userRequest });
  const budgets = normalizeBudgets({ evidenceTokens: primaryEvidenceBudget(job,
    new Set((requirements || []).map(r => r.entity?.entityId).filter(Boolean)).size), ...budgetOverrides });
  const contract = getTaskContractV2(mode);
  const coreHeader = '--- CORE POLICY ---';
  const contractHeader = `--- TASK CONTRACT: ${String(mode).toLowerCase()} ---`;
  const core = makeSection(coreHeader, TRAILIE_CORE_POLICY_V2, budgets.coreTokens);
  const contractSection = makeSection(contractHeader, contract.text, budgets.contractTokens);
  if (core.truncated || contractSection.truncated) throw budgetError();

  const headers = {
    evidence: '--- PUBLIC EVIDENCE ---',
    tripState: '--- PRIVATE TRIP STATE ---',
    history: '--- RECENT HISTORY ---',
    user: '--- USER REQUEST ---',
  };
  const minimum = core.tokens + contractSection.tokens
    + Object.values(headers).reduce((sum, header) => sum + countPromptTokens(header), 0);
  if (minimum > budgets.totalTokens) throw budgetError();

  const sectionCaps = {
    evidence: Math.max(countPromptTokens(headers.evidence), budgets.evidenceTokens),
    tripState: Math.max(countPromptTokens(headers.tripState), budgets.tripStateTokens),
    history: Math.max(countPromptTokens(headers.history), budgets.historyTokens),
    user: Math.max(countPromptTokens(headers.user), budgets.userTokens),
  };

  const buildVariableSections = () => {
    const evidenceHeaderTokens = countPromptTokens(headers.evidence);
    const renderedEvidence = refinementRequest
      ? packRefinementEvidence({
        bundle: evidenceBundle,
        plan: refinementRequest.plan,
        constraints: refinementRequest.constraints || constraints,
        userRequest: refinementRequest.userRequest || userRequest,
        limit: Math.max(0, sectionCaps.evidence - evidenceHeaderTokens),
      })
      : renderEvidenceBundleForPrompt({
        bundle: evidenceBundle,
        mode,
        requirements,
        userRequest,
        constraints,
        excludedEvidenceIds: operationalDirectives?.exposure?.ineligibleEvidenceIds || [],
        maxTokens: Math.max(0, sectionCaps.evidence - evidenceHeaderTokens),
        ...(pinnedEvidenceIds.length > 0 ? { pinnedEvidenceIds } : {}),
      });
    const backupCandidateContext = buildBackupCandidateContext({
      bundle: evidenceBundle,
      userPrompt: userRequest,
      maxCandidates: 8,
    });
    const backupBlock = formatBackupCandidatePromptBlock(backupCandidateContext);
    const { userConstraints, accessRules } = splitPromptConstraints(constraints);
    const hasOperationalRules = Boolean(operationalDirectives
      && ((operationalDirectives.hardProhibitions || []).length > 0
        || (operationalDirectives.obligations || []).length > 0
        || operationalDirectives.exposure));
    const privateState = stableValue({
      // State context, not a prompt-policy change. Keep the semantic temporal
      // decision ahead of the ordinary bounded constraint payload.
      ...(constraints?.temporalResolution ? { confirmedAndPendingDates: {
        status: constraints.temporalResolution.status,
        action: constraints.temporalResolution.action,
        confirmedDates: constraints.temporalResolution.dates,
        pendingCandidate: constraints.temporalResolution.pendingTemporalResolution,
        tripWindowDays: constraints.temporalResolution.tripWindowDays,
        planDayCount: tripState?.existingCanonicalPlan?.days?.length || constraints.dates?.numDays || null,
        planDayCalendarBindings: constraints.planningState?.planDayCalendarBindings || [],
      } } : {}),
      tripState,
      constraints: userConstraints,
      ...(accessRules ? { accessRules } : {}),
      ...(hasOperationalRules
        ? {
          operationalRules: {
            instructions: 'Machine-verified operational rules for THIS traveler. Hard prohibitions constrain what the plan may be built from; obligations must be stated with the stop they attach to.',
            ...((operationalDirectives.hardProhibitions || []).length > 0
              ? { hardProhibitions: operationalDirectives.hardProhibitions.map((r) => r.text) }
              : {}),
            ...((operationalDirectives.obligations || []).length > 0
              ? { obligations: operationalDirectives.obligations.map((r) => r.text) }
              : {}),
            ...(operationalDirectives.exposure ? { exposure: operationalDirectives.exposure.text } : {}),
          },
        }
        : {}),
      ...(requiredNamedPlaces ? { requiredNamedPlaces } : {}),
      ...(comparisonSelection?.required ? { comparisonSelection } : {}),
      ...(actionableContingency?.required ? { actionableContingency } : {}),
      ...(Array.isArray(evidenceAnnotations) && evidenceAnnotations.length > 0
        ? {
          unverifiedOfficialFields: evidenceAnnotations,
          unverifiedOfficialFieldsNote: 'These official details could not be checked. Answer from what is normally true and from the trip already stated. Name the detail you could not verify. Do not refuse the whole answer.',
        }
        : {}),
      ...(backupCandidateContext.required
        ? {
          backupPlan: {
            required: true,
            canonicalField: backupCandidateContext.canonicalField,
            blockedDependencies: backupCandidateContext.blockedDependencies,
            evidenceBackedCandidates: backupCandidateContext.candidates.map((c) => ({
              name: c.name,
              evidenceId: c.evidenceId,
            })),
            instructions: backupBlock,
          },
        }
        : {}),
    });
    const historyHeaderTokens = countPromptTokens(headers.history);
    return {
      evidence: makeSection(headers.evidence, renderedEvidence.text, sectionCaps.evidence),
      tripState: makeSection(headers.tripState, JSON.stringify(privateState), sectionCaps.tripState),
      history: makeSection(
        headers.history,
        renderRecentHistory(history, Math.max(0, sectionCaps.history - historyHeaderTokens)),
        sectionCaps.history
      ),
      user: makeSection(headers.user, userRequest, sectionCaps.user),
      renderedEvidence,
    };
  };

  let variable = buildVariableSections();
  const total = () => core.tokens + contractSection.tokens
    + variable.evidence.tokens + variable.tripState.tokens + variable.history.tokens + variable.user.tokens;
  for (const name of ['history', 'tripState', 'evidence', 'user']) {
    const overflow = total() - budgets.totalTokens;
    if (overflow <= 0) break;
    const headerFloor = countPromptTokens(headers[name]);
    sectionCaps[name] = Math.max(headerFloor, sectionCaps[name] - overflow);
    variable = buildVariableSections();
  }
  if (total() > budgets.totalTokens) throw budgetError();
  // No post-pack clipping may invalidate the checked decision set.
  if (variable.renderedEvidence.primaryPacking && variable.evidence.truncated) throw budgetError();

  const publicPrefix = [core.text, contractSection.text, variable.evidence.text].join('\n\n');
  const privateSuffix = [variable.tripState.text, variable.history.text, variable.user.text].join('\n\n');
  const prompt = `${publicPrefix}\n\n${privateSuffix}`;
  const accounting = Object.freeze({
    tokenizerId: PROMPT_TOKENIZER_ID,
    coreSourceTokens: countPromptTokens(TRAILIE_CORE_POLICY_V2),
    coreSectionTokens: core.tokens,
    coreWrapperTokens: core.tokens - countPromptTokens(TRAILIE_CORE_POLICY_V2),
    coreTokens: core.tokens,
    contractTokens: contractSection.tokens,
    evidenceTokens: variable.evidence.tokens,
    tripStateTokens: variable.tripState.tokens,
    historyTokens: variable.history.tokens,
    userTokens: variable.user.tokens,
    totalTokens: total(),
  });

  return Object.freeze({
    policyId: CORE_POLICY_ID,
    contractId: contract.id,
    prompt,
    publicPrefix,
    privateSuffix,
    accounting,
    budgets: Object.freeze({ ...budgets }),
    evidence: variable.renderedEvidence,
    cachePolicy: Object.freeze({ publicPrefix: 'public_only', combinedPrompt: 'never_cache' }),
  });
}

module.exports = { DEFAULT_BUDGETS, buildTrailiePromptV2 };
