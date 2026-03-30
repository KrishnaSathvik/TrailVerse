"use client";

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  <div className={`rounded-2xl border shadow-sm ${className}`} style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
    {children}
  </div>
);

const SectionHeader = ({ icon: Icon, title, subtitle, accent = 'var(--accent-green)' }) => (
  <div className="flex items-start sm:items-center gap-4 mb-6">
    <div className="p-3 rounded-2xl" style={{ backgroundColor: accent }}>
      <Icon className="h-6 w-6 text-white" />
    </div>
    <div>
      <h3 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
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

const Bullet = ({ icon: Icon = Sparkles, children }) => (
  <div className="flex items-start gap-2">
    <div className="mt-1">
      <Icon className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
    </div>
    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {renderBoldText(children)}
    </p>
  </div>
);

const SunRow = ({ sun, fallbacks, timezone }) => {
  const formatTime = (timeValue) => {
    if (!timeValue || timeValue === '—') return '—';
    if (typeof timeValue === 'string' && (timeValue.includes('AM') || timeValue.includes('PM'))) {
      return timeValue;
    }
    try {
      const date = new Date(timeValue);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '—';
    }
  };

  const sunrise = formatTime(sun?.sunriseLocal || fallbacks?.sunrise);
  const sunset = formatTime(sun?.sunsetLocal || fallbacks?.sunset);
  const tz = sun?.tz || timezone || 'Local Time';

  return (
    <div className="flex flex-wrap gap-2">
      <Chip icon={Sun} title="Sunrise">{sunrise}</Chip>
      <Chip icon={Moon} title="Sunset">{sunset}</Chip>
      <Chip icon={Clock} title="Timezone">{tz}</Chip>
    </div>
  );
};

const DarknessHint = ({ sunset }) => {
  if (!sunset || sunset === '—') return null;

  const calculateDarknessTime = (sunsetTimeStr) => {
    try {
      const [time, ampm] = sunsetTimeStr.split(' ');
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
      return '~90 min after ' + sunsetTimeStr;
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
  const { user } = useAuth();

  const fetchFeed = async () => {
    if (user?._id) {
      return dailyFeedService.getDailyFeed(user._id, false);
    }
    const [parkData, natureFact] = await Promise.all([
      dailyFeedService.getParkOfDay().catch(() => null),
      dailyFeedService.getNatureFact().catch(() => null),
    ]);
    return {
      parkOfDay: parkData,
      natureFact: natureFact,
      quickStatsInsights: [],
      skyDataInsights: [],
      parkInfoInsights: [],
      personalizedRecommendations: [],
    };
  };

  const { data: dailyFeed, isLoading, error } = useQuery({
    queryKey: ['dailyFeed', new Date().toISOString().split('T')[0], user?._id || 'anonymous'],
    queryFn: fetchFeed,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 1000,
    enabled: true,
  });

  const park = dailyFeed?.parkOfDay;
  const weather = dailyFeed?.rawWeatherData?.processedData?.current || dailyFeed?.rawWeatherData?.rawResponse?.current;

  const sun = {
    sunriseLocal: dailyFeed?.rawAstroData?.localTimes?.sunrise || dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise,
    sunsetLocal: dailyFeed?.rawAstroData?.localTimes?.sunset || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset,
    tz: dailyFeed?.rawAstroData?.localTimes?.timezone || dailyFeed?.rawAstroData?.timezone || 'Local Time'
  };

  const quickStats = dailyFeed?.quickStatsInsights || [];
  const skyInsights = dailyFeed?.skyDataInsights || [];
  const parkInfo = dailyFeed?.parkInfoInsights || [];
  const recs = dailyFeed?.personalizedRecommendations || [];

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

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Generating your personalized daily feed…</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Crafting insights & recommendations</p>
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
            <Button onClick={() => window.location.reload()} className="px-6 py-3" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
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
            <Button onClick={() => window.location.reload()} className="px-6 py-3" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
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
              style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.18)' }}
            >
              <Sparkles className="h-4 w-4 text-white" />
              <span className="text-sm font-medium text-white/90">
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
                  backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  borderWidth: '1px',
                  borderColor: 'rgba(255, 255, 255, 0.22)',
                }}
              >
                <Mountain className="h-4 w-4 text-white" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Personalized Daily Feed
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                {park?.states && (
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      borderWidth: '1px',
                      borderColor: 'rgba(255, 255, 255, 0.18)',
                    }}
                  >
                    <MapPin className="h-3.5 w-3.5 text-white" />
                    <span className="text-xs font-semibold text-white uppercase tracking-wider">{park.states}</span>
                  </div>
                )}
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.18)',
                  }}
                >
                  <Compass className="h-3.5 w-3.5 text-white" />
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
                  icon={Calendar}
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
                  icon={Compass}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <Thermometer className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Current Weather</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{weather?.condition || 'Conditions unavailable'}</p>
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {weather?.temperature != null ? `${Math.round(weather.temperature)}°F` : '—'}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <Sun className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Sun Schedule</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Local timing</p>
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
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <Moon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Darkness Window</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Best sky timing</p>
              </div>
            </div>
            <DarknessHint sunset={sun?.sunsetLocal || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset} />
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-hover)' }}>
                <MapPin className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Destination</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{park?.states || 'Location unavailable'}</p>
              </div>
            </div>
            <Link href={`/parks/${park?.parkCode || 'unknown'}`} className="inline-flex items-center gap-2 group">
              <p className="text-lg font-semibold group-hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                {park?.name}
              </p>
              <ExternalLink className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
            </Link>
          </Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <Card className="p-6 sm:p-8 mb-8">
              <SectionHeader icon={Sparkles} title="Daily Nature Feed" subtitle="Your lead insight for the day" />
              {natureFact ? (
                <div className="rounded-2xl p-5 sm:p-6 border"
                  style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}
                >
                  <p className="text-lg sm:text-xl leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {renderBoldText(natureFact)}
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nature feed unavailable for today.</p>
              )}
            </Card>

            {/* Park Insights */}
            <Card className="p-6 mb-8">
              <SectionHeader icon={Sparkles} title="Park Insights" subtitle="What matters most today" />
              {parkInfo.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {parkInfo.map((insight, idx) => (
                    <div key={idx} className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
                      <Bullet>{insight.replace(/^\d+\.\s*/, '')}</Bullet>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {park?.description || 'Discover amazing natural wonders…'}
                </p>
              )}
            </Card>

            {/* Two-column: Weather / Sky */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <Card className="p-6">
                <SectionHeader icon={Sun} title="Weather Analysis" subtitle="Comfort, safety, and what to wear" accent="var(--accent-orange)" />
                {weatherInsights ? (
                  <div className="space-y-3">
                    {weatherInsights.split('\n').filter(Boolean).map((line, i) => {
                      const cleanLine = line.replace(/^[-•\d+\.]\s*/, '').trim();
                      if (cleanLine) {
                        return <Bullet key={i}>{cleanLine}</Bullet>;
                      }
                      return null;
                    })}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Weather insights are not available.</p>
                )}
              </Card>

              <Card className="p-6">
                <SectionHeader icon={Star} title="Sky Analysis" subtitle="Tonight's visibility & highlights" accent="var(--accent-blue)" />
                {cleanSkyInsights.length ? (
                  <div className="space-y-3">
                    {cleanSkyInsights.map((line, i) => <Bullet key={i} icon={Star}>{line.replace(/^\d+\.\s*/, '')}</Bullet>)}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sky insights are not available.</p>
                )}
              </Card>
            </div>

            <Card className="p-6">
              <SectionHeader icon={Compass} title="Personalized Recommendations" subtitle="Time-targeted activities and next steps" accent="var(--accent-blue)" />
              {recs.length ? (
                <div className="space-y-3">
                  {recs.map((r, i) => <Bullet key={i} icon={Check}>{r.replace(/^\d+\.\s*/, '')}</Bullet>)}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Recommendations will appear here.</p>
              )}
            </Card>
          </div>

          <aside className="lg:w-[360px] flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              <Card className="p-6">
                <SectionHeader icon={Mountain} title="At a Glance" subtitle="Fast, practical takeaways" />
                {quickStats.length ? (
                  <div className="space-y-3 mb-5">
                    {quickStats.map((line, i) => <Bullet key={i}>{line.replace(/^\d+\.\s*/, '')}</Bullet>)}
                  </div>
                ) : (
                  <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>Analysis will appear here.</p>
                )}

                {!!statChips.length && (
                  <div className="flex flex-wrap gap-2">
                    {statChips.map(({ Icon, label }, i) => (
                      <Chip key={i} icon={Icon}>{label}</Chip>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="hidden lg:block p-6">
                <SectionHeader icon={Calendar} title="Next Steps" subtitle="Keep moving from insight to action" accent="var(--accent-green)" />
                <div className="space-y-3">
                  <Button onClick={() => router.push(`/parks/${park?.parkCode || 'unknown'}`)} className="w-full justify-center px-6 py-3" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
                    View Park Details
                  </Button>
                  <Button
                    onClick={() => router.push(`/plan-ai?park=${encodeURIComponent(park?.parkCode || 'unknown')}&name=${encodeURIComponent(park?.name || 'Park')}`)}
                    className="w-full justify-center px-6 py-3"
                    style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    icon={ArrowRight}
                    iconPosition="right"
                  >
                    Plan with AI
                  </Button>
                </div>
              </Card>
            </div>
          </aside>
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
