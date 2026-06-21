/** Trailie-voice intro for the guest 6th-message limit reply */

export function buildGuestLimitIntro({ timeUntilReset } = {}) {
  const resetWhen = timeUntilReset
    ? `in ${timeUntilReset}`
    : 'in about 48 hours';

  return `You've reached the 5-message guest limit for now.

Your trip plan is off to a good start. Sign in for free to keep planning from here — I'll save this chat, and you can share the itinerary or export a PDF when you're ready.

Not ready to sign in? No worries. This conversation stays on your device, and you'll get 5 more guest messages ${resetWhen}.`;
}
