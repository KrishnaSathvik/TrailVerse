import React from 'react';
import { X } from '@components/icons';

const PWAInstallInstructionsModal = ({ isIOS, onClose }) => {
  const steps = isIOS
    ? [
        { text: 'Tap the', emphasis: 'Share', suffix: 'button at the bottom of your screen' },
        { text: 'Scroll down and tap', emphasis: '"Add to Home Screen"' },
        { text: 'Tap', emphasis: '"Add"', suffix: 'to confirm' },
      ]
    : [
        { text: 'Tap the', emphasis: 'Menu', suffix: 'button (three dots) in your browser' },
        { text: 'Look for', emphasis: '"Install App"', suffix: 'or "Add to Home Screen"' },
        { text: 'Tap', emphasis: '"Install"', suffix: 'to confirm' },
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
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <img
              src="/android-chrome-192x192.png"
              alt="TrailVerse"
              className="h-11 w-11 rounded-xl object-cover flex-shrink-0"
            />
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

        <div className="p-5 space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white',
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

        <div
          className="p-5 pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallInstructionsModal;
