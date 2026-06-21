/**
 * Strip common markdown syntax for plain-text previews (chat history cards, trip summaries).
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[#*_>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncatePlainText(text, maxLen = 140) {
  const cleaned = stripMarkdown(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3).replace(/\s+\S*$/, '')}...`;
}

/**
 * GFM strikethrough can treat paired single tildes as delimiters (e.g. "~6hrs … ~$30").
 * Escape tildes used as "approximately" before digits or $ so hike times/prices render normally.
 */
export function escapeApproximateTildesForGfm(text = '') {
  if (!text) return '';
  return text.replace(/~(?=[0-9$])/g, '\\~');
}

/**
 * Stabilize partially streamed markdown so users don't see raw markers like **.
 * This is intentionally conservative: it only closes common inline markers while streaming.
 */
export function stabilizeStreamingMarkdown(text = '') {
  if (!text) return '';

  let output = text;

  // Close unmatched bold markers: **bold
  const boldDoubleStar = (output.match(/\*\*/g) || []).length;
  if (boldDoubleStar % 2 === 1) {
    output += '**';
  }

  // Close unmatched bold underscore markers: __bold
  const boldUnderscore = (output.match(/__/g) || []).length;
  if (boldUnderscore % 2 === 1) {
    output += '__';
  }

  // Close unmatched inline code: `code
  const backticks = (output.match(/`/g) || []).length;
  if (backticks % 2 === 1) {
    output += '`';
  }

  // Close unfinished markdown links like [Trailie](https://...
  const openBracketCount = (output.match(/\[/g) || []).length;
  const closeBracketCount = (output.match(/\]/g) || []).length;
  if (openBracketCount > closeBracketCount) {
    output += ']';
  }

  return output;
}
