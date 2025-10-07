import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useParkDetails } from '../hooks/useParks';
import { 
  ArrowLeft, Heart, Share2, MapPin, Clock, DollarSign, Phone, 
  Globe, Navigation, Info, Mountain, Camera, Tent, Utensils,
  Wifi, Star, User, ThumbsUp, Calendar, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../hooks/useFavorites';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import OptimizedImage from '../components/common/OptimizedImage';
import WeatherWidget from '../components/park-details/WeatherWidget';
import ReviewSection from '../components/park-details/ReviewSection';
import ShareButtons from '../components/common/ShareButtons';

const ParkDetailPage = () => {
  const { parkCode } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { favorites, addFavorite, removeFavorite, isParkFavorited } = useFavorites();
  const { data, isLoading, error } = useParkDetails(parkCode);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [savingPark, setSavingPark] = useState(false);

  // Check if park is saved
  const isSaved = isParkFavorited(parkCode);

  const handleSavePark = async () => {
    if (!isAuthenticated) {
      showToast('Please login to save parks', 'warning');
      navigate('/login');
      return;
    }

    try {
      setSavingPark(true);
      if (isSaved) {
        await removeFavorite(parkCode);
        showToast('Removed from favorites', 'success');
      } else {
        await addFavorite({
          parkCode,
          parkName: data.fullName
        });
        showToast('Added to favorites', 'success');
      }
    } catch (error) {
      showToast('Error updating favorites', 'error');
      console.error('Error saving park:', error);
    } finally {
      setSavingPark(false);
    }
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full mb-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Mountain className="h-8 w-8 animate-pulse" style={{ color: 'var(--text-primary)' }} />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading park details...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.park) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Park not found
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            The park you're looking for doesn't exist
          </p>
          <button
            onClick={() => navigate('/explore')}
            className="px-6 py-3 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
          >
            Back to Explore
          </button>
        </div>
      </div>
    );
  }

  const { park } = data;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'activities', label: 'Things to Do', icon: Mountain },
    { id: 'camping', label: 'Camping', icon: Tent },
    { id: 'facilities', label: 'Facilities', icon: Utensils },
    { id: 'photos', label: 'Photos', icon: Camera }
  ];

  // Generate structured data for the park
  const parkStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: park.fullName,
    description: park.description,
    image: park.images?.[0]?.url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: park.addresses?.[0]?.city,
      addressRegion: park.addresses?.[0]?.stateCode,
      addressCountry: 'US'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: park.latitude,
      longitude: park.longitude
    },
    url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
    sameAs: park.url,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '1250'
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title={`${park.fullName} - Complete Guide & Travel Information`}
        description={`Explore ${park.fullName} in ${park.states}. ${park.description.substring(0, 150)}... Find activities, camping, weather, events, and plan your visit.`}
        keywords={`${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping, ${park.fullName} weather, ${park.fullName} activities`}
        url={`https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`}
        image={park.images?.[0]?.url}
        type="place"
      />
      
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(parkStructuredData)}
        </script>
      </Helmet>

      <Header />

      {/* Hero Image */}
      <section className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <OptimizedImage
          src={park.images?.[selectedImageIndex]?.url}
          alt={park.fullName}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

        {/* Navigation Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => navigate('/explore')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur font-medium transition hover:-translate-x-1"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderWidth: '1px',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#1f2937',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Explore</span>
            </button>
          </div>
        </div>

        {/* Park Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="mt-6 flex items-end justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur mb-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: '1px',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <MapPin className="h-3 w-3 text-white" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">
                    {park.states}
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white tracking-tight leading-tight mb-3 drop-shadow-lg">
                  {park.fullName}
                </h1>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                    <span className="text-lg font-semibold text-white drop-shadow-sm">4.8</span>
                    <span className="text-sm text-white/90 drop-shadow-sm">(1,234 reviews)</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSavePark}
                  disabled={savingPark}
                  className="p-3 rounded-full backdrop-blur transition"
                  style={{
                    backgroundColor: isSaved ? 'rgba(239, 68, 68, 0.2)' : 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: isSaved ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'
                  }}
                  title={isSaved ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart className={`h-5 w-5 ${isSaved ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </button>

                <ShareButtons 
                  url={window.location.href}
                  title={park.fullName}
                  description={park.description}
                />
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Column */}
            <div className="flex-1 min-w-0">
              {/* Quick Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {/* Hours */}
                <div className="rounded-2xl p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Clock className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Hours
                    </h3>
                  </div>
                  <p className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {park.operatingHours?.[0]?.description || 'Open year-round, 24 hours'}
                  </p>
                </div>

                {/* Entrance Fee */}
                <div className="rounded-2xl p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <DollarSign className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Entrance Fee
                    </h3>
                  </div>
                  <p className="text-2xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {park.entranceFees?.[0]?.cost 
                      ? `$${park.entranceFees[0].cost}`
                      : 'Free'
                    }
                  </p>
                  {park.entranceFees?.[0]?.title && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {park.entranceFees[0].title}
                    </p>
                  )}
                </div>

                {/* Contact */}
                <div className="rounded-2xl p-5 backdrop-blur hover:-translate-y-0.5 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      <Phone className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Contact
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {park.contacts?.phoneNumbers?.[0]?.phoneNumber ? (
                      <a
                        href={`tel:${park.contacts.phoneNumbers[0].phoneNumber}`}
                        className="text-sm font-medium hover:text-forest-400 transition block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {park.contacts.phoneNumbers[0].phoneNumber}
                      </a>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        No phone listed
                      </p>
                    )}
                    {park.url && (
                      <a
                        href={park.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-forest-400 hover:text-forest-300 transition"
                      >
                        <Globe className="h-3 w-3" />
                        <span>Official Website</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-8">
                <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium whitespace-nowrap transition-all duration-200 ${
                          activeTab === tab.id
                            ? 'bg-forest-500 text-white shadow-lg'
                            : 'ring-1 hover:bg-white/10 hover:ring-forest-300'
                        }`}
                        style={
                          activeTab !== tab.id
                            ? {
                                backgroundColor: 'var(--surface)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                              }
                            : {}
                        }
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-semibold">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content */}
                <div className="rounded-2xl p-8 backdrop-blur"
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
                      <p className="text-base leading-relaxed mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {park.description}
                      </p>

                      {park.weatherInfo && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Weather Information
                          </h3>
                          <p className="text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {park.weatherInfo}
                          </p>
                        </div>
                      )}

                      {park.directionsInfo && (
                        <div className="mt-8">
                          <h3 className="text-xl font-semibold mb-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Getting There
                          </h3>
                          <p className="text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {park.directionsInfo}
                          </p>
                          {park.latitude && park.longitude && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${park.latitude},${park.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition"
                            >
                              <Navigation className="h-4 w-4" />
                              Get Directions
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'activities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Things to Do
                      </h2>
                      {park.activities && park.activities.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {park.activities.map((activity, index) => (
                            <div
                              key={index}
                              className="px-4 py-3 rounded-xl text-center font-medium transition hover:-translate-y-0.5"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)'
                              }}
                            >
                              {activity.name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No activities listed
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'camping' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Camping
                      </h2>
                      {park.campgrounds && park.campgrounds.length > 0 ? (
                        <div className="space-y-4">
                          {park.campgrounds.map((campground, index) => (
                            <div
                              key={index}
                              className="p-6 rounded-xl"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <h3 className="text-lg font-semibold mb-2"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {campground.name}
                              </h3>
                              <p className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {campground.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No campgrounds information available
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'facilities' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Facilities & Amenities
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { icon: Wifi, label: 'Visitor Center', available: true },
                          { icon: Tent, label: 'Camping', available: park.campgrounds?.length > 0 },
                          { icon: Utensils, label: 'Food Services', available: true },
                          { icon: Phone, label: 'Cell Service', available: false }
                        ].map((facility, index) => {
                          const Icon = facility.icon;
                          return (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-4 rounded-xl"
                              style={{
                                backgroundColor: 'var(--surface-hover)',
                                borderWidth: '1px',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {facility.label}
                              </span>
                              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                                facility.available
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {facility.available ? 'Available' : 'Limited'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'photos' && (
                    <div>
                      <h2 className="text-2xl font-bold mb-6"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Photo Gallery
                      </h2>
                      {park.images && park.images.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {park.images.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => setSelectedImageIndex(index)}
                              className="aspect-video rounded-xl overflow-hidden group"
                            >
                              <OptimizedImage
                                src={image.url}
                                alt={image.altText || park.fullName}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>
                          No photos available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Reviews */}
              <ReviewSection parkCode={parkCode} parkName={park.fullName} />
            </div>

            {/* Sidebar */}
            <aside className="lg:w-96 flex-shrink-0 space-y-6">
              {/* Weather Widget */}
              {park.latitude && park.longitude && (
                <WeatherWidget
                  latitude={park.latitude}
                  longitude={park.longitude}
                  parkName={park.fullName}
                />
              )}

              {/* Location Card */}
              <div className="rounded-2xl p-6 backdrop-blur"
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
                {park.latitude && park.longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${park.latitude},${park.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-500 hover:bg-forest-600 text-white text-sm font-semibold transition"
                  >
                    <Navigation className="h-4 w-4" />
                    View on Map
                  </a>
                )}
              </div>

              {/* Plan Trip CTA */}
              <div className="rounded-2xl p-6 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <Mountain className="h-12 w-12 mx-auto mb-4 text-forest-400" />
                <h3 className="text-xl font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Plan Your Visit
                </h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Let AI create a personalized itinerary for {park.fullName}
                </p>
                <Link
                  to="/plan-ai"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-forest-500 hover:bg-forest-600 text-white font-semibold transition shadow-lg"
                >
                  <Calendar className="h-4 w-4" />
                  Plan with AI
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ParkDetailPage;
