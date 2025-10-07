import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Mail, Shield, CheckCircle, XCircle, AlertTriangle,
  ArrowLeft, Settings, Bell, BellOff, Loader2
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import Button from '../components/common/Button';

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get parameters from URL
  const email = searchParams.get('email');
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success', 'error', 'info'
  const [preferences, setPreferences] = useState({
    blogNotifications: true
  });

  // Load user preferences on component mount
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
        // Map backend preferences to frontend state
        if (data.data.emailNotifications) {
          setPreferences({
            blogNotifications: data.data.emailNotifications.blogNotifications !== false
          });
        }
      } else {
        setMessage('Unable to load email preferences');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      setMessage('Error loading email preferences');
      setMessageType('error');
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage(data.message || 'Successfully unsubscribed from TrailVerse emails');
        setMessageType('success');
        // Update preferences to reflect unsubscribe
        if (unsubscribeType === 'all') {
          setPreferences({
            blogNotifications: false
          });
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
        preferences: {
          blogNotifications: preferences.blogNotifications
        }
      };

      const response = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        setMessage('Successfully resubscribed to TrailVerse emails');
        setMessageType('success');
        setPreferences({
          blogNotifications: true
        });
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
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'info':
        return <AlertTriangle className="w-5 h-5 text-blue-500" />;
      default:
        return null;
    }
  };

  const getMessageStyles = () => {
    switch (messageType) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading email preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Email Preferences
            </h1>
            <p className="text-gray-600">
              Manage your TrailVerse email subscriptions
            </p>
            {email && (
              <p className="text-sm text-gray-500 mt-2">
                Managing preferences for: <span className="font-medium">{email}</span>
              </p>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`rounded-lg border p-4 mb-6 ${getMessageStyles()}`}>
              <div className="flex items-center">
                {getMessageIcon()}
                <p className="ml-2 font-medium">{message}</p>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
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
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Site
              </Button>
            </div>
          </div>

          {/* Email Preferences */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Email Preferences
            </h2>

            <div className="space-y-4">
              {/* Blog Notifications */}
              <div className="flex items-center justify-between p-6 bg-gray-50 rounded-lg">
                <div>
                  <h3 className="font-medium text-gray-900">Blog Notifications</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Get notified when we publish new blog posts about national parks, travel tips, and TrailVerse updates
                  </p>
                </div>
                <button
                  onClick={() => handlePreferenceChange('blogNotifications')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    preferences.blogNotifications ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      preferences.blogNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Information about other emails */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-blue-900">About Other Emails</h4>
                    <div className="mt-2 text-sm text-blue-800">
                      <p>Welcome, verification, and password reset emails are one-time transactional emails that you cannot unsubscribe from as they are essential for your account security and setup.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Preferences Button */}
            <div className="mt-6 pt-6 border-t border-gray-200">
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
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-blue-900">Security Notice</h3>
                <p className="text-sm text-blue-800 mt-1">
                  Your email preferences are secure and will only be used to send you the types of emails you've requested. 
                  You can change these preferences at any time by visiting this page again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UnsubscribePage;
