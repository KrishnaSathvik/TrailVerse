import posthog from 'posthog-js';

let started = false;

export function isPostHogStarted() {
  return started;
}

// Path segments after these prefixes are secrets (auth tokens, private share links).
const SECRET_PATH_PREFIXES = ['/reset-password/', '/verify-email/', '/plan-ai/shared/'];

/** Drop query strings, hashes, and secret path segments from a URL or path. */
export function scrubUrl(value) {
  // PostHog sentinels such as "$direct" (no referrer) are not URLs.
  if (typeof value !== 'string' || !value || value.startsWith('$')) return value;
  let url;
  try {
    url = new URL(value, 'https://placeholder.invalid');
  } catch {
    return undefined;
  }
  let path = url.pathname;
  for (const prefix of SECRET_PATH_PREFIXES) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      path = `${prefix}[redacted]`;
      break;
    }
  }
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  return isAbsolute ? `${url.origin}${path}` : path;
}

const URL_PROPERTIES = ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_pathname', '$initial_referrer'];

/** posthog-js adds full URLs to every event; keep them free of queries and tokens. */
export function scrubEvent(event) {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const key of URL_PROPERTIES) {
      if (key in bag) bag[key] = scrubUrl(bag[key]);
    }
  }
  return event;
}

function trackingEnabled() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.NEXT_PUBLIC_POSTHOG_DEBUG === 'true';
}

export function initPostHog() {
  if (typeof window === 'undefined' || started) return;
  if (!trackingEnabled()) return;

  const optedOut = window.localStorage.getItem('analytics_opt_out') === 'true';
  try {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: optedOut,
      advanced_disable_feature_flags: true,
      persistence: 'localStorage+cookie',
      before_send: scrubEvent,
    });
    posthog.stopSessionRecording?.();
    started = true;
  } catch {
    started = false;
  }
}

/**
 * Start on first use: the page tracker's effect runs before Providers' init
 * effect (child effects fire first), so the landing pageview arrives early.
 */
function ensureStarted() {
  if (!started) initPostHog();
  return started;
}

export function capturePostHog(eventName, properties) {
  if (typeof window === 'undefined' || !ensureStarted()) return;
  try {
    if (window.localStorage.getItem('analytics_opt_out') === 'true') return;
    posthog.capture(eventName, properties);
  } catch {
    // Analytics must never block navigation, chat, or auth.
  }
}

export function identifyPostHog(userId) {
  if (!userId || !ensureStarted()) return;
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem('analytics_opt_out') === 'true') return;
    posthog.identify(String(userId));
  } catch {
    // ignore
  }
}

export function resetPostHog() {
  if (!started) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}

export function optOutPostHog() {
  if (!started) return;
  try {
    posthog.opt_out_capturing();
  } catch {
    // ignore
  }
}

export function optInPostHog() {
  if (!started) return;
  try {
    posthog.opt_in_capturing();
  } catch {
    // ignore
  }
}
