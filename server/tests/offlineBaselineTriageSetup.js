'use strict';
require('./offlineRepairSetup');
jest.mock('../src/services/trailieV2ExecutionService', () => {
  const actual = jest.requireActual('../src/services/trailieV2ExecutionService');
  return { ...actual, executeTrailieV2Turn: async (...args) => {
    const result = await actual.executeTrailieV2Turn(...args);
    console.log('BASELINE_TRIAGE', JSON.stringify({ test: expect.getState().currentTestName,
      status: result.status, terminal: result.terminalReason,
      attempts: result.attempts?.map(a => ({ stage:a.validationStage,codes:a.validationReasonCodes,retryability:a.retryability })),
      repairs: result.telemetrySummary?.subDispatches?.map(r => ({ kind:r.kind,status:r.mergeStatus,codes:r.reasonCodes })) }));
    return result;
  } };
});
jest.mock('../src/utils/itineraryCompleteness', () => {
  const actual = jest.requireActual('../src/utils/itineraryCompleteness');
  return { ...actual, evaluateItineraryCompleteness: (...args) => {
    const result = actual.evaluateItineraryCompleteness(...args);
    if (expect.getState().currentTestName?.includes('captured attempt 3')) console.log('BASELINE_TRIAGE_COMPLETENESS', JSON.stringify({ codes:result.reasonCodes, days:result.dayDiagnostics }));
    return result;
  } };
});
