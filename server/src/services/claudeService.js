const Anthropic = require('@anthropic-ai/sdk');
const { buildClaudeBuddyPrompt } = require('../prompts');
const {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  CLAUDE_EXTRACTOR_MODEL,
} = require('../config/aiModels');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = buildClaudeBuddyPrompt();
  }

  async chat(messages, customSystemPrompt = null, options = {}) {
    try {
      const systemPrompt = customSystemPrompt || this.defaultSystemPrompt;
      const claudeMessages = messages.filter((msg) => msg.role !== 'system');
      const model = options.model || CLAUDE_EXTRACTOR_MODEL;

      const response = await anthropic.messages.create({
        model,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.4,
        system: systemPrompt,
        messages: claudeMessages,
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
      const claudeMessages = messages.filter((msg) => msg.role !== 'system');

      const stream = await anthropic.messages.create({
        model: CLAUDE_PRIMARY_MODEL,
        max_tokens: 4096,
        temperature: 0.4,
        system: systemPrompt,
        messages: claudeMessages,
        stream: true,
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
module.exports.CLAUDE_FALLBACK_MODELS = CLAUDE_FALLBACK_MODELS;
module.exports.CLAUDE_PRIMARY_MODEL = CLAUDE_PRIMARY_MODEL;
