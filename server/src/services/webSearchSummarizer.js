/**
 * Turn raw web search hits into a short TrailVerse digest (Claude-first, same as Trailie chat).
 */
const { trailieLiteComplete } = require('./trailieLiteLlm');

function buildSourcesBlock(results) {
  return results
    .filter((r) => r.title && (r.snippet || r.url))
    .map((r, i) => {
      const src = r.source ? ` [${r.source}]` : '';
      return `${i + 1}. ${r.title}${src}\n   ${(r.snippet || '').trim()}\n   ${r.url || ''}`;
    })
    .join('\n\n');
}

/**
 * @param {Object} params
 * @param {string} params.userMessage
 * @param {string|null} params.parkName
 * @param {string} params.category
 * @param {Array<{title:string,snippet?:string,url?:string,source?:string}>} params.results
 * @returns {Promise<string|null>}
 */
async function summarizeWebResultsForTrailie({ userMessage, parkName, category, results }) {
  if (!results?.length) return null;

  const sourcesBlock = buildSourcesBlock(results);
  if (!sourcesBlock) return null;

  const system = `You write a brief factual digest for Trailie (national parks trip planner).
Rules:
- Use ONLY facts explicitly supported by the web snippets below — do not invent closures, hours, prices, or dates.
- A permit, lottery, or reservation requirement does NOT mean a trail or park is "closed". Say "permit required" instead.
- Prefer nps.gov snippets when present for park operations; use other sources for restaurants, hotels, roads off nps.gov.
- If snippets conflict or are unclear, say "sources disagree — verify on official sites."
- Output 3–6 short bullet lines, plain text, no markdown headers. Max 120 words.`;

  const user = `User question: ${userMessage.trim().slice(0, 400)}
Park context: ${parkName || 'none specified'}
Search category: ${category}

Web snippets:
${sourcesBlock}`;

  const { text, provider } = await trailieLiteComplete({ system, user, maxTokens: 220 });
  if (text) {
    console.log(`[WebSearch] TrailVerse digest via ${provider || 'unknown'}`);
  }
  return text || null;
}

module.exports = {
  summarizeWebResultsForTrailie,
};
