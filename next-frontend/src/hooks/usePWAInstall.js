import { useState, useEffect, useLayoutEffect } from 'react';

/**
 * Custom hook for PWA installation functionality
 * Manages the deferred prompt and provides install methods
 */
export const usePWAInstall = () => {
  const checkMobileSync = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const checkIOSSync = () => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useLayoutEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone ||
                       document.referrer.includes('android-app://');
    const mobile = checkMobileSync();
    const iOS = checkIOSSync();

    setIsStandalone(standalone);
    setIsMobile(mobile);
    setIsIOS(iOS);

    if (!standalone && mobile) {
      setCanInstall(true);
    }
  }, []);

  // Listen for beforeinstallprompt on ALL devices (mobile + desktop)
  useEffect(() => {
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const checkInterval = setInterval(() => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone;
      if (standalone) {
        setCanInstall(false);
        setIsStandalone(true);
      }
    }, 1000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(checkInterval);
    };
  }, [isStandalone]);

  const install = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error showing install prompt:', error);
        setDeferredPrompt(null);
        return false;
      }
    }
    return false;
  };

  // Mobile floating button: mobile + not standalone + (canInstall or iOS)
  const showMobileButton = !isStandalone && isMobile && (canInstall || isIOS);
  // Desktop footer button: not standalone + has deferred prompt (Chromium only)
  const showDesktopInstall = !isStandalone && !isMobile && !!deferredPrompt;

  return {
    canInstall: showMobileButton,
    canInstallDesktop: showDesktopInstall,
    isIOS,
    isStandalone,
    isMobile,
    install,
    deferredPrompt
  };
};
