'use strict';

const DEFAULT_API_BASE = 'https://api.beehiiv.com/v2';

function readConfig() {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  return {
    apiKey: apiKey || '',
    publicationId: publicationId || '',
    apiBase: process.env.BEEHIIV_API_BASE || DEFAULT_API_BASE,
    webhookSecret: process.env.BEEHIIV_WEBHOOK_SECRET || '',
    configured: Boolean(apiKey && publicationId),
  };
}

function isConfigured() {
  return readConfig().configured;
}

function webhookConfigured() {
  return Boolean(readConfig().webhookSecret);
}

module.exports = {
  DEFAULT_API_BASE,
  readConfig,
  isConfigured,
  webhookConfigured,
};
