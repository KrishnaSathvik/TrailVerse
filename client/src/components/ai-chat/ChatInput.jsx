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
    <form onSubmit={handleSubmit} className="w-full relative" aria-label="Chat composer">
      <div className="flex items-end gap-2 sm:gap-3">
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
            className="w-full px-4 sm:px-5 py-3 sm:py-3.5 pr-20 sm:pr-24 rounded-xl outline-none transition-all duration-200 disabled:opacity-50 resize-none max-h-32 scrollbar-thin text-sm sm:text-base leading-relaxed focus:ring-2 focus:ring-offset-0"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              minHeight: '48px',
              maxHeight: '120px',
              '--tw-ring-color': 'var(--accent-green)',
              '--tw-ring-opacity': '0.3'
            }}
          />

          {/* Action Buttons - Fixed positioning */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-opacity-80 transition-all duration-200 touch-manipulation"
              style={{ 
                color: 'var(--text-tertiary)',
                backgroundColor: 'transparent'
              }}
              title="Add emoji"
              onClick={() => onEmoji?.()}
              aria-label="Add emoji"
            >
              <Smile className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-opacity-80 transition-all duration-200 touch-manipulation"
              style={{ 
                color: 'var(--text-tertiary)',
                backgroundColor: 'transparent'
              }}
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
              <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>

        {/* Send Button - Improved design */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="px-3 sm:px-6 py-3 sm:py-3.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover:shadow-lg flex items-center gap-2 flex-shrink-0 justify-center touch-manipulation"
          style={{
            backgroundColor: message.trim() && !disabled ? 'var(--accent-green)' : 'var(--surface-hover)',
            color: message.trim() && !disabled ? 'white' : 'var(--text-tertiary)',
            minHeight: '48px',
            minWidth: '48px'
          }}
          aria-label="Send message"
        >
          <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline text-sm">Send</span>
        </button>
      </div>

      {/* Helper text */}
      {message.length > 1500 && (
        <div className="absolute -top-7 right-0 text-xs px-2 py-1 rounded-md" 
          style={{ 
            color: message.length > 2000 ? 'var(--error-red)' : 'var(--text-tertiary)',
            backgroundColor: 'var(--surface)'
          }}
        >
          {message.length} / 2000 characters
        </div>
      )}
    </form>
  );
};

export default ChatInput;
