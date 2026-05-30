import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from '@components/icons';

const INPUT_MIN_HEIGHT = 54;
const INPUT_MAX_HEIGHT = 132;
const SEND_SIZE = 54;

const ChatInput = ({
  onSend,
  disabled = false,
  placeholder = 'Type your message...',
  initialValue = '',
}) => {
  const [message, setMessage] = useState(initialValue);
  const [isComposing, setIsComposing] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [isMultiline, setIsMultiline] = useState(false);
  const inputRef = useRef(null);
  const singleLineHeightRef = useRef(INPUT_MIN_HEIGHT);

  const measureInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    const scrollHeight = Math.min(
      Math.max(el.scrollHeight, INPUT_MIN_HEIGHT),
      INPUT_MAX_HEIGHT
    );

    if (!message.trim()) {
      singleLineHeightRef.current = scrollHeight;
    }

    const baseline = singleLineHeightRef.current;
    const hasNewline = message.includes('\n');
    const multiline = hasNewline || scrollHeight > baseline + 2;
    const nextHeight = multiline ? scrollHeight : baseline;

    el.style.height = `${nextHeight}px`;
    setInputHeight(nextHeight);
    setIsMultiline(multiline);
  }, [message]);

  useEffect(() => {
    measureInput();
  }, [measureInput]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      if (!message.trim()) {
        measureInput();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureInput, message]);

  const submit = () => {
    const text = message.trim();
    if (!text || disabled) return;
    onSend?.(text);
    setMessage('');
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e) => {
    if (isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = Boolean(message.trim()) && !disabled;

  return (
    <form onSubmit={handleSubmit} className="relative w-full" aria-label="Chat composer">
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <div
        className={`flex gap-2 sm:gap-3 ${isMultiline ? 'items-end' : 'items-center'}`}
      >
        <textarea
          id="chat-input"
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="box-border min-w-0 flex-1 resize-none rounded-2xl px-4 py-3 text-sm leading-normal outline-none transition-all duration-200 disabled:opacity-50 scrollbar-thin focus:ring-2 focus:ring-offset-0 sm:px-5 sm:text-base"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            height: `${inputHeight}px`,
            minHeight: `${INPUT_MIN_HEIGHT}px`,
            maxHeight: `${INPUT_MAX_HEIGHT}px`,
            boxShadow: 'none',
            '--tw-ring-color': 'var(--accent-green)',
            '--tw-ring-opacity': '0.3',
          }}
        />

        <button
          type="submit"
          disabled={!canSend}
          className="box-border flex shrink-0 items-center justify-center rounded-2xl font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 touch-manipulation"
          style={{
            width: `${SEND_SIZE}px`,
            height: `${SEND_SIZE}px`,
            backgroundColor: canSend ? 'var(--accent-green)' : 'var(--surface-hover)',
            color: canSend ? 'white' : 'var(--text-tertiary)',
            boxShadow: canSend ? '0 10px 24px rgba(67, 160, 106, 0.22)' : 'none',
          }}
          aria-label="Send message"
        >
          <Send className="h-5 w-5 shrink-0" weight="bold" />
        </button>
      </div>

      {message.length > 1500 && (
        <div
          className="absolute -top-7 right-0 text-xs px-2 py-1 rounded-md"
          style={{
            color: message.length > 2000 ? 'var(--error-red)' : 'var(--text-tertiary)',
            backgroundColor: 'var(--surface)',
          }}
        >
          {message.length} / 2000 characters
        </div>
      )}
    </form>
  );
};

export default ChatInput;
