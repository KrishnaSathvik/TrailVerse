"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Button from '@/components/common/Button';
import AuthShell from '@/components/auth/AuthShell';
import { Lock, Mail, Eye, EyeOff, CheckCircle, AlertCircle, Check } from '@components/icons';
import { logEvent } from '@/utils/analytics';

const LoginContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, authTransition } = useAuth();
  const { showToast } = useToast();
  
  // Get state passed from signup page via searchParams
  const verificationSent = searchParams.get('verificationSent') === 'true';
  const emailWarning = searchParams.get('emailWarning') === 'true';
  const prefilledEmail = searchParams.get('email');
  const firstName = searchParams.get('firstName');
  
  const [formData, setFormData] = useState({ 
    email: prefilledEmail || '', 
    password: '' 
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(verificationSent || false);
  const [showEmailWarning, setShowEmailWarning] = useState(emailWarning || false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Auto-dismiss verification banner after 10 seconds
  useEffect(() => {
    if (showVerificationBanner) {
      const timer = setTimeout(() => {
        setShowVerificationBanner(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showVerificationBanner]);

  // Auto-dismiss email warning banner after 12 seconds
  useEffect(() => {
    if (showEmailWarning) {
      const timer = setTimeout(() => {
        setShowEmailWarning(false);
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [showEmailWarning]);

  const handleResendVerification = async () => {
    if (!prefilledEmail) {
      showToast('Please enter your email address', 'error');
      return;
    }

    setResendingEmail(true);
    try {
      await authService.resendVerification(prefilledEmail);
      showToast('Verification email has been resent! Please check your inbox.', 'success', 5000);
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to resend verification email. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Login attempt with rememberMe:', rememberMe);
      const result = await login(formData.email, formData.password, rememberMe);
      logEvent('Auth', 'login_success', 'email');
      if (result?.redirectedToChat) {
        return;
      }
      showToast('Welcome back!', 'success');
      router.push('/home');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      logEvent('Auth', 'login_failed', errorMessage.substring(0, 50));

      // Check if error is due to unverified email
      if (errorMessage.includes('verify') || errorMessage.includes('verification')) {
        showToast('Please verify your email before logging in. Check your inbox!', 'warning', 6000);
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      desktopTitle="Welcome back!"
      desktopDescription="Sign in to save your favorite parks, track visited sites, keep your current AI chat, and pick up right where you left off."
      mobileTitle="Sign in to your account"
      mobileDescription="Save favorite parks, keep your current AI chat, and pick up right where you left off."
    >
            {authTransition.active && (
              <div 
                className="mb-6 p-4 rounded-xl border-2 flex items-start gap-3 animate-fade-in"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderColor: 'var(--accent-green)',
                }}
              >
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-green)' }} />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    Saving your chat
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {authTransition.message}
                  </p>
                </div>
              </div>
            )}

          {/* Verification Success Banner */}
          {showVerificationBanner && (
            <div 
              className="mb-6 p-4 rounded-xl border-2 flex items-start gap-3 animate-fade-in"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderColor: 'var(--accent-green)',
              }}
            >
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-green)' }} />
              <div className="flex-1">
                <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {firstName ? `Welcome, ${firstName}!` : 'Account Created Successfully!'}
                </h3>
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  We&apos;ve sent a verification email to <strong>{prefilledEmail}</strong>
                </p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  Please check your inbox and click the verification link to activate your account. 
                  Then you can log in below.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleResendVerification}
                    disabled={resendingEmail}
                    className="text-xs font-medium hover:opacity-80 transition disabled:opacity-50"
                    style={{ color: 'var(--accent-green)' }}
                  >
                    {resendingEmail ? 'Sending...' : 'Resend Email'}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>•</span>
                  <button
                    onClick={() => setShowVerificationBanner(false)}
                    className="text-xs font-medium hover:opacity-80 transition"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Email Warning Banner */}
          {showEmailWarning && (
            <div 
              className="mb-6 p-4 rounded-xl border-2 flex items-start gap-3 animate-fade-in"
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                borderColor: '#fbbf24',
              }}
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
              <div className="flex-1">
                <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {firstName ? `Welcome, ${firstName}!` : 'Account Created'}
                </h3>
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Your account was created successfully, but we had trouble sending the verification email.
                </p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  You can still log in below, but some features may be limited until your email is verified.
                  If you need help, please contact support.
                </p>
                <button
                  onClick={() => setShowEmailWarning(false)}
                  className="text-xs font-medium hover:opacity-80 transition"
                  style={{ color: '#fbbf24' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div
            className="hidden lg:block lg:mb-8 lg:rounded-none lg:border-0 lg:px-0 lg:py-0"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'transparent'
            }}
          >
            <h2 className="text-2xl font-semibold tracking-tight lg:text-4xl lg:mb-2" style={{ color: 'var(--text-primary)' }}>
              Sign in to your account
            </h2>
            <p className="mt-1 text-sm leading-relaxed lg:text-base" style={{ color: 'var(--text-secondary)' }}>
              Continue planning trips, saving favorites, and tracking the parks you&apos;ve explored.
            </p>
            <p className="mt-3 text-sm lg:mt-2" style={{ color: 'var(--text-secondary)' }}>
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
                Create one
              </Link>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="Enter your email"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-green)';
                    e.target.style.backgroundColor = 'var(--surface-active)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.backgroundColor = 'var(--surface-hover)';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  placeholder="Enter your password"
                  className="w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-green)';
                    e.target.style.backgroundColor = 'var(--surface-active)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                    e.target.style.backgroundColor = 'var(--surface-hover)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => {
                      console.log('Remember me checkbox clicked:', e.target.checked);
                      setRememberMe(e.target.checked);
                    }}
                    className="sr-only peer"
                  />
                  <div 
                    className="w-5 h-5 rounded border-2 transition-all flex items-center justify-center"
                    style={{
                      backgroundColor: rememberMe ? 'var(--accent-green)' : 'var(--surface-hover)',
                      borderColor: rememberMe ? 'var(--accent-green)' : 'var(--border)'
                    }}
                  >
                    {rememberMe && (
                      <Check className="h-4 w-4 text-white stroke-[3]" />
                    )}
                  </div>
                </div>
                <span className="select-none group-hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
                  Remember me
                </span>
              </label>
              <Link href="/forgot-password" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              variant="primary"
              size="lg"
              className="w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>


          {/* Footer */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
            By signing in, you agree to our{' '}
            <Link href="/terms" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Terms
            </Link> and{' '}
            <Link href="/privacy" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Privacy Policy
            </Link>
          </p>
          <p className="mt-3 text-center text-sm lg:hidden" style={{ color: 'var(--text-secondary)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
              Create one
            </Link>
          </p>
    </AuthShell>
  );
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
