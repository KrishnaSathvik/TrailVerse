'use strict';

/**
 * Silent NPS match for Where Next raw typed text.
 * Unique exact fullName, or unique fullName prefix among search hits.
 * Ambiguous prefixes (Glacier vs Glacier Bay) stay unmatched.
 */

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parkFullName(park) {
  return String(park?.fullName || park?.name || '').trim();
}

function parkCodeOf(park) {
  return String(park?.parkCode || park?.id || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {object[]} parks API-shaped parks from executeParkSearch
 * @param {string} rawInput
 * @returns {object|null} matched park or null
 */
function silentMatchFromSearchHits(parks, rawInput) {
  const q = normalizeQuery(rawInput);
  if (!q || q.length < 2) return null;

  const list = Array.isArray(parks) ? parks : [];
  const exact = list.filter((park) => parkFullName(park).toLowerCase() === q);
  if (exact.length === 1) return exact[0];

  const prefix = list.filter((park) => {
    const name = parkFullName(park).toLowerCase();
    return name === q || name.startsWith(`${q} `) || name.startsWith(q);
  });
  if (prefix.length === 1) return prefix[0];
  return null;
}

function toMatchPayload(park) {
  if (!park) {
    return {
      parkCode: null,
      canonicalType: null,
      canonicalName: null,
    };
  }
  return {
    parkCode: parkCodeOf(park) || null,
    canonicalType: 'nps',
    canonicalName: parkFullName(park) || null,
  };
}

module.exports = {
  normalizeQuery,
  silentMatchFromSearchHits,
  toMatchPayload,
  parkFullName,
  parkCodeOf,
};
