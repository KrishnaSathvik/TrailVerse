'use client';

import { useEffect, useState } from 'react';

/**
 * Lightweight bar waveform driven by a 0–1 audioLevel.
 * Falls back to a gentle state shimmer when level is near zero.
 */
export default function VoiceWaveform({
  level = 0,
  variant = 'listen', // listen | speak | muted | idle
  bars = 5,
  className = '',
}) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const sync = () => setReduced(Boolean(mq.matches));
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  const color =
    variant === 'speak'
      ? 'var(--text-primary)'
      : variant === 'muted' || variant === 'idle'
        ? 'var(--text-tertiary)'
        : 'var(--accent-green)';

  const inactive = variant === 'muted' || variant === 'idle';
  const heights = Array.from({ length: bars }, (_, i) => {
    if (inactive) return 0.22 + (i % 3) * 0.06;
    if (reduced) return 0.35 + (i % 2) * 0.15;
    const phase = (i / bars) * Math.PI;
    const base = 0.22 + Math.sin(phase) * 0.08;
    return Math.min(1, base + level * (0.45 + (i % 3) * 0.12));
  });

  return (
    <div
      className={`trailie-voice-wave ${className}`}
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'center', gap: 3, height: 22 }}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: `${Math.round(h * 100)}%`,
            minHeight: 4,
            borderRadius: 2,
            background: color,
            opacity: inactive ? 0.4 : 0.9,
            transition: reduced || inactive ? 'none' : 'height 80ms linear',
          }}
        />
      ))}
    </div>
  );
}
