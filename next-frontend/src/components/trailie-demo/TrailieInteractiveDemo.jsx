'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from '@components/icons';
import MessageBubble from '@components/ai-chat/MessageBubble';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import { DEMO_GUEST_AVATAR } from '@/components/trailie-demo/DemoUserAvatar';
import {
  sanitizeTrailieDemoAnswer,
  withDemoGuestUpsellInBubble,
} from '@/lib/trailieDemoSanitize';
import demoData from '@/data/trailieDemoResponses.json';
import {
  loadTrailieDemoScenarioMap,
  persistTrailieDemoActiveIndex,
  persistTrailieDemoScenario,
  readTrailieDemoLastActiveIndex,
} from '@/lib/trailieDemoScenarioCache';

function normalizeScenario(item) {
  const rawTurns = item.turns?.length
    ? item.turns
    : [{ question: item.question, answer: item.answer, metadata: item.metadata || {} }];

  const turns = rawTurns.map((turn) => ({
    question: turn.question,
    answer: withDemoGuestUpsellInBubble(
      sanitizeTrailieDemoAnswer(turn.answer),
      turn.metadata || item.metadata
    ),
    metadata: { ...(item.metadata || {}), ...(turn.metadata || {}) },
  }));

  return { ...item, turns };
}

const SCENARIOS = demoData.scenarios.map(normalizeScenario);
const DEMO_CACHE_VERSION = demoData.version;

const DEMO_CTA = {
  title: 'Plan your own trip',
  body: 'Ask Trailie anything — add follow-ups, save your itinerary, or chat by voice. Share your dates and where you’re starting from so the advice fits your trip.',
  accountNote: 'Guests get 5 free messages. Sign up to save trips and download a PDF.',
  button: 'Open Trailie',
};

export default function TrailieInteractiveDemo({
  className = '',
  showHeader = true,
  showCta = true,
  autoPlay = true,
}) {
  const [activeIndex, setActiveIndex] = useState(() =>
    readTrailieDemoLastActiveIndex(DEMO_CACHE_VERSION, SCENARIOS.length)
  );
  const [completedTurns, setCompletedTurns] = useState([]);
  const chatScrollRef = useRef(null);
  const lastScrollAtRef = useRef(0);
  const scenarioCacheRef = useRef(loadTrailieDemoScenarioMap(DEMO_CACHE_VERSION));

  const scenario = SCENARIOS[activeIndex];

  const scrollChatToTop = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastScrollAtRef.current < 100) return;
    lastScrollAtRef.current = now;

    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: 0, behavior: 'instant' });
    });
  }, []);

  const turnsToCache = useCallback((item) => {
    if (!item?.turns?.length) return [];
    return item.turns.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
      metadata: turn.metadata,
    }));
  }, []);

  const showScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;

      const turns = turnsToCache(item);
      setActiveIndex(index);
      setCompletedTurns(turns);
      scenarioCacheRef.current.set(item.id, turns);
      persistTrailieDemoScenario(DEMO_CACHE_VERSION, item.id, turns, index);
      persistTrailieDemoActiveIndex(DEMO_CACHE_VERSION, index);
      scrollChatToTop(true);
    },
    [turnsToCache, scrollChatToTop]
  );

  const runScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;
      showScenario(index);
    },
    [showScenario]
  );

  const handleSelectScenario = (index) => {
    if (index === activeIndex && completedTurns.length > 0) return;
    runScenario(index);
  };

  useEffect(() => {
    if (autoPlay) {
      runScenario(activeIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + strict-mode remount
  }, []);

  useEffect(() => {
    scrollChatToTop(true);
  }, [completedTurns.length, activeIndex, scrollChatToTop]);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {showHeader && (
        <div className="mb-5 sm:mb-6 text-center">
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Live Trailie demo
          </h2>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-pretty" style={{ color: 'var(--text-secondary)' }}>
            Recorded from Trailie chat. Pick a sample question below.
          </p>
        </div>
      )}

      <div className="mb-4 sm:mb-6" role="tablist" aria-label="Demo scenarios">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
          {SCENARIOS.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectScenario(index)}
                className="rounded-full px-3 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-sm font-medium transition-all duration-200 sm:hover:-translate-y-0.5 text-center sm:shrink-0"
                style={{
                  backgroundColor: isActive ? 'var(--accent-green)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: isActive ? 'var(--accent-green)' : 'var(--border)',
                }}
              >
                <span className="block truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="mx-auto flex h-[min(72dvh,40rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm sm:h-[min(68vh,36rem)] sm:max-h-[36rem] sm:rounded-3xl sm:shadow-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3.5 sm:px-6 sm:py-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <TrailieAvatar className="!h-9 !w-9 sm:!h-10 sm:!w-10 shrink-0" />
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie
            </p>
            <p className="truncate text-sm font-semibold sm:text-base" style={{ color: 'var(--text-primary)' }}>
              {scenario?.chatTitle || scenario?.metadata?.parkName || 'National park planning'}
            </p>
          </div>
        </div>

        <div
          ref={chatScrollRef}
          className="min-h-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y px-3.5 py-4 sm:px-6 sm:py-5"
          style={{
            backgroundColor: 'var(--bg-primary)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {completedTurns.length === 0 ? (
            <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Select a sample above to see Trailie&apos;s reply.
            </p>
          ) : (
            <div className="w-full min-w-0 space-y-4 sm:space-y-5">
              {completedTurns.map((turn, index) => (
                <div key={`turn-${index}`} className="space-y-4 sm:space-y-5">
                  <MessageBubble
                    message={turn.question}
                    isUser
                    hideActions
                    compact
                    userAvatar={DEMO_GUEST_AVATAR}
                  />
                  <MessageBubble
                    message={turn.answer}
                    isUser={false}
                    hideActions
                    linkifyParks
                    compact
                    hasLiveData={turn.metadata?.hasLiveData}
                    hasWebSearch={turn.metadata?.hasWebSearch}
                    liveDataParks={[]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCta && (
        <div className="mt-4 sm:mt-6">
          <div
            className="rounded-2xl p-4 sm:p-6 text-left"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
          >
            <div className="mb-4 flex items-start gap-3 sm:gap-4">
              <TrailieAvatar className="!h-10 !w-10 sm:!h-11 sm:!w-11 shrink-0" />
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--accent-green)' }}
                >
                  Trailie
                </p>
                <h3
                  className="mt-0.5 text-lg font-semibold sm:text-xl leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {DEMO_CTA.title}
                </h3>
              </div>
            </div>
            <p className="mb-4 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {DEMO_CTA.body}
            </p>
            <Link
              href="/plan-ai"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              {DEMO_CTA.button}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {DEMO_CTA.accountNote}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
