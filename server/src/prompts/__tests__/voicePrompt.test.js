const {
  TRAILIE_VOICE_INSTRUCTIONS,
  PROMPT_INJECTION_DEFENSE,
  ABOUT_TRAILIE_VOICE,
} = require('..');

describe('TRAILIE_VOICE_INSTRUCTIONS (final trimmed)', () => {
  const prompt = TRAILIE_VOICE_INSTRUCTIONS;

  test('keeps shared injection defense and voice about-block', () => {
    expect(prompt).toContain(PROMPT_INJECTION_DEFENSE);
    expect(prompt).toContain(ABOUT_TRAILIE_VOICE);
  });

  test('preserves the four registered voice tools', () => {
    expect(prompt).toContain('get_park_details');
    expect(prompt).toContain('search_parks');
    expect(prompt).toContain('compare_parks');
    expect(prompt).toContain('find_events');
  });

  test('enforces silent startup until the visitor speaks', () => {
    expect(prompt).toMatch(/STARTUP/);
    expect(prompt).toMatch(/Remain completely silent/i);
    expect(prompt).toMatch(/Do not greet/i);
  });

  test('keeps tool calls silent without spoken filler', () => {
    expect(prompt).toMatch(/Call tools silently/i);
    expect(prompt).toMatch(/hang tight/i);
    expect(prompt).toMatch(/let me check/i);
    expect(prompt).not.toMatch(/brief spoken update before/i);
    expect(prompt).not.toMatch(/say something short while waiting/i);
  });

  test('does not promise barge-in as if it were always on', () => {
    expect(prompt).toMatch(/If the session supports interruption/i);
    expect(prompt).not.toMatch(/Always stop speaking immediately when interrupted/i);
    expect(prompt).not.toMatch(/Users can interrupt you at any time/i);
  });

  test('uses task-appropriate length and spoken formatting', () => {
    expect(prompt).toMatch(/1–3 natural sentences/i);
    expect(prompt).toMatch(/Never omit important safety information/i);
    expect(prompt).toMatch(/Do not produce markdown/i);
    expect(prompt).not.toMatch(/2–4 sentences max\. That's it\. No exceptions/i);
    expect(prompt).not.toMatch(/Park details: weather \+ 1 key alert \+ fee/i);
  });

  test('answers AI identity questions transparently', () => {
    expect(prompt).toMatch(/Yes, I'm Trailie/i);
    expect(ABOUT_TRAILIE_VOICE).toMatch(/AI travel companion/i);
  });

  test('comparisons explain trade-offs rather than forcing a winner', () => {
    expect(prompt).toMatch(/Explain meaningful differences/i);
    expect(prompt).toMatch(/rather than declaring an\s+automatic winner/i);
  });

  test('requires freshness for live conditions and blocks invented facts', () => {
    expect(prompt).toMatch(/sufficiently fresh/i);
    expect(prompt).toMatch(/Do not invent current weather/i);
    expect(prompt).toMatch(/drive times/i);
  });

  test('blocks unsupported foreign itineraries and booking claims', () => {
    expect(prompt).toMatch(/unsupported international trip plans/i);
    expect(prompt).toMatch(/You cannot book/i);
    expect(prompt).toMatch(/Do not claim to create, save, edit, or retrieve a trip/i);
  });

  test('handles unclear audio and emergencies', () => {
    expect(prompt).toMatch(/ask one short clarification/i);
    expect(prompt).toMatch(/call 911/i);
    expect(prompt).toMatch(/cannot place emergency calls/i);
  });

  test('preserves multi-turn continuity', () => {
    expect(prompt).toMatch(/CONVERSATION CONTINUITY/i);
    expect(prompt).toMatch(/without forcing repetition/i);
  });
});
