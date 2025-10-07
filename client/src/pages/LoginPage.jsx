import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/common/Button';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log('Login attempt with rememberMe:', rememberMe);
      await login(formData.email, formData.password, rememberMe);
      showToast('Welcome back!', 'success');
      navigate('/explore?filter=national-parks');
    } catch (error) {
      showToast(error.response?.data?.error || 'Login failed', 'error');
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
            Continue exploring America&apos;s 63 National Parks with AI-powered guidance and personalized recommendations.
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
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    console.log('Remember me checkbox clicked:', e.target.checked);
                    setRememberMe(e.target.checked);
                  }}
                  className="w-4 h-4 text-green-600 bg-transparent border-2 border-gray-300 rounded focus:ring-green-500 focus:ring-2 dark:border-gray-600 dark:focus:ring-green-500 dark:ring-offset-gray-800"
                  style={{
                    accentColor: 'var(--accent-green)'
                  }}
                />
                <span className="select-none">Remember me</span>
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

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span 
                className="px-2"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-tertiary)' 
                }}
              >
                Or continue with
              </span>
            </div>
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition hover:opacity-80"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderColor: 'var(--border)',
                borderWidth: '1px',
                color: 'var(--text-primary)'
              }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Google</span>
            </button>
            <button 
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition hover:opacity-80"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderColor: 'var(--border)',
                borderWidth: '1px',
                color: 'var(--text-primary)'
              }}
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </button>
          </div>

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