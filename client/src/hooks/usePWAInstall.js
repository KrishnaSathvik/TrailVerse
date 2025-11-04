import { useState, useEffect } from 'react';

/**
 * Custom hook for PWA installation functionality
 * Manages the deferred prompt and provides install methods
 */
export const usePWAInstall = () => {
  // Initialize state synchronously to avoid delay
  const checkStandaloneSync = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  };

  const checkMobileSync = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const checkIOSSync = () => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const standalone = checkStandaloneSync();
  const mobile = checkMobileSync();
  const iOS = checkIOSSync();

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(iOS);
  const [isStandalone, setIsStandalone] = useState(standalone);
  const [isMobile, setIsMobile] = useState(mobile);
  const [canInstall, setCanInstall] = useState(!standalone && mobile);

  useEffect(() => {
    // Function to check if app is installed (standalone mode)
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone ||
                         document.referrer.includes('android-app://');
      setIsStandalone(standalone);
      return standalone;
    };

    // Re-check values (they're already set in initial state, but update if changed)
    const standalone = checkStandalone();
    const mobile = checkMobileSync();
    const iOS = checkIOSSync();
    
    // Update state (in case values changed)
    setIsStandalone(standalone);
    setIsMobile(mobile);
    setIsIOS(iOS);

    // If on mobile and not installed, ensure button is visible
    if (!standalone && mobile) {
      setCanInstall(true);
    } else {
      setCanInstall(false);
    }

    // Only listen for beforeinstallprompt if not already installed and on mobile
    if (!standalone && mobile && !iOS) {
      const handleBeforeInstallPrompt = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        // canInstall is already true, but update deferredPrompt
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      // Monitor for standalone mode changes (e.g., after install)
      const checkInterval = setInterval(() => {
        if (checkStandalone()) {
          setCanInstall(false);
        }
      }, 1000);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        clearInterval(checkInterval);
      };
    }
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      try {
        // Android/Chrome - trigger the native install prompt
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
          // Don't set canInstall to false here - let the standalone check handle it
          // The page will reload in standalone mode if installed
          setDeferredPrompt(null);
          return true;
        } else {
          console.log('User dismissed the install prompt');
          // Keep canInstall true so user can try again
          return false;
        }
      } catch (error) {
        console.error('Error showing install prompt:', error);
        // If prompt fails, clear deferredPrompt and try again later
        setDeferredPrompt(null);
        return false;
      }
    } else {
      // Silent fail - will work once beforeinstallprompt fires
      return false;
    }
  };

  // Show button if:
  // 1. Not already installed (not in standalone mode)
  // 2. On mobile device
  // 3. Either can install (Android) or is iOS (can always add to home screen)
  const shouldShowButton = !isStandalone && isMobile && (canInstall || isIOS);

  // Debug logging (only in development)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    console.log('usePWAInstall return:', {
      shouldShowButton,
      canInstall,
      isIOS,
      isStandalone,
      isMobile,
      hasDeferredPrompt: !!deferredPrompt
    });
  }

  return {
    canInstall: shouldShowButton,
    isIOS,
    isStandalone,
    isMobile,
    install,
    deferredPrompt
  };
};

