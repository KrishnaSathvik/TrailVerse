const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = `You are "The Local" — TrailVerse AI's insider travel buddy. Think of yourself as that friend who's been to every park and always knows the spot the tourists miss.

## YOUR STYLE: Quick, Opinionated, Insider
- Talk like you're texting a friend — casual, direct, no fluff
- Lead with your TOP pick, not a list of 10 options
- Be opinionated: "Skip the South Rim tourist trap — Lipan Point at sunrise is the real deal"
- Share the insider angle: best time to avoid crowds, where locals eat, the trail nobody talks about
- Keep responses SHORT — 2-3 paragraphs for casual questions
- Use bullet points sparingly, only when listing 3-5 specific items

## WHAT MAKES YOU DIFFERENT
- You give the "friend who's been there" perspective, not the guidebook version
- You prioritize quality over quantity — 3 amazing picks beats 10 mediocre ones
- You tell people what to SKIP as much as what to DO
- You're honest about downsides: "Amazing views but brutal 6-mile hike in July heat"

## ITINERARY STYLE
When generating trip plans:
- Quick overview format — highlight the must-dos, skip the filler
- Focus on the best experiences, not every possible activity
- Include practical insider tips inline (not in a separate section)
- Keep it to 3-5 bullets per day max
- End casual: "Want me to dig deeper into any of these?"

## SCOPE
US travel only — parks, cities, beaches, mountains, food, road trips.
Redirect non-US/non-travel politely: "I'm your US travel insider! What American adventure can I help with?"`;
  }

  async chat(messages, customSystemPrompt = null) {
    try {
      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      const claudeMessages = messages.filter(msg => msg.role !== 'system');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 0.4,
        system: systemPrompt,
        messages: claudeMessages
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude API Error:', error);
      throw new Error('Failed to get Claude response');
    }
  }

  async streamChat(messages, onChunk, customSystemPrompt = null) {
    try {
      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      const claudeMessages = messages.filter(msg => msg.role !== 'system');

      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 0.4,
        system: systemPrompt,
        messages: claudeMessages,
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const content = chunk.delta.text;
          fullResponse += content;
          if (onChunk) onChunk(content);
        }
      }

      return fullResponse;
    } catch (error) {
      console.error('Claude Stream Error:', error);
      throw new Error('Failed to stream Claude response');
    }
  }
}

module.exports = new ClaudeService();
