import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Sun, Moon, Star, MapPin, Calendar, Users, 
  Heart, ExternalLink, Loader2,
  Compass, Mountain, Sparkles, Clock, Eye, Check
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
      return dailyFeedService.getDailyFeed(user._id);
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - one park per day
    cacheTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on component mount if data is fresh
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
    },
    onError: (error) => {
      console.error('❌ React Query: Daily feed error:', error);
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Skeleton Header */}
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded-lg w-64 mb-2 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded-lg w-48 animate-pulse"></div>
          </div>
          
          {/* Skeleton Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Park of Day Skeleton */}
            <div className="col-span-1 md:col-span-2 lg:col-span-2">
              <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                <div className="h-48 bg-gray-200 rounded-xl mb-4 animate-pulse"></div>
                <div className="h-6 bg-gray-200 rounded-lg w-3/4 mb-2 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-full mb-4 animate-pulse"></div>
                <div className="flex gap-3">
                  <div className="h-10 bg-gray-200 rounded-full w-24 animate-pulse"></div>
                  <div className="h-10 bg-gray-200 rounded-full w-20 animate-pulse"></div>
                </div>
              </div>
            </div>
            
            {/* Other Cards Skeleton */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="col-span-1">
                <div className="rounded-2xl p-6 h-48" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                  <div className="h-6 bg-gray-200 rounded-lg w-1/2 mb-4 animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded-lg w-1/2 animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Today's Featured Park - TrailVerse"
        description="Your personalized daily nature companion with park recommendations, weather, and inspiration"
        keywords="daily nature feed, park recommendations, weather, astro, nature facts"
      />
      
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Today in Nature
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        {/* Daily Feed Layout */}
        <div className="space-y-8">
          
          {/* Park of the Day - Hero Section */}
          <div className="card overflow-hidden">
            {/* Park Image */}
            <div className="relative h-64 sm:h-80">
              <OptimizedImage
                src={dailyFeed?.parkOfDay?.image || '/background1.png'}
                alt={dailyFeed?.parkOfDay?.name || 'Park of the Day'}
                className="w-full h-full object-cover"
              />
              {/* Park Code Badge */}
              <div className="absolute top-4 left-4 sm:top-6 sm:left-6 glass rounded-full px-3 py-2 sm:px-4">
                <span className="text-xs sm:text-sm font-bold">
                  {dailyFeed?.parkOfDay?.parkCode?.toUpperCase() || 'PARK'}
                </span>
              </div>
            </div>
            
            {/* Park Information */}
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  <Link 
                    to={`/parks/${dailyFeed?.parkOfDay?.parkCode || 'unknown'}`}
                    state={{ fromDailyFeed: true, from: { pathname: '/home', search: '' } }}
                    className="inline-block"
                    title="Click to view park details"
                  >
                    {dailyFeed?.parkOfDay?.name || 'Park of the Day'}
                    <ExternalLink className="inline-block ml-2 h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                  </Link>
                </h2>
                <p className="text-base sm:text-lg leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
                  {dailyFeed?.parkOfDay?.description || 'Discover amazing natural wonders...'}
                </p>
              </div>
              
              {/* Park Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent-orange)' }}>
                    <Sun className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Weather</div>
                    <div className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.weatherData?.current?.condition || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent-blue)' }}>
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Crowd Level</div>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.parkOfDay?.crowdLevel || 'Moderate'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent-green)' }}>
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>Best Time</div>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.parkOfDay?.bestTime || 'Morning'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Weather & Sky Conditions - Compact Design */}
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-6" style={{ backgroundColor: 'var(--surface-hover)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-green)' }}>
                  <Sun className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Weather & Sky</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Current conditions and astronomical data</p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4 sm:p-6">
              {/* Main Weather Display */}
              <div className="flex items-center justify-between mb-6 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
                <div className="flex items-center gap-4">
                  <div className="text-4xl sm:text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.weatherData?.current?.temp || dailyFeed?.weatherData?.current?.temperature || '--'}°
                  </div>
                  <div>
                    <div className="text-lg capitalize font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {dailyFeed?.weatherData?.current?.condition || 'Unknown'}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      at {dailyFeed?.parkOfDay?.name || 'Park'}
                    </div>
                  </div>
                </div>
                <div className="text-3xl">
                  {dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('sunny') ? '☀️' :
                   dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('cloud') ? '☁️' :
                   dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('rain') ? '🌧️' :
                   dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('snow') ? '❄️' :
                   dailyFeed?.weatherData?.current?.condition?.toLowerCase().includes('storm') ? '⛈️' : '🌤️'}
                </div>
              </div>

              {/* Weather Metrics - Horizontal Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <span className="text-lg">💧</span>
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Humidity</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.weatherData?.current?.humidity || '--'}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <span className="text-lg">💨</span>
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Wind</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.weatherData?.current?.windSpeed || '--'} mph
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <span className="text-lg">👁️</span>
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Visibility</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.weatherData?.current?.visibility || '--'} mi
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <Sun className="h-4 w-4" style={{ color: 'var(--accent-orange)' }} />
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Feels Like</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {dailyFeed?.weatherData?.current?.feelsLike || dailyFeed?.weatherData?.current?.temp || '--'}°
                    </div>
                  </div>
                </div>
              </div>

              {/* Sky Conditions - Compact Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <Sun className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--accent-orange)' }} />
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Sunrise</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.astroData?.sunrise || '--:--'}
                  </div>
                </div>
                
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <Moon className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--accent-blue)' }} />
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Sunset</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.astroData?.sunset || '--:--'}
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <Star className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--accent-orange)' }} />
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Moon Phase</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.astroData?.moonPhase || 'Unknown'}
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="h-6 w-6 mx-auto mb-2 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }}></div>
                  </div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Aurora</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {dailyFeed?.astroData?.auroraProbability || 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Weather Insights - Compact */}
              {dailyFeed?.weatherInsights && (
                <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: 'var(--accent-blue)' }}></div>
                    <div>
                      <h5 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Weather Insights</h5>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {dailyFeed.weatherInsights}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stargazing Guide and Recommendations Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Stargazing Guide */}
            <div className="card p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--accent-orange)' }}>
                  <Star className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Stargazing Guide</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Astronomical insights for tonight</p>
                </div>
              </div>
              
              {dailyFeed?.astroData?.skyInsights ? (
                <div className="prose max-w-none">
                  <div className="whitespace-pre-line leading-relaxed text-base" style={{ color: 'var(--text-secondary)' }}>
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

            {/* Our Recommendations */}
            <div className="card p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--accent-blue)' }}>
                  <Compass className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Our Recommendations</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Expert recommendations for your visit</p>
                </div>
              </div>
              
              <div className="space-y-6">
                {/* Nature Fact */}
                {dailyFeed?.natureFact && (
                  <div className="p-6 rounded-2xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h4 className="font-bold mb-3 text-lg" style={{ color: 'var(--text-primary)' }}>Did You Know?</h4>
                    <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {dailyFeed.natureFact?.replace(/\*\*(.*?)\*\*/g, '$1')}
                    </p>
                  </div>
                )}

                {/* AI Recommendations */}
                {dailyFeed?.personalizedRecommendations && dailyFeed.personalizedRecommendations.length > 0 && (
                  <div>
                    <h4 className="font-bold mb-4 text-lg" style={{ color: 'var(--text-primary)' }}>Expert Tips</h4>
                    <div className="space-y-4">
                      {dailyFeed.personalizedRecommendations.map((recommendation, index) => (
                        <div key={index} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {recommendation?.replace(/\*\*(.*?)\*\*/g, '$1')}
                          </p>
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

        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default DailyFeedPage;
