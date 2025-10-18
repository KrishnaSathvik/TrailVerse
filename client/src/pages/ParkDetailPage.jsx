import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useParkDetails } from '../hooks/useParks';
import { useParkPrefetch } from '../hooks/useSmartPrefetch';
import { 
  ArrowLeft, Heart, MapPin, Clock, DollarSign, Phone, 
  Globe, Navigation, Info, Mountain, Camera, Tent, Utensils,
  Wifi, Calendar, Star, MapPinCheck, AlertTriangle
} from '@components/icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../hooks/useFavorites';
import { useVisitedParks } from '../hooks/useVisitedParks';
import { logParkView, logUserAction } from '../utils/analytics';
import { processHtmlContent } from '../utils/htmlUtils';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import WeatherWidget from '../components/park-details/WeatherWidget.jsx';
import ReviewSection from '../components/park-details/ReviewSection';
import ShareButtons from '../components/common/ShareButtons';
import Button from '../components/common/Button';

const ParkDetailPage = ({ isPublic = false }) => {
  const { parkCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { addFavorite, removeFavorite, isParkFavorited, refreshFavorites } = useFavorites();
  const { isParkVisited, markAsVisited, removeVisited, markingAsVisited, removingVisited } = useVisitedParks();
  
  // Determine if this is a public access (not authenticated)
  const isPublicAccess = isPublic || !isAuthenticated;
  const { data, isLoading, error } = useParkDetails(parkCode);
  const { recordParkView: _recordParkView } = useParkPrefetch(parkCode);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeActivityTab, setActiveActivityTab] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [savingPark, setSavingPark] = useState(false);

  // Track park view when component mounts
  useEffect(() => {
    if (data?.park) {
      logParkView(parkCode, data.park.fullName, 'direct');
    }
  }, [data?.park, parkCode]);

  // Reset activity tab when switching away from activities tab
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'activities') {
      setActiveActivityTab(null);
    }
  };

  // Check if park is saved - add logging to debug
  const isSaved = isParkFavorited(parkCode);
  console.log(`[ParkDetail] isSaved for ${parkCode}:`, isSaved);
  
  // Check if park is visited
  const isVisited = isParkVisited(parkCode);

  const handleSavePark = async () => {
    if (!isAuthenticated) {
      if (isPublic) {
        showToast('Please login to save parks', 'warning');
        navigate('/login');
        return;
      } else {
        showToast('Please login to save parks', 'warning');
        navigate('/login');
        return;
      }
    }

    try {
      setSavingPark(true);
      if (isSaved) {
        await removeFavorite(parkCode);
        showToast('Removed from favorites', 'success');
        logUserAction('favorite_removed', `Park: ${data.park.fullName}`, isAuthenticated?.user?.id);
      } else {
        if (!data?.park?.fullName) {
          showToast('Park data not loaded yet', 'error');
          return;
        }
        await addFavorite({
          parkCode,
          parkName: data.park.fullName,
          imageUrl: data.park.images?.[0]?.url || ''
        });
        showToast('Added to favorites', 'success');
        logUserAction('favorite_added', `Park: ${data.park.fullName}`, isAuthenticated?.user?.id);
      }
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.error === 'Park already in favorites') {
        showToast('Park is already in your favorites', 'info');
        // Refresh favorites to sync the state
        await refreshFavorites();
      } else {
        showToast('Error updating favorites', 'error');
        console.error('Error saving park:', error);
      }
    } finally {
      setSavingPark(false);
    }
  };

  const handleMarkVisited = async () => {
    if (!isAuthenticated) {
      showToast('Please login to mark parks as visited', 'warning');
      navigate('/login');
      return;
    }

    try {
      if (isVisited) {
        // If already visited, remove it from visited list
        await removeVisited(parkCode);
      } else {
        // Mark as visited using the new separate visited parks system
        await markAsVisited(
          parkCode, 
          null, // visitDate (use current date)
          null, // rating
          data?.park?.fullName, // parkName
          data?.park?.images?.[0]?.url || '', // imageUrl
          null // notes
        );
      }
    } catch (error) {
      console.error('Error toggling visited status:', error);
      // Error handling is done in the hook, so we don't need to show toast here
    }
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full mb-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Mountain className="h-8 w-8 animate-pulse" style={{ color: 'var(--text-primary)' }} />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading park details...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.park) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Park not found
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            The park you&apos;re looking for doesn&apos;t exist
          </p>
          {!isPublicAccess && (
            <Button
              onClick={() => {
                if (location.state?.from) {
                  navigate(`${location.state.from.pathname}${location.state.from.search}`);
                } else {
                  navigate(fromMobileMap ? '/map' : '/explore');
                }
              }}
              variant="secondary"
              size="lg"
            >
              {fromMobileMap ? 'Back to Map' : 'Back to Explore'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { park, campgrounds, activities, alerts, visitorCenters: _visitorCenters } = data;
  
  // Check if user came from mobile map page
  const fromMobileMap = location.state?.fromMobileMap || false;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'activities', label: 'Activities', icon: Mountain },
    { id: 'camping', label: 'Camping', icon: Tent },
    { id: 'facilities', label: 'Facilities', icon: Utensils },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'reviews', label: 'Reviews', icon: Star }
  ];

  // Generate structured data for the park
  const parkStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: park.fullName,
    description: park.description,
    image: park.images?.[0]?.url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: park.addresses?.[0]?.city,
      addressRegion: park.addresses?.[0]?.stateCode,
      addressCountry: 'US'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: park.latitude,
      longitude: park.longitude
    },
    url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
    sameAs: park.url,
    // AggregateRating will be added dynamically based on real reviews
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Public Access Banner */}
      {isPublicAccess && (
        <div className="bg-blue-600 text-white py-2 px-4 text-center">
          <p className="text-sm">
            You're viewing a park. 
            <button 
              onClick={() => navigate('/login')}
              className="underline hover:no-underline ml-1 font-semibold"
            >
              Login
            </button>
            {' '}to save parks and access all features.
          </p>
        </div>
      )}
      <SEO
        title={`${park.fullName} - Complete Guide & Travel Information`}
        description={`Explore ${park.fullName} in ${park.states}. ${park.description.substring(0, 150)}... Find activities, camping, weather, events, and plan your visit.`}
        keywords={`${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping, ${park.fullName} weather, ${park.fullName} activities`}
        url={`https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`}
        image={park.images?.[0]?.url}
        type="place"
      />
      
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(parkStructuredData)}
        </script>
      </Helmet>

      <Header />

      {/* Hero Image */}
      <section className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <OptimizedImage
          src={park.images?.[selectedImageIndex]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

        {/* Navigation Overlay - Only show for authenticated users */}
        {!isPublicAccess && (
          <div className="absolute top-0 left-0 right-0 z-10 pt-4 sm:pt-6">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
              <Button
                onClick={() => {
                  if (location.state?.from) {
                    navigate(`${location.state.from.pathname}${location.state.from.search}`);
                  } else {
                    navigate(fromMobileMap ? '/map' : '/explore');
                  }
                }}
                variant="secondary"
                size="md"
                icon={ArrowLeft}
                className="backdrop-blur hover:-translate-x-1"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderWidth: '1px',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  color: '#1f2937',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                }}
              >
                {fromMobileMap ? 'Back to Map' : 'Back to Explore'}
              </Button>
            </div>
          </div>
        )}

        {/* Park Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pb-4 sm:pb-6 lg:pb-8">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">

            <div className="mt-6 flex items-end justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur mb-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <MapPin className="h-3 w-3 text-white flex-shrink-0" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">
                    {park.states}
                  </span>
                </div>

                {/* Mobile-first responsive layout */}
                <div className="space-y-3 mb-3">
                  {/* Park Name - Full width on mobile, allows wrapping */}
                  <div className="w-full">
                    <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg"
                      title={park.fullName}
                    >
                      {park.fullName}
                    </h1>
                  </div>

                  {/* Action Buttons - Visited button on first row */}
                  <div className="space-y-3">
                    {/* First row - Visited button */}
                    {isAuthenticated && (
                      <div className="w-full">
                        <Button
                          onClick={handleMarkVisited}
                          disabled={markingAsVisited || removingVisited}
                          variant={isVisited ? 'success' : 'secondary'}
                          size="sm"
                          icon={isVisited ? MapPinCheck : MapPin}
                          className="backdrop-blur w-full sm:w-auto"
                          style={{
                            backgroundColor: isVisited ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            borderWidth: '1px',
                            borderColor: isVisited ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.3)',
                            opacity: (markingAsVisited || removingVisited) ? 0.6 : 1
                          }}
                          title={isVisited ? "Remove from visited" : "Mark as visited"}
                        >
                          <span className="hidden sm:inline truncate">{isVisited ? 'Visited' : 'Mark as Visited'}</span>
                          <span className="sm:hidden truncate">{isVisited ? 'Visited' : 'Mark Visited'}</span>
                        </Button>
                      </div>
                    )}

                    {/* Second row - Favorite and Share buttons */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Button
                        onClick={handleSavePark}
                        disabled={savingPark}
                        variant={isSaved ? 'danger' : 'secondary'}
                        size="sm"
                        icon={Heart}
                        className="p-3 backdrop-blur flex-shrink-0"
                        style={{
                          backgroundColor: isSaved ? 'rgba(239, 68, 68, 0.2)' : 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: isSaved ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'
                        }}
                        title={isSaved ? 'Remove from favorites' : (isPublicAccess ? 'Login to save parks' : 'Add to favorites')}
                      />

                      <ShareButtons 
                        url={window.location.href}
                        title={park.fullName}
                        description={park.description}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Ratings will be displayed in the reviews section */}
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Main Content */}
      <section className="py-8 sm:py-10 lg:py-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Column */}
            <div className="flex-1 min-w-0">
              {/* Quick Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
                {/* Hours */}
                <div className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Clock className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Hours
                    </h3>
                  </div>
                  <p className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {park.operatingHours?.[0]?.description || 'Open year-round, 24 hours'}
                  </p>
                </div>

                {/* Entrance Fee */}
                <div className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <DollarSign className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Entrance Fee
                    </h3>
                  </div>
                  <p className="text-2xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {park.entranceFees?.[0]?.cost 
                      ? `$${park.entranceFees[0].cost}`
                      : 'Free'
                    }
                  </p>
                  {park.entranceFees?.[0]?.title && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {park.entranceFees[0].title}
                    </p>
                  )}
                </div>

                {/* Contact */}
                <div className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Phone className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Contact
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {park.contacts?.phoneNumbers?.[0]?.phoneNumber ? (
                      <a
                        href={`tel:${park.contacts.phoneNumbers[0].phoneNumber}`}
                        className="text-sm font-medium hover:text-forest-400 transition block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {park.contacts.phoneNumbers[0].phoneNumber}
                      </a>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        No phone listed
                      </p>
                    )}
                    {park.url && (
                      <a
                        href={park.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-forest-400 hover:text-forest-300 transition"
                      >
                        <Globe className="h-3 w-3" />
                        <span>Official Website</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-6 sm:mb-8">
                <div className="flex gap-1 pb-2 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const showBadge = tab.id === 'alerts' && alerts && alerts.length > 0;
                    return (
                      <Button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                        size="sm"
                        icon={Icon}
                        className="whitespace-nowrap flex-shrink-0 relative"
                      >
                        {tab.label}
                        {showBadge && (
                          <span 
                            className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                            style={{
                              backgroundColor: '#ef4444',
                              color: 'white',
                              minWidth: '1.25rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {alerts.length}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* Tab Content */}
                <div className="rounded-2xl p-4 sm:p-6 lg:p-8 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  {activeTab === 'overview' && (
                    <div className="prose prose-invert max-w-none">
                      <h2 className="text-2xl font-bold mb-4"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        About {park.fullName}
                      </h2>
                      <p className="text-base leading-relaxed mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {park.description}
                      </p>

                      {park.weatherInfo && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Weather Information
                          </h3>
                          <p className="text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {park.weatherInfo}
                          </p>
                        </div>
                      )}

                      {park.directionsInfo && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Getting There
                          </h3>
                          <p className="text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {park.directionsInfo}
                          </p>
                          {park.latitude && park.longitude && (
                            <Button
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(park.fullName)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="secondary"
                              size="md"
                              icon={Navigation}
                              className="mt-4"
                            >
                              Get Directions
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'activities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Activities
                      </h2>
                      {activities && activities.length > 0 ? (
                        (() => {
                          // Group activities by category
                          const groupedActivities = activities.reduce((acc, activity) => {
                            const category = activity.activities?.[0]?.name || 'Other';
                            if (!acc[category]) {
                              acc[category] = [];
                            }
                            acc[category].push(activity);
                            return acc;
                          }, {});

                          // Create category tabs (without "All Activities")
                          const categoryTabs = Object.entries(groupedActivities)
                            .sort(([,a], [,b]) => b.length - a.length)
                            .map(([category, categoryActivities]) => ({
                              id: category,
                              label: category,
                              count: categoryActivities.length
                            }));


                          // Get activities to display based on active tab
                          const getDisplayActivities = () => {
                            return groupedActivities[activeActivityTab] || [];
                          };

                          return (
                            <div>
                              {/* Category Tabs - All visible side by side */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pb-4 mb-4 sm:mb-6">
                                {categoryTabs.map((tab) => (
                                  <button
                                    key={tab.id}
                                    onClick={() => setActiveActivityTab(activeActivityTab === tab.id ? null : tab.id)}
                                    className="flex items-center justify-center px-3 py-3 min-h-[60px] text-center transition-all duration-200 hover:scale-105 rounded-xl font-semibold text-xs"
                                    style={{
                                      backgroundColor: activeActivityTab === tab.id 
                                        ? '#ffffff' 
                                        : 'var(--surface)',
                                      color: activeActivityTab === tab.id 
                                        ? '#000000' 
                                        : 'var(--text-primary)',
                                      borderWidth: '1px',
                                      borderColor: activeActivityTab === tab.id 
                                        ? '#e5e7eb' 
                                        : 'var(--border)',
                                      boxShadow: activeActivityTab === tab.id 
                                        ? '0 3px 8px rgba(0, 0, 0, 0.15)' 
                                        : '0 1px 4px rgba(0, 0, 0, 0.08)'
                                    }}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              {/* Activities Grid - Only show when a tab is selected */}
                              {activeActivityTab && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {getDisplayActivities().map((activity, index) => (
                                    <div
                                      key={index}
                                      onClick={() => {
                                        if (activity.id) {
                                          navigate(`/parks/${parkCode}/activity/${activity.id}`, {
                                            state: { from: 'park-details' }
                                          });
                                        }
                                      }}
                                      className="p-4 rounded-xl transition hover:-translate-y-0.5 cursor-pointer"
                                      style={{
                                        backgroundColor: 'var(--surface-hover)',
                                        borderWidth: '1px',
                                        borderColor: 'var(--border)'
                                      }}
                                    >
                                      <h4 className="font-semibold mb-2 text-sm"
                                        style={{ color: 'var(--text-primary)' }}
                                      >
                                        {activity.title || activity.name}
                                      </h4>
                                      {activity.shortDescription && (
                                        <div 
                                          className="text-xs leading-relaxed mb-2"
                                          style={{ color: 'var(--text-secondary)' }}
                                          dangerouslySetInnerHTML={{
                                            __html: processHtmlContent(activity.shortDescription)
                                          }}
                                        />
                                      )}
                                      <div className="flex items-center gap-4 text-xs"
                                        style={{ color: 'var(--text-tertiary)' }}
                                      >
                                        {activity.duration && (
                                          <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {activity.duration}
                                          </span>
                                        )}
                                        {activity.season && activity.season.length > 0 && (
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {activity.season.join(', ')}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No activities listed
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'camping' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Camping
                      </h2>
                      {campgrounds && campgrounds.length > 0 ? (
                        <div className="space-y-4">
                          {campgrounds.map((campground, index) => (
                            <div
                              key={index}
                              className="p-6 rounded-xl"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <h3 className="text-lg font-semibold mb-2"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {campground.name}
                              </h3>
                              <p className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {campground.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No campgrounds information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'facilities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Facilities & Amenities
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { icon: Wifi, label: 'Visitor Center', available: true },
                          { icon: Tent, label: 'Camping', available: campgrounds?.length > 0 },
                          { icon: Utensils, label: 'Food Services', available: true },
                          { icon: Phone, label: 'Cell Service', available: false }
                        ].map((facility, index) => {
                          const Icon = facility.icon;
                          return (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-4 rounded-xl"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {facility.label}
                              </span>
                              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                                facility.available
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {facility.available ? 'Available' : 'Limited'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'photos' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Photo Gallery
                      </h2>
                      {park.images && park.images.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {park.images.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => setSelectedImageIndex(index)}
                              className="aspect-video rounded-xl overflow-hidden group"
                            >
                              <OptimizedImage
                                src={image.url}
                                alt={image.altText || park.fullName}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No photos available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'alerts' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <AlertTriangle className="h-7 w-7" />
                        Park Alerts & Notices
                      </h2>
                      {alerts && alerts.length > 0 ? (
                        <div className="space-y-4">
                          {alerts.map((alert, index) => {
                            // Determine alert severity color
                            const getSeverityStyle = (category) => {
                              switch (category?.toLowerCase()) {
                                case 'danger':
                                case 'caution':
                                  return {
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    iconColor: '#ef4444'
                                  };
                                case 'warning':
                                  return {
                                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                                    borderColor: 'rgba(251, 191, 36, 0.3)',
                                    iconColor: '#fbbf24'
                                  };
                                case 'information':
                                case 'park closure':
                                  return {
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    borderColor: 'rgba(59, 130, 246, 0.3)',
                                    iconColor: '#3b82f6'
                                  };
                                default:
                                  return {
                                    backgroundColor: 'var(--surface-hover)',
                                    borderColor: 'var(--border)',
                                    iconColor: 'var(--text-secondary)'
                                  };
                              }
                            };

                            const severityStyle = getSeverityStyle(alert.category);

                            return (
                              <div
                                key={index}
                                className="p-5 rounded-xl"
                                style={{
                                  backgroundColor: severityStyle.backgroundColor,
                                  borderWidth: '1px',
                                  borderColor: severityStyle.borderColor
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <AlertTriangle 
                                    className="h-5 w-5 flex-shrink-0 mt-0.5" 
                                    style={{ color: severityStyle.iconColor }} 
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h3 className="text-lg font-semibold"
                                        style={{ color: 'var(--text-primary)' }}
                                      >
                                        {alert.title}
                                      </h3>
                                      {alert.category && (
                                        <span 
                                          className="text-xs px-2 py-1 rounded-full font-medium uppercase tracking-wide"
                                          style={{
                                            backgroundColor: severityStyle.iconColor + '33',
                                            color: severityStyle.iconColor
                                          }}
                                        >
                                          {alert.category}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm leading-relaxed mb-3"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {alert.description}
                                    </p>
                                    {alert.url && (
                                      <a
                                        href={alert.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                                        style={{ color: severityStyle.iconColor }}
                                      >
                                        More information →
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full mb-4"
                            style={{ backgroundColor: 'var(--surface-hover)' }}
                          >
                            <AlertTriangle className="h-8 w-8" style={{ color: 'var(--text-tertiary)' }} />
                          </div>
                          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                            No current alerts or notices for this park
                          </p>
                          <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
                            Check back later for updates on park conditions, closures, or safety information
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'reviews' && (
                    <div>
                      <ReviewSection parkCode={parkCode} parkName={park.fullName} />
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Sidebar */}
            <aside className="lg:w-96 flex-shrink-0 space-y-4 sm:space-y-6">
              {/* Weather Widget - Only show for authenticated users */}
              {!isPublicAccess && park.latitude && park.longitude && (
                <WeatherWidget
                  latitude={park.latitude}
                  longitude={park.longitude}
                  parkName={park.fullName}
                />
              )}

              {/* Location Card */}
              <div className="rounded-2xl p-4 sm:p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <MapPin className="h-5 w-5" />
                  Location
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {park.addresses?.[0]?.line1}<br />
                  {park.addresses?.[0]?.city}, {park.addresses?.[0]?.stateCode} {park.addresses?.[0]?.postalCode}
                </p>
                {park.latitude && park.longitude && (
                  <button
                    onClick={() => navigate('/map', { state: { park } })}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-primary)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <Navigation className="h-4 w-4" />
                    View on Map
                  </button>
                )}
              </div>


              {/* Plan Trip CTA - Only show for authenticated users */}
              {!isPublicAccess && (
                <div className="rounded-2xl p-4 sm:p-6 text-center backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <Mountain className="h-12 w-12 mx-auto mb-4 text-forest-400" />
                  <h3 className="text-xl font-semibold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Plan Your Visit
                  </h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Let AI create a personalized itinerary for {park.fullName}
                  </p>
                  <Button
                    onClick={() => navigate(`/plan-ai?park=${encodeURIComponent(park.parkCode)}&name=${encodeURIComponent(park.fullName)}`)}
                    variant="secondary"
                    size="lg"
                    icon={Calendar}
                  >
                    Plan with AI
                  </Button>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ParkDetailPage;
