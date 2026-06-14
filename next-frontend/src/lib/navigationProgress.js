export const NAV_START_EVENT = 'trailverse:nav-start';

/** Signal that a programmatic client navigation has started (shows top progress bar). */
export function signalNavigation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_START_EVENT));
}

/** @deprecated Use signalNavigation — kept for existing park/map call sites. */
export function signalParkNavigation() {
  signalNavigation();
}
