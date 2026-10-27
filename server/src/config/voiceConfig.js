/**
 * Trailie Voice (OpenAI Realtime) configuration.
 * Model/voice defaults are env-overridable; Marin is the only product voice.
 */

const ALLOWED_REALTIME_MODELS = new Set([
  'gpt-realtime-2.1',
  'gpt-realtime-2.1-mini',
  'gpt-realtime-2',
  'gpt-realtime-1.5',
  // Legacy alias kept for emergency rollback only (deprecated by OpenAI).
  'gpt-realtime',
]);

const ALLOWED_VOICES = new Set(['marin']);

const ALLOWED_REASONING_EFFORT = new Set(['none', 'low', 'medium', 'high', 'xhigh']);

function resolveVoiceRealtimeModel() {
  const raw = String(process.env.VOICE_REALTIME_MODEL || 'gpt-realtime-2.1').trim();
  if (ALLOWED_REALTIME_MODELS.has(raw)) return raw;
  console.warn(`[Voice] Unsupported VOICE_REALTIME_MODEL="${raw}", falling back to gpt-realtime-2.1`);
  return 'gpt-realtime-2.1';
}

function resolveVoiceName() {
  const raw = String(process.env.VOICE_NAME || 'marin').trim().toLowerCase();
  if (ALLOWED_VOICES.has(raw)) return raw;
  console.warn(`[Voice] Unsupported VOICE_NAME="${raw}", falling back to marin`);
  return 'marin';
}

/** Local/dev flag: enable Realtime barge-in (mic stays hot while Trailie speaks). */
function resolveVoiceBargeIn() {
  return String(process.env.VOICE_BARGE_IN || '').trim().toLowerCase() === 'true';
}

function resolveVoiceReasoningEffort() {
  const raw = String(process.env.VOICE_REASONING_EFFORT || 'low').trim().toLowerCase();
  if (ALLOWED_REASONING_EFFORT.has(raw)) return raw;
  return 'low';
}

/** Idle connected session timeout (ms) before server-side tool tokens expire. */
function resolveVoiceSessionTtlMs() {
  const n = Number(process.env.VOICE_SESSION_TTL_MS);
  if (Number.isFinite(n) && n >= 60_000 && n <= 24 * 60 * 60 * 1000) return n;
  return 2 * 60 * 60 * 1000; // 2h
}

function getVoiceConfig() {
  return {
    model: resolveVoiceRealtimeModel(),
    voice: resolveVoiceName(),
    bargeIn: resolveVoiceBargeIn(),
    reasoningEffort: resolveVoiceReasoningEffort(),
    sessionTtlMs: resolveVoiceSessionTtlMs(),
  };
}

module.exports = {
  ALLOWED_REALTIME_MODELS,
  ALLOWED_VOICES,
  getVoiceConfig,
  resolveVoiceRealtimeModel,
  resolveVoiceName,
  resolveVoiceBargeIn,
  resolveVoiceReasoningEffort,
  resolveVoiceSessionTtlMs,
};
