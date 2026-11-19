'use strict';

/**
 * Context.dev — thin HTTP client for the parts of the API TrailVerse uses.
 *
 * Every call is opt-in behind its own flag (see `contextDevConfig.js`) and
 * every caller has a non-Context.dev fallback, so a missing key, an outage or
 * an exhausted credit balance degrades to today's behaviour rather than
 * breaking a Trailie turn.
 *
 * Deliberately axios, not the `context.dev` SDK: the SDK retries twice with a
 * 60 s default timeout, which is the wrong shape inside a Trailie evidence
 * wave (the official-page reader it replaces gives up after 7 s). Calls here
 * make ONE attempt with a caller-supplied deadline.
 *
 * Credits are reported by the API on every response (`key_metadata`); they are
 * surfaced to callers as `creditsUsed` so cost can be logged per turn.
 */

const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');

const DEFAULT_BASE_URL = 'https://api.context.dev/v1';
const NOT_CONFIGURED = 'context_dev_not_configured';

function apiKey(env = process.env) {
  return String(env.CONTEXT_DEV_API_KEY || '').trim();
}

function isContextDevConfigured(env = process.env) {
  return apiKey(env).length > 0;
}

function baseUrl(env = process.env) {
  return String(env.CONTEXT_DEV_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function boundedError(code, message, extra = {}) {
  return Object.assign(new Error(message || code), { code, ...extra });
}

function creditsFrom(data) {
  const used = data?.key_metadata?.credits_consumed;
  return Number.isFinite(used) ? used : null;
}

/**
 * One attempt, bounded. Rejects with the axios error (so the shared
 * `classifyWebError` mapping — 401/403 not configured, 429 rate limited,
 * timeouts — keeps working) or with a bounded `context_dev_*` code.
 */
async function contextDevRequest(method, path, { body, query, signal, timeoutMs = 10000, env = process.env, http } = {}) {
  const key = apiKey(env);
  if (!key) throw boundedError(NOT_CONFIGURED, 'Context.dev is not configured');
  recordExternalProviderHttpRequest('context_dev', env);
  const client = http || require('axios');
  const response = await client.request({
    method,
    url: `${baseUrl(env)}${path}`,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    data: body,
    params: query,
    timeout: timeoutMs,
    signal,
  });
  return response.data;
}

/** Markdown headings / links / emphasis are kept: the deterministic parsers read plain sentences either way. */
function scrapeTitle(data) {
  return data?.metadata?.title
    ? String(data.metadata.title).replace(/\s+/g, ' ').trim()
    : null;
}

/**
 * Read one page (HTML or PDF) as main-content Markdown.
 * @returns {{ url: string, title: string|null, text: string, status: number, creditsUsed: number|null, cacheStatus: string|null }}
 */
async function scrapePage(url, {
  signal,
  timeoutMs = 7000,
  maxAgeMs = 24 * 60 * 60 * 1000,
  pdfMaxPages = 12,
  env,
  http,
} = {}) {
  const data = await contextDevRequest('POST', '/web/scrape', {
    signal, timeoutMs, env, http,
    body: {
      url,
      formats: { markdown: true },
      maxAgeMs,
      sharedParams: {
        mainContentOnly: true,
        parsers: { pdf: { startPage: 1, endPage: pdfMaxPages, ocr: 'auto' } },
      },
    },
  });
  if (!data?.markdown?.success || typeof data.markdown.data !== 'string') {
    throw boundedError('context_dev_scrape_failed', 'Context.dev returned no page content', {
      upstreamCode: data?.markdown?.error_code || null,
    });
  }
  return {
    url: data.url || url,
    title: scrapeTitle(data),
    text: data.markdown.data,
    status: 200,
    creditsUsed: creditsFrom(data),
    cacheStatus: data?.cache_metadata?.status || null,
  };
}

/**
 * Structured extraction against a JSON Schema. Used by the audit script to
 * cross-check the deterministic parsers — NOT by the live evidence path: a
 * model-extracted value is not an official-text fact (trailie-architecture.md).
 */
async function extractJson(url, schema, { instructions, signal, timeoutMs = 30000, maxAgeMs = 24 * 60 * 60 * 1000, env, http } = {}) {
  const data = await contextDevRequest('POST', '/web/scrape', {
    signal, timeoutMs, env, http,
    body: {
      url,
      formats: { json: true },
      jsonParams: { schema, ...(instructions ? { instructions } : {}) },
      maxAgeMs,
    },
  });
  if (!data?.json?.success) {
    throw boundedError('context_dev_extract_failed', 'Context.dev extraction failed', { upstreamCode: data?.json?.error_code || null });
  }
  return { data: data.json.data, truncated: data.json.isTruncated === true, creditsUsed: creditsFrom(data) };
}

/**
 * Web search with optional per-result highlight passages.
 * @returns {{ results: Array<{url,title,description,relevance,highlights:string[]}>, creditsUsed: number|null }}
 */
async function searchWeb({
  query,
  numResults = 5,
  includeDomains,
  excludeDomains,
  freshness,
  highlights = true,
  highlightMaxCharacters = 600,
  country = 'us',
} = {}, { signal, timeoutMs = 7000, env, http } = {}) {
  const data = await contextDevRequest('POST', '/web/search', {
    signal, timeoutMs, env, http,
    body: {
      query,
      numResults,
      country,
      ...(includeDomains?.length ? { includeDomains } : {}),
      ...(excludeDomains?.length ? { excludeDomains } : {}),
      ...(freshness ? { freshness } : {}),
      ...(highlights ? { highlightsOptions: { enabled: true, maxCharacters: highlightMaxCharacters } } : {}),
    },
  });
  const results = (Array.isArray(data?.results) ? data.results : []).map((result) => ({
    url: result?.url || null,
    title: result?.title || null,
    description: result?.description || '',
    relevance: result?.relevance || null,
    highlights: Array.isArray(result?.highlights?.highlights) ? result.highlights.highlights : [],
  })).filter((result) => result.url);
  return { results, creditsUsed: creditsFrom(data) };
}

// ── Monitors (used by the setup script, never on a Trailie turn) ────────────

function createMonitor(body, opts = {}) {
  return contextDevRequest('POST', '/monitors', { ...opts, body, timeoutMs: opts.timeoutMs || 30000 });
}

function listMonitors(query = {}, opts = {}) {
  return contextDevRequest('GET', '/monitors', { ...opts, query, timeoutMs: opts.timeoutMs || 30000 });
}

function updateMonitor(monitorId, body, opts = {}) {
  return contextDevRequest('PATCH', `/monitors/${encodeURIComponent(monitorId)}`, { ...opts, body, timeoutMs: opts.timeoutMs || 30000 });
}

function deleteMonitor(monitorId, opts = {}) {
  return contextDevRequest('DELETE', `/monitors/${encodeURIComponent(monitorId)}`, { ...opts, timeoutMs: opts.timeoutMs || 30000 });
}

function getMonitorLimits(opts = {}) {
  return contextDevRequest('GET', '/monitors/limits', { ...opts, timeoutMs: opts.timeoutMs || 30000 });
}

module.exports = {
  DEFAULT_BASE_URL,
  NOT_CONFIGURED,
  isContextDevConfigured,
  contextDevRequest,
  scrapePage,
  extractJson,
  searchWeb,
  createMonitor,
  listMonitors,
  updateMonitor,
  deleteMonitor,
  getMonitorLimits,
};
