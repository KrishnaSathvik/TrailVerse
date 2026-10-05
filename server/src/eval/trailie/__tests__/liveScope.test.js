'use strict';

/**
 * Stage 13.3 §7 — Trailie *eval* live spend is Claude-only.
 *
 * Product chat auto-routing is OpenAI GPT-5.6 (WP12 Phase 4). The live
 * evaluation matrix remains Claude-only so eval spend cannot silently
 * follow the product chat primary.
 */

const {
  liveGateStatus, resolveLiveEligibleMatrix, isolateClientsFor, runProviderIsolatedSmoke,
  PROVIDER_SCOPE,
} = require('../liveEvaluation');
const { autoRouteProvider } = require('../../../utils/trailieResponseMode');
const { CLAUDE_PRIMARY_MODEL } = require('../../../config/aiModels');

const CAP_ENV = [
  'TRAILIE_EVAL_LIVE_PROVIDERS', 'TRAILIE_EVAL_MAX_TOTAL_COST_USD', 'TRAILIE_EVAL_MAX_REQUESTS',
  'TRAILIE_EVAL_MAX_INPUT_TOKENS', 'TRAILIE_EVAL_MAX_OUTPUT_TOKENS', 'TRAILIE_EVAL_MODEL_ALLOWLIST',
  'TRAILIE_DEFAULT_PROVIDER', 'CLAUDE_PRIMARY_MODEL',
];
function setClaudeOnlyCaps(model = 'claude-sonnet-5') {
  process.env.TRAILIE_EVAL_LIVE_PROVIDERS = 'true';
  process.env.TRAILIE_EVAL_MAX_TOTAL_COST_USD = '2';
  process.env.TRAILIE_EVAL_MAX_REQUESTS = '80';
  process.env.TRAILIE_EVAL_MAX_INPUT_TOKENS = '400000';
  process.env.TRAILIE_EVAL_MAX_OUTPUT_TOKENS = '150000';
  process.env.TRAILIE_EVAL_MODEL_ALLOWLIST = `claude:${model}`;
}

describe('Stage 13.3 — Claude-only live scope', () => {
  const saved = {};
  beforeEach(() => { for (const k of CAP_ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of CAP_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('default Trailie product auto-routing resolves to OpenAI', () => {
    expect(autoRouteProvider()).toBe('openai');
  });

  it('the live-eligible matrix is exactly the resolved Claude production model', () => {
    const m = resolveLiveEligibleMatrix();
    expect(m).toHaveLength(1);
    expect(m[0].provider).toBe('claude');
    expect(m[0].model).toBe(CLAUDE_PRIMARY_MODEL); // env unset → production default
  });

  it('changing CLAUDE_PRIMARY_MODEL updates the resolved live model without editing the harness', () => {
    process.env.CLAUDE_PRIMARY_MODEL = 'claude-opus-4-8';
    expect(resolveLiveEligibleMatrix()[0].model).toBe('claude-opus-4-8');
  });

  it('a Claude-only smoke requires only the Anthropic client (OpenAI absence never blocks)', () => {
    setClaudeOnlyCaps();
    const g = liveGateStatus({ providerMatrix: resolveLiveEligibleMatrix(), clients: { anthropic: {}, openai: null }, phase: 'smoke' });
    expect(g.ok).toBe(true);
    // No reason may reference OpenAI client/key/pricing.
    expect(g.reasons.join(' ')).not.toMatch(/openai/i);
  });

  it('missing OpenAI pricing does not block a Claude-only run; only Claude pricing matters', () => {
    setClaudeOnlyCaps();
    process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__INPUT_PER_MTOK = '3';
    process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__OUTPUT_PER_MTOK = '15';
    try {
      const g = liveGateStatus({ providerMatrix: resolveLiveEligibleMatrix(), clients: { anthropic: {} }, phase: 'full' });
      expect(g.ok).toBe(true); // claude priced → full matrix allowed, OpenAI irrelevant
      expect(g.pricing.unpriced).not.toContain('gpt-5.4-mini');
      expect(g.reasons.join(' ')).not.toMatch(/openai/i);
    } finally {
      delete process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__INPUT_PER_MTOK;
      delete process.env.TRAILIE_PRICE__CLAUDE_SONNET_5__OUTPUT_PER_MTOK;
    }
  });

  it('client isolation forces the OpenAI client to null for a Claude run (zero OpenAI requests)', () => {
    const isolated = isolateClientsFor('claude', { anthropic: { id: 'A' }, openai: { id: 'O' } });
    expect(isolated.anthropic).toEqual({ id: 'A' });
    expect(isolated.openai).toBeNull();
  });

  it('a Claude-only provider-isolated smoke never receives an OpenAI client and does not autostart the matrix', async () => {
    // Spy OpenAI client that fails loudly if the pipeline ever touches it.
    const openaiSpy = new Proxy({}, { get() { throw new Error('OpenAI must not be called in a Claude-only smoke'); } });
    // No caps set → the isolated Claude run is refused (not fabricated) BEFORE any
    // provider call, but the key proof is that isolation dropped the OpenAI client.
    const report = await runProviderIsolatedSmoke({
      scenarios: [], providerMatrix: resolveLiveEligibleMatrix(), clients: { anthropic: {}, openai: openaiSpy },
    });
    expect(report.fullMatrixAutostart).toBe(false);
    expect(report.crossProviderFallbackAllowed).toBe(false);
    expect(report.perProvider).toHaveLength(1);
    expect(report.perProvider[0].provider).toBe('claude');
  });

  it('an OpenAI-only isolated smoke without an OpenAI client returns not_executed (client still required if ever configured)', async () => {
    setClaudeOnlyCaps();
    const report = await runProviderIsolatedSmoke({
      scenarios: [], providerMatrix: [{ provider: 'openai', model: 'gpt-5.4-mini' }], clients: { anthropic: {} },
    });
    expect(report.perProvider[0].status).toBe('not_executed');
    expect(report.perProvider[0].reasons.join(' ')).toMatch(/no configured live clients|not on allowlist/i);
  });

  it('exposes the exact production-scope statement and classification', () => {
    expect(PROVIDER_SCOPE.statement).toMatch(/Claude-only in the current production configuration/);
    expect(PROVIDER_SCOPE.productionLiveEligible).toEqual(['claude']);
    expect(PROVIDER_SCOPE.compatibilityTested).toEqual(['openai']);
    expect(PROVIDER_SCOPE.openaiPricingStatus).toBe('not_applicable_to_trailie_live_rollout');
  });
});
