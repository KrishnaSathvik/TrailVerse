const {
  buildOpenAIArchitectPrompt,
  buildClaudeBuddyPrompt,
  TRAILIE_VOICE_INSTRUCTIONS,
  PROMPT_INJECTION_DEFENSE,
  STRUCTURED_CONTEXT_RULES,
  BACKEND_CONTEXT_RESPECT,
  ABOUT_TRAILIE,
  ABOUT_TRAILIE_VOICE,
} = require('..');

describe('Trailie prompts module', () => {
  test('OpenAI architect prompt preserves key behavior markers', () => {
    const prompt = buildOpenAIArchitectPrompt();
    expect(prompt).toContain('detailed trip architect');
    expect(prompt).toContain('morning/afternoon/evening breakdowns');
    expect(prompt).toContain('**Recommendation: [X]**');
    expect(prompt).toContain('[ITINERARY_JSON]');
    expect(prompt).toContain(PROMPT_INJECTION_DEFENSE);
    expect(prompt).toContain(STRUCTURED_CONTEXT_RULES);
    expect(prompt).toContain(BACKEND_CONTEXT_RESPECT);
  });

  test('Claude buddy prompt preserves key behavior markers', () => {
    const prompt = buildClaudeBuddyPrompt();
    expect(prompt).toContain('insider travel buddy');
    expect(prompt).toContain('NEVER generate morning/afternoon/evening breakdowns');
    expect(prompt).toContain('Go with [X] because');
    expect(prompt).toContain('[ITINERARY_JSON]');
    expect(prompt).toContain(PROMPT_INJECTION_DEFENSE);
  });

  test('voice prompt preserves tool routing and injection defense', () => {
    expect(TRAILIE_VOICE_INSTRUCTIONS).toContain('search_parks');
    expect(TRAILIE_VOICE_INSTRUCTIONS).toContain('get_park_details');
    expect(TRAILIE_VOICE_INSTRUCTIONS).toContain('STARTUP RULE');
    expect(TRAILIE_VOICE_INSTRUCTIONS).toContain(ABOUT_TRAILIE_VOICE);
    expect(TRAILIE_VOICE_INSTRUCTIONS).toContain(PROMPT_INJECTION_DEFENSE);
  });

  test('chat prompts include shared about-Trailie meta guidance', () => {
    expect(ABOUT_TRAILIE).toContain('470+ National Park Service sites');
    expect(ABOUT_TRAILIE).toContain('not off-topic');
    expect(buildOpenAIArchitectPrompt()).toContain('ABOUT TRAILIE — META QUESTIONS');
    expect(buildClaudeBuddyPrompt()).toContain('ABOUT TRAILIE — META QUESTIONS');
  });

  test('shared crowd calendar is present in both chat prompts', () => {
    expect(buildOpenAIArchitectPrompt()).toContain('CROWD CALENDAR & VISITATION REFERENCE');
    expect(buildClaudeBuddyPrompt()).toContain('CROWD CALENDAR & VISITATION REFERENCE');
  });
});
