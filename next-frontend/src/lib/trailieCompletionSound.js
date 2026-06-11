/** Shared Trailie completion chime (Cursor-style two-note ding). */

export const TRAILIE_COMPLETION_SOUND_KEY = 'trailie_completion_sound';

/** Brief pause after paint so the chime lands when the reply is fully visible. */
export const TRAILIE_COMPLETION_SOUND_DELAY_MS = 80;

export function scheduleTrailieCompletionAfterPaint(callback) {
  if (typeof callback !== 'function') return;
  if (typeof window === 'undefined') {
    callback();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(callback, TRAILIE_COMPLETION_SOUND_DELAY_MS);
    });
  });
}

export function readCompletionSoundEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(TRAILIE_COMPLETION_SOUND_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function writeCompletionSoundEnabled(enabled) {
  try {
    localStorage.setItem(TRAILIE_COMPLETION_SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export async function ensureTrailieAudioContext(ctxRef) {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctxRef.current) ctxRef.current = new Ctx();
  if (ctxRef.current.state === 'suspended') {
    try {
      await ctxRef.current.resume();
    } catch {
      return null;
    }
  }
  return ctxRef.current;
}

/** Soft two-note chime when Trailie finishes a reply. */
export function playTrailieCompletionChime(ctx) {
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 587.33, at: 0, dur: 0.1, gain: 0.07 },
    { freq: 739.99, at: 0.085, dur: 0.16, gain: 0.065 },
  ];

  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    amp.gain.setValueAtTime(0.0001, now + note.at);
    amp.gain.linearRampToValueAtTime(note.gain, now + note.at + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.03);
  });
}
