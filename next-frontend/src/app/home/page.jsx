"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkle,
  CompassRose,
  SunDim,
  MoonStars,
  MapPinArea,
  CalendarDots,
  ThermometerSimple,
  Mountains,
  ShootingStar,
  NavigationArrow,
  Binoculars,
  Target,
  MapTrifold,
  CloudSun
} from '@phosphor-icons/react';
import {
  Sun, Moon, Star, MapPin, Calendar,
  ExternalLink, Loader2, Compass, Mountain, Sparkles, Clock,
  Thermometer, Wind, Droplets, Eye as EyeIcon, Check, CloudSnow, ArrowRight
} from '@components/icons';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import Button from '@/components/common/Button';
import dailyFeedService from '@/services/dailyFeedService';
import { useAuth } from '@/context/AuthContext';

// ---------- Small, reusable UI atoms ----------

const Card = ({ className = '', children }) => (
  <div
    className={`rounded-[1.75rem] border ${className}`}
    style={{
      backgroundColor: 'var(--surface)',
      borderColor: 'var(--border)',
      boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)'
    }}
  >
    {children}
  </div>
);

const SectionHeader = ({ icon: Icon, title, subtitle, accent = 'var(--accent-green)' }) => (
  <div className="flex items-start sm:items-center gap-4 mb-6">
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 12%, white 88%)`,
        border: `1px solid color-mix(in srgb, ${accent} 20%, var(--border) 80%)`,
        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)'
      }}
    >
      <Icon size={24} weight="duotone" style={{ color: accent }} />
    </div>
    <div>
      <h3 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
    </div>
  </div>
);

const Chip = ({ icon: Icon, title, children, muted }) => (
  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${muted ? 'opacity-80' : ''}`}
       style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
    {Icon && <Icon className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />}
    {title && <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>}
    <span className="text-xs">{children}</span>
  </div>
);

const renderBoldText = (text) => {
  if (!text) return text;
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return (
        <span key={index} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {boldText}
        </span>
      );
    }
    return part;
  });
};

const isValidTimeZone = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const formatAstroTime = (timeValue, timezone) => {
  if (!timeValue || timeValue === '—') return '—';
  if (typeof timeValue === 'string' && /\bAM\b|\bPM\b/i.test(timeValue)) {
    return timeValue;
  }

  try {
    const date = new Date(timeValue);
    if (Number.isNaN(date.getTime())) return '—';

    const options = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };

    if (isValidTimeZone(timezone)) {
      options.timeZone = timezone;
    }

    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '—';
  }
};

const formatTimezoneLabel = (timezone) => {
  if (!timezone) return 'Local Time';
  if (!isValidTimeZone(timezone)) return timezone;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    }).formatToParts(new Date());
    const shortName = parts.find((part) => part.type === 'timeZoneName')?.value;
    if (shortName) return shortName;
  } catch {
    // Fall through to a cleaned location label.
  }

  return timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;
};

const normalizeInsightArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeInsightArray(item))
      .filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  const candidates = [
    trimmed,
    trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  ];

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) candidates.push(fencedMatch[1].trim());

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch (error) {
      // Fall through to line cleanup.
    }
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !['```json', '```', '[', ']'].includes(line))
    .map((line) => line.replace(/^[-•\d+.\]"',\s]+/, '').trim())
    .filter(Boolean);
};

const normalizeTextBlock = (value) => {
  const normalized = normalizeInsightArray(value);
  if (normalized.length) return normalized;

  if (typeof value !== 'string') return [];

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•\d+.\]"',\s]+/, '').trim())
    .filter(Boolean);
};

const Bullet = ({ icon: Icon = Sparkles, children }) => (
  <div className="flex items-start gap-3 py-1.5">
    <div
      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 12%, white 88%)' }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: 'var(--accent-green)' }} />
    </div>
    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {renderBoldText(children)}
    </p>
  </div>
);

const SunRow = ({ sun, fallbacks, timezone }) => {
  const effectiveTimezone = sun?.tz || timezone || 'Local Time';
  const sunrise = formatAstroTime(sun?.sunriseLocal || fallbacks?.sunrise, effectiveTimezone);
  const sunset = formatAstroTime(sun?.sunsetLocal || fallbacks?.sunset, effectiveTimezone);
  const tz = formatTimezoneLabel(effectiveTimezone);

  return (
    <div className="flex flex-wrap gap-2">
      <Chip icon={Sun} title="Sunrise">{sunrise}</Chip>
      <Chip icon={Moon} title="Sunset">{sunset}</Chip>
      <Chip icon={Clock} title="Timezone">{tz}</Chip>
    </div>
  );
};

const DarknessHint = ({ sunset, timezone }) => {
  if (!sunset || sunset === '—') return null;

  const calculateDarknessTime = (sunsetTimeStr) => {
    try {
      const normalizedSunset = formatAstroTime(sunsetTimeStr, timezone);
      const [time, ampm] = normalizedSunset.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      if (ampm === 'PM' && hours !== 12) hour24 += 12;
      if (ampm === 'AM' && hours === 12) hour24 = 0;
      const date = new Date();
      date.setHours(hour24, minutes + 90, 0);
      const resultHour = date.getHours();
      const resultMin = date.getMinutes();
      const resultAmpm = resultHour >= 12 ? 'PM' : 'AM';
      const resultHour12 = resultHour % 12 || 12;
      return `${resultHour12}:${resultMin.toString().padStart(2, '0')} ${resultAmpm}`;
    } catch (e) {
      return '~90 min after ' + formatAstroTime(sunsetTimeStr, timezone);
    }
  };

  const darknessTime = calculateDarknessTime(sunset);

  return (
    <div className="mt-2">
      <Chip icon={Star} muted>
        Best darkness: {darknessTime}
      </Chip>
    </div>
  );
};

// ---------- Page ----------

const DailyFeedPage = () => {
  const router = useRouter();
  const { user, loading: authLoading, userDataLoaded, isAuthenticated } = useAuth();

  const fetchFeed = async () => {
    if (!user?._id) {
      throw new Error('Authenticated daily feed requested without a user.');
    }
    return dailyFeedService.getDailyFeed(user._id, false);
  };

  const { data: dailyFeed, isLoading, error, refetch } = useQuery({
    queryKey: ['dailyFeed', new Date().toISOString().split('T')[0], user?._id || 'anonymous'],
    queryFn: fetchFeed,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 1000,
    enabled: !authLoading && userDataLoaded && isAuthenticated && !!user?._id,
  });

  // Track how long we've been loading to show helpful messaging
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTooLong(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTooLong(true), 15000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const park = dailyFeed?.parkOfDay;
  const weather = dailyFeed?.rawWeatherData?.processedData?.current || dailyFeed?.rawWeatherData?.rawResponse?.current;

  const sun = {
    sunriseLocal: dailyFeed?.rawAstroData?.localTimes?.sunrise || dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise,
    sunsetLocal: dailyFeed?.rawAstroData?.localTimes?.sunset || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset,
    tz: dailyFeed?.rawAstroData?.localTimes?.timezone || dailyFeed?.rawAstroData?.timezone || 'Local Time'
  };

  const quickStats = useMemo(() => normalizeInsightArray(dailyFeed?.quickStatsInsights), [dailyFeed?.quickStatsInsights]);
  const skyInsights = useMemo(() => normalizeInsightArray(dailyFeed?.skyDataInsights), [dailyFeed?.skyDataInsights]);
  const parkInfo = useMemo(() => normalizeInsightArray(dailyFeed?.parkInfoInsights), [dailyFeed?.parkInfoInsights]);
  const recs = useMemo(() => normalizeInsightArray(dailyFeed?.personalizedRecommendations), [dailyFeed?.personalizedRecommendations]);
  const normalizedWeatherInsights = useMemo(() => normalizeTextBlock(dailyFeed?.weatherInsights), [dailyFeed?.weatherInsights]);

  const cleanSkyInsights = skyInsights.filter(insight =>
    insight &&
    typeof insight === 'string' &&
    !insight.startsWith('[') &&
    !insight.startsWith('"') &&
    insight.length > 10
  );
  const natureFact = dailyFeed?.natureFact;
  const weatherInsights = dailyFeed?.weatherInsights;

  const hasAnyAI =
    Boolean(natureFact) ||
    quickStats.length > 0 ||
    skyInsights.length > 0 ||
    parkInfo.length > 0 ||
    Boolean(weatherInsights) ||
    recs.length > 0;

  const statChips = useMemo(() => {
    const chips = [];
    if (weather?.condition) {
      const conditionIcon = weather.condition.toLowerCase().includes('snow') ? CloudSnow :
                           weather.condition.toLowerCase().includes('rain') ? Wind :
                           Sun;
      chips.push({ Icon: conditionIcon, label: weather.condition });
    }
    if (weather?.temperature != null) {
      const celsius = Math.round((weather.temperature - 32) * 5/9);
      chips.push({ Icon: Thermometer, label: `${Math.round(weather.temperature)}°F / ${celsius}°C` });
    }
    if (weather?.windSpeed != null) chips.push({ Icon: Wind, label: `${Math.round(weather.windSpeed)} mph wind` });
    if (weather?.humidity != null) chips.push({ Icon: Droplets, label: `${Math.round(weather.humidity)}% humidity` });
    if (weather?.visibility != null) chips.push({ Icon: EyeIcon, label: `${Math.round(weather.visibility)} mi vis.` });
    if (dailyFeed?.rawAstroData?.moonPhase) {
      const mp = dailyFeed?.rawAstroData?.moonPhase;
      chips.push({ Icon: Moon, label: String(mp) });
    }
    return chips.slice(0, 5);
  }, [weather, dailyFeed]);

  if (authLoading || (!userDataLoaded && isAuthenticated) || isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              {loadingTooLong ? 'Still working on it…' : 'Generating your personalized daily feed…'}
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              {loadingTooLong ? 'This is taking longer than usual. You can retry or wait.' : 'Crafting insights & recommendations'}
            </p>
            {loadingTooLong && (
              <button
                onClick={() => { refetch(); setLoadingTooLong(false); }}
                className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !user?._id) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Preparing your daily feed…</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Couldn&apos;t load today&apos;s feed</h1>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Please check your connection and try again.</p>
            <Button onClick={() => window.location.reload()} variant="primary" className="px-6 py-3">
              Retry
            </Button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  if (!dailyFeed || !park) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>No data available</h1>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Try refreshing the page.</p>
            <Button onClick={() => window.location.reload()} variant="primary" className="px-6 py-3">
              Refresh
            </Button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <section className="relative h-[60vh] md:h-[68vh] overflow-hidden">
        <OptimizedImage
          src={park?.image || '/background1.png'}
          alt={park?.name || 'Park of the Day'}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/90" />

        <div className="absolute top-0 left-0 right-0 z-10 pt-4 sm:pt-6">
          <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border"
              style={{
                backgroundColor: 'rgba(9, 14, 12, 0.72)',
                borderColor: 'rgba(255,255,255,0.14)',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)'
              }}
            >
              <Sparkle size={16} weight="duotone" className="text-[#d7f3e1]" />
              <span className="text-sm font-semibold text-white">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 pb-8 sm:pb-10 lg:pb-12">
          <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
            <div className="max-w-5xl xl:max-w-6xl">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur mb-4"
                style={{
                  backgroundColor: 'rgba(9, 14, 12, 0.68)',
                  borderWidth: '1px',
                  borderColor: 'rgba(215, 243, 225, 0.16)',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)'
                }}
              >
                <Mountains size={16} weight="duotone" className="text-[#d7f3e1]" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Personalized Daily Feed
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                {park?.states && (
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur"
                    style={{
                      backgroundColor: 'rgba(9, 14, 12, 0.68)',
                      borderWidth: '1px',
                      borderColor: 'rgba(215, 243, 225, 0.16)',
                    }}
                  >
                    <MapPinArea size={14} weight="duotone" className="text-[#d7f3e1]" />
                    <span className="text-xs font-semibold text-white uppercase tracking-wider">{park.states}</span>
                  </div>
                )}
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur"
                  style={{
                    backgroundColor: 'rgba(9, 14, 12, 0.68)',
                    borderWidth: '1px',
                    borderColor: 'rgba(215, 243, 225, 0.16)',
                  }}
                >
                  <Target size={14} weight="duotone" className="text-[#d7f3e1]" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">Today&apos;s Focus</span>
                </div>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white tracking-tight leading-tight drop-shadow-lg mb-4">
                Daily Nature Feed
              </h1>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-white/95 mb-3">
                {park?.name}
              </h2>
              <p className="text-base sm:text-lg max-w-3xl text-white/78 mb-6">
                A park-detail-style briefing for today: conditions, sky visibility, quick analysis, and recommendations you can actually use.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => router.push(`/parks/${park?.parkCode || 'unknown'}`)}
                  variant="primary"
                  size="lg"
                  icon={ExternalLink}
                  iconPosition="right"
                >
                  View Park Details
                </Button>
                <Button
                  onClick={() => router.push(`/plan-ai?park=${encodeURIComponent(park?.parkCode || 'unknown')}&name=${encodeURIComponent(park?.name || 'Park')}`)}
                  variant="secondary"
                  size="lg"
                  icon={CalendarDots}
                  className="backdrop-blur"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.22)',
                    color: 'white'
                  }}
                >
                  Plan with AI
                </Button>
                <Button
                  onClick={() => router.push('/explore')}
                  variant="secondary"
                  size="lg"
                  icon={MapTrifold}
                  className="backdrop-blur"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.18)',
                    color: 'white'
                  }}
                >
                  Explore All Parks
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10 lg:py-12">
        {/* Quick Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-orange) 12%, white 88%)', border: '1px solid color-mix(in srgb, var(--accent-orange) 20%, var(--border) 80%)' }}
              >
                <ThermometerSimple size={22} weight="duotone" style={{ color: 'var(--accent-orange)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Current Weather</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{weather?.condition || 'Conditions unavailable'}</p>
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {weather?.temperature != null ? `${Math.round(weather.temperature)}°F` : '—'}
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {weather?.condition ? `Plan around ${weather.condition.toLowerCase()} conditions before you head out.` : 'Current conditions are still loading for this park.'}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 12%, white 88%)', border: '1px solid color-mix(in srgb, var(--accent-green) 20%, var(--border) 80%)' }}
              >
                <SunDim size={22} weight="duotone" style={{ color: 'var(--accent-green)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Sun & Sky Timing</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Local timing and best darkness</p>
              </div>
            </div>
            <SunRow
              sun={sun}
              fallbacks={{
                sunrise: dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise,
                sunset: dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset
              }}
              timezone={dailyFeed?.rawAstroData?.timezone}
            />
            <DarknessHint
              sunset={sun?.sunsetLocal || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset}
              timezone={sun?.tz || dailyFeed?.rawAstroData?.timezone}
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-blue) 12%, white 88%)', border: '1px solid color-mix(in srgb, var(--accent-blue) 20%, var(--border) 80%)' }}
              >
                <CloudSun size={22} weight="duotone" style={{ color: 'var(--accent-blue)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Conditions Snapshot</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Live weather details</p>
              </div>
            </div>

            {!!statChips.length ? (
              <div className="flex flex-wrap gap-2">
                {statChips.map(({ Icon, label }, i) => (
                  <Chip key={i} icon={Icon}>{label}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Detailed conditions are not available right now.
              </p>
            )}
          </Card>

        </div>

        <div>
          <Card className="p-6 sm:p-8 mb-8">
            <SectionHeader icon={Sparkle} title="Daily Nature Feed" subtitle="Your lead insight for the day" />
            {natureFact ? (
              <p className="text-lg sm:text-xl leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {renderBoldText(natureFact)}
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nature feed unavailable for today.</p>
            )}
          </Card>

          <Card className="p-6 sm:p-8 mb-8">
            <SectionHeader icon={Mountains} title="Park Insights" subtitle="What matters most today" accent="var(--accent-green)" />
            {parkInfo.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {parkInfo.map((insight, idx) => (
                  <Bullet key={idx} icon={Binoculars}>{insight.replace(/^\d+\.\s*/, '')}</Bullet>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {park?.description || 'Discover amazing natural wonders…'}
              </p>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
            <Card className="p-6 sm:p-8">
              <SectionHeader icon={SunDim} title="Weather Analysis" subtitle="Comfort, safety, and what to wear" accent="var(--accent-orange)" />
              {normalizedWeatherInsights.length ? (
                <div className="space-y-3">
                  {normalizedWeatherInsights.map((line, i) => {
                    const cleanLine = line.replace(/^[-•\d+\.]\s*/, '').trim();
                    if (cleanLine) {
                      return <Bullet key={i} icon={NavigationArrow}>{cleanLine}</Bullet>;
                    }
                    return null;
                  })}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Weather insights are not available.</p>
              )}
            </Card>

            <Card className="p-6 sm:p-8">
              <SectionHeader icon={MoonStars} title="Sky Analysis" subtitle="Tonight's visibility & highlights" accent="var(--accent-blue)" />
              {cleanSkyInsights.length ? (
                <div className="space-y-3">
                  {cleanSkyInsights.map((line, i) => <Bullet key={i} icon={ShootingStar}>{line.replace(/^\d+\.\s*/, '')}</Bullet>)}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sky insights are not available.</p>
              )}
            </Card>

            <Card className="p-6 sm:p-8">
              <SectionHeader icon={MapPinArea} title="At a Glance" subtitle="Fast, practical takeaways" />
              {quickStats.length ? (
                <div className="space-y-3">
                  {quickStats.map((line, i) => <Bullet key={i}>{line.replace(/^\d+\.\s*/, '')}</Bullet>)}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Analysis will appear here.</p>
              )}
            </Card>
          </div>

          <Card className="p-6 sm:p-8">
            <SectionHeader icon={CompassRose} title="Personalized Recommendations" subtitle="Time-targeted activities and next steps" accent="var(--accent-blue)" />
            {recs.length ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {recs.map((r, i) => <Bullet key={i} icon={Check}>{r.replace(/^\d+\.\s*/, '')}</Bullet>)}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Recommendations will appear here.</p>
            )}
          </Card>
        </div>

        {!hasAnyAI && (
          <p className="text-center text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
            AI content not available right now.
          </p>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default DailyFeedPage;
