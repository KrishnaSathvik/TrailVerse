import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to detect idle users and refresh data when they return
 * Refreshes all user data when user becomes active after being idle for more than 1 minute
 */
export const useIdleRefresh = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const lastActivityRef = useRef(Date.now());
  const isIdleRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Track user activity
    const updateActivity = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      
      // If user was idle for more than 1 minute (60000ms) and now became active
      if (isIdleRef.current && timeSinceLastActivity > 60000) {
        console.log('[Idle-Refresh] User returned after being idle, refreshing all data...');
        
        // Refresh all user-related queries - WebSocket handles real-time updates, so we only refresh if truly idle
        queryClient.invalidateQueries(['visitedParks']);
        queryClient.invalidateQueries(['userReviews']);
        queryClient.invalidateQueries(['userProfile']);
        queryClient.invalidateQueries(['favorites']);
        
        isIdleRef.current = false;
      }
      
      lastActivityRef.current = now;
    };

    // Check for idle state every 30 seconds
    const idleCheckInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      
      // Mark as idle if no activity for 1 minute
      if (timeSinceLastActivity > 60000 && !isIdleRef.current) {
        console.log('[Idle-Refresh] User is now idle');
        isIdleRef.current = true;
      }
    }, 30000);

    // Track various user activities
    const events = [
      'mousedown',
      'mousemove', 
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Also track page visibility
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(idleCheckInterval);
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, queryClient]);
};
