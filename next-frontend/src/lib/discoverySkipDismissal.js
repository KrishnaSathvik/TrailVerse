/**
 * Browser-safe discovery anti-pattern stripping (demo + client).
 * Keep behavior aligned with server/src/utils/parkSkipContext.js — no Node imports.
 */

const SKIP_DISMISSAL_RE =
  /\b(?:i'd skip it|i would skip it|so i'd skip it|skip it for your|not a fit for your)\b/i;

const POSITIVE_RECOMMEND_RE =
  /\b(?:go with|top pick|best pick|my (?:top |honest )?pick|save [a-z]+ for when)\b/i;

const PARK_DESIGNATION_RE =
  /\b(?:national park|national monument|national preserve|national seashore|national lakeshore|national recreation area|national historic site|state park)\b/i;

const BOLD_PARK_NAME_RE =
  /\*\*[A-Z][^*]+(?:National Park|National Monument|State Park)[^*]*\*\*/;

function plainText(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

/** Title-case proper-noun runs typical of park names (e.g. Great Sand Dunes). */
function hasParkLikeName(text) {
  const plain = plainText(text);
  if (PARK_DESIGNATION_RE.test(plain)) return true;
  if (BOLD_PARK_NAME_RE.test(plain)) return true;
  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/.test(plain);
}

export function isSkipOnlyDismissalParagraph(paragraph) {
  const trimmed = paragraph.trim();
  if (!trimmed) return false;

  if (/^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\b/i.test(trimmed)) {
    const afterLead = trimmed.replace(
      /^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\s+(?:the\s+)?/i,
      ''
    );
    if (hasParkLikeName(afterLead)) return true;
  }

  if (!SKIP_DISMISSAL_RE.test(trimmed)) return false;
  if (POSITIVE_RECOMMEND_RE.test(trimmed)) return false;
  if (/^[-*•]\s+\*\*/.test(trimmed)) return false;

  return hasParkLikeName(trimmed);
}

/** Remove paragraphs that name a park only to dismiss it (discovery anti-pattern). */
export function stripSkipOnlyParkSentences(text) {
  if (!text || typeof text !== 'string') return text;

  const kept = text
    .split(/\n\n+/)
    .filter((paragraph) => !isSkipOnlyDismissalParagraph(paragraph));

  return kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
