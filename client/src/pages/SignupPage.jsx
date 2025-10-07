import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  User, Mail, Lock, Eye, EyeOff, ArrowRight, 
  Check, AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/common/Button';

const SignupPage = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    // First name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    // Last name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Terms validation
    if (!agreeToTerms) {
      newErrors.terms = 'You must agree to the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // Call the actual signup API
      await signup(
        formData.firstName,
        formData.lastName,
        formData.email,
        formData.password
      );
      
      showToast('Account created successfully! Please check your email to verify your account.', 'success');
      navigate('/');
    } catch (error) {
      console.error('Signup error:', error);
      showToast('Failed to create account. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const passwordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    return strength;
  };

  const getPasswordStrengthLabel = () => {
    const strength = passwordStrength(formData.password);
    if (strength === 0) return { label: '', color: '' };
    if (strength === 1) return { label: 'Weak', color: 'text-red-400' };
    if (strength === 2) return { label: 'Fair', color: 'text-yellow-400' };
    if (strength === 3) return { label: 'Good', color: 'text-blue-400' };
    return { label: 'Strong', color: 'text-green-400' };
  };

  const getPasswordStrengthWidth = () => {
    const strength = passwordStrength(formData.password);
    return `${(strength / 4) * 100}%`;
  };

  const getPasswordStrengthColor = () => {
    const strength = passwordStrength(formData.password);
    if (strength === 1) return 'bg-red-500';
    if (strength === 2) return 'bg-yellow-500';
    if (strength === 3) return 'bg-blue-500';
    return 'bg-green-500';
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
            Join the adventure!
          </h1>
          <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
            Start exploring America&apos;s 63 National Parks with AI-powered trip planning and personalized recommendations.
          </p>
        </div>
      </div>

      {/* Right Side - Signup Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-3 mb-8 group">
            <img 
              src="/logo.png" 
              alt="TrailVerse Logo" 
              className="h-12 w-12 rounded-xl object-contain"
            />
            <span className="text-2xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div 
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 backdrop-blur mb-4"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderColor: 'var(--border)',
                borderWidth: '1px'
              }}
            >
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Join Our Community
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Create Account
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Start your journey through America&apos;s national parks
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* First Name */}
              <div>
                <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="John"
                    className={`w-full pl-11 pr-4 py-3.5 rounded-xl outline-none transition ${
                      errors.firstName ? 'ring-2 ring-red-500' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: errors.firstName ? '#ef4444' : 'var(--border)',
                      borderWidth: '1px',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => {
                      if (!errors.firstName) {
                        e.target.style.borderColor = 'var(--accent-green)';
                        e.target.style.backgroundColor = 'var(--surface-active)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.firstName) {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.backgroundColor = 'var(--surface-hover)';
                      }
                    }}
                  />
                </div>
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.firstName}
                  </p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Doe"
                    className={`w-full pl-11 pr-4 py-3.5 rounded-xl outline-none transition ${
                      errors.lastName ? 'ring-2 ring-red-500' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: errors.lastName ? '#ef4444' : 'var(--border)',
                      borderWidth: '1px',
                      color: 'var(--text-primary)'
                    }}
                    onFocus={(e) => {
                      if (!errors.lastName) {
                        e.target.style.borderColor = 'var(--accent-green)';
                        e.target.style.backgroundColor = 'var(--surface-active)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.lastName) {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.backgroundColor = 'var(--surface-hover)';
                      }
                    }}
                  />
                </div>
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter your email"
                  className={`w-full pl-11 pr-4 py-3.5 rounded-xl outline-none transition ${
                    errors.email ? 'ring-2 ring-red-500' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: errors.email ? '#ef4444' : 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    if (!errors.email) {
                      e.target.style.borderColor = 'var(--accent-green)';
                      e.target.style.backgroundColor = 'var(--surface-active)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.email) {
                      e.target.style.borderColor = 'var(--border)';
                      e.target.style.backgroundColor = 'var(--surface-hover)';
                    }
                  }}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className={`w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition ${
                    errors.password ? 'ring-2 ring-red-500' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: errors.password ? '#ef4444' : 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    if (!errors.password) {
                      e.target.style.borderColor = 'var(--accent-green)';
                      e.target.style.backgroundColor = 'var(--surface-active)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.password) {
                      e.target.style.borderColor = 'var(--border)';
                      e.target.style.backgroundColor = 'var(--surface-hover)';
                    }
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
              
              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Password strength:
                    </span>
                    <span className={`text-xs font-semibold ${getPasswordStrengthLabel().color}`}>
                      {getPasswordStrengthLabel().label}
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                  >
                    <div
                      className={`h-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                      style={{ width: getPasswordStrengthWidth() }}
                    />
                  </div>
                </div>
              )}

              {errors.password && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className={`w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition ${
                    errors.confirmPassword ? 'ring-2 ring-red-500' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: errors.confirmPassword ? '#ef4444' : 'var(--border)',
                    borderWidth: '1px',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    if (!errors.confirmPassword) {
                      e.target.style.borderColor = 'var(--accent-green)';
                      e.target.style.backgroundColor = 'var(--surface-active)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.confirmPassword) {
                      e.target.style.borderColor = 'var(--border)';
                      e.target.style.backgroundColor = 'var(--surface-hover)';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => {
                      setAgreeToTerms(e.target.checked);
                      if (errors.terms) {
                        setErrors(prev => ({ ...prev, terms: undefined }));
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div 
                    className="w-5 h-5 rounded border-2 transition-all"
                    style={{
                      backgroundColor: agreeToTerms ? 'var(--accent-green)' : 'var(--surface-hover)',
                      borderColor: agreeToTerms ? 'var(--accent-green)' : 'var(--border)'
                    }}
                  >
                    {agreeToTerms && (
                      <Check className="h-4 w-4 text-white stroke-[3]" />
                    )}
                  </div>
                </div>
                <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
                  I agree to the{' '}
                  <Link to="/terms" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="font-medium hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.terms && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1 ml-8">
                  <AlertCircle className="h-3 w-3" />
                  {errors.terms}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              loading={isLoading}
              variant="primary"
              size="lg"
              icon={ArrowRight}
              iconPosition="right"
              className="w-full"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          {/* Sign In Link */}
          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold hover:opacity-80 transition" style={{ color: 'var(--accent-green)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;