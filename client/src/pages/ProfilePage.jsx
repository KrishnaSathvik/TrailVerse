import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Settings, Heart, Calendar, MapPin,
  Mail, Globe, Edit2, Save, X, Trash2,
  Shield, ChevronRight,
  Download, Star, Clock, Plus,
  CalendarDays, BookOpen, Compass,
  Eye, EyeOff, CheckCircle, AlertCircle, Lock
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import Button from '../components/common/Button';
// import OptimizedImage from '../components/common/OptimizedImage';
import SavedParks from '../components/profile/SavedParks';
import VisitedParks from '../components/profile/VisitedParks';
import SavedEvents from '../components/profile/SavedEvents';
import TripHistoryList from '../components/profile/TripHistoryList';
import UserTestimonials from '../components/profile/UserTestimonials';
import UserReviews from '../components/profile/UserReviews';
import AvatarSelector from '../components/profile/AvatarSelector';
import FavoriteBlogs from '../components/profile/FavoriteBlogs';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../hooks/useFavorites';
import { useVisitedParks } from '../hooks/useVisitedParks';
import { useTrips } from '../hooks/useTrips';
import userService from '../services/userService';
import { getBestAvatar, generateRandomAvatar } from '../utils/avatarGenerator';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { favorites, removeFavorite, loading: favoritesLoading } = useFavorites();
  const { visitedParks, removeVisited, loading: visitedParksLoading } = useVisitedParks();
  const { trips } = useTrips();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingAvatar, setIsChangingAvatar] = useState(false);
  const [originalAvatar, setOriginalAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const [lastStatsLoadTime, setLastStatsLoadTime] = useState(0);
  const [lastEmailLoadTime, setLastEmailLoadTime] = useState(0);
  const [userStats, setUserStats] = useState({
    parksVisited: 0,
    tripsPlanned: 0,
    favorites: 0,
    totalDays: 0
  });

  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    bio: '',
    website: '',
    avatar: getBestAvatar(user, {}, 'travel'),
    avatarVersion: Date.now() // Force image reload when avatar changes
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true
  });

  // Email preferences API states
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  // Privacy & Security states
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [deleteForm, setDeleteForm] = useState({
    password: '',
    confirmation: ''
  });
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyError, setPrivacyError] = useState('');
  const [privacyMessage, setPrivacyMessage] = useState('');

  // Force re-render key for debugging
  const [renderKey, setRenderKey] = useState(0);

  // Helper function to clear error states when switching tabs
  const clearErrorStates = () => {
    setEmailError('');
    setPrivacyError('');
  };

  // Debug logging for favorites (can be removed after testing)
  useEffect(() => {
    if (activeTab === 'favorites') {
      console.log('ProfilePage - Favorites tab active:', { 
        favoritesCount: favorites.length, 
        favoritesLoading, 
        user: user?.id || user?._id 
      });
      // Refresh stats when favorites tab is activated
      loadUserStats();
    }
  }, [favorites, favoritesLoading, activeTab, user]);

  // Debug logging for when SavedParks should render
  useEffect(() => {
    if (activeTab === 'favorites' && !favoritesLoading) {
      console.log('ProfilePage - About to render SavedParks with:', { 
        favoritesCount: favorites.length, 
        favorites,
        timestamp: new Date().toISOString()
      });
    }
  }, [activeTab, favoritesLoading, favorites]);

  // Force re-render when favorites change
  useEffect(() => {
    if (favorites.length > 0) {
      console.log('ProfilePage - Favorites changed, incrementing render key');
      setRenderKey(prev => prev + 1);
    }
  }, [favorites.length]);

  // Update userStats with real data
  useEffect(() => {
    console.log('ProfilePage - Updating userStats with real data:', {
      favorites: favorites.length,
      visitedParks: visitedParks.length,
      trips: trips.length,
      currentUserStats: userStats
    });
    setUserStats(prev => ({
      ...prev,
      favorites: favorites.length,
      parksVisited: visitedParks.length,
      tripsPlanned: trips.length
    }));
  }, [favorites.length, visitedParks.length, trips.length]);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'favorites', label: 'All Favorites', icon: Heart },
    { id: 'adventures', label: 'Adventures', icon: Compass },
    { id: 'reviews', label: 'My Reviews', icon: Star },
    { id: 'testimonials', label: 'Testimonials', icon: Star },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  // Real stats based on actual user data
  const stats = [
    { label: 'Parks Visited', value: userStats.parksVisited, icon: MapPin },
    { label: 'Trips Planned', value: userStats.tripsPlanned, icon: Calendar },
    { label: 'Favorites', value: userStats.favorites, icon: Heart },
    { label: 'Total Days', value: userStats.totalDays, icon: Clock }
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Load user profile data sequentially to avoid rate limiting
    const loadDataSequentially = async () => {
      await loadProfileData();
      // Wait a bit before loading stats to avoid rate limiting
      setTimeout(() => loadUserStats(), 100);
    };
    
    loadDataSequentially();
  }, [isAuthenticated]); // Removed navigate from dependencies to prevent unnecessary re-renders

  // Load email preferences when user is available (with debounce)
  useEffect(() => {
    if (user?.email) {
      // Clear any previous error state when user changes
      setEmailError('');
      
      // Debounce: Don't load email preferences more than once every 2 seconds
      const now = Date.now();
      if (now - lastEmailLoadTime < 2000) {
        return;
      }
      setLastEmailLoadTime(now);
      loadEmailPreferences();
    }
  }, [user?.email]);

  const loadProfileData = async () => {
    // Debounce: Don't make API calls more than once every 5 seconds
    const now = Date.now();
    if (now - lastLoadTime < 5000) {
      return;
    }
    
    try {
      setLoading(true);
      setLastLoadTime(now);
      
      // Get fresh profile data from server
      const userProfile = await userService.getProfile();
      
      
      // Update profile data with server data
      const updatedUserData = {
        ...userProfile,
        email: userProfile.email || user?.email
      };
      
      setProfileData({
        firstName: userProfile.firstName || user?.name?.split(' ')[0] || '',
        lastName: userProfile.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
        email: userProfile.email || user?.email || '',
        phone: userProfile.phone || '',
        location: userProfile.location || '',
        bio: userProfile.bio || '',
        website: userProfile.website || '',
        avatar: userProfile.avatar || profileData.avatar || getBestAvatar(updatedUserData, userStats, 'travel'),
        avatarVersion: Date.now()
      });
    } catch (error) {
      console.error('Error loading profile data:', error);
      
      // Handle rate limiting gracefully
      if (error.response?.status === 429) {
        // Only show toast if we haven't shown one recently
        const now = Date.now();
        if (now - lastLoadTime > 10000) { // 10 seconds
          showToast('Too many requests. Please wait a moment and try again.', 'warning');
          setLastLoadTime(now);
        }
        return;
      }
      
      // Fallback to user context data
      setProfileData({
        firstName: user?.name?.split(' ')[0] || '',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        email: user?.email || '',
        phone: '',
        location: '',
        bio: '',
        website: '',
        avatar: user?.avatar || profileData.avatar || getBestAvatar(user, userStats, 'travel'),
        avatarVersion: Date.now()
      });
      showToast('Failed to load profile data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUserStats = async () => {
    // Debounce: Don't make API calls more than once every 5 seconds
    const now = Date.now();
    if (now - lastStatsLoadTime < 5000) {
      return;
    }
    
    try {
      setLastStatsLoadTime(now);
      console.log('ProfilePage - Calling userService.getUserStats()');
      const stats = await userService.getUserStats();
      console.log('ProfilePage - Received stats from server:', stats);
      setUserStats(stats);
      
      // Update avatar based on new stats
      const updatedUserData = {
        ...user,
        email: user?.email
      };
      
      // Only update avatar if user doesn't have one selected
      if (!profileData.avatar || profileData.avatar.includes('traveler')) {
        setProfileData(prev => ({
          ...prev,
          avatar: getBestAvatar(updatedUserData, stats, 'travel'),
          avatarVersion: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
      
      // Handle rate limiting gracefully
      if (error.response?.status === 429) {
        // Only show toast if we haven't shown one recently
        const now = Date.now();
        if (now - lastStatsLoadTime > 10000) { // 10 seconds
          showToast('Too many requests. Please wait a moment and try again.', 'warning');
          setLastStatsLoadTime(now);
        }
        return;
      }
      
      // Fallback to local data
      const fallbackStats = {
        parksVisited: visitedParks.length,
        tripsPlanned: trips.length,
        favorites: favorites.length,
        totalDays: 0
      };
      setUserStats(fallbackStats);
      
      // Update avatar with fallback stats
      const updatedUserData = {
        ...user,
        email: user?.email
      };
      
      // Only update avatar if user doesn't have one selected
      if (!profileData.avatar || profileData.avatar.includes('traveler')) {
        setProfileData(prev => ({
          ...prev,
          avatar: getBestAvatar(updatedUserData, fallbackStats, 'travel'),
          avatarVersion: Date.now()
        }));
      }
    }
  };

  // Email preferences API functions with retry logic
  const loadEmailPreferences = async (retryCount = 0, maxRetries = 3) => {
    if (!user?.email) return;
    
    try {
      console.log(`Loading email preferences for: ${user.email} (attempt ${retryCount + 1})`);
      const response = await fetch(`/api/email/preferences/${user.email}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.status === 429) {
        if (retryCount < maxRetries) {
          // Exponential backoff: wait 2^retryCount seconds (2, 4, 8 seconds)
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Rate limited - retrying in ${delay/1000} seconds (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          setTimeout(() => {
            loadEmailPreferences(retryCount + 1, maxRetries);
          }, delay);
          
          setEmailError(`Rate limited - retrying in ${delay/1000} seconds...`);
        } else {
          console.warn('Rate limited - max retries reached');
          setEmailError('Too many requests, please try again later.');
        }
        return;
      }
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Received non-JSON response:', contentType);
        setEmailError('Email preferences service is temporarily unavailable');
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        const newPreferences = { emailNotifications: data.data.emailNotifications };
        setPreferences(newPreferences);
        setEmailError(''); // Clear any previous errors
        console.log('Email preferences loaded:', data.data);
        console.log('Updated preferences state:', newPreferences);
      } else {
        console.error('Failed to load email preferences:', data.error);
        setEmailError(data.error || 'Failed to load email preferences');
      }
    } catch (error) {
      console.error('Error loading email preferences:', error);
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Network error - retrying in ${delay/1000} seconds (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          setTimeout(() => {
            loadEmailPreferences(retryCount + 1, maxRetries);
          }, delay);
          
          setEmailError(`Network error - retrying in ${delay/1000} seconds...`);
        } else {
          setEmailError('Too many requests, please try again later.');
        }
      } else {
        setEmailError('Failed to load email preferences');
      }
    }
  };

  const saveEmailPreferences = async (newValue, retryCount = 0, maxRetries = 3) => {
    if (!user?.email) return;
    
    try {
      setEmailLoading(true);
      setEmailError('');
      setEmailMessage('');
      
      console.log(`Saving email preferences: ${user.email} (attempt ${retryCount + 1})`, { emailNotifications: newValue });
      
      const response = await fetch(`/api/email/preferences/${user.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ emailNotifications: newValue })
      });
      
      if (response.status === 429) {
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Rate limited while saving - retrying in ${delay/1000} seconds (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          setTimeout(() => {
            saveEmailPreferences(newValue, retryCount + 1, maxRetries);
          }, delay);
          
          setEmailError(`Rate limited - retrying in ${delay/1000} seconds...`);
          showToast(`Rate limited - retrying in ${delay/1000} seconds...`, 'warning');
        } else {
          setEmailError('Too many requests, please try again later.');
          showToast('Too many requests, please try again later.', 'error');
          console.warn('Rate limited while saving email preferences - max retries reached');
        }
        return;
      }
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Received non-JSON response while saving:', contentType);
        setEmailError('Email preferences service is temporarily unavailable');
        showToast('Email service temporarily unavailable', 'error');
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        setPreferences({ emailNotifications: newValue });
        setEmailMessage('Email preferences saved successfully!');
        showToast('Email preferences updated', 'success');
        console.log('Email preferences saved:', data.data);
        
        // Clear success message after 3 seconds
        setTimeout(() => setEmailMessage(''), 3000);
      } else {
        setEmailError(data.error || 'Failed to save preferences');
        showToast('Failed to save email preferences', 'error');
        console.error('Failed to save email preferences:', data.error);
      }
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Network error while saving - retrying in ${delay/1000} seconds (attempt ${retryCount + 1}/${maxRetries + 1})`);
          
          setTimeout(() => {
            saveEmailPreferences(newValue, retryCount + 1, maxRetries);
          }, delay);
          
          setEmailError(`Network error - retrying in ${delay/1000} seconds...`);
          showToast(`Network error - retrying in ${delay/1000} seconds...`, 'warning');
        } else {
          setEmailError('Too many requests, please try again later.');
          showToast('Too many requests, please try again later.', 'error');
        }
      } else {
        setEmailError('Network error. Please try again.');
        showToast('Network error. Please try again.', 'error');
      }
      console.error('Error saving email preferences:', error);
    } finally {
      setEmailLoading(false);
    }
  };

  // Password strength helper function
  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: 'Weak', color: 'var(--error)' };
    if (strength <= 3) return { strength, label: 'Fair', color: 'var(--warning)' };
    if (strength <= 4) return { strength, label: 'Good', color: 'var(--accent-green)' };
    return { strength, label: 'Strong', color: 'var(--accent-green)' };
  };

  // Privacy & Security functions
  const handleChangePassword = async () => {
    try {
      setPrivacyLoading(true);
      setPrivacyError('');
      setPrivacyMessage('');
      const newErrors = {};

      // Validate form
      if (!passwordForm.currentPassword) {
        newErrors.currentPassword = 'Current password is required';
      }

      if (!passwordForm.newPassword) {
        newErrors.newPassword = 'New password is required';
      } else if (passwordForm.newPassword.length < 8) {
        newErrors.newPassword = 'Password must be at least 8 characters';
      }

      if (!passwordForm.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your new password';
      } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }

      if (Object.keys(newErrors).length > 0) {
        setPasswordErrors(newErrors);
        setPrivacyError('Please fix the errors below');
        return;
      }

      const response = await fetch('/api/user/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await response.json();

      if (data.success) {
        setPrivacyMessage('Password changed successfully!');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordErrors({});
        setShowChangePasswordModal(false);
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        showToast('Password updated successfully', 'success');
        
        // Clear success message after 3 seconds
        setTimeout(() => setPrivacyMessage(''), 3000);
      } else {
        setPrivacyError(data.error || 'Failed to change password');
      }
    } catch (error) {
      setPrivacyError('Network error. Please try again.');
      console.error('Error changing password:', error);
    } finally {
      setPrivacyLoading(false);
    }
  };

  // Handle password field changes
  const handlePasswordFieldChange = (field, value) => {
    setPasswordForm({ ...passwordForm, [field]: value });
    // Clear error for this field
    if (passwordErrors[field]) {
      setPasswordErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDownloadData = async () => {
    try {
      setPrivacyLoading(true);
      setPrivacyError('');

      const response = await fetch('/api/user/data/download', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Get filename from response headers or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
          : `trailverse_user_data_${new Date().toISOString().split('T')[0]}.json`;
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('Your data has been downloaded', 'success');
      } else {
        const data = await response.json();
        setPrivacyError(data.error || 'Failed to download data');
      }
    } catch (error) {
      setPrivacyError('Network error. Please try again.');
      console.error('Error downloading data:', error);
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setPrivacyLoading(true);
      setPrivacyError('');

      // Validate form
      if (!deleteForm.password || !deleteForm.confirmation) {
        setPrivacyError('Please fill in all fields');
        return;
      }

      if (deleteForm.confirmation !== 'DELETE') {
        setPrivacyError('Please type "DELETE" to confirm');
        return;
      }

      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          password: deleteForm.password,
          confirmation: deleteForm.confirmation
        })
      });

      const data = await response.json();

      if (data.success) {
        showToast('Account deleted successfully', 'success');
        // Clear local storage and redirect to home
        localStorage.clear();
        navigate('/');
      } else {
        setPrivacyError(data.error || 'Failed to delete account');
      }
    } catch (error) {
      setPrivacyError('Network error. Please try again.');
      console.error('Error deleting account:', error);
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      
      // Prepare profile data for API
      const updateData = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        email: profileData.email,
        phone: profileData.phone,
        location: profileData.location,
        website: profileData.website,
        bio: profileData.bio,
        avatar: profileData.avatar
      };


      // Update profile in database
      const updatedProfile = await userService.updateProfile(updateData);
      
      
      // Update local state with server response
      setProfileData(prev => ({
        ...prev,
        ...updatedProfile,
        avatar: updatedProfile.avatar || prev.avatar, // Keep the user's selected avatar
        avatarVersion: Date.now() // Force image reload after save
      }));

      // Refresh stats after profile update
      loadUserStats();

      setIsEditing(false);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Failed to update profile. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form data here if needed
  };



  const handleRemoveFavorite = async (parkCode) => {
    try {
      await removeFavorite(parkCode);
      showToast('Removed from favorites', 'success');
    } catch (error) {
      showToast('Error removing favorite', 'error');
      console.error('Error removing favorite:', error);
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

      {/* Main Content */}
      <section className="py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Profile Hero Section - Centered & Clean */}
          <div className="rounded-3xl p-8 lg:p-12 text-center backdrop-blur mb-8 shadow-xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
            }}
          >
            {/* Avatar Section - Larger & Centered with Random Generator */}
            <div className="mx-auto mb-6">
              <div className="relative inline-block">
                {profileData.avatar && !profileData.avatar.startsWith('http') ? (
                  <div
                    key={`${profileData.avatar}-${profileData.avatarVersion}`}
                    className="w-24 h-24 lg:w-32 lg:h-32 rounded-full ring-4 ring-offset-4 flex items-center justify-center text-4xl lg:text-5xl bg-gradient-to-br from-purple-100 to-blue-100 shadow-lg"
                    style={{ 
                      backgroundColor: 'var(--surface-hover)',
                      ringColor: 'var(--accent-green)',
                      ringOffsetColor: 'var(--bg-primary)'
                    }}
                  >
                    {profileData.avatar}
                  </div>
                ) : (
                  <img
                    key={`${profileData.avatar}-${profileData.avatarVersion}`}
                    src={`${profileData.avatar}${profileData.avatar.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
                    alt={`${profileData.firstName} ${profileData.lastName}`}
                    className="w-24 h-24 lg:w-32 lg:h-32 rounded-full ring-4 ring-offset-4 shadow-lg object-cover"
                    style={{ 
                      ringColor: 'var(--accent-green)',
                      ringOffsetColor: 'var(--bg-primary)'
                    }}
                    loading="lazy"
                    onError={(e) => {
                      console.log('Avatar image failed to load:', profileData.avatar);
                      e.target.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
                    }}
                  />
                )}
              </div>
            </div>

            {/* Profile Info Section - Centered */}
            <h1 className="text-3xl lg:text-4xl font-bold mb-3"
              style={{ color: 'var(--text-primary)' }}
            >
              {profileData.firstName || profileData.lastName 
                ? `${profileData.firstName} ${profileData.lastName}`.trim()
                : 'Complete Your Profile'
              }
            </h1>
            
            <div className="flex flex-wrap items-center justify-center gap-4 mb-4 text-base">
              <div className="flex items-center gap-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Mail className="h-4 w-4" />
                <span>{profileData.email}</span>
              </div>
              {profileData.location && (
                <>
                  <span style={{ color: 'var(--text-tertiary)' }}>•</span>
                  <div className="flex items-center gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <MapPin className="h-4 w-4" />
                    <span>{profileData.location}</span>
                  </div>
                </>
              )}
            </div>
            
            {/* Change Avatar Button in Hero Section */}
            <div className="mb-4">
              {!isChangingAvatar ? (
                <Button
                  onClick={() => {
                    // Store original avatar
                    setOriginalAvatar(profileData.avatar);
                    setIsChangingAvatar(true);
                    
                    // Generate new avatar
                    const seed = user?.email || user?.firstName || 'traveler';
                    const randomAvatar = generateRandomAvatar(seed);
                    setProfileData(prev => ({ 
                      ...prev, 
                      avatar: randomAvatar,
                      avatarVersion: Date.now()
                    }));
                  }}
                  variant="primary"
                  size="sm"
                  icon={User}
                >
                  Change Avatar
                </Button>
              ) : (
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => {
                      // Cancel - revert to original avatar
                      setProfileData(prev => ({ 
                        ...prev, 
                        avatar: originalAvatar,
                        avatarVersion: Date.now()
                      }));
                      setIsChangingAvatar(false);
                      setOriginalAvatar(null);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      // Save - keep the new avatar
                      setIsChangingAvatar(false);
                      setOriginalAvatar(null);
                      showToast('Avatar updated! Click "Edit Profile" to save your profile.', 'success');
                    }}
                    variant="primary"
                    size="sm"
                    icon={Save}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
            
            {profileData.bio && (
              <p className="text-base leading-relaxed max-w-2xl mx-auto mb-6"
                style={{ color: 'var(--text-secondary)' }}
              >
                {profileData.bio}
              </p>
            )}
            
            {/* Edit Profile Button */}
            {activeTab !== 'profile' && (
              <div className="flex justify-center">
                <Button
                  onClick={() => setActiveTab('profile')}
                  variant="secondary"
                  size="md"
                  icon={Edit2}
                >
                  Edit Profile
                </Button>
              </div>
            )}
          </div>

          {/* Stats Section - Prominent & Separate */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6 mb-10">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div
                  key={index}
                  className="group rounded-2xl p-6 lg:p-8 text-center cursor-pointer transition-all hover:-translate-y-1"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--shadow)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                    e.currentTarget.style.borderColor = 'var(--border-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'var(--shadow)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  {/* Icon Circle */}
                  <div className="inline-flex p-4 rounded-full mb-4"
                    style={{ 
                      backgroundColor: 'var(--accent-green-light)',
                      color: 'var(--accent-green)'
                    }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  
                  {/* Value */}
                  <div className="text-3xl lg:text-4xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {stat.value}
                  </div>
                  
                  {/* Label */}
                  <div className="text-sm font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Enhanced Tab Navigation - Now using Button component for consistency */}
          <div className="flex gap-2 mb-8 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsEditing(false);
                  clearErrorStates();
                }}
                variant={activeTab === tab.id ? 'primary' : 'secondary'}
                size="md"
                icon={tab.icon}
                className="whitespace-nowrap flex-shrink-0"
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="min-w-0">
              {/* Default message when no tab is selected */}
              {!activeTab && (
                <div className="rounded-2xl p-8 backdrop-blur text-center"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="text-6xl mb-4">👋</div>
                  <h3 className="text-2xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Welcome to Your Profile
                  </h3>
                  <p className="text-lg"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Select a tab above to view and manage your information
                  </p>
                </div>
              )}

              {/* Enhanced Profile Tab */}
              {activeTab === 'profile' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Profile Information
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Manage your personal information and preferences
                      </p>
                    </div>
                    {!isEditing ? (
                      <Button
                        onClick={() => setIsEditing(true)}
                        variant="primary"
                        size="md"
                        icon={Edit2}
                        className="w-full sm:w-auto"
                      >
                        Edit Profile
                      </Button>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={handleCancelEdit}
                          variant="secondary"
                          size="md"
                          icon={X}
                          className="w-full sm:w-auto"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSaveProfile}
                          variant="primary"
                          size="md"
                          icon={Save}
                          className="w-full sm:w-auto"
                        >
                          Save Changes
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    {/* Avatar Selection with Live Preview */}
                    {isEditing && (
                      <div className="rounded-2xl p-6"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <label className="block text-lg font-semibold mb-2"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Customize Your Avatar
                        </label>
                        <p className="text-sm mb-4"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          💡 Tip: Use the "Random Avatar" button in your profile header for quick changes!
                        </p>
                        
                        {/* Live Preview Section */}
                        <div className="mb-6 p-6 rounded-xl text-center"
                          style={{
                            backgroundColor: 'var(--surface)',
                            borderWidth: '2px',
                            borderColor: 'var(--accent-green)',
                            borderStyle: 'dashed'
                          }}
                        >
                          <p className="text-sm font-medium mb-4"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Live Preview
                          </p>
                          {profileData.avatar && !profileData.avatar.startsWith('http') ? (
                            <div
                              key={`preview-${profileData.avatar}-${profileData.avatarVersion}`}
                              className="w-20 h-20 lg:w-24 lg:h-24 mx-auto rounded-full ring-4 ring-offset-4 flex items-center justify-center text-3xl lg:text-4xl bg-gradient-to-br from-purple-100 to-blue-100 shadow-lg transition-all duration-300"
                              style={{ 
                                backgroundColor: 'var(--surface-hover)',
                                ringColor: 'var(--accent-green)',
                                ringOffsetColor: 'var(--bg-primary)'
                              }}
                            >
                              {profileData.avatar}
                            </div>
                          ) : (
                            <img
                              key={`preview-${profileData.avatar}-${profileData.avatarVersion}`}
                              src={`${profileData.avatar}${profileData.avatar.includes('?') ? '&' : '?'}v=${profileData.avatarVersion}`}
                              alt="Avatar Preview"
                              className="w-20 h-20 lg:w-24 lg:h-24 mx-auto rounded-full ring-4 ring-offset-4 shadow-lg object-cover transition-all duration-300"
                              style={{ 
                                ringColor: 'var(--accent-green)',
                                ringOffsetColor: 'var(--bg-primary)'
                              }}
                              loading="lazy"
                              onError={(e) => {
                                e.target.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
                              }}
                            />
                          )}
                          <p className="text-xs mt-3"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            This is how your avatar will appear
                          </p>
                        </div>
                        
                        {/* Avatar Selector */}
                        <AvatarSelector
                          user={user}
                          userStats={userStats}
                          onAvatarChange={(newAvatar) => {
                            setProfileData(prev => ({ 
                              ...prev, 
                              avatar: newAvatar,
                              avatarVersion: Date.now() // Force image reload
                            }));
                          }}
                        />
                      </div>
                    )}

                    {/* Personal Information Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-green)', opacity: 0.1 }}>
                          <User className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                        </div>
                        <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          Personal Information
                        </h4>
                      </div>

                      {/* Name Fields */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            First Name
                          </label>
                          <input
                            type="text"
                            value={profileData.firstName}
                            onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                            disabled={!isEditing}
                            placeholder="Enter your first name"
                            className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-green-500/50"
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              borderWidth: '2px',
                              borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Last Name
                          </label>
                          <input
                            type="text"
                            value={profileData.lastName}
                            onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                            disabled={!isEditing}
                            placeholder="Enter your last name"
                            className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-green-500/50"
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              borderWidth: '2px',
                              borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Contact Information Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-blue)', opacity: 0.1 }}>
                          <Mail className="h-6 w-6" style={{ color: 'var(--accent-blue)' }} />
                        </div>
                        <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          Contact Information
                        </h4>
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-sm font-semibold mb-3"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                          disabled={!isEditing}
                          className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-blue-500/50"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '2px',
                            borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>

                      {/* Phone and Location Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={profileData.phone}
                            onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                            disabled={!isEditing}
                            placeholder="Enter your phone number"
                            className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-blue-500/50"
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              borderWidth: '2px',
                              borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Location
                          </label>
                          <input
                            type="text"
                            value={profileData.location}
                            onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                            disabled={!isEditing}
                            placeholder="Enter your location"
                            className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-blue-500/50"
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              borderWidth: '2px',
                              borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                              color: 'var(--text-primary)'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Additional Information Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-orange)', opacity: 0.1 }}>
                          <Globe className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                        </div>
                        <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          Additional Information
                        </h4>
                      </div>

                      {/* Website */}
                      <div>
                        <label className="block text-sm font-semibold mb-3"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Website
                        </label>
                        <input
                          type="url"
                          value={profileData.website}
                          onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                          disabled={!isEditing}
                          placeholder="Enter your website URL"
                          className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 focus:ring-2 focus:ring-orange-500/50"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '2px',
                            borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>

                      {/* Bio */}
                      <div>
                        <label className="block text-sm font-semibold mb-3"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Bio
                        </label>
                        <textarea
                          value={profileData.bio}
                          onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                          disabled={!isEditing}
                          placeholder="Tell us about yourself and your love for national parks..."
                          rows={5}
                          className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 disabled:opacity-60 resize-none focus:ring-2 focus:ring-orange-500/50"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            borderWidth: '2px',
                            borderColor: isEditing ? 'var(--border-hover)' : 'var(--border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Unified Favorites Tab */}
              {activeTab === 'favorites' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        All Favorites
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Your saved parks, blogs, and events in one place
                      </p>
                    </div>
                  </div>

                  {/* Favorites Sections */}
                  <div className="space-y-8">
                    {/* Favorite Parks Section */}
                    <div className="rounded-2xl p-6 backdrop-blur"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-green)', opacity: 0.1 }}>
                            <MapPin className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                              Favorite Parks
                            </h4>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              National parks you&apos;ve saved for future visits
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-sm font-semibold"
                          style={{
                            backgroundColor: 'var(--surface-hover)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {favoritesLoading ? 'Loading...' : `${favorites.length} parks`}
                        </span>
                      </div>

                      {favoritesLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div 
                            className="animate-spin rounded-full h-8 w-8 border-b-2"
                            style={{ borderColor: 'var(--accent-green)' }}
                          ></div>
                          <span className="ml-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Loading your favorite parks...
                          </span>
                        </div>
                      ) : (
                        <SavedParks 
                          key={`favorites-${favorites.length}-${renderKey}`}
                          savedParks={favorites} 
                          onRemove={handleRemoveFavorite}
                        />
                      )}
                    </div>

                    {/* Favorite Blogs Section */}
                    <div className="rounded-2xl p-6 backdrop-blur"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-blue)', opacity: 0.1 }}>
                            <BookOpen className="h-6 w-6" style={{ color: 'var(--accent-blue)' }} />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                              Favorite Blogs
                            </h4>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              Travel stories and guides you&apos;ve saved
                            </p>
                          </div>
                        </div>
                      </div>
                      <FavoriteBlogs />
                    </div>

                    {/* Saved Events Section */}
                    <div className="rounded-2xl p-6 backdrop-blur"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-orange)', opacity: 0.1 }}>
                            <CalendarDays className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                          </div>
                          <div>
                            <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                              Saved Events
                            </h4>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              Events and activities you&apos;re interested in
                            </p>
                          </div>
                        </div>
                      </div>
                      <SavedEvents />
                    </div>
                  </div>
                </div>
              )}

              {/* Adventures Tab - Combined Visited Parks and Trips */}
              {activeTab === 'adventures' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Your Adventures
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Track your visited parks and planned trips in one place
                      </p>
                    </div>
                  </div>

                  {/* Visited Parks Section */}
                  <div className="rounded-2xl p-6 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-green)', opacity: 0.1 }}>
                          <MapPin className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            Visited Parks
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            National parks you&apos;ve explored and experienced
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-sm font-semibold"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {visitedParksLoading ? 'Loading...' : `${visitedParks.length} parks`}
                      </span>
                    </div>

                    {visitedParksLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div 
                          className="animate-spin rounded-full h-8 w-8 border-b-2"
                          style={{ borderColor: 'var(--accent-green)' }}
                        ></div>
                        <span className="ml-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Loading your visited parks...
                        </span>
                      </div>
                    ) : (
                      <VisitedParks 
                        key={`visited-${visitedParks.length}-${renderKey}`}
                        visitedParks={visitedParks} 
                        onRemove={removeVisited}
                      />
                    )}
                  </div>

                  {/* Trips Section */}
                  <div className="rounded-2xl p-6 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-blue)', opacity: 0.1 }}>
                          <Calendar className="h-6 w-6" style={{ color: 'var(--accent-blue)' }} />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            Planned Trips
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Trip summaries with key planning details and continue options
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <TripHistoryList userId={user?.id} />
                  </div>
                </div>
              )}


              {/* Reviews Tab */}
              {activeTab === 'reviews' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        My Reviews
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Share your experiences and help other explorers discover amazing parks
                      </p>
                    </div>
                  </div>

                  {/* Reviews Content */}
                  <div className="rounded-2xl p-6 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-orange)', opacity: 0.1 }}>
                          <Star className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            Park Reviews
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Your reviews help others plan their adventures
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <UserReviews />
                  </div>
                </div>
              )}

              {/* Testimonials Tab */}
              {activeTab === 'testimonials' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Testimonials
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Share your experiences and help other explorers
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        // Trigger the testimonial form in UserTestimonials component
                        const event = new CustomEvent('openTestimonialForm');
                        window.dispatchEvent(event);
                      }}
                      variant="primary"
                      size="lg"
                      icon={Plus}
                      className="w-full sm:w-auto justify-center"
                    >
                      Submit Testimonial
                    </Button>
                  </div>
                  
                  <UserTestimonials />
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="rounded-3xl p-8 lg:p-10 backdrop-blur shadow-xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    backgroundImage: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-hover) 100%)'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Settings
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Manage your account preferences and privacy settings
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
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

                    {/* Email preference messages */}
                    {emailError && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: '#ef4444',
                          borderColor: '#ef4444'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{emailError}</p>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => {
                                setEmailError('');
                                if (user?.email) {
                                  loadEmailPreferences();
                                }
                              }}
                              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                              Retry
                            </button>
                            <button
                              onClick={() => setEmailError('')}
                              className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {emailMessage && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--accent-green)',
                          borderColor: 'var(--accent-green)'
                        }}
                      >
                        <p className="text-sm font-medium">{emailMessage}</p>
                      </div>
                    )}
                    {emailLoading && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--text-primary)',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <p className="text-sm font-medium flex items-center gap-2">
                          <div 
                            className="animate-spin rounded-full h-4 w-4 border-b-2"
                            style={{ borderColor: 'var(--accent-blue)' }}
                          ></div>
                          Saving email preferences...
                        </p>
                      </div>
                    )}

                    <div className="space-y-4">
                      {[
                        { id: 'emailNotifications', label: 'Blog Notifications', description: 'Receive blog post updates via email' }
                      ].map((setting) => {
                        console.log('Rendering setting:', setting.id, 'value:', preferences[setting.id]);
                        return (
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
                              disabled={emailLoading}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                console.log('Toggle changed:', setting.id, 'from', preferences[setting.id], 'to', newValue);
                                setPreferences({ ...preferences, [setting.id]: newValue });
                                saveEmailPreferences(newValue);
                              }}
                              className="sr-only peer"
                            />
                            <div 
                              className="relative w-11 h-6 rounded-full transition-all duration-200 ease-in-out"
                              style={{
                                backgroundColor: preferences[setting.id] ? 'var(--accent-green)' : 'var(--surface-hover)'
                              }}
                            >
                              <div 
                                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-200 ease-in-out transform"
                                style={{
                                  transform: preferences[setting.id] ? 'translateX(20px)' : 'translateX(0px)'
                                }}
                              ></div>
                            </div>
                          </label>
                        </div>
                        );
                      })}
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

                    {/* Privacy & Security messages */}
                    {privacyError && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: '#ef4444',
                          borderColor: '#ef4444'
                        }}
                      >
                        <p className="text-sm font-medium">{privacyError}</p>
                      </div>
                    )}
                    {privacyMessage && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--accent-green)',
                          borderColor: 'var(--accent-green)'
                        }}
                      >
                        <p className="text-sm font-medium">{privacyMessage}</p>
                      </div>
                    )}
                    {privacyLoading && (
                      <div 
                        className="mb-4 p-3 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--text-primary)',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <p className="text-sm font-medium flex items-center gap-2">
                          <div 
                            className="animate-spin rounded-full h-4 w-4 border-b-2"
                            style={{ borderColor: 'var(--accent-blue)' }}
                          ></div>
                          Processing...
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <button 
                        onClick={() => setShowChangePasswordModal(true)}
                        disabled={privacyLoading}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
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

                      <button 
                        onClick={handleDownloadData}
                        disabled={privacyLoading}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        onClick={() => setShowDeleteAccountModal(true)}
                        disabled={privacyLoading}
                        className="w-full flex items-center justify-between px-6 py-3 rounded-xl font-semibold transition hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: 'var(--surface)',
                          color: 'var(--error-red)',
                          border: '1px solid',
                          borderColor: 'var(--error-red)'
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
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Enhanced Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="rounded-2xl p-8 w-full max-w-lg shadow-2xl"
            style={{ 
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              borderWidth: '1px'
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-green-light)' }}
              >
                <Lock className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
              </div>
              <div>
                <h3 className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Change Password
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Update your account security
                </p>
              </div>
            </div>

            {/* Error Message */}
            {privacyError && (
              <div 
                className="mb-4 p-4 rounded-xl border flex items-start gap-3"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  borderColor: 'var(--error)'
                }}
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>{privacyError}</p>
              </div>
            )}
            
            <div className="space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordFieldChange('currentPassword', e.target.value)}
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition"
                    style={{ 
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: passwordErrors.currentPassword ? 'var(--error)' : 'var(--border)',
                      borderWidth: '1px',
                      color: 'var(--text-primary)'
                    }}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordErrors.currentPassword && (
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--error)' }}>
                    <AlertCircle className="h-3 w-3" />
                    {passwordErrors.currentPassword}
                  </p>
                )}
              </div>
              
              {/* New Password */}
              <div>
                <label className="block text-xs font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordFieldChange('newPassword', e.target.value)}
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition"
                    style={{ 
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: passwordErrors.newPassword ? 'var(--error)' : 'var(--border)',
                      borderWidth: '1px',
                      color: 'var(--text-primary)'
                    }}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {passwordForm.newPassword && (() => {
                  const passwordStrength = getPasswordStrength(passwordForm.newPassword);
                  return (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Password strength:
                        </span>
                        <span className="text-xs font-medium" style={{ color: passwordStrength.color }}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div 
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--surface-hover)' }}
                      >
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${(passwordStrength.strength / 5) * 100}%`,
                            backgroundColor: passwordStrength.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {passwordErrors.newPassword && (
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--error)' }}>
                    <AlertCircle className="h-3 w-3" />
                    {passwordErrors.newPassword}
                  </p>
                )}
              </div>
              
              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-medium mb-2 uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordFieldChange('confirmPassword', e.target.value)}
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl outline-none transition"
                    style={{ 
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: passwordErrors.confirmPassword ? 'var(--error)' : 'var(--border)',
                      borderWidth: '1px',
                      color: 'var(--text-primary)'
                    }}
                    placeholder="Confirm new password"
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
                {passwordErrors.confirmPassword && (
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--error)' }}>
                    <AlertCircle className="h-3 w-3" />
                    {passwordErrors.confirmPassword}
                  </p>
                )}
                {!passwordErrors.confirmPassword && passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword && (
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--accent-green)' }}>
                    <CheckCircle className="h-3 w-3" />
                    Passwords match
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <Button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordErrors({});
                  setPrivacyError('');
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                }}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={privacyLoading}
                variant="primary"
                size="lg"
                className="flex-1"
                loading={privacyLoading}
              >
                {privacyLoading ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <h3 className="text-xl font-bold mb-4 text-red-600">
              Delete Account
            </h3>
            
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">
                <strong>Warning:</strong> This action cannot be undone. All your data, including profile, trips, favorites, and reviews will be permanently deleted.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Enter your password to confirm
                </label>
                <input
                  type="password"
                  value={deleteForm.password}
                  onChange={(e) => setDeleteForm({...deleteForm, password: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{ 
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Enter your password"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Type &quot;DELETE&quot; to confirm
                </label>
                <input
                  type="text"
                  value={deleteForm.confirmation}
                  onChange={(e) => setDeleteForm({...deleteForm, confirmation: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{ 
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="Type DELETE to confirm"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowDeleteAccountModal(false);
                  setDeleteForm({ password: '', confirmation: '' });
                  setPrivacyError('');
                }}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteAccount}
                disabled={privacyLoading}
                variant="danger"
                size="lg"
                className="flex-1"
                loading={privacyLoading}
              >
                {privacyLoading ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default ProfilePage;
