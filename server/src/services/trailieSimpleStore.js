'use strict';

const { DEFAULT_TITLE, tripTitle } = require('../utils/tripIdentity');
const { prepareCanonicalStoreCommit } = require('./trailieCanonicalCommit');

// Deliberately separate from the legacy controller's resolvePlanningStateForWrite:
// that routine parses conversation text again. Reuse canonical contracts and the
// existing TripPlan collection, with the version read BEFORE model execution.
// Write-candidate + response-identity checks are shared with the guest store
// via prepareCanonicalStoreCommit (docs/trailie-architecture.md Step 3).
function createSimpleTripStore({ TripPlan, notify = () => {} } = {}) {
  if (!TripPlan) throw new TypeError('Explicit TripPlan model required');
  return {
    async load({ userId, tripId }) {
      if (!userId) throw new TypeError('Authenticated owner required');
      if (!tripId) return { userId: String(userId), plan: null, conversation: [], planningState: null };
      const trip = await TripPlan.findOne({ _id: tripId, userId }).lean();
      if (!trip) throw Object.assign(new Error('Trip unavailable'), { status: 404 });
      return JSON.parse(JSON.stringify(trip));
    },
    async commit({ userId, tripId, snapshot, response, message, mutation, signal }) {
      if (signal?.aborted) return { ok: false, status: 499 };
      if (!userId || String(snapshot.userId) !== String(userId)
        || (tripId && String(snapshot._id) !== String(tripId))) return { ok: false, status: 403 };
      const prepared = prepareCanonicalStoreCommit({
        snapshot,
        response,
        message,
        mutation,
        operation: tripId ? 'update' : 'create',
        targetTripId: tripId || null,
      });
      if (!prepared.ok) return prepared;
      const { conversation, plan } = prepared;
      const values = { conversation, ...(plan ? { plan } : {}),
        ...(mutation ? { planningState: mutation.planningState } : {}) };
      if (plan) {
        // Name the trip after its destinations, never over a title the traveler chose.
        const derivedBefore = snapshot.plan ? tripTitle(snapshot.plan, snapshot.plan.destinations || []) : null;
        if (!snapshot.title || snapshot.title === DEFAULT_TITLE || snapshot.title === derivedBefore) {
          values.title = tripTitle(plan, plan.destinations || []);
        }
        const primary = plan.destinations?.[0];
        values.parkName = primary ? primary.name : plan.parkName || snapshot.parkName || null;
        values.parkCode = primary ? primary.parkCode : snapshot.parkCode || null;
      }
      let saved;
      if (!tripId) saved = await TripPlan.create({ userId, ...values });
      else saved = await TripPlan.findOneAndUpdate({ _id: tripId, userId,
        updatedAt: snapshot.updatedAt || null,
        ...(snapshot.__v == null || snapshot.__v === 0 ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] } : { __v: snapshot.__v }),
      }, { $set: values, $inc: { __v: 1 } }, { new: true });
      if (!saved) return { ok: false, status: 409, code: 'canonical_write_conflict' };
      try { await notify({ userId, trip: saved }); } catch { /* accepted write remains accepted */ }
      return { ok: true, tripId: String(saved._id), canonicalPlan: plan || null };
    },
  };
}

module.exports = { createSimpleTripStore };
