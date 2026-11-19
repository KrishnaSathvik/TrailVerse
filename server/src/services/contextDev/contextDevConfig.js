'use strict';

/**
 * Context.dev feature flags. All default OFF: with no env set, Trailie behaves
 * exactly as before this integration.
 *
 * TRAILIE_OFFICIAL_PAGE_READER=contextdev   Read official pages (and PDFs)
 *   through Context.dev instead of axios + regex. Falls back to axios on any
 *   Context.dev failure.
 *
 * TRAILIE_WEB_SEARCH_PROVIDER=contextdev    Route web discovery topics that
 *   currently go to Brave or Tavily through Context.dev search instead.
 *   Serper topics (local_business, lodging_strategy) are unchanged.
 *
 * CONTEXT_DEV_WEBHOOK_SECRETS               Monitor webhook signing secrets,
 *   comma-separated (one per monitor). The receiver at
 *   /api/webhooks/context-dev rejects everything without them.
 */

const { isContextDevConfigured } = require('./contextDevClient');

/**
 * Topics Context.dev search can serve: the Brave discovery topics plus the
 * Tavily discovery topics. Kept here (not in the provider) so the routing
 * helper has no import cycle with webEvidencePolicyService.
 */
const CONTEXT_DEV_SEARCH_TOPICS = Object.freeze(new Set([
  'alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke', 'events',
  'transit', 'parking', 'permits_reservations', 'vehicle_restrictions',
  'overview', 'activities', 'accessibility', 'pet_policy', 'visitor_services',
]));
const REPLACEABLE_SEARCH_PROVIDERS = Object.freeze(new Set(['brave', 'tavily']));

function flag(env, name) {
  return String(env[name] || '').trim().toLowerCase();
}

function officialPageReaderUsesContextDev(env = process.env) {
  return flag(env, 'TRAILIE_OFFICIAL_PAGE_READER') === 'contextdev' && isContextDevConfigured(env);
}

function webSearchUsesContextDev(env = process.env) {
  return flag(env, 'TRAILIE_WEB_SEARCH_PROVIDER') === 'contextdev' && isContextDevConfigured(env);
}

/**
 * The discovery provider to use for `topic`. Returns `providerId` unchanged
 * unless the Context.dev search flag is on AND Context.dev serves that topic.
 * Serper (local_business, lodging_strategy) is never rerouted.
 */
function routeWebSearchProvider(providerId, topic, env = process.env) {
  if (!REPLACEABLE_SEARCH_PROVIDERS.has(providerId)) return providerId;
  if (!CONTEXT_DEV_SEARCH_TOPICS.has(topic)) return providerId;
  return webSearchUsesContextDev(env) ? 'context_dev' : providerId;
}

module.exports = {
  CONTEXT_DEV_SEARCH_TOPICS,
  routeWebSearchProvider,
  officialPageReaderUsesContextDev,
  webSearchUsesContextDev,
};
