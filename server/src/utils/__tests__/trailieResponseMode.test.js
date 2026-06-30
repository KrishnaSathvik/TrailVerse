const {
  resolveResponseMode,
  autoRouteProvider,
  getSystemPromptForMode,
} = require('../trailieResponseMode');

describe('trailieResponseMode', () => {
  test('autoRouteProvider defaults to Claude', () => {
    expect(autoRouteProvider()).toBe('claude');
  });

  test('resolveResponseMode returns architect for itinerary requests', () => {
    const mode = resolveResponseMode(
      [{ role: 'user', content: 'Create a 2-day itinerary for Zion for beginners with kids' }],
      {}
    );
    expect(mode).toBe('architect');
  });

  test('resolveResponseMode returns compare for head-to-head questions', () => {
    const mode = resolveResponseMode(
      [{ role: 'user', content: 'Zion vs Bryce for beginners in July?' }],
      {}
    );
    expect(mode).toBe('compare');
  });

  test('resolveResponseMode returns buddy for general questions', () => {
    const mode = resolveResponseMode(
      [{ role: 'user', content: 'Is Angels Landing okay for beginners?' }],
      {}
    );
    expect(mode).toBe('buddy');
  });

  test('resolveResponseMode returns architect for zion couple demo prompt', () => {
    const mode = resolveResponseMode(
      [{
        role: 'user',
        content:
          'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
      }],
      { skipUserContext: true }
    );
    expect(mode).toBe('architect');
  });

  test('resolveResponseMode returns architect for Valley of Fire weekend', () => {
    const mode = resolveResponseMode(
      [{
        role: 'user',
        content:
          'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
      }],
      { skipUserContext: true }
    );
    expect(mode).toBe('architect');
  });

  test('resolveResponseMode returns compare for yosemite vs sequoia demo', () => {
    const mode = resolveResponseMode(
      [{
        role: 'user',
        content:
          'I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds?',
      }],
      { skipUserContext: true }
    );
    expect(mode).toBe('compare');
  });

  test('metadata.responseMode overrides auto detection', () => {
    const mode = resolveResponseMode(
      [{ role: 'user', content: 'Plan 2 days in Zion' }],
      { responseMode: 'buddy' }
    );
    expect(mode).toBe('buddy');
  });

  test('architect mode uses openai architect prompt regardless of provider', () => {
    const claudeService = { defaultSystemPrompt: 'buddy-prompt' };
    const openaiService = { systemPrompt: 'architect-prompt' };
    expect(getSystemPromptForMode('architect', { claudeService, openaiService })).toBe(
      'architect-prompt'
    );
  });
});
