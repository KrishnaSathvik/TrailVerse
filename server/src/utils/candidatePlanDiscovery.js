'use strict';

/**
 * WP-TU Phase 4 Task 10 — candidate-plan discovery.
 *
 * Pure DATA RETRIEVAL, not interpretation: fetches the traveler's OTHER saved
 * plans as bounded metadata, in the exact `candidatePlans[]` shape Task 9's
 * `resolveTargetTripId` already expects
 * (`{ id, title, parkCode, parkName, formData: {startDate, endDate},
 * planningState: {destination}, status }`). No target decision happens
 * here — that is still Task 9's pure resolver, called later in
 * `trailieV2ExecutionService.js` once classification exists. This can live
 * in `prepareChatContext` (which runs BEFORE classification) precisely
 * because it decides nothing; it only looks up rows.
 */

async function fetchCandidatePlans({ userId, excludeTripId = null, logPrefix = '[AI]' } = {}) {
  if (!userId) return [];
  try {
    // eslint-disable-next-line global-require
    const TripPlan = require('../models/TripPlan');
    const query = { userId, status: 'active' };
    if (excludeTripId) query._id = { $ne: excludeTripId };
    const docs = await TripPlan.find(query)
      .select('title parkCode parkName formData planningState status')
      .limit(50)
      .lean();
    return docs.map((doc) => ({
      id: String(doc._id),
      title: doc.title || null,
      parkCode: doc.parkCode || null,
      parkName: doc.parkName || null,
      formData: {
        startDate: doc.formData?.startDate || null,
        endDate: doc.formData?.endDate || null,
      },
      planningState: {
        destination: doc.planningState?.destination
          ? {
            parkCode: doc.planningState.destination.parkCode || null,
            parkName: doc.planningState.destination.parkName || null,
          }
          : null,
      },
      status: doc.status || 'active',
    }));
  } catch (err) {
    console.warn(`${logPrefix} candidate-plan discovery failed:`, err.message);
    return [];
  }
}

module.exports = { fetchCandidatePlans };
