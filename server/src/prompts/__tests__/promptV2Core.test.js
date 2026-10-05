const {
  PROMPT_TOKENIZER_ID,
  countPromptTokens,
} = require('../../utils/promptTokenAccounting');
const {
  CORE_POLICY_ID,
  TRAILIE_CORE_POLICY_V2,
} = require('../trailieCorePolicyV2');
const {
  TASK_CONTRACT_NAMES,
  getTaskContractV2,
} = require('../trailieTaskContractsV2');

describe('WP7 prompt-v2 core and task contracts', () => {
  test('uses a versioned deterministic tokenizer and keeps the stable core bounded', () => {
    expect(PROMPT_TOKENIZER_ID).toBe('trailie_prompt_token_v1');
    expect(CORE_POLICY_ID).toBe('trailie-core-policy-v2');
    expect(countPromptTokens(TRAILIE_CORE_POLICY_V2)).toBeLessThanOrEqual(2200);
  });

  test('the core contains universal evidence, safety, state, and answer rules only', () => {
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/owning-agency/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/do not invent.*live|never invent.*live/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/TripState/);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/unsupported operational claim/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/answer.*request/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/travel companion/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/do not advertise being an AI/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/explicitly asks whether you are AI/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/better decision for this trip/i);
    expect(TRAILIE_CORE_POLICY_V2).toMatch(/you decide explanation/i);

    expect(TRAILIE_CORE_POLICY_V2).not.toMatch(/pick a winner/i);
    expect(TRAILIE_CORE_POLICY_V2).not.toMatch(/extract only/i);
    expect(TRAILIE_CORE_POLICY_V2).not.toMatch(/repair only/i);
  });

  test('exposes the six requested small contracts without copying the core', () => {
    expect(TASK_CONTRACT_NAMES).toEqual([
      'buddy',
      'compare',
      'architect',
      'live',
      'extractor',
      'repair',
    ]);

    for (const name of TASK_CONTRACT_NAMES) {
      const contract = getTaskContractV2(name);
      expect(contract.id).toBe(`trailie-task-${name}-v2`);
      expect(countPromptTokens(contract.text)).toBeLessThanOrEqual(800);
      expect(contract.text).not.toContain(CORE_POLICY_ID);
      expect(contract.text).not.toMatch(/owning-agency evidence outranks/i);
    }
  });

  test.each([
    ['buddy', /direct.*concise/i],
    ['compare', /pick a winner|recommend.*winner/i],
    ['architect', /itinerary.*constraints|constraints.*itinerary/i],
    ['live', /current.*zero-stale|zero-stale.*current/i],
    ['extractor', /extract only/i],
    ['repair', /change only.*violat|repair only.*violat/i],
  ])('%s contract contains its mode-specific behavior', (name, expected) => {
    expect(getTaskContractV2(name).text).toMatch(expected);
  });

  test('rejects unknown modes instead of silently widening behavior', () => {
    expect(() => getTaskContractV2('reviewer')).toThrow(
      expect.objectContaining({ code: 'prompt_v2_contract_unknown' })
    );
  });
});
