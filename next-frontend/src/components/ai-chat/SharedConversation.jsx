'use client';

import { useMemo } from 'react';
import MessageBubble from './MessageBubble';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { getBestAvatar } from '@/utils/avatarGenerator';
import { filterParkChatImages } from '@/utils/parkChatImages';
import {
  attachCanonicalPlanToConversation,
  toRestoredTrailieResponseModel,
} from '@/lib/trailieResponseModel';

function resolveSharedUserAvatar(sharedBy) {
  if (!sharedBy) return null;
  if (sharedBy.avatar?.trim()) return sharedBy.avatar.trim();
  return getBestAvatar(
    {
      firstName: sharedBy.firstName,
      name: sharedBy.name,
      email: sharedBy.firstName || sharedBy.name || 'traveler',
    },
    {},
    'travel'
  );
}

export default function SharedConversation({ conversation, sharedBy, canonicalPlan = null }) {
  const userAvatar = useMemo(() => resolveSharedUserAvatar(sharedBy), [sharedBy]);
  const restoredConversation = useMemo(
    () => attachCanonicalPlanToConversation(conversation || [], canonicalPlan),
    [conversation, canonicalPlan],
  );

  if (restoredConversation.length === 0) return null;
  const openFollowupInTrailie = (prompt) => {
    window.location.assign(`/plan-ai?ask=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="space-y-1 sm:space-y-2">
      {restoredConversation.map((msg, i) => (
        msg.role === 'assistant' ? (
          <TrailieResponse
            key={msg.id || msg._id || i}
            response={toRestoredTrailieResponseModel({
              message: {
                ...msg,
                parkImages: filterParkChatImages(msg.parkImages || []),
              },
            })}
            hideActions
            onFollowup={openFollowupInTrailie}
          />
        ) : (
          <MessageBubble
            key={msg.id || msg._id || i}
            message={msg.content}
            isUser
            timestamp={msg.timestamp}
            hideActions
            hideAvatar={false}
            inlineAvatarLayout
            compact
            userAvatar={userAvatar}
          />
        )
      ))}
    </div>
  );
}
