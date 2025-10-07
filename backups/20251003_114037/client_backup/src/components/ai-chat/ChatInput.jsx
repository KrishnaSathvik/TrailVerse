import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';

const ChatInput = ({ onSend, disabled = false, placeholder = "Type your message..." }) => {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-end gap-3">
        {/* Input Container */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
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
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
          />
          
          {/* Action Buttons */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
              title="Add emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              style={{ color: 'var(--text-tertiary)' }}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="px-6 py-3 rounded-xl bg-forest-500 hover:bg-forest-600 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {/* Character Count (optional) */}
      {message.length > 0 && (
        <div className="absolute -top-6 right-0 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {message.length} characters
        </div>
      )}
    </form>
  );
};

export default ChatInput;
