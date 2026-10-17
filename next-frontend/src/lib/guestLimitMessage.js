/** Compact guest pause copy; trip context must come from an actual artifact. */

export function buildGuestLimitReset({ timeUntilReset } = {}) {
  const resetWhen = timeUntilReset
    ? `in ${timeUntilReset}`
    : 'in about 48 hours';

  return `You’ll get 5 more guest messages ${resetWhen}.`;
}

export function buildGuestLimitIntro({ hasTrip = false } = {}) {
  return hasTrip
    ? 'Your trip is ready to continue.\n\nSign in free to open your itinerary and map, save the trip, and keep planning.'
    : 'You’ve used your 5 free messages.\n\nSign in to keep chatting and keep this conversation.';
}
