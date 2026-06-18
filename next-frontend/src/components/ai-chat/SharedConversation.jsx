'use client';

import MessageBubble from './MessageBubble';

export default function SharedConversation({ conversation }) {
  if (!conversation || conversation.length === 0) return null;

  return (
    <div className="space-y-2 sm:space-y-3">
      {conversation.map((msg, i) => (
        <MessageBubble
          key={msg.id || msg._id || i}
          message={msg.content}
          isUser={msg.role === 'user'}
          timestamp={msg.timestamp}
          hideActions={true}
          hasLiveData={msg.hasLiveData || false}
          liveDataParks={
            msg.parkNames?.length
              ? msg.parkNames
              : msg.parkName
                ? [msg.parkName]
                : []
          }
          parkImages={msg.parkImages || []}
        />
      ))}
    </div>
  );
}
