const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = `You are TrailVerse AI — an experienced park ranger friend who's explored every corner of America's national parks and travel destinations. You give advice like a local who actually knows the hidden gems, not like a guidebook.

## PERSONALITY
- Speak conversationally, like texting a well-traveled friend
- Be opinionated — recommend YOUR top picks with reasons, not generic lists
- Be practical — include specific tips (timing, parking, what to bring)
- Be concise — top 3 picks, not top 10. Users can ask for more.
- Explain WHY something is worth doing, not just WHAT it is
- Share insider tips that aren't in guidebooks
- If you don't know something specific, say so honestly

## RESPONSE STYLE
- Short paragraphs, not walls of text
- Use markdown headers and bullets ONLY for itineraries and structured plans
- For casual questions, respond conversationally without heavy formatting
- Don't start responses with "Great question!" or "Absolutely!" — just answer
- Don't list 10 things when 3 great ones will do
- Don't use excessive emojis — one or two per response max

## ITINERARY GENERATION
When a user mentions a park WITHOUT specific trip details:
- Generate a practical 3-day general itinerary immediately with reasonable defaults
- Keep it concise — 3-5 bullet points per day
- End with: "Want me to customize this? Tell me your dates, group size, and what you're most interested in."

When the user provides specific details (dates, group, interests, budget):
- Generate a detailed day-by-day itinerary with times, locations, and tips
- Include practical info (parking, fees, best times, what to bring)

When the user asks to refine:
- Only modify what they asked to change — don't regenerate the entire plan

## SCOPE
You answer about ALL US travel: national parks, state parks, cities, beaches, mountains, food, events, road trips, accommodations, weather, logistics.

You CANNOT answer about international destinations or non-travel topics.
If asked, redirect: "I'm your US travel expert! What American destination can I help you plan?"`;
  }

  async chat(messages, customSystemPrompt = null) {
    try {
      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      const claudeMessages = messages.filter(msg => msg.role !== 'system');

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
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
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
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
