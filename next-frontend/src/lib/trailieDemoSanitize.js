const WEB_SEARCH_UPSELL_RE =
  /\n*---\n*\n*🔍\s*\*\*Want live prices and ratings\?\*\*[\s\S]*$/i;

/** Same suffix as server buildWebSearchUpsellSuffix('local') — inline in assistant bubble on /plan-ai */
export const ANONYMOUS_WEB_UPSELL_SUFFIX =
  '\n\n---\n\n🔍 **Want live prices and ratings?** Sign up free to unlock live web search for hotels, restaurants, and current road conditions.';

const NPS_ALERT_FOOTER_RE = /\n*---\n*📍\s*\*\*Important[\s\S]*$/i;

/** Defers to nps.gov when live data already answered the question — trim for demo polish */
const NPS_DEFERRAL_PARAGRAPH_RE =
  /\n+(?:On [^.\n]+specifically, )?the live data doesn't have[^.]*\.[^\n]*(?:check \[nps\.gov[^\]]*\]\([^)]*\)|call the park directly)[^.]*\.?/gi;

const NPS_CONDITIONS_LINK_TAIL_RE =
  /\n+For today's exact status before you head out, check \[nps\.gov[^\]]*\]\([^)]*\) or call the park directly at [^.]+\./gi;

const NPS_VERIFY_FOOTER_RE =
  /\n+_Verify at \[nps\.gov\]\([^)]*\) before your trip\._/gi;

/** Strip footers and greetings that don't belong in the marketing demo. */
export function sanitizeTrailieDemoAnswer(text, { preserveWebUpsell = false } = {}) {
  if (!text) return text;
  let out = text;
  if (!preserveWebUpsell) {
    out = out.replace(WEB_SEARCH_UPSELL_RE, '');
  }
  return out
    .replace(NPS_ALERT_FOOTER_RE, '')
    .replace(NPS_DEFERRAL_PARAGRAPH_RE, '')
    .replace(NPS_CONDITIONS_LINK_TAIL_RE, '')
    .replace(NPS_VERIFY_FOOTER_RE, '')
    .replace(/^Hey\s+[^,!—\n]+[—,!]?\s*/i, '')
    .replace(/^Hi\s+[^,!—\n]+[—,!]?\s*/i, '')
    .replace(/,?\s*Krishna[.!]?\s*/gi, '. ')
    .replace(/\byou'?ve already been to [^,\n]+[,.]?\s*/gi, '')
    .replace(/Since you'?ve checked [^\n]+\n\n/gi, '')
    .replace(/^you've already [^.]+\.\s*/i, '')
    .replace(/\bSince you love [^,—\n]+[—,]\s*/gi, '')
    .replace(/\b(parks? )?you'?ve already (done|visited|knocked out)[^.]*\.?\s*/gi, '')
    .replace(/\bcompared to the parks you'?ve already done\b/gi, 'compared to the busiest parks')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Guest anonymous replay — upsell lives inside the bubble like /plan-ai, not a separate card. */
export function withDemoGuestUpsellInBubble(answer, metadata) {
  if (!metadata?.showsGuestUpsell || !answer) return answer;
  if (WEB_SEARCH_UPSELL_RE.test(answer)) return answer;
  return `${answer.trimEnd()}${ANONYMOUS_WEB_UPSELL_SUFFIX}`;
}
