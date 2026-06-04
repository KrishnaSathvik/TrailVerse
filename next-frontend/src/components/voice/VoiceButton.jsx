'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Microphone, X } from '@components/icons';
import VoiceOverlay from './VoiceOverlay';
import { slugToParkCode } from '@/utils/parkSlug';

export default function VoiceButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const pathname = usePathname();

  // Hide on pages where voice chat isn't relevant
  const hiddenOnChat =
    pathname?.startsWith('/plan-ai') ||
    pathname?.startsWith('/blog') ||
    pathname?.startsWith('/map') ||
    pathname === '/magazine' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/testimonials' ||
    pathname === '/faq';

  // Detect park code from current URL
  const parkCode = (() => {
    const match = pathname?.match(/^\/parks\/([^/?#]+)/);
    if (match) return slugToParkCode(match[1]);
    return null;
  })();

  // Show hint tooltip for first-time visitors (once per session)
  useEffect(() => {
    if (hiddenOnChat) return;
    const seen = sessionStorage.getItem('trailie-voice-hint');
    if (!seen) {
      const timer = setTimeout(() => setShowHint(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [hiddenOnChat]);

  if (hiddenOnChat) return null;

  function dismissHint() {
    setShowHint(false);
    sessionStorage.setItem('trailie-voice-hint', '1');
  }

  function openVoice() {
    dismissHint();
    setSessionKey(k => k + 1);
    setIsOpen(true);
  }

  return (
    <>
      {/* Hint tooltip */}
      {showHint && !isOpen && (
        <div
          className="fixed z-[9997] flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
          style={{
            bottom: '5.5rem',
            right: '1.5rem',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px var(--border)',
            color: 'var(--text-primary)',
            maxWidth: '260px',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          <span className="leading-snug">
            {parkCode
              ? 'Ask Trailie for insider tips, weather, or trip ideas — hands-free'
              : 'Ask Trailie to plan trips, compare parks, or get insider tips'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); dismissHint(); }}
            className="flex-shrink-0 p-0.5 rounded-md transition hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Voice FAB */}
      <div
        role="button"
        tabIndex={0}
        title="Talk to Trailie"
        aria-label="Talk to Trailie — voice assistant"
        className="trailie-voice-btn"
        onClick={openVoice}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openVoice();
          }
        }}
      >
        <Microphone size={24} weight="fill" />
        <span className="trailie-voice-badge" aria-hidden="true">
          BETA
        </span>
      </div>

      {isOpen && (
        <VoiceOverlay
          key={sessionKey}
          parkCode={parkCode}
          pagePath={pathname}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
