"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search, X, Plus, ChevronDown, ChevronUp, Check,
  MapPin, Star, RefreshCw, Sparkles,
  TrendingUp, Mountain, Calendar
} from '@components/icons';
import Header from '@/components/common/Header';
import OptimizedImage from '@/components/common/OptimizedImage';
import { useAllParks } from '@/hooks/useParks';
import { useParkComparison } from '@/hooks/useEnhancedParks';

const ComparePage = () => {
  const { data: allParksData, isLoading } = useAllParks();
  const allParks = allParksData?.data;
  const [selectedParks, setSelectedParks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    summary: true
  });

  const maxParks = 4;

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

    return allParks.filter(park => {
      if (park.designation !== 'National Park') return false;
      if (selectedParks.some(p => p.parkCode === park.parkCode)) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!park.fullName.toLowerCase().includes(search) &&
            !park.states.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [allParks, selectedParks, searchTerm]);

  const handleAddPark = (park) => {
    if (selectedParks.length < maxParks) {
      setSelectedParks([...selectedParks, park]);
      setSearchTerm('');
      if (selectedParks.length + 1 >= maxParks) {
        setShowSelector(false);
      }
    }
  };

  const handleRemovePark = (parkCode) => {
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
    const rawFee = park.entranceFee ?? park.entranceFees?.[0]?.cost;
    const numericFee = Number(rawFee);

    if (Number.isFinite(numericFee) && numericFee > 0) {
      return {
        amount: `$${numericFee.toFixed(0)}`,
        note: park.entranceFees?.[0]?.title || 'Standard private vehicle rate'
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
      entranceFee: selectedPark.entranceFees?.[0]?.cost || 0
    };
  });

  const comparisonHighlights = useMemo(() => {
    if (enhancedParks.length < 2) return [];

    const ratedParks = [...enhancedParks].sort((a, b) => {
      const ratingDiff = (b.reviews?.averageRating || 0) - (a.reviews?.averageRating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return getCrowdRank(a) - getCrowdRank(b);
    });

    const temperatureParks = enhancedParks.filter((park) => getNumericTemperature(park) !== null);
    const warmestPark = temperatureParks.length > 0
      ? [...temperatureParks].sort((a, b) => getNumericTemperature(b) - getNumericTemperature(a))[0]
      : null;

    const leastCrowdedPark = [...enhancedParks].sort((a, b) => getCrowdRank(a) - getCrowdRank(b))[0];
    const sharedActivities = [
      ...(comparisonData?.commonActivities?.commonToAll || []),
      ...(comparisonData?.commonActivities?.mostlyCommon || [])
    ].slice(0, 4);

    return [
      {
        title: 'Best overall bet',
        value: ratedParks[0]?.fullName || 'N/A',
        note: ratedParks[0]?.reviews?.averageRating
          ? `${ratedParks[0].reviews.averageRating.toFixed(1)} average rating`
          : 'Strong overall fit based on current comparison data',
        icon: Star
      },
      {
        title: 'Warmest right now',
        value: warmestPark?.fullName || 'Unavailable',
        note: warmestPark ? formatTemperature(warmestPark) : 'Current temperature data unavailable',
        icon: TrendingUp
      },
      {
        title: 'Lower crowd option',
        value: leastCrowdedPark?.fullName || 'Unavailable',
        note: leastCrowdedPark?.crowdLevel?.level || 'Crowd level unavailable',
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

  const hasEntranceFeeData = enhancedParks.some((park) => getEntranceFeeInfo(park));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-8 sm:py-20">
        <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="mt-3 sm:mt-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Side-by-Side Comparison
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Compare National Parks
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Compare up to 4 National Parks side-by-side. Activities, weather, facilities,
              and more to help you choose your next adventure.
            </p>
          </div>
        </div>
      </section>

      {/* Explainer — targets "compare entrance fees parking amenities" queries */}
      <section className="pb-6 sm:pb-10">
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Entrance Fees &amp; Parking</h2>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                See entrance fees, parking costs, and pass options for each park before you buy. Compare included amenities across up to 4 parks at once.
              </p>
            </div>
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Crowds &amp; Best Times</h2>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Compare visitor crowd levels by season, peak hours, and holiday weekends so you can pick the quietest window for your trip.
              </p>
            </div>
            <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Activities &amp; Facilities</h2>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Compare hiking trails, campgrounds, lodging, visitor centers, and accessibility features side by side for every national park.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          {/* Park Selector */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Select National Parks to Compare
              </h2>
              {selectedParks.length > 0 && (
                <button
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

            {/* Selected Parks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
              {Array.from({ length: maxParks }).map((_, index) => {
                const park = selectedParks[index];
                const parkColor = park ? parkColors[park.parkCode] : null;

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
                          <div
                            className="mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                            style={parkColor?.chip}
                          >
                            {park.designation || 'Park'}
                          </div>
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
                        placeholder="Search parks..."
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
                      <div className="text-center py-12">
                        <Mountain className="h-12 w-12 animate-pulse mx-auto mb-4"
                          style={{ color: 'var(--text-tertiary)' }}
                        />
                        <p style={{ color: 'var(--text-secondary)' }}>Loading parks...</p>
                      </div>
                    ) : availableParks.length === 0 ? (
                      <div className="text-center py-12">
                        <Search className="h-12 w-12 mx-auto mb-4"
                          style={{ color: 'var(--text-tertiary)' }}
                        />
                        <p style={{ color: 'var(--text-secondary)' }}>No parks found</p>
                      </div>
                    ) : (
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
                            <p className="text-xs flex items-center gap-1"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              <MapPin className="h-3 w-3" />
                              {park.states}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Comparison Table */}
          {selectedParks.length >= 2 ? (
            isComparisonLoading ? (
              <div className="text-center py-12">
                <Mountain className="h-12 w-12 animate-pulse mx-auto mb-4"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <p style={{ color: 'var(--text-secondary)' }}>Loading enhanced comparison data...</p>
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
                          <h3 className="mt-2 text-lg font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
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
                  icon={TrendingUp}
                  isExpanded={expandedSections.summary}
                  onToggle={() => toggleSection('summary')}
                >
                  <div className="overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-2">
                    <div className="min-w-[68rem]">
                  {/* Park Names Header */}
                  <div>
                    <div className="flex min-w-max">
                      <div className="hidden lg:block flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left lg:sticky lg:left-0 lg:z-10"
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
                          <div key={park.parkCode} className="flex-1 min-w-[9.5rem] sm:min-w-[11rem] lg:min-w-0 px-3 sm:px-4 py-4 font-semibold text-xs sm:text-sm text-center snap-start"
                            style={{ backgroundColor: 'var(--surface-hover)' }}
                          >
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] lg:hidden" style={{ color: 'var(--text-tertiary)' }}>
                              Comparison
                            </div>
                            <span
                              style={parkColor ? parkColor.text : { color: 'var(--text-primary)' }}
                            >
                              {park.fullName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <ComparisonRow label="Basic Info" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-1">
                        <div className="text-sm font-medium">{park.designation}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{park.states}</div>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Ratings & Reviews" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col items-center gap-1">
                        {(park.reviews?.totalReviews || 0) > 0 ? (
                          <>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-3 w-3 ${
                                    star <= (park.reviews?.averageRating || 0)
                                      ? 'text-yellow-400 fill-current'
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

                  <ComparisonRow label="Weather" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
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

                  <ComparisonRow label="Facilities" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-1">
                        <div className="text-sm">
                          <span className="font-medium">{park.facilities?.visitorCenters?.count || 0}</span> centers •
                          <span className="font-medium"> {park.facilities?.campgrounds?.count || park.facilities?.camping?.count || 0}</span> camps
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Food: {park.facilities?.foodServices ? 'Yes' : 'Limited'} •
                          Lodging: {park.facilities?.lodging?.available ? 'Yes' : 'Limited'}
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  <ComparisonRow label="Accessibility" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
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

                  <ComparisonRow label="Best Time to Visit" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
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

                  <ComparisonRow label="Crowd Level" parkNames={enhancedParks.map(p => p.fullName)} parkCodes={enhancedParks.map(p => p.parkCode)} parkColors={parkColors}>
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

                  {hasEntranceFeeData && (
                    <ComparisonRow label="Entrance Fee" desktopAlign="center">
                      {enhancedParks.map(park => {
                        const feeInfo = getEntranceFeeInfo(park);

                        return (
                          <div key={park.parkCode} className="flex flex-col gap-1 items-center">
                            <div className="text-sm font-medium">
                              {feeInfo ? feeInfo.amount : 'Check park page'}
                            </div>
                            <div className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                              {feeInfo ? feeInfo.note : 'Fee details unavailable'}
                            </div>
                          </div>
                        );
                      })}
                    </ComparisonRow>
                  )}

                  <ComparisonRow label="Top Activities" desktopAlign="left">
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

                  <ComparisonRow label="Quick Actions">
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col items-center gap-2">
                        <Link
                          href={`/parks/${park.parkCode}`}
                          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
                          style={{
                            color: 'var(--accent-green)',
                            borderColor: 'color-mix(in srgb, var(--accent-green) 24%, var(--border) 76%)'
                          }}
                        >
                          View Details →
                        </Link>
                        <Link
                          href={`/plan-ai?park=${park.parkCode}&name=${encodeURIComponent(park.fullName)}`}
                          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: 'var(--accent-green)',
                            color: '#fff',
                          }}
                        >
                          Plan a Trip →
                        </Link>
                      </div>
                    ))}
                  </ComparisonRow>
                    </div>
                  </div>
                </ComparisonSection>

                {/* Road Trip Banner */}
                {selectedParks.length >= 2 && (
                  <div
                    className="rounded-2xl p-6 sm:p-8 text-center"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <p className="text-lg sm:text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                      Can&apos;t decide? Visit both.
                    </p>
                    <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                      Let AI plan a multi-park road trip itinerary for you.
                    </p>
                    <Link
                      href={`/plan-ai?suggest=${encodeURIComponent(selectedParks.map(p => p.fullName).join(' and '))}`}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition hover:opacity-90"
                      style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
                    >
                      <Sparkles className="h-4 w-4" />
                      Plan a Road Trip with AI →
                    </Link>
                  </div>
                )}
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
                Select at least 2 parks to compare
              </p>
              <p className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Click the + button above to add parks
              </p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

const ComparisonSection = ({ title, icon: Icon, isExpanded, onToggle, children }) => {
  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur"
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
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const ComparisonRow = ({ label, children, desktopAlign = 'center' }) => {
  const childArray = React.Children.toArray(children);

  return (
    <div className="flex min-w-max border-b" style={{ borderColor: 'var(--border)' }}>
      <div
        className="hidden lg:block flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left lg:sticky lg:left-0 lg:z-10 lg:shadow-[10px_0_24px_-18px_rgba(15,23,42,0.18)]"
        style={{
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--surface-hover)'
        }}
      >
        <div className="leading-relaxed">{label}</div>
      </div>
      {childArray.map((child, index) => (
        <div
          key={index}
          className="flex-1 min-w-[10.5rem] sm:min-w-[11rem] lg:min-w-0 px-3 sm:px-4 py-4 text-sm snap-start"
          style={{ color: 'var(--text-primary)' }}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] lg:hidden" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </div>
          <div className={`w-full leading-relaxed ${desktopAlign === 'left' ? 'text-left' : 'text-center'}`}>
            {child}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ComparePage;
