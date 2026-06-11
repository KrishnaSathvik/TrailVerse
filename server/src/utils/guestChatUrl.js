/**
 * Public read-only guest chat URLs (anonymous session history).
 */

function getTrailVerseWebBase() {
  const raw =
    process.env.WEBSITE_URL ||
    process.env.CLIENT_URL ||
    process.env.TRAILVERSE_WEB_BASE ||
    'https://www.nationalparksexplorerusa.com';
  return raw.replace(/\/$/, '');
}

function buildGuestChatPublicUrl(anonymousId) {
  if (!anonymousId) return null;
  return `${getTrailVerseWebBase()}/plan-ai/guest/${encodeURIComponent(anonymousId)}`;
}

function buildAnonymousConversionMessage() {
  return `You've used your **5 free guest messages** for this session.

We've got a good start on this trip. Create a free account to keep planning with Trailie and save this exact conversation for later. You'll also be able to share the trip with your travel crew and export a PDF when the itinerary feels ready.

Not ready yet? This chat is saved on this device — come back to Trailie anytime. Your next 5 guest messages reset in about 48 hours.`;
}

module.exports = {
  getTrailVerseWebBase,
  buildGuestChatPublicUrl,
  buildAnonymousConversionMessage,
};
