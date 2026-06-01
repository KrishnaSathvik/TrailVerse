/**
 * Load parks into the unified catalog (Phase 1.5).
 * Additional sources plug in here in Phase 3.
 */
const npsService = require('../services/npsService');
const { npsRecordsToCanonical } = require('../adapters/npsParkAdapter');
const { canonicalParkInState } = require('./canonicalPark');

/**
 * @param {{ state?: string }} [options]
 * @returns {Promise<import('./canonicalPark').CanonicalPark[]>}
 */
async function loadCanonicalParks(options = {}) {
  const { state } = options;
  let npsParks;

  if (state) {
    try {
      npsParks = await npsService.getParksByState(state);
    } catch {
      const all = await npsService.getAllParks();
      npsParks = all.filter(
        (p) => p.states && canonicalParkInState(
          { states: p.states },
          state
        )
      );
    }
  } else {
    npsParks = await npsService.getAllParks();
  }

  return npsRecordsToCanonical(npsParks);
}

module.exports = {
  loadCanonicalParks,
};
