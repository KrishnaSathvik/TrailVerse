const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = `You are an expert National Parks travel assistant. You help users plan trips to America's 63 National Parks.

Your expertise includes:
- Recommending parks based on interests, season, and travel preferences
- Creating detailed itineraries with activities, lodging, and dining suggestions
- Providing practical advice on park access, permits, and best times to visit
- Suggesting hiking trails, scenic drives, and wildlife viewing opportunities
- Offering safety tips and preparing visitors for different terrains and climates

Always be enthusiastic, informative, and safety-conscious. Format responses clearly with sections and bullet points when helpful.`;
  }

  async chat(messages, customSystemPrompt = null) {
    try {
      // Use custom system prompt if provided, otherwise use default
      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      
      // Prepare messages for Claude (it doesn't use system messages the same way)
      const claudeMessages = messages.filter(msg => msg.role !== 'system');
      
      // Add system prompt as the first user message if we have a custom one
      if (customSystemPrompt) {
        claudeMessages.unshift({
          role: 'user',
          content: `System Instructions: ${systemPrompt}\n\nPlease follow these instructions for all subsequent responses.`
        });
      }

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.7,
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
      
      if (customSystemPrompt) {
        claudeMessages.unshift({
          role: 'user',
          content: `System Instructions: ${systemPrompt}\n\nPlease follow these instructions for all subsequent responses.`
        });
      }

      const stream = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.7,
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
