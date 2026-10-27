import { deriveVoiceActivity, getContextualToolLabel } from './voiceActivity';

/** @deprecated Prefer getContextualToolLabel from voiceActivity */
export function getToolLabel(toolName, args) {
  return getContextualToolLabel(toolName, args || {});
}

/**
 * Centralized status label used by dock/immersive.
 * Prefer useVoiceActivity for visual + anti-flicker timers.
 */
export function getVoiceStatusText({
  status,
  isToolCalling,
  toolCallInfo,
  toolName,
  toolArgs,
  toolStartedAt,
  isTrailieSpeaking,
  userMuted,
  permissionDenied,
  authRequired,
  responsePending,
  thinkingStartedAt,
  bargeInEnabled,
  now,
}) {
  return deriveVoiceActivity({
    status,
    isTrailieSpeaking,
    isToolCalling,
    toolName: toolName || toolCallInfo || null,
    toolArgs: toolArgs || null,
    toolStartedAt: toolStartedAt || null,
    userMuted,
    permissionDenied,
    authRequired,
    responsePending: Boolean(responsePending),
    thinkingStartedAt: thinkingStartedAt || null,
    bargeInEnabled: Boolean(bargeInEnabled),
    now: now || Date.now(),
  }).label;
}

export function getSuggestedPrompts({ parkCode, pagePath }) {
  if (parkCode) {
    return [
      'What should I not miss here?',
      'Any closures or alerts?',
      'Best hikes for beginners?',
    ];
  }
  if (pagePath?.startsWith('/events')) {
    return [
      'Events at Grand Canyon this week?',
      'Ranger programs at Yellowstone?',
      'Any stargazing events in Utah?',
    ];
  }
  if (pagePath?.startsWith('/compare')) {
    return [
      'Compare Zion and Grand Canyon',
      'Which has better hiking, Glacier or Yellowstone?',
      'Yosemite vs Sequoia for families?',
    ];
  }
  return [
    'What parks are near me?',
    'Best parks to visit right now?',
    'Top parks for first-timers?',
  ];
}
