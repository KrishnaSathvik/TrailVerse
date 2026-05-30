/** Decode common HTML entities in scraped NPS link URLs. */
function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeUrl(value) {
  const decoded = decodeHtmlEntities(value).trim();
  if (!decoded) return '';
  try {
    return new URL(decoded).toString();
  } catch {
    return decoded;
  }
}

module.exports = { decodeHtmlEntities, normalizeUrl };
