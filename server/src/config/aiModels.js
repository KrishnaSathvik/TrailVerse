const parseModelList = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

const CANONICAL_TRAILIE_CLAUDE_MODEL = 'claude-sonnet-5';
const reviewedModelException =
  process.env.TRAILIE_ALLOW_NONCANONICAL_CLAUDE_MODEL === 'true' ||
  process.env.NODE_ENV === 'test';

const CLAUDE_PRIMARY_MODEL = reviewedModelException
  ? (process.env.CLAUDE_PRIMARY_MODEL || CANONICAL_TRAILIE_CLAUDE_MODEL)
  : CANONICAL_TRAILIE_CLAUDE_MODEL;

const CLAUDE_FALLBACK_TAIL = parseModelList(
  reviewedModelException ? process.env.CLAUDE_FALLBACK_MODELS : null,
  'claude-sonnet-5'
);

/** Primary first, then fallbacks (deduped). */
const CLAUDE_FALLBACK_MODELS = [
  CLAUDE_PRIMARY_MODEL,
  ...CLAUDE_FALLBACK_TAIL.filter((model) => model !== CLAUDE_PRIMARY_MODEL),
];

const CLAUDE_REVIEWER_MODEL =
  process.env.CLAUDE_REVIEWER_MODEL || CLAUDE_PRIMARY_MODEL;

const CLAUDE_EXTRACTOR_MODEL =
  reviewedModelException ? (process.env.CLAUDE_EXTRACTOR_MODEL || CLAUDE_PRIMARY_MODEL) : CLAUDE_PRIMARY_MODEL;

const OPENAI_PRIMARY_MODEL =
  process.env.OPENAI_PRIMARY_MODEL || 'gpt-5.4-mini';

const OPENAI_FALLBACK_MODELS = parseModelList(
  process.env.OPENAI_FALLBACK_MODELS,
  'gpt-5.4-mini,gpt-4.1'
);

module.exports = {
  CANONICAL_TRAILIE_CLAUDE_MODEL,
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  CLAUDE_REVIEWER_MODEL,
  CLAUDE_EXTRACTOR_MODEL,
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
};
