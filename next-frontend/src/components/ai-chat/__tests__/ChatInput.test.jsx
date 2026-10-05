import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatInput from '../ChatInput';

describe('ChatInput — Phase 7B composer', () => {
  afterEach(cleanup);

  it('presents the textarea and send action as one composer surface', () => {
    const { container } = render(<ChatInput onSend={vi.fn()} placeholder="Ask Trailie about a park or trip…" />);
    expect(container.querySelector('.trailie-composer')).toBeInTheDocument();
    expect(container.querySelector('.trailie-composer__surface')).toContainElement(
      screen.getByRole('textbox', { name: 'Message' })
    );
    expect(container.querySelector('.trailie-composer__surface')).toContainElement(
      screen.getByRole('button', { name: 'Send message' })
    );
  });

  it('sends with Enter and keeps Shift+Enter for a new line', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const input = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(input, { target: { value: 'Plan a quiet weekend' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Plan a quiet weekend');
  });

  it('keeps the 44px send control and 54–132px textarea growth', () => {
    const { container } = render(<ChatInput onSend={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send.style.width).toBe('44px');
    expect(send.style.height).toBe('44px');
    const textarea = screen.getByRole('textbox', { name: 'Message' });
    expect(textarea.style.minHeight).toBe('54px');
    expect(textarea.style.maxHeight).toBe('132px');
    expect(container.querySelector('.trailie-composer')).toBeInTheDocument();
  });
});
