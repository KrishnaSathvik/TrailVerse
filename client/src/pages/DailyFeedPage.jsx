import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Sun, Moon, Star, MapPin, Calendar, Users, 
  Heart, ExternalLink, Loader2, Compass, Mountain, Sparkles, Clock, Eye,
  Thermometer, Wind, Droplets, Eye as EyeIcon, Zap, Check, CloudSnow
} from '@components/icons';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import Button from '../components/common/Button';
import dailyFeedService from '../services/dailyFeedService';
import { useAuth } from '../context/AuthContext';

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

// Helper function to render text with bold formatting
const renderBoldText = (text) => {
  if (!text) return text;
  
  // Split text by **bold** patterns and render accordingly
  const parts = text.split(/(\*\*.*?\*\*)/);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // This is bold text
      const boldText = part.slice(2, -2); // Remove ** markers
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
  // Convert UTC times to local time format (only if it's a UTC timestamp string)
  const formatTime = (timeValue) => {
    if (!timeValue || timeValue === '—') return '—';
    
    // If it's already a formatted time string (e.g., "7:00 AM"), return it as-is
    if (typeof timeValue === 'string' && (timeValue.includes('AM') || timeValue.includes('PM'))) {
      return timeValue;
    }
    
    // Otherwise, try to parse it as a UTC timestamp
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
  
  // Calculate best darkness time (90 minutes after sunset)
  const calculateDarknessTime = (sunsetTimeStr) => {
    try {
      // Parse the sunset time string (e.g., "6:00 PM")
      const [time, ampm] = sunsetTimeStr.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      
      // Convert to 24-hour format
      let hour24 = hours;
      if (ampm === 'PM' && hours !== 12) hour24 += 12;
      if (ampm === 'AM' && hours === 12) hour24 = 0;
      
      // Add 90 minutes
      const date = new Date();
      date.setHours(hour24, minutes + 90, 0);
      
      // Format back to 12-hour format
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
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: dailyFeed, isLoading, error, isStale, dataUpdatedAt } = useQuery({
    queryKey: ['dailyFeed', new Date().toISOString().split('T')[0], user?._id],
    queryFn: () => dailyFeedService.getDailyFeed(user._id, false),
    staleTime: 24 * 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 1000,
    enabled: !!user?._id,
  });

  const park = dailyFeed?.parkOfDay;
  const weather = dailyFeed?.rawWeatherData?.processedData?.current || dailyFeed?.rawWeatherData?.rawResponse?.current;
  
  // Extract sun data from rawAstroData (use localTimes if available, fallback to processedData)
  const sun = {
    sunriseLocal: dailyFeed?.rawAstroData?.localTimes?.sunrise || dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise,
    sunsetLocal: dailyFeed?.rawAstroData?.localTimes?.sunset || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset,
    tz: dailyFeed?.rawAstroData?.localTimes?.timezone || dailyFeed?.rawAstroData?.timezone || 'Local Time'
  };

  const quickStats = dailyFeed?.quickStatsInsights || [];
  const skyInsights = dailyFeed?.skyDataInsights || [];
  const parkInfo = dailyFeed?.parkInfoInsights || [];
  const recs = dailyFeed?.personalizedRecommendations || [];
  
  // Clean up malformed sky insights
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

  // derive compact stats chips
  const statChips = useMemo(() => {
    const chips = [];
    
    // Weather condition first (most important)
    if (weather?.condition) {
      const conditionIcon = weather.condition.toLowerCase().includes('snow') ? CloudSnow : 
                           weather.condition.toLowerCase().includes('rain') ? Wind : 
                           Sun;
      chips.push({ Icon: conditionIcon, label: weather.condition });
    }
    
    // Temperature with dual display
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
            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Couldn't load today's feed</h1>
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
      <SEO
        title={`Daily Feed — ${park?.name || 'Park'}`}
        description="Personalized AI park insights, weather, astronomy, and recommendations"
        keywords="national parks, AI, weather, astronomy, stargazing"
      />
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
                  <h1 className="text-4xl sm:text-5xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Daily Nature Feed
                  </h1>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Clear, actionable tips for {park?.name}
          </p>
        </div>

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
          <div className="lg:col-span-3">
            <div className="relative overflow-hidden rounded-3xl shadow-2xl">
              <div className="relative h-80 sm:h-96 lg:h-[460px]">
                <OptimizedImage
                  src={park?.image || '/background1.png'}
                  alt={park?.name || 'Park of the Day'}
                  className="w-full h-full object-cover"
                />
                        <div className="absolute top-6 left-6">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.25)' }}>
                            <Sparkles className="h-4 w-4 text-white" />
                            <span className="text-xs font-bold text-white tracking-wide">PERSONALIZED</span>
                          </div>
                        </div>
              </div>
            </div>
          </div>

          {/* Right column: Park title + Sun row + compact stats */}
          <div className="lg:col-span-2">
            <Card className="p-6 h-full">
              <div className="flex items-center justify-between gap-3 mb-3">
                        <Link to={`/parks/${park?.parkCode || 'unknown'}`} className="inline-flex items-start gap-2 group">
                          <h2 className="text-2xl sm:text-3xl font-bold group-hover:opacity-90 transition-opacity leading-tight" style={{ color: 'var(--text-primary)' }}>
                            {park?.name}
                          </h2>
                          <ExternalLink className="h-5 w-5 mt-1 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                        </Link>
                {park?.states && <Chip icon={MapPin}>{park.states}</Chip>}
              </div>

              <div className="mb-4">
                <SunRow 
                  sun={sun} 
                  fallbacks={{ 
                    sunrise: dailyFeed?.rawAstroData?.processedData?.sunrise || dailyFeed?.rawAstroData?.rawResponse?.results?.sunrise, 
                    sunset: dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset 
                  }} 
                  timezone={dailyFeed?.rawAstroData?.timezone} 
                />
                <DarknessHint sunset={sun?.sunsetLocal || dailyFeed?.rawAstroData?.processedData?.sunset || dailyFeed?.rawAstroData?.rawResponse?.results?.sunset} />
              </div>

              {!!statChips.length && (
                <div className="flex flex-wrap gap-2">
                  {statChips.map(({ Icon, label }, i) => (
                    <Chip key={i} icon={Icon}>{label}</Chip>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Park Insights (highlights) */}
        <Card className="p-6 mb-10">
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-10">
          <Card className="p-6">
            <SectionHeader icon={Sun} title="Weather Analysis" subtitle="Comfort, safety, and what to wear" accent="var(--accent-orange)" />
            {weatherInsights ? (
              <div className="space-y-3">
                {weatherInsights.split('\n').filter(Boolean).map((line, i) => {
                  // Handle both bullet points and numbered lists
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

        {/* Quick Stats + Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <Card className="p-6">
            <SectionHeader icon={Mountain} title="Park Analysis" subtitle="Fast, practical takeaways" />
            {quickStats.length ? (
              <div className="space-y-3">
                {quickStats.map((line, i) => <Bullet key={i}>{line.replace(/^\d+\.\s*/, '')}</Bullet>)}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Analysis will appear here.</p>
            )}
          </Card>

          <Card className="p-6">
            <SectionHeader icon={Compass} title=" Personalized Recommendations" subtitle="Time-targeted activities" accent="var(--accent-blue)" />
            {natureFact && (
              <div className="mb-4 p-4 rounded-xl border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
                <div className="flex items-start gap-2 mb-1">
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Daily Nature Feed</h4>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{natureFact.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
              </div>
            )}
            {recs.length ? (
              <div className="space-y-3">
                {recs.map((r, i) => <Bullet key={i} icon={Check}>{r.replace(/^\d+\.\s*/, '')}</Bullet>)}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Recommendations will appear here.</p>
            )}
          </Card>
        </div>


        {/* CTA */}
        <Card className="p-6 text-center">
          <h3 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Ready to explore?</h3>
          <p className="text-sm sm:text-base mb-5" style={{ color: 'var(--text-secondary)' }}>
            Get deeper details about {park?.name} and plan your visit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => navigate(`/parks/${park?.parkCode || 'unknown'}`)} className="px-6 py-3" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
              View Park Details
            </Button>
            <Button 
              onClick={() => navigate(`/plan-ai?park=${encodeURIComponent(park?.parkCode || 'unknown')}&name=${encodeURIComponent(park?.name || 'Park')}`)} 
              className="px-6 py-3" 
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              icon={Calendar}
            >
              Plan with AI
            </Button>
          </div>

        </Card>

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