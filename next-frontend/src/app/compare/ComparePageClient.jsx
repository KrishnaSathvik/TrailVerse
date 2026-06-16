"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CompareUrlHydration from './CompareUrlHydration';
import {
  Search, X, Plus, ChevronDown, ChevronUp, Check,
  MapPin, Star, RefreshCw, Sparkles,
  Columns, BarChart, Sun, Mountain, Calendar, Copy, Car
} from '@components/icons';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import OptimizedImage from '@/components/common/OptimizedImage';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';
import { useVisitedParks } from '@/hooks/useVisitedParks';
import { useFavorites } from '@/hooks/useFavorites';
import { getCompareRoadTripCta, getCompareParkPlanButton } from '@/lib/planAiWelcomeCopy';
import { useAllParks } from '@/hooks/useParks';
import { useParkComparison } from '@/hooks/useEnhancedParks';
import { useCompareParkingLots } from '@/hooks/useCompareParkingLots';
import { logEvent } from '@/utils/analytics';
import { parkToSlug } from '@/utils/parkSlug';
import { parkDetailHref } from '@/lib/returnNavigation';
import { useReturnPath } from '@/hooks/useReturnPath';
import { summarizeCompareParking } from '@/utils/parkingUtils';
import { pickPrimaryEntranceFee } from '@/utils/parkVisitInfoUtils';
import { COMPARE_LANDINGS } from '@/data/compareLandings';

/** Default picker list — search still queries all parks from useAllParks */
const COMPARE_FEATURED_PARK_CODES = [
  'yell', 'yose', 'grca', 'zion', 'glac', 'acad', 'grte', 'grsm',
  'arch', 'brca', 'jotr', 'olym', 'ever', 'dena', 'seki', 'romo',
  'deva', 'cany', 'bibe', 'whsa', 'havo', 'drto', 'crla', 'mora',
  'stli', 'goga', 'inde', 'alca', 'gett', 'nama',
];

const COMPARE_FEATURED_ORDER = Object.fromEntries(
  COMPARE_FEATURED_PARK_CODES.map((code, index) => [code, index])
);

const maxParks = 4;

function stripParkHtml(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function firstSentence(text) {
  if (!text) return null;
  const match = text.match(/^[^.!?]+[.!?]?/);
  const sentence = (match?.[0] || text).trim();
  return sentence || null;
}

function getParkAccessSummary(directions) {
  const text = stripParkHtml(directions);
  if (!text) return null;

  const nearMatch = text.match(/\bnear ([A-Za-z0-9\s,'-]+?)(?:\.|,|\s+You\b|\s+The\b)/i);
  if (nearMatch?.[1]) {
    return `Near ${nearMatch[1].trim().replace(/\s+/g, ' ')}`;
  }

  const locatedMatch = text.match(/\blocated (?:in|at|near) ([A-Za-z0-9\s,'-]+?)(?:\.|,)/i);
  if (locatedMatch?.[1]) {
    return `Near ${locatedMatch[1].trim().replace(/\s+/g, ' ')}`;
  }

  return truncateText(firstSentence(text), 90);
}

const OVERVIEW_PREVIEW_CHARS = 180;

function getParkOverviewContent(park) {
  const fullDescription = stripParkHtml(park.description);

  const hoursRaw = park.operatingHours?.find((entry) => entry?.description)?.description
    || park.operatingHours?.[0]?.description;
  const hoursLine = truncateText(firstSentence(stripParkHtml(hoursRaw)), 100);

  const accessLine = getParkAccessSummary(park.directionsInfo);

  const stateCodes = (park.states || '')
    .split(',')
    .map((state) => state.trim())
    .filter(Boolean);

  return {
    fullDescription,
    hoursLine,
    accessLine,
    stateLabel: stateCodes.length > 0 ? stateCodes.join(' · ') : null,
  };
}

function formatFacilityCount(count, singular, plural) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? singular : plural}`;
}

function formatFacilityAvailability(available) {
  return available ? 'Available' : 'Limited';
}

function CompareOverviewBlock({ park, parkColor, showState }) {
  const [expanded, setExpanded] = useState(false);
  const overview = getParkOverviewContent(park);
  const canExpand = overview.fullDescription.length > OVERVIEW_PREVIEW_CHARS;
  const description = expanded || !canExpand
    ? overview.fullDescription
    : truncateText(overview.fullDescription, OVERVIEW_PREVIEW_CHARS);

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
    >
      <p
        className="text-sm font-semibold leading-snug break-words"
        style={parkColor?.text || { color: 'var(--text-primary)' }}
      >
        {park.fullName}
      </p>
      {overview.fullDescription ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm leading-relaxed break-words whitespace-normal" style={{ color: 'var(--text-primary)' }}>
            {description}
          </p>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="self-start text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--accent-green)' }}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Overview unavailable</p>
      )}
      {showState && overview.stateLabel && (
        <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{overview.stateLabel}</p>
      )}
      {overview.accessLine && (
        <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--text-tertiary)' }}>
          {overview.accessLine}
        </p>
      )}
      {overview.hoursLine && (
        <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--text-tertiary)' }}>
          {overview.hoursLine}
        </p>
      )}
    </div>
  );
}

const COMPARE_PATH = '/compare';

const ComparePageInner = ({ initialParkCodes = [] }) => {
  const router = useRouter();
  const returnPath = useReturnPath();
  const { isAuthenticated, user } = useAuth();
  const { isParkVisited } = useVisitedParks();
  const { isParkFavorited } = useFavorites();
  const { data: allParksData, isLoading } = useAllParks();
  const allParks = allParksData?.data;
  const [selectedParks, setSelectedParks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    summary: true
  });
  const urlHydratedRef = useRef(false);

  const getParkColors = (parkCodes) => {
    const colors = [
      { accent: 'var(--accent-blue)' },
      { accent: 'var(--accent-green)' },
      { accent: 'var(--accent-orange)' },
      { accent: 'var(--error-red)' }
    ];

    const colorMap = {};
    const usedColors = new Set();

    parkCodes.forEach(parkCode => {
      let hash = 0;
      for (let i = 0; i < parkCode.length; i++) {
        hash = parkCode.charCodeAt(i) + ((hash << 5) - hash);
      }
      let index = Math.abs(hash) % colors.length;

      while (usedColors.has(index)) {
        index = (index + 1) % colors.length;
      }

      usedColors.add(index);
      colorMap[parkCode] = {
        accent: colors[index].accent,
        text: { color: colors[index].accent },
        border: { borderColor: `color-mix(in srgb, ${colors[index].accent} 32%, var(--border) 68%)` },
        chip: {
          backgroundColor: `color-mix(in srgb, ${colors[index].accent} 12%, transparent)`,
          color: colors[index].accent,
          borderColor: `color-mix(in srgb, ${colors[index].accent} 26%, var(--border) 74%)`
        }
      };
    });

    return colorMap;
  };

  const availableParks = useMemo(() => {
    if (!allParks) return [];

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;

    const filtered = allParks.filter((park) => {
      if (selectedParks.some((p) => p.parkCode === park.parkCode)) return false;

      if (isSearching) {
        return (
          park.fullName.toLowerCase().includes(normalizedSearch) ||
          park.states.toLowerCase().includes(normalizedSearch) ||
          (park.designation || '').toLowerCase().includes(normalizedSearch) ||
          park.parkCode.toLowerCase().includes(normalizedSearch)
        );
      }

      return COMPARE_FEATURED_PARK_CODES.includes(park.parkCode?.toLowerCase());
    });

    return filtered.sort((a, b) => {
      if (isSearching) {
        return a.fullName.localeCompare(b.fullName);
      }

      const aOrder = COMPARE_FEATURED_ORDER[a.parkCode?.toLowerCase()] ?? 999;
      const bOrder = COMPARE_FEATURED_ORDER[b.parkCode?.toLowerCase()] ?? 999;
      return aOrder - bOrder;
    });
  }, [allParks, selectedParks, searchTerm]);

  const isSearchingParks = searchTerm.trim().length > 0;

  const resolveParkByCode = (code) => {
    if (!code || !allParks?.length) return null;
    const normalized = code.trim().toLowerCase();
    return allParks.find(
      (park) => park.parkCode?.toLowerCase() === normalized
    ) || null;
  };

  const handleAddPark = (park) => {
    if (selectedParks.length < maxParks) {
      setSelectedParks([...selectedParks, park]);
      logEvent('Compare', 'add_park', park.fullName);
      setSearchTerm('');
      setShowSelector(false);
    }
  };

  const hydrateFromCodes = useCallback(
    (codes) => {
      const normalized = [...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(
        0,
        maxParks
      );
      if (!normalized.length || !allParks?.length) return;
      const parks = normalized.map((code) => resolveParkByCode(code)).filter(Boolean);
      if (parks.length > 0) {
        setSelectedParks(parks);
      }
    },
    [allParks]
  );

  useEffect(() => {
    if (!allParks?.length || urlHydratedRef.current) return;
    if (initialParkCodes.length > 0) {
      hydrateFromCodes(initialParkCodes);
      urlHydratedRef.current = true;
    }
  }, [allParks, initialParkCodes, hydrateFromCodes]);

  // Keep URL in sync for shareable comparisons
  useEffect(() => {
    if (!urlHydratedRef.current) return;

    const params = new URLSearchParams();
    if (selectedParks.length > 0) {
      params.set('parks', selectedParks.map((park) => park.parkCode).join(','));
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${COMPARE_PATH}?${nextQuery}` : COMPARE_PATH;
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : COMPARE_PATH;
    const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
    const currentUrl = currentSearch ? `${currentPath}${currentSearch}` : currentPath;

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [selectedParks, router]);

  const copyComparisonLink = async () => {
    if (selectedParks.length < 2 || typeof window === 'undefined') return;
    const url = `${window.location.origin}/compare?parks=${selectedParks.map((p) => p.parkCode).join(',')}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      logEvent('Compare', 'copy_link', selectedParks.map((p) => p.parkCode).join(','));
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  };

  const handleRemovePark = (parkCode) => {
    const park = selectedParks.find(p => p.parkCode === parkCode);
    logEvent('Compare', 'remove_park', park?.fullName || parkCode);
    setSelectedParks(selectedParks.filter(p => p.parkCode !== parkCode));
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const clearAll = () => {
    setSelectedParks([]);
    setSearchTerm('');
  };

  const parkCodes = selectedParks.map(park => park.parkCode);

  const {
    data: comparisonData,
    isLoading: isComparisonLoading
  } = useParkComparison(parkCodes, {
    enabled: parkCodes.length >= 2
  });

  const { parkingByCode, isLoading: isParkingLoading } = useCompareParkingLots(
    parkCodes,
    parkCodes.length >= 2
  );

  const predictBestMonths = (park) => {
    const states = park.states?.toLowerCase() || '';
    const name = park.fullName?.toLowerCase() || '';

    if (states.includes('alaska') || name.includes('denali') || name.includes('glacier bay')) {
      return { months: ['June', 'July'], reasons: ['Peak summer weather', 'Accessible roads'] };
    }
    if (states.includes('arizona') || states.includes('utah') || states.includes('nevada') ||
        name.includes('grand canyon') || name.includes('arches') || name.includes('zion') ||
        name.includes('bryce') || name.includes('canyonlands')) {
      return { months: ['April', 'October'], reasons: ['Mild temperatures', 'Avoid summer heat'] };
    }
    if (states.includes('florida') || name.includes('everglades') || name.includes('biscayne')) {
      return { months: ['December', 'March'], reasons: ['Dry season', 'Fewer mosquitoes'] };
    }
    if (states.includes('california') || name.includes('yosemite') || name.includes('sequoia') ||
        name.includes('joshua tree') || name.includes('death valley')) {
      return { months: ['May', 'September'], reasons: ['Pleasant weather', 'Less crowded'] };
    }
    if (states.includes('wyoming') || states.includes('montana') || name.includes('yellowstone') ||
        name.includes('grand teton') || name.includes('glacier')) {
      return { months: ['June', 'September'], reasons: ['Wildlife active', 'Roads accessible'] };
    }
    if (states.includes('maine') || name.includes('acadia')) {
      return { months: ['July', 'September'], reasons: ['Peak season', 'Fall foliage'] };
    }
    if (states.includes('colorado') || name.includes('rocky mountain')) {
      return { months: ['July', 'August'], reasons: ['Snow-free trails', 'Wildflower season'] };
    }
    if (states.includes('hawaii') || name.includes('volcanoes')) {
      return { months: ['April', 'October'], reasons: ['Dry season', 'Best visibility'] };
    }
    if (states.includes('washington') || name.includes('olympic') || name.includes('rainier')) {
      return { months: ['July', 'August'], reasons: ['Dry season', 'Mountain access'] };
    }
    if (states.includes('oregon') || name.includes('crater lake')) {
      return { months: ['July', 'September'], reasons: ['Snow-free access', 'Clear views'] };
    }
    return { months: ['May', 'September'], reasons: ['Pleasant weather', 'Shoulder season'] };
  };

  const parkColors = getParkColors(parkCodes);

  const formatTemperature = (park) => {
    const temp = park.weather?.current?.temp ?? park.weather?.current?.temperature;
    return typeof temp === 'number' ? `${Math.round(temp)}°F` : 'N/A';
  };

  const getNumericTemperature = (park) => {
    const temp = park.weather?.current?.temp ?? park.weather?.current?.temperature;
    return typeof temp === 'number' ? temp : null;
  };

  const getTopActivities = (park) => {
    if (Array.isArray(park.topActivities) && park.topActivities.length > 0) {
      return [...new Set(park.topActivities)].slice(0, 4);
    }

    if (Array.isArray(park.activities) && park.activities.length > 0) {
      return [...new Set(
        park.activities
          .map((activity) => activity?.name || activity?.title || activity)
          .filter(Boolean)
      )].slice(0, 4);
    }

    return [];
  };

  const getEntranceFeeInfo = (park) => {
    const primary =
      pickPrimaryEntranceFee(park.entranceFees) ||
      (park.entranceFee != null ? { cost: park.entranceFee, title: null } : null);
    const numericFee = Number(primary?.cost ?? park.entranceFee);

    if (Number.isFinite(numericFee) && numericFee > 0) {
      return {
        amount: `$${numericFee.toFixed(0)}`,
        note: primary?.title || 'Standard private vehicle rate',
      };
    }

    return null;
  };

  const getCrowdRank = (park) => {
    const level = park.crowdLevel?.level || 'Moderate';
    return { 'Very Low': 1, 'Low': 2, 'Moderate': 3, 'High': 4, 'Very High': 5 }[level] || 3;
  };

  const getCrowdPillStyle = (level) => {
    if (level === 'Very High' || level === 'High') {
      return {
        backgroundColor: 'color-mix(in srgb, var(--error-red) 14%, transparent)',
        color: 'var(--error-red)',
        borderColor: 'color-mix(in srgb, var(--error-red) 26%, var(--border) 74%)'
      };
    }
    if (level === 'Moderate') {
      return {
        backgroundColor: 'color-mix(in srgb, var(--accent-orange) 14%, transparent)',
        color: 'var(--accent-orange)',
        borderColor: 'color-mix(in srgb, var(--accent-orange) 26%, var(--border) 74%)'
      };
    }
    return {
      backgroundColor: 'var(--accent-green-light)',
      color: 'var(--accent-green)',
      borderColor: 'color-mix(in srgb, var(--accent-green) 26%, var(--border) 74%)'
    };
  };

  const enhancedParks = selectedParks.map(selectedPark => {
    const enhancedPark = comparisonData?.parks?.find(p => p.parkCode === selectedPark.parkCode);

    if (enhancedPark) {
      const predictedBestTime = predictBestMonths(enhancedPark);
      return { ...enhancedPark, bestTimeToVisit: predictedBestTime };
    }

    const predictedBestTime = predictBestMonths(selectedPark);
    return {
      ...selectedPark,
      rating: 0,
      reviews: { totalReviews: 0, averageRating: 0 },
      bestTimeToVisit: predictedBestTime,
      weather: {
        current: { temperature: 70, condition: 'Partly Cloudy' },
        seasonal: {
          summer: { high: 80, low: 60, avg: 70 },
          winter: { high: 50, low: 30, avg: 40 }
        }
      },
      crowdLevel: { level: selectedPark.designation === 'National Park' ? 'High' : 'Moderate', confidence: 0.5 },
      facilities: {
        visitorCenters: { available: true, count: 1 },
        camping: { available: true, count: 1 },
        accessibility: { wheelchairAccessible: true }
      },
      topActivities: selectedPark.activities?.slice(0, 5).map(a => a.name) || [],
      entranceFee: pickPrimaryEntranceFee(selectedPark.entranceFees)?.cost || 0
    };
  });

  const showOverviewStates = useMemo(() => {
    if (enhancedParks.length < 2) return true;
    return new Set(enhancedParks.map((park) => park.states)).size > 1;
  }, [enhancedParks]);

  const roadTripCta = useMemo(
    () => getCompareRoadTripCta({
      user,
      isAuthenticated,
      parks: selectedParks,
      visitedCodes: selectedParks.filter((park) => isParkVisited(park.parkCode)).map((park) => park.parkCode),
      savedCodes: selectedParks.filter((park) => isParkFavorited(park.parkCode)).map((park) => park.parkCode),
    }),
    [user, isAuthenticated, selectedParks, isParkVisited, isParkFavorited]
  );

  const crowdTodayShort = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date()),
    []
  );

  const crowdLevelHint = `Today (${crowdTodayShort}) · model estimate, not live counts`;
  const weatherHint = 'Live now · summer/winter are seasonal estimates';

  const comparisonHighlights = useMemo(() => {
    if (enhancedParks.length < 2) return [];

    const hasAnyReviews = enhancedParks.some((park) => (park.reviews?.totalReviews || 0) > 0);

    const ratedParks = [...enhancedParks].sort((a, b) => {
      const ratingDiff = (b.reviews?.averageRating || 0) - (a.reviews?.averageRating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return getCrowdRank(a) - getCrowdRank(b);
    });

    const feeRanked = [...enhancedParks]
      .map((park) => ({ park, feeInfo: getEntranceFeeInfo(park) }))
      .filter((entry) => entry.feeInfo)
      .sort((a, b) => {
        const feeA = Number(String(a.feeInfo.amount).replace(/[^0-9.]/g, '')) || 0;
        const feeB = Number(String(b.feeInfo.amount).replace(/[^0-9.]/g, '')) || 0;
        return feeA - feeB;
      });

    const temperatureParks = enhancedParks.filter((park) => getNumericTemperature(park) !== null);
    const warmestPark = temperatureParks.length > 0
      ? [...temperatureParks].sort((a, b) => getNumericTemperature(b) - getNumericTemperature(a))[0]
      : null;
    const coolestPark = temperatureParks.length > 1
      ? [...temperatureParks].sort((a, b) => getNumericTemperature(a) - getNumericTemperature(b))[0]
      : null;

    const crowdSorted = [...enhancedParks].sort((a, b) => getCrowdRank(a) - getCrowdRank(b));
    const leastCrowdedPark = crowdSorted[0];
    const lowestCrowdRank = getCrowdRank(leastCrowdedPark);
    const crowdTieParks = crowdSorted.filter((park) => getCrowdRank(park) === lowestCrowdRank);

    const sharedActivities = [
      ...(comparisonData?.commonActivities?.commonToAll || []),
      ...(comparisonData?.commonActivities?.mostlyCommon || [])
    ].slice(0, 4);

    const bestOverallPark = hasAnyReviews
      ? ratedParks[0]
      : (feeRanked[0]?.park || ratedParks[0]);

    const bestOverallNote = hasAnyReviews && ratedParks[0]?.reviews?.averageRating
      ? `${ratedParks[0].reviews.averageRating.toFixed(1)} average rating`
      : feeRanked[0]?.feeInfo
        ? `${feeRanked[0].feeInfo.amount} entrance (vehicle)`
        : 'Strong overall fit based on current comparison data';

    const warmestNote = warmestPark
      ? coolestPark && coolestPark.parkCode !== warmestPark.parkCode
        ? `${formatTemperature(warmestPark)} vs ${formatTemperature(coolestPark)} at ${coolestPark.fullName.split(' ')[0]}`
        : formatTemperature(warmestPark)
      : 'Current temperature data unavailable';

    const crowdValue = crowdTieParks.length > 1
      ? crowdTieParks.map((park) => park.fullName.split(' National')[0]).join(' · ')
      : (leastCrowdedPark?.fullName || 'Unavailable');

    const crowdNote = crowdTieParks.length > 1
      ? `Tie — ${leastCrowdedPark?.crowdLevel?.level || 'Crowd level unavailable'}`
      : (leastCrowdedPark?.crowdLevel?.level || 'Crowd level unavailable');

    return [
      {
        title: 'Best overall bet',
        value: bestOverallPark?.fullName || 'N/A',
        note: bestOverallNote,
        icon: Star
      },
      {
        title: 'Warmest right now',
        value: warmestPark?.fullName || 'Unavailable',
        note: warmestNote,
        icon: Sun
      },
      {
        title: 'Lower crowd option',
        value: crowdValue,
        note: crowdNote,
        icon: Mountain
      },
      {
        title: 'Shared highlights',
        value: sharedActivities.length > 0 ? sharedActivities.map((item) => item.title).join(', ') : 'Not much overlap',
        note: sharedActivities.length > 0 ? 'Activities you can expect across this set' : 'These parks offer more distinct experiences',
        icon: Calendar
      }
    ];
  }, [comparisonData, enhancedParks]);

  return (
    <div className="overflow-x-clip" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {initialParkCodes.length === 0 && (
        <CompareUrlHydration
          allParks={allParks}
          hydratedRef={urlHydratedRef}
          onHydrate={(parks) => {
            setSelectedParks(parks);
            urlHydratedRef.current = true;
          }}
        />
      )}


      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-[92rem] mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-10 xl:px-12">
          {/* Park Selector */}
          <div className="mb-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Select Parks to Compare
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {selectedParks.length >= 2 && (
                  <button
                    type="button"
                    onClick={copyComparisonLink}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {linkCopied ? 'Link copied' : 'Copy link'}
                  </button>
                )}
                {selectedParks.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Clear All
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {COMPARE_LANDINGS.map((preset) => (
                <Link
                  key={preset.slug}
                  href={`/compare/${preset.slug}`}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {preset.label}
                </Link>
              ))}
            </div>

            {/* Selected Parks */}
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 w-full max-w-full">
              {Array.from({ length: maxParks }).map((_, index) => {
                const park = selectedParks[index];

                if (park) {
                  return (
                    <div
                      key={park.parkCode}
                      className="relative rounded-2xl overflow-hidden backdrop-blur group"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="relative h-40 overflow-hidden">
                        <OptimizedImage
                          src={park.images?.[0]?.url}
                          alt={park.fullName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                        <button
                          onClick={() => handleRemovePark(park.parkCode)}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        <div className="absolute bottom-2 left-2 right-2">
                          <h3 className="text-sm font-bold text-white line-clamp-2">
                            {park.fullName}
                          </h3>
                          <p className="text-xs text-white/80 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {park.states}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={index}
                    onClick={() => setShowSelector(true)}
                    className="h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-tertiary)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface)';
                    }}
                  >
                    <Plus className="h-8 w-8" />
                    <span className="text-sm font-medium">Add Park</span>
                  </button>
                );
              })}
            </div>

            {/* Park Selector Modal */}
            {showSelector && selectedParks.length < maxParks && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  onClick={() => setShowSelector(false)}
                />

                <div className="relative w-full max-w-2xl max-h-[80vh] rounded-2xl sm:rounded-3xl overflow-hidden mx-2 sm:mx-0"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="sticky top-0 z-10 p-4 sm:p-6 border-b backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Select a Park
                      </h3>
                      <button
                        onClick={() => setShowSelector(false)}
                        className="p-2 rounded-lg transition"
                        style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search all parks and sites..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-4 sm:p-6">
                    {isLoading ? (
                      <LoadingSpinner size="md" text="Loading parks…" />
                    ) : availableParks.length === 0 ? (
                      <div className="text-center py-12">
                        <Search className="h-12 w-12 mx-auto mb-4"
                          style={{ color: 'var(--text-tertiary)' }}
                        />
                        <p style={{ color: 'var(--text-secondary)' }}>No parks found</p>
                      </div>
                    ) : (
                      <>
                        {!isSearchingParks && (
                          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-tertiary)' }}>
                            Popular parks and sites below. Search to browse all 470+ parks and sites.
                          </p>
                        )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {availableParks.map(park => (
                          <button
                            key={park.parkCode}
                            onClick={() => handleAddPark(park)}
                            className="text-left p-2 sm:p-3 rounded-lg sm:rounded-xl transition"
                            style={{
                              backgroundColor: 'var(--surface)',
                              borderWidth: '1px',
                              borderColor: 'var(--border)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--surface)';
                            }}
                          >
                            <h4 className="font-semibold text-sm mb-1 line-clamp-2"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {park.fullName}
                            </h4>
                            <p className="text-xs flex items-center gap-1 flex-wrap"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span>{park.states}</span>
                              {park.designation && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>{park.designation}</span>
                                </>
                              )}
                            </p>
                          </button>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Comparison Table */}
          {selectedParks.length >= 2 ? (
            isComparisonLoading ? (
              <div className="py-12">
                <LoadingSpinner size="md" text="Loading comparison data…" />
              </div>
            ) : (
              <div className="space-y-4">
                {comparisonHighlights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {comparisonHighlights.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.title}
                          className="rounded-2xl p-5"
                          style={{
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          <div
                            className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{ backgroundColor: 'var(--surface-hover)' }}
                          >
                            <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                            {item.title}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold leading-snug break-words" style={{ color: 'var(--text-primary)' }}>
                            {item.value}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {item.note}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ComparisonSection
                  title="Park Comparison Summary"
                  icon={BarChart}
                  isExpanded={expandedSections.summary}
                  onToggle={() => toggleSection('summary')}
                >
                  <div className="w-full min-w-0">
                  {(() => {
                    const parkCount = enhancedParks.length;
                    const desktopScrollable = parkCount >= 3;
                    const desktopParkColMin = parkCount >= 4 ? '14rem' : parkCount === 3 ? '12rem' : null;
                    const desktopTableMinWidth = desktopScrollable
                      ? `calc(12rem + ${parkCount} * ${desktopParkColMin})`
                      : undefined;
                    const overviewGridClass = parkCount >= 4
                      ? 'grid-cols-2 xl:grid-cols-4'
                      : parkCount === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2';

                    return (
                      <>
                  <div
                    className={`hidden lg:grid gap-4 border-b p-4 ${overviewGridClass}`}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {enhancedParks.map((park) => (
                      <CompareOverviewBlock
                        key={park.parkCode}
                        park={park}
                        parkColor={parkColors[park.parkCode]}
                        showState={showOverviewStates}
                      />
                    ))}
                  </div>

                  <div
                    className={
                      desktopScrollable
                        ? 'w-full min-w-0 lg:overflow-x-auto lg:overscroll-x-contain'
                        : 'w-full min-w-0'
                    }
                  >
                    <div
                      className="w-full min-w-0 max-lg:!min-w-0"
                      style={desktopTableMinWidth ? { minWidth: desktopTableMinWidth } : undefined}
                    >
                  <div
                    className="hidden lg:flex w-full min-w-0 border-b"
                    style={{ borderColor: 'var(--border)' }}
                  >
                      <div className="flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left sticky left-0 z-10"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-secondary)',
                          boxShadow: '10px 0 24px -18px rgba(15,23,42,0.18)'
                        }}
                      >
                        Comparison
                      </div>
                      {enhancedParks.map((park) => {
                        const parkColor = parkColors[park.parkCode];
                        return (
                          <div
                            key={park.parkCode}
                            className={`flex-1 px-4 py-4 font-semibold text-sm text-center ${desktopParkColMin ? 'flex-shrink-0' : 'min-w-0 basis-0'}`}
                            style={{
                              backgroundColor: 'var(--surface-hover)',
                              minWidth: desktopParkColMin || undefined,
                            }}
                          >
                            <span
                              className="break-words"
                              style={parkColor ? parkColor.text : { color: 'var(--text-primary)' }}
                            >
                              {park.fullName}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <ComparisonRow
                    label="Overview"
                    hideDesktop
                    desktopAlign="left"
                    parkNames={enhancedParks.map((p) => p.fullName)}
                    parkCodes={enhancedParks.map((p) => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map((park) => (
                      <CompareOverviewBlock
                        key={park.parkCode}
                        park={park}
                        parkColor={parkColors[park.parkCode]}
                        showState={showOverviewStates}
                      />
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Ratings & Reviews" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors} desktopParkColMin={desktopParkColMin}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col items-center gap-1">
                        {(park.reviews?.totalReviews || 0) > 0 ? (
                          <>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  weight={star <= (park.reviews?.averageRating || 0) ? 'fill' : 'regular'}
                                  className={`h-3 w-3 ${
                                    star <= (park.reviews?.averageRating || 0)
                                      ? 'text-yellow-400'
                                      : 'text-slate-400'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="text-xs font-medium whitespace-nowrap">
                              {park.reviews.averageRating.toFixed(1)} ({park.reviews.totalReviews})
                            </div>
                          </>
                        ) : (
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            No TrailVerse reviews yet
                          </div>
                        )}
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow
                    label="Weather"
                    hint={weatherHint}
                    parkNames={enhancedParks.map(p => p.fullName)}
                    parkCodes={enhancedParks.map(p => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-1">
                        <div className="text-sm font-medium">
                          {park.weather?.current?.temp ? `${Math.round(park.weather.current.temp)}°F` :
                           park.weather?.current?.temperature ? `${park.weather.current.temperature}°F` : 'N/A'}
                          {(park.weather?.current?.description || park.weather?.current?.condition) && (
                            <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>
                              • {park.weather.current.description || park.weather.current.condition}
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Summer: {park.weather?.seasonal?.summer?.avg ? `${Math.round(park.weather.seasonal.summer.avg)}°F` : 'N/A'} •
                          Winter: {park.weather?.seasonal?.winter?.avg ? `${Math.round(park.weather.seasonal.winter.avg)}°F` : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Facilities" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors} desktopParkColMin={desktopParkColMin}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-1 text-sm leading-relaxed">
                        <div>
                          {formatFacilityCount(park.facilities?.visitorCenters?.count, 'visitor center', 'visitor centers')}
                          {' · '}
                          {formatFacilityCount(
                            park.facilities?.campgrounds?.count ?? park.facilities?.camping?.count,
                            'campground',
                            'campgrounds'
                          )}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Food services: {formatFacilityAvailability(park.facilities?.foodServices)}
                          {' · '}
                          Lodging: {formatFacilityAvailability(park.facilities?.lodging?.available)}
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Accessibility" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors} desktopParkColMin={desktopParkColMin}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          {park.facilities?.accessibility?.wheelchairAccessible ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                        <span className="text-xs text-center">
                          {park.facilities?.accessibility?.wheelchairAccessible ? 'Wheelchair Accessible' : 'Limited Access'}
                        </span>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Best Time to Visit" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors} desktopParkColMin={desktopParkColMin}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(park.bestTimeToVisit?.months || ['Year Round']).map((month, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 rounded-full text-xs font-medium"
                              style={{
                                backgroundColor: 'var(--accent-green-light)',
                                color: 'var(--accent-green)'
                              }}
                            >
                              {month}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs leading-relaxed text-center" style={{ color: 'var(--text-tertiary)' }}>
                          {park.bestTimeToVisit?.reasons?.slice(0, 2).join(' • ') || 'Good weather year-round'}
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow
                    label="Crowd Level"
                    hint={crowdLevelHint}
                    parkNames={enhancedParks.map(p => p.fullName)}
                    parkCodes={enhancedParks.map(p => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-2 items-center">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-semibold border"
                          style={getCrowdPillStyle(park.crowdLevel?.level)}
                        >
                          {park.crowdLevel?.level || 'Unknown'}
                        </span>
                        {park.crowdLevel?.confidence && (
                          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                            {Math.round(park.crowdLevel.confidence * 100)}% confidence
                          </div>
                        )}
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow
                    label="Parking & Access"
                    desktopAlign="center"
                    parkNames={enhancedParks.map((p) => p.fullName)}
                    parkCodes={enhancedParks.map((p) => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map((park) => {
                      const lots = parkingByCode[park.parkCode];
                      const parkingSummary = summarizeCompareParking(
                        Array.isArray(lots) ? lots : []
                      );
                      const feeInfo = getEntranceFeeInfo(park);
                      const slug = parkToSlug(park.fullName);

                      return (
                        <div key={park.parkCode} className="flex flex-col gap-1.5 max-lg:items-start lg:items-center">
                          {isParkingLoading && lots == null ? (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              Loading parking…
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1 text-sm font-medium">
                                <Car className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                {parkingSummary.primaryLabel}
                              </div>
                              {feeInfo && (
                                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {feeInfo.amount} entrance
                                </div>
                              )}
                              <div className="text-xs max-lg:text-left lg:text-center" style={{ color: 'var(--text-tertiary)' }}>
                                {parkingSummary.liveNote}
                              </div>
                              <Link
                                href={parkDetailHref(slug, returnPath, { tab: 'parking' })}
                                className="text-xs font-medium underline-offset-2 hover:underline"
                                style={{ color: 'var(--accent-green)' }}
                              >
                                Parking details →
                              </Link>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </ComparisonRow>

                  <ComparisonRow
                    label="Top Activities"
                    desktopAlign="left"
                    parkNames={enhancedParks.map((p) => p.fullName)}
                    parkCodes={enhancedParks.map((p) => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map((park) => {
                      const activities = getTopActivities(park);
                      return (
                        <div key={park.parkCode} className="flex flex-col gap-1 w-full">
                          {activities.length > 0 ? (
                            <div className="flex flex-col gap-1.5 w-full">
                              {activities.map((activity) => (
                                <span
                                  key={activity}
                                  className="px-2 py-1 rounded-md border text-xs font-medium"
                                  style={{
                                    backgroundColor: 'var(--accent-green-light)',
                                    color: 'var(--accent-green)',
                                    borderColor: 'color-mix(in srgb, var(--accent-green) 22%, var(--border) 78%)'
                                  }}
                                >
                                  {activity}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              Activity data unavailable
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ComparisonRow>

                  <ComparisonRow
                    label="Quick Actions"
                    parkNames={enhancedParks.map((p) => p.fullName)}
                    parkCodes={enhancedParks.map((p) => p.parkCode)}
                    parkColors={parkColors}
                    desktopParkColMin={desktopParkColMin}
                  >
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col max-lg:items-start lg:items-center gap-2">
                        <Link
                          href={parkDetailHref(parkToSlug(park.fullName), returnPath)}
                          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
                          style={{
                            color: 'var(--accent-green)',
                            borderColor: 'color-mix(in srgb, var(--accent-green) 24%, var(--border) 76%)'
                          }}
                        >
                          View Details →
                        </Link>
                        <Link
                          href={`/plan-ai?from=compare&park=${park.parkCode}&name=${encodeURIComponent(park.fullName)}`}
                          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:brightness-110 text-center"
                          style={{
                            backgroundColor: 'var(--accent-green-dark)',
                            color: '#fff',
                          }}
                        >
                          {getCompareParkPlanButton({
                            isAuthenticated,
                            parkName: park.fullName,
                            isVisited: isParkVisited(park.parkCode),
                            isSaved: isParkFavorited(park.parkCode),
                          })}
                          {' →'}
                        </Link>
                      </div>
                    ))}
                  </ComparisonRow>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                  </div>
                </ComparisonSection>
              </div>
            )
          ) : (
            <div className="text-center py-24">
              <Mountain className="h-16 w-16 mx-auto mb-4"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <p className="text-lg font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {selectedParks.length === 1
                  ? 'Add one more park to compare'
                  : 'Select at least 2 parks to compare'}
              </p>
              <p className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {selectedParks.length === 1
                  ? 'Add one more park to unlock side-by-side comparison'
                  : 'Click the + button above to add parks'}
              </p>
            </div>
          )}

          {/* Trailie CTA — copy scales with 1–4 selected parks */}
          {selectedParks.length >= 1 && roadTripCta && (
            <div
              className={`rounded-2xl p-6 sm:p-8 text-left lg:text-center ${selectedParks.length >= 2 ? 'mt-4' : 'mt-8'}`}
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-start gap-4 mb-4 lg:flex-col lg:items-center">
                <TrailieAvatar className="!h-12 !w-12 shrink-0" />
                <div className="min-w-0 lg:text-center">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                    style={{ color: 'var(--accent-green)' }}
                  >
                    Trailie
                  </p>
                  <p className="text-lg sm:text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    {roadTripCta.title}
                  </p>
                </div>
              </div>
              <p className="text-sm mb-5 lg:max-w-xl lg:mx-auto" style={{ color: 'var(--text-secondary)' }}>
                {roadTripCta.subtitle}
              </p>
              <Link
                href={`/plan-ai?suggest=${encodeURIComponent(selectedParks.map((p) => p.fullName).join(' and '))}`}
                className="inline-flex w-full sm:w-auto lg:mx-auto items-center justify-center gap-2 flex-nowrap px-5 py-3 rounded-full text-sm font-semibold transition hover:brightness-110"
                style={{ backgroundColor: 'var(--accent-green-dark)', color: '#fff' }}
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                <span className="text-center leading-snug">
                  {roadTripCta.buttonCompact ? (
                    <>
                      <span className="sm:hidden">
                        {roadTripCta.buttonCompact}
                        {'\u00a0→'}
                      </span>
                      <span className="hidden sm:inline">
                        {roadTripCta.button}
                        {'\u00a0→'}
                      </span>
                    </>
                  ) : (
                    <>
                      {roadTripCta.button}
                      {'\u00a0→'}
                    </>
                  )}
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const ComparisonSection = ({ title, icon: Icon, isExpanded, onToggle, children }) => {
  return (
    <div className="rounded-2xl backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 transition"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          >
            <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
          </div>
          <h3 className="text-xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronDown className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
        )}
      </button>

      {isExpanded && (
        <div className="border-t min-w-0" style={{ borderColor: 'var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const ComparisonRow = ({
  label,
  hint,
  children,
  desktopAlign = 'center',
  hideDesktop = false,
  parkNames = [],
  parkCodes = [],
  parkColors = {},
  desktopParkColMin = null,
}) => {
  const childArray = React.Children.toArray(children);
  const desktopAlignClass = desktopAlign === 'left' ? 'text-left' : 'text-center';
  const mobileAlignClass = 'text-left';

  return (
    <>
      <div className="lg:hidden border-b" style={{ borderColor: 'var(--border)' }}>
        <div
          className="px-4 py-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {label}
          </div>
          {hint && (
            <span className="text-[10px] font-normal normal-case tracking-normal leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              {hint}
            </span>
          )}
        </div>
        <div>
          {childArray.map((child, index) => {
            const parkCode = parkCodes[index];
            const parkColor = parkCode ? parkColors[parkCode] : null;

            return (
              <div
                key={parkCode || index}
                className="px-4 py-3 border-b last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                {parkNames[index] && (
                  <p
                    className="text-sm font-semibold mb-2 break-words"
                    style={parkColor?.text || { color: 'var(--text-primary)' }}
                  >
                    {parkNames[index]}
                  </p>
                )}
                <div className={`w-full min-w-0 break-words whitespace-normal leading-relaxed ${mobileAlignClass}`}>
                  {child}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!hideDesktop && (
        <div
          className="hidden lg:flex w-full min-w-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left sticky left-0 z-10"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--surface-hover)',
              boxShadow: '10px 0 24px -18px rgba(15,23,42,0.18)',
            }}
          >
            <div className="leading-relaxed break-words">{label}</div>
            {hint && (
              <p className="mt-1 text-[10px] font-normal leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                {hint}
              </p>
            )}
          </div>
          {childArray.map((child, index) => (
            <div
              key={index}
              className={`flex-1 px-4 py-4 text-sm ${desktopParkColMin ? 'flex-shrink-0' : 'min-w-0 basis-0'}`}
              style={{
                color: 'var(--text-primary)',
                minWidth: desktopParkColMin || undefined,
              }}
            >
              <div className={`w-full min-w-0 break-words whitespace-normal leading-relaxed ${desktopAlignClass}`}>
                {child}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default function ComparePageClient({ initialParkCodes = [] }) {
  return <ComparePageInner initialParkCodes={initialParkCodes} />;
}
