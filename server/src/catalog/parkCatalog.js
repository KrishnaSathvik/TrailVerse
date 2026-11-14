/**
 * Load parks into the unified catalog (Phase 1.5).
 * Additional sources plug in here in Phase 3.
 */
const { getNpsService } = require('../services/npsService');
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
    // Prefer the in-memory full catalog: the live NPS ?stateCode= call can run
    // past the MCP server's 30s timeout when NPS is slow, which made every
    // state-filtered search fail with "Backend service unreachable".
    const cached = typeof getNpsService().getCachedParks === 'function' ? getNpsService().getCachedParks() : null;
    if (Array.isArray(cached) && cached.length) {
      npsParks = cached.filter(
        (p) => p.states && canonicalParkInState({ states: p.states }, state)
      );
      return npsRecordsToCanonical(npsParks);
    }
    try {
      npsParks = await getNpsService().getParksByState(state);
    } catch {
      const all = await getNpsService().getAllParks();
      npsParks = all.filter(
        (p) => p.states && canonicalParkInState(
          { states: p.states },
          state
        )
      );
    }
  } else {
    npsParks = await getNpsService().getAllParks();
  }

  return npsRecordsToCanonical(npsParks);
}

module.exports = {
  loadCanonicalParks,
};
