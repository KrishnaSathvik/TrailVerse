'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TrailieDemoCta from '@/components/trailie-demo/TrailieDemoCta';
import TrailieDemoPlaybackStage from '@/components/trailie-demo/TrailieDemoPlaybackStage';
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

/** Bump when demo playback behavior changes so stale localStorage transcripts are ignored. */
const DEMO_PLAYBACK_CACHE_VERSION = `${demoData.version}-playback-v6`;

const PHASE = {
  IDLE: 'idle',
  TYPING_QUESTION: 'typing-question',
  THINKING: 'thinking',
  COMPLETE: 'complete',
};

const CHAR_MS_BASE = 32;
const CHAR_MS_SPACE = 46;
const CHAR_MS_PUNCT = 72;
const THINKING_MS = 1000;
const TURN_GAP_MS = 700;

function typingDelayMs(char) {
  if (char === ' ' || char === '\n') return CHAR_MS_SPACE;
  if (/[.,!?;:]/.test(char)) return CHAR_MS_PUNCT;
  return CHAR_MS_BASE;
}

export default function TrailieInteractiveDemo({
  className = '',
  showHeader = true,
  showCta = true,
  autoPlay = true,
}) {
  const [activeIndex, setActiveIndex] = useState(() =>
    readTrailieDemoLastActiveIndex(DEMO_PLAYBACK_CACHE_VERSION, SCENARIOS.length)
  );
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [completedTurns, setCompletedTurns] = useState([]);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [sentQuestion, setSentQuestion] = useState('');
  const [turnMetadata, setTurnMetadata] = useState(null);
  const timersRef = useRef([]);
  const playbackTokenRef = useRef(0);
  const scenarioCacheRef = useRef(loadTrailieDemoScenarioMap(DEMO_PLAYBACK_CACHE_VERSION));

  const scenario = SCENARIOS[activeIndex];

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const turnsToCache = useCallback((item) => {
    if (!item?.turns?.length) return [];
    return item.turns.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
      metadata: turn.metadata,
    }));
  }, []);

  const resetPlaybackState = useCallback(() => {
    playbackTokenRef.current += 1;
    clearTimers();
    setPhase(PHASE.IDLE);
    setTypedQuestion('');
    setSentQuestion('');
    setTurnMetadata(null);
  }, [clearTimers]);

  const playTurn = useCallback(
    (scenarioIndex, nextTurnIndex, token) => {
      const item = SCENARIOS[scenarioIndex];
      const turn = item?.turns?.[nextTurnIndex];
      if (!item || !turn || token !== playbackTokenRef.current) return;

      setPhase(PHASE.TYPING_QUESTION);
      setTypedQuestion('');
      setSentQuestion('');
      setTurnMetadata(turn.metadata);

      let charIndex = 0;

      const finishTyping = () => {
        if (token !== playbackTokenRef.current) return;

        setTypedQuestion('');
        setSentQuestion(turn.question);
        setPhase(PHASE.THINKING);

        schedule(() => {
          if (token !== playbackTokenRef.current) return;

          setSentQuestion('');
          setCompletedTurns((prev) => [
            ...prev,
            {
              question: turn.question,
              answer: turn.answer,
              metadata: turn.metadata,
            },
          ]);

          if (nextTurnIndex + 1 < item.turns.length) {
            schedule(() => {
              if (token !== playbackTokenRef.current) return;
              playTurn(scenarioIndex, nextTurnIndex + 1, token);
            }, TURN_GAP_MS);
          } else {
            const cachedTurns = turnsToCache(item);
            scenarioCacheRef.current.set(item.id, cachedTurns);
            persistTrailieDemoScenario(DEMO_PLAYBACK_CACHE_VERSION, item.id, cachedTurns, scenarioIndex);
            setPhase(PHASE.COMPLETE);
          }
        }, THINKING_MS);
      };

      const typeNext = () => {
        if (token !== playbackTokenRef.current) return;

        charIndex += 1;
        const char = turn.question[charIndex - 1];
        setTypedQuestion(turn.question.slice(0, charIndex));

        if (charIndex < turn.question.length) {
          schedule(typeNext, typingDelayMs(char));
        } else {
          finishTyping();
        }
      };

      schedule(typeNext, nextTurnIndex === 0 ? 400 : 550);
    },
    [schedule, turnsToCache]
  );

  const runScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;

      resetPlaybackState();
      const token = playbackTokenRef.current;
      setActiveIndex(index);
      persistTrailieDemoActiveIndex(DEMO_PLAYBACK_CACHE_VERSION, index);
      setCompletedTurns([]);
      playTurn(index, 0, token);
    },
    [playTurn, resetPlaybackState]
  );

  const handleSelectScenario = (index) => {
    if (index === activeIndex && phase !== PHASE.IDLE && phase !== PHASE.COMPLETE) return;
    runScenario(index);
  };

  useEffect(() => {
    if (autoPlay) {
      runScenario(activeIndex);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + strict-mode remount
  }, []);

  const isTyping = phase === PHASE.TYPING_QUESTION;
  const isThinking = phase === PHASE.THINKING;
  const showMessagePane = completedTurns.length > 0 || isThinking;

  const thinkingLabel = useMemo(() => {
    const meta = turnMetadata;
    if (meta?.hasWebSearch) return 'Searching live web results...';
    if (meta?.hasLiveData) return 'Pulling NPS live data...';
    return 'Trailie is thinking...';
  }, [turnMetadata]);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {showHeader && (
        <div className="mb-5 sm:mb-6 shrink-0 text-center">
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Live Trailie demo
          </h2>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-pretty" style={{ color: 'var(--text-secondary)' }}>
            Pick a sample below — cool July parks, Zion vs Bryce, a Yellowstone itinerary, or Jackson Hole stays.
          </p>
        </div>
      )}

      <div className="mb-4 sm:mb-6 shrink-0" role="tablist" aria-label="Demo scenarios">
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

      <TrailieDemoPlaybackStage
        scenario={scenario}
        completedTurns={completedTurns}
        isTyping={isTyping}
        typedQuestion={typedQuestion}
        isThinking={isThinking}
        sentQuestion={sentQuestion}
        thinkingLabel={thinkingLabel}
        turnMetadata={turnMetadata}
        showMessagePane={showMessagePane}
      />

      {showCta && <TrailieDemoCta className="mt-8 sm:mt-10 shrink-0" />}
    </div>
  );
}
