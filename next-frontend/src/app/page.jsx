"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

import Button from '@/components/common/Button';
import OptimizedImage from '@/components/common/OptimizedImage';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useAllParks } from '@/hooks/useParks';
import statsService from '@/services/statsService';
import dailyFeedService from '@/services/dailyFeedService';
import { handleApiError, fallbackData } from '@/utils/errorHandler';
import {
  Compass, Mountain, Sparkles, Clock, Shield,
  MapPin, Calendar, Heart, Camera, BookOpen, Route,
  Star, Eye, Search, ArrowRight, Map, Trees, Landmark, ChevronRight, X
} from '@components/icons';

const LandingPage = () => {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  useTheme();
  const [, setStats] = useState({ users: 0, trips: 0, reviews: 0, parks: 63 });
  const [, setTestimonials] = useState([]);
  const [, setLoading] = useState(true);

  // Park search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);

  // Fetch daily feed (for unauthenticated or quick preview)
  const { data: dailyFeed, isLoading: isDailyFeedLoading } = useQuery({
    queryKey: ['landingDailyFeed'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `trailverse_landing_feed_${today}`;

      // Attempt to load from localStorage to achieve instant page refreshes
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (e) { /* ignore parse errors */ }

      // If no local cache, fetch park data first then nature fact in parallel where possible
      const parkData = await dailyFeedService.getParkOfDay().catch(() => null);
      if (!parkData) return null;

      const natureFact = await dailyFeedService.getNatureFact(parkData.parkCode, parkData.name).catch(() => null);
      const result = { parkOfDay: parkData, natureFact };

      // Save it locally for the rest of the day
      try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) { /* ignore storage quotas */ }

      return result;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Fetch all parks for search + featured grid
  const { data: allParksData } = useAllParks();
  const allParks = allParksData?.data || [];

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await statsService.getSiteStats();
      setStats(response.data.stats);
      setTestimonials(response.data.testimonials || []);
    } catch (error) {
      handleApiError(error, () => { }, () => {
        setStats(fallbackData.stats);
        setTestimonials([]);
      }, false);
    } finally {
      setLoading(false);
    }
  };

  // Featured parks — iconic parks users recognize instantly
  const featuredParkCodes = ['yell', 'yose', 'grca', 'zion', 'glac', 'acad'];
  const featuredParks = useMemo(() => {
    if (!allParks.length) return [];
    return featuredParkCodes
      .map(code => allParks.find(p => p.parkCode === code))
      .filter(Boolean);
  }, [allParks]);

  // Quick categories for browsing
  const categories = [
    { label: 'National Parks', icon: Trees, filter: 'National Park', count: '63' },
    { label: 'Monuments', icon: Landmark, filter: 'National Monument', count: '80+' },
    { label: 'Historic Sites', icon: BookOpen, filter: 'National Historic', count: '90+' },
    { label: 'Seashores & Lakeshores', icon: Compass, filter: 'National Seashore', count: '20+' },
    { label: 'Interactive Map', icon: Map, link: '/map', count: '' },
    { label: 'Compare Parks', icon: Star, link: '/compare', count: '' },
  ];

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !allParks.length) return [];
    const q = searchQuery.toLowerCase();
    return allParks
      .filter(p =>
        p.fullName.toLowerCase().includes(q) ||
        p.parkCode.toLowerCase().includes(q) ||
        (p.states && p.states.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [searchQuery, allParks]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      router.push(`/parks/${searchResults[0].parkCode}`);
    } else if (searchQuery.trim()) {
      router.push(`/explore?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TrailVerse',
    alternateName: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
    logo: 'https://www.nationalparksexplorerusa.com/logo.png',
    description: 'The modern platform for exploring America\'s 470+ National Parks, Monuments, and Historic Sites',
    sameAs: [
      'https://www.facebook.com/npeusa',
      'https://twitter.com/npeusa',
      'https://www.instagram.com/npeusa'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'trailverseteam@gmail.com'
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>

      <Header />

      {/* ═══════════════════════════════════════════════════════
          HERO — Search-First, Exploration-First 
          ═══════════════════════════════════════════════════════ */}
      <section
        className="relative z-30 w-full overflow-x-hidden overflow-y-visible"
        style={{
          minHeight: 'calc(100dvh - 64px)',
          paddingBottom: searchFocused && searchQuery.trim() ? '22rem' : undefined
        }}
      >
        {/* Background Image */}
        <div
          className="absolute inset-0 w-full bg-cover bg-no-repeat"
          style={{
            backgroundImage: 'url(/background23.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 25%',
            width: '100vw',
            left: '50%',
            marginLeft: '-50vw',
          }}
        />

        {/* Gradient overlays */}
        <div
          className="absolute inset-0 w-full bg-black/50"
          style={{ width: '100vw', left: '50%', marginLeft: '-50vw' }}
        />

        {/* Content */}
        <div className="relative z-10 w-full flex flex-col items-center justify-center px-4 sm:px-6 lg:px-10 xl:px-12 pt-[2.75rem] sm:pt-32 lg:pt-40 pb-20 sm:pb-32 lg:pb-40">
          <div className="w-full max-w-6xl mx-auto text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 backdrop-blur-md mb-8 sm:mb-10 shadow-lg transition-transform hover:scale-105 bg-black/30 border border-white/10"
            >
              <Route className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: 'var(--accent-green)' }} />
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-white/90">
                470+ Parks. One Platform.
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-tight mb-6 sm:mb-8 text-white w-full text-center drop-shadow-xl"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600, lineHeight: '0.95' }}
            >
              Discover America's <br className="hidden sm:block" />
              <span style={{ color: 'var(--accent-green)', textShadow: '0 0 30px rgba(16, 185, 129, 0.3)' }}>National Parks.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-medium leading-relaxed text-white/90 max-w-3xl mx-auto mb-2">
              Explore 470+ National Parks with real-time weather, interactive maps,
              community reviews, and smart trip planning.
            </p>
            <p className="text-base sm:text-lg lg:text-xl font-medium text-white/70 max-w-3xl mx-auto mb-10 sm:mb-12">
              Your next adventure starts here.
            </p>

            {/* ──── HERO SEARCH BAR ──── */}
            <div ref={searchRef} className="relative z-30 w-full max-w-3xl mx-auto mb-10">
              <form onSubmit={handleSearchSubmit} className="relative z-20">
                <div
                  className="flex items-center rounded-[2rem] overflow-hidden backdrop-blur-md transition-all duration-300 group shadow-2xl"
                  style={{
                    backgroundColor: searchFocused ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)',
                    border: searchFocused ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.15)'
                  }}
                >
                  <Search className="h-6 w-6 text-white/70 ml-6 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Search parks, monuments, historic sites..."
                    className="flex-1 min-w-0 bg-transparent border-none ring-0 focus:ring-0 outline-none focus:outline-none shadow-none text-white font-medium placeholder-white/50 text-base sm:text-lg py-4 sm:py-5 px-4"
                    id="hero-search"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); document.getElementById('hero-search')?.focus(); }}
                      className="flex-shrink-0 mr-1 w-8 h-8 rounded-full transition-colors"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" style={{ color: '#ffffff' }} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="mr-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 flex-shrink-0 flex items-center gap-2 hover:scale-105"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: 'white',
                    }}
                  >
                    <span className="hidden sm:inline">Explore</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </form>

              {/* Search Results Dropdown */}
              {searchFocused && searchQuery.trim() && (
                <div
                  className="absolute top-full left-0 right-0 mt-3 rounded-[1.5rem] overflow-hidden backdrop-blur-md z-[70] animate-fade-in"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-3 px-5 py-3"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>
                      {searchResults.length > 0 ? 'Matching Parks' : 'No Exact Matches'}
                    </p>
                    <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      {searchResults.length > 0 ? `${searchResults.length} shown` : 'Try a broader search'}
                    </p>
                  </div>

                  {searchResults.length > 0 ? (
                    <div>
                      {searchResults.map((park) => (
                        <button
                          key={park.parkCode}
                          onClick={() => {
                            router.push(`/parks/${park.parkCode}`);
                            setSearchFocused(false);
                          }}
                          className="w-full flex items-center gap-4 px-4 sm:px-6 py-4 text-left transition-colors"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          {park.images?.[0]?.url ? (
                            <img
                              src={park.images[0].url}
                              alt=""
                              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover flex-shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex-shrink-0 flex items-center justify-center"
                              style={{ backgroundColor: 'var(--surface-hover)' }}
                            >
                              <Mountain className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: 'var(--text-tertiary)' }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {park.fullName}
                            </p>
                            <p className="text-xs sm:text-sm truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              {park.states} • {park.designation}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-5 text-left">
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        No parks matched &ldquo;{searchQuery}&rdquo;
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Search by park name, state abbreviation, or park code.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      router.push(`/explore?search=${encodeURIComponent(searchQuery)}`);
                      setSearchFocused(false);
                    }}
                    className="w-full px-5 sm:px-6 py-4 text-sm font-bold text-left sm:text-center transition-colors"
                    style={{ color: 'var(--accent-green)', backgroundColor: 'var(--surface-hover)' }}
                  >
                    Open full explore results for &ldquo;{searchQuery}&rdquo; →
                  </button>
                </div>
              )}
            </div>

            {/* CTA text */}
            <p className="text-sm sm:text-base text-white/70 font-medium mb-4">
              Start exploring now — browse every park, check live weather, compare destinations, and plan your next trip.
            </p>

            {/* Quick action pills below search */}
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
              <button
                onClick={() => router.push('/explore')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white/90 transition-all hover:bg-black/60 bg-black/40 border border-white/10 backdrop-blur-md"
              >
                <Compass className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                Browse All Parks
              </button>
              <button
                onClick={() => router.push('/map')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white/90 transition-all hover:bg-black/60 bg-black/40 border border-white/10 backdrop-blur-md"
              >
                <Map className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                Interactive Map
              </button>
              <button
                onClick={() => router.push('/plan-ai')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white/90 transition-all hover:bg-black/60 bg-black/40 border border-white/10 backdrop-blur-md"
              >
                <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                AI Trip Planner
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FEATURED PARKS — Immediate Visual Exploration
          ═══════════════════════════════════════════════════════ */}
      <section className="relative z-0 py-16 sm:py-20 px-4 sm:px-6 lg:px-10 xl:px-12" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-[92rem] mx-auto">
          {/* Section Header */}
          <div className="flex items-end justify-between mb-10">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 ring-1"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <Mountain className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
                <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Popular Destinations
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Start exploring
              </h2>
              <p className="text-base sm:text-lg mt-2 max-w-lg"
                style={{ color: 'var(--text-secondary)' }}
              >
                Iconic destinations loved by millions — click any park to dive in
              </p>
            </div>
            <Link
              href="/explore"
              className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline flex-shrink-0 whitespace-nowrap"
              style={{ color: 'var(--accent-green)' }}
            >
              View All Parks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Featured Parks Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {featuredParks.length > 0 ? (
              featuredParks.map((park) => (
                <Link
                  key={park.parkCode}
                  href={`/parks/${park.parkCode}`}
                  className="group block relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{
                    aspectRatio: '16/11',
                    boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  {/* Park Image */}
                  <OptimizedImage
                    src={park.images?.[0]?.url}
                    alt={park.fullName}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-white/70" />
                      <span className="text-xs font-medium text-white/70 uppercase tracking-wider">
                        {park.states}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-white leading-tight mb-1">
                      {park.fullName}
                    </h3>
                    <p className="text-sm text-white/60 line-clamp-2 hidden sm:block">
                      {park.description?.substring(0, 100)}...
                    </p>
                  </div>

                  {/* Hover arrow */}
                  <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <ArrowRight className="h-4 w-4 text-white" />
                  </div>
                </Link>
              ))
            ) : (
              // Loading skeleton
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl animate-pulse"
                  style={{
                    aspectRatio: '16/11',
                    backgroundColor: 'var(--surface-hover)',
                  }}
                />
              ))
            )}
          </div>

          {/* Mobile "View All" button */}
          <div className="mt-6 sm:hidden">
            <Button
              onClick={() => router.push('/explore')}
              variant="secondary"
              size="lg"
              icon={ArrowRight}
              iconPosition="right"
              className="w-full"
            >
              View All 470+ Parks
            </Button>
          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════
          DAILY FEED FEATURE — Public Inspiration
          ═══════════════════════════════════════════════════════ */}
      {/* Daily Feed: show skeleton while loading, full content when ready */}
      {(isDailyFeedLoading || (dailyFeed?.parkOfDay && dailyFeed?.natureFact)) && (
        <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 lg:px-10 xl:px-12" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-[92rem] mx-auto">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 ring-1"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
                  <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    Daily Inspiration
                  </span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Park of the day
                </h2>
                <p className="text-base sm:text-lg mt-2 max-w-2xl"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  A daily spotlight designed to feel like the rest of your park discovery flow.
                </p>
              </div>
            </div>

            {dailyFeed?.parkOfDay && dailyFeed?.natureFact ? (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)] gap-6 xl:gap-8 items-stretch">
              <Link
                href={`/parks/${dailyFeed.parkOfDay.parkCode}`}
                className="group block relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  minHeight: '28rem',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <OptimizedImage
                  src={dailyFeed.parkOfDay.image || '/background1.png'}
                  alt={dailyFeed.parkOfDay.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

                <div className="absolute top-5 left-5 sm:top-6 sm:left-6 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/15 bg-black/35">
                  <Sparkles className="h-4 w-4 text-white" />
                  <span className="text-xs font-bold text-white tracking-wide">PARK OF THE DAY</span>
                </div>

                <div className="absolute top-5 right-5 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                  <ArrowRight className="h-4 w-4 text-white" />
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-3.5 w-3.5 text-white/70" />
                    <span className="text-xs font-medium text-white/70 uppercase tracking-wider">
                      {dailyFeed.parkOfDay.states}
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-3">
                    {dailyFeed.parkOfDay.name}
                  </h3>
                  <p className="text-sm sm:text-base text-white/75 max-w-2xl line-clamp-3">
                    Explore today&apos;s featured park, then dive deeper into weather, alerts, reviews, and trip planning.
                  </p>
                </div>
              </Link>

              <div
                className="rounded-2xl p-6 sm:p-8 backdrop-blur transition-all duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5 ring-1"
                  style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}
                >
                  <Mountain className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Nature Fact
                  </span>
                </div>

                <p className="text-lg sm:text-xl leading-relaxed mb-8"
                  style={{ color: 'var(--text-primary)' }}
                >
                  &ldquo;{dailyFeed.natureFact.replace(/\*\*(.*?)\*\*/g, '$1')}&rdquo;
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={() => router.push(`/parks/${dailyFeed.parkOfDay.parkCode}`)}
                    variant="primary"
                    size="lg"
                    icon={ArrowRight}
                    iconPosition="right"
                    className="w-full sm:w-auto"
                  >
                    Explore Today&apos;s Park
                  </Button>
                </div>
              </div>
            </div>
            ) : (
            /* Skeleton loader while daily feed is loading */
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)] gap-6 xl:gap-8 items-stretch animate-pulse">
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{ minHeight: '28rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="absolute top-5 left-5 sm:top-6 sm:left-6 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }}>
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>PARK OF THE DAY</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                  <div className="h-3 w-24 rounded-full mb-4" style={{ backgroundColor: 'var(--surface-hover)' }} />
                  <div className="h-7 w-72 rounded-full mb-3" style={{ backgroundColor: 'var(--surface-hover)' }} />
                  <div className="h-4 w-96 max-w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                </div>
              </div>

              <div
                className="rounded-2xl p-6 sm:p-8"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="h-7 w-32 rounded-full mb-5" style={{ backgroundColor: 'var(--surface-hover)' }} />
                <div className="space-y-3 mb-8">
                  <div className="h-5 w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                  <div className="h-5 w-full rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                  <div className="h-5 w-3/4 rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
                </div>
                <div className="h-12 w-48 rounded-xl" style={{ backgroundColor: 'var(--surface-hover)' }} />
              </div>
            </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          FEATURE PILLS — Quick Value Props
          ═══════════════════════════════════════════════════════ */}
      <section id="features" className="relative z-10 py-16" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Sparkles, title: 'AI Trip Planning', description: 'Smart itineraries that match your style' },
              { icon: Clock, title: 'Real-time Updates', description: 'Weather and current conditions' },
              { icon: Mountain, title: 'Expert Guidance', description: 'Local insights and trail recommendations' },
              { icon: Shield, title: 'Privacy First', description: 'Your data stays with you' }
            ].map((feature, index) => (
              <div
                key={index}
                className="rounded-2xl p-5 backdrop-blur group hover:-translate-y-1 transition-all duration-300"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="flex gap-4 items-start">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 flex-shrink-0 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}
                  >
                    <feature.icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
                      {feature.title}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      <Footer />
    </div>
  );
};

export default LandingPage;
