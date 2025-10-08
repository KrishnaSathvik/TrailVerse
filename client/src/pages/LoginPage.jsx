import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/common/Button';
import { Lock, Mail, Eye, EyeOff, CheckCircle, AlertCircle, Check } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showToast } = useToast();
  
  // Get state passed from signup page
  const verificationSent = location.state?.verificationSent;
  const prefilledEmail = location.state?.email;
  const firstName = location.state?.firstName;
  
  const [formData, setFormData] = useState({ 
    email: prefilledEmail || '', 
    password: '' 
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(verificationSent || false);
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

  const handleResendVerification = async () => {
    if (!prefilledEmail) {
      showToast('Please enter your email address', 'error');
      return;
    }

    setResendingEmail(true);
    try {
      // This would call a resend verification endpoint
      // For now, we'll show a message
      showToast('Verification email has been resent! Please check your inbox.', 'success', 5000);
      
      // In production, you would call:
      // await authService.resendVerification(prefilledEmail);
    } catch (error) {
      showToast('Failed to resend verification email. Please try again.', 'error');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Login attempt with rememberMe:', rememberMe);
      await login(formData.email, formData.password, rememberMe);
      showToast('Welcome back!', 'success');
      navigate('/explore?filter=national-parks');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      
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
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Side - Logo & Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Logo */}
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

        {/* Welcome Message */}
        <div className="text-center max-w-md">
          <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
            Welcome back!
          </h1>
          <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
            Continue exploring America&apos;s 470+ National Parks & Sites with AI-powered guidance and personalized recommendations.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
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

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-4xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Sign in to your account
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
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
              <Link to="/forgot-password" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
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
            <Link to="/terms" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Terms
            </Link> and{' '}
            <Link to="/privacy" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;