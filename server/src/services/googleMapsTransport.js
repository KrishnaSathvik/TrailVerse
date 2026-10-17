'use strict';
const https = require('https');
const ipv4Agent = new https.Agent({ family: 4 });
const hosts = new Set(['maps.googleapis.com', 'places.googleapis.com', 'routes.googleapis.com']);

function useIPv4(url) {
  return process.env.GMAPS_FORCE_IPV4 === 'true' && hosts.has(new URL(url).hostname);
}

// Scope the opt-in to Google Maps Platform; leave all other providers unchanged.
function fetchGoogleMaps(url, options = {}) {
  return require('node-fetch')(url, useIPv4(url) ? { ...options, agent: ipv4Agent } : options);
}
function getGoogleMaps(url, options = {}) {
  return require('axios').get(url, useIPv4(url) ? { ...options, httpsAgent: ipv4Agent } : options);
}
module.exports = { fetchGoogleMaps, getGoogleMaps };
