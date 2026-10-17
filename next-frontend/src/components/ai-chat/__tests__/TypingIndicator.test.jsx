import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TypingIndicator from '../TypingIndicator';

describe('TypingIndicator — Phase 6A copy and terminology', () => {
  it('the default text prop is neutral, never "AI is thinking..."', () => {
    render(<TypingIndicator />);
    expect(screen.getByText('Working on that…')).toBeTruthy();
    expect(screen.queryByText(/AI is thinking/i)).toBeNull();
  });

  it('an explicit text prop is rendered as given', () => {
    render(<TypingIndicator text="Building a realistic plan..." />);
    expect(screen.getByText('Building a realistic plan...')).toBeTruthy();
  });

  it('never renders the NPS Data / Weather / Web Search source badges, even when sources are supplied', () => {
    const { container } = render(
      <TypingIndicator text="Working on that…" sources={['nps', 'weather', 'web']} />
    );
    expect(screen.queryByText('NPS Data')).toBeNull();
    expect(screen.queryByText('Weather')).toBeNull();
    expect(screen.queryByText('Web Search')).toBeNull();
    expect(container.textContent).not.toMatch(/NPS Data|Web Search/i);
  });

  it('renders with no sources at all without throwing', () => {
    expect(() => render(<TypingIndicator text="Working on that…" />)).not.toThrow();
  });

  it('the inline avatar layout also never renders source badges', () => {
    const { container } = render(
      <TypingIndicator text="Working on that…" sources={['nps', 'weather', 'web']} inlineAvatarLayout />
    );
    expect(screen.queryByText('NPS Data')).toBeNull();
    expect(container.querySelector('.trailie-status-row')).toBeInTheDocument();
    expect(container.querySelector('.chat-message-bubble')).toBeNull();
  });

  it('rendered output never names a model or provider', () => {
    const { container } = render(<TypingIndicator sources={['web']} />);
    expect(container.textContent).not.toMatch(/gpt|claude|openai|anthropic|luna|terra/i);
  });
});
