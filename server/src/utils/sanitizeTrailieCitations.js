'use strict';

/**
 * Traveler-facing citation presentation boundary.
 *
 * OpenAI/web-search internal wrappers (private-use cite tokens) must never
 * appear as literal Trailie prose. Resolvable tokens become markdown source
 * links — the product's existing attribution form. Unresolvable tokens are
 * hidden. Ordinary punctuation and markdown links are left alone.
 *
 * Frontend twin: next-frontend/src/utils/sanitizeTrailieCitations.js
 */

const CITE_TOKEN_RE = /\uE200cite\uE202([^\uE201]{0,80})\uE201/g;
const PRIVATE_WRAPPER_RE = /\uE200[^\uE201]{0,80}\uE201/g;
const HTTP_URL_RE = /^https?:\/\//i;

function safeTitle(title, fallback) {
  const raw = String(title || fallback || 'Source').trim() || 'Source';
  return raw.replace(/[\[\]]/g, '').slice(0, 80);
}

function collapseWhitespace(text) {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .replace(/ +\./g, '.')
    .trim();
}

function sanitizeTrailieCitations(content, { resolvedCitations } = {}) {
  if (typeof content !== 'string' || content.length === 0) {
    return { content: content == null ? '' : String(content), changed: false };
  }

  const resolved = resolvedCitations && typeof resolvedCitations === 'object' ? resolvedCitations : {};
  let working = content.replace(CITE_TOKEN_RE, (_, key) => {
    const record = resolved[key];
    const url = typeof record?.url === 'string' ? record.url.trim() : '';
    if (url && HTTP_URL_RE.test(url)) {
      return `[${safeTitle(record.title, 'Source')}](${url})`;
    }
    return '';
  });
  working = working.replace(PRIVATE_WRAPPER_RE, '');
  working = working.replace(/\uE200[^\uE201]*$/g, '');
  const cleaned = collapseWhitespace(working);
  return { content: cleaned, changed: cleaned !== collapseWhitespace(content) };
}

module.exports = { sanitizeTrailieCitations };
