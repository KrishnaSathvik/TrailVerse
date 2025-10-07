import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  User, Settings, Heart, Calendar, MapPin, Camera,
  Mail, Phone, Globe, Edit2, Save, X, Trash2,
  Bell, Shield, Moon, Sun, Monitor, ChevronRight,
  Download, Share2, LogOut, Star, Clock, TrendingUp,
  Bookmark, Image as ImageIcon, CalendarDays, History
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import OptimizedImage from '../components/common/OptimizedImage';
import SavedParks from '../components/profile/SavedParks';
import SavedEvents from '../components/profile/SavedEvents';
import TripHistoryList from '../components/profile/TripHistoryList';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useFavorites } from '../hooks/useFavorites';
import { useTrips } from '../hooks/useTrips';
import userService from '../services/userService';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const { favorites, loading: favoritesLoading, removeFavorite } = useFavorites();
  const { trips, loading: tripsLoading, deleteTrip } = useTrips();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profileData, setProfileData] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: '',
    location: '',
    bio: '',
    website: '',
    avatar: `https://i.pravatar.cc/300?u=${user?.email || 'user'}`
  });

  const [preferences, setPreferences] = useState({
    theme: theme,
    emailNotifications: true,
    pushNotifications: false,
    marketingEmails: true,
    weeklyDigest: true,
    tripReminders: true
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'events', label: 'Saved Events', icon: CalendarDays },
    { id: 'trips', label: 'Trips', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  // Real stats based on actual user data
  const stats = [
    { label: 'Parks Visited', value: 0, icon: MapPin }, // TODO: Get from actual user data
    { label: 'Trips Planned', value: trips.length, icon: Calendar },
    { label: 'Favorites', value: favorites.length, icon: Heart },
    { label: 'Total Days', value: 0, icon: Clock } // TODO: Get from actual user data
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Set loading to false since hooks handle their own loading states
    setLoading(false);
  }, [isAuthenticated, navigate]);

  const handleSaveProfile = () => {
    setIsEditing(false);
    showToast('Profile updated successfully!', 'success');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form data here if needed
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    setPreferences({ ...preferences, theme: newTheme });
    showToast(`Theme changed to ${newTheme}`, 'success');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    showToast('Logged out successfully', 'success');
  };

  const handleRemoveFavorite = (parkId) => {
    showToast('Removed from favorites', 'success');
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      showToast('Account deletion requested', 'error');
      // Handle account deletion
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24 -mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <aside className="lg:w-80 flex-shrink-0">
              {/* Profile Card */}
              <div className="rounded-2xl p-6 backdrop-blur mb-6 text-center"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="relative inline-block mb-4">
                  <img
                    src={profileData.avatar}
                    alt={`${profileData.firstName} ${profileData.lastName}`}
                    className="w-24 h-24 rounded-full ring-4 ring-purple-500/20"
                  />
                  {activeTab === 'profile' && isEditing && (
                    <button className="absolute bottom-0 right-0 p-2 rounded-full bg-purple-500 text-white hover:bg-purple-600 transition">
                      <Camera className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <h2 className="text-2xl font-bold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {profileData.firstName || profileData.lastName 
                    ? `${profileData.firstName} ${profileData.lastName}`.trim()
                    : 'Complete Your Profile'
                  }
                </h2>
                <p className="text-sm mb-4"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {profileData.email}
                </p>

                {profileData.location && (
                  <div className="flex items-center justify-center gap-1 text-sm mb-6"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <MapPin className="h-4 w-4" />
                    <span>{profileData.location}</span>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={index}
                        className="rounded-xl p-3"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <Icon className="h-4 w-4 mx-auto mb-1" style={{ color: 'var(--text-secondary)' }} />
                        <div className="text-2xl font-bold mb-0.5"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {stat.value}
                        </div>
                        <div className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {stat.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <nav className="rounded-2xl p-3 backdrop-blur mb-6"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsEditing(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                        activeTab === tab.id ? 'bg-purple-500/10' : 'hover:bg-white/5'
                      }`}
                      style={{
                        color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)'
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{tab.label}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  );
                })}
              </nav>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition hover:bg-red-500/10"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)'
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="rounded-2xl p-8 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Profile Information
                    </h3>
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit Profile
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-medium transition"
                        >
                          <Save className="h-4 w-4" />
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {/* Name Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          First Name
                        </label>
                        <input
                          type="text"
                          value={profileData.firstName}
                          onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                          disabled={!isEditing}
                          placeholder="Enter your first name"
                          className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={profileData.lastName}
                          onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                          disabled={!isEditing}
                          placeholder="Enter your last name"
                          className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '1px',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Mail className="h-4 w-4 inline mr-2" />
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        disabled={!isEditing}
                        className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Phone className="h-4 w-4 inline mr-2" />
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Enter your phone number"
                        className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <MapPin className="h-4 w-4 inline mr-2" />
                        Location
                      </label>
                      <input
                        type="text"
                        value={profileData.location}
                        onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Enter your location"
                        className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    {/* Website */}
                    <div>
                      <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Globe className="h-4 w-4 inline mr-2" />
                        Website
                      </label>
                      <input
                        type="url"
                        value={profileData.website}
                        onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Enter your website URL"
                        className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>

                    {/* Bio */}
                    <div>
                      <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Bio
                      </label>
                      <textarea
                        value={profileData.bio}
                        onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Tell us about yourself and your love for national parks..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl outline-none transition disabled:opacity-60 resize-none"
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

              {/* Favorites Tab */}
              {activeTab === 'favorites' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Favorite Parks
                    </h3>
                    <span className="px-3 py-1 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--surface)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {favorites.length} parks
                    </span>
                  </div>

                  <SavedParks 
                    savedParks={favorites} 
                    onRemove={removeFavorite}
                  />
                </div>
              )}

              {/* Saved Events Tab */}
              {activeTab === 'events' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Saved Events
                    </h3>
                  </div>
                  
                  <SavedEvents />
                </div>
              )}

              {/* Trips Tab */}
              {activeTab === 'trips' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      My Trips
                    </h3>
                    <Link
                      to="/plan-ai"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-medium transition"
                    >
                      <Calendar className="h-4 w-4" />
                      Plan New Trip
                    </Link>
                  </div>

                  <TripHistoryList userId={user?.id} />
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  {/* Theme Settings */}
                  <div className="rounded-2xl p-8 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <h3 className="text-xl font-bold mb-4"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Appearance
                    </h3>
                    <p className="text-sm mb-4"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Choose your preferred theme
                    </p>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'light', label: 'Light', icon: Sun },
                        { id: 'dark', label: 'Dark', icon: Moon },
                        { id: 'system', label: 'System', icon: Monitor }
                      ].map((themeOption) => {
                        const Icon = themeOption.icon;
                        return (
                          <button
                            key={themeOption.id}
                            onClick={() => handleThemeChange(themeOption.id)}
                            className={`p-4 rounded-xl text-center font-medium transition ${
                              theme === themeOption.id
                                ? 'ring-2 ring-purple-500'
                                : 'hover:bg-white/5'
                            }`}
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              borderWidth: '1px',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            <Icon className="h-6 w-6 mx-auto mb-2" />
                            {themeOption.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notification Settings */}
                  <div className="rounded-2xl p-8 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <h3 className="text-xl font-bold mb-4"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Notifications
                    </h3>

                    <div className="space-y-4">
                      {[
                        { id: 'emailNotifications', label: 'Email Notifications', description: 'Receive updates via email' },
                        { id: 'pushNotifications', label: 'Push Notifications', description: 'Receive push notifications' },
                        { id: 'marketingEmails', label: 'Marketing Emails', description: 'Receive promotional content' },
                        { id: 'weeklyDigest', label: 'Weekly Digest', description: 'Weekly summary of activities' },
                        { id: 'tripReminders', label: 'Trip Reminders', description: 'Reminders for upcoming trips' }
                      ].map((setting) => (
                        <div key={setting.id} className="flex items-center justify-between py-3 border-b last:border-b-0"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <div className="flex-1">
                            <h4 className="font-semibold mb-1"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {setting.label}
                            </h4>
                            <p className="text-sm"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {setting.description}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={preferences[setting.id]}
                              onChange={(e) => setPreferences({
                                ...preferences,
                                [setting.id]: e.target.checked
                              })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Privacy & Security */}
                  <div className="rounded-2xl p-8 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <h3 className="text-xl font-bold mb-4"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Privacy & Security
                    </h3>

                    <div className="space-y-3">
                      <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition hover:bg-white/5"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <span className="flex items-center gap-3">
                          <Shield className="h-5 w-5" />
                          <span className="font-medium">Change Password</span>
                        </span>
                        <ChevronRight className="h-5 w-5" />
                      </button>

                      <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition hover:bg-white/5"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <span className="flex items-center gap-3">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">Download My Data</span>
                        </span>
                        <ChevronRight className="h-5 w-5" />
                      </button>

                      <button
                        onClick={handleDeleteAccount}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition hover:bg-red-500/10"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <span className="flex items-center gap-3 text-red-400">
                          <Trash2 className="h-5 w-5" />
                          <span className="font-medium">Delete Account</span>
                        </span>
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ProfilePage;
