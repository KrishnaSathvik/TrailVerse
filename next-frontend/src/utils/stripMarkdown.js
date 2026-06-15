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
 * Close dangling markdown delimiters while SSE is still streaming so partial
 * tokens render as formatted text instead of literal ** or __.
 */
export function stabilizeStreamingMarkdown(text = '') {
  if (!text) return '';

  let output = text;

  const boldDoubleStar = (output.match(/\*\*/g) || []).length;
  if (boldDoubleStar % 2 === 1) {
    output += '**';
  }

  const boldUnderscore = (output.match(/__/g) || []).length;
  if (boldUnderscore % 2 === 1) {
    output += '__';
  }

  return output;
}
