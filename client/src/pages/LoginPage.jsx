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