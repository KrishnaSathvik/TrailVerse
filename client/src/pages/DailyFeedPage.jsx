import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Sun, Moon, Star, MapPin, Calendar, Users, 
  Heart, ExternalLink, Loader2,
  Compass, Mountain, Sparkles, Clock, Eye, Check,
  Thermometer, Wind, Droplets, Eye as EyeIcon, Zap
} from '@components/icons';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import Button from '../components/common/Button';
import dailyFeedService from '../services/dailyFeedService';
import { useAuth } from '../context/AuthContext';

const DailyFeedPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: dailyFeed, isLoading, error, isStale, dataUpdatedAt } = useQuery({
    queryKey: ['dailyFeed', new Date().toDateString(), user?._id],
    queryFn: () => {
      console.log('🔄 React Query: Making API call for daily feed');
      console.log(`👤 User ID: ${user._id}`);
      console.log(`📱 Device: ${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}`);
      console.log(`📅 Query Key: ['dailyFeed', '${new Date().toDateString()}', '${user?._id}']`);
      console.log(`🔍 React Query cache check: Looking for existing data`);
      return dailyFeedService.getDailyFeed(user._id, false); // Use smart caching
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - one park per day
    cacheTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch on mount to ensure fresh data when user logs in
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: 2,
    retryDelay: 1000,
    enabled: !!user?._id, // Only run query when user is authenticated
    onSuccess: (data) => {
      console.log('✅ React Query: Daily feed data loaded successfully');
      console.log(`🏞️ Park: ${data?.parkName || 'Unknown'}`);
      console.log(`📅 Date: ${new Date().toDateString()}`);
      console.log(`⏰ Data updated at: ${new Date(dataUpdatedAt).toLocaleString()}`);
      console.log(`🔄 Is stale: ${isStale}`);
      
      // Debug: Log the complete data structure received
      console.log('🔍 Complete frontend data:', JSON.stringify(data, null, 2));
      console.log('🔍 Park of Day data:', data?.parkOfDay);
      console.log('🔍 Weather Data:', data?.weatherData);
      console.log('🔍 Astro Data:', data?.astroData);
    },
    onError: (error) => {
      console.error('❌ React Query: Daily feed error:', error);
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Loading your daily feed...
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              Preparing today's featured park and recommendations
            </p>
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
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center">
            <div className="rounded-2xl p-8" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Unable to load today's park
              </h1>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                Please check your connection and try again later.
              </p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Today's featured park will be available once the connection is restored.
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!dailyFeed || !dailyFeed.parkOfDay) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center">
            <div className="rounded-2xl p-8" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                No data available
              </h1>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                We're having trouble loading today's featured park. Please try refreshing the page.
              </p>
              <Button 
                onClick={() => window.location.reload()} 
                className="px-6 py-3"
                style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
              >
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Today's Featured Park - TrailVerse"
        description="Your personalized daily nature companion with park recommendations, weather, and inspiration"
        keywords="daily nature feed, park recommendations, weather, astro, nature facts"
      />
      
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Enhanced Page Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Calendar className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Today in Nature
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Your personalized daily companion for discovering America's natural wonders
          </p>
        </div>

        {/* Enhanced Hero Section */}
        <div className="mb-12">
          {/* Park Image - Clean and Separate */}
          <div className="relative overflow-hidden rounded-3xl shadow-2xl mb-8">
            <div className="relative h-80 sm:h-96 lg:h-[500px]">
              <OptimizedImage
                src={dailyFeed?.parkOfDay?.image || '/background1.png'}
                alt={dailyFeed?.parkOfDay?.name || 'Park of the Day'}
                className="w-full h-full object-cover"
              />
              {/* Simple Park Code Badge */}
              <div className="absolute top-6 left-6">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <Mountain className="h-4 w-4 text-white" />
                  <span className="text-sm font-bold text-white">
                    {dailyFeed?.parkOfDay?.parkCode?.toUpperCase() || 'PARK'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Park Information - Separate Section */}
          <div className="card p-8">
            <div className="max-w-4xl">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                <Link 
                  to={`/parks/${dailyFeed?.parkOfDay?.parkCode || 'unknown'}`}
                  state={{ fromDailyFeed: true, from: { pathname: '/home', search: '' } }}
                  className="inline-flex items-center gap-3 hover:opacity-90 transition-opacity"
                  title="Click to view park details"
                >
                  {dailyFeed?.parkOfDay?.name || 'Park of the Day'}
                  <ExternalLink className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                </Link>
              </h2>
              <p className="text-lg sm:text-xl leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
                {dailyFeed?.parkOfDay?.description || 'Discover amazing natural wonders...'}
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Quick Stats */}
        <div className="mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Park Elevation Card */}
            <div className="group p-6 rounded-2xl transition-all duration-300 hover:scale-105" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--accent-orange)' }}>
                  <Mountain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Elevation</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.parkOfDay?.elevation || '1,200m'}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Above sea level
                  </div>
                </div>
              </div>
            </div>

            {/* Crowd Level Card */}
            <div className="group p-6 rounded-2xl transition-all duration-300 hover:scale-105" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--accent-blue)' }}>
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Crowd Level</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.parkOfDay?.crowdLevel || 'Moderate'}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Expected visitors
                  </div>
                </div>
              </div>
            </div>

            {/* Best Time Card */}
            <div className="group p-6 rounded-2xl transition-all duration-300 hover:scale-105" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--accent-green)' }}>
                  <Clock className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Best Time</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.parkOfDay?.bestTime || 'Morning'}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    To visit today
                  </div>
                </div>
              </div>
            </div>

            {/* Park Size Card */}
            <div className="group p-6 rounded-2xl transition-all duration-300 hover:scale-105" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl" style={{ backgroundColor: '#8b5cf6' }}>
                  <MapPin className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Park Size</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.parkOfDay?.acres || '522k'}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Acres
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Weather & Sky Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
          
          {/* Enhanced Weather Section */}
          <div className="card overflow-hidden">
            <div className="p-6" style={{ backgroundColor: 'var(--surface-hover)' }}>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--accent-orange)' }}>
                  <Sun className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Current Weather</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Real-time conditions at {dailyFeed?.parkOfDay?.name || 'Park'}</p>
                </div>
              </div>
              
              {/* Enhanced Weather Display */}
              <div className="grid grid-cols-2 gap-6">
                {/* Main Weather */}
                <div className="col-span-2 p-6 rounded-2xl mb-6" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-5xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        {dailyFeed?.weatherData?.current?.temp || '--'}°
                      </div>
                      <div className="text-lg capitalize font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {dailyFeed?.weatherData?.current?.condition || 'Unknown'}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        Feels like {dailyFeed?.weatherData?.current?.feelsLike || dailyFeed?.weatherData?.current?.temp || '--'}°
                      </div>
                    </div>
                    <div className="text-6xl">
                      {dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('sunny') ? '☀️' :
                       dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('cloud') ? '☁️' :
                       dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('rain') ? '🌧️' :
                       dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('snow') ? '❄️' :
                       dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('storm') ? '⛈️' : '🌤️'}
                    </div>
                  </div>
                </div>

                {/* Weather Metrics */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <Droplets className="h-5 w-5" style={{ color: 'var(--accent-blue)' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Humidity</div>
                      <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {dailyFeed?.weatherData?.current?.humidity || '--'}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <Wind className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Wind</div>
                      <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {dailyFeed?.weatherData?.current?.windSpeed || '--'} mph
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <EyeIcon className="h-5 w-5" style={{ color: 'var(--accent-purple)' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Visibility</div>
                      <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {dailyFeed?.weatherData?.current?.visibility || '--'} mi
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <Zap className="h-5 w-5" style={{ color: 'var(--accent-orange)' }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>UV Index</div>
                      <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {dailyFeed?.weatherData?.current?.uvIndex || '--'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weather Insights */}
              {dailyFeed?.weatherInsights && (
                <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: 'var(--accent-orange)' }}></div>
                    <div>
                      <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Weather Insights</h5>
                      <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {dailyFeed.weatherInsights.split('\n').map((line, index) => {
                          // Check if line starts with a bullet point or dash
                          if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
                            return (
                              <div key={index} className="flex items-start gap-2 mb-1">
                                <span className="text-xs mt-1" style={{ color: 'var(--accent-orange)' }}>•</span>
                                <span>{line.trim().replace(/^[-•]\s*/, '')}</span>
                              </div>
                            );
                          }
                          // Regular paragraph
                          return (
                            <div key={index} className="mb-2">
                              {line.trim()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Sky Section */}
          <div className="card overflow-hidden">
            <div className="p-6" style={{ backgroundColor: 'var(--surface-hover)' }}>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--accent-blue)' }}>
                  <Star className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Night Sky</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Astronomical conditions for stargazing</p>
                </div>
              </div>
              
              {/* Enhanced Sky Display */}
              <div className="space-y-6">
                {/* Sun Times */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <Sun className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--accent-orange)' }} />
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Sunrise</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.astroData?.sunrise || '--:--'}
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <Moon className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Sunset</div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.astroData?.sunset || '--:--'}
                    </div>
                  </div>
                </div>

                {/* Moon Information */}
                <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Star className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                    <h5 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Moon Phase</h5>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.astroData?.moonPhase || 'Unknown'}
                    </div>
                    {dailyFeed?.astroData?.moonIllumination && (
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {dailyFeed.astroData.moonIllumination}% illuminated
                      </div>
                    )}
                    {dailyFeed?.astroData?.moonAge && (
                      <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Moon Age: {dailyFeed.astroData.moonAge} days
                      </div>
                    )}
                  </div>
                </div>

                {/* Sky Conditions */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <div className="h-8 w-8 mx-auto mb-2 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }}></div>
                    </div>
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Aurora</div>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.astroData?.auroraProbability || 'Unknown'}
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <div className="h-8 w-8 mx-auto mb-2 flex items-center justify-center">
                      <Star className="h-6 w-6" style={{ color: 'var(--accent-purple)' }} />
                    </div>
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Milky Way</div>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.astroData?.milkyWayVisibility || 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* Day Length */}
                {dailyFeed?.astroData?.dayLength && (
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                    <div className="flex items-center gap-3">
                      <Clock className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Day Length</div>
                        <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          {dailyFeed.astroData.dayLength.toFixed(1)} hours
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Moon Events */}
                {(dailyFeed?.astroData?.nextNewMoon || dailyFeed?.astroData?.nextFullMoon) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {dailyFeed?.astroData?.nextNewMoon && (
                      <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                        <div className="flex items-center gap-3">
                          <Moon className="h-6 w-6" style={{ color: 'var(--accent-blue)' }} />
                          <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Next New Moon</div>
                            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                              {new Date(dailyFeed.astroData.nextNewMoon).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {dailyFeed?.astroData?.nextFullMoon && (
                      <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                        <div className="flex items-center gap-3">
                          <Star className="h-6 w-6" style={{ color: 'var(--accent-orange)' }} />
                          <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Next Full Moon</div>
                            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                              {new Date(dailyFeed.astroData.nextFullMoon).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          
          {/* Enhanced Stargazing Guide */}
          <div className="card p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 rounded-2xl" style={{ backgroundColor: 'var(--accent-orange)' }}>
                <Star className="h-10 w-10 text-white" />
              </div>
              <div>
                <h3 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Stargazing Guide</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Astronomical insights for tonight</p>
              </div>
            </div>
            
            {dailyFeed?.astroData?.skyInsights ? (
              <div className="prose max-w-none">
                <div className="whitespace-pre-line leading-relaxed text-base p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {dailyFeed.astroData.skyInsights?.replace(/\*\*(.*?)\*\*/g, '$1')}
                </div>
              </div>
            ) : (
              <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
                <Star className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h4 className="text-lg font-semibold mb-2">Stargazing information will appear here</h4>
                <p className="text-sm">Check back later for astronomical insights</p>
              </div>
            )}
          </div>

          {/* Enhanced Recommendations */}
          <div className="card p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 rounded-2xl" style={{ backgroundColor: 'var(--accent-blue)' }}>
                <Compass className="h-10 w-10 text-white" />
              </div>
              <div>
                <h3 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Our Recommendations</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Expert recommendations for your visit</p>
              </div>
            </div>
            
            <div className="space-y-6">
              {/* Nature Fact */}
              {dailyFeed?.natureFact && (
                <div className="p-6 rounded-2xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3 mb-4">
                    <Sparkles className="h-5 w-5 mt-1" style={{ color: 'var(--accent-green)' }} />
                    <h4 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Did You Know?</h4>
                  </div>
                  <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {dailyFeed.natureFact?.replace(/\*\*(.*?)\*\*/g, '$1')}
                  </p>
                </div>
              )}

              {/* AI Recommendations */}
              {dailyFeed?.personalizedRecommendations && dailyFeed.personalizedRecommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <Check className="h-5 w-5" style={{ color: 'var(--accent-blue)' }} />
                    <h4 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Expert Tips</h4>
                  </div>
                  <div className="space-y-4">
                    {dailyFeed.personalizedRecommendations.map((recommendation, index) => (
                      <div key={index} className="group p-5 rounded-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-md" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ 
                              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                              minWidth: '28px',
                              minHeight: '28px'
                            }}>
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="leading-relaxed text-sm" style={{ color: 'var(--text-primary)' }}>
                              {recommendation?.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {!dailyFeed?.natureFact && (!dailyFeed?.personalizedRecommendations || dailyFeed.personalizedRecommendations.length === 0) && (
                <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                  <Compass className="h-12 w-12 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                  <h4 className="font-semibold mb-2">Expert recommendations will appear here</h4>
                  <p className="text-sm">We're preparing custom tips for your visit</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Call to Action */}
        <div className="text-center">
          <div className="p-8 rounded-3xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Ready to Explore?
            </h3>
            <p className="text-lg mb-6 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Get detailed information about {dailyFeed?.parkOfDay?.name} and start planning your visit today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => navigate(`/parks/${dailyFeed?.parkOfDay?.parkCode || 'unknown'}`)}
                className="px-8 py-3"
                style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
              >
                View Park Details
              </Button>
              <Button 
                onClick={() => navigate('/explore')}
                className="px-8 py-3"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Explore More Parks
              </Button>
            </div>
          </div>
        </div>

      </main>
      
      <Footer />
    </div>
  );
};

export default DailyFeedPage;