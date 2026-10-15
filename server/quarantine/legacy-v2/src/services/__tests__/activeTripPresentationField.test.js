'use strict';

/**
 * WP-TU Phase 3 Task 7B — a new, ADDITIVE `activeTripPresentation` field on
 * the execution result, sourced ONLY from `planningState.destination` (Task
 * 7's already-synced, already-gated value). The client should not need to
 * reconstruct active state from `activeContextAction` — the final resulting
 * destination for the turn is already present.
 *
 * Two real boundaries are tested, matching this codebase's own conventions
 * (see wp12Phase35Streaming.test.js, travelLogisticsV2Attachment.test.js):
 *
 *   1. `executeTrailieV2Turn` (deps-injected, no live provider) — proves the
 *      field is computed correctly for all 6 acceptance rows, real classifier.
 *      (`runTrailieV2FromPreparedContext` itself is NOT called here — it
 *      wires the REAL OpenAI adapter with no injection seam, so it cannot be
 *      driven offline/deterministically; its own code was read directly and
 *      confirmed to return `executeTrailieV2Turn`'s result object verbatim —
 *      `return { result, content: renderV2Content(result) }` — no field
 *      renaming/filtering at that layer.)
 *   2. `createTrailieTransportAdapter` (`trailieTransportAdapter.js`) — the
 *      actual transport/dialect layer that turns a payload into the real
 *      wire event. Proves it passes an unknown/new field through untouched
 *      rather than allowlisting it away, in every mode (stream v2, stream
 *      legacy, terminal JSON).
 *
 * Plus: `finalizeV2NonCompleteResponse` (exported from routes/ai.js, the
 * shared non-complete-terminal helper) is tested directly — real ai.js code,
 * not a re-implementation. And a structural source-text assertion pins that
 * all 4 real `transport.responseFinalized({...})` call sites in ai.js
 * (the ones NOT behind that shared helper) include the field — the actual
 * route-handler bodies are closures on the Express router with no exported
 * seam, so this is the deterministic regression guard against the field
 * being silently dropped from one of them.
 */

const fs = require('fs');
const path = require('path');
const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { createTrailieTransportAdapter } = require('../../../../../src/utils/trailieTransportAdapter');
const { finalizeV2NonCompleteResponse } = require('../../../../../src/routes/ai');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

// ---------------------------------------------------------------------------
// executeTrailieV2Turn harness — matches trailieV2ExecutionService.test.js /
// tripScopeIntentSync.test.js conventions. classifyIntent WRAPS the real
// classifyTrailieIntent (real regex/relationship/job resolution); generation
// and evidence resolution are scripted/offline.
// ---------------------------------------------------------------------------

function proseResult() {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: 'A complete, validated prose answer well over the fallback length threshold.',
    toolCalls: [],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
  };
}

// A structurally valid itinerary tool call — needed whenever the turn is
// classified as an itinerary build (architect mode requests a tool), or the
// prose-shaped stub above fails structural validation and the turn ends
// `failed` rather than `complete`.
function itineraryResult() {
  const days = [{
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      { name: 'Visitor Center orientation', duration: 45, timeWindow: 'Morning' },
      { name: 'Valley floor scenic walk', duration: 90, timeWindow: 'Late morning' },
      { name: 'Picnic and rest buffer', duration: 60, timeWindow: 'Midday' },
    ],
  }];
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: '',
    toolCalls: [{
      name: 'create_itinerary',
      id: 'call_1',
      input: { days },
      rawArgs: JSON.stringify({ days }),
    }],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
  };
}

function buildDeps() {
  const executeResponses = jest.fn(async (request) => (
    request?.tools && request.tools.length ? itineraryResult() : proseResult()
  ));
  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));
  return {
    classifyIntent: jest.fn((args) => classifyTrailieIntent(args)),
    planRequirements: jest.fn(() => []),
    resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
    detectContradiction: jest.fn(() => []),
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    newTurnId: () => `turn-${Math.random().toString(36).slice(2)}`,
    streamGeneration: false,
    responseAdapters: {},
    executeResponses,
    resolveEvidence,
  };
}

async function runTurn({ userMessage, priorTripState = null, planningState = null, candidatePlans = [], activeTripId = null }) {
  const deps = buildDeps();
  return executeTrailieV2Turn({
    userMessage,
    conversationContext: { history: [] },
    tripState: priorTripState,
    planningState,
    constraints: null,
    resolvedContext: {},
    // WP-TU Phase 4 Task 10 — defaulted to empty/null so every row EXCEPT
    // Row 5 (the only REFINEMENT_JOBS turn in this file) is unaffected: Task
    // 9/10's resolver returns `not_required` for every other row's job, so
    // the new fail-closed gate never fires for them.
    candidatePlans,
    activeTripId,
  }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState }) });
}

const REDWOOD_PS = {
  schemaVersion: 'trailie-planning-state-v1',
  destination: { parkCode: 'redw', parkName: 'Redwood National Park', region: null, state: null },
  dates: { startDate: null, endDate: null, durationDays: null },
};
const BADLANDS_PS = {
  schemaVersion: 'trailie-planning-state-v1',
  destination: { parkCode: 'badl', parkName: 'Badlands National Park', region: null, state: null },
  dates: { startDate: null, endDate: null, durationDays: null },
};

describe('Task 7B — activeTripPresentation, real executeTrailieV2Turn wiring, all 6 acceptance rows', () => {
  test('Row 1: no active -> "Plan 3 days in Zion" -> destination = Zion', async () => {
    const result = await runTurn({ userMessage: 'Plan 3 days in Zion', priorTripState: null, planningState: null });
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('zion');
    expect(result.activeTripPresentation.activeContextAction).toBe('set');
  });

  test('Row 2: Redwood active -> "Is October good in Acadia?" -> destination stays Redwood', async () => {
    const result = await runTurn({
      userMessage: 'Is October good in Acadia?',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
      planningState: REDWOOD_PS,
    });
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('redw');
    expect(result.activeTripPresentation.activeContextAction).toBe('preserve');
  });

  test('Row 3: -> "What about November?" -> destination STILL stays Redwood', async () => {
    const result = await runTurn({
      userMessage: 'What about November?',
      priorTripState: {
        primaryDestination: { parkCode: 'redw', name: 'Redwood' },
        hasItinerary: true,
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
          primaryDestination: { name: 'Acadia', parkCode: 'acad' },
          destinationRelationship: 'single',
        },
      },
      planningState: REDWOOD_PS,
    });
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('redw');
  });

  test('Row 4: Redwood active -> "Actually plan Badlands instead" -> destination = Badlands', async () => {
    const result = await runTurn({
      userMessage: 'Actually plan Badlands instead',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
      planningState: REDWOOD_PS,
    });
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('badl');
    expect(result.activeTripPresentation.activeContextAction).toBe('set');
  });

  // WP-TU Phase 4 Task 10 — this exact scenario is a REFINEMENT job
  // (itinerary_refinement) naming a DIFFERENT destination than the active
  // trip, i.e. Task 9/10's "historical reference" case. With Task 10's
  // fail-closed gate now live, this turn no longer reaches `complete` — it
  // resolves the historical Redwood target, then fails closed (full
  // historical-plan-content hydration is deferred; see the Task 10 report)
  // rather than silently patching the active Badlands plan. This does NOT
  // contradict Task 7B: `activeTripPresentation` is asserted only on turns
  // that actually reach `finalize()` with `planningState` already synced
  // (Task 7) — this terminal, like `evidence_incomplete` before it, returns
  // earlier than that, so it is not meaningfully assertable here.
  test('Row 5: Badlands active -> "For my Redwood trip, change Day 2" -> resolves the historical Redwood target and fails closed (no active-plan mutation)', async () => {
    const result = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true },
      planningState: BADLANDS_PS,
      candidatePlans: [{
        id: 'trip-redw-1',
        title: 'Redwood Trip',
        parkCode: 'redw',
        parkName: 'Redwood National Park',
        formData: { startDate: null, endDate: null },
        planningState: { destination: { parkCode: 'redw', parkName: 'Redwood National Park' } },
        status: 'active',
      }],
      activeTripId: 'trip-badl-1',
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBe('trip-redw-1');
    expect(result.canonicalPlan).toBeNull();
  });

  test('Row 6: fresh -> "Plan Yellowstone and Grand Teton." -> destination = Yellowstone (primary); nothing else in the payload collapses to one park', async () => {
    const result = await runTurn({ userMessage: 'Plan Yellowstone and Grand Teton.', priorTripState: null, planningState: null });
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('yell');

    // Concrete, not assumed: the SAME classification this turn produced still
    // drives Task 4/6's own machinery to BOTH destinations — proving Task 7B's
    // necessarily-singular field never fed back into, or collapsed, tripScope/
    // resolvedEntities. (Neither is exposed on the public result; verified
    // directly against the real classifier + the real Task 4/6 functions.)
    const {
      __testables: { syncTripScopeDestinationFromIntent, applyResolvedEntitiesOverride },
    } = require('../../../../../src/services/trailieV2ExecutionService');
    const intent = classifyTrailieIntent({ userPrompt: 'Plan Yellowstone and Grand Teton.', priorTripState: null });
    const tripScope = syncTripScopeDestinationFromIntent(null, intent);
    expect(tripScope.destinations.map((d) => d.parkCode)).toEqual(['yell', 'grte']);
    const resolvedContext = applyResolvedEntitiesOverride({ resolvedEntities: [], primaryPark: null, destinationCount: 0 }, intent);
    expect(resolvedContext.resolvedEntities.map((e) => e.entityId)).toEqual(['nps:park:yell', 'nps:park:grte']);
  });

  test('every OTHER top-level result field is present and unaffected — purely additive', async () => {
    const result = await runTurn({ userMessage: 'Plan 3 days in Zion', priorTripState: null, planningState: null });
    for (const key of ['version', 'status', 'intent', 'presentation', 'evidence', 'routeDecision', 'response', 'canonicalPlan', 'travelLogistics', 'derivedPublication', 'itineraryHash', 'attempts', 'validation', 'artifactFulfillment', 'terminalReason', 'telemetrySummary']) {
      expect(result).toHaveProperty(key);
    }
    expect(result.activeTripPresentation).toBeDefined();
  });
});

describe('Task 7B — the transport/dialect layer does not drop the new field', () => {
  test.each([
    ['v2 stream', 'v2', 'stream'],
    ['legacy stream', 'legacy', 'stream'],
    ['v2 terminal (non-stream JSON)', 'v2', 'terminal'],
    ['legacy terminal (non-stream JSON)', 'legacy', 'terminal'],
  ])('%s: responseFinalized forwards activeTripPresentation untouched', (_label, dialect, mode) => {
    const emitted = [];
    const transport = createTrailieTransportAdapter({ dialect, emit: (payload) => emitted.push(payload), mode });
    transport.responseFinalized({
      content: 'hello',
      activeTripPresentation: { destination: { parkCode: 'badl', parkName: 'Badlands National Park' }, activeContextAction: 'set' },
    });
    expect(emitted).toHaveLength(1);
    const payload = mode === 'terminal' && dialect === 'legacy' ? emitted[0].data : emitted[0];
    expect(payload.activeTripPresentation).toEqual({
      destination: { parkCode: 'badl', parkName: 'Badlands National Park' },
      activeContextAction: 'set',
    });
  });
});

describe('Task 7B — finalizeV2NonCompleteResponse (exported, real ai.js code) includes the field', () => {
  test('a non-complete terminal still carries activeTripPresentation when the v2Result has one', () => {
    const responseFinalized = jest.fn();
    finalizeV2NonCompleteResponse({
      transport: { responseFinalized },
      v2Result: {
        status: 'evidence_incomplete',
        travelLogistics: null,
        responseArtifacts: null,
        intent: null,
        presentation: null,
        activeTripPresentation: { destination: { parkCode: 'redw', parkName: 'Redwood National Park' }, activeContextAction: 'preserve' },
      },
      terminalPayload: { content: 'blocked' },
    });
    expect(responseFinalized).toHaveBeenCalledWith(expect.objectContaining({
      activeTripPresentation: { destination: { parkCode: 'redw', parkName: 'Redwood National Park' }, activeContextAction: 'preserve' },
    }));
  });
});

describe('Task 7B/8B — structural: every real v2Result-consuming call site in ai.js forwards the field', () => {
  test('exactly 7 call sites forward v2Result.activeTripPresentation', () => {
    const source = fs.readFileSync(path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), '../../routes/ai.js'), 'utf8');
    const matches = source.match(/activeTripPresentation: v2Result\.activeTripPresentation \?\? null,/g) || [];
    // Task 7B: 4 inline transport.responseFinalized complete-status call
    // sites + 1 shared finalizeV2NonCompleteResponse helper (transport
    // response payload).
    // Task 8B: 2 guestTurn.complete({...}) call sites (persistence payload —
    // distinct from the transport payload Task 7B already covered).
    expect(matches).toHaveLength(7);
  });

  // WP-TU Phase 4 Task 10D — deliberately NARROWER than the 7 above.
  // `targetPlanMutation` is authenticated-only: candidate-plan discovery
  // (hence cross-plan hydration) is gated `!isAnonymous` in
  // prepareChatContext, so `v2Result.targetPlanMutation` is always null for
  // every guest session and threading it through the 5 guest call sites
  // would be dead plumbing. Exactly the non-stream `/chat` and stream
  // `/chat/stream` authenticated handlers carry it.
  test('exactly 2 (authenticated-only) call sites forward v2Result.targetPlanMutation', () => {
    const source = fs.readFileSync(path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), '../../routes/ai.js'), 'utf8');
    const matches = source.match(/targetPlanMutation: v2Result\.targetPlanMutation \?\? null,/g) || [];
    expect(matches).toHaveLength(2);
  });

  // WP-TU Phase 4 Task 10D — regression guard. `rememberConversationPlan`
  // (authenticated-unsaved-plan continuity) must stay gated on
  // `v2Result.canonicalPlan` being truthy — which is exactly what makes it
  // structurally unreachable for a cross-plan mutation (canonicalPlan is
  // deliberately null then). This pins the gate condition's source text so
  // a future edit cannot silently loosen it (e.g. to also check
  // `targetPlanMutation`) without this test forcing a conscious look.
  test('rememberConversationPlan stays gated on v2Result.canonicalPlan alone (unchanged by Task 10D)', () => {
    const source = fs.readFileSync(path.join(require('path').resolve(__dirname, '../../../../../src/services/__tests__'), '../../routes/ai.js'), 'utf8');
    const matches = source.match(/if \(v2Result\.status === 'complete' && v2Result\.canonicalPlan && req\.user\?\.\_id\) \{/g) || [];
    expect(matches).toHaveLength(2);
  });
});
