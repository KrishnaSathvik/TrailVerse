'use strict';

/**
 * One input-hygiene boundary for every deterministic language parser.
 *
 * Travelers type on phones. iOS/macOS substitute typographic punctuation by
 * default, so "Don’t" (U+2019) is the ordinary spelling, not an edge case —
 * yet phrase matchers are written with ASCII. Normalizing semantic-equivalent
 * typography before matching keeps meaning stable across keyboards.
 *
 * The original text is never mutated: callers persist/display `originalText`
 * and parse `normalizedText`.
 */

// Single-quote family → ASCII apostrophe.
const SINGLE_QUOTES = /[‘’‚‛′‵´`]/g;
// Double-quote family → ASCII quote.
const DOUBLE_QUOTES = /[“”„‟″‶«»]/g;
// Dash family → ASCII hyphen (keeps "day–by–day" and "3–4 days" parseable).
const DASHES = /[‐‑‒–—―−]/g;
// Space family (NBSP, narrow/thin/figure spaces, ideographic space) → plain space.
const SPACES = /[   -   　]/g;
// Zero-width characters carry no phrase meaning and break \b boundaries.
const ZERO_WIDTH = /[​‌‍﻿]/g;
const ELLIPSIS = /…/g;

/**
 * Normalize a traveler message for deterministic phrase matching.
 * Case and word order are preserved — only typography is canonicalized.
 */
function normalizeUserText(raw) {
  if (raw == null) return '';
  let text = typeof raw === 'string' ? raw : String(raw);
  // NFC first so precomposed and decomposed spellings match identically.
  try {
    text = text.normalize('NFC');
  } catch {
    /* environments without full ICU still get the replacements below */
  }
  return text
    .replace(ZERO_WIDTH, '')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(ELLIPSIS, '...')
    .replace(SPACES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse-ready pair. `originalText` is what the traveler wrote and what must be
 * stored, echoed, and displayed; `normalizedText` is for matchers only.
 */
function withNormalizedText(raw) {
  const originalText = raw == null ? '' : String(raw);
  const normalizedText = normalizeUserText(originalText);
  return {
    originalText,
    normalizedText,
    changed: normalizedText !== originalText.trim(),
  };
}

module.exports = {
  normalizeUserText,
  withNormalizedText,
};
