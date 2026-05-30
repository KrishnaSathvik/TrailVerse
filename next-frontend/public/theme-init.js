/**
 * Reference copy — production uses inline script from src/lib/themeInitScript.js in layout <head>.
 * Keep both in sync. Sets .light / .dark on <html> before first paint.
 */
(function () {
  var STORAGE_KEY = 'theme';
  var root = document.documentElement;

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
    root.style.colorScheme = mode;
  }

  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      applyTheme(stored);
    } else {
      applyTheme(systemTheme());
    }
  } catch (e) {
    applyTheme('light');
  }

  // Prevent global CSS transitions from animating the first paint
  root.classList.add('theme-loading');
  function releaseTransitions() {
    root.classList.remove('theme-loading');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', releaseTransitions, { once: true });
  } else {
    releaseTransitions();
  }
})();
