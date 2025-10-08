import React, { useState, useEffect } from 'react';
import { X, Cookie, Shield, Settings } from 'lucide-react';
import Button from './Button';

const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true, // Always required
    functional: true,
    analytics: true,
    performance: true
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      // Show banner after a short delay for better UX
      setTimeout(() => setShowBanner(true), 1000);
    }
  }, []);

  const handleAcceptAll = () => {
    const consent = {
      essential: true,
      functional: true,
      analytics: true,
      performance: true,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookie_consent', JSON.stringify(consent));
    setShowBanner(false);
  };

  const handleAcceptSelected = () => {
    const consent = {
      ...preferences,
      essential: true, // Always true
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookie_consent', JSON.stringify(consent));
    
    // If user disabled analytics, set opt-out
    if (!preferences.analytics) {
      localStorage.setItem('analytics_opt_out', 'true');
    }
    
    setShowBanner(false);
    setShowSettings(false);
  };

  const handleRejectAll = () => {
    const consent = {
      essential: true,
      functional: false,
      analytics: false,
      performance: false,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookie_consent', JSON.stringify(consent));
    localStorage.setItem('analytics_opt_out', 'true');
    setShowBanner(false);
  };

  const togglePreference = (key) => {
    if (key === 'essential') return; // Can't disable essential
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Cookie Banner */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[9999] animate-slide-up max-w-sm sm:max-w-md">
        <div 
          className="rounded-2xl shadow-2xl backdrop-blur-xl border"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)'
          }}
        >
          {!showSettings ? (
            // Main Banner
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div 
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Cookie className="w-4 h-4 text-white" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 
                    className="text-base font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    We value your privacy
                  </h3>
                  <p 
                    className="text-xs leading-relaxed mb-3"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    TrailVerse uses local storage to enhance your experience and remember your preferences. 
                    We never sell your data.
                  </p>
                  <p 
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Learn more in our{' '}
                    <a 
                      href="/privacy" 
                      className="underline hover:opacity-80 transition"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      Privacy Policy
                    </a>
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => setShowBanner(false)}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleAcceptAll}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                >
                  Accept
                </Button>
                <Button
                  onClick={handleRejectAll}
                  variant="secondary"
                  size="sm"
                >
                  Reject
                </Button>
                <Button
                  onClick={() => setShowSettings(true)}
                  variant="secondary"
                  size="sm"
                  icon={Settings}
                  className="px-3"
                />
              </div>
            </div>
          ) : (
            // Settings Panel
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 
                      className="text-base font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Privacy Preferences
                    </h3>
                    <p 
                      className="text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Customize data storage
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Preference Options */}
              <div className="space-y-3 mb-4">
                {/* Essential */}
                <div 
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Essential
                        </h4>
                        <span 
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: 'var(--accent-green)',
                            color: 'white'
                          }}
                        >
                          Always Active
                        </span>
                      </div>
                      <p 
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Required for authentication, security, and basic functionality.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Functional */}
                <div 
                  className="p-3 rounded-lg border cursor-pointer transition hover:bg-white/5"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: preferences.functional ? 'var(--accent-green)' : 'var(--border)'
                  }}
                  onClick={() => togglePreference('functional')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Functional
                      </h4>
                      <p 
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Theme, favorites, saved parks, trip history, AI chat state.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.functional}
                        onChange={() => togglePreference('functional')}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-gray-600 rounded-full peer peer-checked:bg-green-500 transition-colors">
                        <div className={`absolute top-0.5 left-0.5 bg-white rounded-full h-3 w-3 transition-transform ${preferences.functional ? 'translate-x-4' : ''}`}></div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Analytics */}
                <div 
                  className="p-3 rounded-lg border cursor-pointer transition hover:bg-white/5"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: preferences.analytics ? 'var(--accent-green)' : 'var(--border)'
                  }}
                  onClick={() => togglePreference('analytics')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Analytics
                      </h4>
                      <p 
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Google Analytics to improve features and user experience.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.analytics}
                        onChange={() => togglePreference('analytics')}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-gray-600 rounded-full peer peer-checked:bg-green-500 transition-colors">
                        <div className={`absolute top-0.5 left-0.5 bg-white rounded-full h-3 w-3 transition-transform ${preferences.analytics ? 'translate-x-4' : ''}`}></div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Performance */}
                <div 
                  className="p-3 rounded-lg border cursor-pointer transition hover:bg-white/5"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: preferences.performance ? 'var(--accent-green)' : 'var(--border)'
                  }}
                  onClick={() => togglePreference('performance')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Performance
                      </h4>
                      <p 
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Cache park data for faster load times.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.performance}
                        onChange={() => togglePreference('performance')}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-gray-600 rounded-full peer peer-checked:bg-green-500 transition-colors">
                        <div className={`absolute top-0.5 left-0.5 bg-white rounded-full h-3 w-3 transition-transform ${preferences.performance ? 'translate-x-4' : ''}`}></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleAcceptSelected}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                >
                  Save
                </Button>
                <Button
                  onClick={() => setShowSettings(false)}
                  variant="secondary"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }
      `}</style>
    </>
  );
};

export default CookieConsent;

