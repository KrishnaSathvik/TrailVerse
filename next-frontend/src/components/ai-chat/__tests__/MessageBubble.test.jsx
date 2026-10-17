import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MessageBubble from '../MessageBubble';

describe('MessageBubble — Phase 7B conversation grammar', () => {
  afterEach(cleanup);

  it('renders inline user turns as compact, avatar-free messages', () => {
    const { container } = render(
      <MessageBubble message="Yellowstone or Grand Teton?" isUser inlineAvatarLayout timestamp="2026-09-08T12:00:00Z" />
    );

    expect(screen.getByRole('group', { name: 'Your message' })).toHaveClass('trailie-turn--user');
    expect(container.querySelector('.trailie-user-avatar')).toBeNull();
    expect(container.querySelector('.chat-message-bubble--user')).toHaveClass('trailie-user-message');
  });

  it('renders the opening as an open Trailie introduction without a chat-card wrapper', () => {
    const { container } = render(
      <MessageBubble
        message={'## Where are you thinking about going?\n\nAsk about a park, compare places, figure out permits, or start planning a trip.'}
        inlineAvatarLayout
        variant="opening"
      />
    );

    expect(screen.getByRole('heading', { name: 'Where are you thinking about going?' })).toBeInTheDocument();
    expect(container.querySelector('.trailie-opening')).toBeInTheDocument();
    expect(container.querySelector('.trailie-opening.chat-message-bubble')).toBeNull();
  });
});
