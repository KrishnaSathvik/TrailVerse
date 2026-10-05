'use strict';

const { buildPlanDocument } = require('../utils/trailiePipelineUtils');
const { validateTripWriteCandidate } = require('../validation/tripWriteContract');
const { resolveCanonicalResponsePersistence } = require('../utils/canonicalPersistence');

// Deliberately separate from the legacy controller's resolvePlanningStateForWrite:
// that routine parses conversation text again. Reuse canonical contracts and the
// existing TripPlan collection, with the version read BEFORE model execution.
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
      const old = snapshot.conversation || [];
      const nextId = Math.max(0, ...old.map(m => Number(m.id) || 0)) + 1;
      const assistant = { id: nextId + 1, role: 'assistant', content: response.content,
        responseId: response.responseId, responseVersion: response.responseVersion,
        contentHash: response.contentHash, itineraryHash: response.itineraryHash,
        provider: response.provider, model: response.model, hasItinerary: Boolean(mutation?.plan),
        ...(response.presentation ? { presentation: response.presentation } : {}),
        ...(mutation?.plan ? { canonicalPlan: response.itineraryData } : {}) };
      const conversation = [...old, { id: nextId, role: 'user', content: message }, assistant];
      let plan;
      if (mutation?.plan) {
        plan = buildPlanDocument({ itineraryData: mutation.plan, identity: response,
          parkName: snapshot.parkName, parkCode: snapshot.parkCode });
        // A patch carries old plan metadata. It cannot override this turn's identity.
        Object.assign(plan, { responseId: response.responseId, responseVersion: response.responseVersion,
          contentHash: response.contentHash, itineraryHash: response.itineraryHash });
      }
      const verdict = validateTripWriteCandidate({ operation: tripId ? 'update' : 'create', existingTrip: snapshot,
        incomingConversation: conversation, incomingPlan: plan, targetTripId: tripId });
      if (!verdict.ok) return { ok: false, status: 400, code: verdict.code };
      const decision = resolveCanonicalResponsePersistence({ incomingPlan: plan, incomingConversation: conversation,
        expectedPreviousVersion: response.responseVersion - 1, existingPlan: snapshot.plan, existingConversation: old });
      if (!decision.success) return { ok: false, status: 409, code: decision.reason };
      const values = { conversation, ...(plan ? { plan } : {}),
        ...(mutation ? { planningState: mutation.planningState } : {}) };
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
