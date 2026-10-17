'use strict';

const VOLUME_TIERS = {
  early: { min: 0, max: 49 },
  growing: { min: 50, max: 199 },
  healthy: { min: 200, max: 999 },
  large: { min: 1000, max: Infinity },
};

function volumeTier(totalActive) {
  const n = Number(totalActive) || 0;
  if (n < 50) return 'early';
  if (n < 200) return 'growing';
  if (n < 1000) return 'healthy';
  return 'large';
}

function publicLeadersAllowed(tier) {
  return tier === 'healthy' || tier === 'large';
}

function countsAllowed(tier) {
  return tier === 'large';
}

module.exports = {
  VOLUME_TIERS,
  volumeTier,
  publicLeadersAllowed,
  countsAllowed,
};
