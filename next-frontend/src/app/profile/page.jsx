'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  UserCircle as PhUserCircle,
  EnvelopeSimple as PhEnvelopeSimple,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  TreeEvergreen as PhTreeEvergreen,
  BookOpenText as PhBookOpenText,
  CalendarDots as PhCalendarDots
} from '@phosphor-icons/react';
import {
  User, Settings, Heart, Calendar, MapPin,
  Mail, Globe, Edit2, Save, X, Trash2,
  Shield, ChevronRight,
  Download, Star, Clock, Plus,
  CalendarDays, BookOpen, Compass,
  Eye, EyeOff, CheckCircle, AlertCircle, Lock
} from '@components/icons';
import Header from '@components/common/Header';
import Button from '@components/common/Button';
// import OptimizedImage from '@components/common/OptimizedImage';
import SavedParks from '@components/profile/SavedParks';
import VisitedParks from '@components/profile/VisitedParks';
import SavedEvents from '@components/profile/SavedEvents';
import UserTestimonials from '@components/profile/UserTestimonials';
import UserReviews from '@components/profile/UserReviews';
import UnifiedAvatarSelector from '@components/profile/UnifiedAvatarSelector';
import FavoriteBlogs from '@components/profile/FavoriteBlogs';
import ProfileHero from '@components/profile/ProfileHero';
import ProfileStats from '@components/profile/ProfileStats';
import ParkTabs from '@components/park-details/ParkTabs';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFavorites } from '@hooks/useFavorites';
import { useVisitedParks } from '@hooks/useVisitedParks';
import { useSavedEvents } from '@hooks/useSavedEvents';
import { useUserReviews } from '@hooks/useUserReviews';
import { useWebSocket } from '@hooks/useWebSocket';
import userService from '@/services/userService';
import { getStoredToken } from '@/services/authService';
import { getBestAvatar, generateRandomAvatar } from '@utils/avatarGenerator';

const ProfilePage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, userDataLoaded, updateUser } = useAuth();
  const { showToast } = useToast();
  const { subscribe, unsubscribe, subscribeToProfile } = useWebSocket();
  // Track when a save is in-progress to suppress the WebSocket echo toast
  const isSavingRef = useRef(false);
  const { favorites, removeFavorite, loading: favoritesLoading } = useFavorites();
  const { visitedParks, removeVisited, loading: visitedParksLoading } = useVisitedParks();
  const {
    savedEvents,
    loading: savedEventsLoading,
    unsaveEvent,
    clearAllSavedEvents
  } = useSavedEvents();
  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    error: reviewsError,
    refetch: refetchReviews
  } = useUserReviews();

  // Debug reviews data



  // Test if we can manually call the API
  React.useEffect(() => {
    if (user && !reviewsLoading && !reviewsData && reviewsError) {


    }
  }, [user, reviewsLoading, reviewsData, reviewsError]);

  // Setup WebSocket real-time sync for profile updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to profile updates
    subscribeToProfile();

    // Handle profile updates from other devices/tabs
    const handleProfileUpdated = (data) => {
      console.log('[Real-Time] Profile updated:', data);
      if (data.userId === user._id || data.userId === user.id) {
        // If this session triggered the save, skip — the save handler
        // already updates state and shows a success toast.
        if (isSavingRef.current) return;

        // Update local state with new avatar
        updateUser({
          avatar: data.avatar,
          firstName: data.firstName,
          lastName: data.lastName,
          name: data.name
        });

        // Update profile data state
        setProfileData(prev => ({
          ...prev,
          avatar: data.avatar,
          firstName: data.firstName,
          lastName: data.lastName,
          avatarVersion: Date.now()
        }));

        showToast('Profile updated from another device', 'info');
      }
    };

    // Subscribe to WebSocket events
    subscribe('profileUpdated', handleProfileUpdated);

    // Cleanup
    return () => {
      unsubscribe('profileUpdated', handleProfileUpdated);
    };
  }, [user, subscribe, unsubscribe, subscribeToProfile, updateUser, showToast]);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingAvatar, setIsChangingAvatar] = useState(false);
  const [originalAvatar, setOriginalAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const [lastStatsLoadTime, setLastStatsLoadTime] = useState(0);
  const [lastEmailLoadTime, setLastEmailLoadTime] = useState(0);
  // userStats is now computed with useMemo below (removed useState)

    const [profileData, setProfileData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      bio: '',
      website: '',
      location: '',
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
  const [favoriteBlogsCount, setFavoriteBlogsCount] = useState(0);
  const [favoritesSubTab, setFavoritesSubTab] = useState('parks');

  const tabs = useMemo(() => [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'adventures', label: 'Visited Parks', icon: Compass },
    { id: 'reviews', label: 'My Reviews', icon: Star },
    { id: 'testimonials', label: 'Testimonials', icon: Star },
    { id: 'settings', label: 'Settings', icon: Settings }
  ], []);
  const validTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const activeTab = useMemo(() => {
    const requestedTab = searchParams.get('tab');
    return validTabIds.includes(requestedTab) ? requestedTab : 'profile';
  }, [searchParams, validTabIds]);

  // Debug favoriteBlogsCount changes
  useEffect(() => {
    console.log('[ProfilePage] 🔍 favoriteBlogsCount changed to:', favoriteBlogsCount);
  }, [favoriteBlogsCount]);

  // Helper function to clear error states when switching tabs
  const clearErrorStates = () => {
    setEmailError('');
    setPrivacyError('');
  };

  const closeChangePasswordModal = useCallback(() => {
    setShowChangePasswordModal(false);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordErrors({});
    setPrivacyError('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const closeDeleteAccountModal = useCallback(() => {
    setShowDeleteAccountModal(false);
    setDeleteForm({ password: '', confirmation: '' });
    setPrivacyError('');
  }, []);

  // Debug logging for favorites (can be removed after testing)
  // Force re-render when favorites change
  useEffect(() => {
    if (favorites.length > 0) {

      setRenderKey(prev => prev + 1);
    }
  }, [favorites.length]);

  // Calculate total days since account creation (matches server logic) - Memoized for performance
  const calculateTotalDays = useCallback((user) => {
    if (!user || !user.createdAt) {
      return 0;
    }
    const accountCreatedDate = new Date(user.createdAt);
    const currentDate = new Date();

    // Use same calculation as server: Math.ceil with milliseconds difference
    const daysSinceAccountCreation = Math.ceil((currentDate.getTime() - accountCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysSinceAccountCreation);
  }, []); // No dependencies - pure calculation


  // Memoized userStats calculation - Prevents unnecessary recalculations (Performance optimization)
  const userStats = useMemo(() => {
    const totalFavorites = favorites.length + favoriteBlogsCount + savedEvents.length;

    // Debug logging for favorites count
    console.log('[ProfilePage] 🔍 Favorites breakdown:');
    console.log('[ProfilePage] 🔍 - Parks favorites:', favorites.length);
    console.log('[ProfilePage] 🔍 - Blog favorites:', favoriteBlogsCount);
    console.log('[ProfilePage] 🔍 - Event favorites:', savedEvents.length);
    console.log('[ProfilePage] 🔍 - Total favorites:', totalFavorites);
    console.log('[ProfilePage] 🔍 - Favorites data:', favorites);
    console.log('[ProfilePage] 🔍 - Saved events data:', savedEvents);

    // Check for duplicates in favorites
    const parkCodes = favorites.map(f => f.parkCode);
    const uniqueParkCodes = [...new Set(parkCodes)];
    if (parkCodes.length !== uniqueParkCodes.length) {
      console.warn('[ProfilePage] ⚠️ Duplicate park codes found in favorites!', {
        total: parkCodes.length,
        unique: uniqueParkCodes.length,
        duplicates: parkCodes.length - uniqueParkCodes.length
      });
    }

    // Check for duplicates in saved events
    const eventIds = savedEvents.map(e => e.id);
    const uniqueEventIds = [...new Set(eventIds)];
    if (eventIds.length !== uniqueEventIds.length) {
      console.warn('[ProfilePage] ⚠️ Duplicate event IDs found in saved events!', {
        total: eventIds.length,
        unique: uniqueEventIds.length,
        duplicates: eventIds.length - uniqueEventIds.length
      });
    }

    // Handle different possible data structures for reviews
    let reviewsCount = 0;
    if (reviewsData) {
      if (Array.isArray(reviewsData)) {
        reviewsCount = reviewsData.length;
      } else if (reviewsData.data && Array.isArray(reviewsData.data)) {
        reviewsCount = reviewsData.data.length;
      } else if (reviewsData.reviews && Array.isArray(reviewsData.reviews)) {
        reviewsCount = reviewsData.reviews.length;
      }
    }

    // Calculate totalDays if we have createdAt, regardless of userDataLoaded status
    // This allows showing days immediately if stored user has createdAt, or after server validation
    const totalDays = user?.createdAt ? calculateTotalDays(user) : 0;

    const stats = {
      parksVisited: visitedParks.length,
      favorites: totalFavorites,
      reviews: reviewsCount || 0, // Ensure it's never undefined
      totalDays: totalDays
    };

    console.log('[ProfilePage] 🔄 Stats recalculated:', stats);
    console.log('[ProfilePage] 🔄 User createdAt:', user?.createdAt);
    console.log('[ProfilePage] 🔄 UserDataLoaded:', userDataLoaded);
    console.log('[ProfilePage] 🔄 TotalDays calculated:', totalDays);

    return stats;
  }, [favorites, favoriteBlogsCount, savedEvents, visitedParks.length, reviewsData, user, userDataLoaded, calculateTotalDays]);

  // Memoized stats array - Only recalculates when userStats or reviewsLoading changes
  const stats = useMemo(() => {
    const statsArray = [
      { label: 'Parks Visited', value: userStats.parksVisited, icon: MapPin },
      { label: 'Favorites', value: userStats.favorites, icon: Heart },
      {
        label: 'Reviews',
        value: reviewsLoading ? '...' : (userStats.reviews ?? 0),
        icon: Star,
        loading: reviewsLoading
      },
      {
        label: 'Total Days',
        value: !user?.createdAt ? '...' : userStats.totalDays,
        icon: Clock,
        loading: !user?.createdAt
      }
    ];

    console.log('[ProfilePage] 📊 Stats array updated:', statsArray);

    return statsArray;
  }, [userStats, reviewsLoading, user?.createdAt]);

  const panelStyle = useMemo(() => ({
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderColor: 'var(--border)',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)'
  }), []);

  const sectionBadgeStyle = useMemo(() => ({
    backgroundColor: 'color-mix(in srgb, var(--surface-hover) 72%, white 28%)',
    color: 'var(--text-secondary)',
    border: '1px solid color-mix(in srgb, var(--border) 86%, white 14%)'
  }), []);

  const getSectionIconShellStyle = useCallback((accentVar) => ({
    backgroundColor: `color-mix(in srgb, ${accentVar} 12%, white 88%)`,
    border: `1px solid color-mix(in srgb, ${accentVar} 20%, var(--border) 80%)`,
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)'
  }), []);

  const modalCardStyle = useMemo(() => ({
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)'
  }), []);

  const modalInputStyle = useMemo(() => ({
    backgroundColor: 'var(--surface-hover)',
    borderColor: 'var(--border)',
    borderWidth: '1px',
    color: 'var(--text-primary)'
  }), []);

  // Debug stats array



  const loadProfileData = useCallback(async () => {
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
      bio: userProfile.bio || '',
      website: userProfile.website || '',
      location: userProfile.location || '',
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
      bio: '',
      website: '',
      location: '',
      avatar: user?.avatar || profileData.avatar || getBestAvatar(user, userStats, 'travel'),
      avatarVersion: Date.now()
    });
      showToast('Failed to load profile data', 'error');
    } finally {
      setLoading(false);
    }
  }, [lastLoadTime, profileData.avatar, showToast, user, userStats]);

  useEffect(() => {
    // Wait for auth to finish validating before deciding to redirect
    if (!userDataLoaded) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    loadProfileData();
  }, [isAuthenticated, userDataLoaded, loadProfileData, router]);

  const loadUserStats = async () => {
    // Debounce: Don't make API calls more than once every 5 seconds
    const now = Date.now();
    if (now - lastStatsLoadTime < 5000) {
      return;
    }

    try {
      setLastStatsLoadTime(now);

      // NOTE: Stats are now computed automatically via useMemo based on local data
      // No need to fetch from server or update state
      // The useMemo will recalculate whenever favorites, visitedParks, etc. change
      console.log('[ProfilePage] Stats auto-calculated via useMemo');

      // Override totalDays with client calculation to ensure consistency
      // Calculate if user has createdAt, regardless of userDataLoaded status
      const clientCalculatedDays = user?.createdAt ? calculateTotalDays(user) : 0;

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

      // NOTE: No need to set fallback stats - useMemo already computes stats from local data
      // The userStats memoized value will automatically use favorites.length, visitedParks.length, etc.
      console.log('[ProfilePage] Error loading stats, useMemo will use local data automatically');
    }
  };

  // Email preferences API functions with retry logic
  const loadEmailPreferences = useCallback(async (retryCount = 0, maxRetries = 3) => {
    if (!user?.email) return;

    try {

      const response = await fetch(`/api/email/preferences/${user.email}`, {
        headers: {
          'Authorization': `Bearer ${getStoredToken()}`
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
  }, [user?.email]);

  // Load email preferences when user is available (with debounce)
  useEffect(() => {
    if (user?.email) {
      setEmailError('');

      const now = Date.now();
      if (now - lastEmailLoadTime < 2000) {
        return;
      }
      setLastEmailLoadTime(now);
      loadEmailPreferences();
    }
  }, [user?.email, lastEmailLoadTime, loadEmailPreferences]);

  const saveEmailPreferences = async (newValue, retryCount = 0, maxRetries = 3) => {
    if (!user?.email) return;

    try {
      setEmailLoading(true);
      setEmailError('');
      setEmailMessage('');


      const response = await fetch(`/api/email/preferences/${user.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getStoredToken()}`
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
          'Authorization': `Bearer ${getStoredToken()}`
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
          'Authorization': `Bearer ${getStoredToken()}`
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
          'Authorization': `Bearer ${getStoredToken()}`
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
        router.push('/');
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

  const handleSaveProfile = useCallback(async () => {
    try {
      setLoading(true);
      isSavingRef.current = true;

      // Prepare profile data for API
    const updateData = {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      email: profileData.email,
      phone: profileData.phone,
      website: profileData.website,
      bio: profileData.bio,
      location: profileData.location,
      avatar: profileData.avatar
    };

      // Update profile in database
      const updatedProfile = await userService.updateProfile(updateData);

      // Update AuthContext with the new user data
      updateUser(updatedProfile);

      // Update local state with server response
      setProfileData(prev => ({
        ...prev,
        ...updatedProfile,
        avatar: updatedProfile.avatar || prev.avatar, // Keep the user's selected avatar
        avatarVersion: Date.now() // Force image reload after save
      }));

      // Note: Stats are auto-updated by the useMemo watching favorites/blogs/events
      // No need to call loadUserStats() here

      setIsEditing(false);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Failed to update profile. Please try again.', 'error');
    } finally {
      setLoading(false);
      // Delay clearing the flag so the WebSocket echo (which arrives async)
      // is still suppressed even if it arrives slightly after the response.
      setTimeout(() => { isSavingRef.current = false; }, 2000);
    }
  }, [profileData, updateUser, showToast]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    // Reset form data here if needed
  }, []);

  const handleTabChange = useCallback((tabId) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', tabId);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    setIsEditing(false);
    clearErrorStates();
  }, [pathname, router, searchParams]);

  const handleTabKeyDown = useCallback((event) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    handleTabChange(tabs[nextIndex].id);
  }, [activeTab, handleTabChange, tabs]);

  // Avatar change handlers (memoized)
  const handleChangeAvatarStart = useCallback(() => {
    setOriginalAvatar(profileData.avatar);
    setIsChangingAvatar(true);
    const seed = user?.email || user?.firstName || 'traveler';
    const randomAvatar = generateRandomAvatar(seed);
    setProfileData(prev => ({
      ...prev,
      avatar: randomAvatar,
      avatarVersion: Date.now()
    }));
  }, [profileData.avatar, user]);

  const handleCancelAvatarChange = useCallback(() => {
    setProfileData(prev => ({
      ...prev,
      avatar: originalAvatar,
      avatarVersion: Date.now()
    }));
    setIsChangingAvatar(false);
    setOriginalAvatar(null);
  }, [originalAvatar]);

  const handleGenerateNewAvatar = useCallback(() => {
    const seed = user?.email || user?.firstName || 'traveler';
    const randomAvatar = generateRandomAvatar(seed);
    setProfileData(prev => ({
      ...prev,
      avatar: randomAvatar,
      avatarVersion: Date.now()
    }));
  }, [user]);

  // New unified avatar change handler
  const handleAvatarChange = useCallback((newAvatar) => {
    setProfileData(prev => ({
      ...prev,
      avatar: newAvatar,
      avatarVersion: Date.now()
    }));
  }, []);

  const handleSaveAvatar = useCallback(async () => {
    try {
      setIsChangingAvatar(false);
      setOriginalAvatar(null);
      const updateData = { avatar: profileData.avatar };
      const updatedProfile = await userService.updateProfile(updateData);
      updateUser({ avatar: updatedProfile.avatar });
      showToast('Avatar saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving avatar:', error);
      showToast('Failed to save avatar. Please try again.', 'error');
    }
  }, [profileData.avatar, updateUser, showToast]);

  // Memoized handler functions - Prevents unnecessary re-creation (Performance optimization)
  const handleRemoveFavorite = useCallback(async (parkCode) => {
    try {
      await removeFavorite(parkCode);
      showToast('Removed from favorites', 'success');
    } catch (error) {
      showToast('Error removing favorite', 'error');
      console.error('Error removing favorite:', error);
    }
  }, [removeFavorite, showToast]);



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
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(circle at top left, color-mix(in srgb, var(--accent-green-light) 18%, transparent 82%) 0%, transparent 30%), radial-gradient(circle at top right, color-mix(in srgb, var(--accent-blue) 10%, transparent 90%) 0%, transparent 24%)'
      }}
    >
      <Header />

      {/* Main Content */}
      <section className="py-8">
        <div className="w-full max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">

          {/* Profile Hero Section - Extracted Component */}
          <ProfileHero
            profileData={profileData}
            isChangingAvatar={isChangingAvatar}
            onChangeAvatarStart={handleChangeAvatarStart}
            onCancelAvatarChange={handleCancelAvatarChange}
            onGenerateNewAvatar={handleGenerateNewAvatar}
            onSaveAvatar={handleSaveAvatar}
            onAvatarChange={handleAvatarChange}
            user={user}
          />

          {/* Stats Section - Extracted Component */}
          <ProfileStats stats={stats} />
        </div>

        {/* Tab Navigation */}
        <ParkTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
          ariaLabel="Profile sections"
          onKeyDown={handleTabKeyDown}
          getTabId={(tab) => `profile-tab-${tab.id}`}
          getAriaControls={(tab) => `profile-panel-${tab.id}`}
        />

        <div className="w-full max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 mt-8">

          {/* Main Content Area */}
          <div className="min-w-0">
              {/* Enhanced Profile Tab */}
              {activeTab === 'profile' && (
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-profile"
                  role="tabpanel"
                  aria-labelledby="profile-tab-profile"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Account details
                      </div>
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
                        variant="secondary"
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
                          variant="secondary"
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
                      {/* Personal Information Section */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={getSectionIconShellStyle('var(--accent-green)')}>
                          <PhUserCircle size={22} weight="duotone" style={{ color: 'var(--accent-green)' }} />
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
                        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={getSectionIconShellStyle('var(--accent-blue)')}>
                          <PhEnvelopeSimple size={22} weight="duotone" style={{ color: 'var(--accent-blue)' }} />
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

                      {/* Phone Number */}
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

                      {/* Location */}
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
                          placeholder="Enter your location (e.g., New York, NY)"
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

                    {/* Additional Information Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={getSectionIconShellStyle('var(--accent-orange)')}>
                          <PhGlobeHemisphereWest size={22} weight="duotone" style={{ color: 'var(--accent-orange)' }} />
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
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-favorites"
                  role="tabpanel"
                  aria-labelledby="profile-tab-favorites"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Saved collection
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Favorites
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Your saved parks, blogs, and events in one place
                      </p>
                    </div>
                  </div>

                  {/* Sub-tab pills */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {[
                      { id: 'parks', label: 'Parks', count: favorites.length },
                      { id: 'blogs', label: 'Blogs', count: favoriteBlogsCount },
                      { id: 'events', label: 'Events', count: savedEvents.length },
                    ].map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setFavoritesSubTab(sub.id)}
                        className="px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                        style={{
                          backgroundColor: favoritesSubTab === sub.id ? 'var(--accent-green)' : 'var(--surface-hover)',
                          color: favoritesSubTab === sub.id ? 'white' : 'var(--text-secondary)',
                        }}
                      >
                        {sub.label}
                        {sub.count > 0 && (
                          <span className="ml-1.5 text-xs opacity-80">
                            {sub.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Favorite Parks */}
                  {favoritesSubTab === 'parks' && (
                    <>
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
                    </>
                  )}

                  {/* Favorite Blogs */}
                  {favoritesSubTab === 'blogs' && (
                    <FavoriteBlogs onCountChange={setFavoriteBlogsCount} />
                  )}

                  {/* Saved Events */}
                  {favoritesSubTab === 'events' && (
                    <SavedEvents
                      savedEvents={savedEvents}
                      loading={savedEventsLoading}
                      onRemove={unsaveEvent}
                      onClearAll={clearAllSavedEvents}
                    />
                  )}
                </div>
              )}

              {/* Adventures Tab - Visited Parks */}
              {activeTab === 'adventures' && (
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-adventures"
                  role="tabpanel"
                  aria-labelledby="profile-tab-adventures"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Park memories
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Visited Parks
                      </h3>
                      <p className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Track your visited parks and experiences in one place
                      </p>
                    </div>
                  </div>

                  {/* Visited Parks Section */}
                  <div>

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

                </div>
              )}


              {/* Reviews Tab */}
              {activeTab === 'reviews' && (
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-reviews"
                  role="tabpanel"
                  aria-labelledby="profile-tab-reviews"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Community voice
                      </div>
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
                  <div>
                    <UserReviews
                      reviews={Array.isArray(reviewsData?.data) ? reviewsData.data : []}
                      isLoading={reviewsLoading}
                      error={reviewsError}
                      onRefresh={refetchReviews}
                    />
                  </div>
                </div>
              )}

              {/* Testimonials Tab */}
              {activeTab === 'testimonials' && (
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-testimonials"
                  role="tabpanel"
                  aria-labelledby="profile-tab-testimonials"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Share the story
                      </div>
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
                      variant="secondary"
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
                <div className="rounded-3xl p-4 sm:p-6 lg:p-10 backdrop-blur shadow-xl"
                  id="profile-panel-settings"
                  role="tabpanel"
                  aria-labelledby="profile-tab-settings"
                  style={panelStyle}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={sectionBadgeStyle}>
                        Preferences
                      </div>
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

                  <div className="space-y-8">
                    {/* Notification Settings */}
                  <div>
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
                        <div className="text-sm font-medium flex items-center gap-2">
                          <div
                            className="animate-spin rounded-full h-4 w-4 border-b-2"
                            style={{ borderColor: 'var(--accent-blue)' }}
                          ></div>
                          Saving email preferences...
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {[
                        { id: 'emailNotifications', label: 'Blog Notifications', description: 'Receive blog post updates via email' }
                      ].map((setting) => {

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

                    {/* Unsubscribe from All Emails */}
                    <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                            Unsubscribe from All Emails
                          </h4>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Stop receiving all marketing and notification emails
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to unsubscribe from all TrailVerse emails?')) {
                              setPreferences({ ...preferences, emailNotifications: false });
                              saveEmailPreferences(false);
                            }
                          }}
                          disabled={emailLoading || !preferences.emailNotifications}
                          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                          style={{
                            backgroundColor: !preferences.emailNotifications ? 'var(--surface-hover)' : 'rgba(239, 68, 68, 0.15)',
                            color: !preferences.emailNotifications ? 'var(--text-secondary)' : '#ef4444',
                            border: `1px solid ${!preferences.emailNotifications ? 'var(--border)' : '#ef4444'}`,
                            cursor: !preferences.emailNotifications || emailLoading ? 'not-allowed' : 'pointer',
                            opacity: emailLoading ? 0.6 : 1
                          }}
                        >
                          {!preferences.emailNotifications ? 'Already Unsubscribed' : 'Unsubscribe All'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Privacy & Security */}
                  <div>
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
                        <div className="text-sm font-medium flex items-center gap-2">
                          <div
                            className="animate-spin rounded-full h-4 w-4 border-b-2"
                            style={{ borderColor: 'var(--accent-blue)' }}
                          ></div>
                          Processing...
                        </div>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={closeChangePasswordModal}>
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl animate-scale-up" style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div
              className="border-b px-5 py-4 sm:px-6"
              style={{
                borderColor: 'var(--border)',
                background: 'linear-gradient(180deg, rgba(67, 160, 106, 0.05) 0%, rgba(255,255,255,0) 100%)'
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      backgroundColor: 'rgba(67, 160, 106, 0.12)',
                      color: 'var(--accent-green)'
                    }}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Security
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Change Password
                  </h3>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    Update your account security with a new password.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close change password dialog"
                  onClick={closeChangePasswordModal}
                  className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-colors"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(90vh-190px)] overflow-y-auto px-5 py-6 sm:px-6 sm:py-7" style={{ backgroundColor: 'var(--bg-primary)' }}>

            {privacyError && (
              <div
                className="mb-5 flex items-start gap-3 rounded-2xl border p-4"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--error-red) 10%, white 90%)',
                  borderColor: 'color-mix(in srgb, var(--error-red) 28%, var(--border) 72%)'
                }}
              >
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-red)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--error-red)' }}>{privacyError}</p>
              </div>
            )}

            <div className="space-y-5">
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
                      ...modalInputStyle,
                      borderColor: passwordErrors.currentPassword ? 'var(--error-red)' : 'var(--border)',
                      borderWidth: '1px',
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
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--error-red)' }}>
                    <AlertCircle className="h-3 w-3" />
                    {passwordErrors.currentPassword}
                  </p>
                )}
              </div>

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
                      ...modalInputStyle,
                      borderColor: passwordErrors.newPassword ? 'var(--error-red)' : 'var(--border)',
                      borderWidth: '1px',
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
                  <p className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--error-red)' }}>
                    <AlertCircle className="h-3 w-3" />
                    {passwordErrors.newPassword}
                  </p>
                )}
              </div>

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
                      ...modalInputStyle,
                      borderColor: passwordErrors.confirmPassword ? 'var(--error-red)' : 'var(--border)',
                      borderWidth: '1px',
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

            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              <div />
              <div className="flex items-center gap-3">
                <Button
                  onClick={closeChangePasswordModal}
                  variant="secondary"
                  size="md"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={privacyLoading}
                  variant="primary"
                  size="md"
                  loading={privacyLoading}
                >
                  {privacyLoading ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={closeDeleteAccountModal}>
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl animate-scale-up" style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div
              className="border-b px-5 py-4 sm:px-6"
              style={{
                borderColor: 'var(--border)',
                background: 'linear-gradient(180deg, rgba(220, 38, 38, 0.06) 0%, rgba(255,255,255,0) 100%)'
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      backgroundColor: 'rgba(220, 38, 38, 0.12)',
                      color: 'var(--error-red)'
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Danger Zone
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Delete Account
                  </h3>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    Permanently remove your account and all associated data.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close delete account dialog"
                  onClick={closeDeleteAccountModal}
                  className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-colors"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(90vh-190px)] overflow-y-auto px-5 py-6 sm:px-6 sm:py-7" style={{ backgroundColor: 'var(--bg-primary)' }}>

            <div
              className="mb-5 rounded-2xl border p-4"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--error-red) 10%, white 90%)',
                borderColor: 'color-mix(in srgb, var(--error-red) 28%, var(--border) 72%)'
              }}
            >
              <p className="text-sm leading-6" style={{ color: 'var(--error-red)' }}>
                <span className="font-semibold">Warning:</span> This action cannot be undone. Your profile, trips, favorites, reviews, and saved history will be permanently deleted.
              </p>
            </div>

            {privacyError && (
              <div
                className="mb-5 flex items-start gap-3 rounded-2xl border p-4"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--error-red) 10%, white 90%)',
                  borderColor: 'color-mix(in srgb, var(--error-red) 28%, var(--border) 72%)'
                }}
              >
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-red)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--error-red)' }}>{privacyError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Enter your password to confirm
                </label>
                <input
                  type="password"
                  value={deleteForm.password}
                  onChange={(e) => setDeleteForm({...deleteForm, password: e.target.value})}
                  className="w-full rounded-xl px-4 py-3.5 outline-none transition"
                  style={modalInputStyle}
                  placeholder="Enter your password"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Type &quot;DELETE&quot; to confirm
                </label>
                <input
                  type="text"
                  value={deleteForm.confirmation}
                  onChange={(e) => setDeleteForm({...deleteForm, confirmation: e.target.value})}
                  className="w-full rounded-xl px-4 py-3.5 outline-none transition"
                  style={modalInputStyle}
                  placeholder="Type DELETE to confirm"
                />
              </div>
            </div>

            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              <div />
              <div className="flex items-center gap-3">
                <Button
                  onClick={closeDeleteAccountModal}
                  variant="secondary"
                  size="md"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={privacyLoading}
                  variant="danger"
                  size="md"
                  loading={privacyLoading}
                >
                  {privacyLoading ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default function ProfilePageWrapper() {
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
