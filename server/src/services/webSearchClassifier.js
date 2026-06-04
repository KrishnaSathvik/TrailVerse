/**
 * Web search query classification — regex first, optional cheap LLM refine (Claude-first).
 */
const { trailieLiteComplete } = require('./trailieLiteLlm');

const FRESHNESS_SIGNALS =
  /\b(current|currently|right now|today|tonight|this week|latest|recent|updated|as of|202[4-9]|now open|still closed|open now)\b/i;

const OPERATIONAL_STATUS_SIGNALS =
  /\b(open|closed|closure|closures|hours|operating|accessible|access|status|crowded|wait time|shuttle running|shuttle service)\b/i;

const LLM_REFINE_CATEGORIES = [
  'operational-status',
  'road-conditions',
  'wildfire-smoke',
  'trail-conditions',
  'wildlife-seasonal',
  'events',
  'local-business',
  'planning',
];

const LLM_CACHE_MAX = 100;
const LLM_CACHE_TTL_MS = 10 * 60 * 1000;
const llmCategoryCache = new Map();

function cacheGet(key) {
  const entry = llmCategoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > LLM_CACHE_TTL_MS) {
    llmCategoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (llmCategoryCache.size >= LLM_CACHE_MAX) {
    const oldest = llmCategoryCache.keys().next().value;
    llmCategoryCache.delete(oldest);
  }
  llmCategoryCache.set(key, { value, ts: Date.now() });
}

/**
 * Regex-only classification (sync). Order matters — specific buckets before broad.
 * @param {string} userMessage
 * @returns {string}
 */
function classifyQueryRegex(userMessage) {
  const msg = (userMessage || '').toLowerCase();

  if (/(permit|reservation|timed entry|lottery|campsite|campground|visitor center)/i.test(msg)) {
    return 'nps-covered';
  }
  if (/(history|founded|established|famous|known for|significance|when was)/i.test(msg)) {
    return 'history-facts';
  }

  if (
    /(road condition|road closure|road open|road status|construction|detour)/i.test(msg) ||
    (/\broad\b/i.test(msg) && /\b(closed|closure|closures)\b/i.test(msg))
  ) {
    return 'road-conditions';
  }
  if (/(wildfire|wildfires|\bsmoke\b|air quality|haze|flood)/i.test(msg) || /\bfire\b.*\b(park|trail|area|zone)\b/i.test(msg)) {
    return 'wildfire-smoke';
  }

  // Trail before generic operational — "Narrows closed this week" is trail-specific
  if (/(trail condition|trail report|\bmuddy\b|washout|snowpack|\bicy\b)/i.test(msg) || (/\bsnow\b/i.test(msg) && /\b(trail|road|pass|conditions?)\b/i.test(msg))) {
    return 'trail-conditions';
  }

  if (
    FRESHNESS_SIGNALS.test(msg) &&
    OPERATIONAL_STATUS_SIGNALS.test(msg) &&
    !/(permit|reservation|lottery|campsite|campground)/i.test(msg)
  ) {
    return 'operational-status';
  }
  if (/(wildflower|bloom|fall color|foliage|rut|migration|salmon run|northern lights|aurora|meteor|\bbird\b|\bfish\b|forag|mushroom)/i.test(msg)) {
    return 'wildlife-seasonal';
  }
  if (/\b(events?|festivals?|ranger programs?)\b/i.test(msg)) {
    return 'events';
  }

  if (
    /(?:restaurant|food|\beat\b|dine|dining|cafe|coffee|\bbar\b|hotel|motel|lodge|lodging|cabin|airbnb|\bstay\b|accommodation|gas station|grocery|\bstore\b|\bshop\b|outfitter|\bgear\b|\brent\b|shuttle|tour company|guide service|workshop|\bclass\b|\bcourse\b|\blesson\b|\btour\b|guided|excursion|experience|operator|kayak|canoe|\braft\b|climb|zipline|horseback|bike|snorkel|\bdive\b|\bsurf\b|\bski\b|paddle)/i.test(
      msg
    )
  ) {
    return 'local-business';
  }

  return 'planning';
}

function shouldRefineCategoryWithLlm(regexCategory, userMessage) {
  if (regexCategory !== 'planning') return false;
  return FRESHNESS_SIGNALS.test(userMessage || '');
}

/**
 * Cheap LLM pass when regex says "planning" but the user wants current conditions.
 * @param {string} userMessage
 * @param {string} regexCategory
 * @returns {Promise<string>}
 */
async function refineCategoryWithLlm(userMessage, regexCategory) {
  const cacheKey = userMessage.trim().toLowerCase().slice(0, 180);
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`[WebSearch] LLM refine cache HIT → ${cached}`);
    return cached;
  }

  const slugList = LLM_REFINE_CATEGORIES.join(', ');
  const system =
    `Pick ONE web-search category for this national-parks travel question. Reply with ONLY the slug, nothing else.\nSlugs: ${slugList}\n` +
    'operational-status = is X open/closed/hours today; road-conditions = road closures; trail-conditions = trail mud/snow; ' +
    'wildfire-smoke = fire/smoke/air; local-business = food/hotels; planning = general trip ideas.';

  const { text, provider } = await trailieLiteComplete({
    system,
    user: userMessage.trim().slice(0, 500),
    maxTokens: 24,
  });

  if (!text) return regexCategory;

  const raw = text.toLowerCase();
  const slug = LLM_REFINE_CATEGORIES.find((c) => raw === c || raw.includes(c)) || regexCategory;
  cacheSet(cacheKey, slug);
  console.log(`[WebSearch] LLM refine (${provider}): planning → ${slug}`);
  return slug;
}

/**
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function resolveSearchCategory(userMessage) {
  const regexCategory = classifyQueryRegex(userMessage);
  if (!shouldRefineCategoryWithLlm(regexCategory, userMessage)) {
    return regexCategory;
  }
  return refineCategoryWithLlm(userMessage, regexCategory);
}

module.exports = {
  classifyQueryRegex,
  resolveSearchCategory,
  shouldRefineCategoryWithLlm,
  FRESHNESS_SIGNALS,
  OPERATIONAL_STATUS_SIGNALS,
  LLM_REFINE_CATEGORIES,
};
