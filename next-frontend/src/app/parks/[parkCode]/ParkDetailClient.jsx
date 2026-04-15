"use client";
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Heart, MapPin, Clock, DollarSign, Phone,
  Globe, Navigation, Info, Mountain, Camera, Tent, Utensils,
  Wifi, Calendar, Star, MapPinCheck, AlertTriangle,
  Shield, ExternalLink, Route, Monitor, Play, Car, ChevronRight,
  BookOpen, Download, FileText, Ticket, TrendingUp
} from '@components/icons';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useVisitedParks } from '@/hooks/useVisitedParks';
import { logParkView, logUserAction } from '@/utils/analytics';
import { processHtmlContent, htmlToPlainText } from '@/utils/htmlUtils';
import Header from '@/components/common/Header';
import OptimizedImage from '@/components/common/OptimizedImage';
import WeatherWidget from '@/components/park-details/WeatherWidget';
import ReviewSection from '@/components/park-details/ReviewSection';
import ShareButtons from '@/components/common/ShareButtons';
import PhotoLightbox from '@/components/common/PhotoLightbox';
import Button from '@/components/common/Button';
import blogService from '@/services/blogService';

const ParkDetailInner = ({ initialData, parkCode, relatedParks = [] }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const { addFavorite, removeFavorite, isParkFavorited, refreshFavorites } = useFavorites();
  const { isParkVisited, markAsVisited, removeVisited, markingAsVisited, removingVisited } = useVisitedParks();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'activities', label: 'Activities', icon: Mountain },
    { id: 'camping', label: 'Camping', icon: Tent },
    { id: 'places', label: 'Places', icon: MapPinCheck },
    { id: 'tours', label: 'Tours', icon: Route },
    { id: 'parking', label: 'Parking', icon: Car },
    { id: 'facilities', label: 'Facilities', icon: Utensils },
    { id: 'brochures', label: 'Brochures', icon: BookOpen },
    { id: 'permits', label: 'Permits', icon: Ticket },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'videos', label: 'Videos', icon: Play },
    { id: 'webcams', label: 'Webcams', icon: Monitor },
    { id: 'reviews', label: 'Reviews', icon: Star }
  ];
  const validTabIds = tabs.map((tab) => tab.id);
  const requestedTab = searchParams.get('tab');
  const activeTab = validTabIds.includes(requestedTab) ? requestedTab : 'overview';
  const [activeActivityTab, setActiveActivityTab] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [savingPark, setSavingPark] = useState(false);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const [parkGuides, setParkGuides] = useState({ guide: null, astro: null });
  const tabScrollRef = useRef(null);

  const { park, alerts } = initialData;

  // Lazy-loading hook for tab data
  const useTabData = (tabParkCode, endpoint, enabled) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (!enabled || data !== null) return;
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost'
          ? 'http://localhost:5001/api'
          : 'https://trailverse.onrender.com/api');
      fetch(`${apiUrl}/parks/${tabParkCode}/${endpoint}`)
        .then(res => res.json())
        .then(json => { setData(json.data || []); setLoading(false); })
        .catch(() => { setData([]); setLoading(false); });
    }, [tabParkCode, endpoint, enabled, data]);

    return { data, loading };
  };

  // Use the NPS park code (e.g. "arch") for API calls, not the URL slug (e.g. "arches-national-park")
  const npsParkCode = park?.parkCode || parkCode;

  const { data: activities, loading: activitiesLoading } = useTabData(npsParkCode, 'activities', activeTab === 'activities');
  const { data: campgrounds, loading: campgroundsLoading } = useTabData(npsParkCode, 'campgrounds', activeTab === 'camping');
  const { data: places, loading: placesLoading } = useTabData(npsParkCode, 'places', activeTab === 'places');
  const { data: tours, loading: toursLoading } = useTabData(npsParkCode, 'tours', activeTab === 'tours');
  const { data: parkingLots, loading: parkingLoading } = useTabData(npsParkCode, 'parkinglots', activeTab === 'parking');
  const { data: webcams, loading: webcamsLoading } = useTabData(npsParkCode, 'webcams', activeTab === 'webcams');
  const { data: videos, loading: videosLoading } = useTabData(npsParkCode, 'videos', activeTab === 'videos');
  const { data: galleryPhotos, loading: galleryLoading } = useTabData(npsParkCode, 'gallery', activeTab === 'photos');
  const { data: facilities, loading: facilitiesLoading } = useTabData(npsParkCode, 'facilities', activeTab === 'facilities');
  const { data: brochureData, loading: brochuresLoading } = useTabData(npsParkCode, 'brochures', activeTab === 'brochures');
  const { data: permits, loading: permitsLoading } = useTabData(npsParkCode, 'permits', activeTab === 'permits');

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

  useEffect(() => {
    if (parkCode && park?.fullName) {
      blogService.getParkGuides(parkCode, park.fullName).then(setParkGuides);
    }
  }, [parkCode, park?.fullName]);

  const handleTabChange = (tabId) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tabId === 'overview') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tabId);
    }
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    if (tabId !== 'activities') {
      setActiveActivityTab(null);
    }
  };

  useEffect(() => {
    const tabsNode = tabScrollRef.current;
    if (!tabsNode) return;

    const updateIndicators = () => {
      const { scrollLeft, scrollWidth, clientWidth } = tabsNode;
      setCanScrollTabsLeft(scrollLeft > 8);
      setCanScrollTabsRight(scrollLeft + clientWidth < scrollWidth - 8);
    };

    updateIndicators();
    tabsNode.addEventListener('scroll', updateIndicators, { passive: true });
    window.addEventListener('resize', updateIndicators);

    return () => {
      tabsNode.removeEventListener('scroll', updateIndicators);
      window.removeEventListener('resize', updateIndicators);
    };
  }, []);

  useEffect(() => {
    const tabsNode = tabScrollRef.current;
    const activeButton = tabsNode?.querySelector(`[data-tab-id="${activeTab}"]`);
    if (!tabsNode || !activeButton) return;

    activeButton.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }, [activeTab]);

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
        logUserAction('visited_removed', park?.fullName);
      } else {
        await markAsVisited(
          parkCode,
          null,
          null,
          park?.fullName,
          park?.images?.[0]?.url || '',
          null
        );
        logUserAction('visited_added', park?.fullName);
      }
    } catch (error) {
      console.error('Error toggling visited status:', error);
    }
  };

  const nearbySections = [
    {
      id: 'lodging',
      label: 'Lodging',
      description: 'Hotels, lodges, and stays near the park',
      icon: Tent,
      query: 'lodging'
    },
    {
      id: 'restaurant',
      label: 'Food',
      description: 'Restaurants and quick stops nearby',
      icon: Utensils,
      query: 'restaurants'
    },
    {
      id: 'gas_station',
      label: 'Gas',
      description: 'Fuel stops before or after your visit',
      icon: Car,
      query: 'gas stations'
    },
    {
      id: 'tourist_attraction_park_specific',
      label: 'Attractions',
      description: 'Nearby points of interest and landmarks',
      icon: Camera,
      query: 'attractions'
    },
  ];

  const createNearbySearchLink = (query) => {
    const latitude = park?.latitude;
    const longitude = park?.longitude;
    const destination = `${query} near ${park?.fullName || 'this park'}`;
    const coords = latitude && longitude ? `&query=${encodeURIComponent(destination)}&center=${latitude},${longitude}` : `&query=${encodeURIComponent(destination)}`;
    return `https://www.google.com/maps/search/?api=1${coords}`;
  };

  const createParkGoogleMapsLink = () => {
    const parkAddress = park?.addresses?.[0];
    const parkLocation = [
      park?.fullName,
      parkAddress?.city,
      parkAddress?.stateCode
    ].filter(Boolean).join(', ');

    if (parkLocation) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parkLocation)}`;
    }

    if (park?.latitude && park?.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${park.latitude},${park.longitude}`)}`;
    }

    return null;
  };

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
                    <h1 className="text-3xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-[1.05] drop-shadow-lg"
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

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
                      <Button
                        onClick={handleSavePark}
                        disabled={savingPark}
                        variant={isSaved ? 'danger' : 'secondary'}
                        size="sm"
                        icon={Heart}
                        className="backdrop-blur w-full sm:w-auto sm:flex-shrink-0"
                        style={{
                          backgroundColor: isSaved ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          borderWidth: '1px',
                          borderColor: isSaved ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.3)'
                        }}
                        title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <span className="truncate">{isSaved ? 'Favorited' : 'Favorite'}</span>
                      </Button>

                      <ShareButtons
                        url={typeof window !== 'undefined' ? window.location.href : `https://www.nationalparksexplorerusa.com/parks/${parkCode}`}
                        title={park.fullName}
                        description={park.description}
                        image={park.images?.[0]?.url}
                        type="park"
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
                    {htmlToPlainText(park.operatingHours?.[0]?.description) || 'Open year-round, 24 hours'}
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
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-tertiary)' }}>
                    Browse Park Details
                  </p>
                  {canScrollTabsRight && !canScrollTabsLeft && (
                    <span className="flex items-center gap-0.5 text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Scroll for more
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="relative">
                  {canScrollTabsLeft && (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 rounded-l-2xl"
                      style={{ background: 'linear-gradient(to right, var(--bg-primary), transparent)' }}
                    />
                  )}
                  {canScrollTabsRight && (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 rounded-r-2xl"
                      style={{ background: 'linear-gradient(to left, var(--bg-primary), transparent)' }}
                    />
                  )}
                  <div
                    ref={tabScrollRef}
                    role="tablist"
                    aria-label="Park detail sections"
                    className="flex gap-1 border-b pb-0 mb-4 sm:mb-6 overflow-x-auto park-tabs-scroll scroll-smooth"
                    style={{ borderColor: 'var(--border)' }}
                  >
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const showBadge = tab.id === 'alerts' && alerts && alerts.length > 0;
                    return (
                      <button
                        key={tab.id}
                        data-tab-id={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        type="button"
                        role="tab"
                        className="whitespace-nowrap flex-shrink-0 relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                        aria-selected={activeTab === tab.id}
                        style={{
                          backgroundColor: 'transparent',
                          borderBottomColor: activeTab === tab.id ? 'var(--text-primary)' : 'transparent',
                          color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                        }}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
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
                      </button>
                    );
                  })}
                  </div>
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
                        dangerouslySetInnerHTML={{ __html: processHtmlContent(park.description) }}
                      />

                      {park.weatherInfo && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Weather Information
                          </h3>
                          <p className="text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                            dangerouslySetInnerHTML={{ __html: processHtmlContent(park.weatherInfo) }}
                          />
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
                            dangerouslySetInnerHTML={{ __html: processHtmlContent(park.directionsInfo) }}
                          />
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

                      {park.entranceFees && park.entranceFees.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <DollarSign className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                            Entrance Fees
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {park.entranceFees.map((fee, index) => (
                              <div key={index} className="rounded-xl p-4"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                <div className="flex items-start justify-between gap-3 mb-1">
                                  <h4 className="font-semibold text-sm leading-snug"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {fee.title}
                                  </h4>
                                  {fee.cost !== undefined && fee.cost !== null && (
                                    <span className="text-base font-bold whitespace-nowrap"
                                      style={{ color: 'var(--accent-green, #22c55e)' }}
                                    >
                                      ${parseFloat(fee.cost).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                {fee.description && (
                                  <p className="text-xs leading-relaxed"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {htmlToPlainText(fee.description)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {park.operatingHours && park.operatingHours.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Clock className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                            Operating Hours
                          </h3>
                          <div className="space-y-3">
                            {park.operatingHours.map((hours, index) => (
                              <div key={index} className="rounded-xl p-4"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                <h4 className="font-semibold text-sm mb-2"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {hours.name}
                                </h4>
                                {hours.description && (
                                  <p className="text-sm leading-relaxed mb-3"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {htmlToPlainText(hours.description)}
                                  </p>
                                )}
                                {hours.standardHours && (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                                      hours.standardHours[day] && (
                                        <div key={day} className="flex justify-between">
                                          <span className="capitalize" style={{ color: 'var(--text-tertiary)' }}>
                                            {day.slice(0, 3)}
                                          </span>
                                          <span style={{ color: 'var(--text-secondary)' }}>
                                            {hours.standardHours[day]}
                                          </span>
                                        </div>
                                      )
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {park.entrancePasses && park.entrancePasses.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Shield className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                            Entrance Passes
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {park.entrancePasses.map((pass, index) => (
                              <div key={index} className="rounded-xl p-4"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                <div className="flex items-start justify-between gap-3 mb-1">
                                  <h4 className="font-semibold text-sm leading-snug"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {pass.title}
                                  </h4>
                                  {pass.cost !== undefined && pass.cost !== null && (
                                    <span className="text-base font-bold whitespace-nowrap"
                                      style={{ color: 'var(--accent-green, #22c55e)' }}
                                    >
                                      ${parseFloat(pass.cost).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                {pass.description && (
                                  <p className="text-xs leading-relaxed"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {htmlToPlainText(pass.description)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
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
                      {activitiesLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!activitiesLoading && activities !== null && activities.length > 0 ? (
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
                      ) : !activitiesLoading && (
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
                      {campgroundsLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!campgroundsLoading && campgrounds !== null && campgrounds.length > 0 ? (
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
                                {htmlToPlainText(campground.description)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : !campgroundsLoading && (
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
                      {facilitiesLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!facilitiesLoading && facilities && facilities.length > 0 && (() => {
                        // Group amenities by name
                        const grouped = {};
                        facilities.forEach(item => {
                          const key = item.name || 'Other';
                          if (!grouped[key]) grouped[key] = [];
                          grouped[key].push(item);
                        });
                        const amenityNames = Object.keys(grouped).sort();

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {amenityNames.map(name => (
                              <div
                                key={name}
                                className="p-4 rounded-xl"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                    {name}
                                  </span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' }}>
                                    {grouped[name].length} {grouped[name].length === 1 ? 'location' : 'locations'}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {grouped[name].slice(0, 3).map((place, i) => (
                                    <p key={i} className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                      {place.placeName}
                                    </p>
                                  ))}
                                  {grouped[name].length > 3 && (
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                      +{grouped[name].length - 3} more
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {!facilitiesLoading && (!facilities || facilities.length === 0) && (
                        <div className="text-center py-12">
                          <Utensils className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            No facility information available for this park.
                          </p>
                        </div>
                      )}
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
                      {galleryLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!galleryLoading && allPhotos.length > 0 ? (
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
                              <img
                                src={image.url}
                                alt={image.altText || park.fullName}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                              />
                            </button>
                          ))}
                        </div>
                      ) : !galleryLoading && (
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
                        {!videosLoading && videos && videos.length > 0 && (
                          <span className="text-base font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>
                            ({videos.length})
                          </span>
                        )}
                      </h2>
                      {videosLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!videosLoading && videos !== null && videos.length > 0 ? (
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
                      ) : !videosLoading && (
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
                      {placesLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!placesLoading && places !== null && places.length > 0 ? (
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
                                  <img
                                    src={place.images[0].url}
                                    alt={place.images[0].altText || place.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.parentElement.style.display = 'none'; }}
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
                                {htmlToPlainText(place.listingDescription || place.bodyText)?.substring(0, 300)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : !placesLoading && (
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
                      {toursLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!toursLoading && tours !== null && tours.length > 0 ? (
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
                                {htmlToPlainText(tour.description)?.substring(0, 400)}
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
                                            {htmlToPlainText(stop.significance)?.substring(0, 200) || htmlToPlainText(stop.description)?.substring(0, 200) || stop.assetName || 'Stop details not available'}
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
                      ) : !toursLoading && (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No tours information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'parking' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Parking Lots
                      </h2>
                      {parkingLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!parkingLoading && parkingLots !== null && parkingLots.length > 0 ? (
                        <div className="space-y-4">
                          {parkingLots.map((lot, index) => {
                            const accessibility = lot.accessibility;
                            const liveStatus = lot.liveStatus;
                            const fee = lot.fees?.[0];
                            return (
                              <div
                                key={lot.id || index}
                                className="p-6 rounded-xl"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)'
                                }}
                              >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <h3 className="text-lg font-semibold"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {lot.name}
                                  </h3>
                                  {liveStatus?.occupancy && (
                                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
                                      liveStatus.occupancy.toLowerCase() === 'light' ? 'bg-green-500/20 text-green-400' :
                                      liveStatus.occupancy.toLowerCase() === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                                      liveStatus.occupancy.toLowerCase() === 'full' ? 'bg-red-500/20 text-red-400' :
                                      'bg-blue-500/20 text-blue-400'
                                    }`}>
                                      {liveStatus.occupancy}
                                    </span>
                                  )}
                                </div>
                                {lot.description && (
                                  <p className="text-sm mb-3"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {htmlToPlainText(lot.description)}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-3 mt-3">
                                  {accessibility?.totalSpaces > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                                    >
                                      {accessibility.totalSpaces} spaces
                                    </span>
                                  )}
                                  {accessibility?.numberofAdaSpaces > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-400">
                                      {accessibility.numberofAdaSpaces} ADA
                                    </span>
                                  )}
                                  {accessibility?.numberOfOversizeVehicleSpaces > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                                    >
                                      {accessibility.numberOfOversizeVehicleSpaces} oversize
                                    </span>
                                  )}
                                  {fee && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                                    >
                                      ${fee.cost}
                                    </span>
                                  )}
                                  {liveStatus?.estimatedWaitTimeInMinutes > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-400">
                                      ~{liveStatus.estimatedWaitTimeInMinutes} min wait
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : !parkingLoading && (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No parking lot information available
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
                      {webcamsLoading && (
                        <div className="flex justify-center py-12">
                          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                      {!webcamsLoading && webcams !== null && webcams.length > 0 ? (
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
                              {cam.images?.[0]?.url && (
                                <div className="aspect-video rounded-lg overflow-hidden mb-4">
                                  <img
                                    src={cam.images[0].url}
                                    alt={cam.images[0].altText || cam.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                                  />
                                </div>
                              )}
                              <h3 className="text-lg font-semibold mb-2"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {cam.title}
                              </h3>
                              {cam.description && (
                                <p className="text-sm"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  {cam.description.replace(/<[^>]*>/g, '')}
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
                      ) : !webcamsLoading && (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No webcams information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'brochures' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
                        >
                          <BookOpen className="h-5 w-5" style={{ color: '#3b82f6' }} />
                        </div>
                        Brochures & Maps
                      </h2>

                      {brochuresLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--surface-hover)' }} />
                          ))}
                        </div>
                      ) : brochureData?.brochures?.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {brochureData.brochures.map((brochure, index) => (
                            <div
                              key={index}
                              className="rounded-xl overflow-hidden flex items-center gap-4 p-4"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <div className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                              >
                                <FileText className="h-5 w-5" style={{ color: '#3b82f6' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm leading-snug line-clamp-2"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {brochure.title}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>PDF</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <a
                                  href={brochure.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-80"
                                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View
                                </a>
                                <a
                                  href={brochure.url}
                                  download
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-80"
                                  style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                            style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                          >
                            <BookOpen className="h-8 w-8" style={{ color: '#3b82f6' }} />
                          </div>
                          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                            No brochures found
                          </p>
                          <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-tertiary)' }}>
                            Brochures may not be available for this park
                          </p>
                          {brochureData?.planYourVisitUrl && (
                            <a
                              href={brochureData.planYourVisitUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Visit NPS Plan Your Visit Page
                            </a>
                          )}
                        </div>
                      )}

                      {/* Always show NPS link at bottom */}
                      {brochureData?.brochures?.length > 0 && brochureData?.planYourVisitUrl && (
                        <div className="mt-6 text-center">
                          <a
                            href={brochureData.planYourVisitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View all resources on NPS.gov
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'permits' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                        >
                          <Ticket className="h-5 w-5" style={{ color: '#10b981' }} />
                        </div>
                        Permits & Reservations
                      </h2>

                      {permitsLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--surface-hover)' }} />
                          ))}
                        </div>
                      ) : permits?.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {permits.map((permit) => (
                            <div
                              key={permit.id}
                              className="rounded-xl overflow-hidden p-4"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)',
                                borderLeftWidth: '4px',
                                borderLeftColor: '#10b981'
                              }}
                            >
                              <div className="flex items-start gap-3 mb-3">
                                <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                                >
                                  <Ticket className="h-5 w-5" style={{ color: '#10b981' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-base leading-snug line-clamp-2"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {permit.name}
                                  </h3>
                                  {permit.type && (
                                    <span className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold mt-1"
                                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}
                                    >
                                      {permit.type}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {permit.description && (
                                <p className="text-sm leading-relaxed line-clamp-3 mb-3"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  {htmlToPlainText(permit.description)}
                                </p>
                              )}
                              {permit.facilityName && (
                                <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                                  {permit.facilityName}
                                </p>
                              )}
                              <a
                                href={permit.reservationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition hover:opacity-80 w-full sm:w-auto justify-center"
                                style={{ backgroundColor: '#10b981', color: 'white' }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Reserve on Recreation.gov
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                            style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                          >
                            <Ticket className="h-8 w-8" style={{ color: '#10b981' }} />
                          </div>
                          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                            No permits required
                          </p>
                          <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-tertiary)' }}>
                            This park may not require advance permits, or permit information is not available
                          </p>
                          <a
                            href={`https://www.nps.gov/${parkCode}/planyourvisit/permits.htm`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                            style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Check NPS Permits Page
                          </a>
                        </div>
                      )}

                      {permits?.length > 0 && (
                        <div className="mt-6 text-center">
                          <a
                            href="https://www.recreation.gov"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Data from Recreation.gov
                          </a>
                        </div>
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
                <div className="flex flex-wrap gap-3">
                  {park.latitude && park.longitude && (
                    <button
                      onClick={() => router.push(`/map?park=${encodeURIComponent(park.parkCode)}`)}
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

                  {createParkGoogleMapsLink() && (
                    <a
                      href={createParkGoogleMapsLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-primary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in Google Maps
                    </a>
                  )}
                </div>
              </div>

              {/* Around This Park */}
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
                  <MapPinCheck className="h-5 w-5" />
                  Around This Park
                </h3>
                <p className="text-sm mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Open nearby essentials in Google Maps without leaving your planning flow.
                </p>
                <p className="text-xs mb-4"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Results are from Google Maps and may not be up to date — especially in remote areas. Always verify hours, availability, and road conditions before heading out.
                </p>

                <div className="space-y-3">
                  {nearbySections.map((section) => {
                    const Icon = section.icon;

                    return (
                      <a
                        key={section.id}
                        href={createNearbySearchLink(section.query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl p-3 transition hover:-translate-y-0.5"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'var(--surface)' }}
                        >
                          <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {section.label}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {section.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] font-medium uppercase tracking-wider"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            Open
                          </span>
                          <ExternalLink className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* Park Guides Section — all guides together */}
              <div className="space-y-3">
                {/* Crowd Calendar */}
                <a
                  href={`/reports/when-to-go.html?park=${encodeURIComponent(park.parkCode?.toUpperCase())}`}
                  className="block rounded-2xl p-4 sm:p-5 transition hover:shadow-lg group"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
                    Crowd Calendar
                  </span>
                  <h4 className="text-base font-semibold mt-1 mb-1" style={{ color: 'var(--text-primary)' }}>
                    When to Visit {park.fullName?.replace(' National Park', '')}
                  </h4>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Month-by-month crowd levels, shoulder seasons, and permit info.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all" style={{ color: 'var(--accent-blue)' }}>
                    View Calendar <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </a>

                {/* Blog Guide */}
                {parkGuides.guide && (
                  <a
                    href={`/blog/${parkGuides.guide.slug}`}
                    className="block rounded-2xl p-4 sm:p-5 transition hover:shadow-lg group"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
                      Complete Guide
                    </span>
                    <h4 className="text-base font-semibold mt-1 mb-1" style={{ color: 'var(--text-primary)' }}>
                      {parkGuides.guide.title}
                    </h4>
                    <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>
                      {parkGuides.guide.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all" style={{ color: 'var(--accent-blue)' }}>
                      Read Full Guide <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                )}

                {/* Astrophotography Guide */}
                {parkGuides.astro && (
                  <a
                    href={`/blog/${parkGuides.astro.slug}`}
                    className="block rounded-2xl p-4 sm:p-5 transition hover:shadow-lg group"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
                      Astrophotography
                    </span>
                    <h4 className="text-base font-semibold mt-1 mb-1" style={{ color: 'var(--text-primary)' }}>
                      {parkGuides.astro.title}
                    </h4>
                    <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>
                      {parkGuides.astro.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all" style={{ color: 'var(--accent-blue)' }}>
                      Read Astro Guide <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                )}
              </div>

              {/* Plan Trip CTA — below guides */}
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
                <Button
                  onClick={() => router.push(`/compare?park=${encodeURIComponent(park.parkCode)}`)}
                  variant="ghost"
                  size="md"
                  icon={TrendingUp}
                  className="mt-3"
                >
                  Compare with other parks
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>


      {/* Related Parks */}
      {relatedParks.length > 0 && (
        <section className="py-16 px-4 sm:px-6 lg:px-10" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-3 ring-1" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <Mountain className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
                  <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>More in {park.states}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>You Might Also Like</h2>
              </div>
              <Link
                href={`/explore?state=${encodeURIComponent(park.states?.split(',')[0]?.trim() || '')}`}
                className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline"
                style={{ color: 'var(--accent-green)' }}
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {relatedParks.map((rp, index) => {
                const slug = rp.fullName.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
                return (
                  <Link
                    key={rp.parkCode}
                    href={`/parks/${slug}`}
                    className="group block relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                    style={{ aspectRatio: '4/3', boxShadow: 'var(--shadow-lg)' }}
                  >
                    <Image
                      src={rp.images?.[0]?.url || '/og-image-trailverse.jpg'}
                      alt={rp.fullName}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MapPin className="h-3 w-3 text-white/70" />
                        <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{rp.states}</span>
                      </div>
                      <h3 className="text-base font-semibold text-white leading-tight">{rp.fullName}</h3>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 sm:hidden">
              <Link
                href={`/explore?state=${encodeURIComponent(park.states?.split(',')[0]?.trim() || '')}`}
                className="w-full inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                View All Parks in {park.states?.split(',')[0]?.trim()}
              </Link>
            </div>
          </div>
        </section>
      )}

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

export default function ParkDetailClient({ relatedParks, ...props }) {
  return (
    <Suspense>
      <ParkDetailInner {...props} relatedParks={relatedParks} />
    </Suspense>
  );
}
