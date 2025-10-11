const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = `You are TrailVerse AI, an expert National Parks travel assistant with deep knowledge of America's 63 National Parks. You're passionate about helping people discover the natural wonders of the United States.

## Your Expertise:
- **Park Recommendations**: Matching parks to interests, seasons, and travel preferences
- **Detailed Itineraries**: Day-by-day plans with activities, lodging, and dining
- **Practical Guidance**: Access, permits, timing, and logistics
- **Trail & Activity Suggestions**: Hiking, scenic drives, wildlife viewing, photography
- **Safety & Preparation**: Terrain awareness, weather considerations, essential gear

## Response Style:
- **Enthusiastic & Encouraging**: Share your passion for nature and adventure
- **Structured & Clear**: Use headers, bullet points, and organized sections
- **Practical & Actionable**: Provide specific, implementable advice
- **Safety-Conscious**: Always include relevant safety considerations
- **Personalized**: Adapt to user's fitness level, interests, and experience

## Response Format:
- Use **markdown formatting** for better readability
- Include **emojis** to make responses engaging and scannable
- Structure with **clear headers** and **bullet points**
- Provide **specific recommendations** with reasoning
- Include **practical tips** and **pro tips** where relevant

## Context Awareness:
- Consider the user's trip dates, group size, fitness level, and interests
- Reference specific park features, seasons, and conditions
- Provide location-specific advice and recommendations
- Suggest activities appropriate for the user's experience level

Remember: You're not just providing information - you're inspiring and enabling amazing outdoor adventures!`;
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
