/**
 * Blocking theme init — kept for direct /theme-init.js loads.
 * Primary path is the inline script from src/lib/themeInitScript.js in app/layout.js.
 */
(function () {
  var STORAGE_KEY = 'theme';
  var COOKIE_MAX_AGE = 31536000;
  var root = document.documentElement;

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
    root.style.colorScheme = mode;
    var bg = mode === 'dark' ? '#0A0E0F' : '#FEFCF9';
    root.style.backgroundColor = bg;

    function paintBody() {
      var body = document.body;
      if (!body) return;
      body.style.backgroundColor = bg;
      body.style.color = mode === 'dark' ? '#FFFFFF' : '#2D2B28';
    }

    if (document.body) {
      paintBody();
    } else {
      document.addEventListener('DOMContentLoaded', paintBody, { once: true });
    }
  }

  function syncCookie(preference) {
    try {
      var secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        STORAGE_KEY + '=' + preference + '; path=/; max-age=' + COOKIE_MAX_AGE + '; SameSite=Lax' + secure;
    } catch (e) {
      // ignore
    }
  }

  var preference = 'system';
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      preference = stored;
    }
  } catch (e) {
    preference = 'system';
  }

  var effective =
    preference === 'dark' || preference === 'light' ? preference : systemTheme();

  applyTheme(effective);
  syncCookie(preference);

  function enableTransitions() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add('theme-ready');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableTransitions, { once: true });
  } else {
    enableTransitions();
  }
})();
