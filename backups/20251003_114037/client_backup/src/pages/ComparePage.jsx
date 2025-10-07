import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, X, Plus, ChevronDown, ChevronUp, Check, 
  MapPin, Star, DollarSign, Clock, Thermometer, 
  Mountain, Tent, Utensils, Wifi, Camera, RefreshCw,
  TrendingUp, Calendar, Users, ArrowRight
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import OptimizedImage from '../components/common/OptimizedImage';
import { useParks } from '../hooks/useParks';

const ComparePage = () => {
  const { data: allParks, isLoading } = useParks();
  const [selectedParks, setSelectedParks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    activities: true,
    weather: false,
    facilities: false,
    planning: false
  });

  const maxParks = 4;

  // Filter parks for selection
  const availableParks = useMemo(() => {
    if (!allParks) return [];
    
    return allParks.filter(park => {
      // Exclude already selected parks
      if (selectedParks.some(p => p.parkCode === park.parkCode)) {
        return false;
      }

      // Search filter
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

  // Mock additional data for comparison
  const getEnhancedParkData = (park) => ({
    ...park,
    rating: 4.8,
    reviews: 1234,
    bestTime: 'May - September',
    avgTemp: {
      summer: '75°F',
      winter: '35°F'
    },
    crowdLevel: park.designation === 'National Park' ? 'High' : 'Moderate',
    accessibility: 'Moderate',
    petFriendly: 'Leashed pets allowed on roads and campgrounds',
    cellService: 'Limited',
    facilities: {
      visitorCenter: true,
      camping: true,
      lodging: true,
      restaurant: false,
      gasStation: false,
      hospital: false
    },
    topActivities: park.activities?.slice(0, 5).map(a => a.name) || [],
    entranceFee: park.entranceFees?.[0]?.cost || 0,
    permits: 'Required for backcountry camping'
  });

  const enhancedParks = selectedParks.map(getEnhancedParkData);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="mt-6">
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
              Compare Parks
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Compare up to 4 national parks side-by-side. Activities, weather, facilities, 
              and more to help you choose your next adventure.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Park Selector */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Select Parks to Compare
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
                    className="h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition hover:bg-white/5"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-tertiary)'
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
                
                <div className="relative w-full max-w-2xl max-h-[80vh] rounded-3xl overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="sticky top-0 z-10 p-6 border-b backdrop-blur"
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
                        className="p-2 rounded-lg hover:bg-white/5"
                        style={{ color: 'var(--text-primary)' }}
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

                  <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-6">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {availableParks.map(park => (
                          <button
                            key={park.parkCode}
                            onClick={() => handleAddPark(park)}
                            className="text-left p-3 rounded-xl transition hover:bg-white/5"
                            style={{
                              backgroundColor: 'var(--surface)',
                              borderWidth: '1px',
                              borderColor: 'var(--border)'
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
            <div className="space-y-4">
              {/* Overview Section */}
              <ComparisonSection
                title="Overview"
                icon={Mountain}
                isExpanded={expandedSections.overview}
                onToggle={() => toggleSection('overview')}
              >
                <ComparisonRow label="Rating">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">{park.rating}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        ({park.reviews})
                      </span>
                    </div>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Location">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{park.states}</span>
                    </div>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Designation">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode}>{park.designation}</span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Best Time to Visit">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{park.bestTime}</span>
                    </div>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Crowd Level">
                  {enhancedParks.map(park => (
                    <span
                      key={park.parkCode}
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        park.crowdLevel === 'High'
                          ? 'bg-red-500/20 text-red-400'
                          : park.crowdLevel === 'Moderate'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {park.crowdLevel}
                    </span>
                  ))}
                </ComparisonRow>
              </ComparisonSection>

              {/* Activities Section */}
              <ComparisonSection
                title="Activities"
                icon={Camera}
                isExpanded={expandedSections.activities}
                onToggle={() => toggleSection('activities')}
              >
                <ComparisonRow label="Popular Activities">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="space-y-1">
                      {park.topActivities.slice(0, 5).map((activity, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                          <span>{activity}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </ComparisonRow>
              </ComparisonSection>

              {/* Weather Section */}
              <ComparisonSection
                title="Weather & Climate"
                icon={Thermometer}
                isExpanded={expandedSections.weather}
                onToggle={() => toggleSection('weather')}
              >
                <ComparisonRow label="Summer (Avg)">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode} className="font-semibold">
                      {park.avgTemp.summer}
                    </span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Winter (Avg)">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode} className="font-semibold">
                      {park.avgTemp.winter}
                    </span>
                  ))}
                </ComparisonRow>
              </ComparisonSection>

              {/* Facilities Section */}
              <ComparisonSection
                title="Facilities & Services"
                icon={Utensils}
                isExpanded={expandedSections.facilities}
                onToggle={() => toggleSection('facilities')}
              >
                <ComparisonRow label="Visitor Center">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode}>
                      {park.facilities.visitorCenter ? (
                        <Check className="h-5 w-5 text-green-400" />
                      ) : (
                        <X className="h-5 w-5 text-red-400" />
                      )}
                    </span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Camping">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode}>
                      {park.facilities.camping ? (
                        <Check className="h-5 w-5 text-green-400" />
                      ) : (
                        <X className="h-5 w-5 text-red-400" />
                      )}
                    </span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Lodging">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode}>
                      {park.facilities.lodging ? (
                        <Check className="h-5 w-5 text-green-400" />
                      ) : (
                        <X className="h-5 w-5 text-red-400" />
                      )}
                    </span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Cell Service">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="flex items-center gap-1">
                      <Wifi className="h-4 w-4" />
                      <span>{park.cellService}</span>
                    </div>
                  ))}
                </ComparisonRow>
              </ComparisonSection>

              {/* Planning Section */}
              <ComparisonSection
                title="Trip Planning"
                icon={Clock}
                isExpanded={expandedSections.planning}
                onToggle={() => toggleSection('planning')}
              >
                <ComparisonRow label="Entrance Fee">
                  {enhancedParks.map(park => (
                    <div key={park.parkCode} className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="font-semibold">
                        {park.entranceFee > 0 ? `$${park.entranceFee}` : 'Free'}
                      </span>
                    </div>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Pet Friendly">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode} className="text-sm">
                      {park.petFriendly}
                    </span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="Accessibility">
                  {enhancedParks.map(park => (
                    <span key={park.parkCode}>{park.accessibility}</span>
                  ))}
                </ComparisonRow>

                <ComparisonRow label="View Details">
                  {enhancedParks.map(park => (
                    <Link
                      key={park.parkCode}
                      to={`/parks/${park.parkCode}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-orange-400 hover:text-orange-300"
                    >
                      Explore Park
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ))}
                </ComparisonRow>
              </ComparisonSection>
            </div>
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

      <Footer />
    </div>
  );
};

// Comparison Section Component
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
        className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition"
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
        <div className="border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// Comparison Row Component
const ComparisonRow = ({ label, children }) => {
  const childArray = React.Children.toArray(children);
  
  return (
    <div className="grid gap-4 p-6 border-b last:border-b-0"
      style={{ 
        gridTemplateColumns: `200px repeat(${childArray.length}, 1fr)`,
        borderColor: 'var(--border)'
      }}
    >
      <div className="font-semibold text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </div>
      {childArray.map((child, index) => (
        <div key={index} className="text-sm"
          style={{ color: 'var(--text-primary)' }}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

export default ComparePage;
