import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SuggestedPrompts from '../SuggestedPrompts';

describe('SuggestedPrompts — Phase 7B opening', () => {
  afterEach(cleanup);

  it('uses quiet text-forward starter rows instead of icon cards', () => {
    const { container } = render(
      <SuggestedPrompts
        prompts={[
          { text: 'Plan 3 days in Olympic', icon: () => <svg data-testid="legacy-icon" /> },
          { text: 'Yellowstone or Grand Teton?' },
        ]}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(container.querySelectorAll('.trailie-starter-prompt')).toHaveLength(2);
    expect(screen.queryByTestId('legacy-icon')).toBeNull();
  });

  it('shows a short label when provided and still sends the full text', () => {
    const onSelect = vi.fn();

    render(
      <SuggestedPrompts
        prompts={[{ label: 'Bryce or Arches?', text: 'Which is better for a relaxed first national park trip: Bryce Canyon or Arches?' }]}
        onSelect={onSelect}
      />
    );

    const button = screen.getByRole('button', { name: 'Use prompt: Bryce or Arches?' });
    expect(button).toHaveTextContent('Bryce or Arches?');
    expect(button).not.toHaveTextContent('Which is better');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(
      'Which is better for a relaxed first national park trip: Bryce Canyon or Arches?'
    );
  });

  it('shows the prompt text when no short label is provided', () => {
    const onSelect = vi.fn();

    render(
      <SuggestedPrompts
        prompts={[
          {
            text: 'Which is better for a relaxed first national park trip: Bryce Canyon or Arches?',
          },
        ]}
        onSelect={onSelect}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Use prompt: Which is better for a relaxed first national park trip: Bryce Canyon or Arches?',
    });
    expect(button).toHaveTextContent(
      'Which is better for a relaxed first national park trip: Bryce Canyon or Arches?'
    );
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      'Which is better for a relaxed first national park trip: Bryce Canyon or Arches?'
    );
  });
});
