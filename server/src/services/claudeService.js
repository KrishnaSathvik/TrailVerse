const Anthropic = require('@anthropic-ai/sdk');
const { assertLiveProviderAllowed } = require('../config/providerTestPolicy');
const {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  CLAUDE_EXTRACTOR_MODEL,
} = require('../config/aiModels');

/** Minimal default when callers do not supply a system prompt (not product-chat Trailie). */
const DEFAULT_CLAUDE_SYSTEM = 'You are a careful assistant. Follow the user instructions exactly.';

/**
 * Anthropic is built lazily, matching the OpenAI (14.7C), NPS (14.7D1) and
 * Resend (14.7D2) accessors.
 *
 * The defect this replaces: `new Anthropic({...})` ran at module scope, so
 * merely importing this service built a live SDK client — even for a
 * deterministic evaluation run that must never construct one. The SDK does not
 * throw on a missing key, so this was invisible until the Stage 14.7D2
 * constructor probe counted it.
 */
const ANTHROPIC_NOT_CONFIGURED = 'anthropic_not_configured';

let cachedAnthropic = null;
let cachedApiKey = null;
let AnthropicCtor = Anthropic;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    cachedAnthropic = null;
    cachedApiKey = null;
    const error = new Error(ANTHROPIC_NOT_CONFIGURED);
    error.code = ANTHROPIC_NOT_CONFIGURED;
    throw error;
  }
  if (cachedAnthropic && cachedApiKey === apiKey) return cachedAnthropic;

  let created;
  try {
    assertLiveProviderAllowed({
      provider: 'claude', phase: 'constructor', synthetic: AnthropicCtor !== Anthropic,
    });
    created = new AnthropicCtor({ apiKey });
  } catch (error) {
    cachedAnthropic = null;
    cachedApiKey = null;
    const bounded = new Error(ANTHROPIC_NOT_CONFIGURED);
    bounded.code = ANTHROPIC_NOT_CONFIGURED;
    throw bounded;
  }
  cachedAnthropic = created;
  cachedApiKey = apiKey;
  return cachedAnthropic;
}

/** Deterministic-evaluation seam: inject a recorded provider, or prohibit one. */
function __setAnthropicConstructorForTests(ctor) {
  AnthropicCtor = ctor || Anthropic;
  cachedAnthropic = null;
  cachedApiKey = null;
}

// Preserves the existing `anthropic.messages.create(...)` call sites while
// deferring construction to first use.
const anthropic = {
  get messages() {
    const client = getAnthropicClient();
    assertLiveProviderAllowed({
      provider: 'claude', phase: 'dispatch', synthetic: AnthropicCtor !== Anthropic,
    });
    return client.messages;
  }
};

class ClaudeService {
  constructor() {
    this.defaultSystemPrompt = DEFAULT_CLAUDE_SYSTEM;
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
module.exports.getAnthropicClient = getAnthropicClient;
module.exports.ANTHROPIC_NOT_CONFIGURED = ANTHROPIC_NOT_CONFIGURED;
module.exports.__setAnthropicConstructorForTests = __setAnthropicConstructorForTests;
