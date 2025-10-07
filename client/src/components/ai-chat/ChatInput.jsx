import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';

const ChatInput = ({
  onSend,
  onAttach,           // NEW (optional)
  onEmoji,            // NEW (optional)
  disabled = false,
  placeholder = "Type your message..."
}) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef(null);

  // autosize once per value change (no infinite growth)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [message]);

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
    if (isComposing) return; // don't send mid-composition
    // Cmd/Ctrl+Enter = send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    // Enter to send, Shift+Enter to break
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = (e) => {
    // Optional: support pasting images
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file && onAttach) onAttach(file);
        e.preventDefault();
        break;
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative" aria-label="Chat composer">
      <div className="flex items-end gap-3">
        {/* Input Container */}
        <div className="flex-1 relative">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="w-full px-4 py-3 pr-12 rounded-xl outline-none transition disabled:opacity-50 resize-none max-h-32 scrollbar-thin"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          />

          {/* Action Buttons */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
              title="Add emoji"
              onClick={() => onEmoji?.()}
              aria-label="Add emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
              title="Attach file"
              onClick={() => {
                // quick file picker for attachments
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '*/*';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (file && onAttach) onAttach(file);
                };
                input.click();
              }}
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
          style={{
            backgroundColor: 'var(--accent-green)',
            color: 'white'
          }}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {/* Character Count (optional) */}
      {message.length > 0 && (
        <div className="absolute -top-6 right-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {message.length} characters
        </div>
      )}
    </form>
  );
};

export default ChatInput;
