'use strict';

/**
 * Context.dev monitor webhooks → evidence invalidation.
 *
 * A page monitor on an official park page (roads, closures, timed entry,
 * shuttles) fires `change.detected` when the page's visible text changes. We
 * then mark every current evidence row read from that URL as invalidated, so
 * the next Trailie turn re-reads the page instead of serving cached content
 * that no longer matches the source.
 *
 * Signature (docs.context.dev/webhooks): header `X-Context-Signature:
 * t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, keyed with the
 * monitor's full signing secret (including any `whsec_` prefix). Verified on
 * the RAW body before any JSON parsing.
 *
 * Invalidation is idempotent (re-marking an already-invalidated row is a
 * no-op in effect), so retries and replays need no separate inbox.
 */

const { createHmac, timingSafeEqual } = require('crypto');

const SIGNATURE_TOLERANCE_SECONDS = 300;

function verifyContextDevSignature(rawBody, header, secret, { nowSeconds = Date.now() / 1000 } = {}) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof header !== 'string') return false;
  const parts = Object.create(null);
  for (const part of header.split(',')) {
    const pair = part.trim().split('=');
    if (pair.length !== 2 || Object.prototype.hasOwnProperty.call(parts, pair[0])) return false;
    parts[pair[0]] = pair[1];
  }
  if (!/^[0-9]{1,12}$/.test(parts.t || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  if (Math.abs(nowSeconds - Number(parts.t)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.`).update(rawBody).digest();
  const actual = Buffer.from(parts.v1, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * The stored forms one page URL can take: providers store the final URL as
 * returned, so match with and without a trailing slash and fragment, on the
 * www and apex host.
 */
function urlVariants(value) {
  let url;
  try { url = new URL(value); } catch { return []; }
  if (!['https:', 'http:'].includes(url.protocol)) return [];
  url.hash = '';
  const variants = new Set();
  const hosts = [url.hostname, url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`];
  for (const host of hosts) {
    for (const protocol of ['https:', 'http:']) {
      const copy = new URL(url.toString());
      copy.protocol = protocol;
      copy.hostname = host;
      const base = copy.toString();
      variants.add(base);
      variants.add(base.endsWith('/') ? base.slice(0, -1) : `${base}/`);
    }
  }
  return [...variants];
}

async function invalidateEvidenceForSourceUrl({ url, now = new Date(), EvidenceModel } = {}) {
  const variants = urlVariants(url);
  if (!variants.length) return { matched: 0, modified: 0 };
  const Model = EvidenceModel || require('../../models/TrailieEvidence');
  const result = await Model.updateMany(
    { isCurrent: true, $or: [{ 'source.url': { $in: variants } }, { 'source.sourceId': { $in: variants } }] },
    { $set: { 'observation.invalidatedAt': now }, $min: { 'observation.expiresAt': now, 'observation.staleUntil': now } },
  );
  return { matched: result?.matchedCount ?? 0, modified: result?.modifiedCount ?? 0 };
}

/**
 * The monitored URL(s) a verified event says changed. Page monitors carry
 * `data.change.url`; sitemap monitors list added/removed URLs (a new or
 * removed page does not stale an existing one's content, so those are not
 * invalidated — only `url` of a page-target change is).
 */
function changedPageUrl(event) {
  const change = event?.data?.change;
  if (!change || change.target_type !== 'page') return null;
  return typeof change.url === 'string' ? change.url : null;
}

async function handleContextDevEvent(event, { now = new Date(), invalidate = invalidateEvidenceForSourceUrl } = {}) {
  if (event?.event !== 'change.detected') return { action: 'ignored', reason: 'not_a_change_event' };
  const url = changedPageUrl(event);
  if (!url) return { action: 'ignored', reason: 'not_a_page_change' };
  const result = await invalidate({ url, now });
  return { action: 'invalidated', url, ...result };
}

module.exports = {
  SIGNATURE_TOLERANCE_SECONDS,
  verifyContextDevSignature,
  urlVariants,
  invalidateEvidenceForSourceUrl,
  changedPageUrl,
  handleContextDevEvent,
};
