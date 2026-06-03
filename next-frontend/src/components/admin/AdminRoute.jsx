'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken, getStoredUser } from '@/services/authService';

const AdminRoute = ({ children }) => {
  const router = useRouter();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = getStoredToken();
      const userRaw = getStoredUser();

      if (!token || !userRaw) {
        setIsAdminAuthenticated(false);
        return;
      }

      const user = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
      setIsAdminAuthenticated(user?.role === 'admin');
    } catch (error) {
      console.error('Error checking admin auth:', error);
      setIsAdminAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !isAdminAuthenticated) {
      router.replace('/admin/login');
    }
  }, [loading, isAdminAuthenticated, router]);

  if (loading || !isAdminAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRoute;
