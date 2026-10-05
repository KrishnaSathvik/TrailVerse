/**
 * Browser Maps runtime status. Detects a broken Google Maps JavaScript load
 * (missing/invalid browser key, referrer, billing, Map ID) without exposing
 * the key. Trailie map UI should read this instead of showing Google's
 * unexplained broken canvas.
 */

export const MAPS_RUNTIME_TRAVELER_MESSAGE =
  "The trip map isn't available in this browser right now. Maps needs a valid browser key, the Maps JavaScript API, billing, HTTP referrers for this origin, and the Trailie Cloud Map ID — we aren't guessing at pins.";

let status = {
  ok: null,
  code: null,
  travelerMessage: null,
};
let guardInstalled = false;
const listeners = new Set();

function emitStatus() {
  const snapshot = getMapsRuntimeStatus();
  listeners.forEach((listener) => {
    try { listener(snapshot); } catch (_err) { /* ignore subscriber errors */ }
  });
}

export function getGmapsMapId() {
  const mapId = String(process.env.NEXT_PUBLIC_GMAPS_MAP_ID || '').trim();
  return mapId || null;
}

export function getMapsRuntimeStatus() {
  return { ...status };
}

export function subscribeMapsRuntimeStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportMapsRuntimeFailure(code = 'gm_auth_failure') {
  status = {
    ok: false,
    code: String(code || 'gm_auth_failure'),
    travelerMessage: MAPS_RUNTIME_TRAVELER_MESSAGE,
  };
  emitStatus();
  return getMapsRuntimeStatus();
}

export function reportMapsRuntimeReady() {
  if (status.ok === false) return getMapsRuntimeStatus();
  status = { ok: true, code: null, travelerMessage: null };
  emitStatus();
  return getMapsRuntimeStatus();
}

export function installMapsRuntimeGuard() {
  if (typeof window === 'undefined' || guardInstalled) return;
  guardInstalled = true;
  const previous = window.gm_authFailure;
  window.gm_authFailure = function trailieGmAuthFailure() {
    reportMapsRuntimeFailure('gm_auth_failure');
    if (typeof previous === 'function' && previous !== trailieGmAuthFailure) {
      try { previous(); } catch (_err) { /* ignore vendor handler errors */ }
    }
  };
}

export function resetMapsRuntimeStatusForTests() {
  status = { ok: null, code: null, travelerMessage: null };
  guardInstalled = false;
  listeners.clear();
}
