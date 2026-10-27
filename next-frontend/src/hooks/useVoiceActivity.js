'use client';

import { useEffect, useState } from 'react';
import {
  THINKING_VISIBLE_MS,
  TOOL_SLOW_MS,
  deriveVoiceActivity,
} from '@/lib/voiceActivity';

/**
 * Derives polished activity UI from session fields, with timers for
 * Thinking anti-flicker (400ms) and slow tool caption (8s).
 */
export default function useVoiceActivity({
  status,
  isTrailieSpeaking = false,
  isToolCalling = false,
  toolName = null,
  toolArgs = null,
  toolStartedAt = null,
  userMuted = false,
  permissionDenied = false,
  authRequired = false,
  responsePending = false,
  thinkingStartedAt = null,
  bargeInEnabled = false,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Always resync to wall clock when activity inputs change so scene/QA
    // transitions and long-lived docks don't keep a stale `now`.
    const tick = () => setNow(Date.now());
    tick();

    const timers = [];

    if (responsePending && !isToolCalling && !isTrailieSpeaking && thinkingStartedAt) {
      const wait = THINKING_VISIBLE_MS - (Date.now() - thinkingStartedAt);
      if (wait > 0) timers.push(setTimeout(tick, wait));
    }

    if (isToolCalling && toolStartedAt) {
      const wait = TOOL_SLOW_MS - (Date.now() - toolStartedAt);
      if (wait > 0) timers.push(setTimeout(tick, wait));
    }

    return () => timers.forEach(clearTimeout);
  }, [
    responsePending,
    isToolCalling,
    isTrailieSpeaking,
    thinkingStartedAt,
    toolStartedAt,
    status,
    userMuted,
  ]);

  return deriveVoiceActivity({
    status,
    isTrailieSpeaking,
    isToolCalling,
    toolName,
    toolArgs,
    toolStartedAt,
    userMuted,
    permissionDenied,
    authRequired,
    responsePending,
    thinkingStartedAt,
    bargeInEnabled,
    now,
  });
}
