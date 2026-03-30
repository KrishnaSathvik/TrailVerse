import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PerformanceMonitor = () => {
  const pathname = usePathname();

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
  }, [pathname]);

  useEffect(() => {
    // Track route changes
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`Route ${pathname} render time:`, duration, 'ms');
    };
  }, [pathname]);

  return null;
};

export default PerformanceMonitor;
