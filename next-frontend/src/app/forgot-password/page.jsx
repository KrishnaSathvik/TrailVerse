"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import authService from '@/services/authService';
import { useToast } from '@/context/ToastContext';
import Button from '@/components/common/Button';
import AuthShell from '@/components/auth/AuthShell';
import { Mail, ArrowLeft, CheckCircle } from '@components/icons';
import { logEvent } from '@/utils/analytics';

const ForgotPasswordPage = () => {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authService.forgotPassword(email);
      logEvent('Auth', 'forgot_password_sent', 'email');
      setSuccess(true);
      showToast('Password reset link sent! Check your email.', 'success', 5000);
    } catch (err) {
      logEvent('Auth', 'forgot_password_failed', err.response?.data?.error || 'unknown');
      showToast(err.response?.data?.error || 'Failed to send reset email', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell
        desktopTitle="Check your inbox"
        desktopDescription="We've sent you instructions to reset your password."
      >
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: 'var(--accent-green-light)' }}
          >
            <CheckCircle className="h-8 w-8" style={{ color: 'var(--accent-green)' }} />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl mb-3" style={{ color: 'var(--text-primary)' }}>
            Check your email
          </h2>

          <p className="text-sm lg:text-base" style={{ color: 'var(--text-secondary)' }}>
            We&apos;ve sent a password reset link to
          </p>
          <p className="mt-1 mb-5 font-medium break-all" style={{ color: 'var(--text-primary)' }}>
            {email}
          </p>

          <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
            The link will expire in 1 hour. If you don&apos;t see the email, check your spam folder.
          </p>

          <Button href="/login" variant="primary" size="lg" icon={ArrowLeft} className="w-full">
            Back to Login
          </Button>

          <p className="text-sm mt-6" style={{ color: 'var(--text-secondary)' }}>
            Didn&apos;t receive the email?{' '}
            <button
              type="button"
              onClick={() => {
                setSuccess(false);
                showToast('You can request another reset link', 'info');
              }}
              className="font-medium hover:opacity-80 transition"
              style={{ color: 'var(--accent-green)', minHeight: 0 }}
            >
              Try again
            </button>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      desktopTitle="Forgot your password?"
      desktopDescription="No worries! Enter your email and we'll send you instructions to reset your password."
    >
      {/* Header */}
      <div className="hidden lg:block lg:mb-8">
        <h2 className="text-4xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
          Reset your password
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Enter your email address and we&apos;ll send you a link to reset your password.
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={loading}
          loading={loading}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </Button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm mt-6" style={{ color: 'var(--text-secondary)' }}>
        Remember your password?{' '}
        <Link href="/login" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
