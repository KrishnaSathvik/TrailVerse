/**
 * Sanitize markdown park links in assistant responses.
 * Mirrors next-frontend/src/utils/parkLinkifier.js (unwrapMislinkedParkMarkdown).
 */

const { PARK_NAME_TO_CODE } = require('./parkExtractor');

const sortedParkNames = [...PARK_NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);

function isParkLinkLabel(label) {
  const plain = String(label || '').replace(/\*\*/g, '').trim();
  if (!plain) return false;
  const lower = plain.toLowerCase();
  return sortedParkNames.some((name) => lower === name.toLowerCase());
}

/**
 * Unwrap [Hotel Name](/parks/...) — keep links only when label is a park name.
 * @param {string} content
 */
function unwrapMislinkedParkMarkdown(content) {
  if (!content || typeof content !== 'string') return content;
  return content.replace(
    /\[([^\]]+)\]\(([^)]*\/parks\/[^)\s]+[^)]*)\)/gi,
    (full, label) => (isParkLinkLabel(label) ? full : label)
  );
}

module.exports = {
  isParkLinkLabel,
  unwrapMislinkedParkMarkdown,
};
