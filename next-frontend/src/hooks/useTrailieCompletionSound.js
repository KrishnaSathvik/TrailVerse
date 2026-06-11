'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureTrailieAudioContext,
  playTrailieCompletionChime,
  readCompletionSoundEnabled,
  scheduleTrailieCompletionAfterPaint,
  writeCompletionSoundEnabled,
} from '@/lib/trailieCompletionSound';

export function useTrailieCompletionSound() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(enabled);
  const ctxRef = useRef(null);
  const primedRef = useRef(false);

  useEffect(() => {
    setEnabled(readCompletionSoundEnabled());
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const prime = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    void ensureTrailieAudioContext(ctxRef);
  }, []);

  const playCompletion = useCallback(() => {
    if (!enabledRef.current) return;
    scheduleTrailieCompletionAfterPaint(() => {
      void ensureTrailieAudioContext(ctxRef).then((ctx) => {
        if (!ctx) return;
        playTrailieCompletionChime(ctx);
      });
    });
  }, []);

  const playPreview = useCallback(() => {
    void ensureTrailieAudioContext(ctxRef).then((ctx) => {
      if (!ctx) return;
      playTrailieCompletionChime(ctx);
    });
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      writeCompletionSoundEnabled(next);
      if (next) {
        prime();
        window.setTimeout(playPreview, 0);
      }
      return next;
    });
  }, [prime, playPreview]);

  return {
    enabled,
    toggleEnabled,
    playCompletion,
    prime,
  };
}

/** Always plays completion chime after user interaction (no toggle / preference). */
export function useAutoTrailieCompletionSound() {
  const ctxRef = useRef(null);
  const primedRef = useRef(false);

  const prime = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    void ensureTrailieAudioContext(ctxRef);
  }, []);

  const playCompletion = useCallback(() => {
    scheduleTrailieCompletionAfterPaint(() => {
      void ensureTrailieAudioContext(ctxRef).then((ctx) => {
        if (!ctx) return;
        playTrailieCompletionChime(ctx);
      });
    });
  }, []);

  return { playCompletion, prime };
}
