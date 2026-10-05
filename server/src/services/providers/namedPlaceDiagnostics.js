'use strict';

const PLACE_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
function sanitize(value) {
  let text = String(value || '');
  const key = process.env.GMAPS_SERVER_KEY;
  if (key) text = text.split(key).join('[redacted]');
  return text.replace(/AIza[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/IP address [a-f0-9:.]+/gi, 'IP address [redacted]')
    .replace(/(key|token|authorization|credential)[=: ]+[^\s&,;]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s]+/g, '[provider URL]').slice(0, 500);
}
function namedPlaceDiagnostics(error) {
  const response = error?.response;
  return {
    provider: 'named_place', endpoint: PLACE_ENDPOINT,
    httpStatus: response?.status || error?.httpStatus || null,
    apiStatus: sanitize(error?.googleStatus || response?.data?.error?.status || response?.data?.status) || null,
    apiCode: response?.data?.error?.code || null,
    message: sanitize(error?.googleMessage || response?.data?.error?.message || response?.data?.error_message || error?.message),
    exceptionClass: sanitize(error?.name || 'Error'), code: sanitize(error?.code) || null,
    requestId: sanitize(response?.headers?.['x-request-id'] || response?.headers?.['x-goog-request-id']) || null,
  };
}
module.exports = { PLACE_ENDPOINT, namedPlaceDiagnostics };
