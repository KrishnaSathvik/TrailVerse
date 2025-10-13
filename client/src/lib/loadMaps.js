// Global loading state to prevent multiple loads
let mapsLoadingPromise = null;
let mapsLoaded = false;

/**
 * Load Google Maps JavaScript API (singleton)
 * @param {string} key - Google Maps API key (referrer-restricted)
 * @param {Array<string>} libraries - Libraries to load (e.g., ['places'])
 * @returns {Promise<void>}
 */
export function loadMaps(key, libraries = ['places']) {
  // Return existing promise if already loading
  if (mapsLoadingPromise) {
    return mapsLoadingPromise;
  }

  // Return resolved promise if already loaded
  if (mapsLoaded && window.google?.maps) {
    return Promise.resolve();
  }

  // Create new loading promise
  mapsLoadingPromise = new Promise((resolve, reject) => {
    // Check if already loaded (double-check)
    if (window.google?.maps) {
      mapsLoaded = true;
      mapsLoadingPromise = null;
      return resolve();
    }

    // Remove any existing Google Maps scripts
    const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
    existingScripts.forEach(script => script.remove());

    // Clean up any existing global callbacks
    delete window.initGoogleMaps;
    delete window.google;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=${libraries.join(',')}`;
    script.async = true;
    script.defer = true;

    // Set up timeout (30 seconds)
    const timeout = setTimeout(() => {
      script.remove();
      mapsLoadingPromise = null;
      reject(new Error('MAPS_LOAD_TIMEOUT'));
    }, 30000);

    script.onload = () => {
      clearTimeout(timeout);
      
      // Wait for Google Maps to be fully initialized
      const checkMaps = () => {
        if (window.google?.maps) {
          mapsLoaded = true;
          mapsLoadingPromise = null;
          resolve();
        } else {
          // Try again in 100ms
          setTimeout(checkMaps, 100);
        }
      };
      
      // Start checking after a short delay
      setTimeout(checkMaps, 200);
    };

    script.onerror = () => {
      clearTimeout(timeout);
      mapsLoadingPromise = null;
      reject(new Error('MAPS_LOAD_ERROR'));
    };

    document.head.appendChild(script);
  });

  return mapsLoadingPromise;
}

