'use strict';

const fs = require('fs');
const path = require('path');
const { buildTrailiePromptV2 } = require('../prompts/trailiePromptV2');
const { CREATE_ITINERARY_TOOL, isValidToolItinerary } = require('../utils/itineraryToolSchema');
const { countPromptTokens } = require('../utils/promptTokenAccounting');
const { normalizeToolCalls, STRUCTURED_STATUS } = require('../services/structuredItineraryGenerator');
const { createResponsesRequest, executeResponses } = require('../services/responsesAdapter');
const { createOpenAIResponsesAdapter } = require('../services/providers/openaiResponsesAdapter');
const { priceProviderCall } = require('../services/trailieTurnLedger');

const BENCHMARK_VERSION = 'trailie-gpt56-benchmark-v1';
const ALLOWED_MODELS = Object.freeze(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']);
const DEFAULT_MAX_CALLS = 24;
const DEFAULT_MAX_COST_USD = 2;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const PUBLIC_FACTS = Object.freeze([
  ['destination_identity', 'Yosemite National Park is in California.'],
  ['overview', 'Yosemite is known for granite cliffs, waterfalls, giant sequoias, and high-country terrain.'],
  ['activities', 'Lower-impact options include Yosemite Valley viewpoints and short paved walks.'],
  ['climate_normals', 'October conditions vary by elevation; early snow is possible in the high country.'],
  ['roads', 'Fixture status: Tioga Road is closed. Verify current status on the official NPS conditions page.'],
  ['alerts_closures', 'Fixture alert: Tioga Road is closed.'],
  ['driving_time', 'Driving between Yosemite Valley and Sequoia is a substantial inter-park transfer.'],
  ['permits_reservations', 'Some activities and entry periods may require advance reservations; this fixture contains no live availability.'],
]);

function frozenEvidenceBundle(id, topics) {
  const selected = PUBLIC_FACTS.filter(([topic]) => topics.includes(topic));
  return deepFreeze({
    bundleId: `benchmark:${id}`,
    evidence: selected.map(([topic, text], index) => ({
      evidenceId: `${id}:e${index + 1}`,
      topic,
      claim: { text },
      source: { provider: 'benchmark_fixture', sourceClass: 'official', title: 'Frozen benchmark fixture', url: 'https://www.nps.gov/' },
      quality: { authorityClass: 'official' },
      observation: { observedAt: '2026-08-09T12:00:00.000Z' },
      retention: { storeClaimText: true },
    })),
    resolutions: selected.map(([topic], index) => ({
      requirementId: `${id}:r${index + 1}`, status: 'satisfied_fresh', evidenceIds: [`${id}:e${index + 1}`],
    })),
  });
}

function fixture(definition) {
  const topics = definition.topics || ['destination_identity', 'overview', 'activities'];
  return deepFreeze({
    verticalCount: 1, tripDays: 0, destinationCount: 1,
    constraints: null, history: [], tripState: null,
    maxOutputTokens: definition.tool ? 1400 : 700,
    candidates: [],
    forbiddenAssertions: [
      'Tioga Road is open', 'confirmed hotel availability', 'confirmed flight availability',
      'the entrance fee is $',
    ],
    ...definition,
    topics,
    evidenceBundle: frozenEvidenceBundle(definition.fixtureId, topics),
  });
}

const BENCHMARK_FIXTURES = deepFreeze([
  fixture({ fixtureId: 'general-season', intent: 'general_qa', depth: 'quick', mode: 'buddy', userRequest: 'Is Yosemite worth visiting in October?', candidates: [['gpt-5.6-luna', 'low'], ['gpt-5.6-terra', 'low']], topics: ['destination_identity', 'overview', 'climate_normals'] }),
  fixture({ fixtureId: 'destination-first-visit', intent: 'destination_discovery', depth: 'standard', mode: 'buddy', userRequest: 'What are the best national parks for a first-time visitor?', candidates: [['gpt-5.6-luna', 'low'], ['gpt-5.6-terra', 'low']] }),
  fixture({ fixtureId: 'place-yosemite', intent: 'place_discovery', depth: 'standard', mode: 'buddy', userRequest: 'Things to do in Yosemite', candidates: [['gpt-5.6-luna', 'low'], ['gpt-5.6-terra', 'low']], topics: ['destination_identity', 'activities'] }),
  fixture({ fixtureId: 'compare-yosemite-sequoia', intent: 'compare', depth: 'standard', mode: 'compare', userRequest: 'Compare Yosemite and Sequoia for hiking.', destinationCount: 2, candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-terra', 'medium']] }),
  fixture({ fixtureId: 'simple-yosemite-three', intent: 'simple_itinerary', depth: 'planning', mode: 'architect', userRequest: 'Plan Yosemite for 3 days.', tripDays: 3, tool: true, candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-terra', 'medium']], topics: ['destination_identity', 'activities', 'roads', 'alerts_closures'] }),
  fixture({ fixtureId: 'simple-family-easy', intent: 'simple_itinerary', depth: 'planning', mode: 'architect', userRequest: 'Plan two easy days in Yosemite with young children.', tripDays: 2, tool: true, constraints: { hasChildren: true, fitnessLevel: 'beginner' }, candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-terra', 'medium']] }),
  fixture({ fixtureId: 'full-seven-two-parks', intent: 'full_trip', depth: 'deep', mode: 'architect', userRequest: 'Plan a 7-day trip through Yosemite and Sequoia.', tripDays: 7, destinationCount: 2, verticalCount: 3, tool: true, candidates: [['gpt-5.6-terra', 'medium'], ['gpt-5.6-sol', 'medium']], topics: ['destination_identity', 'activities', 'roads', 'driving_time', 'permits_reservations'] }),
  fixture({ fixtureId: 'complex-four-parks', intent: 'full_trip', depth: 'deep', mode: 'architect', userRequest: 'Plan 12 days through four parks with two kids and no drives over four hours.', tripDays: 12, destinationCount: 4, verticalCount: 4, tool: true, constraints: { hasChildren: true, maxDriveHours: 4 }, candidates: [['gpt-5.6-terra', 'medium'], ['gpt-5.6-sol', 'medium']] }),
  fixture({ fixtureId: 'refine-day-two', intent: 'trip_refinement', depth: 'planning', mode: 'architect', userRequest: 'Make day 2 easier without changing the destinations.', tripDays: 2, tool: true, tripState: { hasActiveTrip: true, days: [{ dayNumber: 1, destination: 'Yosemite' }, { dayNumber: 2, destination: 'Yosemite', difficulty: 'strenuous' }] }, candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-terra', 'medium']] }),
  fixture({ fixtureId: 'live-tioga', intent: 'live_in_trip_assistance', depth: 'quick', mode: 'live', userRequest: 'Is Tioga Road open right now?', candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-sol', 'medium']], topics: ['destination_identity', 'roads', 'alerts_closures'], requiredText: ['closed', 'official'] }),
  fixture({ fixtureId: 'repair-invalid-days', intent: 'deterministic_repair', depth: 'deep', mode: 'repair', userRequest: 'Repair the plan so it contains exactly three days and preserves Yosemite as the destination.', tripDays: 3, tool: true, tripState: { validationIssues: ['day_count_mismatch'], days: [{ dayNumber: 1, destination: 'Yosemite' }] }, candidates: [['gpt-5.6-terra', 'medium'], ['gpt-5.6-sol', 'medium']] }),
  fixture({ fixtureId: 'operational-no-inventory', intent: 'general_qa', depth: 'standard', mode: 'live', userRequest: 'Can you confirm a Yosemite hotel room and Tioga Road access for tonight?', candidates: [['gpt-5.6-terra', 'low'], ['gpt-5.6-sol', 'medium']], topics: ['destination_identity', 'roads', 'alerts_closures'], requiredText: ['closed'] }),
]);

function complexFixture(base, overrides = {}) {
  return fixture({
    ...base,
    ...overrides,
    depth: 'deep',
    mode: 'architect',
    tool: true,
    maxOutputTokens: 3500,
    candidates: [['gpt-5.6-terra', 'medium'], ['gpt-5.6-sol', 'medium']],
  });
}

const COMPLEX_BENCHMARK_FIXTURES = deepFreeze([
  complexFixture(BENCHMARK_FIXTURES.find((item) => item.fixtureId === 'full-seven-two-parks')),
  complexFixture(BENCHMARK_FIXTURES.find((item) => item.fixtureId === 'complex-four-parks')),
  complexFixture({
    fixtureId: 'complex-alaska-ten', intent: 'full_trip',
    userRequest: 'Plan 10 days across Denali, Kenai Fjords, and Wrangell–St. Elias using flights, ferries, and driving, with no travel day longer than six hours.',
    tripDays: 10, destinationCount: 3, verticalCount: 5,
    constraints: { maxTravelHoursPerDay: 6, transportModes: ['flight', 'ferry', 'driving'] },
    topics: ['destination_identity', 'activities', 'roads', 'driving_time', 'permits_reservations'],
  }),
  complexFixture({
    fixtureId: 'complex-olympic-rainier-six', intent: 'full_trip',
    userRequest: 'Build a 6-day Olympic and Mount Rainier itinerary for two children, accessible walks, and no drive over four hours.',
    tripDays: 6, destinationCount: 2, verticalCount: 4,
    constraints: { hasChildren: true, accessibility: 'accessible_walks', maxDriveHours: 4 },
    topics: ['destination_identity', 'activities', 'roads', 'driving_time', 'permits_reservations'],
  }),
]);

function promptForFixture(item) {
  const requirements = item.topics.map((topic, index) => ({ requirementId: `${item.fixtureId}:r${index + 1}`, topic }));
  return buildTrailiePromptV2({
    mode: item.mode, evidenceBundle: item.evidenceBundle, requirements,
    tripState: item.tripState, constraints: item.constraints,
    history: item.history, userRequest: item.userRequest,
  });
}

function plannedAttempts(fixtures = BENCHMARK_FIXTURES) {
  return fixtures.flatMap((item) => item.candidates.map(([model, reasoningEffort]) => ({ item, model, reasoningEffort })));
}

function benchmarkPreflight({ enabled, apiKey, maxCalls = DEFAULT_MAX_CALLS, maxCostUsd = DEFAULT_MAX_COST_USD, fixtures = BENCHMARK_FIXTURES } = {}) {
  const attempts = plannedAttempts(fixtures);
  if (enabled !== true) return { allowed: false, reason: 'benchmark_not_enabled', attempts };
  if (typeof apiKey !== 'string' || !apiKey.trim()) return { allowed: false, reason: 'openai_api_key_missing', attempts };
  if (!Number.isInteger(maxCalls) || maxCalls <= 0 || attempts.length > maxCalls) return { allowed: false, reason: 'benchmark_call_cap_exceeded', attempts };
  let estimatedMaxCostUsd = 0;
  for (const attempt of attempts) {
    if (!ALLOWED_MODELS.includes(attempt.model)) return { allowed: false, reason: 'benchmark_model_not_allowed', attempts };
    const promptTokens = countPromptTokens(promptForFixture(attempt.item).prompt);
    const priced = priceProviderCall({
      provider: 'openai', model: attempt.model,
      usage: { inputTokens: promptTokens, outputTokens: attempt.item.maxOutputTokens, cacheCreationInputTokens: promptTokens },
      at: new Date('2026-08-09T12:00:00.000Z'),
    });
    if (priced.costStatus !== 'priced') return { allowed: false, reason: 'benchmark_cost_unknown', attempts };
    estimatedMaxCostUsd += priced.costUsd;
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || estimatedMaxCostUsd > maxCostUsd) {
    return { allowed: false, reason: 'benchmark_cost_cap_exceeded', attempts, estimatedMaxCostUsd };
  }
  return { allowed: true, reason: null, attempts, estimatedMaxCostUsd };
}

function scoreAttempt(item, result) {
  const text = result.outputText || '';
  const evidenceHardFailures = item.forbiddenAssertions.filter((claim) => text.toLowerCase().includes(claim.toLowerCase()));
  const requiredTextMissing = (item.requiredText || []).filter((term) => !text.toLowerCase().includes(term.toLowerCase()));
  let toolCallStatus = 'not_applicable';
  let structuredOutputStatus = 'not_applicable';
  let validationStatus = result.completionStatus === 'completed' ? 'pass' : 'fail';
  let constraintStatus = 'manual_review_required';
  if (item.tool) {
    const normalized = normalizeToolCalls({ toolCalls: result.toolCalls, stopReason: result.stopReason, provider: 'openai' });
    toolCallStatus = normalized.status;
    structuredOutputStatus = normalized.status === STRUCTURED_STATUS.COMPLETE ? 'complete' : 'failed';
    validationStatus = normalized.status === STRUCTURED_STATUS.COMPLETE && isValidToolItinerary(normalized.itineraryData) ? 'pass' : 'fail';
    constraintStatus = validationStatus === 'pass' && (!item.tripDays || normalized.itineraryData.days.length === item.tripDays) ? 'pass' : 'fail';
  }
  const evidenceAdherenceStatus = evidenceHardFailures.length || requiredTextMissing.length ? 'fail' : 'pass';
  return {
    structuredOutputStatus, toolCallStatus, validationStatus, constraintStatus,
    evidenceAdherenceStatus,
    operationalRuleStatus: item.mode === 'live' ? evidenceAdherenceStatus : 'not_applicable',
    factualityStatus: 'manual_review_required',
    completionStatus: result.completionStatus || 'unknown',
    hardFailures: [...evidenceHardFailures.map((value) => `forbidden_assertion:${value}`), ...requiredTextMissing.map((value) => `required_text_missing:${value}`)],
  };
}

function sanitizedAttemptRecord(item, model, reasoningEffort, result, score, priced, promptTokens) {
  return {
    fixtureId: item.fixtureId, intent: item.intent, depth: item.depth,
    verticalCount: item.verticalCount, tripDays: item.tripDays, destinationCount: item.destinationCount,
    model, reasoningEffort, promptTokens,
    cachedTokens: result.usage.cachedInputTokens,
    cacheWriteTokens: result.usage.cacheCreationInputTokens,
    outputTokens: result.usage.outputTokens, reasoningTokens: result.usage.reasoningTokens,
    latencyMs: result.latencyMs, costStatus: priced.costStatus, costUsd: priced.costUsd,
    ...score, retryNeeded: false, deterministicFallbackNeeded: score.validationStatus !== 'pass',
  };
}

async function runBenchmark({ client, fixtures = BENCHMARK_FIXTURES, maxCalls = DEFAULT_MAX_CALLS, maxCostUsd = DEFAULT_MAX_COST_USD, rawArtifactPath = null } = {}) {
  const attempts = plannedAttempts(fixtures);
  if (attempts.length > maxCalls) throw Object.assign(new Error('benchmark_call_cap_exceeded'), { code: 'benchmark_call_cap_exceeded' });
  const adapter = createOpenAIResponsesAdapter({ client });
  const records = [];
  const privateOutputs = [];
  let totalCostUsd = 0;
  for (const { item, model, reasoningEffort } of attempts) {
    const built = promptForFixture(item);
    const canonical = createResponsesRequest({
      provider: 'openai', model, instructions: '',
      input: [{ role: 'user', content: built.privateSuffix }],
      tools: item.tool ? [CREATE_ITINERARY_TOOL] : [],
      toolChoice: item.tool ? { name: 'create_itinerary' } : null,
      reasoning: { effort: reasoningEffort }, maxOutputTokens: item.maxOutputTokens,
      requestMetadata: { fixture_id: item.fixtureId, intent: item.intent },
      promptCaching: { mode: 'explicit', ttl: '30m', publicPrefix: built.publicPrefix },
    });
    const result = await executeResponses(canonical, { adapters: { openai: adapter } });
    const priced = priceProviderCall({ provider: 'openai', model, usage: result.usage, at: new Date() });
    if (priced.costStatus !== 'priced') throw Object.assign(new Error('benchmark_actual_cost_unknown'), { code: 'benchmark_actual_cost_unknown' });
    totalCostUsd += priced.costUsd;
    if (totalCostUsd > maxCostUsd) throw Object.assign(new Error('benchmark_actual_cost_cap_exceeded'), { code: 'benchmark_actual_cost_cap_exceeded' });
    const score = scoreAttempt(item, result);
    records.push(sanitizedAttemptRecord(item, model, reasoningEffort, result, score, priced, built.accounting.totalTokens));
    privateOutputs.push({ fixtureId: item.fixtureId, model, reasoningEffort, outputText: result.outputText, toolCalls: result.toolCalls });
  }
  if (rawArtifactPath) {
    fs.mkdirSync(path.dirname(rawArtifactPath), { recursive: true });
    fs.writeFileSync(rawArtifactPath, `${JSON.stringify({ version: BENCHMARK_VERSION, privateOutputs }, null, 2)}\n`, { mode: 0o600 });
  }
  return { version: BENCHMARK_VERSION, callCount: records.length, totalCostUsd, records };
}

function aggregateResults(report) {
  const groups = new Map();
  for (const row of report.records) {
    const key = `${row.model}|${row.intent}`;
    const group = groups.get(key) || { model: row.model, taskClass: row.intent, attempts: 0, passes: 0, hardFailures: 0, structuredAttempts: 0, structuredPasses: 0, latencyMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    group.attempts += 1;
    group.passes += row.validationStatus === 'pass' && row.evidenceAdherenceStatus === 'pass' ? 1 : 0;
    group.hardFailures += row.hardFailures.length;
    if (row.structuredOutputStatus !== 'not_applicable') { group.structuredAttempts += 1; group.structuredPasses += row.structuredOutputStatus === 'complete' ? 1 : 0; }
    group.latencyMs += row.latencyMs || 0; group.costUsd += row.costUsd || 0;
    group.inputTokens += row.promptTokens || 0; group.outputTokens += row.outputTokens || 0;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    passRate: group.attempts ? group.passes / group.attempts : null,
    structuredSuccessRate: group.structuredAttempts ? group.structuredPasses / group.structuredAttempts : null,
    averageLatencyMs: group.attempts ? Math.round(group.latencyMs / group.attempts) : null,
  }));
}

module.exports = {
  ALLOWED_MODELS, BENCHMARK_FIXTURES, BENCHMARK_VERSION, COMPLEX_BENCHMARK_FIXTURES,
  aggregateResults, benchmarkPreflight, plannedAttempts, promptForFixture, runBenchmark, scoreAttempt,
};
