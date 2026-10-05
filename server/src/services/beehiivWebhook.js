'use strict';

const crypto = require('crypto');

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function headerValue(headers, name) {
  if (!headers) return '';
  const direct = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(direct)) return String(direct[0] || '');
  return String(direct || '');
}

function verifyBeehiivWebhook({ secret, headers, rawBody, now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const id = headerValue(headers, 'svix-id');
  const timestamp = headerValue(headers, 'svix-timestamp');
  const signatureHeader = headerValue(headers, 'svix-signature');
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');

  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing_headers' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp' };
  }

  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const candidates = signatureHeader.split(/\s+/).map((part) => part.replace(/^v1,/, ''));

  const expectedBuf = Buffer.from(expected);
  const match = candidates.some((candidate) => {
    const got = Buffer.from(candidate);
    return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
  });

  return match ? { ok: true } : { ok: false, reason: 'signature' };
}

module.exports = {
  TIMESTAMP_TOLERANCE_SECONDS,
  verifyBeehiivWebhook,
};
