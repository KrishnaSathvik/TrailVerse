/**
 * Resolves "Back to TrailVerse" for static report pages.
 * Priority: ?from= path → same-origin referrer → optional park page → /explore
 */
(function (global) {
  function sanitizeFrom(from) {
    if (!from || typeof from !== 'string') return null;
    try {
      from = decodeURIComponent(from);
    } catch (e) {
      return null;
    }
    if (from.charAt(0) !== '/' || from.charAt(1) === '/') return null;
    if (from.startsWith('/reports/')) return null;
    return from;
  }

  function sameOriginReferrerPath() {
    if (!document.referrer) return null;
    try {
      var ref = new URL(document.referrer);
      if (ref.origin !== global.location.origin) return null;
      var path = ref.pathname + ref.search + ref.hash;
      if (ref.pathname.startsWith('/reports/')) return null;
      if (ref.pathname === global.location.pathname) return null;
      return path;
    } catch (e) {
      return null;
    }
  }

  function labelForPath(path, parkName) {
    if (parkName) return '\u2190 Back to ' + parkName;
    if (!path || path === '/') return '\u2190 Back to Home';
    if (path.startsWith('/blog')) return '\u2190 Back to Blog';
    if (path.startsWith('/explore')) return '\u2190 Back to Explore';
    if (path.startsWith('/parks/')) return '\u2190 Back to park';
    if (path.startsWith('/features')) return '\u2190 Back to Features';
    if (path.startsWith('/map')) return '\u2190 Back to Map';
    if (path.startsWith('/compare')) return '\u2190 Back to Compare';
    if (path.startsWith('/discover')) return '\u2190 Back to Discover';
    if (path.startsWith('/plan-ai')) return '\u2190 Back to Trailie';
    return '\u2190 Back to TrailVerse';
  }

  /**
   * @param {{ parkSlug?: string, parkName?: string }} [opts]
   */
  function initReportBackNav(opts) {
    opts = opts || {};
    var links = document.querySelectorAll('[data-tv-back-nav]');
    if (!links.length) return;

    var params = new URLSearchParams(global.location.search);
    var from = sanitizeFrom(params.get('from'));
    var href = from || sameOriginReferrerPath();

    if (!href && opts.parkSlug) {
      href = '/parks/' + opts.parkSlug;
    }
    if (!href) {
      href = '/explore';
    }

    var usedReferrer = Boolean(from || sameOriginReferrerPath());
    var label =
      opts.parkName && href.startsWith('/parks/') && !usedReferrer
        ? '\u2190 Back to ' + opts.parkName
        : labelForPath(href);

    links.forEach(function (link) {
      link.textContent = label;
      link.setAttribute('href', href);
    });
  }

  global.initReportBackNav = initReportBackNav;
})(window);
