'use client';

import { Send } from '@components/icons';

const INPUT_MIN_HEIGHT = 54;
const SEND_SIZE = 54;

/** Read-only composer that mirrors Plan AI ChatInput while the demo “types” a question. */
export default function DemoChatComposer({
  value = '',
  isTyping = false,
  placeholder = 'Ask me about your trip...',
}) {
  const canSend = Boolean(value.trim());

  return (
    <div className="relative w-full" aria-hidden="true">
      <div className={`flex gap-2 sm:gap-3 ${value.includes('\n') ? 'items-end' : 'items-center'}`}>
        <div
          className="box-border min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm leading-normal sm:px-5 sm:text-base whitespace-pre-wrap break-words"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border)',
            color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
            minHeight: `${INPUT_MIN_HEIGHT}px`,
          }}
        >
          {value || placeholder}
          {isTyping && value && (
            <span
              className="inline-block w-0.5 h-[1em] ml-0.5 align-text-bottom animate-pulse"
              style={{ backgroundColor: 'var(--accent-green)' }}
            />
          )}
        </div>

        <button
          type="button"
          tabIndex={-1}
          className="box-border flex shrink-0 items-center justify-center rounded-2xl font-semibold transition-all duration-200"
          style={{
            width: `${SEND_SIZE}px`,
            height: `${SEND_SIZE}px`,
            backgroundColor: canSend ? 'var(--accent-green)' : 'var(--surface-hover)',
            color: canSend ? 'white' : 'var(--text-tertiary)',
            boxShadow: canSend ? '0 10px 24px rgba(67, 160, 106, 0.22)' : 'none',
          }}
          aria-hidden="true"
        >
          <Send className="h-5 w-5 shrink-0" weight="bold" />
        </button>
      </div>
    </div>
  );
}
