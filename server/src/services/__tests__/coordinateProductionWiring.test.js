'use strict';
jest.mock('../trailieV2ExecutionService', () => ({ executeTrailieV2Turn: jest.fn() }));
jest.mock('../evidenceBrokerRuntime', () => ({ createEvidenceBrokerRuntime: jest.fn() }));
jest.mock('openai', () => jest.fn(() => ({ responses: {} })));
jest.mock('../providers/openaiResponsesAdapter', () => ({ createOpenAIResponsesAdapter: jest.fn(() => ({})) }));

const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { createEvidenceBrokerRuntime } = require('../evidenceBrokerRuntime');
const { runTrailieV2FromPreparedContext } = require('../trailieV2RouteBridge');

test('production bridge supplies the singleton ephemeral dispatcher through the authority resolver', async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fake-test-key';
  const dispatchEphemeral = jest.fn(async ({ ownership }) => ({
    status: 'no_result', normalizedCandidates: [], ownership,
  }));
  createEvidenceBrokerRuntime.mockReturnValue({ dispatchEphemeral, resolveEvidence: jest.fn() });
  executeTrailieV2Turn.mockImplementation(async (input, deps) => {
    expect(input.signal).toBe(controller.signal);
    await deps.resolveStopCoordinates({
      key: { evidenceRef: 'ev:stop', canonicalPlaceName: 'Grounded Place' },
      evidenceBundle: { evidence: [{ evidenceId: 'ev:stop', entityId: 'nps:park:yose',
        claim: { normalizedValue: { name: 'Grounded Place' } } }] },
      requestId: 'turn', signal: input.signal,
      ownership: { attempt: 1, dispatchIndex: 1, candidateFingerprint: 'fingerprint' },
    });
    return { status: 'complete', response: { text: 'Done' } };
  });
  const controller = new AbortController();
  try {
    await runTrailieV2FromPreparedContext({ preparedContext: {}, messages: [], signal: controller.signal });
    expect(dispatchEphemeral).toHaveBeenCalledTimes(1);
    expect(dispatchEphemeral.mock.calls[0][0]).toMatchObject({
      requirement: { topic: 'stop_coordinates', query: 'Grounded Place, Yosemite National Park' },
      signal: controller.signal,
    });
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
