'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import DotSpinner from './DotSpinner';
import { NAV_START_EVENT } from '@/lib/navigationProgress';

const SHOW_DELAY_MS = 180;

function isInternalNavigation(href) {
  if (!href || href.startsWith('#')) return false;

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return false;

    const target = `${url.pathname}${url.search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    return target !== current;
  } catch {
    return false;
  }
}

/** Thin top progress bar during any in-app route transition. */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);
  const showTimerRef = useRef(null);

  useEffect(() => {
    setPending(false);
    setShowIndicator(false);
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pending) {
      setShowIndicator(false);
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      return undefined;
    }

    showTimerRef.current = setTimeout(() => {
      setShowIndicator(true);
    }, SHOW_DELAY_MS);

    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [pending]);

  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target.closest('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!isInternalNavigation(href)) return;

      setPending(true);
    };

    const onNavStart = () => setPending(true);

    document.addEventListener('click', onClick, true);
    window.addEventListener(NAV_START_EVENT, onNavStart);

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(NAV_START_EVENT, onNavStart);
    };
  }, []);

  if (!pending) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-[200] h-[3px] overflow-hidden pointer-events-none"
        role="progressbar"
        aria-label="Loading page"
        aria-busy="true"
      >
        <div className="nav-progress-bar h-full rounded-full" />
      </div>
      {showIndicator && (
        <div
          className="nav-loading-chip fixed z-[200] flex items-center gap-2.5 rounded-full px-3.5 py-2 pointer-events-none shadow-lg backdrop-blur-sm"
          style={{
            bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
            backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            border: '1px solid var(--border)',
          }}
          aria-live="polite"
        >
          <DotSpinner size={18} label="Loading page" />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Loading…
          </span>
        </div>
      )}
    </>
  );
}
