'use strict';

/**
 * WP12 Phase 4 — aiLogger still records chat turns to the ledger.
 * Shadow/canary hooks are retired.
 */

jest.mock('../../services/trailieTurnLedger', () => ({
  CHAT_ROUTES: new Set(['chat', 'chat-stream', 'chat-anonymous', 'chat-anonymous-stream']),
  recordTurnFromAiLog: jest.fn().mockResolvedValue({ responseId: 'response-1' }),
}));

const { recordTurnFromAiLog } = require('../../services/trailieTurnLedger');
const { logAIRequest } = require('../aiLogger');

describe('aiLogger turn ledger (post Phase 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('records chat turns without requiring shadow services', async () => {
    await logAIRequest({
      endpoint: 'chat',
      responseId: 'response-ledger',
      intentV2: { primaryIntent: 'general_qa' },
      intentShadowInput: { userPrompt: 'PRIVATE', priorTripState: null },
    });
    expect(recordTurnFromAiLog).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'chat',
      responseId: 'response-ledger',
    }));
    const logged = recordTurnFromAiLog.mock.calls[0][0];
    expect(logged).not.toHaveProperty('intentShadowInput');
  });

  test('non-chat endpoints skip ledger write', async () => {
    await logAIRequest({ endpoint: 'voice-tool', responseId: 'v1' });
    expect(recordTurnFromAiLog).not.toHaveBeenCalled();
  });
});
