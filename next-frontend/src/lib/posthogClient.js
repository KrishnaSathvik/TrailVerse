import posthog from 'posthog-js';

let started = false;

export function isPostHogStarted() {
  return started;
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
    });
    posthog.stopSessionRecording?.();
    started = true;
  } catch {
    started = false;
  }
}

export function capturePostHog(eventName, properties) {
  if (!started || typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem('analytics_opt_out') === 'true') return;
    posthog.capture(eventName, properties);
  } catch {
    // Analytics must never block navigation, chat, or auth.
  }
}

export function identifyPostHog(userId) {
  if (!started || !userId) return;
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
