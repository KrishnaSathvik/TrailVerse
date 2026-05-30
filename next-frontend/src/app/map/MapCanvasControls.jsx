'use client';

import { Compass, Minus, Plus } from '@components/icons';

export default function MapCanvasControls({ onZoomIn, onZoomOut, onResetView, isDark }) {
  const buttonClass =
    'flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition hover:scale-105 active:scale-95';

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col gap-2">
      <button
        type="button"
        aria-label="Zoom in"
        onClick={onZoomIn}
        className={`pointer-events-auto ${buttonClass}`}
        style={{
          backgroundColor: isDark ? 'rgba(30, 35, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          color: 'var(--text-primary)',
        }}
      >
        <Plus className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={onZoomOut}
        className={`pointer-events-auto ${buttonClass}`}
        style={{
          backgroundColor: isDark ? 'rgba(30, 35, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          color: 'var(--text-primary)',
        }}
      >
        <Minus className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Reset map view"
        onClick={onResetView}
        className={`pointer-events-auto ${buttonClass}`}
        style={{
          backgroundColor: isDark ? 'rgba(30, 35, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          color: 'var(--text-primary)',
        }}
      >
        <Compass className="h-5 w-5" />
      </button>
    </div>
  );
}
