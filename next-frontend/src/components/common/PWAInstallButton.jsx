import React, { useState } from 'react';
import { Download, Share2, X } from '@components/icons';
import { usePWAInstall } from '../../hooks/usePWAInstall';

/**
 * PWA Install Button - Always visible footer button for installing the app
 * Shows on mobile devices when app is not already installed
 */
const PWAInstallButton = () => {
  const { canInstall, isIOS, install, deferredPrompt } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);

  if (!canInstall) {
    return null;
  }

  const handleInstall = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    try {
      if (isIOS) {
        setShowIOSInstructions(true);
      } else {
        if (deferredPrompt) {
          await install();
        } else {
          setShowAndroidInstructions(true);
        }
      }
    } catch (error) {
      console.error('Error installing app:', error);
    }
  };

  const closeModal = () => {
    setShowIOSInstructions(false);
    setShowAndroidInstructions(false);
  };

  const Icon = isIOS ? Share2 : Download;

  return (
    <>
      <button
        onClick={handleInstall}
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition hover:opacity-90 hover:scale-105 active:scale-95"
        style={{
          backgroundColor: 'var(--accent-green)',
          color: 'white',
          boxShadow: '0 8px 24px rgba(34, 197, 94, 0.35), 0 2px 8px rgba(0, 0, 0, 0.12)',
          cursor: 'pointer'
        }}
        aria-label="Install TrailVerse app"
      >
        <Icon className="h-5 w-5" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {(showIOSInstructions || showAndroidInstructions) && (
        <InstallInstructionsModal
          isIOS={showIOSInstructions}
          onClose={closeModal}
        />
      )}
    </>
  );
};

const InstallInstructionsModal = ({ isIOS, onClose }) => {
  const steps = isIOS
    ? [
        { text: 'Tap the', emphasis: 'Share', suffix: 'button at the bottom of your screen' },
        { text: 'Scroll down and tap', emphasis: '"Add to Home Screen"' },
        { text: 'Tap', emphasis: '"Add"', suffix: 'to confirm' }
      ]
    : [
        { text: 'Tap the', emphasis: 'Menu', suffix: 'button (three dots) in your browser' },
        { text: 'Look for', emphasis: '"Install App"', suffix: 'or "Add to Home Screen"' },
        { text: 'Tap', emphasis: '"Install"', suffix: 'to confirm' }
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-xl)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
            >
              <Download className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Install TrailVerse
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Add the app to your home screen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition hover:opacity-80 -mt-1 -mr-1"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-5 space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white'
                }}
              >
                {index + 1}
              </div>
              <p
                className="text-sm leading-relaxed pt-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {step.text}{' '}
                <strong>{step.emphasis}</strong>
                {step.suffix && ` ${step.suffix}`}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="p-5 pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white'
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallButton;
