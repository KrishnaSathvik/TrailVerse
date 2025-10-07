import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PerformanceMonitor = () => {
  const location = useLocation();

  useEffect(() => {
    // Measure page load time
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'navigation') {
          console.log('Page Load Time:', entry.loadEventEnd - entry.fetchStart, 'ms');
        }
      }
    });

    observer.observe({ entryTypes: ['navigation'] });

    return () => observer.disconnect();
  }, [location]);

  useEffect(() => {
    // Track route changes
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`Route ${location.pathname} render time:`, duration, 'ms');
    };
  }, [location]);

  return null;
};

export default PerformanceMonitor;
