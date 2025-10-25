import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LandingPage from '../pages/LandingPage';

const HomeRedirect = () => {
  const { isAuthenticated, loading } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // If authenticated, redirect to /home (Daily Feed)
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  // If not authenticated, show landing page
  return <LandingPage />;
};

export default HomeRedirect;
