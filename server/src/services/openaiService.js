const OpenAI = require('openai');
const { assertLiveProviderAllowed } = require('../config/providerTestPolicy');
const { buildOpenAIArchitectPrompt } = require('../prompts');
const {
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
} = require('../config/aiModels');

/**
 * Stage 14.7C §1 — LAZY client construction.
 *
 * This was previously `new OpenAI({...})` at module scope, which throws when
 * OPENAI_API_KEY is absent. Because this module sits in the AI router's import
 * graph, that made the whole router unimportable without an OpenAI key — even
 * for Claude-only requests that never touch OpenAI at all.
 *
 * The client is now built on first use and memoized per key, so:
 *   import without a key            → succeeds
 *   Claude-only path                → never constructs a client
 *   OpenAI path without a key       → bounded `openai_not_configured` at INVOCATION
 *
 * The constructor is injectable so tests can assert construction without any
 * network access.
 */
const OPENAI_NOT_CONFIGURED = 'openai_not_configured';

let cachedClient = null;
let cachedKey = null;
let ClientConstructor = OpenAI;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Bounded code only — never the key, the env, or the SDK's own message.
    const err = new Error(OPENAI_NOT_CONFIGURED);
    err.code = OPENAI_NOT_CONFIGURED;
    throw err;
  }
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  assertLiveProviderAllowed({
    provider: 'openai', phase: 'constructor', synthetic: ClientConstructor !== OpenAI,
  });
  cachedClient = new ClientConstructor({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

/** Test seam: inject a constructor and reset memoization. No network involved. */
function __setOpenAIClientConstructorForTests(ctor) {
  ClientConstructor = ctor || OpenAI;
  cachedClient = null;
  cachedKey = null;
}

class OpenAIService {
  constructor() {
    this.systemPrompt = buildOpenAIArchitectPrompt();
  }

  async chat(messages, customSystemPrompt = null, requestOptions = {}) {
    try {
      const systemPrompt = customSystemPrompt || this.systemPrompt;
      const messagesWithSystem = [{ role: 'system', content: systemPrompt }, ...messages];

      let lastError = null;

      for (const modelId of OPENAI_FALLBACK_MODELS) {
        try {
          assertLiveProviderAllowed({
            provider: 'openai', phase: 'dispatch', synthetic: ClientConstructor !== OpenAI,
          });
          const response = await getOpenAIClient().chat.completions.create({
            model: modelId,
            messages: messagesWithSystem,
            temperature: 0.4,
            max_completion_tokens: 4096,
          }, requestOptions);
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
      assertLiveProviderAllowed({
        provider: 'openai', phase: 'dispatch', synthetic: ClientConstructor !== OpenAI,
      });
      const messagesWithSystem = [{ role: 'system', content: this.systemPrompt }, ...messages];

      const stream = await getOpenAIClient().chat.completions.create({
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

const openAIServiceInstance = new OpenAIService();

// Default export unchanged (the singleton) so every existing caller is untouched.
module.exports = openAIServiceInstance;
// Stage 14.7C seams, attached rather than replacing the export shape.
module.exports.getOpenAIClient = getOpenAIClient;
module.exports.OPENAI_NOT_CONFIGURED = OPENAI_NOT_CONFIGURED;
module.exports.__setOpenAIClientConstructorForTests = __setOpenAIClientConstructorForTests;
