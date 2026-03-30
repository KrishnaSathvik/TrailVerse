import React, { useState, useEffect } from 'react';
import { X, Download, Share2 } from '@components/icons';
import Button from './Button';
import { usePWAInstall } from '../../hooks/usePWAInstall';

const PWAInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const { canInstall, isIOS, isStandalone, isMobile, install, deferredPrompt } = usePWAInstall();

  useEffect(() => {
    // Check if user has dismissed the prompt before (using localStorage)
    const dismissedAt = localStorage.getItem('pwa-install-dismissed');
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      // Don't show again if dismissed within last 7 days
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Only show on mobile devices, not if already installed
    if (canInstall && !isStandalone && isMobile) {
      // For iOS, show immediately (they need manual instructions)
      if (isIOS) {
        // Small delay to let page load
        const timer = setTimeout(() => {
          setShowPrompt(true);
        }, 2000);
        return () => clearTimeout(timer);
      }

      // For Android/Chrome, wait for beforeinstallprompt event (already handled by hook)
      if (deferredPrompt) {
        // Show prompt after a short delay
        setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
      }
    }
  }, [canInstall, isStandalone, isMobile, isIOS, deferredPrompt]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      const installed = await install();
      if (installed) {
        setShowPrompt(false);
      }
      // If user dismissed, keep the prompt open so they can try again
    } else {
      // For other browsers or if prompt not available, just close
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Save dismissal timestamp to localStorage
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  if (!showPrompt || isStandalone || !isMobile) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
        onClick={handleDismiss}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-md mx-4 mb-4 rounded-t-3xl rounded-b-2xl pointer-events-auto animate-slide-up"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-xl)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition z-10"
          style={{ 
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-secondary)'
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pb-8">
          {/* App Icon/Header */}
          <div className="flex flex-col items-center mb-6 mt-2">
            <img 
              src="/logo.png" 
              alt="TrailVerse" 
              className="w-20 h-20 object-contain mb-4 -mt-8"
              onError={(e) => {
                // Fallback to icon if image fails
                e.target.style.display = 'none';
              }}
            />
            <h3 
              className="text-lg font-bold text-center mb-2 whitespace-nowrap"
              style={{ color: 'var(--text-primary)' }}
            >
              Get the Best Experience on the App
            </h3>
            <p 
              className="text-sm text-center px-2 whitespace-nowrap"
              style={{ color: 'var(--text-secondary)' }}
            >
              Join TrailVerse on the app and never miss an update.
            </p>
          </div>

          {/* Install Instructions */}
          {isIOS ? (
            <div className="space-y-4 mb-6">
              <div 
                className="rounded-xl p-4"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-start gap-3">
                  <Share2 
                    className="h-5 w-5 flex-shrink-0 mt-0.5" 
                    style={{ color: 'var(--accent-green)' }}
                  />
                  <div className="flex-1">
                    <p 
                      className="text-sm font-semibold mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Add to Home Screen
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <li>Tap the <strong>Share</strong> button</li>
                      <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                      <li>Tap <strong>&quot;Add&quot;</strong> to confirm</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              <div 
                className="rounded-xl p-4"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-start gap-3">
                  <Download 
                    className="h-5 w-5 flex-shrink-0 mt-0.5" 
                    style={{ color: 'var(--accent-green)' }}
                  />
                  <div className="flex-1">
                    <p 
                      className="text-sm font-semibold mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Install TrailVerse
                    </p>
                    <p 
                      className="text-sm leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Tap the button below to install TrailVerse on your device. You&apos;ll get a faster, app-like experience with offline access.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {deferredPrompt && !isIOS ? (
              <Button
                onClick={handleInstall}
                variant="primary"
                size="lg"
                className="w-full"
                icon={Download}
              >
                Install Now
              </Button>
            ) : isIOS ? (
              <Button
                onClick={handleDismiss}
                variant="primary"
                size="lg"
                className="w-full"
                icon={Share2}
              >
                Check it Out
              </Button>
            ) : canInstall ? (
              <Button
                onClick={handleInstall}
                variant="primary"
                size="lg"
                className="w-full"
                icon={Download}
              >
                Install Now
              </Button>
            ) : (
              <Button
                onClick={handleDismiss}
                variant="primary"
                size="lg"
                className="w-full"
              >
                Learn More
              </Button>
            )}
            
            <button
              onClick={handleDismiss}
              className="w-full py-3 text-sm font-medium rounded-full transition"
              style={{ 
                color: 'var(--accent-green)',
                backgroundColor: 'transparent'
              }}
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;

