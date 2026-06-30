const parseModelList = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

const CLAUDE_PRIMARY_MODEL =
  process.env.CLAUDE_PRIMARY_MODEL || 'claude-sonnet-5';

const CLAUDE_FALLBACK_MODELS = parseModelList(
  process.env.CLAUDE_FALLBACK_MODELS,
  'claude-sonnet-5,claude-sonnet-4-6,claude-haiku-4-5-20251001'
);

const CLAUDE_REVIEWER_MODEL =
  process.env.CLAUDE_REVIEWER_MODEL || CLAUDE_PRIMARY_MODEL;

const CLAUDE_EXTRACTOR_MODEL =
  process.env.CLAUDE_EXTRACTOR_MODEL || 'claude-haiku-4-5-20251001';

const OPENAI_PRIMARY_MODEL =
  process.env.OPENAI_PRIMARY_MODEL || 'gpt-5.4-mini';

const OPENAI_FALLBACK_MODELS = parseModelList(
  process.env.OPENAI_FALLBACK_MODELS,
  'gpt-5.4-mini,gpt-4.1'
);

module.exports = {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  CLAUDE_REVIEWER_MODEL,
  CLAUDE_EXTRACTOR_MODEL,
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
};
