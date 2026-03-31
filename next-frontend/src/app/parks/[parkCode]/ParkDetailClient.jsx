"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Heart, MapPin, Clock, DollarSign, Phone,
  Globe, Navigation, Info, Mountain, Camera, Tent, Utensils,
  Wifi, Calendar, Star, MapPinCheck, AlertTriangle,
  Shield, ExternalLink, Route, Monitor, Play
} from '@components/icons';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useVisitedParks } from '@/hooks/useVisitedParks';
import { logParkView, logUserAction } from '@/utils/analytics';
import { processHtmlContent } from '@/utils/htmlUtils';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import WeatherWidget from '@/components/park-details/WeatherWidget';
import ReviewSection from '@/components/park-details/ReviewSection';
import ShareButtons from '@/components/common/ShareButtons';
import PhotoLightbox from '@/components/common/PhotoLightbox';
import Button from '@/components/common/Button';

const ParkDetailClient = ({ initialData, parkCode }) => {
  const router = useRouter();
  const { isAuthenticated, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const { addFavorite, removeFavorite, isParkFavorited, refreshFavorites } = useFavorites();
  const { isParkVisited, markAsVisited, removeVisited, markingAsVisited, removingVisited } = useVisitedParks();

  const [activeTab, setActiveTab] = useState('overview');
  const [activeActivityTab, setActiveActivityTab] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [savingPark, setSavingPark] = useState(false);

  const { park, campgrounds, activities, alerts, places, tours, webcams, videos, galleryPhotos } = initialData;

  // Merge park.images with gallery photos for the Photos tab and lightbox
  const allPhotos = React.useMemo(() => {
    const parkImages = park?.images || [];
    const gallery = (galleryPhotos || []).map(p => ({
      url: p.url || p.fileUrl,
      altText: p.altText || p.title,
      caption: p.caption || p.description,
      credit: p.credit
    })).filter(p => p.url);
    const existingUrls = new Set(parkImages.map(i => i.url));
    return [...parkImages, ...gallery.filter(g => !existingUrls.has(g.url))];
  }, [park?.images, galleryPhotos]);

  useEffect(() => {
    if (park) {
      logParkView(parkCode, park.fullName, 'direct');
    }
  }, [park, parkCode]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'activities') {
      setActiveActivityTab(null);
    }
  };

  const isSaved = isParkFavorited(parkCode);
  const isVisited = isParkVisited(parkCode);

  const handleSavePark = async () => {
    if (!isAuthenticated) {
      showLoginPrompt('Log in to save parks to your favorites');
      return;
    }

    try {
      setSavingPark(true);
      if (isSaved) {
        await removeFavorite(parkCode);
        showToast('Removed from favorites', 'success');
        logUserAction('favorite_removed', `Park: ${park.fullName}`, isAuthenticated?.user?.id);
      } else {
        if (!park?.fullName) {
          showToast('Park data not loaded yet', 'error');
          return;
        }
        await addFavorite({
          parkCode,
          parkName: park.fullName,
          imageUrl: park.images?.[0]?.url || ''
        });
        showToast('Added to favorites', 'success');
        logUserAction('favorite_added', `Park: ${park.fullName}`, isAuthenticated?.user?.id);
      }
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.error === 'Park already in favorites') {
        showToast('Park is already in your favorites', 'info');
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
      showLoginPrompt('Log in to track parks you have visited');
      return;
    }

    try {
      if (isVisited) {
        await removeVisited(parkCode);
      } else {
        await markAsVisited(
          parkCode,
          null,
          null,
          park?.fullName,
          park?.images?.[0]?.url || '',
          null
        );
      }
    } catch (error) {
      console.error('Error toggling visited status:', error);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'activities', label: 'Activities', icon: Mountain },
    { id: 'camping', label: 'Camping', icon: Tent },
    { id: 'places', label: 'Places', icon: MapPinCheck },
    { id: 'tours', label: 'Tours', icon: Route },
    { id: 'facilities', label: 'Facilities', icon: Utensils },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'videos', label: 'Videos', icon: Play },
    { id: 'webcams', label: 'Webcams', icon: Monitor },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'reviews', label: 'Reviews', icon: Star }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Image */}
      <section className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <OptimizedImage
          src={park.images?.[selectedImageIndex]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

        {/* Navigation Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-4 sm:pt-6">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
            <Button
              onClick={() => router.back()}
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
              Back
            </Button>
          </div>
        </div>

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

                <div className="space-y-3 mb-3">
                  <div className="w-full">
                    <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg"
                      title={park.fullName}
                    >
                      {park.fullName}
                    </h1>
                  </div>

                  <div className="space-y-3">
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
                        title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
                      />

                      <ShareButtons
                        url={typeof window !== 'undefined' ? window.location.href : `https://www.nationalparksexplorerusa.com/parks/${parkCode}`}
                        title={park.fullName}
                        description={park.description}
                        image={park.images?.[0]?.url}
                        showPrint={false}
                      />
                    </div>
                  </div>
                </div>
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
                          const groupedActivities = activities.reduce((acc, activity) => {
                            const category = activity.activities?.[0]?.name || 'Other';
                            if (!acc[category]) {
                              acc[category] = [];
                            }
                            acc[category].push(activity);
                            return acc;
                          }, {});

                          const categoryTabs = Object.entries(groupedActivities)
                            .sort(([, a], [, b]) => b.length - a.length)
                            .map(([category, categoryActivities]) => ({
                              id: category,
                              label: category,
                              count: categoryActivities.length
                            }));

                          const getDisplayActivities = () => {
                            return groupedActivities[activeActivityTab] || [];
                          };

                          return (
                            <div>
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

                              {activeActivityTab && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {getDisplayActivities().map((activity, index) => (
                                    <div
                                      key={index}
                                      onClick={() => {
                                        if (activity.id) {
                                          router.push(`/parks/${parkCode}/activity/${activity.id}`);
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
                                          // Content sanitized by processHtmlContent utility
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
                        {allPhotos.length > 0 && (
                          <span className="text-base font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>
                            ({allPhotos.length})
                          </span>
                        )}
                      </h2>
                      {allPhotos.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {allPhotos.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setSelectedImageIndex(index);
                                setLightboxOpen(true);
                              }}
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

                  {activeTab === 'videos' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Videos
                        {videos && videos.length > 0 && (
                          <span className="text-base font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>
                            ({videos.length})
                          </span>
                        )}
                      </h2>
                      {videos && videos.length > 0 ? (
                        <div className="space-y-6">
                          {videos.map((video, index) => {
                            const durationMin = video.durationMs ? Math.round(video.durationMs / 60000) : null;
                            // Pick the best quality video URL from versions array
                            const videoUrl = video.versions?.sort((a, b) => (b.heightPixels || 0) - (a.heightPixels || 0))?.[0]?.url;
                            const captionUrl = video.captionFiles?.find(c => c.language === 'english')?.url;

                            return (
                              <div
                                key={video.id || index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                {videoUrl && (
                                  <video
                                    controls
                                    preload="metadata"
                                    className="w-full aspect-video bg-black"
                                    poster={video.splashImage?.url || undefined}
                                  >
                                    <source src={videoUrl} type="video/mp4" />
                                    {captionUrl && (
                                      <track kind="captions" src={captionUrl} srcLang="en" label="English" />
                                    )}
                                  </video>
                                )}
                                <div className="p-5">
                                  <h3 className="text-lg font-semibold mb-2"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {video.title}
                                  </h3>
                                  {video.description && (
                                    <p className="text-sm"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {video.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                                    {durationMin > 0 && (
                                      <span className="flex items-center gap-1 text-sm"
                                        style={{ color: 'var(--text-tertiary)' }}
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                        {durationMin} min
                                      </span>
                                    )}
                                    {video.credit && (
                                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        Credit: {video.credit}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No videos available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'places' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Places to Visit
                      </h2>
                      {places && places.length > 0 ? (
                        <div className="space-y-4">
                          {places.map((place, index) => (
                            <div
                              key={place.id || index}
                              className="p-6 rounded-xl"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              {place.images?.[0]?.url && (
                                <div className="aspect-video rounded-lg overflow-hidden mb-4">
                                  <OptimizedImage
                                    src={place.images[0].url}
                                    alt={place.images[0].altText || place.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <h3 className="text-lg font-semibold mb-2"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {place.title}
                              </h3>
                              <p className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {place.listingDescription || place.bodyText?.substring(0, 300)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No places information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'tours' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Tours
                      </h2>
                      {tours && tours.length > 0 ? (
                        <div className="space-y-4">
                          {tours.map((tour, index) => (
                            <div
                              key={tour.id || index}
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
                                {tour.title}
                              </h3>
                              <p className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {tour.description?.substring(0, 400)}
                              </p>
                              {tour.duration && (
                                <div className="flex items-center gap-1.5 text-sm mt-3"
                                  style={{ color: 'var(--text-tertiary)' }}
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{tour.duration}</span>
                                </div>
                              )}
                              {tour.stops && tour.stops.length > 0 && (
                                <div className="mt-4">
                                  <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    Stops ({tour.stops.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {tour.stops.map((stop, stopIndex) => (
                                      <div
                                        key={stop.id || stopIndex}
                                        className="flex items-start gap-3 p-3 rounded-lg"
                                        style={{
                                          backgroundColor: 'var(--surface)',
                                          borderWidth: '1px',
                                          borderColor: 'var(--border)'
                                        }}
                                      >
                                        <span className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                                          style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}
                                        >
                                          {stop.ordinal || stopIndex + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          {stop.title && (
                                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                              {stop.title}
                                            </p>
                                          )}
                                          <p className="text-sm" style={{ color: stop.title ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                            {stop.significance?.substring(0, 200) || stop.description?.substring(0, 200) || stop.assetName || 'Stop details not available'}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No tours information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'webcams' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Webcams
                      </h2>
                      {webcams && webcams.length > 0 ? (
                        <div className="space-y-4">
                          {webcams.map((cam, index) => (
                            <div
                              key={cam.id || index}
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
                                {cam.title}
                              </h3>
                              {cam.description && (
                                <p className="text-sm"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  {cam.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-3">
                                {cam.status && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    cam.status.toLowerCase() === 'active'
                                      ? 'bg-green-500/20 text-green-400'
                                      : 'bg-red-500/20 text-red-400'
                                  }`}>
                                    {cam.status}
                                  </span>
                                )}
                                {cam.url && (
                                  <a
                                    href={cam.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                                    style={{ color: 'var(--text-accent, #3b82f6)' }}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    View Live Feed
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No webcams information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'alerts' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(251, 146, 60, 0.15)' }}
                        >
                          <AlertTriangle className="h-5 w-5" style={{ color: '#f97316' }} />
                        </div>
                        Park Alerts & Notices
                      </h2>
                      {alerts && alerts.length > 0 ? (
                        <div className="space-y-4">
                          {alerts.map((alert, index) => {
                            const getSeverityConfig = (category) => {
                              switch (category?.toLowerCase()) {
                                case 'danger':
                                  return {
                                    bg: 'rgba(239, 68, 68, 0.06)',
                                    border: 'rgba(239, 68, 68, 0.2)',
                                    accent: '#ef4444',
                                    iconBg: 'rgba(239, 68, 68, 0.12)',
                                    icon: AlertTriangle,
                                    label: 'Danger'
                                  };
                                case 'caution':
                                  return {
                                    bg: 'rgba(251, 146, 60, 0.06)',
                                    border: 'rgba(251, 146, 60, 0.2)',
                                    accent: '#f97316',
                                    iconBg: 'rgba(251, 146, 60, 0.12)',
                                    icon: AlertTriangle,
                                    label: 'Caution'
                                  };
                                case 'park closure':
                                  return {
                                    bg: 'rgba(239, 68, 68, 0.04)',
                                    border: 'rgba(239, 68, 68, 0.15)',
                                    accent: '#dc2626',
                                    iconBg: 'rgba(239, 68, 68, 0.1)',
                                    icon: Shield,
                                    label: 'Park Closure'
                                  };
                                case 'information':
                                  return {
                                    bg: 'rgba(59, 130, 246, 0.04)',
                                    border: 'rgba(59, 130, 246, 0.15)',
                                    accent: '#3b82f6',
                                    iconBg: 'rgba(59, 130, 246, 0.1)',
                                    icon: Info,
                                    label: 'Information'
                                  };
                                default:
                                  return {
                                    bg: 'var(--surface-hover)',
                                    border: 'var(--border)',
                                    accent: 'var(--text-secondary)',
                                    iconBg: 'var(--surface-hover)',
                                    icon: Info,
                                    label: category || 'Notice'
                                  };
                              }
                            };

                            const config = getSeverityConfig(alert.category);
                            const SeverityIcon = config.icon;

                            return (
                              <div
                                key={index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: config.bg,
                                  borderWidth: '1px',
                                  borderColor: config.border,
                                  borderLeftWidth: '4px',
                                  borderLeftColor: config.accent
                                }}
                              >
                                <div className="p-5">
                                  <div className="flex items-start gap-4">
                                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: config.iconBg }}
                                    >
                                      <SeverityIcon className="h-5 w-5" style={{ color: config.accent }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-3 mb-1">
                                        <h3 className="text-base font-bold leading-snug"
                                          style={{ color: 'var(--text-primary)' }}
                                        >
                                          {alert.title}
                                        </h3>
                                      </div>
                                      {alert.category && (
                                        <span
                                          className="inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider mb-3"
                                          style={{
                                            backgroundColor: config.accent + '18',
                                            color: config.accent
                                          }}
                                        >
                                          {config.label}
                                        </span>
                                      )}
                                      <p className="text-sm leading-relaxed"
                                        style={{ color: 'var(--text-secondary)' }}
                                      >
                                        {alert.description}
                                      </p>
                                      {alert.url && (
                                        <a
                                          href={alert.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 text-sm font-semibold mt-3 hover:underline"
                                          style={{ color: config.accent }}
                                        >
                                          More information
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                            style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
                          >
                            <Shield className="h-8 w-8" style={{ color: '#22c55e' }} />
                          </div>
                          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                            No current alerts
                          </p>
                          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            This park has no active alerts or closures
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
              {/* Weather Widget */}
              {park.latitude && park.longitude && (
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
                    onClick={() => router.push('/map')}
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

              {/* Plan Trip CTA */}
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
                  onClick={() => router.push(`/plan-ai?park=${encodeURIComponent(park.parkCode)}&name=${encodeURIComponent(park.fullName)}`)}
                  variant="secondary"
                  size="lg"
                  icon={Calendar}
                >
                  Plan with AI
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />

      {/* Photo Lightbox */}
      {lightboxOpen && allPhotos.length > 0 && (
        <PhotoLightbox
          images={allPhotos}
          initialIndex={selectedImageIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default ParkDetailClient;
