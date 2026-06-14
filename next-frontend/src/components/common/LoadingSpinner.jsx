import React from 'react';
import DotSpinner from './DotSpinner';

const SIZE_MAP = {
  sm: 20,
  md: 32,
  lg: 48,
  xl: 64,
};

/**
 * Standard TrailVerse loading block — dot spinner with optional label.
 * Use for page sections, modals, and centered wait states.
 */
const LoadingSpinner = ({
  size = 'md',
  text = '',
  fullScreen = false,
  className = '',
  label = 'Loading',
}) => {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || SIZE_MAP.md;

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <DotSpinner size={pixelSize} label={label} />
      {text ? (
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {text}
        </p>
      ) : null}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        aria-busy="true"
      >
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
