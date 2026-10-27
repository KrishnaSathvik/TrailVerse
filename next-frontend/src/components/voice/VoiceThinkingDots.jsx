'use client';

import { useEffect, useState } from 'react';

/**
 * Neutral processing indicator — three charcoal dots.
 * Used for Thinking and Checking park information (not audio).
 */
export default function VoiceThinkingDots({ className = '', size = 'md' }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const sync = () => setReduced(Boolean(mq.matches));
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  const dim = size === 'lg' ? 8 : size === 'sm' ? 5 : 6;

  return (
    <span
      className={`trailie-voice-think-dots${reduced ? ' is-reduced' : ''} ${className}`.trim()}
      aria-hidden="true"
      style={{ '--dot-size': `${dim}px` }}
    >
      <i /><i /><i />
    </span>
  );
}
