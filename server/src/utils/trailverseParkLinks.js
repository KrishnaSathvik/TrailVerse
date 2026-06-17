/**
 * TrailVerse park page URLs for AI prompts and response footers.
 * Prefer these over raw nps.gov links when TrailVerse already surfaces live NPS data.
 */

function getTrailVerseWebBase() {
  const raw =
    process.env.WEBSITE_URL ||
    process.env.CLIENT_URL ||
    'https://www.nationalparksexplorerusa.com';
  return raw.replace(/\/$/, '');
}

function slugFromFullName(fullName) {
  if (!fullName) return '';
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * @param {{ parkCode?: string, parkName?: string }} park
 * @param {{ tab?: string }} [options]
 */
function buildParkPageUrl(park, options = {}) {
  const base = getTrailVerseWebBase();
  const slug = slugFromFullName(park.parkName) || (park.parkCode || '').toLowerCase();
  if (!slug) return `${base}/explore`;
  const tab = options.tab ? `?tab=${encodeURIComponent(options.tab)}` : '';
  return `${base}/parks/${slug}${tab}`;
}

/**
 * Inject into the live-data prompt so the model links TrailVerse, not nps.gov.
 * @param {Array<{ parkCode?: string, parkName?: string }>} parks
 */
function formatTrailverseLinksBlock(parks = []) {
  const unique = [];
  const seen = new Set();
  for (const park of parks) {
    if (!park?.parkName && !park?.parkCode) continue;
    const key = (park.parkCode || park.parkName || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(park);
  }
  if (unique.length === 0) return '';

  const lines = [
    '',
    '--- TRAILVERSE LINKS (use these — not nps.gov) ---',
    'TrailVerse already shows live NPS alerts, weather, permits, and park details. When users need more detail or you link a park, use TrailVerse URLs below.',
    'Brand the source as TrailVerse live data (e.g. "TrailVerse shows…", "live alerts on TrailVerse…") — not "check nps.gov" or conditions.htm.',
    'Recreation.gov / booking URLs from the live block are fine for reservations. Do not replace those with TrailVerse.',
    'Do NOT link hotels, lodges, or restaurants to TrailVerse park URLs — only link actual park names to /parks/ pages.',
    'When the web search block includes a Link or Source URL for a hotel or restaurant, link that business name to that URL on first mention.',
  ];

  for (const park of unique) {
    const label = park.parkName || park.parkCode;
    lines.push(`[${label}](${buildParkPageUrl(park)})`);
    lines.push(`  Alerts & closures: ${buildParkPageUrl(park, { tab: 'alerts' })}`);
    lines.push(`  Permits: ${buildParkPageUrl(park, { tab: 'permits' })}`);
    lines.push(`  Plan with Trailie: ${getTrailVerseWebBase()}/plan-ai?parkCode=${(park.parkCode || '').toLowerCase()}`);
  }

  lines.push('--- END TRAILVERSE LINKS ---', '');
  return lines.join('\n');
}

/**
 * Footer CTA when alert validation adds a safety note.
 * @param {Array<{ parkCode?: string, parkName?: string }>} parks
 */
function formatTrailverseVerifyFooter(parks = []) {
  const base = getTrailVerseWebBase();
  const primary = parks.find((p) => p?.parkName || p?.parkCode);
  if (!primary) {
    return `\n\n_Check current park alerts and conditions on [TrailVerse](${base}/explore)._`;
  }
  const label = primary.parkName || primary.parkCode;
  const url = buildParkPageUrl(primary, { tab: 'alerts' });
  return `\n\n_Check current alerts and conditions for [${label} on TrailVerse](${url})._`;
}

/**
 * Prompt line when live NPS feeds failed for a named park.
 * @param {{ parkCode?: string, parkName?: string }} park
 */
function formatNoLiveDataPromptInstruction(park) {
  const label = park.parkName || park.parkCode || 'this park';
  const alertsUrl = buildParkPageUrl(park, { tab: 'alerts' });
  return [
    'Live feeds did not load — follow WHEN LIVE FEEDS DON\'T LOAD (shared policy): hedge with usually/typically in the plan.',
    `If you add a pre-trip check, one linked line only: "Worth a quick look at current alerts for [${label} on TrailVerse](${alertsUrl}) before you go."`,
    'Do NOT say "general knowledge", "training data", "I don\'t have real-time data", "I\'m working from…", "real-world conditions", or unlinked "check TrailVerse".',
  ].join(' ');
}

module.exports = {
  getTrailVerseWebBase,
  slugFromFullName,
  buildParkPageUrl,
  formatTrailverseLinksBlock,
  formatTrailverseVerifyFooter,
  formatNoLiveDataPromptInstruction,
};
