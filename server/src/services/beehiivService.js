'use strict';

const axios = require('axios');
const { isConfigured, readConfig } = require('../config/beehiiv');

function errorCode(err) {
  if (err && err.response && err.response.status) return `http_${err.response.status}`;
  if (err && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) return 'timeout';
  return 'network';
}

function logBeehiivFailure(action, err) {
  console.error('[beehiiv]', action, { code: errorCode(err) });
}

async function beehiivRequest({ method, path, data }) {
  const config = readConfig();
  if (!config.configured) return { skipped: true, data: null };

  const response = await axios({
    method,
    url: `${config.apiBase}/publications/${config.publicationId}${path}`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    data,
    timeout: 15000,
  });

  return { skipped: false, data: response.data && response.data.data ? response.data.data : response.data };
}

async function getSubscriber(email) {
  if (!isConfigured() || !email) return null;
  try {
    const result = await beehiivRequest({
      method: 'get',
      path: `/subscriptions/by_email/${encodeURIComponent(email)}`,
    });
    return result.data || null;
  } catch (err) {
    if (err && err.response && err.response.status === 404) return null;
    logBeehiivFailure('getSubscriber', err);
    throw err;
  }
}

async function upsertSubscriber({ email, source, utmSource, utmMedium, utmCampaign, pagePath }) {
  if (!isConfigured()) return { skipped: true, subscriber: null };

  const payload = {
    email,
    reactivate_existing: true,
    send_welcome_email: false,
    double_opt_override: 'off',
  };
  if (utmSource || source) payload.utm_source = utmSource || source;
  if (utmMedium) payload.utm_medium = utmMedium;
  if (utmCampaign) payload.utm_campaign = utmCampaign;
  if (pagePath) payload.referring_site = pagePath;

  try {
    const created = await beehiivRequest({
      method: 'post',
      path: '/subscriptions',
      data: payload,
    });
    return { skipped: false, subscriber: created.data };
  } catch (err) {
    const status = err && err.response && err.response.status;
    if (status === 400 || status === 409 || status === 422) {
      const existing = await getSubscriber(email);
      if (existing) return { skipped: false, subscriber: existing };
    }
    logBeehiivFailure('upsertSubscriber', err);
    throw err;
  }
}

async function unsubscribeSubscriber(email) {
  if (!isConfigured() || !email) return { skipped: true, subscriber: null };
  try {
    const result = await beehiivRequest({
      method: 'put',
      path: `/subscriptions/by_email/${encodeURIComponent(email)}`,
      data: { unsubscribe: true },
    });
    return { skipped: false, subscriber: result.data };
  } catch (err) {
    if (err && err.response && err.response.status === 404) {
      return { skipped: false, subscriber: null, missing: true };
    }
    logBeehiivFailure('unsubscribeSubscriber', err);
    throw err;
  }
}

module.exports = {
  isConfigured,
  errorCode,
  getSubscriber,
  upsertSubscriber,
  unsubscribeSubscriber,
};
