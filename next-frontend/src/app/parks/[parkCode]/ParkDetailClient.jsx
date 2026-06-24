"use client";
import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Heart, MapPin, Clock, DollarSign, Phone,
  Globe, Navigation, Info, Mountain, Camera, Tent, Utensils,
  Wifi, Calendar, Star, MapPinCheck, AlertTriangle,
  Shield, ExternalLink, Route, Map as MapIcon, Monitor, Play, Car, ChevronRight,
  BookOpen, Download, FileText, Ticket, Landmark, Bus
} from '@components/icons';
import { parkToSlug } from '@/utils/parkSlug';
import { reportHref } from '@/lib/reportLinks';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useVisitedParks } from '@/hooks/useVisitedParks';
import { logCtaClick, logParkEngagement, logParkTabView, logParkView, logUserAction } from '@/utils/analytics';
import { getParkSearchSession } from '@/lib/parkSearchSession';
import { processHtmlContent, htmlToPlainText } from '@/utils/htmlUtils';
import Header from '@/components/common/Header';
import WeatherWidget from '@/components/park-details/WeatherWidget';
import GettingThereSection from '@/components/park-details/GettingThereSection';
import ReviewSection from '@/components/park-details/ReviewSection';
import ParkExploreTabs from '@/components/park-details/ParkExploreTabs';
import ParkOverviewVisitInfo from '@/components/park-details/ParkOverviewVisitInfo';
import ParkOverviewWeather from '@/components/park-details/ParkOverviewWeather';
import ParkReviewPromptDialog from '@/components/park-details/ParkReviewPromptDialog';
import ParkAlertsTab from '@/components/park-details/ParkAlertsTab';
import ParkPermitsTab from '@/components/park-details/ParkPermitsTab';
import ParkTabSpinner from '@/components/park-details/ParkTabSpinner';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ParkTabEmptyState from '@/components/park-details/ParkTabEmptyState';
import {
  hasSeenVisitedReviewPrompt,
  markVisitedReviewPromptSeen,
  reviewBelongsToUser,
} from '@/lib/reviewPromptStorage';
import ShareButtons from '@/components/common/ShareButtons';
import PhotoLightbox from '@/components/common/PhotoLightbox';
import Button from '@/components/common/Button';
import { getParkPlanVisitCta } from '@/lib/planAiWelcomeCopy';
import { hrefWithFrom, LANDING_RETURN_PATH } from '@/lib/returnNavigation';
import { useReturnNavigation } from '@/hooks/useReturnNavigation';
import { hasCrowdCalendar } from '@/lib/crowdCalendar';
import ParkPlanOverviewSection from '@/components/park-details/ParkPlanOverviewSection';
import ParkPlanningFaqSection from '@/components/park-details/ParkPlanningFaqSection';
import blogService from '@/services/blogService';
import { useParkExploreTabBundle, prefetchParkExploreTabs } from '@/hooks/useParkTabData';
import { useParkAlerts, useParkPermits, useParkReviews } from '@/hooks/useParkAuxiliaryTabs';
import { isExploreDataTab } from '@/lib/parkTabEndpoints';
import {
  alignPlanningFaqWithTabs,
  planningFaqTabContextFromExplore,
} from '@/lib/planningFaqTabs';
import { parkHasGtfs } from '@/lib/gtfsParks';
import {
  getTransitOperatingStyles,
  shouldHideRouteSchedules,
  shouldShowCatalogNotes,
  shouldShowTodayTransitDetails,
  shouldShowNpsScheduleLines,
  shouldShowOperatingDaysLabel,
} from '@/utils/transitOperatingUtils';
import {
  filterActivitiesByContent,
  filterPlacesByContent,
  getContentFilterForTab,
  getDisplayPlaceTags,
  isJunkPlaceTag,
  normalizePlaceTag,
} from '@/utils/parkExploreUtils';
import { getParkHoursQuickSummary } from '@/utils/parkHoursUtils';
import { getPrimaryEntranceFeeSummary } from '@/utils/parkVisitInfoUtils';
import { buildCoordinatesMapsUrl } from '@/utils/directionsUtils';
import { formatParkingFee } from '@/utils/parkingUtils';
import {
  getWebcamCta,
  getWebcamImage,
  getWebcamStatusDisplay,
} from '@/utils/webcamUtils';
import {
  buildAmenityTabs,
  filterFacilitiesByTab,
  getFacilityExcerpt,
  getFacilityImage,
} from '@/utils/amenityUtils';
const ParkDetailInner = ({
  initialData,
  parkCode,
  initialTab = 'overview',
  relatedParks = [],
  seoLeadLine = null,
  stateHubSlug = null,
  planningSnapshot = null,
  planningFaqItems = [],
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [urlSynced, setUrlSynced] = useState(false);
  useEffect(() => setUrlSynced(true), []);
  const requestedTab = urlSynced
    ? (searchParams.get('tab') || 'overview')
    : initialTab;
  const { backHref, backLabel } = useReturnNavigation({
    defaultHref: LANDING_RETURN_PATH,
    defaultLabel: 'TrailVerse',
  });
  const { isAuthenticated, user, showLoginPrompt } = useAuth();
  const { showToast } = useToast();
  const { addFavorite, removeFavorite, isParkFavorited, refreshFavorites } = useFavorites();
  const { isParkVisited, markAsVisited, removeVisited, markingAsVisited, removingVisited } = useVisitedParks();

  const { park } = initialData;
  const alertsFromSsr = initialData?.alerts;
  const permitsFromSsr = initialData?.permits;

  const npsParkCode = park?.parkCode || '';
  const showTransitTab = parkHasGtfs(npsParkCode);

  const allTabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'places', label: 'What to See', icon: MapPinCheck },
    { id: 'activities', label: 'Things to Do', icon: Mountain },
    { id: 'tours', label: 'Self-Guided Tours', icon: Route },
    { id: 'visitorcenters', label: 'Visitor Centers', icon: Landmark },
    { id: 'camping', label: 'Where to Stay', icon: Tent },
    { id: 'parking', label: 'Parking & Access', icon: Car },
    { id: 'facilities', label: 'Amenities', icon: Utensils },
    ...(showTransitTab ? [{ id: 'transit', label: 'Transit', icon: Bus }] : []),
    { id: 'brochures', label: 'Brochures', icon: BookOpen },
    { id: 'permits', label: 'Permits', icon: Ticket },
    { id: 'photos', label: 'Photos', icon: Camera },
    { id: 'videos', label: 'Videos', icon: Play },
    { id: 'webcams', label: 'Webcams', icon: Monitor },
    { id: 'reviews', label: 'Reviews', icon: Star },
  ], [showTransitTab]);
  const [activeActivityTab, setActiveActivityTab] = useState('All');
  const [expandedActivityList, setExpandedActivityList] = useState(() => new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [savingPark, setSavingPark] = useState(false);
  const [parkGuides, setParkGuides] = useState({ guide: null, astro: null });
  const [activeFacilityTab, setActiveFacilityTab] = useState('All');
  const [expandedFacilityList, setExpandedFacilityList] = useState(() => new Set());
  const [expandedRoutesByGtfsUrl, setExpandedRoutesByGtfsUrl] = useState(() => new Set());
  const [expandedStopsByRouteId, setExpandedStopsByRouteId] = useState(() => new Set());
  const [expandedPlaceTagSections, setExpandedPlaceTagSections] = useState(() => new Set());
  const [activePlacesTag, setActivePlacesTag] = useState('All');
  const [showReviewPromptDialog, setShowReviewPromptDialog] = useState(false);
  const [userHasReviewed, setUserHasReviewed] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const canonicalShareUrl = useMemo(
    () => `https://www.nationalparksexplorerusa.com/parks/${parkToSlug(park.fullName)}`,
    [park.fullName]
  );
  const [shareUrl, setShareUrl] = useState(canonicalShareUrl);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, [canonicalShareUrl, pathname, searchParams]);

  const npsParkCodeForApi = (park?.parkCode || '').toLowerCase();
  const tabIdSet = useMemo(() => new Set(allTabs.map((tab) => tab.id)), [allTabs]);

  const activeTab = useMemo(() => {
    if (!requestedTab) return 'overview';
    if (tabIdSet.has(requestedTab)) return requestedTab;
    return 'overview';
  }, [requestedTab, tabIdSet]);

  const tabIdsToLoad = useMemo(() => {
    const ids = [];
    if (isExploreDataTab(activeTab)) ids.push(activeTab);
    if (
      requestedTab
      && requestedTab !== activeTab
      && isExploreDataTab(requestedTab)
    ) {
      ids.push(requestedTab);
    }
    return ids;
  }, [activeTab, requestedTab]);

  const {
    cache: exploreCache,
    loadingByTabId,
    fetchedByTabId,
    errorByTabId,
  } = useParkExploreTabBundle(npsParkCodeForApi, tabIdsToLoad, { enabled: Boolean(npsParkCodeForApi) });

  const alertsQuery = useParkAlerts(
    npsParkCodeForApi,
    Boolean(npsParkCodeForApi),
    Array.isArray(alertsFromSsr) ? alertsFromSsr : undefined
  );
  const permitsQuery = useParkPermits(
    npsParkCodeForApi,
    Boolean(npsParkCodeForApi),
    Array.isArray(permitsFromSsr) ? permitsFromSsr : undefined
  );
  const reviewsQuery = useParkReviews(npsParkCodeForApi, Boolean(npsParkCodeForApi));

  const alerts = alertsQuery.isSuccess
    ? (alertsQuery.data ?? [])
    : (Array.isArray(alertsFromSsr) ? alertsFromSsr : []);
  const permits = permitsQuery.isSuccess
    ? (permitsQuery.data ?? [])
    : (Array.isArray(permitsFromSsr) ? permitsFromSsr : []);

  const alertCount = alerts.length;
  const permitCount = permits.length;
  const permitsReady = permitsQuery.isSuccess || Array.isArray(permitsFromSsr);

  useEffect(() => {
    if (reviewsQuery.isSuccess) {
      setReviewCount(reviewsQuery.data?.count ?? 0);
    }
  }, [reviewsQuery.isSuccess, reviewsQuery.data]);

  useEffect(() => {
    if (!npsParkCodeForApi) return undefined;

    const runPrefetch = () => prefetchParkExploreTabs(queryClient, npsParkCodeForApi);

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(runPrefetch, { timeout: 2500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(runPrefetch, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [npsParkCodeForApi, queryClient]);

  const tabs = allTabs;

  const faqTabContext = useMemo(
    () => planningFaqTabContextFromExplore({
      alertCount,
      permitCount,
      exploreCache,
      showTransitTab,
    }),
    [alertCount, permitCount, exploreCache, showTransitTab]
  );

  const visiblePlanningFaqItems = useMemo(() => {
    if (!permitsReady) return planningFaqItems;
    return alignPlanningFaqWithTabs(
      planningFaqItems,
      park,
      parkToSlug(park.fullName),
      faqTabContext,
      { permits },
    );
  }, [planningFaqItems, park, permits, permitsReady, faqTabContext]);

  const activities = exploreCache?.activities ?? null;
  const campgrounds = exploreCache?.campgrounds ?? null;
  const places = exploreCache?.places ?? null;
  const tours = exploreCache?.tours ?? null;
  const visitorCenters = exploreCache?.visitorcenters ?? null;
  const parkingLots = exploreCache?.parkinglots ?? null;
  const webcams = exploreCache?.webcams ?? null;
  const videos = exploreCache?.videos ?? null;
  const galleryPhotos = exploreCache?.gallery ?? null;
  const facilities = exploreCache?.facilities ?? null;
  const brochureData = exploreCache?.brochures ?? null;
  const transitData = exploreCache?.transit ?? null;

  const activitiesLoading = Boolean(loadingByTabId.activities);
  const campgroundsLoading = Boolean(loadingByTabId.camping);
  const placesLoading = Boolean(loadingByTabId.places);
  const toursLoading = Boolean(loadingByTabId.tours);
  const visitorCentersLoading = Boolean(loadingByTabId.visitorcenters);
  const parkingLoading = Boolean(loadingByTabId.parking);
  const webcamsLoading = Boolean(loadingByTabId.webcams);
  const videosLoading = Boolean(loadingByTabId.videos);
  const galleryLoading = Boolean(loadingByTabId.photos);
  const facilitiesLoading = Boolean(loadingByTabId.facilities);
  const brochuresLoading = Boolean(loadingByTabId.brochures);
  const transitLoading = Boolean(loadingByTabId.transit);

  const tabSettled = (tabId) => Boolean(fetchedByTabId[tabId] || errorByTabId[tabId]);
  const tabErrorMessage = (tabId) => (
    errorByTabId[tabId]
      ? 'Could not load this section right now. Please try again in a moment.'
      : undefined
  );
  const showTabSpinner = (tabId, explicitLoading = false) => {
    if (activeTab !== tabId) return false;
    if (explicitLoading) return true;
    return !tabSettled(tabId);
  };

  useEffect(() => {
    if (!reviewsQuery.isSuccess || !isAuthenticated || !user) {
      if (!reviewsQuery.isSuccess) setUserHasReviewed(false);
      return;
    }
    const list = reviewsQuery.data?.list || [];
    setUserHasReviewed(list.some((r) => reviewBelongsToUser(r, user)));
  }, [reviewsQuery.isSuccess, reviewsQuery.data, isAuthenticated, user]);

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
    const merged = [...parkImages, ...gallery.filter(g => !existingUrls.has(g.url))];

    const scorePhoto = (img) => {
      const haystack = `${img?.altText || ''} ${img?.caption || ''}`.toLowerCase();
      const url = String(img?.url || '').toLowerCase();

      // Push non-photo artifacts down the gallery (still keep them).
      const downrankPatterns = [
        /\bmap\b/,
        /\btopo(?:graphic)?\b/,
        /\bgeolog(?:y|ic|ical)\b/,
        /\bchart\b/,
        /\bdiagram\b/,
        /\bcross[-\s]?section\b/,
        /\blegend\b/,
        /\bplate\b/,
        /\bquadrangle\b/,
        /\busgs\b/,
        /\bscan(?:ned)?\b/,
        /\barchiv(?:al|e)\b/,
        /\bhistoric(?:al)?\b/,
        /\bblack\s*(?:&|and)\s*white\b/,
        /\bphoto\s*\d+\b/,
      ];
      if (downrankPatterns.some((re) => re.test(haystack))) return -50;
      if (/\.(pdf|tif|tiff)(\?|$)/.test(url)) return -50;

      let score = 0;
      const wowBoost = [
        /\bsunrise\b/,
        /\bsunset\b/,
        /\bgolden hour\b/,
        /\bmountain\b/,
        /\bpeak\b/,
        /\bglacier\b/,
        /\blake\b/,
        /\briver\b/,
        /\bwaterfall\b/,
        /\bcanyon\b/,
        /\boverlook\b/,
        /\bview\b/,
        /\bwildlife\b/,
        /\bbison\b/,
        /\belk\b/,
        /\bbear\b/,
        /\bmoose\b/,
      ];
      for (const re of wowBoost) {
        if (re.test(haystack)) score += 6;
      }

      if ((img?.altText || '').trim().length >= 8) score += 2;
      if ((img?.caption || '').trim().length >= 12) score += 1;
      if (/\.(jpe?g|png|webp)(\?|$)/.test(url)) score += 1;

      return score;
    };

    // Stable sort: keep original order inside score buckets.
    return merged
      .map((img, idx) => ({ img, idx, score: scorePhoto(img) }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .map((x) => x.img);
  }, [park?.images, galleryPhotos]);

  useEffect(() => {
    if (!park) return;
    const searchSession = getParkSearchSession();
    const code = (park.parkCode || parkCode || '').toLowerCase();
    const fromSearch =
      searchSession &&
      code &&
      (searchSession.clickedParkCode === code ||
        !searchSession.clickedParkCode);

    if (fromSearch) {
      logParkView(code, park.fullName, 'search', {
        searchTerm: searchSession.searchTerm,
        searchId: searchSession.searchId,
        searchSurface: searchSession.surface,
      });
    } else {
      logParkView(parkCode, park.fullName, 'direct');
    }
  }, [park, parkCode]);

  const lastTrackedTab = useRef(null);
  useEffect(() => {
    if (!park || !activeTab) return;
    const code = (park.parkCode || parkCode || '').toLowerCase();
    if (lastTrackedTab.current === activeTab) return;
    lastTrackedTab.current = activeTab;
    logParkTabView(code, activeTab);
  }, [park, parkCode, activeTab]);

  useEffect(() => {
    if (parkCode && park?.fullName) {
      blogService.getParkGuides(parkCode, park.fullName).then(setParkGuides);
    }
  }, [parkCode, park?.fullName]);

  const urlFilter = searchParams.get('filter') || 'all';
  const hoursQuickInfo = React.useMemo(() => getParkHoursQuickSummary(park), [park]);
  const entranceFeeQuickInfo = React.useMemo(
    () => getPrimaryEntranceFeeSummary(park?.entranceFees),
    [park?.entranceFees]
  );

  const scrollToExploreTabs = () => {
    requestAnimationFrame(() => {
      document.querySelector('[data-park-explore-tabs]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const handleTabChange = (tabId, options = {}) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tabId === 'overview') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tabId);
    }
    if (options.filter) {
      nextParams.set('filter', options.filter);
    } else if (!options.keepFilter) {
      nextParams.delete('filter');
    }
    if (options.write) {
      nextParams.set('write', '1');
    } else if (!options.keepWrite) {
      nextParams.delete('write');
    }
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    if (tabId !== 'overview') {
      scrollToExploreTabs();
    }
    if (tabId !== 'activities') {
      setActiveActivityTab('All');
    }
    if (tabId !== 'facilities') {
      setActiveFacilityTab('All');
    }
  };

  const handleFaqTabNavigate = (tabId) => {
    handleTabChange(tabId === 'overview' ? 'overview' : tabId);
  };

  useEffect(() => {
    if (!requestedTab || requestedTab === 'overview') return;
    scrollToExploreTabs();
  }, [requestedTab]);

  const scrollToOverviewSection = (sectionId) => {
    handleTabChange('overview');
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const openReviewWriteFlow = () => {
    handleTabChange('reviews', { write: true });
    requestAnimationFrame(() => {
      document.querySelector('[data-tab-id="reviews"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const dismissReviewPromptDialog = () => {
    markVisitedReviewPromptSeen(npsParkCode);
    setShowReviewPromptDialog(false);
    logUserAction('review_prompt_dismissed', park?.fullName);
  };

  const handleReviewPromptLeaveTip = () => {
    markVisitedReviewPromptSeen(npsParkCode);
    setShowReviewPromptDialog(false);
    logUserAction('review_prompt_accepted', park?.fullName);
    openReviewWriteFlow();
  };

  useEffect(() => {
    if (searchParams.get('write') !== '1') return;
    if (activeTab !== 'reviews') {
      handleTabChange('reviews', { keepFilter: true, write: true });
    }
  }, [searchParams.get('write')]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSaved = isParkFavorited(npsParkCode);
  const isVisited = isParkVisited(npsParkCode);

  const parkPlanCta = useMemo(
    () => getParkPlanVisitCta({
      user,
      isAuthenticated,
      parkName: park?.fullName,
      isVisited,
      isSaved,
    }),
    [user, isAuthenticated, park?.fullName, isVisited, isSaved]
  );

  const parkSlug = useMemo(() => parkToSlug(park?.fullName || ''), [park?.fullName]);

  const returnPath = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const faqItemsForDisplay = useMemo(() => {
    return visiblePlanningFaqItems.map((item) => {
      if (!item.href || /^https?:\/\//i.test(item.href)) return item;
      if (item.href.startsWith(`/parks/${parkSlug}`)) return item;
      return { ...item, href: hrefWithFrom(item.href, returnPath) };
    });
  }, [visiblePlanningFaqItems, parkSlug, returnPath]);

  const relatedParksViewAllHref = useMemo(() => {
    const qs = searchParams.toString();
    const returnPath = qs ? `${pathname}?${qs}` : pathname;
    const base = stateHubSlug
      ? `/parks/state/${stateHubSlug}`
      : `/explore?state=${encodeURIComponent(park.states?.split(',')[0]?.trim() || '')}`;
    return hrefWithFrom(base, returnPath);
  }, [pathname, searchParams, stateHubSlug, park.states]);

  const showCrowdCalendar = hasCrowdCalendar(park);

  const planAiHref = `/plan-ai?park=${encodeURIComponent(npsParkCode)}&name=${encodeURIComponent(park?.fullName || '')}`;

  const handlePlanWithTrailie = () => {
    logCtaClick({
      ctaId: 'park_overview_plan_trailie',
      label: parkPlanCta.button,
      surface: 'park_plan_overview',
      destination: planAiHref,
      parkCode: npsParkCode,
    });
    router.push(planAiHref);
  };

  const compareHref = `/compare?park=${encodeURIComponent(park.parkCode)}`;

  const handleSavePark = async () => {
    if (!isAuthenticated) {
      showLoginPrompt('Log in to save parks to your favorites');
      return;
    }

    try {
      setSavingPark(true);
      if (isSaved) {
        await removeFavorite(npsParkCode);
        showToast('Removed from favorites', 'success');
        logParkEngagement({ action: 'favorite_remove', parkCode: npsParkCode, parkName: park.fullName });
      } else {
        if (!park?.fullName) {
          showToast('Park data not loaded yet', 'error');
          return;
        }
        await addFavorite({
          parkCode: npsParkCode,
          parkName: park.fullName,
          imageUrl: park.images?.[0]?.url || ''
        });
        showToast('Added to favorites', 'success');
        logParkEngagement({ action: 'favorite_add', parkCode: npsParkCode, parkName: park.fullName });
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
        await removeVisited(npsParkCode);
        logParkEngagement({ action: 'visited_remove', parkCode: npsParkCode, parkName: park?.fullName });
      } else {
        await markAsVisited(
          npsParkCode,
          null,
          null,
          park?.fullName,
          park?.images?.[0]?.url || '',
          null
        );
        logParkEngagement({ action: 'visited_add', parkCode: npsParkCode, parkName: park?.fullName });
        if (
          !userHasReviewed &&
          !hasSeenVisitedReviewPrompt(npsParkCode)
        ) {
          setShowReviewPromptDialog(true);
          logUserAction('review_prompt_shown', park?.fullName);
        }
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

  const createParkGoogleMapsDirectionsLink = () => {
    if (park?.latitude && park?.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${park.latitude},${park.longitude}`)}`;
    }

    const parkAddress = park?.addresses?.[0];
    const parkLocation = [
      park?.fullName,
      parkAddress?.city,
      parkAddress?.stateCode,
    ].filter(Boolean).join(', ');

    if (!parkLocation) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parkLocation)}`;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Image */}
      <section className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <Image
          src={park.images?.[selectedImageIndex]?.url || '/background1.png'}
          alt={park.fullName}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

        {/* Navigation Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-4 sm:pt-6">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
            <Button
              onClick={() => router.push(backHref)}
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
              {backLabel}
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
                    <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-[1.05] drop-shadow-lg"
                      title={park.fullName}
                    >
                      {park.fullName}
                    </h2>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 lg:gap-3">
                    <Button
                      onClick={handleMarkVisited}
                      disabled={markingAsVisited || removingVisited}
                      variant={isVisited ? 'success' : 'secondary'}
                      size="sm"
                      icon={isVisited ? MapPinCheck : MapPin}
                      className="backdrop-blur w-full sm:w-auto shrink-0"
                      style={{
                        backgroundColor: isVisited ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 255, 255, 0.12)',
                        borderWidth: '1px',
                        borderColor: isVisited ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.35)',
                        color: '#fff',
                        opacity: (markingAsVisited || removingVisited) ? 0.6 : 1,
                      }}
                      title={isVisited ? 'Remove from visited' : 'Mark as visited'}
                    >
                      {isVisited ? 'Visited' : 'Mark as Visited'}
                    </Button>

                    <Button
                      onClick={handleSavePark}
                      disabled={savingPark}
                      variant={isSaved ? 'danger' : 'secondary'}
                      size="sm"
                      icon={Heart}
                      className="backdrop-blur w-full sm:w-auto shrink-0"
                      style={{
                        backgroundColor: isSaved ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.12)',
                        borderWidth: '1px',
                        borderColor: isSaved ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.35)',
                        color: '#fff',
                      }}
                      title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isSaved ? 'Favorited' : 'Favorite'}
                    </Button>

                    <ShareButtons
                      url={shareUrl}
                      title={park.fullName}
                      description={park.description}
                      image={park.images?.[0]?.url}
                      type="park"
                      showPrint={false}
                      heroOverlay
                    />
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8 sm:items-stretch">
                {/* Hours */}
                <div
                  className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform flex flex-col h-full"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Clock className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3
                      className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Hours
                    </h3>
                  </div>
                  <p
                    className="text-sm font-medium leading-snug line-clamp-2 flex-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {hoursQuickInfo.summary}
                  </p>
                  <div className="mt-auto pt-2 min-h-[1.25rem]">
                    {hoursQuickInfo.hasFullDetails ? (
                      <button
                        type="button"
                        onClick={() => scrollToOverviewSection('operating-hours')}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: 'var(--accent-green, #22c55e)' }}
                      >
                        View full hours
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Entrance Fee */}
                <div
                  className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform flex flex-col h-full"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <DollarSign className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3
                      className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Entrance Fee
                    </h3>
                  </div>
                  <p className="text-2xl font-bold flex-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {entranceFeeQuickInfo.price}
                  </p>
                  <div className="mt-auto pt-2 min-h-[1.25rem]">
                    {entranceFeeQuickInfo.subtitle ? (
                      <p className="text-xs line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                        {entranceFeeQuickInfo.subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Contact */}
                <div
                  className="rounded-2xl p-4 sm:p-5 backdrop-blur hover:-translate-y-0.5 transition-transform flex flex-col h-full"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Phone className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3
                      className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Contact
                    </h3>
                  </div>
                  <div className="flex-1 space-y-2">
                    {park.contacts?.phoneNumbers?.[0]?.phoneNumber ? (
                      <a
                        href={`tel:${park.contacts.phoneNumbers[0].phoneNumber}`}
                        className="text-sm font-medium transition block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {park.contacts.phoneNumbers[0].phoneNumber}
                      </a>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        No phone listed
                      </p>
                    )}
                  </div>
                  <div className="mt-auto pt-2 min-h-[1.25rem]">
                    {park.url ? (
                      <a
                        href={park.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-green)] hover:text-[var(--accent-green-dark)] hover:underline transition-colors"
                      >
                        <Globe className="h-3 w-3" />
                        <span>Official Website</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <ParkPlanOverviewSection
                parkName={park.fullName}
                parkCode={npsParkCode}
                snapshot={planningSnapshot}
                planCta={parkPlanCta}
                onPlan={handlePlanWithTrailie}
                compareHref={compareHref}
              />

              {tabs.length > 1 && (
              <ParkExploreTabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                alertCount={alerts?.length || 0}
                permitCount={permits.length}
                reviewCount={reviewCount}
              />
              )}

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
                      {seoLeadLine && (
                        <p
                          className="text-base leading-relaxed mb-4"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {seoLeadLine}
                        </p>
                      )}
                      <p className="text-base leading-relaxed mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                        dangerouslySetInnerHTML={{ __html: processHtmlContent(park.description) }}
                      />

                      <ParkOverviewWeather weatherInfo={park.weatherInfo} />

                      <ParkOverviewVisitInfo park={park} />

                    </div>
                  )}

                  {activeTab === 'activities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Things to Do
                      </h2>
                      {showTabSpinner('activities', activitiesLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!activitiesLoading && activities !== null && activities.length > 0 && (
                        (() => {
                          const filteredActivities = filterActivitiesByContent(activities, 'all');

                          const getActivityHref = (activity) => (
                            activity?.id ? `/parks/${parkCode}/activity/${activity.id}` : null
                          );

                          const renderActivityCard = (activity, index) => {
                            const href = getActivityHref(activity);
                            const img = activity?.images?.[0];
                            const title = activity?.title || activity?.name || 'Activity';
                            const description = htmlToPlainText(
                              activity?.shortDescription || activity?.longDescription || ''
                            )?.trim();
                            const category = activity?.activities?.[0]?.name;

                            const CardInner = (
                              <div
                                className="rounded-xl overflow-hidden transition hover:-translate-y-0.5 group"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {img?.url && (
                                  <div className="relative h-48 w-full">
                                    <Image
                                      src={img.url}
                                      alt={img.altText || title}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 720px"
                                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                                      onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                      }}
                                    />
                                    {img.credit && (
                                      <span className="absolute bottom-1 right-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                                        {img.credit}
                                      </span>
                                    )}
                                  </div>
                                )}

                                <div className="p-6">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <h3
                                      className="text-lg font-semibold"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {title}
                                    </h3>
                                    {href && (
                                      <span
                                        className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                                        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                                      >
                                        View details <ExternalLink className="h-3 w-3" />
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-3 mb-4">
                                    {category && (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'rgba(59,130,246,0.1)',
                                          color: 'var(--accent-blue, #3b82f6)',
                                        }}
                                      >
                                        {category}
                                      </span>
                                    )}
                                    {activity?.duration ? (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'var(--surface-elevated)',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        <Clock className="h-3 w-3" />
                                        {activity.duration}
                                      </span>
                                    ) : null}
                                    {activity?.season?.length > 0 ? (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'var(--surface-elevated)',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        <Calendar className="h-3 w-3" />
                                        {activity.season.join(', ')}
                                      </span>
                                    ) : null}
                                    {activity?.arePetsAllowed != null ? (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'var(--surface-elevated)',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        <span aria-hidden>🐾</span>
                                        {activity.arePetsAllowed ? 'Pets allowed' : 'No pets'}
                                      </span>
                                    ) : null}
                                  </div>

                                  {description && (
                                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                      {description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );

                            if (!href) {
                              return (
                                <div key={activity?.id || index}>
                                  {CardInner}
                                </div>
                              );
                            }

                            return (
                              <Link key={activity?.id || index} href={href} className="block">
                                {CardInner}
                              </Link>
                            );
                          };

                          const groupedActivities = filteredActivities.reduce((acc, activity) => {
                            const category = activity.activities?.[0]?.name || 'Other';
                            if (!acc[category]) {
                              acc[category] = [];
                            }
                            acc[category].push(activity);
                            return acc;
                          }, {});

                          const categoryTabs = [
                            { id: 'All', name: 'All', count: filteredActivities.length },
                            ...Object.entries(groupedActivities)
                              .sort(([, a], [, b]) => b.length - a.length)
                              .map(([category, categoryActivities]) => ({
                                id: category,
                                name: category,
                                count: categoryActivities.length,
                              })),
                          ];

                          const getDisplayActivities = () => {
                            if (!activeActivityTab || activeActivityTab === 'All') {
                              return filteredActivities;
                            }
                            return groupedActivities[activeActivityTab] || [];
                          };

                          const activityList = getDisplayActivities();
                          const showAllKey = `activities:${activeActivityTab}`;
                          const isExpanded = expandedActivityList.has(showAllKey);
                          const visibleActivities = isExpanded ? activityList : activityList.slice(0, 10);

                          return (
                            <div>
                              {categoryTabs.length > 1 ? (
                                <>
                                  <div className="flex flex-wrap gap-2 pb-4 mb-4 sm:mb-6">
                                    {categoryTabs.map((tab) => {
                                      const isActive = activeActivityTab === tab.id;
                                      return (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          onClick={() => setActiveActivityTab(tab.id)}
                                          className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition"
                                          style={{
                                            backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                                            color: 'var(--text-primary)',
                                            borderWidth: '1px',
                                            borderColor: isActive ? 'var(--text-tertiary)' : 'var(--border)',
                                            boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.10)' : 'none',
                                          }}
                                        >
                                          <span className="leading-snug">{tab.name}</span>
                                          <span
                                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                            style={{
                                              backgroundColor: isActive
                                                ? 'rgba(59, 130, 246, 0.12)'
                                                : 'var(--surface)',
                                              color: isActive
                                                ? 'var(--accent-blue, #3b82f6)'
                                                : 'var(--text-tertiary)',
                                              borderWidth: isActive ? '0px' : '1px',
                                              borderColor: 'var(--border)',
                                            }}
                                          >
                                            {tab.count}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {activityList.length > 10 && (
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        {isExpanded
                                          ? `Showing all ${activityList.length}.`
                                          : `Showing 10 of ${activityList.length}.`}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setExpandedActivityList((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(showAllKey)) next.delete(showAllKey);
                                            else next.add(showAllKey);
                                            return next;
                                          });
                                        }}
                                        className="text-xs font-semibold hover:underline whitespace-nowrap"
                                        style={{ color: 'var(--text-secondary)' }}
                                      >
                                        {isExpanded ? 'Show fewer' : `Show all (${activityList.length})`}
                                      </button>
                                    </div>
                                  )}

                                  <div className="space-y-6">
                                    {visibleActivities.map((activity, index) =>
                                      renderActivityCard(activity, `${activeActivityTab}-${index}`)
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-6">
                                  {filteredActivities.map((activity, index) =>
                                    renderActivityCard(activity, index)
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                      {!activitiesLoading && tabSettled('activities') && !(activities?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('activities')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'camping' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Where to Stay
                      </h2>
                      {showTabSpinner('camping', campgroundsLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!campgroundsLoading && campgrounds !== null && campgrounds.length > 0 && (
                        <div className="space-y-6">
                          {campgrounds.map((campground, index) => (
                            <div
                              key={index}
                              className="rounded-xl overflow-hidden"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              {/* Hero image */}
                              {campground.images?.[0]?.url && (
                                <div className="relative h-48 w-full">
                                  <Image
                                    src={campground.images[0].url}
                                    alt={campground.images[0].altText || campground.name}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 720px"
                                    className="object-cover"
                                    onError={(e) => {
                                      e.target.parentElement.style.display = 'none';
                                    }}
                                  />
                                  {campground.images[0].credit && (
                                    <span className="absolute bottom-1 right-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                                      {campground.images[0].credit}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="p-6">
                                {/* Name + reservation link */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {campground.name}
                                  </h3>
                                  {campground.reservationUrl && (
                                    <a
                                      href={campground.reservationUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                                    >
                                      Reserve <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>

                                {/* Quick stats row */}
                                <div className="flex flex-wrap gap-3 mb-4">
                                  {campground.campsites?.totalSites && (
                                    <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                      style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
                                      <Tent className="h-3 w-3" /> {campground.campsites.totalSites} sites
                                    </span>
                                  )}
                                  {(campground.numberOfSitesReservable > 0 || campground.numberOfSitesFirstComeFirstServe > 0) && (
                                    <>
                                      {Number(campground.numberOfSitesFirstComeFirstServe) > 0 && (
                                        <span className="text-xs px-2.5 py-1 rounded-full"
                                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue, #3b82f6)' }}>
                                          {campground.numberOfSitesFirstComeFirstServe} first-come
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {campground.fees?.[0]?.cost && (
                                    <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                      style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
                                      <DollarSign className="h-3 w-3" /> ${campground.fees[0].cost}/night
                                    </span>
                                  )}
                                </div>

                                {/* Description */}
                                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                  {htmlToPlainText(campground.description)}
                                </p>

                                {/* Site types */}
                                {campground.campsites && (
                                  <div className="flex flex-wrap gap-2 mb-4">
                                    {Number(campground.campsites.tentOnly) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        Tent: {campground.campsites.tentOnly}
                                      </span>
                                    )}
                                    {Number(campground.campsites.rvOnly) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        RV: {campground.campsites.rvOnly}
                                      </span>
                                    )}
                                    {Number(campground.campsites.electricalHookups) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        Electric hookups: {campground.campsites.electricalHookups}
                                      </span>
                                    )}
                                    {Number(campground.campsites.group) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        Group: {campground.campsites.group}
                                      </span>
                                    )}
                                    {Number(campground.campsites.horse) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        Horse: {campground.campsites.horse}
                                      </span>
                                    )}
                                    {Number(campground.campsites.walkBoatTo) > 0 && (
                                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                        Walk/Boat-to: {campground.campsites.walkBoatTo}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Amenities grid */}
                                {campground.amenities && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mb-4">
                                    {campground.amenities.potableWater?.[0] && campground.amenities.potableWater[0] !== 'No water' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>💧 Water: {campground.amenities.potableWater[0]}</span>
                                    )}
                                    {campground.amenities.potableWater?.[0] === 'No water' && (
                                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>💧 No potable water</span>
                                    )}
                                    {campground.amenities.toilets?.[0] && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🚻 {campground.amenities.toilets[0]}</span>
                                    )}
                                    {campground.amenities.showers?.[0] && campground.amenities.showers[0] !== 'None' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🚿 {campground.amenities.showers[0]}</span>
                                    )}
                                    {campground.amenities.cellPhoneReception === 'Yes' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>📶 Cell service</span>
                                    )}
                                    {campground.amenities.cellPhoneReception === 'No' && (
                                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>📶 No cell service</span>
                                    )}
                                    {campground.amenities.campStore === 'Yes' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🏪 Camp store</span>
                                    )}
                                    {campground.amenities.firewoodForSale === 'Yes' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🪵 Firewood for sale</span>
                                    )}
                                    {campground.amenities.dumpStation === 'Yes' && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🚛 Dump station</span>
                                    )}
                                    {campground.amenities.foodStorageLockers && campground.amenities.foodStorageLockers.startsWith('Yes') && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>🔒 Food lockers</span>
                                    )}
                                    {campground.amenities.staffOrVolunteerHostOnsite && campground.amenities.staffOrVolunteerHostOnsite.startsWith('Yes') && (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>👤 Host on-site</span>
                                    )}
                                  </div>
                                )}

                                {/* Operating hours / season */}
                                {campground.operatingHours?.[0]?.description && (
                                  <div className="flex items-start gap-2 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>{campground.operatingHours[0].description}</span>
                                  </div>
                                )}

                                {/* Reservation info */}
                                {campground.reservationInfo && (
                                  <div className="flex items-start gap-2 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>{htmlToPlainText(campground.reservationInfo)}</span>
                                  </div>
                                )}

                                {/* Accessibility */}
                                {campground.accessibility?.adaInfo && (
                                  <div className="flex items-start gap-2 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>{campground.accessibility.adaInfo}</span>
                                  </div>
                                )}

                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!campgroundsLoading && tabSettled('camping') && !(campgrounds?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('camping')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'facilities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Amenities
                      </h2>
                      {showTabSpinner('facilities', facilitiesLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!facilitiesLoading && facilities && facilities.length > 0 && (() => {
                        const { tabs: facilityTabs, topNames } = buildAmenityTabs(facilities);
                        const filteredFacilities = filterFacilitiesByTab(
                          facilities,
                          activeFacilityTab,
                          topNames
                        );
                        const showAllKey = `facilities:${activeFacilityTab}`;
                        const isExpanded = expandedFacilityList.has(showAllKey);
                        const visibleFacilities = isExpanded
                          ? filteredFacilities
                          : filteredFacilities.slice(0, 12);

                        return (
                          <>
                            {facilityTabs.length > 1 && (
                              <div className="flex flex-wrap gap-2 pb-4 mb-4 sm:mb-6">
                                {facilityTabs.map((tab) => {
                                  const isActive = activeFacilityTab === tab.id;
                                  return (
                                    <button
                                      key={tab.id}
                                      type="button"
                                      onClick={() => setActiveFacilityTab(tab.id)}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition"
                                      style={{
                                        backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                                        color: 'var(--text-primary)',
                                        borderWidth: '1px',
                                        borderColor: isActive ? 'var(--text-tertiary)' : 'var(--border)',
                                        boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.10)' : 'none',
                                      }}
                                    >
                                      <span className="leading-snug max-w-[14rem] truncate" title={tab.name}>
                                        {tab.name}
                                      </span>
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                        style={{
                                          backgroundColor: isActive
                                            ? 'rgba(59, 130, 246, 0.12)'
                                            : 'var(--surface)',
                                          color: isActive
                                            ? 'var(--accent-blue, #3b82f6)'
                                            : 'var(--text-tertiary)',
                                          borderWidth: isActive ? '0px' : '1px',
                                          borderColor: 'var(--border)',
                                        }}
                                      >
                                        {tab.count}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {filteredFacilities.length > 12 && (
                              <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  {isExpanded
                                    ? `Showing all ${filteredFacilities.length}.`
                                    : `Showing 12 of ${filteredFacilities.length}.`}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedFacilityList((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(showAllKey)) next.delete(showAllKey);
                                      else next.add(showAllKey);
                                      return next;
                                    });
                                  }}
                                  className="text-xs font-semibold hover:underline whitespace-nowrap"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  {isExpanded ? 'Show fewer' : `Show all (${filteredFacilities.length})`}
                                </button>
                              </div>
                            )}

                            <div className="space-y-6">
                              {visibleFacilities.map((facility, index) => {
                                const img = getFacilityImage(facility);
                                const excerpt = getFacilityExcerpt(facility);
                                const mapsUrl = buildCoordinatesMapsUrl(
                                  facility.latitude,
                                  facility.longitude,
                                  facility.placeName
                                );

                                const description = excerpt;

                                return (
                                  <div
                                    key={`${facility.placeId || facility.url || index}-${facility.name}`}
                                    className="rounded-xl overflow-hidden"
                                    style={{
                                      backgroundColor: 'var(--surface-hover)',
                                      borderWidth: '1px',
                                      borderColor: 'var(--border)',
                                    }}
                                  >
                                    {img?.url && (
                                      <div className="relative h-48 w-full">
                                        <Image
                                          src={img.url}
                                          alt={img.alt}
                                          fill
                                          sizes="(max-width: 768px) 100vw, 720px"
                                          className="object-cover"
                                          onError={(e) => {
                                            e.target.parentElement.style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    )}

                                    <div className="p-6">
                                      <div className="flex items-start justify-between gap-3 mb-3">
                                        <h3
                                          className="text-lg font-semibold"
                                          style={{ color: 'var(--text-primary)' }}
                                        >
                                          {facility.placeName || 'Location'}
                                        </h3>
                                        {facility.url && (
                                          <a
                                            href={facility.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                                            style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                                          >
                                            NPS page <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>

                                      <div className="flex flex-wrap gap-3 mb-4">
                                        <span
                                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full max-w-full truncate"
                                          style={{
                                            backgroundColor: 'rgba(59, 130, 246, 0.10)',
                                            color: 'var(--accent-blue, #3b82f6)',
                                          }}
                                          title={facility.name}
                                        >
                                          {facility.name}
                                        </span>
                                        {facility.placeType && facility.placeType !== 'General' && (
                                          <span
                                            className="text-xs px-2.5 py-1 rounded-full"
                                            style={{
                                              backgroundColor: 'var(--surface-elevated)',
                                              color: 'var(--text-secondary)',
                                            }}
                                          >
                                            {facility.placeType}
                                          </span>
                                        )}
                                      </div>

                                      {description && (
                                        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                          {description}
                                        </p>
                                      )}

                                      {mapsUrl && (
                                        <a
                                          href={mapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                                          style={{ color: 'var(--accent-blue, #3b82f6)' }}
                                        >
                                          <MapPin className="h-3.5 w-3.5" />
                                          Get directions
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                      {!facilitiesLoading && tabSettled('facilities') && !(facilities?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('facilities')} />
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
                      {(showTabSpinner('photos', galleryLoading && allPhotos.length === 0)) && (
                        <ParkTabSpinner />
                      )}
                      {allPhotos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {allPhotos.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setSelectedImageIndex(index);
                                setLightboxOpen(true);
                              }}
                              className="relative aspect-video rounded-xl overflow-hidden group"
                            >
                              <Image
                                src={image.url}
                                alt={image.altText || park.fullName}
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                className="object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {!galleryLoading && tabSettled('photos') && allPhotos.length === 0 && (
                        <ParkTabEmptyState message={tabErrorMessage('photos')} />
                      )}
                      {galleryLoading && allPhotos.length > 0 && (
                        <p className="text-center text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                          Loading more photos…
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
                      {showTabSpinner('videos', videosLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!videosLoading && videos !== null && videos.length > 0 && (
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
                      )}
                      {!videosLoading && tabSettled('videos') && !(videos?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('videos')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'places' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        What to See
                      </h2>
                      {showTabSpinner('places', placesLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!placesLoading && places !== null && places.length > 0 && (
                        (() => {
                          const renderPlaceCard = (place, index) => {
                            const description = htmlToPlainText(
                              place.listingDescription || place.bodyText || ''
                            )?.trim();
                            const displayTags = getDisplayPlaceTags(place.tags, park);

                            return (
                              <div
                                key={place.id || index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {place.images?.[0]?.url && (
                                  <div className="relative h-48 w-full">
                                    <Image
                                      src={place.images[0].url}
                                      alt={place.images[0].altText || place.title}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 720px"
                                      className="object-cover"
                                      onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                      }}
                                    />
                                    {place.images[0].credit && (
                                      <span className="absolute bottom-1 right-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                                        {place.images[0].credit}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="p-6">
                                  <h3
                                    className="text-lg font-semibold mb-3"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {place.title}
                                  </h3>
                                  {description && (
                                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                      {description}
                                    </p>
                                  )}
                                  {displayTags.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                      {displayTags.map((tag, i) => (
                                        <span
                                          key={i}
                                          className="text-xs px-2.5 py-1 rounded-full"
                                          style={{
                                            backgroundColor: 'var(--surface-elevated)',
                                            color: 'var(--text-secondary)',
                                          }}
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          };

                          const tagCounts = new Map();
                          const placesByTag = new Map();
                          const untagged = [];

                          places.forEach((place) => {
                            const tags = Array.isArray(place.tags)
                              ? place.tags.map(normalizePlaceTag).filter((t) => t && !isJunkPlaceTag(t, park))
                              : [];
                            if (tags.length === 0) {
                              untagged.push(place);
                              return;
                            }
                            tags.forEach((tag) => {
                              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                              if (!placesByTag.has(tag)) placesByTag.set(tag, []);
                              placesByTag.get(tag).push(place);
                            });
                          });

                          const topTags = [...tagCounts.entries()]
                            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                            .slice(0, 10)
                            .map(([tag]) => tag);

                          const placeTabs = [
                            { id: 'All', name: 'All', count: places.length },
                            ...topTags.map((tag) => ({ id: tag, name: tag, count: tagCounts.get(tag) || 0 })),
                            ...(untagged.length ? [{ id: 'Other', name: 'Other', count: untagged.length }] : []),
                          ];

                          const getPlacesForActiveTag = () => {
                            if (!activePlacesTag || activePlacesTag === 'All') return places;
                            if (activePlacesTag === 'Other') return untagged;
                            return placesByTag.get(activePlacesTag) || [];
                          };

                          return (
                            <div>
                              {placeTabs.length > 1 ? (
                                <>
                                  <div className="flex flex-wrap gap-2 pb-4 mb-4 sm:mb-6">
                                    {placeTabs.map((tab) => {
                                      const isActive = activePlacesTag === tab.id;
                                      return (
                                        <button
                                          key={tab.id}
                                          onClick={() => setActivePlacesTag(tab.id)}
                                          className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition"
                                          style={{
                                            backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                                            color: 'var(--text-primary)',
                                            borderWidth: '1px',
                                            borderColor: isActive ? 'var(--text-tertiary)' : 'var(--border)',
                                            boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.10)' : 'none',
                                          }}
                                        >
                                          <span className="leading-snug">
                                            {tab.name}
                                          </span>
                                          <span
                                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                            style={{
                                              backgroundColor: isActive ? 'rgba(59, 130, 246, 0.12)' : 'var(--surface)',
                                              color: isActive ? 'var(--accent-blue, #3b82f6)' : 'var(--text-tertiary)',
                                              borderWidth: isActive ? '0px' : '1px',
                                              borderColor: 'var(--border)',
                                            }}
                                          >
                                            {tab.count}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {(() => {
                                    const list = getPlacesForActiveTag();
                                    const showAllKey = `places:${activePlacesTag}`;
                                    const isExpanded = expandedPlaceTagSections.has(showAllKey);
                                    const visible = isExpanded ? list : list.slice(0, 10);

                                    return (
                                      <div>
                                        {list.length > 10 && (
                                          <div className="flex items-center justify-between gap-3 mb-4">
                                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                              {isExpanded ? `Showing all ${list.length}.` : `Showing 10 of ${list.length}.`}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setExpandedPlaceTagSections((prev) => {
                                                  const next = new Set(prev);
                                                  if (next.has(showAllKey)) next.delete(showAllKey);
                                                  else next.add(showAllKey);
                                                  return next;
                                                });
                                              }}
                                              className="text-xs font-semibold hover:underline whitespace-nowrap"
                                              style={{ color: 'var(--text-secondary)' }}
                                            >
                                              {isExpanded ? 'Show fewer' : `Show all (${list.length})`}
                                            </button>
                                          </div>
                                        )}

                                        <div className="space-y-6">
                                          {visible.map((place, index) => renderPlaceCard(place, `${activePlacesTag}-${index}`))}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : (
                                <div className="space-y-6">
                                  {places.map((place, index) => renderPlaceCard(place, index))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                      {!placesLoading && tabSettled('places') && !(places?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('places')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'visitorcenters' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <Landmark className="h-6 w-6" />
                        Visitor Centers
                      </h2>
                      {showTabSpinner('visitorcenters', visitorCentersLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!visitorCentersLoading && visitorCenters !== null && visitorCenters.length > 0 && (
                        <div className="space-y-6">
                          {visitorCenters.map((center, index) => {
                            const img = center.images?.[0];
                            const description = htmlToPlainText(center.description || '')?.trim();
                            const hoursBlock = center.operatingHours?.[0];
                            const hoursDesc = hoursBlock?.description?.trim();
                            const standardHours = hoursBlock?.standardHours;
                            const hoursValues = standardHours ? Object.values(standardHours) : [];
                            const uniformHours =
                              hoursValues.length > 0 && new Set(hoursValues).size === 1
                                ? hoursValues[0]
                                : null;
                            const mapsUrl = buildCoordinatesMapsUrl(
                              center.latitude,
                              center.longitude,
                              center.name
                            );

                            return (
                              <div
                                key={center.id || index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {img?.url && (
                                  <div className="relative h-48 w-full">
                                    <Image
                                      src={img.url}
                                      alt={img.altText || center.name}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 720px"
                                      className="object-cover"
                                      onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                      }}
                                    />
                                    {img.credit && (
                                      <span className="absolute bottom-1 right-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                                        {img.credit}
                                      </span>
                                    )}
                                  </div>
                                )}

                                <div className="p-6">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                      {center.name}
                                    </h3>
                                    {center.url && (
                                      <a
                                        href={center.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                                        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                                      >
                                        NPS page <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-3 mb-4">
                                    {center.contacts?.phoneNumbers?.[0]?.phoneNumber && (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'var(--surface-elevated)',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        <Phone className="h-3 w-3" />
                                        {center.contacts.phoneNumbers[0].phoneNumber}
                                      </span>
                                    )}
                                    {(uniformHours || hoursDesc) && (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'var(--surface-elevated)',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        <Clock className="h-3 w-3" />
                                        {uniformHours && uniformHours !== 'Closed'
                                          ? uniformHours
                                          : hoursDesc}
                                      </span>
                                    )}
                                    {center.isPassportStampLocation && (
                                      <span
                                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                                        style={{
                                          backgroundColor: 'rgba(59,130,246,0.1)',
                                          color: 'var(--accent-blue, #3b82f6)',
                                        }}
                                      >
                                        <Star className="h-3 w-3" />
                                        Passport stamp
                                      </span>
                                    )}
                                  </div>

                                  {description && (
                                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                      {description}
                                    </p>
                                  )}

                                  {hoursDesc && uniformHours && hoursDesc !== uniformHours && (
                                    <div
                                      className="flex items-start gap-2 mb-4 text-xs"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                      <span>{hoursDesc}</span>
                                    </div>
                                  )}

                                  {mapsUrl && (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                                      style={{ color: 'var(--accent-blue, #3b82f6)' }}
                                    >
                                      <MapPin className="h-3.5 w-3.5" />
                                      Get directions
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!visitorCentersLoading && tabSettled('visitorcenters') && !(visitorCenters?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('visitorcenters')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'tours' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Self-Guided Tours
                      </h2>
                      {showTabSpinner('tours', toursLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!toursLoading && tours !== null && tours.length > 0 && (
                        <div className="space-y-6">
                          {tours.map((tour, index) => (
                            <div
                              key={tour.id || index}
                              className="rounded-xl overflow-hidden"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              {tour.images?.[0]?.crops?.[0]?.url && (
                                <div className="relative h-48 w-full">
                                  <Image
                                    src={tour.images[0].crops[0].url}
                                    alt={tour.images[0].altText || tour.title}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 720px"
                                    className="object-cover"
                                    onError={(e) => {
                                      e.target.parentElement.style.display = 'none';
                                    }}
                                  />
                                  {tour.images[0].credit && (
                                    <span className="absolute bottom-1 right-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                                      {tour.images[0].credit}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="p-6">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="text-lg font-semibold"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {tour.title}
                                </h3>
                                {tour.type && (
                                  <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-tertiary)' }}>
                                    {tour.type}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {htmlToPlainText(tour.description)?.substring(0, 400)}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 mt-3">
                                {(tour.durationMin || tour.durationMax) && (
                                  <div className="flex items-center gap-1.5 text-sm"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>
                                      {tour.durationMin && tour.durationMax && tour.durationMin !== tour.durationMax
                                        ? `${tour.durationMin}–${tour.durationMax} ${tour.durationUnit || 'h'}`
                                        : `${tour.durationMin || tour.durationMax} ${tour.durationUnit || 'h'}`}
                                    </span>
                                  </div>
                                )}
                                {!tour.durationMin && !tour.durationMax && tour.duration && (
                                  <div className="flex items-center gap-1.5 text-sm"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>{tour.duration}</span>
                                  </div>
                                )}
                                {tour.activities && tour.activities.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {tour.activities.map((a, i) => (
                                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' }}>
                                        {a.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
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
                              </div>{/* close p-6 wrapper */}
                            </div>
                          ))}
                        </div>
                      )}
                      {!toursLoading && tabSettled('tours') && !(tours?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('tours')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'parking' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Parking &amp; Access
                      </h2>

                      <GettingThereSection park={park} showMapLinks className="mb-8" />

                      <h3 className="text-xl font-semibold mb-4"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Parking lots
                      </h3>

                      {showTabSpinner('parking', parkingLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!parkingLoading && parkingLots !== null && parkingLots.length > 0 && (
                        <div className="space-y-6">
                          {parkingLots.map((lot, index) => {
                            const accessibility = lot.accessibility;
                            const feeLabel = formatParkingFee(lot.fees?.[0]);
                            const hours = lot.operatingHours?.[0]?.standardHours;
                            const hoursDesc = lot.operatingHours?.[0]?.description;
                            const hoursValues = hours ? Object.values(hours) : [];
                            const uniformHours =
                              hoursValues.length > 0 && new Set(hoursValues).size === 1
                                ? hoursValues[0]
                                : null;
                            const mapsUrl = buildCoordinatesMapsUrl(
                              lot.latitude,
                              lot.longitude,
                              lot.name
                            );
                            const lotNote = String(lot.liveStatus?.description || '').trim() || null;

                            return (
                              <div
                                key={lot.id || index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {lot.images?.[0]?.url && (
                                  <div className="relative h-40 w-full">
                                    <Image
                                      src={lot.images[0].url}
                                      alt={lot.images[0].altText || lot.name}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 720px"
                                      className="object-cover"
                                      onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                <div className="p-6">
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <h3
                                      className="text-lg font-semibold"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {lot.name}
                                    </h3>
                                  </div>
                                  {lot.description && (
                                    <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                                      {htmlToPlainText(lot.description)}
                                    </p>
                                  )}
                                  {lotNote && (
                                    <p
                                      className="text-xs mb-3 leading-relaxed rounded-lg px-3 py-2"
                                      style={{
                                        color: 'var(--text-secondary)',
                                        backgroundColor: 'var(--surface)',
                                        borderWidth: '1px',
                                        borderColor: 'var(--border)',
                                      }}
                                    >
                                      {lotNote}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-3 mt-3">
                                    {accessibility?.totalSpaces > 0 && (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                                        style={{
                                          backgroundColor: 'var(--surface)',
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {accessibility.totalSpaces} spaces
                                      </span>
                                    )}
                                    {accessibility?.numberofAdaSpaces > 0 && (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                                        style={{
                                          backgroundColor: 'var(--accent-green-light)',
                                          color: 'var(--accent-green)',
                                        }}
                                      >
                                        {accessibility.numberofAdaSpaces} ADA
                                      </span>
                                    )}
                                    {accessibility?.numberOfOversizeVehicleSpaces > 0 && (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                                        style={{
                                          backgroundColor: 'var(--surface)',
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {accessibility.numberOfOversizeVehicleSpaces} oversize
                                      </span>
                                    )}
                                    {feeLabel && (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                                        style={{
                                          backgroundColor: 'var(--surface)',
                                          color: 'var(--text-primary)',
                                        }}
                                      >
                                        {feeLabel}
                                      </span>
                                    )}
                                  </div>
                                  {(uniformHours || hoursDesc) && (
                                    <div
                                      className="flex items-start gap-2 mt-3 text-xs"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                      <span>
                                        {uniformHours && uniformHours !== 'All Day'
                                          ? `Open ${uniformHours} daily`
                                          : uniformHours === 'All Day'
                                            ? 'Open 24 hours'
                                            : hoursDesc}
                                      </span>
                                    </div>
                                  )}
                                  {!uniformHours && hours && (
                                    <div
                                      className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {[
                                        'monday',
                                        'tuesday',
                                        'wednesday',
                                        'thursday',
                                        'friday',
                                        'saturday',
                                        'sunday',
                                      ].map((day) =>
                                        hours[day] && hours[day] !== 'Closed' ? (
                                          <div key={day} className="flex justify-between">
                                            <span className="capitalize">{day.slice(0, 3)}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>
                                              {hours[day]}
                                            </span>
                                          </div>
                                        ) : hours[day] === 'Closed' ? (
                                          <div key={day} className="flex justify-between">
                                            <span className="capitalize">{day.slice(0, 3)}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>
                                              Closed
                                            </span>
                                          </div>
                                        ) : null
                                      )}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-3">
                                    {mapsUrl && (
                                      <a
                                        href={mapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                                        style={{ color: 'var(--accent-blue, #3b82f6)' }}
                                      >
                                        <MapPin className="h-3 w-3" />
                                        Open in Maps
                                      </a>
                                    )}
                                    {lot.webcamUrl && (
                                      <a
                                        href={lot.webcamUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                                        style={{ color: 'var(--accent-blue, #3b82f6)' }}
                                      >
                                        <Camera className="h-3 w-3" />
                                        Live webcam
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!parkingLoading && tabSettled('parking') && !(parkingLots?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('parking')} />
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
                      {showTabSpinner('webcams', webcamsLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!webcamsLoading && webcams !== null && webcams.length > 0 && (
                        <div className="space-y-6">
                          {webcams.map((cam, index) => {
                            const img = getWebcamImage(cam);
                            const status = getWebcamStatusDisplay(cam);
                            const cta = getWebcamCta(cam);
                            const description = htmlToPlainText(cam.description || '')?.trim();
                            const mapsUrl = buildCoordinatesMapsUrl(
                              cam.latitude,
                              cam.longitude,
                              cam.title
                            );
                            const statusStyles =
                              status.tone === 'active'
                                ? {
                                    backgroundColor: 'var(--accent-green-light)',
                                    color: 'var(--accent-green)',
                                  }
                                : status.tone === 'inactive'
                                  ? {
                                      backgroundColor: 'rgba(239, 68, 68, 0.14)',
                                      color: 'var(--error-red)',
                                    }
                                  : {
                                      backgroundColor: 'var(--surface-elevated)',
                                      color: 'var(--text-secondary)',
                                    };

                            return (
                              <div
                                key={cam.id || index}
                                className="rounded-xl overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--surface-hover)',
                                  borderWidth: '1px',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {img?.url && (
                                  <div className="relative h-48 w-full">
                                    <Image
                                      src={img.url}
                                      alt={img.alt}
                                      fill
                                      sizes="(max-width: 768px) 100vw, 720px"
                                      className="object-cover"
                                      onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}

                                <div className="p-6">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <h3
                                      className="text-lg font-semibold"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {cam.title}
                                    </h3>
                                    {cta ? (
                                      <a
                                        href={cta.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                                        style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                                      >
                                        {cta.label} <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-3 mb-4">
                                    {status.label && (
                                      <span
                                        className="text-xs px-2.5 py-1 rounded-full font-medium"
                                        style={statusStyles}
                                      >
                                        {status.label}
                                      </span>
                                    )}
                                    {cam.isStreaming && status.isActive && (
                                      <span
                                        className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide"
                                        style={{
                                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                          color: 'var(--accent-blue, #3b82f6)',
                                        }}
                                      >
                                        Livestream
                                      </span>
                                    )}
                                  </div>

                                  {description && (
                                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                      {description}
                                    </p>
                                  )}

                                  {(status.message || cta?.hint) && (
                                    <p
                                      className="text-xs mb-4 leading-relaxed rounded-lg px-3 py-2"
                                      style={{
                                        color: 'var(--text-secondary)',
                                        backgroundColor: 'var(--surface)',
                                        borderWidth: '1px',
                                        borderColor: 'var(--border)',
                                      }}
                                    >
                                      {status.message || cta.hint}
                                    </p>
                                  )}

                                  {cam.credit && (
                                    <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                                      {cam.credit}
                                    </p>
                                  )}

                                  {mapsUrl && (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                                      style={{ color: 'var(--accent-blue, #3b82f6)' }}
                                    >
                                      <MapPin className="h-3.5 w-3.5" />
                                      Get directions
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!webcamsLoading && tabSettled('webcams') && !(webcams?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('webcams')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'brochures' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Brochures & Maps
                      </h2>

                      {showTabSpinner('brochures', brochuresLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!brochuresLoading && brochureData?.brochures?.length > 0 && (
                        <div className="space-y-4">
                          {brochureData.brochures.map((brochure, index) => (
                            <div
                              key={index}
                              className="rounded-xl p-5"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <div className="flex items-start gap-4">
                                <div
                                  className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{
                                    backgroundColor: 'var(--surface)',
                                    borderWidth: '1px',
                                    borderColor: 'var(--border)'
                                  }}
                                >
                                  <FileText className="h-5 w-5" style={{ color: 'var(--accent-blue, #3b82f6)' }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="font-semibold text-sm leading-snug break-words"
                                    style={{ color: 'var(--text-primary)' }}
                                    title={brochure.title}
                                  >
                                    {brochure.title || 'Park brochure'}
                                  </p>
                                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                    PDF
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <a
                                  href={brochure.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition hover:opacity-80"
                                  style={{
                                    backgroundColor: 'var(--surface)',
                                    borderWidth: '1px',
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-primary)'
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View
                                </a>
                                <a
                                  href={brochure.url}
                                  download
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition hover:opacity-80"
                                  style={{
                                    backgroundColor: 'var(--surface)',
                                    borderWidth: '1px',
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-primary)'
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!brochuresLoading && tabSettled('brochures') && !(brochureData?.brochures?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('brochures')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'permits' && (
                    <ParkPermitsTab
                      permits={permits}
                      loading={!permitsReady}
                    />
                  )}

                  {activeTab === 'alerts' && (
                    (alertsQuery.isPending || alertsQuery.isFetching) && !alerts.length ? (
                      <ParkTabSpinner />
                    ) : (
                      <ParkAlertsTab alerts={alerts} />
                    )
                  )}

                  {activeTab === 'transit' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Shuttles & Ferries
                      </h2>

                      {showTabSpinner('transit', transitLoading) && (
                        <ParkTabSpinner />
                      )}
                      {!transitLoading && transitData?.hasGtfs && Array.isArray(transitData?.feeds) && transitData.feeds.length > 0 && (
                        <div className="space-y-4">
                          {transitData.feeds.map((feed, idx) => (
                            <div
                              key={`${feed.gtfsUrl || 'gtfs'}-${idx}`}
                              className="rounded-xl p-5"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)',
                              }}
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-base leading-snug break-words"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {feed.systemName || 'Transit system'}
                                </p>
                                {shouldShowCatalogNotes(feed.notes, feed.parsed?.operating?.serviceStatus) ? (
                                  <div className="mt-3 text-sm"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {feed.notes}
                                  </div>
                                ) : null}

                                {feed.parsed?.operating && (() => {
                                  const operating = feed.parsed.operating;
                                  const styles = getTransitOperatingStyles(operating.serviceStatus);
                                  const showTodayDetails = shouldShowTodayTransitDetails(
                                    operating.serviceStatus
                                  );
                                  return (
                                    <div
                                      className="mt-3 rounded-xl p-3"
                                      style={{
                                        backgroundColor: 'var(--surface)',
                                        borderWidth: '1px',
                                        borderColor: 'var(--border)',
                                      }}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                          style={{
                                            backgroundColor: styles.badgeBg,
                                            color: styles.badgeColor,
                                          }}
                                        >
                                          {operating.headline}
                                        </span>
                                        {showTodayDetails &&
                                        shouldShowOperatingDaysLabel(
                                          operating.operatingDaysLabel,
                                          operating.detail,
                                          operating.scheduleLines
                                        ) ? (
                                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            {operating.operatingDaysLabel}
                                          </span>
                                        ) : null}
                                        {showTodayDetails && operating.frequencyLabel ? (
                                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            {operating.frequencyLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                      {showTodayDetails && operating.scheduleDateLabel ? (
                                        <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                                          Schedule for {operating.scheduleDateLabel}
                                        </p>
                                      ) : null}
                                      {operating.detail ? (
                                        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                          {operating.detail}
                                        </p>
                                      ) : null}
                                      {operating.seasonEndLabel && operating.serviceStatus === 'season_ended' ? (
                                        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                          Season ended {operating.seasonEndLabel}
                                        </p>
                                      ) : null}
                                      {showTodayDetails &&
                                      operating.seasonStartLabel &&
                                      operating.seasonEndLabel ? (
                                        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                          Season: {operating.seasonStartLabel} – {operating.seasonEndLabel}
                                        </p>
                                      ) : null}
                                      {operating.source === 'nps' &&
                                      shouldShowNpsScheduleLines(operating.serviceStatus) &&
                                      Array.isArray(operating.scheduleLines) &&
                                      operating.scheduleLines.length > 0 ? (
                                        <ul className="mt-2 space-y-1 text-xs list-disc pl-4" style={{ color: 'var(--text-secondary)' }}>
                                          {operating.scheduleLines.map((line) => (
                                            <li key={line}>{line}</li>
                                          ))}
                                        </ul>
                                      ) : null}
                                      {(operating.pageUrl || feed.systemUrl) && (
                                        <a
                                          href={operating.pageUrl || feed.systemUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 inline-flex items-center gap-2 text-xs font-semibold hover:underline"
                                          style={{ color: 'var(--accent-green)' }}
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          Official NPS transit page
                                        </a>
                                      )}
                                      {operating.operatorLink?.url ? (
                                        <a
                                          href={operating.operatorLink.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 ml-0 inline-flex items-center gap-2 text-xs font-semibold hover:underline"
                                          style={{ color: 'var(--accent-green)' }}
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          {operating.operatorLink.label || 'Ferry operator'}
                                        </a>
                                      ) : null}
                                    </div>
                                  );
                                })()}

                                {feed.parsedError && (
                                  <div className="mt-3 text-xs"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    Couldn’t parse GTFS feed right now.
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {/* Intentionally no per-system external link (UX prefers single NPS public transport link above). */}
                              </div>

                              {Array.isArray(feed.parsed?.summary?.routes) && feed.parsed.summary.routes.length > 0 && (
                                <div className="mt-5">
                                  <div className="text-xs font-semibold mb-2"
                                    style={{ color: 'var(--text-tertiary)' }}
                                  >
                                    Routes
                                  </div>
                                  {(() => {
                                    const gtfsUrlKey = feed.gtfsUrl || `${idx}`;
                                    const isExpanded = expandedRoutesByGtfsUrl.has(gtfsUrlKey);
                                    const routes = feed.parsed.summary.routes;
                                    const visibleRoutes = isExpanded ? routes : routes.slice(0, 6);
                                    const hideRouteSchedules = shouldHideRouteSchedules(
                                      feed.parsed?.operating?.serviceStatus
                                    );
                                    return (
                                      <>
                                        {hideRouteSchedules ? (
                                          <p className="mb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            Route stops shown for reference. Shuttles are not running for the current season.
                                          </p>
                                        ) : null}
                                        <div className="space-y-3">
                                          {visibleRoutes.map((r) => (
                                            <div
                                              key={r.routeId}
                                              className="text-left rounded-xl p-4"
                                              style={{
                                                backgroundColor: 'var(--surface)',
                                                borderWidth: '1px',
                                                borderColor: 'var(--border)',
                                              }}
                                            >
                                              <div className="min-w-0">
                                                <div className="text-sm font-semibold"
                                                  style={{ color: 'var(--text-primary)' }}
                                                >
                                                  {r.longName || r.shortName || 'Route'}
                                                </div>
                                                {!hideRouteSchedules && r.frequencyLabel ? (
                                                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                    {r.frequencyLabel}
                                                  </p>
                                                ) : null}

                                                {(() => {
                                                  const stopPoints = Array.isArray(r.stopPoints) ? r.stopPoints : [];
                                                  if (stopPoints.length < 2) return null;

                                                  return (
                                                    <div className="mt-3 relative pl-5">
                                                      <div
                                                        className="absolute left-2 top-1 bottom-1 w-px"
                                                        style={{ backgroundColor: 'rgba(168, 85, 247, 0.28)' }}
                                                      />
                                                      <div className="space-y-2">
                                                        {stopPoints.map((s, i) => {
                                                          const isStart = i === 0;
                                                          const isEnd = i === stopPoints.length - 1;
                                                          return (
                                                            <div key={`${s.stopId || s.stopName}-${i}`} className="relative">
                                                              <div
                                                                className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full"
                                                                style={{
                                                                  backgroundColor: isStart || isEnd
                                                                    ? 'rgb(168, 85, 247)'
                                                                    : 'rgba(168, 85, 247, 0.55)',
                                                                  border: '2px solid var(--surface)',
                                                                }}
                                                              />
                                                              <div className="flex items-start justify-between gap-3">
                                                                <div
                                                                  className="text-xs break-words"
                                                                  style={{ color: 'var(--text-tertiary)' }}
                                                                >
                                                                  {s.stopName}
                                                                </div>
                                                                {!hideRouteSchedules && isStart && r.nextDeparture?.departureTime && (
                                                                  <div className="text-xs font-semibold shrink-0"
                                                                    style={{ color: 'var(--text-primary)' }}
                                                                  >
                                                                    {r.nextDeparture.departureTime}
                                                                  </div>
                                                                )}
                                                                {!hideRouteSchedules && isStart &&
                                                                  !r.nextDeparture?.departureTime &&
                                                                  r.todaySchedule?.lastDeparture && (
                                                                    <div
                                                                      className="text-xs font-medium shrink-0 text-right max-w-[9rem]"
                                                                      style={{ color: 'var(--text-tertiary)' }}
                                                                      title="No more departures scheduled for the rest of today"
                                                                    >
                                                                      {r.todaySchedule.firstDeparture ===
                                                                      r.todaySchedule.lastDeparture
                                                                        ? `Runs ${r.todaySchedule.lastDeparture}`
                                                                        : `Done today · last ${r.todaySchedule.lastDeparture}`}
                                                                    </div>
                                                                  )}
                                                              </div>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        {routes.length > 6 && (
                                          <div className="mt-3 flex items-center justify-between gap-3">
                                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                              {isExpanded ? `Showing all ${routes.length} routes.` : `Showing 6 of ${routes.length} routes.`}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setExpandedRoutesByGtfsUrl((prev) => {
                                                  const next = new Set(prev);
                                                  if (next.has(gtfsUrlKey)) next.delete(gtfsUrlKey);
                                                  else next.add(gtfsUrlKey);
                                                  return next;
                                                });
                                              }}
                                              className="text-xs font-semibold hover:underline"
                                              style={{ color: 'var(--text-secondary)' }}
                                            >
                                              {isExpanded ? 'Show fewer' : `Show all routes (${routes.length})`}
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          ))}

                        </div>
                      )}
                      {!transitLoading && tabSettled('transit') && !(transitData?.feeds?.length > 0) && (
                        <ParkTabEmptyState message={tabErrorMessage('transit')} />
                      )}
                    </div>
                  )}

                  {activeTab === 'reviews' && (
                    <div>
                      <ReviewSection
                        parkCode={npsParkCode}
                        parkName={park.fullName}
                        prefetchedReviews={reviewsQuery.isSuccess ? reviewsQuery.data : null}
                        onCountChange={setReviewCount}
                        initialOpenForm={searchParams.get('write') === '1'}
                        onFormOpened={() => handleTabChange('reviews', { keepFilter: true })}
                        onReviewSubmitted={() => {
                          setUserHasReviewed(true);
                          markVisitedReviewPromptSeen(npsParkCode);
                        }}
                      />
                    </div>
                  )}
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
                <div className="flex flex-col gap-3">
                  {park.latitude && park.longitude && (
                    <button
                      type="button"
                      onClick={() => router.push(`/map?park=${encodeURIComponent(park.parkCode)}`)}
                      className="flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
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
                      className="flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-primary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <MapIcon className="h-4 w-4" />
                      Open in Google Maps
                    </a>
                  )}

                  {createParkGoogleMapsDirectionsLink() && (
                    <a
                      href={createParkGoogleMapsDirectionsLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition hover:scale-105"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-primary)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <Route className="h-4 w-4" />
                      Get directions
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
                {showCrowdCalendar && (
                <a
                  href={reportHref('/reports/when-to-go', {
                    park: park.parkCode?.toUpperCase(),
                    from: pathname,
                  })}
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
                )}

                {/* Planning guides hub */}
                <Link
                  href={hrefWithFrom('/guides', returnPath)}
                  onClick={() => logCtaClick({
                    ctaId: 'park_sidebar_planning_guides',
                    label: 'Planning guides',
                    surface: 'park_sidebar_guides',
                    destination: '/guides',
                    parkCode: npsParkCode,
                  })}
                  className="block rounded-2xl p-4 sm:p-5 transition hover:shadow-lg group"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
                    Planning Guides
                  </span>
                  <h4 className="text-base font-semibold mt-1 mb-1" style={{ color: 'var(--text-primary)' }}>
                    National park trip planning
                  </h4>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Tool comparisons, permits, how-tos, and ranked park lists.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all" style={{ color: 'var(--accent-blue)' }}>
                    View Guides <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </Link>

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
            </aside>
          </div>
        </div>
      </section>

      {visiblePlanningFaqItems.length > 0 && (
        <section
          className="py-10 sm:py-12 lg:py-14"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderTopWidth: '1px',
            borderColor: 'var(--border)',
          }}
          aria-label="Park planning questions"
        >
          <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
            <ParkPlanningFaqSection
              faqItems={faqItemsForDisplay}
              parkCode={npsParkCode}
              parkName={park.fullName}
              parkSlug={parkSlug}
              faqTabContext={faqTabContext}
              onTabNavigate={handleFaqTabNavigate}
            />
          </div>
        </section>
      )}

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
                href={relatedParksViewAllHref}
                className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline"
                style={{ color: 'var(--accent-green)' }}
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {relatedParks.map((rp, index) => {
                const slug = parkToSlug(rp.fullName);
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
                href={relatedParksViewAllHref}
                className="w-full inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                View All Parks in {park.states?.split(',')[0]?.trim()}
              </Link>
            </div>
          </div>
        </section>
      )}

      <ParkReviewPromptDialog
        isOpen={showReviewPromptDialog}
        onClose={dismissReviewPromptDialog}
        parkName={park.fullName}
        onLeaveTip={handleReviewPromptLeaveTip}
      />

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

function ParkDetailLoadingFallback() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <LoadingSpinner size="lg" text="Loading park…" label="Loading park" />
      </div>
    </div>
  );
}

export default function ParkDetailClient({
  relatedParks,
  seoLeadLine,
  stateHubSlug,
  planningSnapshot,
  planningFaqItems,
  ...props
}) {
  return (
    <Suspense fallback={<ParkDetailLoadingFallback />}>
      <ParkDetailInner
        {...props}
        relatedParks={relatedParks}
        seoLeadLine={seoLeadLine}
        stateHubSlug={stateHubSlug}
        planningSnapshot={planningSnapshot}
        planningFaqItems={planningFaqItems}
      />
    </Suspense>
  );
}
