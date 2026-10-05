'use strict';

const { liveGateStatus, firstBindingCap, runLiveMatrix, runLiveSmoke } = require('../liveEvaluation');

const MATRIX = [
  { provider: 'claude', model: 'claude-sonnet-5' },
  { provider: 'openai', model: 'gpt-x' },
];
const CLIENTS = { anthropic: {}, openai: {} };

const CAP_ENV = [
  'TRAILIE_EVAL_LIVE_PROVIDERS', 'TRAILIE_EVAL_MAX_TOTAL_COST_USD', 'TRAILIE_EVAL_MAX_REQUESTS',
  'TRAILIE_EVAL_MAX_INPUT_TOKENS', 'TRAILIE_EVAL_MAX_OUTPUT_TOKENS', 'TRAILIE_EVAL_MODEL_ALLOWLIST',
  'TRAILIE_PRICE__CLAUDE_SONNET_5__INPUT_PER_MTOK', 'TRAILIE_PRICE__CLAUDE_SONNET_5__OUTPUT_PER_MTOK',
  'TRAILIE_PRICE__GPT_X__INPUT_PER_MTOK', 'TRAILIE_PRICE__GPT_X__OUTPUT_PER_MTOK',
];

function clearEnv() { for (const k of CAP_ENV) delete process.env[k]; }
function setAllCaps() {
  process.env.TRAILIE_EVAL_LIVE_PROVIDERS = 'true';
  process.env.TRAILIE_EVAL_MAX_TOTAL_COST_USD = '5';
  process.env.TRAILIE_EVAL_MAX_REQUESTS = '100';
  process.env.TRAILIE_EVAL_MAX_INPUT_TOKENS = '100000';
  process.env.TRAILIE_EVAL_MAX_OUTPUT_TOKENS = '50000';
  process.env.TRAILIE_EVAL_MODEL_ALLOWLIST = 'claude-sonnet-5,openai:gpt-x';
}
function priceAll() {
  process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__INPUT_PER_MTOK = '3';
  process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__OUTPUT_PER_MTOK = '15';
  process.env.TRAILIE_PRICE__GPT_X__INPUT_PER_MTOK = '2';
  process.env.TRAILIE_PRICE__GPT_X__OUTPUT_PER_MTOK = '8';
}

describe('Stage 13.2 §2 — live-evaluation cost safety', () => {
  const saved = {};
  beforeEach(() => { for (const k of CAP_ENV) saved[k] = process.env[k]; clearEnv(); });
  afterEach(() => { for (const k of CAP_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('refuses a live run when any of the required caps is unset', () => {
    process.env.TRAILIE_EVAL_LIVE_PROVIDERS = 'true';
    const g = liveGateStatus({ providerMatrix: MATRIX, clients: CLIENTS, phase: 'smoke' });
    expect(g.ok).toBe(false);
    expect(g.reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/MAX_TOTAL_COST_USD unset/),
      expect.stringMatching(/MAX_REQUESTS unset/),
      expect.stringMatching(/MAX_INPUT_TOKENS unset/),
      expect.stringMatching(/MAX_OUTPUT_TOKENS unset/),
      expect.stringMatching(/MODEL_ALLOWLIST unset/),
    ]));
  });

  it('refuses a model that is not on the explicit allowlist', () => {
    setAllCaps();
    process.env.TRAILIE_EVAL_MODEL_ALLOWLIST = 'claude-sonnet-5'; // gpt-x omitted
    const g = liveGateStatus({ providerMatrix: MATRIX, clients: CLIENTS, phase: 'smoke' });
    expect(g.ok).toBe(false);
    expect(g.reasons.some((r) => /not on allowlist: openai:gpt-x/.test(r))).toBe(true);
  });

  it('permits a SMOKE with an unpriced model but keeps the cost gate not_passed', () => {
    setAllCaps(); // no env price table configured
    const g = liveGateStatus({ providerMatrix: MATRIX, clients: CLIENTS, phase: 'smoke' });
    expect(g.ok).toBe(true);
    // claude-sonnet-5 is now priced via the versioned config; gpt-x remains unpriced,
    // so the matrix still resolves to smoke-only with the cost gate not passed.
    expect(g.pricingMode).toBe('unknown_pricing_smoke_only');
    expect(g.costRolloutGate).toBe('not_passed');
    expect(g.pricing.unpriced).toContain('gpt-x');
    expect(g.pricing.unpriced).not.toContain('claude-sonnet-5');
  });

  it('REFUSES the full repetition matrix with unknown pricing', () => {
    setAllCaps();
    const g = liveGateStatus({ providerMatrix: MATRIX, clients: CLIENTS, phase: 'full' });
    expect(g.ok).toBe(false);
    expect(g.reasons.some((r) => /full repetition matrix refused: unknown pricing/.test(r))).toBe(true);
  });

  it('allows the full matrix once every model is priced (cost gate eligible)', () => {
    setAllCaps(); priceAll();
    const g = liveGateStatus({ providerMatrix: MATRIX, clients: CLIENTS, phase: 'full' });
    expect(g.ok).toBe(true);
    expect(g.pricingMode).toBe('known_pricing');
    expect(g.costRolloutGate).toBe('passed_eligible');
  });

  it('runLiveMatrix returns not_executed (never fabricates) when the gate fails', async () => {
    setAllCaps(); // unknown pricing → full refused
    const report = await runLiveMatrix({ scenarios: [], providerMatrix: MATRIX, clients: CLIENTS });
    expect(report.status).toBe('not_executed');
    expect(report.phase).toBe('full');
  });

  it('runLiveSmoke returns not_executed with exact reasons when caps are missing', async () => {
    process.env.TRAILIE_EVAL_LIVE_PROVIDERS = 'true';
    const report = await runLiveSmoke({ scenarios: [], providerMatrix: MATRIX, clients: CLIENTS });
    expect(report.status).toBe('not_executed');
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  describe('firstBindingCap — stops BEFORE the next request when a cap is met', () => {
    const caps = { maxCostUsd: 5, maxRequests: 10, maxInputTokens: 1000, maxOutputTokens: 500 };
    it('returns null when all totals are under caps', () => {
      expect(firstBindingCap({ requests: 3, inputTokens: 100, outputTokens: 50, costUsd: 1, costKnown: true }, caps, null)).toBeNull();
    });
    it('binds on requests', () => {
      expect(firstBindingCap({ requests: 10, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true }, caps, null)).toBe('max_requests');
    });
    it('binds on input tokens', () => {
      expect(firstBindingCap({ requests: 0, inputTokens: 1000, outputTokens: 0, costUsd: 0, costKnown: true }, caps, null)).toBe('max_input_tokens');
    });
    it('binds on output tokens', () => {
      expect(firstBindingCap({ requests: 0, inputTokens: 0, outputTokens: 500, costUsd: 0, costKnown: true }, caps, null)).toBe('max_output_tokens');
    });
    it('only binds on cost when cost is KNOWN', () => {
      expect(firstBindingCap({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 99, costKnown: false }, caps, null)).toBeNull();
      expect(firstBindingCap({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 99, costKnown: true }, caps, null)).toBe('max_total_cost_usd');
    });
    it('respects the smoke hard request ceiling', () => {
      expect(firstBindingCap({ requests: 64, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true }, caps, 64)).toBe('smoke_hard_request_ceiling');
    });
  });
});
