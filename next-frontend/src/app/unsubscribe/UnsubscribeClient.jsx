"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Mail, CheckCircle, XCircle, ArrowLeft, Bell, BellOff
} from '@components/icons';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/common/Button';
import InfoPageHeader from '@/components/info/InfoPageHeader';
import { getApiBaseUrl } from '@/lib/apiBase';
import { logEvent } from '@/utils/analytics';

const UnsubscribeContent = () => {
  const searchParams = useSearchParams();

  // Get parameters from URL
  const emailParam = searchParams.get('email');
  const token = searchParams.get('token');

  const [manualEmail, setManualEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [preferences, setPreferences] = useState({
    blogNotifications: true
  });

  const email = emailParam || manualEmail;

  useEffect(() => {
    if (emailParam) {
      loadUserPreferences();
    } else {
      setLoading(false);
    }
  }, [emailParam]);

  const loadUserPreferences = async (emailOverride) => {
    const targetEmail = emailOverride || email;
    try {
      setLoading(true);
      const response = await fetch(`${getApiBaseUrl()}/email/preferences?email=${encodeURIComponent(targetEmail)}`);
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

      const response = await fetch(`${getApiBaseUrl()}/email/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (data.success) {
        logEvent('Email', 'unsubscribe_success', unsubscribeType);
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

      const response = await fetch(`${getApiBaseUrl()}/email/preferences`, {
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

      const response = await fetch(`${getApiBaseUrl()}/email/resubscribe`, {
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

  const statusIcon = messageType === 'success'
    ? <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-green)' }} />
    : messageType === 'error'
      ? <XCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--error)' }} />
      : null;

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    setManualEmail(trimmed);
    setMessage('');
    setMessageType('');
    loadUserPreferences(trimmed);
  };

  if (loading) {
    return (
      <div className="info-width flex items-center justify-center py-24">
        <LoadingSpinner size="md" text="Loading email preferences…" />
      </div>
    );
  }

  const status = message ? (
    <div
      className="info-panel mb-6 flex items-start gap-3"
      role={messageType === 'error' ? 'alert' : 'status'}
      style={{ borderColor: messageType === 'error' ? 'var(--error)' : 'var(--accent-green)' }}
    >
      {statusIcon}
      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{message}</p>
    </div>
  ) : null;

  if (!email) {
    return (
      <>
        <InfoPageHeader
          title="Email Preferences"
          description="Enter your email address to manage your TrailVerse subscriptions."
        >
          {status}
          <form className="max-w-md" onSubmit={handleEmailSubmit}>
            <label htmlFor="email-input" className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Email address
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border px-4 text-base"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <Button type="submit" icon={Mail} className="mt-4">
              Manage preferences
            </Button>
          </form>
        </InfoPageHeader>
      </>
    );
  }

  const rowButton = { flexDirection: 'row', flexWrap: 'nowrap', whiteSpace: 'nowrap', width: '100%', maxWidth: '20rem' };

  return (
    <InfoPageHeader
      title="Email Preferences"
      description={<>Manage your TrailVerse email subscriptions for <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>.</>}
    >
      {status}
      <div className="max-w-md">
        <div className="flex items-center justify-between gap-4 border-b py-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p id="blog-notifications-label" className="font-semibold" style={{ color: 'var(--text-primary)' }}>Blog notifications</p>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              New posts about parks, travel, and TrailVerse updates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handlePreferenceChange('blogNotifications')}
            aria-pressed={preferences.blogNotifications}
            aria-labelledby="blog-notifications-label"
            className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full"
            style={{ backgroundColor: preferences.blogNotifications ? 'var(--accent-green)' : 'var(--border)', minHeight: '1.75rem', minWidth: '3rem' }}
          >
            <span
              className="block h-5 w-5 rounded-full bg-white shadow-sm"
              style={{ transform: preferences.blogNotifications ? 'translateX(22px)' : 'translateX(4px)' }}
            />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          Welcome, verification, and password reset emails stay on. Those are one-time messages for your account.
        </p>
        <div className="mt-6 flex flex-col items-start gap-3">
          <Button onClick={handleUpdatePreferences} disabled={submitting} icon={CheckCircle} style={rowButton}>
            Save preferences
          </Button>
          <Button onClick={() => handleUnsubscribe('all')} disabled={submitting} variant="danger" icon={BellOff} style={rowButton}>
            Unsubscribe from all
          </Button>
          <button type="button" onClick={handleResubscribe} disabled={submitting} className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Resubscribe
          </button>
          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="h-4 w-4" />
            Back to TrailVerse
          </a>
        </div>
      </div>
    </InfoPageHeader>
  );
};

export default function UnsubscribeClient() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <LoadingSpinner size="md" text="Loading…" />
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
