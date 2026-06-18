'use client';

import MessageBubble from '@components/ai-chat/MessageBubble';
import GuestLimitMessageExtras from './GuestLimitMessageExtras';
import { buildGuestLimitIntro } from '@/lib/guestLimitMessage';

/** Guest limit message styling (e.g. legacy resume page) */
export default function GuestLimitFooter({
  onSignup,
  timeUntilReset = null,
  parkName,
}) {
  return (
    <MessageBubble
      message={buildGuestLimitIntro({ timeUntilReset, parkName })}
      isUser={false}
      hideActions
      inlineAvatarLayout
      linkifyParks={false}
      afterContent={<GuestLimitMessageExtras onSignup={onSignup} />}
    />
  );
}
