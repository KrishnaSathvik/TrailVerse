'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Info, X } from '@components/icons';
import { MY_RECOMMENDATIONS_INFO } from '@/lib/planAiWelcomeCopy';

function usePopoverPosition(open, anchorRef) {
  const [position, setPosition] = useState(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    setPosition({
      top: rect.bottom + 8,
      left,
      width,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return position;
}

export default function MyRecommendationsButton({ onClick }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef(null);
  const infoId = useId();
  const position = usePopoverPosition(infoOpen, rootRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!infoOpen) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      const popover = document.getElementById(infoId);
      if (popover?.contains(event.target)) return;
      setInfoOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [infoOpen, infoId]);

  const popover =
    infoOpen && position && mounted
      ? createPortal(
          <div
            id={infoId}
            role="dialog"
            aria-labelledby={`${infoId}-title`}
            className="fixed z-[200] rounded-xl p-3 sm:p-4"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px var(--border)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p
                id={`${infoId}-title`}
                className="text-sm font-semibold leading-snug"
                style={{ color: 'var(--text-primary)' }}
              >
                {MY_RECOMMENDATIONS_INFO.title}
              </p>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="shrink-0 rounded-md p-0.5 transition hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {MY_RECOMMENDATIONS_INFO.body}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={rootRef} className="relative inline-flex shrink-0">
        <div
          className="inline-flex h-8 items-stretch overflow-hidden rounded-full sm:h-10 sm:rounded-xl"
          style={{
            backgroundColor: 'var(--button-filled-bg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">My Recommendations</span>
            <span className="sm:hidden">For Me</span>
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen((open) => !open)}
            aria-label="What are My Recommendations?"
            aria-expanded={infoOpen}
            aria-controls={infoId}
            className="inline-flex w-8 shrink-0 items-center justify-center border-l transition hover:opacity-80 sm:w-9"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>
      {popover}
    </>
  );
}
