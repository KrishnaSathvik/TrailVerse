const OpenAI = require('openai');
const { buildOpenAIArchitectPrompt } = require('../prompts');
const {
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
} = require('../config/aiModels');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.systemPrompt = buildOpenAIArchitectPrompt();
  }

  async chat(messages, customSystemPrompt = null) {
    try {
      const systemPrompt = customSystemPrompt || this.systemPrompt;
      const messagesWithSystem = [{ role: 'system', content: systemPrompt }, ...messages];

      let lastError = null;

      for (const modelId of OPENAI_FALLBACK_MODELS) {
        try {
          const response = await openai.chat.completions.create({
            model: modelId,
            messages: messagesWithSystem,
            temperature: 0.4,
            max_completion_tokens: 4096,
          });
          return response.choices[0].message.content;
        } catch (err) {
          lastError = err;
          if (err.status === 404 || err.code === 'model_not_found') {
            console.warn(`[OpenAI] Model ${modelId} not found, trying next...`);
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error('Failed to get AI response');
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to get AI response');
    }
  }

  async streamChat(messages, onChunk) {
    try {
      const messagesWithSystem = [{ role: 'system', content: this.systemPrompt }, ...messages];

      const stream = await openai.chat.completions.create({
        model: OPENAI_PRIMARY_MODEL,
        messages: messagesWithSystem,
        temperature: 0.4,
        max_completion_tokens: 4096,
        stream: true,
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
