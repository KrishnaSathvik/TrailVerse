import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Shield } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Admin authentication now uses JWT system with role-based access

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email.trim() || !formData.password.trim()) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    setLoading(true);

    try {
      // Use the regular authentication system
      const authService = (await import('../../services/authService')).default;
      const response = await authService.login(formData.email, formData.password);
      
      // Check if user has admin role
      if (response.data.role === 'admin') {
        // Store admin session in localStorage for AdminRoute component
        localStorage.setItem('adminAuthenticated', 'true');
        localStorage.setItem('adminEmail', formData.email);
        
        showToast('Welcome back, Admin!', 'success');
        navigate('/admin');
      } else {
        showToast('Access denied. Admin privileges required.', 'error');
        // Logout the user since they don't have admin role
        authService.logout();
      }
    } catch (error) {
      console.error('Admin login error:', error);
      showToast('Invalid admin credentials', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Shield className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Admin Access
            </span>
          </div>

          <div className="text-center">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Secure Admin Portal
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Access the TrailVerse admin dashboard with secure authentication. 
              Manage content, users, and platform settings.
            </p>
          </div>
        </div>
      </section>

      {/* Login Form Section */}
      <section className="pb-24">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl p-8 sm:p-12 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            {/* Form Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ring-1"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderColor: 'var(--border)'
                }}
              >
                <Lock className="h-8 w-8" style={{ color: 'var(--text-primary)' }} />
              </div>
              <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Sign In
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Enter your admin credentials to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-semibold mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter admin email"
                  className="w-full pl-12 pr-4 py-4 rounded-xl outline-none transition text-lg"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-semibold mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter admin password"
                  className="w-full pl-12 pr-12 py-4 rounded-xl outline-none transition text-lg"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full font-semibold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:opacity-80"
              style={{
                backgroundColor: 'var(--accent-green)',
                color: 'white'
              }}
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 p-4 rounded-xl"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Lock className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  Secure Admin Access
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  This is a restricted admin area. Only authorized personnel can access this dashboard.
                </p>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminLoginPage;
