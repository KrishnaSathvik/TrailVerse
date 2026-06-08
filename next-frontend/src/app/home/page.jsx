"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Sparkle,
  CompassRose,
  SunDim,
  MoonStars,
  CalendarDots,
  ThermometerSimple,
  Mountains,
  ShootingStar,
  NavigationArrow,
  Binoculars,
  MapPinArea
} from '@phosphor-icons/react';
import {
  Sun, Moon, Star,
  ExternalLink, Loader2, Sparkles, Clock,
  Wind, Droplets, Eye as EyeIcon, Check, ChevronDown,
  AlertTriangle, Shield, Info
} from '@components/icons';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import Button from '@/components/common/Button';
import dailyFeedService from '@/services/dailyFeedService';
import npsApi from '@/services/npsApi';
import { parkToSlug } from '@/utils/parkSlug';
import { getFeedDateKey } from '@/utils/dailyFeedDate';
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

const CollapsibleBriefingSection = ({
  icon: Icon,
  title,
  subtitle,
  accent = 'var(--accent-green)',
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        id={`${sectionId}-trigger`}
        aria-expanded={open}
        aria-controls={`${sectionId}-panel`}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start gap-4 p-5 sm:p-6 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 12%, white 88%)`,
            border: `1px solid color-mix(in srgb, ${accent} 20%, var(--border) 80%)`,
          }}
        >
          <Icon size={22} weight="duotone" style={{ color: accent }} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <ChevronDown
              className={`h-5 w-5 shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </div>
          {subtitle && (
            <p className="text-sm mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div
          id={`${sectionId}-panel`}
          role="region"
          aria-labelledby={`${sectionId}-trigger`}
          className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0"
        >
          <div className="sm:pl-[4rem]">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

const SnapshotPanelHeader = ({ icon: Icon, title, accent = 'var(--accent-green)' }) => (
  <div className="flex items-center gap-2.5 mb-3">
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 12%, white 88%)`,
        border: `1px solid color-mix(in srgb, ${accent} 20%, var(--border) 80%)`,
      }}
    >
      <Icon size={18} weight="duotone" style={{ color: accent }} />
    </div>
    <h3 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
      {title}
    </h3>
  </div>
);

const SnapshotRow = ({ icon: Icon, label, value }) => {
  if (value == null || value === '' || value === '—') return null;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <span className="text-sm font-semibold text-right shrink-0" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
};

const SnapshotRows = ({ children }) => (
  <div
    className="[&>div+div]:border-t [&>div+div]:mt-0"
    style={{ borderColor: 'var(--border)' }}
  >
    {children}
  </div>
);

const getBestDarknessTime = (sunset, timezone) => {
  if (!sunset || sunset === '—') return null;

  try {
    const normalizedSunset = formatAstroTime(sunset, timezone);
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
  } catch {
    return null;
  }
};

const TodaySnapshot = ({ weather, sun, dailyFeed, conditionRows }) => {
  const astroTimezone = sun?.tz || dailyFeed?.rawAstroData?.timezone;
  const sunriseRaw =
    sun?.sunriseLocal ||
    dailyFeed?.rawAstroData?.processedData?.sunrise ||
    dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise;
  const sunsetRaw =
    sun?.sunsetLocal ||
    dailyFeed?.rawAstroData?.processedData?.sunset ||
    dailyFeed?.rawAstroData?.rawResponse?.results?.sunset;

  const sunrise = formatAstroTime(sunriseRaw, astroTimezone);
  const sunset = formatAstroTime(sunsetRaw, astroTimezone);
  const timezoneLabel = formatTimezoneLabel(astroTimezone);
  const bestDarkness = getBestDarknessTime(sunsetRaw, astroTimezone);

  const panelClass =
    'p-5 sm:p-6 border-t md:border-t-0 md:border-l first:border-t-0 md:first:border-l-0';

  return (
    <Card className="overflow-hidden mb-10">
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderColor: 'var(--border)' }}>
        <div className={panelClass} style={{ borderColor: 'var(--border)' }}>
          <SnapshotPanelHeader icon={ThermometerSimple} title="Weather now" accent="var(--accent-orange)" />
          <p className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {weather?.temperature != null ? `${Math.round(weather.temperature)}°F` : '—'}
          </p>
          <p className="text-base mt-1 capitalize" style={{ color: 'var(--text-secondary)' }}>
            {weather?.condition || 'Unavailable'}
          </p>
          {weather?.temperature != null && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {Math.round((weather.temperature - 32) * (5 / 9))}°C · live at the park
            </p>
          )}
        </div>

        <div className={panelClass} style={{ borderColor: 'var(--border)' }}>
          <SnapshotPanelHeader icon={SunDim} title="Sun & sky" accent="var(--accent-green)" />
          <SnapshotRows>
            <SnapshotRow icon={Sun} label="Sunrise" value={sunrise} />
            <SnapshotRow icon={Moon} label="Sunset" value={sunset} />
            <SnapshotRow icon={Star} label="Best stargazing" value={bestDarkness} />
            <SnapshotRow icon={Clock} label="Timezone" value={timezoneLabel} />
          </SnapshotRows>
        </div>

        <div className={panelClass} style={{ borderColor: 'var(--border)' }}>
          <SnapshotPanelHeader icon={MoonStars} title="Conditions" accent="var(--accent-blue)" />
          {conditionRows.length ? (
            <SnapshotRows>
              {conditionRows.map(({ Icon, label, value }) => (
                <SnapshotRow key={label} icon={Icon} label={label} value={value} />
              ))}
            </SnapshotRows>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Detailed conditions are not available right now.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

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

const cleanInsightLine = (line) => String(line || '').replace(/^[-•\d+\.]\s*/, '').replace(/^\d+\.\s*/, '').trim();

const cleanInsightLines = (lines) => lines.map(cleanInsightLine).filter(Boolean);

const insightFingerprint = (text) => {
  const normalized = cleanInsightLine(text).toLowerCase().replace(/[^\w\s]/g, '');
  return normalized.split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
};

const mergeUniqueLines = (...groups) => {
  const seen = new Set();
  const result = [];

  for (const lines of groups) {
    for (const line of lines) {
      const cleaned = cleanInsightLine(line);
      if (!cleaned) continue;

      const fingerprint = insightFingerprint(cleaned);
      if (!fingerprint || seen.has(fingerprint)) continue;

      seen.add(fingerprint);
      result.push(cleaned);
    }
  }

  return result;
};

const InsightBullet = ({ icon: Icon = Sparkles, children }) => {
  const text = typeof children === 'string' ? children : String(children || '');
  const colonIndex = text.indexOf(':');
  const hasLabel = colonIndex > 0 && colonIndex < 48;
  const label = hasLabel ? text.slice(0, colonIndex).trim() : null;
  const body = hasLabel ? text.slice(colonIndex + 1).trim() : text;

  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 12%, white 88%)' }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: 'var(--accent-green)' }} />
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {label ? (
          <>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}: </span>
            {renderBoldText(body)}
          </>
        ) : (
          renderBoldText(body)
        )}
      </p>
    </div>
  );
};

const getAlertSeverityConfig = (category) => {
  switch (category?.toLowerCase()) {
    case 'danger':
      return { accent: '#ef4444', icon: Shield, label: 'Danger', badgeBg: 'rgba(239, 68, 68, 0.12)' };
    case 'park closure':
      return { accent: '#dc2626', icon: Shield, label: 'Closure', badgeBg: 'rgba(239, 68, 68, 0.1)' };
    case 'caution':
      return { accent: '#f97316', icon: AlertTriangle, label: 'Caution', badgeBg: 'rgba(251, 146, 60, 0.12)' };
    case 'information':
      return { accent: '#3b82f6', icon: Info, label: 'Info', badgeBg: 'rgba(59, 130, 246, 0.1)' };
    default:
      return {
        accent: 'var(--text-secondary)',
        icon: Info,
        label: category || 'Notice',
        badgeBg: 'var(--surface-hover)',
      };
  }
};

const HomeAlertsStrip = ({ alerts, parkName }) => {
  if (!alerts?.length) return null;

  const count = alerts.length;
  const hasDanger = alerts.some((alert) =>
    ['danger', 'park closure', 'caution'].includes(alert.category?.toLowerCase())
  );

  return (
    <section className="mb-8" aria-labelledby="home-alerts-heading">
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: hasDanger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.1)',
            border: `1px solid ${hasDanger ? 'rgba(239, 68, 68, 0.22)' : 'rgba(59, 130, 246, 0.2)'}`,
          }}
        >
          <AlertTriangle
            className="h-5 w-5"
            style={{ color: hasDanger ? '#ef4444' : '#3b82f6' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="home-alerts-heading"
            className="text-base sm:text-lg font-semibold leading-snug"
            style={{ color: 'var(--text-primary)' }}
          >
            {count} active alert{count === 1 ? '' : 's'}
          </h2>
          <p className="text-sm mt-0.5 leading-snug line-clamp-2 sm:line-clamp-none" style={{ color: 'var(--text-secondary)' }}>
            {parkName}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {alerts.map((alert, index) => {
          const config = getAlertSeverityConfig(alert.category);
          const SeverityIcon = config.icon;

          return (
            <li
              key={alert.id || `${alert.title}-${index}`}
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--border)',
                borderLeftWidth: '4px',
                borderLeftColor: config.accent,
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <span
                    className="inline-flex w-fit max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      backgroundColor: config.badgeBg,
                      color: config.accent,
                    }}
                  >
                    <SeverityIcon className="h-3 w-3 shrink-0" />
                    {config.label}
                  </span>
                  {alert.url && (
                    <a
                      href={alert.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0"
                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                    >
                      NPS details
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <h3
                  className="mt-3 text-[15px] sm:text-base font-semibold leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {alert.title}
                </h3>

                {alert.description && (
                  <p
                    className="mt-2 text-sm leading-relaxed break-words"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {alert.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// ---------- Page ----------

const DailyFeedPage = () => {
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  const today = getFeedDateKey();
  const canFetch = !authLoading && isAuthenticated && !!user?._id;

  // Single query — feed is pre-generated by the backend scheduler
  const { data: dailyFeed, isLoading, error } = useQuery({
    queryKey: ['dailyFeed', today],
    queryFn: () => dailyFeedService.getDailyFeed(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 3000,
    enabled: canFetch,
  });

  const park = dailyFeed?.parkOfDay;
  const parkHref = `/parks/${parkToSlug(park?.name) || park?.parkCode || 'unknown'}`;

  const { data: parkAlerts = [] } = useQuery({
    queryKey: ['homeParkAlerts', park?.parkCode],
    queryFn: () => npsApi.getParkAlerts(park.parkCode),
    staleTime: 5 * 60 * 1000,
    enabled: !!park?.parkCode,
  });

  // ---------- Derived values ----------
  const weather = dailyFeed?.rawWeatherData?.processedData?.current || dailyFeed?.rawWeatherData?.rawResponse?.current;

  const sun = {
    sunriseLocal: dailyFeed?.rawAstroData?.localTimes?.sunrise || dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise,
    sunsetLocal: dailyFeed?.rawAstroData?.localTimes?.sunset || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset,
    tz: dailyFeed?.rawAstroData?.localTimes?.timezone || dailyFeed?.rawAstroData?.timezone || 'Local Time'
  };

  const natureFact = dailyFeed?.natureFact || null;
  const weatherInsightsRaw = dailyFeed?.weatherInsights || null;
  const quickStatsRaw = dailyFeed?.quickStatsInsights || null;
  const skyDataRaw = dailyFeed?.skyDataInsights || null;
  const parkInfoRaw = dailyFeed?.parkInfoInsights || null;
  const recsRaw = dailyFeed?.personalizedRecommendations || null;
  const stargazingGuideRaw = dailyFeed?.stargazingGuide || null;

  const quickStats = useMemo(() => cleanInsightLines(normalizeInsightArray(quickStatsRaw)), [quickStatsRaw]);
  const skyInsights = useMemo(() => cleanInsightLines(
    normalizeInsightArray(skyDataRaw).filter(
      (insight) => insight && !insight.startsWith('[') && !insight.startsWith('"') && insight.length > 10
    )
  ), [skyDataRaw]);
  const parkInfo = useMemo(() => cleanInsightLines(normalizeInsightArray(parkInfoRaw)), [parkInfoRaw]);
  const recs = useMemo(() => cleanInsightLines(normalizeInsightArray(recsRaw)), [recsRaw]);
  const weatherInsights = useMemo(() => cleanInsightLines(normalizeTextBlock(weatherInsightsRaw)), [weatherInsightsRaw]);
  const stargazingGuideLines = useMemo(() => cleanInsightLines(normalizeTextBlock(stargazingGuideRaw)), [stargazingGuideRaw]);
  const skyAndStargazing = useMemo(
    () => mergeUniqueLines(skyInsights, stargazingGuideLines),
    [skyInsights, stargazingGuideLines]
  );

  const todaysParkLabel = park?.states ? `Today's Park · ${park.states}` : "Today's Park";

  const conditionRows = useMemo(() => {
    const rows = [];
    if (weather?.windSpeed != null) {
      rows.push({ Icon: Wind, label: 'Wind', value: `${Math.round(weather.windSpeed)} mph` });
    }
    if (weather?.humidity != null) {
      rows.push({ Icon: Droplets, label: 'Humidity', value: `${Math.round(weather.humidity)}%` });
    }
    if (weather?.visibility != null) {
      rows.push({ Icon: EyeIcon, label: 'Visibility', value: `${Math.round(weather.visibility)} mi` });
    }
    if (dailyFeed?.rawAstroData?.moonPhase) {
      rows.push({ Icon: Moon, label: 'Moon', value: String(dailyFeed.rawAstroData.moonPhase) });
    }
    return rows;
  }, [weather, dailyFeed]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Not authenticated — show nothing while redirect fires
  if (!authLoading && !isAuthenticated) return null;

  // ---------- Loading ----------
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Loading your daily feed…</p>
          </div>
        </div>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <section className="relative w-full overflow-hidden min-h-[26rem] sm:min-h-[24rem] md:h-[68vh] md:max-h-[44rem]">
        <OptimizedImage
          src={park?.image || '/background1.png'}
          alt={park?.name || 'Park of the Day'}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/80 sm:from-black/50 sm:via-black/35 sm:to-black/90" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black/95 via-black/80 to-transparent sm:hidden"
          aria-hidden="true"
        />

        <div className="relative z-10 flex min-h-[26rem] flex-col justify-end px-4 pb-6 pt-8 sm:min-h-[24rem] sm:justify-start sm:px-6 sm:py-8 sm:pt-8 lg:px-10 xl:px-12 md:flex md:min-h-full md:justify-end md:pb-10 lg:pb-12">
          <div className="max-w-[92rem] mx-auto w-full">
            <div className="max-w-5xl xl:max-w-6xl">
              <div className="mb-5 flex flex-wrap items-center gap-2 sm:mb-4">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-4 sm:py-2 rounded-full backdrop-blur-md border"
                  style={{
                    backgroundColor: 'rgba(9, 14, 12, 0.72)',
                    borderColor: 'rgba(255,255,255,0.14)',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)'
                  }}
                >
                  <Sparkle size={14} weight="duotone" className="text-[#d7f3e1] shrink-0 sm:hidden" />
                  <Sparkle size={16} weight="duotone" className="text-[#d7f3e1] shrink-0 hidden sm:block" />
                  <span className="text-[11px] sm:text-sm font-semibold text-white">
                    <span className="sm:hidden">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="hidden sm:inline">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </span>
                </div>

                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full backdrop-blur"
                  style={{
                    backgroundColor: 'rgba(9, 14, 12, 0.68)',
                    borderWidth: '1px',
                    borderColor: 'rgba(215, 243, 225, 0.16)',
                    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)'
                  }}
                >
                  <Mountains size={14} weight="duotone" className="text-[#d7f3e1] shrink-0 sm:hidden" />
                  <Mountains size={16} weight="duotone" className="text-[#d7f3e1] shrink-0 hidden sm:block" />
                  <span className="text-[10px] sm:text-xs font-semibold text-white uppercase tracking-wider">
                    {todaysParkLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                <h1
                  className="text-[1.65rem] font-semibold text-white tracking-tight leading-[1.15] [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] sm:text-5xl sm:leading-[1.2] lg:text-6xl sm:drop-shadow-lg"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {park?.name}
                </h1>
                <p className="text-[0.95rem] font-medium text-white/95 [text-shadow:0_1px_12px_rgba(0,0,0,0.55)] sm:text-2xl sm:text-white/90 sm:[text-shadow:none]">
                  Your daily briefing
                </p>
                <p className="max-w-3xl text-sm leading-relaxed text-white/90 text-pretty [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:text-lg sm:text-white/78 sm:leading-normal sm:text-balance sm:[text-shadow:none]">
                  <span className="sm:hidden">
                    Weather, alerts, and tips for today&apos;s featured park.
                  </span>
                  <span className="hidden sm:inline">
                    Weather, sky conditions, active alerts, and practical recommendations for today&apos;s featured park.
                  </span>
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:mt-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <Button
                  onClick={() => router.push(parkHref)}
                  variant="primary"
                  size="md"
                  icon={ExternalLink}
                  iconPosition="right"
                  className="w-full justify-center sm:w-auto"
                >
                  View Park Details
                </Button>
                <div className="hidden sm:contents lg:hidden">
                  <Button
                    onClick={() => router.push(`/plan-ai?park=${encodeURIComponent(park?.parkCode || 'unknown')}&name=${encodeURIComponent(park?.name || 'Park')}`)}
                    variant="secondary"
                    size="md"
                    icon={CalendarDots}
                    className="w-full justify-center backdrop-blur sm:w-auto"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderWidth: '1px',
                      borderColor: 'rgba(255, 255, 255, 0.22)',
                      color: 'white'
                    }}
                  >
                    Plan with Trailie
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 sm:py-10 lg:py-12">
        <HomeAlertsStrip alerts={parkAlerts} parkName={park?.name} />

        <TodaySnapshot weather={weather} sun={sun} dailyFeed={dailyFeed} conditionRows={conditionRows} />

        <div>
          <Card className="p-6 sm:p-8 mb-8">
            <SectionHeader icon={Sparkle} title="Nature Fact" subtitle="Today's lead insight for this park" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                {parkInfo.map((insight, idx) => (
                  <InsightBullet key={idx} icon={Binoculars}>{insight}</InsightBullet>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {park?.description || 'Discover amazing natural wonders…'}
              </p>
            )}
          </Card>

          {!!recs.length && (
            <Card className="p-6 sm:p-8 mb-8">
              <SectionHeader icon={CompassRose} title="Today's Recommendations" subtitle="Activities and next steps for this park" accent="var(--accent-blue)" />
              <div className="grid grid-cols-1 gap-1">
                {recs.map((r, i) => (
                  <InsightBullet key={i} icon={Check}>{r}</InsightBullet>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden mb-8 p-0">
            <CollapsibleBriefingSection
              icon={SunDim}
              title="Weather Analysis"
              subtitle="Comfort, safety, and what to wear"
              accent="var(--accent-orange)"
            >
              {weatherInsights.length ? (
                <div className="space-y-1">
                  {weatherInsights.map((line, i) => (
                    <InsightBullet key={i} icon={NavigationArrow}>{line}</InsightBullet>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Weather insights are not available.</p>
              )}
            </CollapsibleBriefingSection>

            <CollapsibleBriefingSection
              icon={MoonStars}
              title="Sky & Stargazing"
              subtitle="Tonight's visibility, best times, and what to look for"
              accent="var(--accent-blue)"
            >
              {skyAndStargazing.length ? (
                <div className="space-y-1">
                  {skyAndStargazing.map((line, i) => (
                    <InsightBullet key={i} icon={ShootingStar}>{line}</InsightBullet>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sky and stargazing insights are not available.</p>
              )}
            </CollapsibleBriefingSection>

            <CollapsibleBriefingSection
              icon={MapPinArea}
              title="At a Glance"
              subtitle="Elevation, timing, and visit planning"
            >
              {quickStats.length ? (
                <div className="space-y-1">
                  {quickStats.map((line, i) => <InsightBullet key={i}>{line}</InsightBullet>)}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Planning notes will appear here.</p>
              )}
            </CollapsibleBriefingSection>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DailyFeedPage;
