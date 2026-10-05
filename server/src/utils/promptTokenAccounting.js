const PROMPT_TOKENIZER_ID = 'trailie_prompt_token_v1';
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*|[^\s]/gu;

function tokenizePrompt(text) {
  return String(text || '').match(TOKEN_PATTERN) || [];
}

function countPromptTokens(text) {
  return tokenizePrompt(text).length;
}

function truncatePromptTokens(text, maxTokens) {
  const normalizedLimit = Math.max(0, Number(maxTokens) || 0);
  const value = String(text || '');
  const matches = Array.from(value.matchAll(TOKEN_PATTERN));
  if (matches.length <= normalizedLimit) {
    return { text: value, tokens: matches.length, truncated: false };
  }
  if (normalizedLimit === 0) return { text: '', tokens: 0, truncated: Boolean(value) };
  const last = matches[normalizedLimit - 1];
  const end = last.index + last[0].length;
  return {
    text: value.slice(0, end).trimEnd(),
    tokens: normalizedLimit,
    truncated: true,
  };
}

module.exports = {
  PROMPT_TOKENIZER_ID,
  countPromptTokens,
  tokenizePrompt,
  truncatePromptTokens,
};
