/** Trailie-voice intro for the guest 6th-message limit reply */

export function buildGuestLimitIntro({ timeUntilReset } = {}) {
  const resetClause = timeUntilReset
    ? `in ${timeUntilReset}`
    : 'in about 48 hours';

  return `You've used your **5 free guest messages** for this session.

We've got a good start on this trip. Create a free account to keep planning with Trailie and save this exact conversation for later. You'll also be able to share the trip with your travel crew and export a PDF when the itinerary feels ready.

Not ready yet? This chat is saved on this device — come back to Trailie anytime. Your next 5 guest messages reset ${resetClause}.`;
}
