import parkSlugs from '@/data/park-slugs.json';

/** Anti-flicker before showing Thinking after response.create */
export const THINKING_VISIBLE_MS = 400;
/** After this, tool caption becomes "Still checking…" */
export const TOOL_SLOW_MS = 8000;

const PARK_NAME_BY_CODE = Object.freeze(
  Object.fromEntries(
    (Array.isArray(parkSlugs) ? parkSlugs : []).map((p) => [
      String(p.parkCode || '').toLowerCase(),
      String(p.fullName || '')
        .replace(/\s+National\s+(Park|Monument|Historical\s+Park|Historic\s+Site|Recreation\s+Area|Seashore|Lakeshore|Preserve|River|Trail).*$/i, '')
        .replace(/\s+National\s+Park$/i, '')
        .trim() || p.fullName,
    ])
  )
);

/**
 * Resolve a short park display name from a verified NPS code.
 * Returns null for missing/invalid codes — never invent a name.
 */
export function parkDisplayName(code) {
  if (!code || typeof code !== 'string') return null;
  const key = code.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
  if (!key || key.length < 3) return null;
  const full = PARK_NAME_BY_CODE[key];
  if (!full) return null;
  // Prefer short familiar names for speech UI (Zion, Yosemite, …)
  const short = full.split(/\s+/)[0];
  return short || full;
}

/**
 * Contextual tool status — only call when a real tool execution is active.
 */
export function getContextualToolLabel(toolName, args = {}, { slow = false } = {}) {
  if (slow) return 'Still checking park information';

  switch (toolName) {
    case 'get_park_details': {
      const name = parkDisplayName(args?.park_code);
      return name ? `Checking conditions at ${name}` : 'Checking park information';
    }
    case 'compare_parks':
      return 'Comparing parks';
    case 'search_parks':
      return 'Finding matching parks';
    case 'find_events': {
      const name = parkDisplayName(args?.park_code);
      return name ? `Checking events at ${name}` : 'Checking park events';
    }
    default:
      return 'Checking park information';
  }
}

/**
 * Visual treatment ids shared by dock + immersive.
 * listen-wave | hear-wave | think-dots | speak-wave | muted | connecting | error | idle
 */
export function deriveVoiceActivity({
  status = 'idle',
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
  now = Date.now(),
} = {}) {
  if (authRequired) {
    return { id: 'auth', label: 'Free sessions used', visual: 'idle', live: false };
  }
  if (permissionDenied) {
    return { id: 'permission', label: 'Microphone blocked', visual: 'error', live: false };
  }
  if (status === 'error') {
    return { id: 'error', label: 'Connection lost', visual: 'error', live: false };
  }
  if (status === 'connecting') {
    return { id: 'connecting', label: 'Connecting', visual: 'connecting', live: true };
  }
  if (status === 'idle') {
    return { id: 'idle', label: 'Ready', visual: 'idle', live: false };
  }

  // Tool execution wins over speaking/thinking once a real lookup has started.
  if (isToolCalling) {
    const slow = toolStartedAt != null && now - toolStartedAt >= TOOL_SLOW_MS;
    return {
      id: 'checking',
      label: getContextualToolLabel(toolName, toolArgs || {}, { slow }),
      visual: 'think-dots',
      live: true,
    };
  }

  if (isTrailieSpeaking || status === 'speaking') {
    return {
      id: 'speaking',
      label: 'Trailie is speaking',
      visual: 'speak-wave',
      live: true,
    };
  }

  // Thinking: response requested but not speaking yet. Anti-flicker under 400ms.
  if (responsePending) {
    const started = thinkingStartedAt ?? now;
    if (now - started >= THINKING_VISIBLE_MS) {
      return { id: 'thinking', label: 'Thinking', visual: 'think-dots', live: true };
    }
    // Hold prior idle-listen appearance briefly
    if (userMuted) {
      return { id: 'muted', label: 'Microphone muted', visual: 'muted', live: false };
    }
    return { id: 'listening', label: 'Listening', visual: 'listen-wave', live: true };
  }

  // Muted overrides listening / hearing only (not speaking/checking above).
  if (userMuted) {
    return { id: 'muted', label: 'Microphone muted', visual: 'muted', live: false };
  }

  // With barge-in off, speech events during playback must not surface as Hearing you —
  // callers should avoid setting status=listening while responseActive; this is a safety net.
  if (status === 'listening') {
    if (!bargeInEnabled && isTrailieSpeaking) {
      return {
        id: 'speaking',
        label: 'Trailie is speaking',
        visual: 'speak-wave',
        live: true,
      };
    }
    return { id: 'hearing', label: 'Hearing you', visual: 'hear-wave', live: true };
  }

  if (status === 'connected' || status === 'listening') {
    return { id: 'listening', label: 'Listening', visual: 'listen-wave', live: true };
  }

  return { id: 'listening', label: 'Listening', visual: 'listen-wave', live: true };
}
