import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, Settings, Save, RefreshCw, 
  Database, Mail, Shield, Globe, Key
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const AdminSettingsPage = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState({
    // General Settings
    siteName: 'TrailVerse',
    siteDescription: 'National Parks Explorer',
    contactEmail: 'trailverseteam@gmail.com',
    supportEmail: 'trailverseteam@gmail.com',
    
    // Email Settings
    emailProvider: 'gmail',
    emailFromName: 'TrailVerse',
    emailFromAddress: 'trailverseteam@gmail.com',
    
    // Security Settings
    sessionTimeout: 24,
    maxLoginAttempts: 5,
    requireEmailVerification: true,
    enableTwoFactor: false,
    
    // Feature Flags
    enableBlog: true,
    enableEvents: true,
    enableReviews: true,
    enableAI: true,
    enableAnalytics: true,
    
    // API Settings
    npsApiKey: '',
    openWeatherApiKey: '',
    googleAnalyticsId: '',
    
    // Maintenance
    maintenanceMode: false,
    maintenanceMessage: 'We are currently performing maintenance. Please check back soon.'
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/settings');
      if (response.data.data) {
        setSettings(prev => ({ ...prev, ...response.data.data }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      showToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put('/admin/settings', settings);
      showToast('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };


  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'features', label: 'Features', icon: Settings },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'maintenance', label: 'Maintenance', icon: Database }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl font-medium transition hover:bg-white/5 text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Link>
              <div>
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Settings className="h-8 w-8 text-orange-500" />
                  Admin Settings
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Configure system settings and preferences
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white'
                }}
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl p-6 backdrop-blur sticky top-24"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Settings Categories
              </h3>
              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition ${
                        activeTab === tab.id
                          ? 'bg-forest-500/20 text-forest-400'
                          : 'hover:bg-white/5'
                      }`}
                      style={{
                        color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      <Icon className="h-5 w-5" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl p-6 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              {/* General Settings */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    General Settings
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Site Name
                      </label>
                      <input
                        type="text"
                        value={settings.siteName}
                        onChange={(e) => handleChange('siteName', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Contact Email
                      </label>
                      <input
                        type="email"
                        value={settings.contactEmail}
                        onChange={(e) => handleChange('contactEmail', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Site Description
                    </label>
                    <textarea
                      value={settings.siteDescription}
                      onChange={(e) => handleChange('siteDescription', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl outline-none resize-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Email Settings */}
              {activeTab === 'email' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Email Configuration
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Email Provider
                      </label>
                      <select
                        value={settings.emailProvider}
                        onChange={(e) => handleChange('emailProvider', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <option value="gmail">Gmail SMTP</option>
                        <option value="sendgrid">SendGrid</option>
                        <option value="smtp">Custom SMTP</option>
                        <option value="mailgun">Mailgun</option>
                        <option value="ses">Amazon SES</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        From Name
                      </label>
                      <input
                        type="text"
                        value={settings.emailFromName}
                        onChange={(e) => handleChange('emailFromName', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      From Address
                    </label>
                    <input
                      type="email"
                      value={settings.emailFromAddress}
                      onChange={(e) => handleChange('emailFromAddress', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl outline-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>

                  {/* Email Service Status */}
                  <div className="mt-6 p-4 rounded-xl" style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}>
                    <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      Current Email Service Status
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Service:</span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          Gmail SMTP (Active)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Authentication:</span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          App Password
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Templates:</span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          Handlebars
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Features:</span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          Welcome, Verification, Password Reset
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Settings */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Security Settings
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Session Timeout (hours)
                      </label>
                      <input
                        type="number"
                        value={settings.sessionTimeout}
                        onChange={(e) => handleChange('sessionTimeout', parseInt(e.target.value))}
                        min="1"
                        max="168"
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Max Login Attempts
                      </label>
                      <input
                        type="number"
                        value={settings.maxLoginAttempts}
                        onChange={(e) => handleChange('maxLoginAttempts', parseInt(e.target.value))}
                        min="3"
                        max="10"
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Require Email Verification
                        </h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Users must verify their email before accessing the platform
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.requireEmailVerification}
                          onChange={(e) => handleChange('requireEmailVerification', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Enable Two-Factor Authentication
                        </h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Require 2FA for admin accounts
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.enableTwoFactor}
                          onChange={(e) => handleChange('enableTwoFactor', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Feature Flags */}
              {activeTab === 'features' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Feature Flags
                  </h3>
                  
                  <div className="space-y-4">
                    {[
                      { key: 'enableBlog', label: 'Blog System', description: 'Enable blog posts and content management' },
                      { key: 'enableEvents', label: 'Events System', description: 'Enable events calendar and management' },
                      { key: 'enableReviews', label: 'Reviews System', description: 'Enable user reviews and ratings' },
                      { key: 'enableAI', label: 'AI Features', description: 'Enable AI-powered trip planning' },
                      { key: 'enableAnalytics', label: 'Analytics', description: 'Enable user analytics and tracking' }
                    ].map((feature) => (
                      <div key={feature.key} className="flex items-center justify-between p-4 rounded-xl"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div>
                          <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {feature.label}
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {feature.description}
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings[feature.key]}
                            onChange={(e) => handleChange(feature.key, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Keys */}
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    API Configuration
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        NPS API Key
                      </label>
                      <input
                        type="password"
                        value={settings.npsApiKey}
                        onChange={(e) => handleChange('npsApiKey', e.target.value)}
                        placeholder="Enter your National Parks Service API key"
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        OpenWeather API Key
                      </label>
                      <input
                        type="password"
                        value={settings.openWeatherApiKey}
                        onChange={(e) => handleChange('openWeatherApiKey', e.target.value)}
                        placeholder="Enter your OpenWeather API key"
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Google Analytics ID
                      </label>
                      <input
                        type="text"
                        value={settings.googleAnalyticsId}
                        onChange={(e) => handleChange('googleAnalyticsId', e.target.value)}
                        placeholder="GA-XXXXXXXXX-X"
                        className="w-full px-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Maintenance */}
              {activeTab === 'maintenance' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Maintenance Mode
                  </h3>
                  
                  <div className="flex items-center justify-between p-4 rounded-xl"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div>
                      <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Enable Maintenance Mode
                      </h4>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Temporarily disable public access to the site
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.maintenanceMode}
                        onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Maintenance Message
                    </label>
                    <textarea
                      value={settings.maintenanceMessage}
                      onChange={(e) => handleChange('maintenanceMessage', e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl outline-none resize-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
