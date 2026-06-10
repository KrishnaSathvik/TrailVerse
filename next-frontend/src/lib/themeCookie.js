/** Cookie mirror of localStorage `theme` — lets SSR emit .dark/.light on <html> before paint. */
export const THEME_COOKIE = 'theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function setThemeCookie(preference) {
  if (typeof document === 'undefined') return;
  if (preference !== 'light' && preference !== 'dark' && preference !== 'system') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function resolveServerHtmlTheme(themeCookie) {
  if (themeCookie === 'dark' || themeCookie === 'light') {
    return themeCookie;
  }
  return '';
}

export function normalizeThemePreference(themeCookie) {
  if (themeCookie === 'dark' || themeCookie === 'light') return themeCookie;
  return 'system';
}

/** Effective light/dark for SSR when html has .dark / .light from cookie. */
export function resolvedThemeFromServerClass(serverThemeClass) {
  if (serverThemeClass === 'dark') return 'dark';
  if (serverThemeClass === 'light') return 'light';
  return 'light';
}
