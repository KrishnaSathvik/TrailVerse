const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class OpenAIService {
  constructor() {
    this.systemPrompt = `You are an expert National Parks travel assistant. You help users plan trips to America's 63 National Parks.

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
