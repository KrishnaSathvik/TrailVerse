/**
 * Middleware to detect social media crawlers
 * Returns true if the request is from a crawler that needs pre-rendered HTML
 */
const isCrawler = (req) => {
  const userAgent = req.get('user-agent') || '';
  const crawlerPatterns = [
    'facebookexternalhit', // Facebook
    'Facebot', // Facebook
    'Twitterbot', // Twitter
    'LinkedInBot', // LinkedIn
    'WhatsApp', // WhatsApp
    'Slackbot', // Slack
    'SkypeUriPreview', // Skype
    'Applebot', // Apple
    'Googlebot', // Google (sometimes for rich results)
    'bingbot', // Bing
    'YandexBot', // Yandex
    'Pinterest', // Pinterest
    'Discordbot', // Discord
    'TelegramBot', // Telegram
    'Viber', // Viber
    'Screaming Frog SEO Spider', // SEO tools
    'SemrushBot', // SEO tools
    'AhrefsBot', // SEO tools
  ];

  return crawlerPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
};

module.exports = { isCrawler };

