'use strict';

const {
  ALLOWED_MODELS, BENCHMARK_FIXTURES, COMPLEX_BENCHMARK_FIXTURES, aggregateResults,
  benchmarkPreflight, plannedAttempts, promptForFixture, runBenchmark,
} = require('../gpt56Benchmark');

function fakeResponse(body) {
  const tool = body.tools?.length;
  const days = Number((body.input?.[1]?.content || '').match(/exactly (\d+)|for (\d+) days/i)?.slice(1).find(Boolean) || 1);
  const args = { days: Array.from({ length: days }, (_, index) => ({ id: `d${index + 1}`, dayNumber: index + 1, label: `Day ${index + 1}`, stops: [] })) };
  return {
    id: 'resp_test', model: body.model, status: 'completed',
    output_text: tool ? '' : 'The fixture says Tioga Road is closed; verify on the official NPS page.',
    output: tool ? [{ type: 'function_call', call_id: 'c1', name: 'create_itinerary', arguments: JSON.stringify(args), status: 'completed' }] : [],
    usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } },
  };
}

describe('controlled GPT-5.6 local benchmark harness', () => {
  test('has 12 representative frozen fixtures and only approved GPT-5.6 candidates', () => {
    expect(BENCHMARK_FIXTURES).toHaveLength(12);
    expect(Object.isFrozen(BENCHMARK_FIXTURES)).toBe(true);
    const attempts = plannedAttempts();
    expect(attempts).toHaveLength(24);
    expect(new Set(attempts.map((item) => item.model))).toEqual(new Set(ALLOWED_MODELS));
    expect(attempts.some((item) => /claude|sonnet|5\.4-mini/i.test(item.model))).toBe(false);
  });

  test('targets exactly four unresolved complex fixtures with eight medium-effort calls and a 3,500-token ceiling', () => {
    expect(COMPLEX_BENCHMARK_FIXTURES).toHaveLength(4);
    const attempts = plannedAttempts(COMPLEX_BENCHMARK_FIXTURES);
    expect(attempts).toHaveLength(8);
    expect(new Set(attempts.map((item) => item.model))).toEqual(new Set(['gpt-5.6-terra', 'gpt-5.6-sol']));
    expect(attempts.every((item) => item.reasoningEffort === 'medium')).toBe(true);
    expect(COMPLEX_BENCHMARK_FIXTURES.every((item) => item.maxOutputTokens === 3500 && item.tool === true)).toBe(true);
    expect(COMPLEX_BENCHMARK_FIXTURES.map((item) => item.fixtureId)).toEqual([
      'full-seven-two-parks', 'complex-four-parks',
      'complex-alaska-ten', 'complex-olympic-rainier-six',
    ]);
  });

  test('fails closed without explicit enablement, key, call cap, cost cap, or approved model', () => {
    expect(benchmarkPreflight({ enabled: false, apiKey: 'key' }).reason).toBe('benchmark_not_enabled');
    expect(benchmarkPreflight({ enabled: true, apiKey: '' }).reason).toBe('openai_api_key_missing');
    expect(benchmarkPreflight({ enabled: true, apiKey: 'key', maxCalls: 23 }).reason).toBe('benchmark_call_cap_exceeded');
    expect(benchmarkPreflight({ enabled: true, apiKey: 'key', maxCostUsd: 0.0001 }).reason).toBe('benchmark_cost_cap_exceeded');
    const bad = [{ ...BENCHMARK_FIXTURES[0], candidates: [['gpt-5.4-mini', 'low']] }];
    expect(benchmarkPreflight({ enabled: true, apiKey: 'key', fixtures: bad }).reason).toBe('benchmark_model_not_allowed');
  });

  test('builds Prompt-v2 once per fixture with public evidence separated from private input', () => {
    const fixture = BENCHMARK_FIXTURES.find((item) => item.fixtureId === 'refine-day-two');
    const first = promptForFixture(fixture);
    const second = promptForFixture(fixture);
    expect(first.prompt).toBe(second.prompt);
    expect(first.publicPrefix).not.toContain('PRIVATE TRIP STATE');
    expect(first.privateSuffix).toContain('PRIVATE TRIP STATE');
    expect(first.publicPrefix).toContain('PUBLIC EVIDENCE');
  });

  test('runs only the explicit injected OpenAI Responses client and returns sanitized records', async () => {
    const fixture = { ...BENCHMARK_FIXTURES[0], candidates: [['gpt-5.6-luna', 'low']] };
    const client = { responses: { create: jest.fn().mockImplementation(async (body) => fakeResponse(body)) } };
    const report = await runBenchmark({ client, fixtures: [fixture], maxCalls: 1, maxCostUsd: 1 });
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(report.callCount).toBe(1);
    expect(report.records[0]).toMatchObject({
      fixtureId: fixture.fixtureId, model: 'gpt-5.6-luna', reasoningEffort: 'low',
      evidenceAdherenceStatus: 'pass', factualityStatus: 'manual_review_required',
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(fixture.userRequest);
    expect(serialized).not.toContain('PRIVATE TRIP STATE');
    expect(serialized).not.toContain('Frozen benchmark fixture');
    expect(serialized).not.toContain('outputText');
  });

  test('aggregates pass, hard-failure, latency, cost, and token metrics by model/task class', () => {
    const summary = aggregateResults({ records: [{
      model: 'gpt-5.6-luna', intent: 'general_qa', validationStatus: 'pass',
      evidenceAdherenceStatus: 'pass', hardFailures: [], structuredOutputStatus: 'not_applicable',
      latencyMs: 100, costUsd: 0.001, promptTokens: 200, outputTokens: 20,
    }] });
    expect(summary).toEqual([expect.objectContaining({
      model: 'gpt-5.6-luna', taskClass: 'general_qa', passRate: 1,
      hardFailures: 0, averageLatencyMs: 100, costUsd: 0.001,
    })]);
  });
});
