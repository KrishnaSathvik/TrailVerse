export function getToolLabel(toolName) {
  switch (toolName) {
    case 'get_park_details':
      return 'Checking park information…';
    case 'search_parks':
      return 'Searching parks…';
    case 'compare_parks':
      return 'Comparing parks…';
    case 'find_events':
      return 'Finding events…';
    default:
      return 'Checking park information…';
  }
}

export function getVoiceStatusText({
  status,
  isToolCalling,
  toolCallInfo,
  userMuted,
  permissionDenied,
  authRequired,
}) {
  if (authRequired) return 'Free sessions used';
  if (permissionDenied) return 'Microphone blocked';
  if (userMuted) return 'Muted';
  if (isToolCalling) return getToolLabel(toolCallInfo);
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening…';
    case 'speaking':
      return 'Speaking…';
    case 'error':
      return 'Connection lost';
    case 'connected':
      return 'Listening';
    default:
      return 'Ready';
  }
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
