'use client';

import { useEffect, useRef } from 'react';
import VoiceWaveMark from './VoiceWaveMark';

/**
 * Scrollable conversation turns. Auto-follows the latest message unless the
 * user has scrolled up to read earlier content.
 *
 * mode:
 * - "chat" — bubble layout for immersive (user right, Trailie left)
 * - "plain" — labeled turns (fallback / compact lists)
 */
export default function VoiceConversation({
  transcript = [],
  emptyHint = null,
  className = '',
  compact = false,
  mode = 'chat',
}) {
  const scrollerRef = useRef(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 48;
  }

  if (!transcript.length) {
    return (
      <div className={`trailie-voice-convo ${className}`.trim()} ref={scrollerRef}>
        {emptyHint}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className={`trailie-voice-convo trailie-voice-convo--${mode}${compact ? ' trailie-voice-convo--compact' : ''} ${className}`.trim()}
      onScroll={onScroll}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {transcript.map((msg, i) => {
        const key = msg.id || `${msg.role}-${i}`;
        const isUser = msg.role === 'user';
        if (mode === 'chat') {
          return (
            <div
              key={key}
              className={`trailie-voice-turn trailie-voice-turn--${isUser ? 'user' : 'assistant'}`}
            >
              {!isUser && (
                <div className="trailie-voice-turn-meta">
                  <span className="trailie-voice-turn-mark" aria-hidden="true">
                    <VoiceWaveMark size="sm" tone="accent" />
                  </span>
                  <span className="trailie-voice-turn-name">
                    Trailie
                    {msg.streaming ? ' · speaking' : ''}
                    {msg.incomplete ? ' · interrupted' : ''}
                  </span>
                </div>
              )}
              <div className={`trailie-voice-bubble trailie-voice-bubble--${isUser ? 'user' : 'assistant'}`}>
                {msg.text}
                {msg.streaming ? <span className="trailie-voice-caret" /> : null}
              </div>
            </div>
          );
        }

        return (
          <div
            key={key}
            className={`trailie-voice-msg trailie-voice-msg--${isUser ? 'user' : 'assistant'}`}
          >
            <p className="trailie-voice-msg-role">
              {isUser ? 'You' : 'Trailie'}
              {msg.streaming ? ' · speaking' : ''}
              {msg.incomplete ? ' · interrupted' : ''}
            </p>
            <p className="trailie-voice-msg-text">
              {msg.text}
              {msg.streaming ? <span className="trailie-voice-caret" /> : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}
