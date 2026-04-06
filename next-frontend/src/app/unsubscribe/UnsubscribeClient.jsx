"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Mail, Shield, CheckCircle, XCircle, AlertTriangle,
  ArrowLeft, Settings, Bell, BellOff, Loader2
} from '@components/icons';
import Button from '@/components/common/Button';

const UnsubscribeContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get parameters from URL
  const email = searchParams.get('email');
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [preferences, setPreferences] = useState({
    blogNotifications: true
  });

  useEffect(() => {
    if (email) {
      loadUserPreferences();
    } else {
      setLoading(false);
      setMessage('No email address provided');
      setMessageType('error');
    }
  }, [email]);

  const loadUserPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/email/preferences?email=${encodeURIComponent(email)}`);
      const data = await response.json();

      if (data.success) {
        if (data.data.emailNotifications) {
          setPreferences({
            blogNotifications: data.data.emailNotifications.blogNotifications !== false
          });
        }
      }
      // If API returns error, just show defaults — don't block the page
    } catch (error) {
      console.error('Error loading preferences:', error);
      // Show page with defaults instead of an error
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async (unsubscribeType = 'all') => {
    try {
      setSubmitting(true);
      setMessage('');

      const requestData = {
        email,
        type: unsubscribeType,
        token: token || undefined
      };

      const response = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage(data.message || 'Successfully unsubscribed from TrailVerse emails');
        setMessageType('success');
        if (unsubscribeType === 'all') {
          setPreferences({ blogNotifications: false });
        }
      } else {
        setMessage(data.error || 'Failed to unsubscribe');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
      setMessage('Error processing unsubscribe request');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePreferences = async () => {
    try {
      setSubmitting(true);
      setMessage('');

      const requestData = {
        email,
        preferences: { blogNotifications: preferences.blogNotifications }
      };

      const response = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage('Email preferences updated successfully');
        setMessageType('success');
      } else {
        setMessage(data.error || 'Failed to update preferences');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      setMessage('Error updating email preferences');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubscribe = async () => {
    try {
      setSubmitting(true);
      setMessage('');

      const response = await fetch('/api/email/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        setMessage('Successfully resubscribed to TrailVerse emails');
        setMessageType('success');
        setPreferences({ blogNotifications: true });
      } else {
        setMessage(data.error || 'Failed to resubscribe');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error resubscribing:', error);
      setMessage('Error processing resubscribe request');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreferenceChange = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getMessageIcon = () => {
    switch (messageType) {
      case 'success':
        return <CheckCircle className="w-5 h-5" style={{ color: 'var(--accent-green)' }} />;
      case 'error':
        return <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />;
      case 'info':
        return <AlertTriangle className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading email preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <section style={{ padding: '3rem 0 4rem' }}>
      <div className="container mx-auto px-4">
        <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
          {/* Header */}
          <div className="text-center" style={{ marginBottom: '2.5rem' }}>
            <div
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: '4rem', height: '4rem', backgroundColor: 'var(--accent-green-light)', marginBottom: '1rem' }}
            >
              <Mail className="w-8 h-8" style={{ color: 'var(--accent-green)' }} />
            </div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Email Preferences
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
              Manage your TrailVerse email subscriptions
            </p>
            {email && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Managing preferences for: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{email}</span>
              </p>
            )}
          </div>

          {/* Message */}
          {message && (
            <div
              style={{
                borderRadius: '0.75rem',
                border: '1px solid',
                padding: '1rem',
                marginBottom: '1.5rem',
                backgroundColor: messageType === 'success' ? 'var(--accent-green-light)' :
                                messageType === 'error' ? 'rgba(239, 68, 68, 0.15)' :
                                'var(--surface-hover)',
                borderColor: messageType === 'success' ? 'var(--accent-green)' :
                            messageType === 'error' ? 'var(--error)' :
                            'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <div className="flex items-center">
                {getMessageIcon()}
                <p className="ml-2 font-medium">{message}</p>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div
            style={{
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <h2 className="flex items-center" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              <Settings className="w-5 h-5 mr-2" />
              Quick Actions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => handleUnsubscribe('all')}
                disabled={submitting}
                variant="danger"
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <BellOff className="w-4 h-4 mr-2" />
                )}
                Unsubscribe All
              </Button>

              <Button
                onClick={handleResubscribe}
                disabled={submitting}
                variant="secondary"
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Bell className="w-4 h-4 mr-2" />
                )}
                Resubscribe All
              </Button>

              <Button
                onClick={() => router.push('/')}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Site
              </Button>
            </div>
          </div>

          {/* Email Preferences */}
          <div
            style={{
              borderRadius: '0.75rem',
              padding: '1.5rem',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <h2 className="flex items-center" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
              <Settings className="w-5 h-5 mr-2" />
              Email Preferences
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Blog Notifications */}
              <div
                className="flex items-center justify-between"
                style={{ padding: '1.5rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface)' }}
              >
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Blog Notifications</h3>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                    Get notified when we publish new blog posts about national parks, travel tips, and TrailVerse updates
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreferenceChange('blogNotifications')}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '24px',
                    width: '44px',
                    minWidth: '44px',
                    flexShrink: 0,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                    backgroundColor: preferences.blogNotifications ? 'var(--accent-green)' : 'var(--border)',
                    marginLeft: '1rem'
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: '16px',
                      width: '16px',
                      borderRadius: '9999px',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'transform 0.2s ease',
                      transform: preferences.blogNotifications ? 'translateX(24px)' : 'translateX(4px)'
                    }}
                  />
                </button>
              </div>

              {/* Information about other emails */}
              <div
                style={{
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  backgroundColor: 'rgba(14, 165, 233, 0.15)',
                  border: '1px solid var(--accent-blue)'
                }}
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 mt-0.5" style={{ color: 'var(--accent-blue)' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>About Other Emails</h4>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      <p>Welcome, verification, and password reset emails are one-time transactional emails that you cannot unsubscribe from as they are essential for your account security and setup.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Preferences Button */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid var(--border)'
              }}
            >
              <Button
                onClick={handleUpdatePreferences}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Save Preferences
              </Button>
            </div>
          </div>

          {/* Security Notice */}
          <div
            style={{
              marginTop: '1.5rem',
              borderRadius: '0.75rem',
              padding: '1rem',
              backgroundColor: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid var(--accent-blue)'
            }}
          >
            <div className="flex items-start">
              <Shield className="w-5 h-5 mt-0.5 mr-3" style={{ color: 'var(--accent-blue)' }} />
              <div>
                <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Security Notice</h3>
                <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                  Your email preferences are secure and will only be used to send you the types of emails you&apos;ve requested.
                  You can change these preferences at any time by visiting this page again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default function UnsubscribeClient() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
