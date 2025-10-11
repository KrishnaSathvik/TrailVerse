import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import PerformanceMonitor from './components/common/PerformanceMonitor';
import ScrollToTop from './components/common/ScrollToTop';
import CookieConsent from './components/common/CookieConsent';
import PrivateRoute from './routes/PrivateRoute';
import AdminRoute from './routes/AdminRoute';
import { initGA, trackPageView } from './utils/analytics';
import { setQueryClient } from './utils/cacheUtils';
import localStorageMonitor from './utils/localStorageMonitor';

// Lazy load all pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ExploreParksPage = lazy(() => import('./pages/ExploreParksPage'));
const ParkDetailPage = lazy(() => import('./pages/ParkDetailPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const PlanAIPage = lazy(() => import('./pages/PlanAIPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));
const TestParkPage = lazy(() => import('./pages/TestParkPage'));
const TestimonialsPage = lazy(() => import('./pages/TestimonialsPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Admin Pages
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const CreateBlogPage = lazy(() => import('./pages/admin/CreateBlogPage'));
const EditBlogPage = lazy(() => import('./pages/admin/EditBlogPage'));
const AdminPerformancePage = lazy(() => import('./pages/admin/AdminPerformancePage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

// Create Query Client with optimized caching for NPS API limits
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000, // 30 minutes default - more conservative
      cacheTime: 24 * 60 * 60 * 1000, // 24 hours default - keep data longer
      refetchOnWindowFocus: false, // Don't refetch on focus
      refetchOnMount: false, // Don't refetch on mount if data is fresh
      refetchOnReconnect: false, // Don't auto-refetch on reconnect
      retry: 2, // Retry failed requests 2 times
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Set the queryClient instance for cache utilities
setQueryClient(queryClient);

function AnalyticsTracker() {
  const location = window.location;

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}

function App() {
  useEffect(() => {
    initGA();
    console.log('🚀 National Parks Explorer App loaded successfully!');
    
    // Initialize localStorage monitoring
    if (process.env.NODE_ENV === 'development') {
      // Log status in development
      localStorageMonitor.logStatus();
    }
    
    // Start periodic monitoring (every 5 minutes in production, 1 minute in dev)
    const interval = process.env.NODE_ENV === 'development' ? 60000 : 300000;
    localStorageMonitor.startMonitoring(interval);
    
    // Cleanup on unmount
    return () => {
      localStorageMonitor.stopMonitoring();
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <HelmetProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                  <BrowserRouter>
                <ScrollToTop />
                <AnalyticsTracker />
                <PerformanceMonitor />
                <CookieConsent />
                <Suspense fallback={<LoadingScreen />}>
                  <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
            <Route 
              path="/explore" 
              element={
                <PrivateRoute>
                  <ExploreParksPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/map" 
              element={
                <PrivateRoute>
                  <MapPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/compare" 
              element={
                <PrivateRoute>
                  <ComparePage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/events" 
              element={
                <PrivateRoute>
                  <EventsPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/blog" 
              element={
                <PrivateRoute>
                  <BlogPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/blog/:slug" 
              element={
                <PrivateRoute>
                  <BlogPostPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/parks/:parkCode" 
              element={
                <PrivateRoute>
                  <ParkDetailPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <ProfilePage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/plan-ai" 
              element={
                <PrivateRoute>
                  <PlanAIPage />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/plan-ai/:tripId" 
              element={
                <PrivateRoute>
                  <PlanAIPage />
                </PrivateRoute>
              } 
            />
            <Route path="/test/:parkCode" element={<TestParkPage />} />
            <Route path="/testimonials" element={<TestimonialsPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/blog/new" 
              element={
                <AdminRoute>
                  <CreateBlogPage />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/blog/edit/:id" 
              element={
                <AdminRoute>
                  <EditBlogPage />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/performance" 
              element={
                <AdminRoute>
                  <AdminPerformancePage />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/users" 
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              } 
            />
            <Route 
              path="/admin/settings" 
              element={
                <AdminRoute>
                  <AdminSettingsPage />
                </AdminRoute>
              } 
            />
            
            <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
                </BrowserRouter>
                
                </ToastProvider>
              </AuthProvider>
          </QueryClientProvider>
        </HelmetProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
