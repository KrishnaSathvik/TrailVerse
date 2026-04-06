import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Microphone } from '@components/icons';

const ChatInput = ({
  onSend,
  onAttach,           // NEW (optional)
  disabled = false,
  placeholder = "Type your message...",
  initialValue = ''
}) => {
  const [message, setMessage] = useState(initialValue);
  const [isComposing, setIsComposing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Check for browser SpeechRecognition support
  const SpeechRecognition = typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

  const handleMicClick = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setMessage(prev => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.onend = () => setIsListening(false);

    recognition.onerror = () => setIsListening(false);

    recognition.start();
  };

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
    <form onSubmit={handleSubmit} className="relative w-full" aria-label="Chat composer">
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
            className="w-full resize-none rounded-2xl px-4 py-3 pr-24 text-sm leading-relaxed outline-none transition-all duration-200 disabled:opacity-50 scrollbar-thin focus:ring-2 focus:ring-offset-0 sm:px-5 sm:pr-28 sm:text-base"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              minHeight: '54px',
              maxHeight: '132px',
              boxShadow: 'none',
              '--tw-ring-color': 'var(--accent-green)',
              '--tw-ring-opacity': '0.3'
            }}
          />

          {/* Action Buttons - Fixed positioning */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {SpeechRecognition && (
              <button
                type="button"
                className={`p-1.5 sm:p-2 rounded-lg hover:bg-opacity-80 transition-all duration-200 touch-manipulation ${isListening ? 'animate-pulse' : ''}`}
                style={{
                  color: isListening ? 'var(--accent-green)' : 'var(--text-tertiary)',
                  backgroundColor: 'transparent'
                }}
                title={isListening ? 'Stop listening' : 'Voice input'}
                onClick={handleMicClick}
                aria-label={isListening ? 'Stop listening' : 'Voice input'}
              >
                <Microphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            )}
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

        {/* Send Button - Aligned with input */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-xl font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 touch-manipulation sm:h-[54px] sm:w-[54px]"
          style={{
            backgroundColor: message.trim() && !disabled ? 'var(--accent-green)' : 'var(--surface-hover)',
            color: message.trim() && !disabled ? 'white' : 'var(--text-tertiary)',
            boxShadow: message.trim() && !disabled
              ? '0 10px 24px rgba(67, 160, 106, 0.22)'
              : 'none'
          }}
          aria-label="Send message"
        >
          <Send className="h-5 w-5" />
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
