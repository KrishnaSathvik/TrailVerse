'use strict';

/**
 * WP12 Phase 4 — production instrumentation contracts after legacy chat deletion.
 * Shadow/canary route contracts are retired with the shadow services.
 */

const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('WP1 production instrumentation contract', () => {
  test('all four chat routes execute inside one async turn telemetry scope', () => {
    const source = read('../../routes/ai.js');
    expect(source).toMatch(/trailieTurnTelemetryScope/);
    expect(source).toMatch(/router\.use\(trailieTurnTelemetryScope\)/);
  });

  test('lite classifier/digest calls register sanitized nested provider usage', () => {
    const source = read('../trailieLiteLlm.js');
    expect(source).toMatch(/recordAuxiliaryCall/);
    expect(source).toMatch(/phase:\s*purpose/);
    expect(source).toMatch(/usage:\s*resultUsage/);
  });

  test('every paid web-search provider attempt is registered, including fallbacks', () => {
    const source = read('../factsService.js');
    expect(source).toMatch(/recordAuxiliaryCall/);
    expect(source).toMatch(/phase:\s*['"]web_search['"]/);
    expect(source).toMatch(/provider:\s*primaryRunner\.name/);
    expect(source).toMatch(/provider,\s*\n\s*model:\s*null/);
  });
});

describe('WP12 Phase 4 — product chat generation authority', () => {
  test('product chat routes use WP11A bridge only', () => {
    const source = read('../../routes/ai.js');
    expect(source).toMatch(/runTrailieFromPreparedContext/);
    expect(source).not.toMatch(/runTrailieItineraryTurn/);
    expect(source).not.toMatch(/streamRawLLMToSse/);
    expect(source).not.toMatch(/planTrailieFetches\(/);
  });

  // WP-TU Phase 2 Task 3 — the observational-only ai.js copy
  // (`const intentV2 = classifyTrailieIntent(...)`) fed no live telemetry or
  // response field (see docs/plans/2026-09-03-trailie-turn-understanding-
  // implementation.md, Task 3): `intentV2` was never destructured from
  // `preparedContext` anywhere, and `logAIRequest`'s three real call sites
  // (all error-catch handlers) never included it in the logged record — the
  // one live reader, trailieTurnLedger.js's `intentFromEvent`, never actually
  // received a populated `event.intentV2` in production. It has been removed;
  // classifyTrailieIntent now executes exactly once per turn, authoritatively,
  // inside trailieExecutionService.js.
  test('classifyTrailieIntent has a single authoritative call site — no observational duplicate in ai.js', async () => {
    const routeSource = read('../../routes/ai.js');
    expect(routeSource).not.toMatch(/classifyTrailieIntent/);
    expect(routeSource).not.toMatch(/\bintentV2\b/);
    expect(routeSource).not.toMatch(/\bintentShadowInput\b/);

    const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
    const classifyIntent = jest.fn(() => { throw new Error('classification seam reached'); });
    const officialPlaces = [{ name: 'Official feature', parkCode: 'acad' }];
    await executeTrailieV2Turn({ userMessage: 'Plan a trip.', officialPlaces }, {
      enabled: true, classifyIntent,
    });
    expect(classifyIntent).toHaveBeenCalledTimes(1);
    expect(classifyIntent).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: 'Plan a trip.', officialPlaces,
    }));

  });
});
