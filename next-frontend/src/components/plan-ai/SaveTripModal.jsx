'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X, Mountain, Check, Mail, Lock, User, Eye, EyeOff, LogIn, Sparkles
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../common/Button';

const VALUE_PROPS = [
  'Save this trip permanently',
  'Unlimited AI trip planning',
  'Drag-and-drop itinerary builder',
  'Share trips with travel companions',
  'Export as PDF',
  'Save parks, track visits & write reviews',
  'Access from any device',
];

export default function SaveTripModal({
  isOpen,
  onClose,
  parkName,
  anonymousId,
  formData,
  messages,
}) {
  const { signup, login } = useAuth();
  const { showToast } = useToast();

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

  if (!isOpen) return null;

  const storeChatContext = () => {
    const chatContext = {
      anonymousId,
      parkName,
      formData,
      messages,
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
      showToast('Welcome back! Your trip is saved.', 'success');
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Check your credentials.';
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

  const tripLabel = parkName || 'Your Trip';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl"
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
          className="border-b px-5 py-4 sm:px-6"
          style={{
            borderColor: 'var(--border)',
            background: 'linear-gradient(180deg, rgba(67, 160, 106, 0.05) 0%, rgba(255,255,255,0) 100%)'
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor: 'rgba(67, 160, 106, 0.12)',
                  color: 'var(--accent-green)'
                }}
              >
                <Mountain className="h-3.5 w-3.5" />
                Save Trip
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Save {tripLabel}
              </h2>
              <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                Create a free account to:
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

          <ul className="mt-4 space-y-1.5">
            {VALUE_PROPS.map((prop) => (
              <li key={prop} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                {prop}
              </li>
            ))}
          </ul>
        </div>

        {/* Scrollable body */}
        <div
          className="max-h-[calc(90vh-280px)] overflow-y-auto px-5 py-5 sm:px-6"
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
            <form onSubmit={handleSignup} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      type="text"
                      value={signupData.firstName}
                      onChange={e => handleSignupChange('firstName', e.target.value)}
                      placeholder="First name"
                      className="w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
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
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                    <input
                      type="text"
                      value={signupData.lastName}
                      onChange={e => handleSignupChange('lastName', e.target.value)}
                      placeholder="Last name"
                      className="w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
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
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type="email"
                    value={signupData.email}
                    onChange={e => handleSignupChange('email', e.target.value)}
                    placeholder="Email address"
                    className="w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
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
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={signupData.password}
                    onChange={e => handleSignupChange('password', e.target.value)}
                    placeholder="Password (8+ characters)"
                    className="w-full pl-11 pr-10 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.password ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
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
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={signupData.confirmPassword}
                    onChange={e => handleSignupChange('confirmPassword', e.target.value)}
                    placeholder="Confirm password"
                    className="w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
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
                size="md"
                icon={Sparkles}
                className="w-full"
              >
                {isLoading ? 'Creating account...' : 'Create Free Account'}
              </Button>

              <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Already have an account?{' '}
                <button onClick={switchToLogin} className="font-semibold" style={{ color: 'var(--accent-green)' }}>
                  Sign in
                </button>
              </p>
            </form>
          ) : mode === 'login' || signupSuccess ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type="email"
                    value={loginData.email}
                    onChange={e => handleLoginChange('email', e.target.value)}
                    placeholder="Email address"
                    autoFocus={!signupSuccess}
                    className="w-full pl-11 pr-3 py-3 rounded-xl text-sm outline-none transition"
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
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginData.password}
                    onChange={e => handleLoginChange('password', e.target.value)}
                    placeholder="Password"
                    className="w-full pl-11 pr-10 py-3 rounded-xl text-sm outline-none transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      border: `1px solid ${errors.password ? '#ef4444' : 'var(--border)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
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
                size="md"
                icon={LogIn}
                className="w-full"
              >
                {isLoading ? 'Signing in...' : 'Sign In & Save Trip'}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button onClick={switchToSignup} className="font-semibold" style={{ color: 'var(--accent-green)' }}>
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
    </div>
  );
}
