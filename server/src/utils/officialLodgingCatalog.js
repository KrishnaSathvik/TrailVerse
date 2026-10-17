'use strict';

const entries = require('../data/officialLodgingCatalog.json');

function normalizeParkCode(parkCode) {
  return String(parkCode || '').trim().toLowerCase();
}

function listOfficialLodgingByParkCode(parkCode) {
  const code = normalizeParkCode(parkCode);
  if (!code) return [];

  return entries.filter((entry) => (
    entry.parkCode === code
    && entry.verifiedNone !== true
    && entry.locationClass === 'inside_park'
  ));
}

function hasOfficialLodgingCoverage(parkCode) {
  const code = normalizeParkCode(parkCode);
  if (!code) return false;

  return entries.some((entry) => (
    entry.parkCode === code
    && (entry.verifiedNone === true || entry.locationClass === 'inside_park')
  ));
}

module.exports = {
  listOfficialLodgingByParkCode,
  hasOfficialLodgingCoverage,
};
