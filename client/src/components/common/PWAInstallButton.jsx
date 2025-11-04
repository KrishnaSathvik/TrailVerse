import React, { useState } from 'react';
import { Download, Share2 } from '@components/icons';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import Button from './Button';

/**
 * PWA Install Button - Always visible footer button for installing the app
 * Shows on mobile devices when app is not already installed
 */
const PWAInstallButton = () => {
  const { canInstall, isIOS, isStandalone, isMobile, install, deferredPrompt } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('PWAInstallButton render:', { canInstall, isIOS, isStandalone, isMobile });
  }

  // Only show if:
  // 1. Not already installed (not in standalone mode)
  // 2. On mobile device  
  // 3. Can install (returned from hook which already checks all conditions)
  // Double-check: canInstall from hook already includes all these checks
  const shouldShow = !isStandalone && isMobile && canInstall;
  
  if (typeof window !== 'undefined') {
    console.log('PWAInstallButton shouldShow:', shouldShow, { isStandalone, isMobile, canInstall });
  }
  
  if (!shouldShow) {
    return null;
  }

  const handleInstall = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    
    try {
      if (isIOS) {
        // For iOS, show instructions modal
        setShowIOSInstructions(true);
      } else {
        // For Android/Chrome, try to trigger install
        if (deferredPrompt) {
          // If we have the prompt, use it
          await install();
        } else {
          // If no prompt available, show manual instructions
          setShowAndroidInstructions(true);
        }
      }
    } catch (error) {
      console.error('Error installing app:', error);
    }
  };

  return (
    <>
      <Button
        onClick={handleInstall}
        variant="secondary"
        size="sm"
        icon={isIOS ? Share2 : Download}
        className="flex-shrink-0"
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        {isIOS ? 'Add to home screen' : 'Install app'}
      </Button>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowIOSInstructions(false)}
          />
          
          {/* Modal */}
          <div 
            className="relative w-full max-w-md rounded-2xl backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Add TrailVerse to Home Screen
              </h3>
              
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
                        <li>Tap the <strong>Share</strong> button at the bottom of your screen</li>
                        <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                        <li>Tap <strong>&quot;Add&quot;</strong> to confirm</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setShowIOSInstructions(false)}
                variant="secondary"
                size="md"
                className="w-full"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Android Instructions Modal */}
      {showAndroidInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowIOSInstructions(false)}
          />
          
          {/* Modal */}
          <div 
            className="relative w-full max-w-md rounded-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 
                className="text-lg font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Add TrailVerse to Home Screen
              </h3>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: '#ffffff'
                    }}
                  >
                    <span className="text-sm font-bold">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Tap the <strong>Share</strong> button at the bottom of your screen
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: '#ffffff'
                    }}
                  >
                    <span className="text-sm font-bold">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: '#ffffff'
                    }}
                  >
                    <span className="text-sm font-bold">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Tap <strong>&quot;Add&quot;</strong> to confirm
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setShowIOSInstructions(false)}
                variant="primary"
                size="md"
                className="w-full"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Android Instructions Modal */}
      {showAndroidInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAndroidInstructions(false)}
          />
          
          {/* Modal */}
          <div 
            className="relative w-full max-w-md rounded-2xl backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Install TrailVerse App
              </h3>
              
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
                      <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <li>Tap the <strong>Menu</strong> button (three dots) in your browser</li>
                        <li>Look for <strong>&quot;Install App&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong></li>
                        <li>Tap <strong>&quot;Install&quot;</strong> to confirm</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setShowAndroidInstructions(false)}
                variant="secondary"
                size="md"
                className="w-full"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallButton;

