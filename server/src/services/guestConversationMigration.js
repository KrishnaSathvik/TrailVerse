'use strict';
const { buildGuestTripMigrationPayload } = require('../utils/guestCanonicalPlanMigration');

// Both documents commit together. Retrying a completed handoff returns the same trip.
async function migrateGuestConversation({ AnonymousSession, TripPlan, anonymousId, userId, keyTopics = [] }) {
  const transaction = await AnonymousSession.db.startSession();
  let tripId;
  try {
    await transaction.withTransaction(async () => {
      const guest = await AnonymousSession.findOne({ anonymousId }).session(transaction);
      if (!guest) throw Object.assign(new Error('Guest conversation not found'), { status: 404 });
      if (guest.isConverted) {
        if (String(guest.convertedUserId) !== String(userId) || !guest.convertedTripId) {
          throw Object.assign(new Error('Guest conversation already converted'), { status: 409 });
        }
        tripId = guest.convertedTripId;
        return;
      }
      if (guest.turns?.some(turn => turn.status === 'pending')) {
        throw Object.assign(new Error('Wait for the current response before signing in'), { status: 409 });
      }
      const [trip] = await TripPlan.create([buildGuestTripMigrationPayload({ session: guest, userId, keyTopics: typeof keyTopics === 'function' ? keyTopics(guest.messages) : keyTopics })], { session: transaction });
      guest.isConverted = true;
      guest.convertedUserId = userId;
      guest.convertedTripId = trip._id;
      guest.convertedAt = new Date();
      await guest.save({ session: transaction });
      tripId = trip._id;
    });
    return tripId;
  } finally {
    await transaction.endSession();
  }
}
module.exports = { migrateGuestConversation };
