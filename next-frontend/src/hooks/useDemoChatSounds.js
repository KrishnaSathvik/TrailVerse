'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureTrailieAudioContext,
  playTrailieCompletionChime,
} from '@/lib/trailieCompletionSound';

const STORAGE_KEY = 'trailie_demo_sounds';
const KEY_TAIL_MS = 70;

function readStoredPreference() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    /* ignore */
  }
  return false;
}

/** Short mechanical key click — noise attack + brief body (reads as keyboard, not tone). */
function playMechanicalClick(ctx, { pitch = 1, volume = 0.38, space = false } = {}) {
  const now = ctx.currentTime;
  const clickMs = space ? 0.028 : 0.022;
  const vol = space ? volume * 0.75 : volume;

  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * 0.008));
  const noiseBuffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = (space ? 520 : 3200) * pitch;
  bandpass.Q.value = space ? 0.7 : 1.4;

  const attackGain = ctx.createGain();
  attackGain.gain.setValueAtTime(vol, now);
  attackGain.gain.exponentialRampToValueAtTime(0.001, now + clickMs);

  noise.connect(bandpass);
  bandpass.connect(attackGain);
  attackGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + clickMs);

  if (!space) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const base = 220 * pitch;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + clickMs);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(vol * 0.18, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + clickMs);

    osc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + clickMs);
  }
}

function charPitch(char) {
  if (!char) return 1;
  if (char === ' ') return 0.82;
  const code = char.toLowerCase().charCodeAt(0);
  return 0.92 + (code % 13) * 0.025;
}

export function useDemoChatSounds() {
  const [enabled, setEnabled] = useState(readStoredPreference);
  const enabledRef = useRef(enabled);
  const ctxRef = useRef(null);
  const primedRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const ensureContext = useCallback(async () => ensureTrailieAudioContext(ctxRef), []);

  const prime = useCallback(() => {
    if (typeof window === 'undefined' || primedRef.current) return;
    primedRef.current = true;
    void ensureContext();
  }, [ensureContext]);

  const playTypingTick = useCallback(
    (char) => {
      if (!enabledRef.current || !char) return;
      void ensureContext().then((ctx) => {
        if (!ctx || ctx.state !== 'running') return;
        const space = char === ' ' || char === '\n';
        playMechanicalClick(ctx, {
          pitch: charPitch(char),
          volume: 0.36,
          space,
        });
      });
    },
    [ensureContext]
  );

  const playMessageSent = useCallback(() => {}, []);

  const playAssistantStart = useCallback(() => {}, []);

  const playStreamPulse = useCallback(() => {}, []);

  const playCompletion = useCallback(() => {
    if (!enabledRef.current) return;
    void ensureContext().then((ctx) => {
      if (!ctx || ctx.state !== 'running') return;
      playTrailieCompletionChime(ctx);
    });
  }, [ensureContext]);

  const playPreview = useCallback(() => {
    void ensureContext().then((ctx) => {
      if (!ctx || ctx.state !== 'running') return;
      playTrailieCompletionChime(ctx);
    });
  }, [ensureContext]);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      try {
        sessionStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
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
    playTypingTick,
    playMessageSent,
    playAssistantStart,
    playStreamPulse,
    playCompletion,
    prime,
    keyTailMs: KEY_TAIL_MS,
  };
}
