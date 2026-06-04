/**
 * Small, fast LLM calls for web-search digest + category refine.
 * Prefers Claude (same family as Trailie chat); falls back to OpenAI if needed.
 */
const TRAILIE_LITE_TIMEOUT_MS = Number(process.env.TRAILIE_LITE_TIMEOUT_MS || 5000);

let anthropic = null;
let openai = null;

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TRAILIE_LITE_TIMEOUT_MS,
    });
  }
  return anthropic;
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: TRAILIE_LITE_TIMEOUT_MS,
    });
  }
  return openai;
}

/**
 * @param {{ system: string, user: string, maxTokens?: number }} params
 * @returns {Promise<{ text: string|null, provider: 'claude'|'openai'|null }>}
 */
async function trailieLiteComplete({ system, user, maxTokens = 220 }) {
  const claudeModel = process.env.TRAILIE_LITE_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
  const openaiModel = process.env.TRAILIE_LITE_OPENAI_MODEL || 'gpt-4o-mini';

  const client = getAnthropic();
  if (client) {
    try {
      const response = await client.messages.create({
        model: claudeModel,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = (response.content[0]?.text || '').trim();
      if (text) return { text, provider: 'claude' };
    } catch (err) {
      console.warn(`[TrailieLite] Claude failed: ${err.message}`);
    }
  }

  const oai = getOpenAI();
  if (oai) {
    try {
      const response = await oai.chat.completions.create({
        model: openaiModel,
        temperature: 0.1,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = (response.choices[0]?.message?.content || '').trim();
      if (text) return { text, provider: 'openai' };
    } catch (err) {
      console.warn(`[TrailieLite] OpenAI failed: ${err.message}`);
    }
  }

  return { text: null, provider: null };
}

module.exports = {
  trailieLiteComplete,
};
