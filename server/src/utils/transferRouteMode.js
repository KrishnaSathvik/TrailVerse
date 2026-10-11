'use strict';

// Transfer assumptions are not durable traveler facts. Never write to the input.
const alternatives = new Set(['walking', 'transit', 'bicycling', 'ferry', 'shuttle']);
const aliases = { walk: 'walking', bike: 'bicycling', drive: 'driving', car: 'driving' };
function drivingProhibited(transport = {}) {
  return transport.noCar === true || transport.rentalCar === false || transport.drivingPolicy === 'prohibited'
    || alternatives.has(aliases[transport.mode] || transport.mode);
}
function transferRouteMode(transport = {}, { requiredMode, requestedMode } = {}) {
  const explicit = aliases[transport.mode] || transport.mode;
  const required = aliases[requiredMode] || requiredMode;
  if (required) return { mode: required === 'driving' && drivingProhibited(transport) ? null : required, authority: 'grounded_requirement' };
  if (alternatives.has(explicit)) return { mode: explicit, authority: 'traveler' };
  if (drivingProhibited(transport)) {
    const reasonMode = { walking_only: 'walking', bike_only: 'bicycling', shuttle_only: 'shuttle' }[transport.drivingPolicyReason];
    return { mode: reasonMode || (alternatives.has(requestedMode) ? requestedMode : null), authority: 'traveler' };
  }
  if (transport.rentalCar === true || explicit === 'driving') return { mode: 'driving', authority: 'traveler' };
  return { mode: alternatives.has(requestedMode) ? requestedMode : 'driving', authority: 'practical_default' };
}
module.exports = { drivingProhibited, transferRouteMode };
