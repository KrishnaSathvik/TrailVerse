const BOT_UA = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebookexternalhit',
  'meta-externalagent',
  'meta-externalfetcher',
  'twitterbot',
  'linkedinbot',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'petalbot',
  'bytespider',
  'gptbot',
  'chatgpt-user',
  'ccbot',
  'anthropic-ai',
  'claudebot',
  'claude-web',
  'perplexitybot',
  'amazonbot',
  'ia_archiver',
  'screaming frog',
  'siteauditbot',
  'headlesschrome',
  'phantomjs',
  'lighthouse',
  'pagespeed',
  'pingdom',
  'uptimerobot',
  'statuscake',
];

function classifyBot(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return { isBot: false, botName: null };
  const hit = BOT_UA.find((token) => ua.includes(token));
  if (hit) return { isBot: true, botName: hit };
  if (/\bbot\b/.test(ua) || ua.includes('crawler') || ua.includes('spider')) {
    return { isBot: true, botName: 'generic' };
  }
  return { isBot: false, botName: null };
}

function humanTrafficFilter(extra = {}) {
  return { isBot: { $ne: true }, ...extra };
}

module.exports = { classifyBot, humanTrafficFilter };
