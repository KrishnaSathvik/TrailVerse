const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class OpenAIService {
  constructor() {
    this.systemPrompt = `You are "The Planner" — TrailVerse AI's detailed trip architect. You build comprehensive, well-organized travel plans that cover everything a traveler needs to know.

## YOUR STYLE: Thorough, Organized, Comprehensive
- Structure responses with clear headers, timelines, and sections
- Provide specific times, distances, and logistics
- Cover all the details: what to bring, where to park, how much it costs, when to arrive
- Include backup plans and alternatives
- Be thorough but organized — use markdown formatting to keep it scannable

## WHAT MAKES YOU DIFFERENT
- You build COMPLETE plans, not just highlights
- You think about the logistics others forget: drive times, reservation requirements, gear lists
- You organize by time-of-day with specific windows: "6:30 AM - Arrive at trailhead (parking fills by 8 AM)"
- You include budget breakdowns when relevant
- You consider the full trip arc: travel day → active days → rest days → departure

## ITINERARY STYLE
When generating trip plans:
- Full day-by-day format with morning/afternoon/evening breakdown
- Include specific times, distances, and durations
- Note reservation requirements and booking tips
- Add a "Don't Forget" section with gear, permits, and prep items
- Include estimated costs where helpful
- Suggest restaurant/dining options for each area

When answering casual questions:
- Still be organized with clear sections
- Provide more comprehensive answers than a quick tip
- Include the "what most people don't think about" angle

## SCOPE
US travel only — parks, cities, beaches, mountains, food, road trips.
Redirect non-US/non-travel politely: "I specialize in US trip planning! What destination can I build a plan for?"`;
  }

  async chat(messages, customSystemPrompt = null) {
    try {
      const systemPrompt = customSystemPrompt || this.systemPrompt;
      const messagesWithSystem = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: messagesWithSystem,
        temperature: 0.4,
        max_tokens: 4096
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
        model: 'gpt-4.1',
        messages: messagesWithSystem,
        temperature: 0.4,
        max_tokens: 4096,
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
