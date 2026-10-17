'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X, Check, Mail, Lock, User, Eye, EyeOff
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../common/Button';
import { getSignupPrompt } from '@/lib/planAiSignupPrompts';
import TrailieAvatar from './TrailieAvatar';

export default function SaveTripModal({
  isOpen,
  onClose,
  parkName,
  anonymousId,
  conversationId = null,
  formData,
  messages,
  reason = 'save-itinerary',
  initialMode = 'signup',
  surface = null,
}) {
  const { signup, login } = useAuth();
  const { showToast } = useToast();
  const prompt = getSignupPrompt(reason, { parkName });

  const [mode, setMode] = useState('signup');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [signupSuccess, setSignupSuccess] = useState(false);

  const [signupData, setSignupData] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const [loginData, setLoginData] = useState({ email: '', password: '' });

  const dialogRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode === 'login' ? 'login' : 'signup');
    setSignupSuccess(false);
    setErrors({});
  }, [isOpen, initialMode]);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button, input, a[href], [tabindex="0"]')]
        .filter(element => !element.disabled && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;


  const storeChatContext = () => {
    const chatContext = {
      anonymousId,
      conversationId,
      parkName,
      formData,
      messages,
      // The workspace the guest asked to open; migration lands there directly.
      surface,
      timestamp: Date.now(),
    };
    localStorage.setItem('returnToChat', JSON.stringify(chatContext));
  };

  const validateSignup = () => {
    const e = {};
    if (!signupData.firstName.trim()) e.firstName = 'First name is required';
    if (!signupData.lastName.trim()) e.lastName = 'Last name is required';
    if (!signupData.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(signupData.email)) e.email = 'Email is invalid';
    if (!signupData.password) e.password = 'Password is required';
    else if (signupData.password.length < 8) e.password = 'At least 8 characters';
    if (signupData.password !== signupData.confirmPassword) e.confirmPassword = 'Passwords don\'t match';
    if (!agreeToTerms) e.terms = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validateSignup()) return;
    setIsLoading(true);
    try {
      storeChatContext();
      await signup(signupData.firstName, signupData.lastName, signupData.email, signupData.password);
      setSignupSuccess(true);
      setLoginData(prev => ({ ...prev, email: signupData.email }));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create account.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const validateLogin = () => {
    const e = {};
    if (!loginData.email.trim()) e.email = 'Email is required';
    if (!loginData.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateLogin()) return;
    setIsLoading(true);
    try {
      storeChatContext();
      await login(loginData.email, loginData.password);
      showToast('Welcome back!', 'success');
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Login failed. Check your credentials.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupChange = (field, value) => {
    setSignupData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleLoginChange = (field, value) => {
    setLoginData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const switchToLogin = () => {
    setMode('login');
    setErrors({});
  };

  const switchToSignup = () => {
    setMode('signup');
    setSignupSuccess(false);
    setErrors({});
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-trip-form-title"
        className="trailie-account-dialog relative flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg flex-col overflow-y-auto rounded-[1.75rem]"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="shrink-0 px-5 pt-6 sm:px-8 sm:pt-8"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  color: 'var(--accent-green)'
                }}
              >
                <TrailieAvatar className="!h-10 !w-10" />
                Trailie
              </div>
              <h2 id="save-trip-form-title" className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {prompt.title}
              </h2>
              <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {prompt.subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-colors"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>


        </div>

        {/* Scrollable body */}
        <div
          className="min-w-0 px-5 py-6 sm:px-8 sm:pb-8"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {/* Tab toggle */}
          <div className="flex rounded-xl p-1 mb-5" style={{ backgroundColor: 'var(--surface-hover)' }}>
            <button
              onClick={switchToSignup}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-center transition"
              style={{
                backgroundColor: mode === 'signup' ? 'var(--surface)' : 'transparent',
                color: mode === 'signup' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: mode === 'signup' ? 'var(--shadow)' : 'none',
              }}
            >
              Create Account
            </button>
            <button
              onClick={switchToLogin}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-center transition"
              style={{
                backgroundColor: mode === 'login' ? 'var(--surface)' : 'transparent',
                color: mode === 'login' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: mode === 'login' ? 'var(--shadow)' : 'none',
              }}
            >
              Sign In
            </button>
          </div>

          {/* Signup success message */}
          {signupSuccess && (
            <div
              className="flex items-start gap-3 rounded-xl p-3 mb-4"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}
            >
              <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Check your email!
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  We sent a verification link to <strong>{signupData.email}</strong>. Verify your email, then sign in below.
                </p>
                <button
                  onClick={switchToLogin}
                  className="text-xs font-semibold mt-2 transition hover:opacity-80"
                  style={{ color: 'var(--accent-green)' }}
                >
                  Sign in now &rarr;
                </button>
              </div>
            </div>
          )}

          {mode === 'signup' && !signupSuccess ? (
            <form onSubmit={handleSignup} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="trip-signup-first-name" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">First name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      id="trip-signup-first-name"
                      autoComplete="given-name"
                      type="text"
                      value={signupData.firstName}
                      onChange={e => handleSignupChange('firstName', e.target.value)}
                      placeholder="First name"
                      className="min-w-0 w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        border: `1px solid ${errors.firstName ? '#ef4444' : 'var(--border)'}`,
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="trip-signup-last-name" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Last name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      id="trip-signup-last-name"
                      autoComplete="family-name"
                      type="text"
                      value={signupData.lastName}
                      onChange={e => handleSignupChange('lastName', e.target.value)}
                      placeholder="Last name"
                      className="min-w-0 w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        border: `1px solid ${errors.lastName ? '#ef4444' : 'var(--border)'}`,
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="trip-signup-email" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    id="trip-signup-email"
                    autoComplete="email"
                    type="email"
                    value={signupData.email}
                    onChange={e => handleSignupChange('email', e.target.value)}
                    placeholder="Email address"
                    className="min-w-0 w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.email ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="trip-signup-password" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    id="trip-signup-password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={signupData.password}
                    onChange={e => handleSignupChange('password', e.target.value)}
                    placeholder="Password (8+ characters)"
                    className="min-w-0 w-full pl-11 pr-10 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.password ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="trip-signup-confirm-password" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    id="trip-signup-confirm-password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={signupData.confirmPassword}
                    onChange={e => handleSignupChange('confirmPassword', e.target.value)}
                    placeholder="Confirm password"
                    className="min-w-0 w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.confirmPassword ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={e => {
                      setAgreeToTerms(e.target.checked);
                      if (errors.terms) setErrors(prev => ({ ...prev, terms: undefined }));
                    }}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded border transition flex items-center justify-center"
                    style={{
                      backgroundColor: agreeToTerms ? 'var(--accent-green)' : 'var(--surface-hover)',
                      borderColor: agreeToTerms ? 'var(--accent-green)' : errors.terms ? '#ef4444' : 'var(--border)',
                    }}
                  >
                    {agreeToTerms && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" className="font-medium" style={{ color: 'var(--accent-green)' }}>Terms</Link>
                  {' '}and{' '}
                  <Link href="/privacy" target="_blank" className="font-medium" style={{ color: 'var(--accent-green)' }}>Privacy Policy</Link>
                </span>
              </label>

              <Button
                type="submit"
                disabled={isLoading}
                loading={isLoading}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isLoading ? 'Creating account...' : prompt.primaryCta}
              </Button>

              <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Already have an account?{' '}
                <button type="button" onClick={switchToLogin} className="font-semibold" style={{ color: 'var(--accent-green)' }}>
                  Sign in
                </button>
              </p>
            </form>
          ) : mode === 'login' || signupSuccess ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="trip-login-email" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    id="trip-login-email"
                    autoComplete="email"
                    type="email"
                    value={loginData.email}
                    onChange={e => handleLoginChange('email', e.target.value)}
                    placeholder="Email address"
                    autoFocus={!signupSuccess}
                    className="min-w-0 w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.email ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="trip-login-password" className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    id="trip-login-password"
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginData.password}
                    onChange={e => handleLoginChange('password', e.target.value)}
                    placeholder="Password"
                    className="min-w-0 w-full pl-11 pr-10 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.password ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                loading={isLoading}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {isLoading ? 'Signing in...' : prompt.loginCta || `${prompt.secondaryCta} & Save`}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={switchToSignup} className="font-semibold" style={{ color: 'var(--accent-green)' }}>
                  Create account
                </button>
                <Link href="/forgot-password" target="_blank" style={{ color: 'var(--text-tertiary)' }}>
                  Forgot password?
                </Link>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
