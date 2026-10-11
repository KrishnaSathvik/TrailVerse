'use strict';
const { selectGuestConversation, validateConversationId } = require('../utils/guestConversationScope');
const { buildGuestTripMigrationPayload } = require('../utils/guestCanonicalPlanMigration');

// Both documents commit together. Retrying a completed handoff returns the same trip.
async function migrateGuestConversation({ AnonymousSession, TripPlan, anonymousId, userId, keyTopics = [], conversationId = null }) {
  conversationId = validateConversationId(conversationId);
  const transaction = await AnonymousSession.db.startSession();
  let tripId;
  try {
    await transaction.withTransaction(async () => {
      const guest = await AnonymousSession.findOne({ anonymousId }).session(transaction);
      if (!guest) throw Object.assign(new Error('Guest conversation not found'), { status: 404 });
      const conversion = conversationId ? guest.conversationConversions?.[conversationId] : null;
      if (conversion) {
        if (String(conversion.userId) !== String(userId)) throw Object.assign(new Error('Guest conversation already converted'), { status: 409 });
        tripId = conversion.tripId;
        return;
      }
      if (!conversationId && guest.isConverted) {
        if (String(guest.convertedUserId) !== String(userId) || !guest.convertedTripId) {
          throw Object.assign(new Error('Guest conversation already converted'), { status: 409 });
        }
        tripId = guest.convertedTripId;
        return;
      }
      if (guest.turns?.some(turn => turn.status === 'pending')) {
        throw Object.assign(new Error('Wait for the current response before signing in'), { status: 409 });
      }
      const scoped = selectGuestConversation(guest, conversationId);
      if (!scoped.messages.length) throw Object.assign(new Error('Guest conversation not found'), { status: 404 });
      const selected = { ...(guest.toObject ? guest.toObject() : guest), ...scoped,
        ...(conversationId ? { formData: {}, parkName: undefined, parkCode: undefined, entryContext: null } : {}) };
      const [trip] = await TripPlan.create([buildGuestTripMigrationPayload({ session: selected, userId, keyTopics: typeof keyTopics === 'function' ? keyTopics(scoped.messages) : keyTopics })], { session: transaction });
      if (conversationId) {
        guest.conversationConversions = { ...guest.conversationConversions, [conversationId]: { userId: String(userId), tripId: String(trip._id) } };
        guest.markModified?.('conversationConversions');
      } else {
      guest.isConverted = true;
      guest.convertedUserId = userId;
      guest.convertedTripId = trip._id;
      guest.convertedAt = new Date();
      }
      await guest.save({ session: transaction });
      tripId = trip._id;
    });
    return tripId;
  } finally {
    await transaction.endSession();
  }
}
module.exports = { migrateGuestConversation };
