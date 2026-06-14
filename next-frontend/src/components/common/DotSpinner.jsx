import React from 'react';

const DOT_COUNT = 8;

/** Fading dots in a circle — TrailVerse default loading indicator. */
export default function DotSpinner({ size = 32, className = '', label = 'Loading' }) {
  const dotSize = Math.max(3, Math.round(size * 0.14));
  const radius = size * 0.36;

  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <span
          key={i}
          className="absolute inset-0"
          style={{ transform: `rotate(${(360 / DOT_COUNT) * i}deg)` }}
        >
          <span
            className="dot-spinner-dot absolute left-1/2 rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              marginLeft: -dotSize / 2,
              top: size / 2 - radius - dotSize / 2,
              animationDelay: `${-(i / DOT_COUNT)}s`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
