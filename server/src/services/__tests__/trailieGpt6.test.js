'use strict';
const { runTrailieModelRouting } = require('../trailieModelRoutingService');
const { createResponsesRequest } = require('../responsesAdapter');
const { buildOpenAIRequest } = require('../providers/openaiResponsesAdapter');
const { resolveModelPrice } = require('../../config/trailiePricingRegistry');

test('a non-repairable quick request stops after Luna without spending on escalation', async () => {
  const result = await runTrailieModelRouting({
    enabled: true,
    context: { signals: { intent: 'general_qa', depth: 'quick', evidenceCompleteness: 'complete' } },
    executeAttempt: async () => ({ output: null }),
    validateAttempt: async () => ({ status: 'fail', locallyRepairable: false, reasonCodes: ['schema_invalid'] }),
  });
  expect(result.attempts.map(a => [a.model, a.reasoningEffort])).toEqual([
    ['gpt-6-luna', 'low'],
  ]);
  expect(result.reasonCode).toBe('deterministic_blocker');
});

test.each(['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'])('%s omits sampling parameters with reasoning and preserves tools/storage', model => {
  const request = createResponsesRequest({ provider: 'openai', model,
    input: [{ role: 'user', content: 'Plan a day' }], maxOutputTokens: 1200,
    temperature: 0.5, reasoning: { effort: 'medium' },
    tools: [{ name: 'create_itinerary', input_schema: { type: 'object', properties: {} } }],
  });
  const body = buildOpenAIRequest(request, { stream: true });
  expect(body).toMatchObject({ model, store: false, stream: true, reasoning: { effort: 'medium' } });
  expect(body.tools[0].name).toBe('create_itinerary');
  expect(body).not.toHaveProperty('temperature');
  expect(resolveModelPrice({ provider: 'openai', model, at: '2026-09-23' })).not.toBeNull();
});

test('Astra rejects unsupported reasoning locally before SDK dispatch', () => {
  const request = createResponsesRequest({ provider: 'openai', model: 'gpt-6-astra',
    input: [{ role: 'user', content: 'hello' }], maxOutputTokens: 100, reasoning: { effort: 'none' } });
  expect(() => buildOpenAIRequest(request)).toThrow('responses_invalid_request');
});

test('GPT-6.1 Sol uses its verified rate rather than a neighboring model price', () => {
  expect(resolveModelPrice({ provider: 'openai', model: 'gpt-6.1-sol', at: '2026-10-13' }))
    .toMatchObject({
      inputPerMillion: 2,
      cacheReadPerMillion: 0.1,
      cacheWritePerMillion: 2.5,
      outputPerMillion: 10,
      inputIncludesCachedTokens: true,
    });
});
