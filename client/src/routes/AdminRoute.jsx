import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

const AdminRoute = ({ children }) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAuth = async () => {
      try {
        // Check if admin is authenticated via localStorage
        const adminAuth = localStorage.getItem('adminAuthenticated');
        const adminEmail = localStorage.getItem('adminEmail');
        
        // Also check if user is logged in via JWT and has admin role
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        
        // Use environment variable for admin email (fallback to default for development)
        const expectedAdminEmail = import.meta.env.VITE_ADMIN_EMAIL || import.meta.env.REACT_APP_ADMIN_EMAIL || 'trailverseteam@gmail.com';
        if (adminAuth === 'true' && adminEmail === expectedAdminEmail) {
          // If we have localStorage admin auth, verify JWT auth as well
          if (token && user) {
            const userData = JSON.parse(user);
            if (userData.role === 'admin') {
              setIsAdminAuthenticated(true);
            } else {
              // User doesn't have admin role, clear admin session
              localStorage.removeItem('adminAuthenticated');
              localStorage.removeItem('adminEmail');
            }
          } else {
            // No JWT auth, clear admin session
            localStorage.removeItem('adminAuthenticated');
            localStorage.removeItem('adminEmail');
          }
        } else {
          // Clear any invalid admin session
          localStorage.removeItem('adminAuthenticated');
          localStorage.removeItem('adminEmail');
        }
      } catch (error) {
        console.error('Error checking admin auth:', error);
        // Clear admin session on error
        localStorage.removeItem('adminAuthenticated');
        localStorage.removeItem('adminEmail');
      } finally {
        setLoading(false);
      }
    };
    
    checkAdminAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

export default AdminRoute;
