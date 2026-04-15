import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../common/Button';
import { Lock, Mail, Eye, EyeOff, X } from '@components/icons';
import { logEvent } from '../../utils/analytics';

const LoginModal = ({ isOpen, onClose, message }) => {
  const { login } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await login(formData.email, formData.password, true); // remember me = true by default
      logEvent('Auth', 'modal_login_success', 'email');
      showToast('Welcome back!', 'success');
      onClose();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      logEvent('Auth', 'modal_login_failed', errorMessage.substring(0, 50));
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl relative animate-scale-up"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 transition-colors z-10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Sign In
            </h2>
            <p className="text-sm font-medium px-4 py-2 mt-4 rounded-xl inline-block" 
               style={{ color: 'var(--accent-green)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
              {message || "Please log in to continue"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="Enter your email"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-green)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3.5 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-green)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-black/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              variant="primary"
              size="lg"
              className="w-full mt-2 py-4 shadow-lg shadow-green-900/20"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {/* Footer Navigation */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Don&apos;t have an account?{' '}
              <button 
                onClick={() => { onClose(); router.push('/signup'); }} 
                className="font-bold hover:underline transition-all" 
                style={{ color: 'var(--accent-green)' }}
              >
                Create one
              </button>
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <button 
                onClick={() => { onClose(); router.push('/forgot-password'); }} 
                className="font-semibold hover:underline transition-all" 
                style={{ color: 'var(--text-secondary)' }}
              >
                Forgot password?
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
