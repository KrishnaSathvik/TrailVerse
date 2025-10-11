import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, X, Plus, ChevronDown, ChevronUp, Check, 
  MapPin, Star, RefreshCw,
  TrendingUp, Mountain
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import OptimizedImage from '../components/common/OptimizedImage';
import { useParks } from '../hooks/useParks';
import { useParkComparison } from '../hooks/useEnhancedParks';

const ComparePage = () => {
  const { data: allParks, isLoading } = useParks();
  const [selectedParks, setSelectedParks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    summary: true
  });

  const maxParks = 4;

  // Filter parks for selection
  const availableParks = useMemo(() => {
    if (!allParks) return [];
    
    return allParks.filter(park => {
      // Only show National Parks
      if (park.designation !== 'National Park') {
        return false;
      }

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

  // Get park codes for comparison
  const parkCodes = selectedParks.map(park => park.parkCode);

  // Fetch enhanced comparison data
  const { 
    data: comparisonData, 
    isLoading: isComparisonLoading
  } = useParkComparison(parkCodes, {
    enabled: parkCodes.length >= 2
  });


  // Advanced prediction model for best months to visit
  const predictBestMonths = (park) => {
    const states = park.states?.toLowerCase() || '';
    const name = park.fullName?.toLowerCase() || '';
    
    // Climate-based predictions
    if (states.includes('alaska') || name.includes('denali') || name.includes('glacier bay')) {
      return {
        months: ['June', 'July'],
        reasons: ['Peak summer weather', 'Accessible roads']
      };
    }
    
    if (states.includes('arizona') || states.includes('utah') || states.includes('nevada') || 
        name.includes('grand canyon') || name.includes('arches') || name.includes('zion') || 
        name.includes('bryce') || name.includes('canyonlands')) {
      return {
        months: ['April', 'October'],
        reasons: ['Mild temperatures', 'Avoid summer heat']
      };
    }
    
    if (states.includes('florida') || name.includes('everglades') || name.includes('biscayne')) {
      return {
        months: ['December', 'March'],
        reasons: ['Dry season', 'Fewer mosquitoes']
      };
    }
    
    if (states.includes('california') || name.includes('yosemite') || name.includes('sequoia') || 
        name.includes('joshua tree') || name.includes('death valley')) {
      return {
        months: ['May', 'September'],
        reasons: ['Pleasant weather', 'Less crowded']
      };
    }
    
    if (states.includes('wyoming') || states.includes('montana') || name.includes('yellowstone') || 
        name.includes('grand teton') || name.includes('glacier')) {
      return {
        months: ['June', 'September'],
        reasons: ['Wildlife active', 'Roads accessible']
      };
    }
    
    if (states.includes('maine') || name.includes('acadia')) {
      return {
        months: ['July', 'September'],
        reasons: ['Peak season', 'Fall foliage']
      };
    }
    
    if (states.includes('colorado') || name.includes('rocky mountain')) {
      return {
        months: ['July', 'August'],
        reasons: ['Snow-free trails', 'Wildflower season']
      };
    }
    
    if (states.includes('hawaii') || name.includes('volcanoes')) {
      return {
        months: ['April', 'October'],
        reasons: ['Dry season', 'Best visibility']
      };
    }
    
    if (states.includes('washington') || name.includes('olympic') || name.includes('rainier')) {
      return {
        months: ['July', 'August'],
        reasons: ['Dry season', 'Mountain access']
      };
    }
    
    if (states.includes('oregon') || name.includes('crater lake')) {
      return {
        months: ['July', 'September'],
        reasons: ['Snow-free access', 'Clear views']
      };
    }
    
    // Default for other parks
    return {
      months: ['May', 'September'],
      reasons: ['Pleasant weather', 'Shoulder season']
    };
  };

  // Get enhanced parks data or fallback to basic data
  // Ensure parks are always in the same order as selectedParks
  const enhancedParks = selectedParks.map(selectedPark => {
    // Find matching enhanced park data if available
    const enhancedPark = comparisonData?.parks?.find(p => p.parkCode === selectedPark.parkCode);
    
    if (enhancedPark) {
      // Always use our prediction model for best months
      const predictedBestTime = predictBestMonths(enhancedPark);
      return {
        ...enhancedPark,
        bestTimeToVisit: predictedBestTime
      };
    }
    
    // Fallback to basic data with prediction model
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

      {/* Main Content */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
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
                            className="text-left p-2 sm:p-3 rounded-lg sm:rounded-xl transition hover:bg-white/5"
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
            isComparisonLoading ? (
              <div className="text-center py-12">
                <Mountain className="h-12 w-12 animate-pulse mx-auto mb-4"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <p style={{ color: 'var(--text-secondary)' }}>Loading enhanced comparison data...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Comprehensive Park Comparison Summary */}
                <ComparisonSection
                  title="Park Comparison Summary"
                  icon={TrendingUp}
                  isExpanded={expandedSections.summary}
                  onToggle={() => toggleSection('summary')}
                >
                  {/* Desktop Park Names Header */}
                  <div className="hidden lg:block">
                    <div className="flex min-w-max">
                      <div className="flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left"
                        style={{ 
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        Comparison
                      </div>
                      {enhancedParks.map((park) => (
                        <div key={park.parkCode} className="flex-1 px-4 py-4 font-semibold text-sm text-center min-w-0"
                          style={{ 
                            backgroundColor: 'var(--surface-hover)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          {park.fullName}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Basic Information */}
                  <ComparisonRow label="Basic Info" parkNames={enhancedParks.map(p => p.fullName)}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-1">
                        <div className="text-sm font-medium">{park.designation}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {park.states}
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  {/* Ratings & Reviews */}
                  <ComparisonRow label="Ratings & Reviews" parkNames={enhancedParks.map(p => p.fullName)}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${
                                star <= (park.reviews?.averageRating || 0)
                                  ? 'text-yellow-400 fill-current'
                                  : 'text-gray-400'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-xs font-medium whitespace-nowrap">
                          {park.reviews?.averageRating?.toFixed(1) || '0.0'} ({park.reviews?.totalReviews || 0})
                        </div>
                      </div>
                    ))}
                  </ComparisonRow>

                  {/* Weather Information */}
                  <ComparisonRow label="Weather" parkNames={enhancedParks.map(p => p.fullName)}>
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

                  {/* Facilities */}
                  <ComparisonRow label="Facilities" parkNames={enhancedParks.map(p => p.fullName)}>
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

                  {/* Accessibility */}
                  <ComparisonRow label="Accessibility" parkNames={enhancedParks.map(p => p.fullName)}>
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

                  {/* Trip Planning */}
                  <ComparisonRow label="Best Time to Visit" parkNames={enhancedParks.map(p => p.fullName)}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(park.bestTimeToVisit?.months || ['Year Round']).map((month, index) => (
                            <span key={index} className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
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

                  {/* Crowd Level */}
                  <ComparisonRow label="Crowd Level" parkNames={enhancedParks.map(p => p.fullName)}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex flex-col gap-2 items-center">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            park.crowdLevel?.level === 'Very High' || park.crowdLevel?.level === 'High'
                              ? 'bg-red-500/20 text-red-400'
                              : park.crowdLevel?.level === 'Moderate'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
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

                  {/* Common Activities */}
                  {comparisonData?.commonActivities && (comparisonData.commonActivities.commonToAll.length > 0 || comparisonData.commonActivities.mostlyCommon.length > 0) && (
                    <ComparisonRow label="Activities" parkNames={enhancedParks.map(p => p.fullName)}>
                      {enhancedParks.map((park) => {
                        // Combine all activities into one list
                        const allActivities = [
                          ...(comparisonData.commonActivities.commonToAll || []),
                          ...(comparisonData.commonActivities.mostlyCommon || [])
                        ];
                        
                         return (
                           <div key={park.parkCode} className="flex flex-col gap-1 w-full">
                             {/* First line of activities */}
                             <div className="flex flex-wrap gap-1 justify-center w-full">
                               {allActivities.slice(0, Math.ceil(allActivities.length / 2)).map((item, itemIndex) => (
                                 <span key={itemIndex} className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium whitespace-nowrap">
                                   {item.title}
                                 </span>
                               ))}
                             </div>
                             {/* Second line of activities */}
                             {allActivities.length > Math.ceil(allActivities.length / 2) && (
                               <div className="flex flex-wrap gap-1 justify-center w-full">
                                 {allActivities.slice(Math.ceil(allActivities.length / 2)).map((item, itemIndex) => (
                                   <span key={itemIndex + Math.ceil(allActivities.length / 2)} className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium whitespace-nowrap">
                                     {item.title}
                                   </span>
                                 ))}
                               </div>
                             )}
                           </div>
                         );
                      })}
                    </ComparisonRow>
                  )}

                  {/* Quick Actions */}
                  <ComparisonRow label="Quick Actions" parkNames={enhancedParks.map(p => p.fullName)}>
                    {enhancedParks.map(park => (
                      <div key={park.parkCode} className="flex justify-center">
                        <Link
                          to={`/park/${park.parkCode}`}
                          className="px-3 py-2 rounded-lg text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors border border-blue-400/20 hover:border-blue-400/40"
                        >
                          View Details →
                        </Link>
                      </div>
                    ))}
                  </ComparisonRow>
                </ComparisonSection>

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
const ComparisonRow = ({ label, children, parkNames = [] }) => {
  const childArray = React.Children.toArray(children);
  
  return (
    <div>
      {/* Desktop Layout */}
      <div className="hidden lg:block">
        <div className="flex min-w-max"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Row Label */}
          <div className="flex-shrink-0 w-48 px-4 py-4 font-semibold text-sm text-left"
            style={{ 
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--surface-hover)'
            }}
          >
            {label}
          </div>
          
          {/* Park Data Columns */}
          {childArray.map((child, index) => (
            <div key={index} className="flex-1 px-4 py-4 text-sm min-w-0"
              style={{ color: 'var(--text-primary)' }}
            >
              <div className="w-full text-center leading-relaxed">
                {child}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Card Layout */}
      <div className="lg:hidden">
        <div className="border-b p-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Row Label */}
          <div className="mb-3">
            <h4 className="font-semibold text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {label}
            </h4>
          </div>
          
          {/* Park Data Cards with Park Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {childArray.map((child, index) => (
              <div key={index} 
                className="p-3 rounded-lg"
                style={{ 
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                {/* Park Name Header */}
                {parkNames[index] && (
                  <div className="mb-2 pb-2 border-b"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <h5 className="font-semibold text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {parkNames[index]}
                    </h5>
                  </div>
                )}
                
                {/* Park Data */}
                <div className="text-sm"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {child}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparePage;
