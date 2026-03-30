import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import authService from '../services/authService';
import { useToast } from '../context/ToastContext';
import Button from '../components/common/Button';
import { Mail, ArrowLeft, CheckCircle } from '@components/icons';

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
      setSuccess(true);
      showToast('Password reset link sent! Check your email.', 'success', 5000);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send reset email', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {/* Left Side - Logo & Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Link to="/" className="flex items-center gap-3 mb-12 group">
            <img 
              src="/logo.png" 
              alt="TrailVerse Logo" 
              className="h-16 w-16 rounded-xl object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </span>
          </Link>

          <div className="text-center max-w-md">
            <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
              Check your inbox
            </h1>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              We&apos;ve sent you instructions to reset your password.
            </p>
          </div>
        </div>

        {/* Right Side - Success Message */}
        <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
              <img 
                src="/logo.png" 
                alt="TrailVerse Logo" 
                className="h-10 w-10 rounded-xl object-contain"
              />
              <span className="text-xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
                TrailVerse
              </span>
            </Link>

            {/* Success Card */}
            <div 
              className="p-8 rounded-2xl border text-center"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderColor: 'var(--border)'
              }}
            >
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: 'var(--accent-green-light)' }}
              >
                <CheckCircle className="h-8 w-8" style={{ color: 'var(--accent-green)' }} />
              </div>
              
              <h2 className="text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                Check Your Email
              </h2>
              
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                We&apos;ve sent a password reset link to
              </p>
              
              <p className="font-medium mb-6 text-lg" style={{ color: 'var(--text-primary)' }}>
                {email}
              </p>
              
              <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
                The link will expire in 1 hour. If you don&apos;t see the email, check your spam folder.
              </p>

              <Link to="/login">
                <Button variant="secondary" size="lg" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Login
                </Button>
              </Link>
            </div>

            {/* Resend Email */}
            <p className="text-center text-sm mt-6" style={{ color: 'var(--text-secondary)' }}>
              Didn&apos;t receive the email?{' '}
              <button
                onClick={() => {
                  setSuccess(false);
                  showToast('You can request another reset link', 'info');
                }}
                className="font-medium hover:opacity-80 transition"
                style={{ color: 'var(--accent-green)' }}
              >
                Try again
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Side - Logo & Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <Link to="/" className="flex items-center gap-3 mb-12 group">
          <img 
            src="/logo.png" 
            alt="TrailVerse Logo" 
            className="h-16 w-16 rounded-xl object-contain transition-transform group-hover:scale-105"
          />
          <span className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
            TrailVerse
          </span>
        </Link>

        <div className="text-center max-w-md">
          <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
            Forgot your password?
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            No worries! Enter your email and we&apos;ll send you instructions to reset your password.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <img 
              src="/logo.png" 
              alt="TrailVerse Logo" 
              className="h-10 w-10 rounded-xl object-contain"
            />
            <span className="text-xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </span>
          </Link>

          {/* Header */}
          <div className="mb-8">
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
              variant="secondary"
              size="lg"
              className="w-full"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>

            {/* Back to Login */}
            <div className="text-center">
              <Link 
                to="/login" 
                className="inline-flex items-center gap-2 font-medium hover:opacity-80 transition text-sm"
                style={{ color: 'var(--accent-green)' }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
            Remember your password?{' '}
            <Link to="/login" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
