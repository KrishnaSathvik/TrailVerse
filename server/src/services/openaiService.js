const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class OpenAIService {
  constructor() {
    this.systemPrompt = `You are TrailVerse AI, an expert National Parks travel assistant with deep knowledge of America's 63 National Parks. You're passionate about helping people discover the natural wonders of the United States.

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
      const systemPrompt = customSystemPrompt || this.systemPrompt;
      
      // Add system message if not present
      const messagesWithSystem = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: messagesWithSystem,
        temperature: 0.7,
        max_tokens: 2000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to get AI response');
    }
  }

  async streamChat(messages, onChunk) {
    try {
      const messagesWithSystem = [
        { role: 'system', content: this.systemPrompt },
        ...messages
      ];

      const stream = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: messagesWithSystem,
        temperature: 0.7,
        max_tokens: 1000,
        stream: true
      });

      let fullResponse = '';
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        if (onChunk) onChunk(content);
      }

      return fullResponse;
    } catch (error) {
      console.error('OpenAI Stream Error:', error);
      throw new Error('Failed to stream AI response');
    }
  }
}

module.exports = new OpenAIService();
