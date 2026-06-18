'use client';

import { useMemo } from 'react';
import MessageBubble from './MessageBubble';
import { getBestAvatar } from '@/utils/avatarGenerator';
import { filterParkChatImages } from '@/utils/parkChatImages';

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

export default function SharedConversation({ conversation, sharedBy }) {
  const userAvatar = useMemo(() => resolveSharedUserAvatar(sharedBy), [sharedBy]);

  if (!conversation || conversation.length === 0) return null;

  return (
    <div className="space-y-1 sm:space-y-2">
      {conversation.map((msg, i) => (
        <MessageBubble
          key={msg.id || msg._id || i}
          message={msg.content}
          isUser={msg.role === 'user'}
          timestamp={msg.timestamp}
          hideActions={true}
          hideAvatar={false}
          inlineAvatarLayout={true}
          compact
          userAvatar={msg.role === 'user' ? userAvatar : null}
          hasLiveData={msg.hasLiveData || false}
          hasWebSearch={msg.hasWebSearch || false}
          liveDataParks={
            msg.parkNames?.length
              ? msg.parkNames
              : msg.parkName
                ? [msg.parkName]
                : []
          }
          parkImages={filterParkChatImages(msg.parkImages || [])}
          isStreaming={Boolean(msg.isStreaming)}
          isFinalizing={Boolean(msg.isFinalizing)}
        />
      ))}
    </div>
  );
}
