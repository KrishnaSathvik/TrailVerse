'use strict';
const capture = require('./fixtures/anchoredExperienceCapture.json');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { classifyRepairRetryability, blockerSignature } = require('../repairRetryability');
const { degradeUnresolvedModelStops } = require('../modelSelectedIdentityDegradation');
const { runTrailieModelRouting } = require('../../services/trailieModelRoutingService');
const { __testables } = require('../../services/trailieExecutionService');
const row = (name, extra = {}) => ({ evidenceId: `ev:${name}`, topic: 'activities', claim: {
  text: extra.description || name, normalizedValue: { name, category: 'place', activityTypes: ['viewpoint'], ...extra },
} });
const anchor = row(capture.anchor.name, capture.anchor);
const bundle = { evidence: [anchor] };
const resolve = (stop, evidenceBundle = bundle) => resolveStopIdentities({
  itineraryData: { days: [{ dayNumber: 1, stops: [stop] }] }, evidenceBundle,
});
const context = { signals: { intent: 'simple_itinerary', depth: 'standard', tripDays: 4,
  destinationCount: 1, verticalCount: 1, ambiguity: 'low', evidenceCompleteness: 'complete' } };
const fail = extra => ({ status: 'fail', stage: 'stop_identity', reasonCodes: ['stop_identity_unresolved'],
  offendingStops: [{ dayNumber: 1, stopName: 'Unsupported Formation' }], candidateFingerprint: 'catalog-a', ...extra });

test('A: actual captured subjects bind to the captured anchor, geography belongs to anchor', () => {
  for (const stop of capture.plans[0].days[3].stops.slice(0, 2)) {
    const result = resolve(stop);
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[0].stops[0]).toMatchObject({ name: capture.anchor.name,
      canonicalPlaceName: capture.anchor.name, displayName: stop.name,
      experienceSubject: stop.name, evidenceRef: anchor.evidenceId, resolutionStatus: 'resolved',
      latitude: Number(capture.anchor.latitude), longitude: Number(capture.anchor.longitude) });
  }
});
test.each(['skyline', 'mountain', 'bridge', 'wildlife'])('A: generic %s subject and explicit anchor reference', subject => {
  const name = `Example ${subject}`;
  const evidence = { evidence: [row('Harbor Terrace', { description: `Views of ${name} from the terrace.`, latitude: 12, longitude: 13 })] };
  const result = resolve({ name: `Photograph ${name}`, type: 'photography', experienceSubject: name, evidenceRef: 'ev:Harbor Terrace' }, evidence);
  expect(result.violations).toEqual([]);
  expect(result.itineraryData.days[0].stops[0].canonicalPlaceName).toBe('Harbor Terrace');
});
test.each(['A poster mentions Example Mountain.', 'No views of Example Mountain.', 'Views of Another Mountain.'])('B: no invented relationship: %s', description => {
  const result = resolve({ name: 'Example Mountain', type: 'photography', experienceSubject: 'Example Mountain', evidenceRef: 'ev:Terrace' }, { evidence: [row('Terrace', { description })] });
  expect(result.violations).toHaveLength(1);
});
test('B: unsupported subject cannot dispatch a retry or Astra', async () => {
  const executeAttempt = jest.fn(async () => ({ output: {} }));
  const result = await runTrailieModelRouting({ enabled: true, context, executeAttempt,
    validateAttempt: async () => fail({ eligibleCandidateCount: 0 }) });
  expect(executeAttempt).toHaveBeenCalledTimes(1);
  expect(result.attempts[0].retryability).toBe('evidence_blocker');
});
test('C/D: removal affects only invalid scope and preserves three valid days byte for byte', () => {
  const plan = { days: [1, 2, 3, 4].map(dayNumber => ({ dayNumber, label: `Day ${dayNumber}`,
    stops: [{ name: `Verified Overlook ${dayNumber}`, type: 'viewpoint', resolutionStatus: 'resolved', duration: 120 }] })) };
  plan.days[3].stops.push({ name: 'Unsupported Formation', type: 'photography', duration: 30 });
  const result = degradeUnresolvedModelStops({ itineraryData: plan, evidenceBundle: { evidence: [] },
    violations: [{ dayNumber: 4, stopName: 'Unsupported Formation', reasonCode: 'stop_identity_unresolved' }] });
  expect(result.status).toBe('degraded');
  expect(result.itineraryData.days.slice(0, 3)).toEqual(plan.days.slice(0, 3));
  expect(result.itineraryData.days[3].stops).toHaveLength(1);
});
test('E: moved identity against unchanged evidence is the same blocker', () => {
  expect(blockerSignature(fail())).toBe(blockerSignature(fail({ offendingStops: [{ dayNumber: 4, stopName: ' unsupported   formation ' }] })));
  expect(blockerSignature(fail())).not.toBe(blockerSignature(fail({ candidateFingerprint: 'catalog-b' })));
});
test('F/H: one retry at most, every failure classified and every dispatch named', async () => {
  const executeAttempt = jest.fn(async () => ({ output: {} }));
  const result = await runTrailieModelRouting({ enabled: true, context, executeAttempt,
    validateAttempt: async () => fail({ locallyRepairable: true, eligibleCandidateCount: 2 }) });
  expect(executeAttempt).toHaveBeenCalledTimes(2);
  expect(result.attempts.every(a => a.retryability === 'model_fixable' && a.purpose)).toBe(true);
  expect(result.attempts.some(a => a.tier === 'astra_medium')).toBe(false);
});
test('F: completed focused repair budget forbids regeneration even if blocker changes', async () => {
  const executeAttempt = jest.fn(async () => ({ output: {} }));
  await runTrailieModelRouting({ enabled: true, context, executeAttempt,
    validateAttempt: async () => fail({ locallyRepairable: true, focusedRepairUsed: true, eligibleCandidateCount: 2 }) });
  expect(executeAttempt).toHaveBeenCalledTimes(1);
});
test.each(['provider_blocker', 'deterministic_blocker', 'evidence_blocker'])('retry class %s survives', retryability => {
  expect(classifyRepairRetryability(fail({ retryability }))).toBe(retryability);
});

test('G: feasibility preserves its exact cause and affected day through the validator', async () => {
  const plan = { days: [{ id: 'd1', dayNumber: 1, label: 'A full day', stops: [
    { id: 's1', order: 1, name: 'Harbor Overlook', type: 'viewpoint', duration: 120, note: 'Views.' },
  ] }] };
  const validation = await __testables.validateGeneration({
    output: { itineraryData: plan, structuredStatus: 'complete', text: '' }, itinerary: true,
    bundle: { evidence: [row('Harbor Overlook')] }, constraints: { tripDays: 1 },
    detectContradiction: () => [],
    finalizeItinerary: async ({ itineraryData }) => ({ itineraryData,
      feasibilityIssues: [{ type: 'excessive_activity', dayNumber: 1, stopIds: ['s1'] }] }),
  });
  expect(validation.stage).toBe('itinerary_feasibility');
  expect(validation.reasonCodes).toEqual(['excessive_activity']);
  expect(validation.targetDiagnostics.dayNumber).toBe(1);
  expect(classifyRepairRetryability(validation)).toBe('model_fixable');
});

test('display finalization keeps subject wording separate from geography', () => {
  const stop = resolve(capture.plans[0].days[3].stops[0]).itineraryData.days[0].stops[0];
  expect(require('../stopDisplayLabel').applyStopDisplayLabel(stop)).toEqual(stop);
});

test('full four-day capture resolves view subjects locally without changing other days', () => {
  const plan = capture.plans[0];
  // Synthetic direct records isolate grounding from absent live bundle capture.
  const evidence = plan.days.flatMap(day => day.stops)
    .filter(stop => !['Towers of the Virgin', 'Bridge Mountain', capture.anchor.name].includes(stop.name))
    .map(stop => row(stop.name));
  const result = resolveStopIdentities({ itineraryData: plan, evidenceBundle: { evidence: [...evidence, anchor] } });
  expect(result.violations).toEqual([]);
  expect(result.itineraryData.days.map(day => day.stops.map(stop => stop.id)))
    .toEqual(plan.days.map(day => day.stops.map(stop => stop.id)));
  expect(result.itineraryData.days[3].stops[0].experienceSubject).toBe('Towers of the Virgin');
});

test('F/H: runtime performs one bounded identity repair, accepts, and accounts for both named dispatches', async () => {
  const { executeTrailieTurn } = require('../../services/trailieExecutionService');
  const { buildEvidenceBundle } = require('../evidenceBundle');
  const { LEGAL_STOP_SUBSTITUTION_TOOL } = require('../legalStopSubstitutionRepair');
  const plan = { intro: 'Four days of views.', days: [1, 2, 3, 4].map(dayNumber => ({
    id: `d${dayNumber}`, dayNumber, label: 'Scenery', stops: [{ id: `s${dayNumber}`, order: 1,
      name: dayNumber === 4 ? 'Unverified Formation' : `Verified Overlook ${dayNumber}`,
      type: dayNumber === 4 ? 'photography' : 'viewpoint', duration: 180, startTime: '', note: 'Enjoy the view.' }],
  })) };
  const evidence = [1, 2, 3, 4].map(n => row(`Verified Overlook ${n}`));
  const requests = [];
  const result = await executeTrailieTurn({ userMessage: 'Give me four days in Zion.',
    conversationContext: { history: [] }, constraints: { tripDays: 4 }, resolvedContext: {}, tripState: null }, {
    enabled: true, liveBudget: null, streamGeneration: false, responseAdapters: {},
    planRequirements: () => [{ requirementId: 'r1', topic: 'activities', criticality: 'optional' }],
    resolveEvidence: async ({ requestId, requirements }) => buildEvidenceBundle({ requestId,
      resolutions: requirements.map(r => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: evidence.map(e => e.evidenceId) })), candidates: evidence }),
    resolveDeterministicRender: () => ({ eligible: false }), detectContradiction: () => [],
    resolveStopCoordinates: null, resolveStopRoute: null,
    finalizeItinerary: async ({ itineraryData }) => ({ itineraryData, feasibilityIssues: [], operationalConflicts: [] }),
    executeResponses: async request => {
      requests.push(request);
      if (request.tools[0].name === LEGAL_STOP_SUBSTITUTION_TOOL.name) {
        const scope = require('../legalStopSubstitutionRepair').resolveSubstitutionScope({ itineraryData: plan,
          offendingStops: [{ dayNumber: 4, stopName: 'Unverified Formation' }] });
        const catalog = require('../legalStopSubstitutionRepair').buildLegalSubstitutionCatalog({
          bundle: { evidence }, candidatePlan: plan, repairScope: scope, constraints: { tripDays: 4 } });
        return { completionStatus: 'complete', usage: {}, toolCalls: [{ name: LEGAL_STOP_SUBSTITUTION_TOOL.name,
          input: { substitutions: [{ dayRef: 4, stopRef: 1, replacement: { placeRef: catalog.candidates[0].ref, note: 'Enjoy the view.', why: 'A scenic stop.' } }] } }] };
      }
      return { completionStatus: 'complete', stopReason: 'stop', usage: {}, outputText: '',
        toolCalls: [{ name: 'create_itinerary', input: plan }] };
    },
  });
  expect(requests.map(r => r.requestMetadata?.purpose)).toEqual(['primary_generation', 'legal_stop_substitution_repair']);
  expect(result.status).toBe('complete');
  const telemetry = result.telemetrySummary;
  expect(result.latencyBreakdown.modelDispatchCount).toBe(2);
  expect(result.latencyBreakdown.namedDispatchPurposes).toHaveLength(2);
  expect(result.latencyBreakdown.unattributedModelDispatches).toBe(0);
  expect(telemetry.subDispatches[0].untargetedMutationCount).toBe(0);
});

test('D: a removable unsupported stop reaches full acceptance with valid days retained', async () => {
  const plan = { days: [1, 2, 3, 4].map(dayNumber => ({ id: `d${dayNumber}`, dayNumber, label: 'Scenery',
    stops: [{ id: `s${dayNumber}`, name: `Verified Overlook ${dayNumber}`, type: 'viewpoint', duration: 180, note: 'Enjoy the view.' }] })) };
  plan.days[3].stops.push({ id: 'optional', name: 'Unsupported Formation', type: 'photography', duration: 30 });
  const result = await __testables.validateGeneration({
    output: { itineraryData: plan, structuredStatus: 'complete', text: '' }, itinerary: true,
    bundle: { evidence: [1, 2, 3, 4].map(n => row(`Verified Overlook ${n}`)) }, constraints: { tripDays: 4 },
    detectContradiction: () => [], finalizeItinerary: async ({ itineraryData }) => ({ itineraryData, feasibilityIssues: [], operationalConflicts: [] }),
  });
  expect(result.status).toBe('pass');
  expect(result.finalizedPlan.itineraryData.days[3].stops.map(stop => stop.name)).toEqual(['Verified Overlook 4']);
});

test('distinct supported viewing subjects share geography without becoming the same experience', () => {
  const { createStopIdentityComparator } = require('../stopExperienceIdentity');
  const a = resolve(capture.plans[0].days[3].stops[0]).itineraryData.days[0].stops[0];
  const b = resolve(capture.plans[0].days[3].stops[1]).itineraryData.days[0].stops[0];
  const compare = createStopIdentityComparator({ evidenceBundle: bundle });
  expect(compare(a, b)).toBe('distinct');
  expect(compare(a, a)).not.toBe('distinct');
  expect(compare({ ...a, experienceSubject: 'Made Up Subject' }, { ...a, experienceSubject: 'Other Made Up Subject' })).not.toBe('distinct');
});

test('typed area labels cannot promote a destination centroid to an experience', () => {
  const result = resolve({ name: 'Example Region', type: 'area' }, { evidence: [{ ...row('Example Region'), topic: 'destination_identity' }] });
  expect(result.violations[0].reasonCode).toBe('stop_identity_destination_only');
});

test('captured provider record keeps its viewing relationship and anchor coordinates through normalization', () => {
  const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
  const provider = createNpsEvidenceProvider({ npsClient: {} });
  const request = provider.buildRequest({ topic: 'visitor_services', entity: { entityId: 'nps:park:zion' } });
  const rows = provider.normalize([capture.anchor], request, { observedAt: '2026-09-24T00:00:00.000Z' });
  const official = { ...rows[0], evidenceId: 'captured-museum' };
  const resolved = resolve(capture.plans[0].days[3].stops[0], { evidence: [official] });
  expect(resolved.violations).toEqual([]);
  expect(resolved.itineraryData.days[0].stops[0]).toMatchObject({ canonicalPlaceName: capture.anchor.name,
    latitude: Number(capture.anchor.latitude), longitude: Number(capture.anchor.longitude), type: 'photography' });
});

test('captured note selects a verified anchor among supported alternatives without creating a relationship', () => {
  const stop = capture.plans[0].days[3].stops[0];
  const result = resolve(stop, { evidence: capture.evidence });
  expect(result.violations).toEqual([]);
  expect(result.itineraryData.days[0].stops[0]).toMatchObject({ experienceSubject: stop.name, canonicalPlaceName: capture.anchor.name });
  expect(resolve({ ...stop, name: 'Unsupported Formation' }, { evidence: capture.evidence }).violations).toHaveLength(1);
});

test('cultural day-value remains valid while the captured vague area requires actionability repair', async () => {
  // Activities and visitor-services payloads were captured. The original full
  // frozen bundle and non-streamed helper output were not; this is a bounded
  // reconstruction of the helper trigger, not an exact whole-turn replay.
  const validation = await __testables.validateGeneration({
    output: { itineraryData: capture.plans[1], structuredStatus: 'complete', text: '' }, itinerary: true,
    bundle: { evidence: capture.evidence }, constraints: { tripDays: 4 }, userPrompt: 'Give me four days in Zion.',
    detectContradiction: () => [], finalizeItinerary: require('../finalizeItinerary').finalizeStructuredItinerary,
  });
  // The identity binding is unchanged; grounded exhibit visits now contribute
  // cultural experience value before any additional model dispatch.
  expect(validation.candidatePlan.days[0].stops.find(s => s.name === capture.anchor.name).type).toBe('museum');
  expect(validation.status).toBe('fail');
  expect(validation.reasonCodes).toContain('experience_not_actionable');
  expect(validation.actionability.affectedDays).toEqual([3]);
  expect(validation.retryability).toBe('model_fixable');
});

test('a landscape subject cannot resolve to a longer facility name by prefix alone', () => {
  const result = resolve({ name: 'Example Canyon', type: 'area' }, { evidence: [row('Example Canyon Visitor Center', { category: 'visitor_center' })] });
  expect(result.violations).toHaveLength(1);
  expect(result.itineraryData.days[0].stops[0].resolutionStatus).toBe('unresolved');
});
