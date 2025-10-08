import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import Button from '../components/common/Button';
import { CheckCircle, XCircle, Loader2, Sparkles, ArrowRight } from 'lucide-react';

const VerifyEmailPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const response = await authService.verifyEmail(token);
        setStatus('success');
        setMessage(response.message);
        
        // If verification includes a token, auto-login the user
        if (response.token && response.data) {
          // Store token and user data
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.data));
          
          // Redirect to profile/dashboard after 3 seconds
          setTimeout(() => {
            navigate('/explore?filter=national-parks');
          }, 3000);
        }
      } catch (error) {
        setStatus('error');
        setMessage(error.response?.data?.error || 'Verification failed');
      }
    };

    verifyEmail();
  }, [token, navigate]);

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
          {status === 'verifying' && (
            <>
              <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
                Just a moment...
              </h1>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                We&apos;re verifying your email address to activate your TrailVerse account.
              </p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
                Welcome aboard!
              </h1>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                Your adventure through 470+ National Parks begins now.
              </p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <h1 className="text-5xl lg:text-6xl font-light tracking-tighter leading-none mb-6" style={{ color: 'var(--text-primary)' }}>
                Something went wrong
              </h1>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                We couldn&apos;t verify your email. Let&apos;s try again.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right Side - Status Message */}
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

          {/* Status Card */}
          <div 
            className="p-8 rounded-2xl border text-center"
            style={{
              backgroundColor: 'var(--surface-hover)',
              borderColor: 'var(--border)'
            }}
          >
            {/* Verifying State */}
            {status === 'verifying' && (
              <>
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: 'var(--accent-green-light)' }}
                >
                  <Loader2 
                    className="h-8 w-8 animate-spin" 
                    style={{ color: 'var(--accent-green)' }} 
                  />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                  Verifying your email...
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Please wait while we verify your email address.
                </p>
              </>
            )}

            {/* Success State */}
            {status === 'success' && (
              <>
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: 'var(--accent-green-light)' }}
                >
                  <CheckCircle className="h-8 w-8" style={{ color: 'var(--accent-green)' }} />
                </div>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <h2 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Welcome to TrailVerse!
                  </h2>
                  <Sparkles className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                </div>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  {message || 'Your email has been verified successfully!'}
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
                  You&apos;re all set! Redirecting you to explore national parks...
                </p>
                
                <div className="flex items-center justify-center gap-2 mb-6">
                  <Loader2 
                    className="h-5 w-5 animate-spin" 
                    style={{ color: 'var(--accent-green)' }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Taking you to explore...
                  </span>
                </div>

                <Link to="/explore?filter=national-parks">
                  <Button variant="primary" size="lg" className="w-full">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Start Exploring Now
                  </Button>
                </Link>
              </>
            )}

            {/* Error State */}
            {status === 'error' && (
              <>
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                >
                  <XCircle className="h-8 w-8" style={{ color: 'var(--error)' }} />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                  Verification Failed
                </h2>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  {message || 'We couldn\'t verify your email address.'}
                </p>
                <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
                  The verification link may have expired or is invalid. Please try signing up again or contact support if the problem persists.
                </p>

                <div className="space-y-3">
                  <Link to="/signup">
                    <Button variant="primary" size="lg" className="w-full">
                      Sign Up Again
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="secondary" size="lg" className="w-full">
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Footer Help */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
            Having trouble?{' '}
            <Link to="/signup" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              Sign up again
            </Link>
            {' '}or{' '}
            <Link to="/" className="hover:opacity-80 transition" style={{ color: 'var(--text-secondary)' }}>
              return home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
