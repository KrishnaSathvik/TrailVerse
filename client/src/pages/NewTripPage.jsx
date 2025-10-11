import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Calendar, Users, Sparkles, Search, ChevronRight } from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import TripSummaryCard from '../components/profile/TripSummaryCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import tripService from '../services/tripService';
import { useParks } from '../hooks/useParks';

/**
 * NewTripPage - DEPRECATED
 * This page now redirects to the unified /plan-ai page
 * All features have been merged into PlanAIPage
 */
const NewTripPage = () => {
  const navigate = useNavigate();
  
  // Redirect to unified Plan AI page
  useEffect(() => {
    navigate('/plan-ai', { replace: true });
  }, [navigate]);
  
  // Return minimal loading screen while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-center">
        <div className="h-12 w-12 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
        <p style={{ color: 'var(--text-secondary)' }}>Redirecting...</p>
      </div>
    </div>
  );
};

// OLD CODE - DEPRECATED, redirects to /plan-ai
const OldNewTripPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: allParks, isLoading: parksLoading } = useParks();
  const [tripHistory, setTripHistory] = useState([]);
  const [parkInput, setParkInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredParks, setFilteredParks] = useState([]);
  const [selectedParkIndex, setSelectedParkIndex] = useState(-1);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Helper function to get conversation title
  const getConversationTitle = (trip) => {
    if (trip.summary && trip.summary.keyTopics && trip.summary.keyTopics.length > 0) {
      // Use the first key topic as the title
      return trip.summary.keyTopics[0];
    }
    if (trip.summary && trip.summary.userQuestions && trip.summary.userQuestions.length > 0) {
      // Use first user question (truncated) as title
      const firstQuestion = trip.summary.userQuestions[0];
      return firstQuestion.length > 40 ? firstQuestion.substring(0, 40) + '...' : firstQuestion;
    }
    return 'AI Chat';
  };

  // Helper function to get conversation summary
  const getConversationSummary = (summary) => {
    if (!summary) return 'Chat conversation';
    
    if (summary.userQuestions && summary.userQuestions.length > 0) {
      const firstQuestion = summary.userQuestions[0];
      if (firstQuestion.length > 80) {
        return firstQuestion.substring(0, 80) + '...';
      }
      return firstQuestion;
    }
    
    if (summary.keyTopics && summary.keyTopics.length > 0) {
      return `Discussed: ${summary.keyTopics.slice(0, 2).join(', ')}`;
    }
    
    return 'Chat conversation';
  };

  useEffect(() => {
    if (user) {
      // Load trip history from database
      const loadHistory = async () => {
        try {
          const response = await tripService.getUserTrips(user.id);
          const trips = response.data || response || [];
          setTripHistory(trips);
        } catch (error) {
          console.error('Error loading trip history:', error);
          setTripHistory([]);
        }
      };
      
      loadHistory();
    }
  }, [user]);

  // Filter parks based on input
  useEffect(() => {
    if (parkInput.trim() && allParks) {
      const filtered = allParks
        .filter(park => park.designation === 'National Park')
        .filter(park => 
          park.fullName.toLowerCase().includes(parkInput.toLowerCase()) ||
          park.name.toLowerCase().includes(parkInput.toLowerCase())
        )
        .slice(0, 5); // Limit to 5 suggestions
      setFilteredParks(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredParks([]);
      setShowSuggestions(false);
    }
    setSelectedParkIndex(-1);
  }, [parkInput, allParks]);

  // Handle clicking outside suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePlanNewTrip = () => {
    // Navigate to chat with newchat flag for fresh generic welcome
    navigate('/plan-ai?newchat=true');
  };

  const handleChatAboutPark = (park = null) => {
    const selectedPark = park || (filteredParks.length > 0 ? filteredParks[0] : null);
    
    if (!selectedPark && !parkInput.trim()) return;
    
    if (selectedPark) {
      // Navigate with park code and name
      navigate(`/plan-ai?park=${encodeURIComponent(selectedPark.parkCode)}&name=${encodeURIComponent(selectedPark.fullName)}&chat=true`);
    } else {
      // Fallback to text input if no park selected
      navigate(`/plan-ai?park=${encodeURIComponent(parkInput)}&name=${encodeURIComponent(parkInput + ' National Park')}&chat=true`);
    }
    
    // Clear input and suggestions
    setParkInput('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedParkIndex(prev => 
        prev < filteredParks.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedParkIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedParkIndex >= 0 && filteredParks[selectedParkIndex]) {
        handleChatAboutPark(filteredParks[selectedParkIndex]);
      } else if (filteredParks.length > 0) {
        handleChatAboutPark(filteredParks[0]);
      } else {
        handleChatAboutPark();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedParkIndex(-1);
    }
  };

  const handleSuggestionClick = (park) => {
    setParkInput(park.fullName);
    handleChatAboutPark(park);
  };

  const handleContinueTrip = (tripId) => {
    // Navigate to specific trip to load previous conversation
    navigate(`/plan-ai/${tripId}?chat=true`);
  };

  const handleDeleteTrip = async (tripId) => {
    if (!window.confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingTripId(tripId);
      await tripService.deleteTrip(tripId);
      
      // Remove from local state
      setTripHistory(prev => prev.filter(t => (t._id || t.id) !== tripId));
      
      showToast('Trip deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting trip:', error);
      showToast('Failed to delete trip', 'error');
    } finally {
      setDeletingTripId(null);
    }
  };

  const handleArchiveTrip = async (tripId) => {
    try {
      await tripService.archiveTrip(tripId);
      
      // Refresh trip history
      const response = await tripService.getUserTrips(user.id);
      const trips = response.data || response || [];
      setTripHistory(trips);
      
      showToast('Trip archived successfully', 'success');
    } catch (error) {
      console.error('Error archiving trip:', error);
      showToast('Failed to archive trip', 'error');
    }
  };

  const handlePersonalizedRecommendations = () => {
    // Navigate to chat with personalized flag for personalized welcome
    navigate('/plan-ai?personalized=true');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden py-12 sm:py-16 lg:py-20">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 backdrop-blur-sm"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              AI Trip Planner
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-4 sm:mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Start Your Next
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {' '}Adventure
            </span>
          </h1>
          <p className="text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Choose how you'd like to plan your trip or continue where you left off. 
            Our AI assistant is ready to help create your perfect National Park adventure.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 lg:pb-24">
        {/* Quick Start Options */}
        <div className="mb-16 sm:mb-20 lg:mb-24">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Quick Start
            </h2>
            <p className="text-base sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
              Choose your preferred way to plan
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 max-w-6xl mx-auto">
            {/* Plan New Trip */}
            <button
              onClick={handlePlanNewTrip}
              className="group p-6 sm:p-8 rounded-2xl backdrop-blur-sm text-left transition-all duration-300 transform hover:-translate-y-1"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="flex-shrink-0 p-3 sm:p-4 rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Plan New Trip
                  </h3>
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Start from scratch with our interactive AI assistant. Perfect for detailed planning with personalized recommendations!
                  </p>
                  <div className="flex items-center gap-2 mt-4" style={{ color: 'var(--accent-green)' }}>
                    <span className="text-sm font-semibold">Get started</span>
                    <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </button>

            {/* Chat About Park */}
            <div
              className="p-6 sm:p-8 rounded-2xl backdrop-blur-sm"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div className="flex items-start gap-4 sm:gap-5 mb-6">
                <div className="flex-shrink-0 p-3 sm:p-4 rounded-xl"
                  style={{ backgroundColor: '#0ea5e9' }}
                >
                  <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Chat About a Park
                  </h3>
                  <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Have a specific park in mind? Start a conversation about it right away!
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={parkInput}
                    onChange={(e) => setParkInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (filteredParks.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder={parksLoading ? "Loading parks..." : "Search national parks..."}
                    disabled={parksLoading}
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border text-sm sm:text-base font-medium outline-none transition-all duration-200 focus:border-opacity-100 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  
                  {/* Autocomplete Dropdown */}
                  {showSuggestions && filteredParks.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 w-full mt-2 rounded-xl border backdrop-blur-xl max-h-64 overflow-y-auto"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: 'var(--border)',
                        boxShadow: 'var(--shadow-xl)'
                      }}
                    >
                      {filteredParks.map((park, index) => (
                        <button
                          key={park.parkCode}
                          onClick={() => handleSuggestionClick(park)}
                          className={`w-full px-4 py-3 text-left transition-colors border-b last:border-b-0 ${
                            index === selectedParkIndex ? '' : ''
                          }`}
                          style={{
                            backgroundColor: index === selectedParkIndex ? 'var(--surface-hover)' : 'transparent',
                            borderColor: 'var(--border)'
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                  {park.fullName}
                                </div>
                                {park.states && (
                                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {park.states}
                                  </div>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => handleChatAboutPark()}
                  disabled={!parkInput.trim() || parksLoading}
                  className="w-full px-6 py-3.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover:shadow-lg"
                  style={{
                    backgroundColor: parkInput.trim() && !parksLoading ? 'var(--accent-green)' : 'var(--surface-hover)',
                    color: parkInput.trim() && !parksLoading ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  {parkInput.trim() && !parksLoading ? 'Start Chat' : 'Enter a park name'}
                </button>
              </div>
              
              {/* Helper text */}
              {parkInput.trim() && filteredParks.length === 0 && !parksLoading && (
                <p className="mt-3 text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  No parks found. Try a different name or start the chat anyway.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Continue Previous Trips */}
        {tripHistory.length > 0 && (
          <div className="mb-16 sm:mb-20 lg:mb-24">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Continue Your Journey
              </h2>
              <p className="text-base sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
                Pick up where you left off
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 max-w-6xl mx-auto">
              {tripHistory.slice(0, 6).map((trip) => (
                <TripSummaryCard
                  key={trip._id || trip.id}
                  trip={trip}
                  onArchive={() => handleArchiveTrip(trip._id || trip.id)}
                  onDelete={() => handleDeleteTrip(trip._id || trip.id)}
                  isDeleting={deletingTripId === (trip._id || trip.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Personalized Recommendations */}
        {user && (
          <div className="mb-12 sm:mb-16">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Just for You
              </h2>
              <p className="text-base sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
                AI-powered recommendations based on your preferences
              </p>
            </div>
            
            <div className="p-6 sm:p-8 lg:p-10 rounded-2xl backdrop-blur-sm max-w-4xl mx-auto"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div className="flex flex-col sm:flex-row items-start gap-5 sm:gap-6">
                <div className="flex-shrink-0 p-4 rounded-xl"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Get Personalized Recommendations
                  </h3>
                  <p className="text-sm sm:text-base leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Based on your previous trips, favorites, and interests, our AI can suggest:
                  </p>
                  <ul className="space-y-3 text-sm sm:text-base mb-8">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ backgroundColor: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>Similar parks to ones you've enjoyed</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ backgroundColor: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>Best seasons to visit your favorite destinations</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ backgroundColor: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>New activities matching your adventure style</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ backgroundColor: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>Extended trips and hidden gems nearby</span>
                    </li>
                  </ul>
                  <button
                    onClick={handlePersonalizedRecommendations}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-base sm:text-lg font-semibold transition-all duration-200 hover:opacity-90 hover:shadow-lg"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      color: 'white'
                    }}
                  >
                    Get My Recommendations
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default NewTripPage;