import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, Calendar, Users, AlertCircle, X, Clock
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { tripHistoryService } from '../../services/tripHistoryService';
import tripService from '../../services/tripService';
import conversationService from '../../services/conversationService';
import aiService from '../../services/aiService';
import api from '../../services/api';
import feedbackService from '../../services/feedbackService';
import { logAIChat } from '../../utils/analytics';
import ChatInput from '../ai-chat/ChatInput';
import MessageBubble from '../ai-chat/MessageBubble';
import SuggestedPrompts from '../ai-chat/SuggestedPrompts';
import TypingIndicator from '../ai-chat/TypingIndicator';
import { getBestAvatar } from '../../utils/avatarGenerator';


const TripPlannerChat = ({ 
  formData, 
  onBack, 
  parkName, 
  existingTripId = null,
  isPersonalized = false,
  isNewChat = false,
  refreshTrips = null
}) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, updateUser } = useAuth();
  const { showToast } = useToast();
  const { subscribe, unsubscribe, subscribeToProfile, subscribeToTrips } = useWebSocket();
  
  // Debug user object to see avatar structure (remove in production)
  // console.log('🔍 TripPlannerChat - User object:', user);
  // console.log('🔍 TripPlannerChat - User avatar:', user?.avatar);
  // console.log('🔍 TripPlannerChat - User profilePicture:', user?.profilePicture);
  // console.log('🔍 TripPlannerChat - User firstName:', user?.firstName);
  // console.log('🔍 TripPlannerChat - User lastName:', user?.lastName);
  // console.log('🔍 TripPlannerChat - User email:', user?.email);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [currentTripId, setCurrentTripId] = useState(existingTripId);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const abortControllerRef = useRef(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('Thinking...');
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [, setIsRestoredSession] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const [showParkInputModal, setShowParkInputModal] = useState(false);
  const [parkInput, setParkInput] = useState('');
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(!isAuthenticated);
  const [anonymousId, setAnonymousId] = useState(null);
  const [messageCount, setMessageCount] = useState(0);
  const [canSendMore, setCanSendMore] = useState(true);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState(null);

  const messagesEndRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const previousExistingTripIdRef = useRef(existingTripId);

  // Removed all scroll functionality to prevent unwanted scrolling

  // Helper functions that need to be defined before loadExistingTrip
  const calculateDays = () => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const ms = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  };

  const getUserContextMessage = async () => {
    if (!user) return '';
    
    try {
      const context = await tripHistoryService.getAIContext(user.id);
      
      if (context.totalTrips === 0) {
        return `🌟 This is your first trip with TrailVerse! I'm excited to help you plan it.`;
      }

      let contextMsg = `📚 **Based on your ${context.totalTrips} previous ${context.totalTrips === 1 ? 'trip' : 'trips'}:**\n`;
      
      if (context.favoriteParks && context.favoriteParks.length > 0) {
        contextMsg += `- You've enjoyed: ${context.favoriteParks.join(', ')}\n`;
      }
      
      if (context.topInterests && context.topInterests.length > 0) {
        contextMsg += `- Your interests: ${context.topInterests.slice(0, 3).join(', ')}\n`;
      }

      return contextMsg;
    } catch (error) {
      console.error('Error getting user context:', error);
      return `🌟 Let's plan an amazing trip together!`;
    }
  };

  const createWelcomeBackMessage = (trip, existingMessages) => {
    const userName = user?.name || user?.firstName || 'there';
    const parkName = trip.parkName || 'this adventure';
    const messageCount = existingMessages.length;
    const lastActivity = trip.updatedAt ? new Date(trip.updatedAt).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    }) : 'recently';
    
    // Get conversation summary
    const userQuestions = existingMessages.filter(msg => msg.role === 'user').slice(0, 3);
    const hasPlan = existingMessages.some(msg => 
      msg.role === 'assistant' && /(Day\s*\d+[:\-\s]|Itinerary|Schedule|Plan|## Day)/i.test(msg.content)
    );
    
    // Get key topics from conversation
    const allContent = existingMessages.map(msg => msg.content).join(' ').toLowerCase();
    const topics = [];
    if (allContent.includes('hiking') || allContent.includes('trail')) topics.push('hiking');
    if (allContent.includes('photo') || allContent.includes('camera')) topics.push('photography');
    if (allContent.includes('wildlife') || allContent.includes('animal')) topics.push('wildlife');
    if (allContent.includes('camp') || allContent.includes('tent')) topics.push('camping');
    if (allContent.includes('weather') || allContent.includes('season')) topics.push('weather');
    
    const topicsText = topics.length > 0 ? topics.slice(0, 3).join(', ') : 'general planning';

    return {
      id: Date.now(),
      role: 'assistant',
      content: `# 👋 Welcome Back, ${userName}!

I'm **TrailVerse AI**, and I'm excited to continue planning your **${parkName}** adventure with you! 

## 📋 Where We Left Off

You last worked on this trip **${lastActivity}**, and we've had a great conversation with **${messageCount} messages** so far. Here's what we've been discussing:

### 🎯 **Topics We've Covered**
${topicsText}

### 💬 **Recent Questions You Asked**
${userQuestions.length > 0 ? userQuestions.map((q, i) => `${i + 1}. "${q.content.length > 60 ? q.content.substring(0, 60) + '...' : q.content}"`).join('\n') : 'We started with general planning questions'}

${hasPlan ? '### ✅ **Progress Made**\nWe\'ve already created a detailed trip plan! You can ask me to modify it, add more details, or explore specific aspects.' : '### 🚀 **Ready to Continue**\nLet\'s keep building on our conversation and create an amazing itinerary!'}

## 🎯 What Would You Like to Do Next?

- **Continue planning** - Ask me about specific activities, timing, or logistics
- **Refine details** - Modify dates, group size, or preferences  
- **Get recommendations** - Explore new trails, activities, or hidden gems
- **Ask questions** - I'm here to help with any aspect of your trip

What's on your mind for this ${parkName} adventure? Let's pick up right where we left off! 🏔️✨`,
      timestamp: new Date()
    };
  };

  const showWelcomeMessage = useCallback(async () => {
    const userName = user?.name || user?.firstName || 'there';
    const days = calculateDays();
    
    // Check if this is coming from park details page (has park context)
    const isFromParkDetails =
      typeof window !== 'undefined' && window.location.search.includes('park=');
    
    // Check for personalized recommendations
    if (isPersonalized) {
      const personalizedWelcome = {
        id: Date.now(),
        role: 'assistant',
        content: `# 🧠 Personalized Recommendations for ${userName}!

I'm **TrailVerse AI**, and I'm excited to suggest some amazing adventures tailored just for you based on your previous trips and interests!

## 🌟 What I Can Recommend

Based on your travel history and preferences, I can help you discover:

- **🏔️ Similar Parks** - Places with landscapes and experiences like ones you've loved
- **🌸 Seasonal Variations** - Different times to visit your favorite parks for new perspectives
- **🎯 New Activities** - Adventures that match your interests and fitness level
- **🗺️ Extended Trips** - Multi-park itineraries combining your favorite destinations
- **💎 Hidden Gems** - Lesser-known parks that match your style

## 🚀 Let's Find Your Next Adventure!

Tell me what you're looking for:
- "Recommend parks similar to ones I've enjoyed"
- "What's a good park for [season/month]?"
- "I want to try [activity], where should I go?"
- "Plan a multi-park road trip"

What kind of adventure are you dreaming of next? 🎯`,
        timestamp: new Date()
      };
      
      setMessages([personalizedWelcome]);
      return;
    }
    
    // Check for new chat (generic welcome)
    if (isNewChat) {
      const newChatWelcome = {
        id: Date.now(),
        role: 'assistant',
        content: `# 🎉 Welcome to TrailVerse AI, ${userName}!

I'm **TrailVerse AI**, your expert guide to America's 63 National Parks! I'm absolutely thrilled to help you plan your next incredible adventure.

## 🌟 What I Can Help You With

- **🏔️ Park Recommendations**: Find the perfect park for your interests and travel style
- **📅 Trip Planning**: Create detailed itineraries with activities, lodging, and dining
- **🥾 Trail & Activity Suggestions**: Discover hiking, scenic drives, wildlife viewing, and photography spots
- **🌤️ Weather & Timing**: Get advice on the best times to visit and what to expect
- **🎒 Preparation Tips**: Essential gear, permits, and safety considerations

## 🚀 Ready to Start Planning?

You can:
1. **Share your trip details** - I'll create a custom itinerary
2. **Ask specific questions** - "Best trails for beginners?" "When's peak season?"
3. **Explore a park** - Learn about highlights and hidden gems

What kind of adventure are you dreaming of? Let's make it happen! 🎯`,
        timestamp: new Date()
      };
      
      setMessages([newChatWelcome]);
      return;
    }
    
    // Get user context asynchronously
    const userContext = await getUserContextMessage();
    
    const welcomeMessage = {
      id: Date.now(),
      role: 'assistant',
      content: isFromParkDetails 
        ? `# 🏔️ Welcome to ${parkName}, ${userName}!

I'm **TrailVerse AI**, your expert guide to America's national parks! I'm absolutely thrilled to help you plan an unforgettable adventure at **${parkName}** - one of our country's most spectacular natural treasures.

## 🌟 Why ${parkName} is Special

${parkName} offers some of the most breathtaking landscapes and unique experiences in the National Park System. From towering peaks to pristine wilderness, this park promises memories that will last a lifetime.

---

${userContext}

## 🎯 Let's Create Your Perfect Adventure!

I'd love to craft a personalized itinerary just for you. To give you the most amazing recommendations, tell me about your vision:

### 📅 **When's Your Adventure?**
- What dates are you considering?
- Any flexibility in timing?

### 👥 **Your Adventure Squad**
- How many explorers in your group?
- What's everyone's comfort level with outdoor activities?

### 🎪 **What Gets You Excited?**
- Epic hiking trails and summit views?
- Wildlife photography and nature watching?
- Peaceful camping under the stars?
- Scenic drives and overlooks?
- Something else that calls to you?

### 💰 **Your Adventure Budget**
- Looking for budget-friendly options?
- Want to splurge on some special experiences?
- Any specific priorities for spending?

### 🏕️ **Your Home Base**
- Prefer camping in the wilderness?
- Want the comfort of lodges or cabins?
- Planning to stay outside the park?

## 🚀 Ready to Start Planning?

You can:
1. **Share your trip details** - I'll create a custom itinerary
2. **Ask specific questions** - "Best trails for beginners?" "When's peak season?"
3. **Explore the park** - Learn about highlights and hidden gems

What aspect of ${parkName} are you most excited about? Let's make this trip absolutely incredible! 🎉`
        : `# 🎉 Perfect! Let's Plan Your ${parkName} Adventure, ${userName}!

I'm **TrailVerse AI**, and I'm absolutely excited to help you create an unforgettable experience at **${parkName}**! I can already see this is going to be an amazing trip.

## 📋 Your Adventure Profile

### 📅 **Your Timeline**
- **Start Date**: ${new Date(formData.startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- **End Date**: ${new Date(formData.endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- **Duration**: **${days} amazing days** of adventure! 🎯

### 👥 **Your Adventure Squad**
- **Group Size**: **${formData.groupSize}** ${formData.groupSize === 1 ? 'explorer' : 'adventurers'}
- **Fitness Level**: **${formData.fitnessLevel.charAt(0).toUpperCase() + formData.fitnessLevel.slice(1)}** - Perfect for ${formData.fitnessLevel === 'beginner' ? 'scenic walks and easy trails' : formData.fitnessLevel === 'intermediate' ? 'moderate hikes and diverse activities' : 'challenging trails and epic adventures'}!

### 💰 **Your Adventure Style**
- **Budget**: **${formData.budget.charAt(0).toUpperCase() + formData.budget.slice(1)}** - Great choice for ${formData.budget === 'budget' ? 'maximizing experiences while being cost-conscious' : formData.budget === 'moderate' ? 'a balanced mix of comfort and adventure' : 'premium experiences and luxury touches'}!
- **Accommodation**: **${formData.accommodation === 'camping' ? 'Camping under the stars' : 'Comfortable lodging'}** - ${formData.accommodation === 'camping' ? 'Nothing beats sleeping under the stars!' : 'Perfect for a comfortable base camp!'}

### 🎯 **What Excites You Most**
${formData.interests.map(i => `- **${i.charAt(0).toUpperCase() + i.slice(1).replace('-', ' ')}** - ${i === 'hiking' ? 'Epic trails and summit views await!' : i === 'photography' ? 'Incredible photo opportunities at every turn!' : i === 'wildlife' ? 'Amazing wildlife viewing experiences!' : i === 'camping' ? 'Perfect for connecting with nature!' : i === 'scenic-drives' ? 'Breathtaking overlooks and scenic routes!' : 'Adventure and discovery!'}`).join('\n')}

---

${userContext}

## 🚀 Ready to Dive In?

I can help you with everything from detailed itineraries and trail recommendations to packing lists and budget planning. 

**Click any of the quick start buttons below to get started, or just type your question!**

I'm here to make your ${parkName} adventure absolutely incredible! 🏔️✨`,
      timestamp: new Date()
    };

    setMessages([welcomeMessage]);
  }, [user, parkName, formData.startDate, formData.endDate, formData.groupSize, formData.fitnessLevel, formData.budget, formData.accommodation, formData.interests, isPersonalized, isNewChat, getUserContextMessage, calculateDays]);

  // All scroll functionality removed - no auto-scrolling on feedback or any updates

  // Define loadExistingTrip before the useEffect that uses it
  const loadExistingTrip = useCallback(async (tripId) => {
    console.log('🔄 Loading existing trip:', tripId);
    try {
      const tripResponse = await tripService.getTrip(tripId);
      console.log('🔄 Raw API response:', tripResponse);
      const trip = tripResponse.data || tripResponse;
      console.log('🔄 Found trip:', trip);
      console.log('🔄 Trip has conversation array:', Array.isArray(trip.conversation));
      console.log('🔄 Trip conversation:', trip.conversation);
    
      if (trip) {
        // Check if trip has conversationId (localStorage trip) or direct messages (backend trip)
        if (trip.conversationId) {
          try {
            console.log('🔄 Loading conversation from backend:', trip.conversationId);
            // Fetch conversation from backend using conversationId
            const conversation = await conversationService.getConversation(trip.conversationId);
            console.log('🔄 Loaded conversation:', conversation);
            const messagesToLoad = conversation.conversation || [];
            
          // Add welcome back message at the end if there are existing messages
          if (messagesToLoad.length > 0) {
            // Find the last welcome back message
            const lastWelcomeBackIndex = messagesToLoad.findLastIndex(msg => 
              msg.role === 'assistant' && 
              msg.content.includes('Welcome Back') && 
              msg.content.includes('Where We Left Off')
            );
            
            // Check if there are user messages after the last welcome back
            const hasNewUserMessages = lastWelcomeBackIndex !== -1 && 
              messagesToLoad.slice(lastWelcomeBackIndex + 1).some(msg => msg.role === 'user');
            
            // Add welcome back if: no welcome back exists OR there are new user messages since last welcome back
            if (lastWelcomeBackIndex === -1 || hasNewUserMessages) {
              const welcomeBackMessage = createWelcomeBackMessage(trip, messagesToLoad);
              setMessages([...messagesToLoad, welcomeBackMessage]);
              console.log('🔄 Added welcome back message to end of existing conversation (conversationId)');
              
              // Auto-scroll to show the welcome back message
              setTimeout(() => {
                if (messagesEndRef.current) {
                  messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100);
            } else {
              setMessages(messagesToLoad);
              console.log('🔄 Welcome back message exists and no new user messages, not adding duplicate');
            }
          } else {
            setMessages(messagesToLoad);
          }
          } catch (error) {
            console.error('Error loading conversation:', error);
            // Fallback to empty messages if conversation fetch fails
            setMessages([]);
          }
        } else {
          // Backend trip with direct messages (check both conversation and messages)
          console.log('🔄 Loading messages from trip:', trip.conversation || trip.messages);
          console.log('🔄 Trip conversation length:', (trip.conversation || []).length);
          console.log('🔄 Trip messages length:', (trip.messages || []).length);
          const messagesToLoad = trip.conversation || trip.messages || [];
          console.log('🔄 Setting messages:', messagesToLoad.length, 'messages');
          console.log('🔄 Messages with feedback:', messagesToLoad.filter(m => m.userFeedback).map(m => ({ id: m.id, feedback: m.userFeedback })));
          
          // Add welcome back message at the end if there are existing messages
          if (messagesToLoad.length > 0) {
            // Find the last welcome back message
            const lastWelcomeBackIndex = messagesToLoad.findLastIndex(msg => 
              msg.role === 'assistant' && 
              msg.content.includes('Welcome Back') && 
              msg.content.includes('Where We Left Off')
            );
            
            // Check if there are user messages after the last welcome back
            const hasNewUserMessages = lastWelcomeBackIndex !== -1 && 
              messagesToLoad.slice(lastWelcomeBackIndex + 1).some(msg => msg.role === 'user');
            
            // Add welcome back if: no welcome back exists OR there are new user messages since last welcome back
            if (lastWelcomeBackIndex === -1 || hasNewUserMessages) {
              const welcomeBackMessage = createWelcomeBackMessage(trip, messagesToLoad);
              setMessages([...messagesToLoad, welcomeBackMessage]);
              console.log('🔄 Added welcome back message to end of existing conversation');
              
              // Auto-scroll to show the welcome back message
              setTimeout(() => {
                if (messagesEndRef.current) {
                  messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100);
            } else {
              setMessages(messagesToLoad);
              console.log('🔄 Welcome back message exists and no new user messages, not adding duplicate');
            }
          } else {
            setMessages(messagesToLoad);
          }
        }
        
        setCurrentPlan(trip.plan);
        setCurrentTripId(tripId); // Set the current trip ID for this conversation
        console.log('🔄 Set currentTripId to:', tripId);
        if (trip.provider) {
          setSelectedProvider(trip.provider);
        }
        console.log('✅ Trip loaded successfully');
        // Trip loading runs silently in background - no toast notification
      }
    } catch (error) {
      console.error('❌ Error loading trip:', error);
      // Don't call showWelcomeMessage here to avoid potential loops
      // The initialization useEffect will handle showing welcome message
    }
  }, []); // Removed showToast from dependencies to prevent infinite loop

  // Check if this is a restored session
  useEffect(() => {
    // Don't restore if we're starting a fresh conversation
    if (isStartingFresh) return;
    
    // Don't restore if we already have an existingTripId from URL (prevents overriding)
    if (existingTripId) {
      console.log('🔄 Skipping session restoration - loading trip from URL:', existingTripId);
      return;
    }
    
    const savedState = localStorage.getItem('planai-chat-state');
    
    if (savedState) {
      setIsRestoredSession(true);
      console.log('🔄 Restored session detected');
      // Session restoration runs silently in background - no toast notification
    }
    
    // Load trip history for the user
    if (user) {
      tripService.getUserTrips(user.id).then(response => {
        const trips = response.data || response || [];
        setTripHistory(trips);
      }).catch(error => {
        console.error('Error loading trip history:', error);
        setTripHistory([]);
      });
      
      // If no existingTripId but we have a saved state, try to restore the current conversation
      if (!existingTripId && savedState) {
        try {
          const parsedState = JSON.parse(savedState);
          if (parsedState.currentTripId) {
            console.log('🔄 Restoring session from localStorage:', parsedState.currentTripId);
            loadExistingTrip(parsedState.currentTripId);
          }
        } catch (error) {
          console.error('Error parsing saved state:', error);
        }
      }
    }
  }, [user, existingTripId, loadExistingTrip, isStartingFresh]); // Added isStartingFresh dependency

  // Force re-render when user avatar changes
  useEffect(() => {
    // Increment avatar version to force re-render of message bubbles
    setAvatarVersion(prev => prev + 1);
  }, [user?.avatar, user?.profilePicture, user?.profile?.avatar]);

  // Setup WebSocket real-time sync for profile updates and trip updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to profile updates and trip updates
    subscribeToProfile();
    subscribeToTrips();

    // Handle profile updates from other devices/tabs
    const handleProfileUpdated = (data) => {
      console.log('[Real-Time] Profile updated in TripPlannerChat:', data);
      if (data.userId === user._id || data.userId === user.id) {
        // Update user object with new profile data
        if (data.avatar) {
          console.log('🔄 Updating user avatar from real-time update:', data.avatar);
          // Update the user object in AuthContext with the new avatar
          updateUser({ avatar: data.avatar });
        }
        // Force re-render of message bubbles with new avatar
        setAvatarVersion(prev => prev + 1);
        console.log('🔄 Avatar version updated due to real-time profile update');
      }
    };

    // Handle trip updates from other devices/tabs
    const handleTripUpdated = (data) => {
      console.log('[Real-Time] Trip updated in TripPlannerChat:', data);
      if (data.userId === user._id || data.userId === user.id) {
        // If this is the current trip being viewed, refresh the trips list
        if (data.tripId === currentTripId && refreshTrips) {
          console.log('🔄 Refreshing trips list due to real-time trip update');
          refreshTrips();
        }
      }
    };

    // Subscribe to WebSocket events
    subscribe('profileUpdated', handleProfileUpdated);
    subscribe('tripUpdated', handleTripUpdated);

    // Cleanup
    return () => {
      unsubscribe('profileUpdated', handleProfileUpdated);
      unsubscribe('tripUpdated', handleTripUpdated);
    };
  }, [user, subscribe, unsubscribe, subscribeToProfile, subscribeToTrips, currentTripId, refreshTrips]);

  // Update thinking message based on time elapsed
  useEffect(() => {
    let interval;
    if (isGenerating && thinkingStartTime) {
      interval = setInterval(() => {
        const elapsed = Date.now() - thinkingStartTime;
        const seconds = Math.floor(elapsed / 1000);
        
        if (seconds < 5) {
          setThinkingMessage('Thinking...');
        } else if (seconds < 10) {
          setThinkingMessage('Analyzing your request...');
        } else if (seconds < 15) {
          setThinkingMessage('Researching the best options...');
        } else if (seconds < 20) {
          setThinkingMessage('Creating your personalized plan...');
        } else if (seconds < 30) {
          setThinkingMessage('Adding detailed recommendations...');
        } else if (seconds < 40) {
          setThinkingMessage('Finalizing your travel itinerary...');
        } else {
          setThinkingMessage('Almost done! Generating comprehensive response...');
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, thinkingStartTime]);

  const loadProviders = useCallback(async () => {
    try {
      // Use different endpoint based on authentication status
      const endpoint = isAnonymous ? '/ai/providers-anonymous' : '/ai/providers';
      const response = await api.get(endpoint);
      const data = response.data;
      
      if (data.providers && data.providers.length > 0) {
        setProviders(data.providers);
        setSelectedProvider(data.providers[0].id);
      } else {
        showToast('No AI providers configured. Please add API keys.', 'error');
      }
      setProvidersLoaded(true);
    } catch (error) {
      console.error('Error loading providers:', error);
      showToast('Failed to load AI providers', 'error');
      setProvidersLoaded(true);
    }
  }, [isAnonymous]); // Added isAnonymous dependency

  const getCurrentSeason = (month) => {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Fall';
    return 'Winter';
  };

  const getMonthName = (month) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  };

  // Clear anonymous session when user logs in
  const clearAnonymousSession = useCallback(() => {
    localStorage.removeItem('anonymousSession');
    setAnonymousId(null);
    setMessageCount(0);
    setCanSendMore(true);
    setIsSessionRestored(false);
  }, []);

  // Calculate time until reset
  const calculateTimeUntilReset = useCallback(() => {
    try {
      const savedSession = localStorage.getItem('anonymousSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const sessionAge = Date.now() - sessionData.timestamp;
        const maxAge = 48 * 60 * 60 * 1000; // 48 hours
        const timeRemaining = maxAge - sessionAge;
        
        if (timeRemaining > 0) {
          const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          return `${hours}h ${minutes}m`;
        }
      }
    } catch (error) {
      console.error('Error calculating time until reset:', error);
    }
    return null;
  }, []);

  // Clean up expired sessions
  const cleanupExpiredSessions = useCallback(() => {
    try {
      const savedSession = localStorage.getItem('anonymousSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const sessionAge = Date.now() - sessionData.timestamp;
        const maxAge = 48 * 60 * 60 * 1000; // 48 hours
        
        if (sessionAge >= maxAge) {
          localStorage.removeItem('anonymousSession');
          console.log('🔄 Cleaned up expired anonymous session');
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      localStorage.removeItem('anonymousSession');
    }
  }, []);

  // Save anonymous session data to localStorage
  const saveAnonymousSession = useCallback((sessionData) => {
    if (isAnonymous && sessionData.anonymousId) {
      const sessionToSave = {
        anonymousId: sessionData.anonymousId,
        messageCount: sessionData.messageCount || 0,
        canSendMore: sessionData.canSendMore !== undefined ? sessionData.canSendMore : true,
        parkName,
        formData,
        timestamp: Date.now()
      };
      localStorage.setItem('anonymousSession', JSON.stringify(sessionToSave));
    }
  }, [isAnonymous, parkName, formData]);

  // Validate session with backend
  const validateSessionWithBackend = useCallback(async (anonymousId) => {
    if (!anonymousId) return false;
    
    try {
      const response = await api.get(`/ai/session-status/${anonymousId}`);
      const { canSendMore, messageCount, isConverted } = response.data;
      
      setCanSendMore(canSendMore);
      setMessageCount(messageCount);
      
      // Update localStorage with backend data
      const savedSession = localStorage.getItem('anonymousSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        sessionData.canSendMore = canSendMore;
        sessionData.messageCount = messageCount;
        localStorage.setItem('anonymousSession', JSON.stringify(sessionData));
      }
      
      console.log('🔄 Session validated with backend:', { canSendMore, messageCount, isConverted });
      return true;
    } catch (error) {
      console.error('Error validating session with backend:', error);
      return false;
    }
  }, []);

  // Restore anonymous session from localStorage
  const restoreAnonymousSession = useCallback(async () => {
    if (isAnonymous && !isAuthenticated) {
      try {
        const savedSession = localStorage.getItem('anonymousSession');
        if (savedSession) {
          const sessionData = JSON.parse(savedSession);
          
          // Check if session is not too old (48 hours to match backend)
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 48 * 60 * 60 * 1000; // 48 hours to match backend
          
          if (sessionAge < maxAge) {
            setAnonymousId(sessionData.anonymousId);
            setMessageCount(sessionData.messageCount);
            setCanSendMore(sessionData.canSendMore);
            setIsSessionRestored(true);
            
            // Validate with backend to ensure accuracy
            await validateSessionWithBackend(sessionData.anonymousId);
            
            console.log('🔄 Restored anonymous session:', sessionData);
            return true;
          } else {
            // Session too old, clear it
            localStorage.removeItem('anonymousSession');
            console.log('🔄 Anonymous session expired, cleared');
          }
        }
      } catch (error) {
        console.error('Error restoring anonymous session:', error);
        localStorage.removeItem('anonymousSession');
      }
    }
    return false;
  }, [isAnonymous, isAuthenticated, validateSessionWithBackend]);

  // Clean up expired sessions and restore anonymous session on mount
  useEffect(() => {
    cleanupExpiredSessions();
    
    if (isAnonymous && !isAuthenticated) {
      restoreAnonymousSession();
    }
  }, [isAnonymous, isAuthenticated, restoreAnonymousSession, cleanupExpiredSessions]);

  // Periodic cleanup of expired sessions (every 5 minutes)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupExpiredSessions();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [cleanupExpiredSessions]);

  // Update countdown timer every minute
  useEffect(() => {
    if (isAnonymous && !canSendMore) {
      const updateTimer = () => {
        const timeRemaining = calculateTimeUntilReset();
        setTimeUntilReset(timeRemaining);
      };
      
      updateTimer(); // Initial update
      const timerInterval = setInterval(updateTimer, 60 * 1000); // Every minute
      
      return () => clearInterval(timerInterval);
    }
  }, [isAnonymous, canSendMore, calculateTimeUntilReset]);

  // Clear anonymous session when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isAnonymous) {
      clearAnonymousSession();
      setIsAnonymous(false);
    }
  }, [isAuthenticated, isAnonymous, clearAnonymousSession]);

  // Load available providers
  useEffect(() => {
    loadProviders();
  }, [loadProviders, isAnonymous]);

  // Set default provider when providers are loaded
  useEffect(() => {
    if (providersLoaded && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id);
    }
  }, [providersLoaded, providers, selectedProvider]);

  // Reset currentTripId when explicitly starting a new chat
  // (Component stays mounted when using "Start New Chat" or "Personalized Recommendations")
  useEffect(() => {
    const previousTripId = previousExistingTripIdRef.current;
    
    // Reset when explicitly starting new chat (isNewChat or isPersonalized URL flags)
    // These flags indicate user clicked "Start New Chat" or "Get Recommendations"
    if (isNewChat || isPersonalized) {
      console.log('🆕 Starting NEW chat (explicit action) - resetting currentTripId');
      setCurrentTripId(null);
      setCurrentPlan(null);
      localStorage.removeItem('planai-chat-state');
    }
    // Update existingTripId if it changed (loading different trip)
    else if (existingTripId && existingTripId !== previousTripId) {
      console.log('🔄 Loading existing trip:', existingTripId);
      setCurrentTripId(existingTripId);
    }
    
    // Update ref for next comparison
    previousExistingTripIdRef.current = existingTripId;
  }, [existingTripId, isNewChat, isPersonalized]);

  // Initialize chat after providers are loaded
  useEffect(() => {
    console.log('🔄 Chat initialization useEffect triggered:', { 
      isStartingFresh, 
      providersLoaded, 
      existingTripId 
    });
    
    // Don't initialize if we're starting a fresh conversation
    if (isStartingFresh) return;
    
    if (providersLoaded) {
      if (existingTripId) {
        console.log('🔄 Loading existing trip from URL:', existingTripId);
        loadExistingTrip(existingTripId);
      } else {
        // Check if we're restoring a session before showing welcome message
        const savedState = localStorage.getItem('planai-chat-state');
        if (savedState) {
          try {
            const parsedState = JSON.parse(savedState);
            if (parsedState.currentTripId) {
              loadExistingTrip(parsedState.currentTripId);
              return; // Don't show welcome message if we're restoring
            }
          } catch (error) {
            console.error('Error parsing saved state in initialization:', error);
          }
        }
        // Only show welcome message if we're not restoring a session
        showWelcomeMessage();
      }
    }
  }, [providersLoaded, existingTripId, isStartingFresh]);

  const handleSendMessage = async (messageText) => {
    if (!messageText.trim() || isGenerating) return;

    console.log('🔄 handleSendMessage called:', {
      messageText: messageText.trim(),
      currentTripId,
      isGenerating,
      providersCount: providers.length
    });

    // Check if providers are available
    if (providers.length === 0) {
      showToast('No AI providers available. Please configure API keys.', 'error');
      return;
    }

    // For anonymous users, validate session before sending
    if (isAnonymous && anonymousId) {
      try {
        await validateSessionWithBackend(anonymousId);
        if (!canSendMore) {
          showToast('You have reached your 3 message limit. Please create an account to continue.', 'error');
          return;
        }
      } catch (error) {
        console.error('Error validating session before sending message:', error);
        showToast('Unable to validate session. Please try again.', 'error');
        return;
      }
    }

    // Abort any existing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setThinkingStartTime(Date.now());
    setThinkingMessage('Thinking...');

    try {
      // Build context for AI
      const userContext = user ? await tripHistoryService.getAIContext(user.id) : null;
      
      // Build system prompt
      const systemPrompt = buildSystemPrompt(userContext);
      
      // Build conversation history
      const conversationHistory = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Build messages array with system prompt first
      const msgs = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: messageText.trim() }
      ];

      // Call appropriate AI service based on authentication status
      let data;
      if (isAnonymous) {
        data = await aiService.chatAnonymous({
          messages: msgs,
          provider: selectedProvider,
          temperature: 0.4,
          top_p: 0.9,
          max_tokens: 2000,
          signal: controller.signal,
          metadata: {
            parkCode: formData.parkCode,
            parkName,
            lat: formData.coordinates?.lat,
            lon: formData.coordinates?.lon,
            formData: formData
          },
          anonymousId: anonymousId  // Send existing anonymousId if available
        });
        
        // Update anonymous session info
        if (data.anonymousId) {
          setAnonymousId(data.anonymousId);
        }
        if (data.messageCount !== undefined) {
          setMessageCount(data.messageCount);
        }
        if (data.canSendMore !== undefined) {
          setCanSendMore(data.canSendMore);
        }
        
        // Save session data to localStorage
        saveAnonymousSession({
          anonymousId: data.anonymousId,
          messageCount: data.messageCount,
          canSendMore: data.canSendMore
        });
      } else {
        data = await aiService.chat({
          messages: msgs,
          provider: selectedProvider,
          temperature: 0.4,
          top_p: 0.9,
          max_tokens: 2000,
          conversationId: currentTripId,
          signal: controller.signal,
          metadata: {
            parkCode: formData.parkCode,
            parkName,
            lat: formData.coordinates?.lat,
            lon: formData.coordinates?.lon,
            userId: user?.id
          }
        });
      }

      // Check if this is a conversion message
      if (data.isConversionMessage) {
        // Update anonymous session state to show conversion UI
        setCanSendMore(false);
        setMessageCount(data.messageCount || 0);
        
        // Save session data to localStorage
        saveAnonymousSession({
          anonymousId: data.anonymousId,
          messageCount: data.messageCount,
          canSendMore: false
        });
        
        // Add the conversion message to the chat
        const responseTime = Date.now() - thinkingStartTime;
        const assistantMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.content,
          timestamp: new Date(),
          provider: data.provider,
          model: data.model,
          responseTime: responseTime,
          isConversionMessage: true
        };

        setMessages(prev => [...prev, assistantMessage]);
        return; // Don't continue with normal processing
      }

      // Add AI response
      const responseTime = Date.now() - thinkingStartTime;
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        provider: data.provider,
        model: data.model,
        responseTime: responseTime
      };

      setMessages(prev => {
        const updatedMessages = [...prev, assistantMessage];
        
        // Auto-save conversation to history after AI response
        console.log('🔄 About to call autoSaveConversation with:', {
          messagesCount: updatedMessages.length,
          currentTripId,
          user: user?.id
        });
        autoSaveConversation(updatedMessages);
        
        return updatedMessages;
      });
      
      // Track AI chat interaction
      logAIChat(messageText.trim(), responseTime, true);
      
      // Check if response contains a complete trip plan
      const looksLikePlan =
        /(^|\n)\s*(Day\s*\d+[:\-\s]|Itinerary|Schedule|Plan)\b/i.test(data.content);
      if (looksLikePlan) {
        setCurrentPlan({
          parkName,
          content: data.content,
          formData
        });
      }

      // Note: Auto-save removed - users must manually save trips

      setIsGenerating(false);
      setThinkingStartTime(null);

    } catch (error) {
      // Log detailed error information for debugging
      console.error('AI Chat Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        code: error.code,
        name: error.name,
        provider: selectedProvider,
        isAnonymous
      });
      
      if (error.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }
      
      // Track failed AI chat interaction
      const failedResponseTime = Date.now() - thinkingStartTime;
      logAIChat(messageText.trim(), failedResponseTime, false);
      
      // Extract error details from response
      const errorDetails = error.response?.data;
      const errorStatus = error.response?.status;
      
      // Check if it's a token limit error
      let errorMessage = 'Failed to get AI response';
      let assistantMessage = '⚠️ I couldn\'t reach the AI provider. Please try again or switch providers.';
      
      if (errorStatus === 429) {
        if (errorDetails?.error === 'Daily token limit exceeded') {
          errorMessage = 'Daily usage limit reached. Please try again tomorrow.';
          assistantMessage = `🚫 **Daily Limit Reached**\n\nYou've reached your daily usage limit. Please try again tomorrow.`;
        } else {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          assistantMessage = '⏳ **Rate Limited**\n\nYou\'re making requests too quickly. Please wait a moment and try again.';
        }
      } else if (errorStatus === 400) {
        // API configuration error
        const details = errorDetails?.details || errorDetails?.error || error.message;
        errorMessage = 'AI provider configuration error';
        assistantMessage = `⚠️ **Configuration Error**\n\n${details}\n\nPlease check your API configuration or try switching providers.`;
      } else if (errorStatus === 401 || errorStatus === 403) {
        // Authentication error
        errorMessage = 'AI provider authentication failed';
        assistantMessage = `🔐 **Authentication Error**\n\nUnable to authenticate with the AI provider. Please check API key configuration.`;
      } else if (errorStatus === 500 || errorStatus === 503) {
        // Server/provider error
        const details = errorDetails?.error || errorDetails?.details || 'The AI provider is temporarily unavailable';
        errorMessage = 'AI provider error';
        assistantMessage = `⚠️ **Provider Error**\n\n${details}\n\nPlease try again in a moment or switch providers.`;
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Timeout error
        errorMessage = 'Request timed out';
        assistantMessage = '⏱️ **Request Timeout**\n\nThe AI provider took too long to respond. Please try again.';
      } else if (!error.response) {
        // Network error
        errorMessage = 'Network error';
        assistantMessage = '🌐 **Network Error**\n\nUnable to reach the AI provider. Please check your connection and try again.';
      }
      
      showToast(errorMessage, 'error');
      
      // Keep the user message and show error response
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date()
      }]);
      setIsGenerating(false);
      setThinkingStartTime(null);
    }
  };

  const buildSystemPrompt = (userContext) => {
    const days = calculateDays();
    
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 0-based to 1-based
    const currentYear = currentDate.getFullYear();
    const currentSeason = getCurrentSeason(currentMonth);
    
    let prompt = `You are TrailVerse AI, an expert US travel assistant with comprehensive knowledge of travel destinations across the United States. You're passionate about helping people discover amazing places and experiences throughout America.

## IMPORTANT - Scope Restrictions:
**You answer questions about ALL US travel destinations including:**
- **National Parks** (63 official National Parks)
- **State Parks** and **Regional Parks**
- **Local attractions** (farms, pumpkin patches, festivals, markets)
- **Cities and towns** (downtown areas, neighborhoods, local culture)
- **Beaches, lakes, rivers, and coastal areas**
- **Mountains, forests, deserts, and natural areas**
- **Theme parks, museums, and entertainment venues**
- **Historic sites, monuments, and cultural attractions**
- **Food scenes, breweries, wineries, and local dining**
- **Events, festivals, and seasonal activities**
- **Road trips and multi-destination itineraries**
- **Accommodations, dining, and local amenities**
- **Weather, seasons, and best times to visit**
- **Travel logistics, transportation, and planning**

**You CANNOT answer questions about:**
- **International destinations** (outside the United States)
- **Non-travel topics** (coding, math, general knowledge, politics, etc.)

**If asked about international travel or non-travel topics, politely redirect:**
"I specialize in US travel destinations and experiences. I can help you discover amazing places across America, from National Parks to local farms, cities to beaches, and everything in between. What US destination or experience are you interested in exploring?"

## Your Expertise:
- **Destination Recommendations**: Matching places to interests, seasons, and travel preferences
- **Detailed Itineraries**: Day-by-day plans with activities, lodging, and dining
- **Local Insights**: Hidden gems, local favorites, and authentic experiences
- **Activity Suggestions**: Hiking, scenic drives, cultural experiences, food tours, festivals
- **Practical Guidance**: Access, timing, logistics, and local tips
- **Safety & Preparation**: Weather considerations, essential gear, and travel safety

## Response Style:
- **Enthusiastic & Encouraging**: Share your passion for travel and discovery
- **Structured & Clear**: Use headers, bullet points, and organized sections
- **Practical & Actionable**: Provide specific, implementable advice
- **Safety-Conscious**: Always include relevant safety considerations
- **Personalized**: Adapt to user's interests, experience, and travel style

## Response Format:
- Use **markdown formatting** for better readability
- Include **emojis** to make responses engaging and scannable
- Structure with **clear headers** and **bullet points**
- Provide **specific recommendations** with reasoning
- Include **practical tips** and **pro tips** where relevant

## Context Awareness:
- Consider the user's trip dates, group size, interests, and travel style
- Reference specific destination features, seasons, and local conditions
- Provide location-specific advice and recommendations
- Suggest activities appropriate for the user's interests and experience level
- Include local tips, hidden gems, and authentic experiences

Remember: You're not just providing information - you're inspiring and enabling amazing travel experiences across America! Help users discover everything from National Parks to local farms, from big cities to small towns, and all the incredible destinations in between.

You are helping plan a trip to ${parkName}. You have extensive knowledge about all aspects of travel, national parks, weather, activities, logistics, and trip planning.

CURRENT CONTEXT:
- Today's date: ${currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Current month: ${currentMonth} (${getMonthName(currentMonth)})
- Current season: ${currentSeason}
- Current year: ${currentYear}

TRIP DETAILS:
- Park: ${parkName}
- Duration: ${days} days
- Dates: ${formData.startDate} to ${formData.endDate}
- Group: ${formData.groupSize} people
- Budget: ${formData.budget}
- Fitness: ${formData.fitnessLevel}
- Interests: ${formData.interests.join(', ')}
- Accommodation: ${formData.accommodation}`;

    if (userContext && userContext.totalTrips > 0) {
      prompt += `\n\nUSER HISTORY & PREFERENCES:
- Previous trips: ${userContext.totalTrips}
- Favorite activities: ${userContext.topInterests.join(', ')}
- Preferred budget: ${userContext.preferredBudget}
- Preferred fitness: ${userContext.preferredFitness}`;

      if (userContext.recentParks.length > 0) {
        prompt += `\n- Recently visited: ${userContext.recentParks.map(p => p.name).join(', ')}`;
      }
    }

    prompt += `\n\nEXPERTISE & CAPABILITIES:
You are a comprehensive travel expert with deep knowledge in:
- National Parks, State Parks, and Regional Parks
- Local attractions (farms, pumpkin patches, festivals, markets)
- Cities and towns (downtown areas, neighborhoods, local culture)
- Beaches, lakes, rivers, and coastal areas
- Mountains, forests, deserts, and natural areas
- Theme parks, museums, and entertainment venues
- Historic sites, monuments, and cultural attractions
- Food scenes, breweries, wineries, and local dining
- Events, festivals, and seasonal activities
- Weather patterns, seasonal conditions, and climate data
- Travel logistics, transportation, and accommodation
- Budget planning, costs, and money-saving tips
- Safety, permits, regulations, and requirements
- Photography, wildlife viewing, and outdoor activities
- Local culture, history, and hidden gems
- Gear recommendations and packing lists
- Route planning and navigation
- Group dynamics and family-friendly options

INSTRUCTIONS:
- Be intelligent, confident, and comprehensive in your responses
When the request lacks key constraints (dates, group ability, interests),
ask up to 1–2 concise clarifying questions **before** drafting long plans.
For clearly scoped questions, answer directly and concisely.
- Be conversational, helpful, and match the user's question style
- For simple questions, give direct, concise answers
- For complex requests, use detailed formatting with headings and structure
- Use formatting only when it adds value - don't over-format simple answers
- Use bullet points (-) for lists when helpful
- Use bold text (**text**) for key information when relevant
- Use italics (*text*) for emphasis when needed
- Include relevant emojis sparingly and appropriately
- Be practical and realistic
- Ask clarifying questions if needed
- Remember context from the conversation
- Provide specific times, locations, and activities when relevant
- Consider the group size and fitness level in recommendations
- Structure information logically - use headings and sections only for complex topics
- Make responses appropriate to the question asked

RESPONSE INTELLIGENCE:
- Simple questions = Simple, direct answers
- Complex planning requests = Detailed, structured responses with formatting
- Don't use templates or over-formatting for basic questions
- Match the user's communication style and question complexity
- Be context-aware: understand what the user is really asking for
- Provide actionable, specific advice based on your expertise
- Always be helpful and solution-oriented

TRAVEL EXPERTISE:
- Be helpful and practical; when you're unsure or need specifics (permits, road/area closures, live weather), ask a brief clarifying question first or state typical conditions as "typical/average" and avoid exact now-casts
- You have comprehensive knowledge about weather, seasons, conditions, and planning
- You can provide detailed information about any aspect of travel including National Parks, State Parks, local farms, cities, beaches, and all US destinations
- You can give specific advice about what to expect during different seasons and months
- You can recommend clothing, gear, and preparation based on weather and season
- You can share historical weather data, seasonal averages, and typical conditions
- You can help with all aspects of trip planning including weather considerations
- You can recommend local farms, pumpkin patches, festivals, markets, and seasonal activities
- You can suggest city attractions, downtown areas, local culture, and urban experiences
- You can provide information about beaches, lakes, rivers, and coastal areas
- You can recommend theme parks, museums, entertainment venues, and cultural attractions
- You can suggest food scenes, breweries, wineries, and local dining experiences
- Be confident and helpful - you have extensive knowledge about all US travel destinations and experiences

WEATHER & LIVE INFO RESPONSES:
- If provided LIVE FACTS in system messages (NPS/Weather), use them as ground truth
- If info is not in LIVE FACTS, state typical/average guidance and suggest official sources
- Do not invent closures, permits, or exact weather not present in LIVE FACTS
- Provide seasonal/typical guidance when helpful, clearly labeled as averages
- If the user asks for "current/tomorrow/next week" weather or closures, say you don't have live data and suggest where to check (NPS alerts, official park site, NOAA) unless the conversation already provided those facts
- Never invent specific temperatures, warnings, permits, or closure statuses
- Use the CURRENT CONTEXT information above to provide accurate seasonal information
- When asked about weather, provide helpful seasonal information and typical conditions for the current time of year
- For "next week" or "tomorrow" questions, give typical conditions for the current season and month
- For "current" weather questions, provide seasonal averages and what to expect for the current time of year
- Always reference the current date and season when providing weather information
- Always be helpful and provide useful weather information for trip planning
- Be accurate about current dates and seasons - don't make up incorrect dates`;

    return prompt;
  };

  const createTripSummary = (messages) => {
    // Extract key information from conversation
    const userQuestions = messages.filter(msg => msg.role === 'user').map(msg => msg.content);
    const aiResponses = messages.filter(msg => msg.role === 'assistant');
    
    // Find if there's a generated plan
    const planResponse = aiResponses.find(response => 
      /(Day\s*\d+[:\-\s]|Itinerary|Schedule|Plan|## Day)/i.test(response.content)
    );
    
    // Create summary
    const summary = {
      totalMessages: messages.length,
      userQuestions: userQuestions.slice(0, 3), // First 3 user questions
      hasPlan: !!planResponse,
      planPreview: planResponse ? `${planResponse.content.substring(0, 200)}...` : null,
      lastActivity: new Date().toISOString(),
      keyTopics: extractKeyTopics(messages)
    };
    
    return summary;
  };

  const extractKeyTopics = (messages) => {
    const topics = new Set();
    
    // Focus on user messages for more accurate topic extraction
    const userMessages = messages.filter(msg => msg.role === 'user');
    const userContent = userMessages.map(msg => msg.content).join(' ').toLowerCase();
    
    // If no user messages, use all content but be more conservative
    const allContent = userMessages.length > 0 ? userContent : messages.map(msg => msg.content).join(' ').toLowerCase();
    
    // More specific and context-aware topic keywords
    const topicKeywords = {
      'hiking': ['hiking', 'trails', 'hike', 'walking', 'trekking'],
      'photography': ['photo', 'photography', 'pictures', 'camera', 'photograph'],
      'wildlife': ['wildlife', 'animals', 'birds', 'wildlife viewing', 'animal watching'],
      'camping': ['camping', 'campsite', 'tent', 'camp', 'backpacking'],
      'lodging': ['hotel', 'lodge', 'accommodation', 'stay', 'accommodations'],
      'dining': ['food', 'restaurant', 'dining', 'eat', 'meal', 'cuisine'],
      'weather': ['weather', 'temperature', 'climate', 'season', 'forecast'],
      'transportation': ['transport', 'car', 'drive', 'travel', 'transportation'],
      'budget': ['budget', 'cost', 'price', 'expensive', 'cheap', 'affordable'],
      'safety': ['safety', 'dangerous', 'safe', 'precautions', 'security'],
      'farms': ['farm', 'farms', 'pumpkin', 'patch', 'agriculture', 'harvest'],
      'festivals': ['festival', 'event', 'celebration', 'fair', 'market'],
      'local': ['local', 'nearby', 'area', 'region', 'community'],
      'parks': ['park', 'parks', 'national park', 'state park', 'recreation'],
      'cities': ['city', 'downtown', 'urban', 'metropolitan', 'town']
    };
    
    // Only add topics if they appear in user messages or are clearly relevant
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      const keywordCount = keywords.filter(keyword => allContent.includes(keyword)).length;
      // Require at least 2 keyword matches for generic topics, 1 for specific ones
      const threshold = ['farms', 'festivals', 'local', 'parks', 'cities'].includes(topic) ? 1 : 2;
      if (keywordCount >= threshold) {
        topics.add(topic);
      }
    });
    
    // If no specific topics found, try to extract from user questions
    if (topics.size === 0 && userMessages.length > 0) {
      const firstUserMessage = userMessages[0].content.toLowerCase();
      if (firstUserMessage.includes('farm') || firstUserMessage.includes('pumpkin')) {
        topics.add('farms');
      }
      if (firstUserMessage.includes('park') || firstUserMessage.includes('national')) {
        topics.add('parks');
      }
      if (firstUserMessage.includes('city') || firstUserMessage.includes('downtown')) {
        topics.add('cities');
      }
    }
    
    return Array.from(topics).slice(0, 5); // Top 5 topics
  };

  const startFreshConversation = (customMessage = null, parkName = null) => {
    // Set flag to prevent restoration
    setIsStartingFresh(true);
    
    // Clear current conversation state
    setMessages([]);
    setCurrentTripId(null);
    setHasShownWelcome(false);
    setCurrentPlan(null);
    
    // Clear any saved session state
    localStorage.removeItem('planai-chat-state');
    
    // Set provider to Claude by default
    const claudeProvider = providers.find(p => p.id === 'claude');
    if (claudeProvider) {
      setSelectedProvider('claude');
    }
    
    // If custom message provided, show welcome first, then send message
    if (customMessage) {
      // Show welcome message first
      showWelcomeMessage();
      // Then send the custom message after a delay to ensure welcome is rendered
      setTimeout(() => {
        handleSendMessage(customMessage);
      }, 300);
    } else if (parkName) {
      // Create park-specific welcome message
      const userName = user?.name || user?.firstName || 'there';
      const parkWelcomeMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `# 🏞️ Welcome to ${parkName}, ${userName}!

I'm **TrailVerse AI**, and I'm excited to help you explore **${parkName}**! This is an incredible destination with so much to discover.

## 🌟 What I Can Help You With

- **🗺️ Park Highlights**: Must-see attractions and hidden gems
- **🥾 Trail Recommendations**: Hiking options for all skill levels
- **📸 Photography Spots**: Best locations and timing for stunning photos
- **🌤️ Weather & Seasons**: When to visit and what to expect
- **🎒 Planning Tips**: Permits, lodging, dining, and essential gear
- **🦌 Wildlife & Nature**: What to look for and safety tips

## 🚀 Ready to Explore?

Ask me anything about ${parkName}:
- "What are the best trails for beginners?"
- "When is the best time to visit?"
- "What should I not miss?"
- "Help me plan a 3-day trip"

Let's make your ${parkName} adventure unforgettable! 🎯`
      };
      
      setMessages([parkWelcomeMessage]);
    } else {
      // Create a fresh generic welcome message (not park-specific)
      const userName = user?.name || user?.firstName || 'there';
      const freshWelcomeMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `# 🎉 Welcome to TrailVerse AI, ${userName}!

I'm **TrailVerse AI**, your expert guide to America's 63 National Parks! I'm absolutely thrilled to help you plan your next incredible adventure.

## 🌟 What I Can Help You With

- **🏔️ Park Recommendations**: Find the perfect park for your interests and travel style
- **📅 Trip Planning**: Create detailed itineraries with activities, lodging, and dining
- **🥾 Trail & Activity Suggestions**: Discover hiking, scenic drives, wildlife viewing, and photography spots
- **🌤️ Weather & Timing**: Get advice on the best times to visit and what to expect
- **🎒 Preparation Tips**: Essential gear, permits, and safety considerations

## 🚀 Ready to Start Planning?

You can:
1. **Share your trip details** - I'll create a custom itinerary
2. **Ask specific questions** - "Best trails for beginners?" "When's peak season?"
3. **Explore a park** - Learn about highlights and hidden gems

What kind of adventure are you dreaming of? Let's make it happen! 🎯`
      };
      
      setMessages([freshWelcomeMessage]);
    }
    
    // Reset the flag after a short delay to allow restoration for future sessions
    setTimeout(() => {
      setIsStartingFresh(false);
    }, 1000);
  };

  const handleParkChat = () => {
    if (!parkInput.trim()) return;
    
    // Close the park input modal
    setShowParkInputModal(false);
    
    // Start a fresh conversation with park-specific welcome message
    startFreshConversation(null, parkInput.trim());
    
    // Clear the input
    setParkInput('');
  };

  const handleSignupFromChat = () => {
    // Store chat context for redirect after signup
    const chatContext = {
      anonymousId,
      parkName,
      formData,
      messages: messages,
      timestamp: Date.now()
    };
    localStorage.setItem('returnToChat', JSON.stringify(chatContext));
    
    // Navigate to signup with chat flag
    navigate('/signup?from=chat');
  };

  const handleLoginFromChat = () => {
    // Store chat context for redirect after login
    const chatContext = {
      anonymousId,
      parkName,
      formData,
      messages: messages,
      timestamp: Date.now()
    };
    localStorage.setItem('returnToChat', JSON.stringify(chatContext));
    
    // Navigate to login with chat flag
    navigate('/login?from=chat');
  };

  const autoSaveConversation = async (messagesToSave) => {
    if (!user || !messagesToSave || messagesToSave.length < 2 || isAnonymous) return;

    console.log('🔄 Auto-saving conversation:', {
      currentTripId,
      messagesCount: messagesToSave.length,
      isExistingTrip: currentTripId && !currentTripId.startsWith('temp-'),
      hasFeedback: messagesToSave.some(msg => msg.userFeedback)
    });

    // Auto-save ALL conversations to database (no manual save needed)
    try {
      const tripSummary = createTripSummary(messagesToSave);

      if (currentTripId && !currentTripId.startsWith('temp-')) {
        console.log('🔄 Updating existing trip in database:', currentTripId);
        // Update existing trip in database
        const updateResponse = await tripService.updateTrip(currentTripId, {
          conversation: messagesToSave,
          summary: tripSummary,
          plan: currentPlan,
          provider: selectedProvider,
          status: 'active'
        });
        console.log('✅ Trip updated successfully:', updateResponse);
        
        // Force refresh of trips list to update message count
        if (refreshTrips) {
          console.log('🔄 Refreshing trips list to update message count');
          refreshTrips();
        }
      } else {
        // Create new trip in database
        console.log('🆕 Creating NEW trip in database:', {
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          messagesCount: messagesToSave.length
        });
        const response = await tripService.createTrip({
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          title: parkName ? `${parkName} Trip Plan` : 'General Planning Session',
          formData: formData || {},
          conversation: messagesToSave,
          summary: tripSummary,
          plan: currentPlan,
          provider: selectedProvider,
          status: 'active'
        });
        
        // Update currentTripId with the database ID
        const newTripId = response.data?._id || response._id;
        console.log('✅ NEW trip created with ID:', newTripId);
        setCurrentTripId(newTripId);
      }

      // Also save to temp state for page refresh persistence
      tripHistoryService.saveTempChatState({
        currentTripId,
        messages: messagesToSave,
        plan: currentPlan,
        provider: selectedProvider
      });
    } catch (error) {
      console.error('Error auto-saving conversation:', error);
      // Still save to temp state even if database save fails
      tripHistoryService.saveTempChatState({
        currentTripId,
        messages: messagesToSave,
        plan: currentPlan,
        provider: selectedProvider
      });
    }
  };

  // DEPRECATED: saveTripHistory and handleSave are no longer used
  // All conversations now auto-save via autoSaveConversation()
  const saveTripHistory = async (messagesToSave) => {
    if (!user) return;

    // Create trip summary
    const tripSummary = createTripSummary(messagesToSave);

    try {
      // Save to database using tripService
      if (currentTripId && !currentTripId.startsWith('temp-')) {
        // Update existing trip
        await tripService.updateTrip(currentTripId, {
          plan: currentPlan,
          provider: selectedProvider,
          status: 'active'
        });
      } else {
        // Create new trip in database
        const response = await tripService.createTrip({
          userId: user.id,
          parkCode: formData.parkCode || null,
          parkName: parkName || 'General Planning',
          title: parkName ? `${parkName} Trip Plan` : 'General Planning Session',
          formData: formData || {},
          plan: currentPlan,
          provider: selectedProvider,
          conversation: messagesToSave.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          })),
          status: 'active'
        });
        const newTrip = response.data || response;
        setCurrentTripId(newTrip._id || newTrip.id);
        
        // Update user preferences
        tripHistoryService.updateUserPreferences(user.id, {
          parkCode: formData.parkCode,
          formData
        });
      }
    } catch (error) {
      console.error('Error saving trip:', error);
      throw error;
    }
  };

  // DEPRECATED: No longer used - auto-save handles everything
  const handleSave = async () => {
    if (!isAuthenticated) {
      showToast('Please sign in to save plans', 'error');
      return;
    }
    
    if (messages.length === 0) {
      showToast('No conversation to save yet', 'error');
      return;
    }
    
    try {
      // Save to database
      await saveTripHistory(messages);
      
      // Clear temp chat state
      tripHistoryService.clearTempChatState();
      
      // Refresh trip history
      const response = await tripService.getUserTrips(user.id);
      const trips = response.data || response || [];
      setTripHistory(trips);
      
      showToast('Trip saved to your profile!', 'success');
    } catch (error) {
      console.error('Error saving trip:', error);
      showToast('Failed to save trip plan', 'error');
    }
  };






  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // Dynamic quick prompts based on context and user preferences
  const quickPrompts = window.location.search.includes('park=') 
    ? [
        "🗓️ When's the absolute best time to visit for my interests?",
        "🥾 What are the must-do trails and hidden gems?",
        "📸 Where are the most Instagram-worthy photo spots?",
        "🌤️ What should I expect for weather and conditions?",
        "🏕️ What are the best camping and lodging options?",
        "🎯 Create a personalized itinerary for my trip!"
      ]
    : [
        "🗓️ Create my perfect day-by-day adventure itinerary",
        "🎒 What's the essential packing list for my activities?",
        "📸 Show me the best photography spots and tips",
        "💰 Give me a detailed budget breakdown and money-saving tips",
        "🌤️ What's the weather like and when should I visit?",
        "🥾 Recommend trails that match my fitness level"
      ];

  // Provider selector modal removed - auto-select first provider for better UX

  // Show error if no providers
  if (providersLoaded && providers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-2xl w-full mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
          <div className="rounded-2xl p-8 backdrop-blur text-center"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
            <h3 className="text-2xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              No AI Providers Available
            </h3>
            <p className="mb-6"
              style={{ color: 'var(--text-secondary)' }}
            >
              Please configure at least one AI API key (Claude or OpenAI) in your server environment variables.
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 rounded-xl font-semibold transition"
              style={{
                backgroundColor: 'var(--accent-green)',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'var(--accent-green-hover, var(--accent-green))';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'var(--accent-green)';
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show warning message if user has exhausted their 3 messages
  if (isAnonymous && !canSendMore && messageCount >= 3) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {/* Floating Back Button */}
        <button
          onClick={onBack}
          className="fixed top-4 left-4 z-30 inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 shadow-lg backdrop-blur-sm"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = 'var(--surface-hover)';
            e.target.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'var(--surface)';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-sm font-semibold">Back to Planning</span>
          <span className="sm:hidden text-sm font-semibold">Back</span>
        </button>

        {/* Warning Message */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-8 border border-blue-200 dark:border-blue-800">
              <div className="text-6xl mb-6">🚀</div>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Ready to Continue Planning?
              </h2>
              <p className="text-lg mb-6" style={{ color: 'var(--text-secondary)' }}>
                You've already used your 3 free questions! You can either create an account for unlimited access, or come back in 48 hours for 3 fresh questions.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleSignupFromChat}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-lg"
                >
                  Create Account
                </button>
                <button
                  onClick={handleLoginFromChat}
                  className="px-8 py-4 bg-white hover:bg-gray-50 text-blue-600 font-semibold rounded-xl border border-blue-200 transition-colors text-lg"
                >
                  Login
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    🚀 Create Account (Recommended)
                  </p>
                  <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Ask unlimited questions</li>
                    <li>• Save your trip plans</li>
                    <li>• Access your conversation history</li>
                    <li>• Get personalized recommendations</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    ⏰ Wait 48 Hours (Free)
                  </p>
                  {timeUntilReset && (
                    <p className="text-xs mb-2 font-medium" style={{ color: 'var(--accent-green)' }}>
                      ⏳ Reset in: {timeUntilReset}
                    </p>
                  )}
                  <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Get 3 fresh questions</li>
                    <li>• No account required</li>
                    <li>• Completely free</li>
                    <li>• Session resets automatically</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Floating Back Button */}
      <button
        onClick={onBack}
        className="fixed top-4 left-4 z-30 inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 shadow-lg backdrop-blur-sm"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = 'var(--surface-hover)';
          e.target.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'var(--surface)';
          e.target.style.transform = 'translateY(0)';
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline text-sm font-semibold">Back to Planning</span>
        <span className="sm:hidden text-sm font-semibold">Back</span>
      </button>

      {/* Header - Redesigned */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6">
            <div className="flex items-center justify-center py-3 sm:py-4">
              {/* Title */}
              <div className="text-center min-w-0">
                <h1 className="text-sm sm:text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {parkName}
                </h1>
                {(formData.startDate || formData.groupSize) && (
                  <div className="flex items-center justify-center gap-3 mt-1 text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {formData.startDate && formData.endDate && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        <span className="hidden xs:inline">{calculateDays()} days</span>
                        <span className="xs:hidden">{calculateDays()}d</span>
                      </span>
                    )}
                    {formData.groupSize && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        <span className="hidden xs:inline">{formData.groupSize} {formData.groupSize === 1 ? 'person' : 'people'}</span>
                        <span className="xs:hidden">{formData.groupSize}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Provider Selector */}
            <div className="pb-3 sm:pb-4 flex justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>AI:</span>
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    abortControllerRef.current?.abort();
                    setSelectedProvider(newProvider);
                    const providerName = providers.find(p => p.id === newProvider)?.name || newProvider;
                    showToast(`Switched to ${providerName}`, 'success');
                  }}
                  className="text-xs font-semibold border-none outline-none cursor-pointer bg-transparent"
                  style={{
                    color: 'var(--text-primary)'
                  }}
                >
                  {providers.map(provider => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

      {/* Chat Messages - Responsive width */}
      <div className="flex-1 overflow-y-auto chat-messages-container">
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
            <div className="space-y-2 sm:space-y-3">
              {messages.map((message) => (
                <MessageBubble
                  key={`${message.id}-${user?.id || 'anonymous'}-${avatarVersion}`}
                  message={message.content}
                  isUser={message.role === 'user'}
                  timestamp={message.timestamp}
                  userAvatar={message.role === 'user' ? (() => {
                    // Try multiple avatar properties in order of preference
                    const userAvatar = user?.avatar || user?.profilePicture || user?.profile?.avatar;
                    
                    // If we have a valid avatar URL, return it
                    if (userAvatar && typeof userAvatar === 'string' && userAvatar.trim() !== '') {
                      return userAvatar;
                    }
                    
                    // Fallback to generated avatar
                    const userForAvatar = {
                      email: user?.email,
                      firstName: user?.firstName,
                      lastName: user?.lastName,
                      name: user?.name
                    };
                    return getBestAvatar(userForAvatar, {}, 'travel');
                  })() : null}
                  messageData={message.role === 'assistant' ? {
                    messageId: message.id,
                    userMessage: messages[messages.indexOf(message) - 1]?.content || '',
                    aiResponse: message.content,
                    aiProvider: message.provider,
                    aiModel: message.model,
                    responseTime: message.responseTime
                  } : null}
                  onCopy={(content) => {
                    navigator.clipboard.writeText(content);
                    showToast('Copied to clipboard!', 'success');
                  }}
                  onFeedback={async (type, messageData) => {
                    console.log('🚀 === FEEDBACK BUTTON CLICKED ===');
                    console.log('🚀 Type:', type);
                    console.log('🚀 Message ID:', message.id);
                    console.log('🚀 Current Trip ID:', currentTripId);
                    
                    try {
                      console.log('👍 Feedback submitted:', {
                        type,
                        conversationId: currentTripId,
                        messageId: messageData.messageId,
                        hasUserMessage: !!messageData.userMessage,
                        hasAiResponse: !!messageData.aiResponse,
                        provider: messageData.aiProvider
                      });
                      
                      // Update message with feedback in state (to persist the visual state)
                      console.log('📝 Updating message state with feedback...');
                      setMessages(prev => {
                        const updatedMessages = prev.map(msg => 
                          msg.id === message.id 
                            ? { ...msg, userFeedback: type }
                            : msg
                        );
                        
                        console.log('✅ Message state updated, now auto-saving...');
                        
                        // Auto-save the updated conversation with feedback to database
                        if (currentTripId && !currentTripId.startsWith('temp-')) {
                          console.log('💾 Calling autoSaveConversation...');
                          console.log('💾 CurrentTripId:', currentTripId);
                          console.log('💾 Messages to save:', updatedMessages.length);
                          
                          // Clear any pending auto-save to prevent duplicates
                          if (autoSaveTimeoutRef.current) {
                            clearTimeout(autoSaveTimeoutRef.current);
                          }
                          
                          // Debounce auto-save to prevent version conflicts
                          autoSaveTimeoutRef.current = setTimeout(() => {
                            console.log('💾 EXECUTING auto-save NOW...');
                            const messageSummary = updatedMessages.map(m => ({
                              id: m.id,
                              role: m.role,
                              userFeedback: m.userFeedback,
                              hasFeedback: !!m.userFeedback
                            }));
                            console.log('💾 Updated messages being saved:');
                            messageSummary.forEach(m => {
                              console.log(`  - ${m.role} #${m.id}: feedback=${m.userFeedback || 'none'}`);
                            });
                            autoSaveConversation(updatedMessages).catch(err => {
                              console.error('❌ Auto-save failed:', err);
                            });
                            autoSaveTimeoutRef.current = null;
                          }, 300); // 300ms debounce
                        } else {
                          console.warn('⚠️ Skipping auto-save:', { currentTripId });
                        }
                        
                        return updatedMessages;
                      });
                      
                      // Only submit feedback to analytics API if we have required data
                      // Note: userMessage can be empty for welcome messages
                      if (!messageData.messageId || !messageData.aiResponse || !messageData.aiProvider) {
                        console.warn('⚠️ Missing required feedback data for analytics:', messageData);
                        showToast('Feedback recorded!', 'success');
                        return;
                      }

                      const feedbackData = feedbackService.prepareFeedbackData({
                        conversationId: currentTripId, // Can be null for unsaved conversations
                        messageId: messageData.messageId,
                        feedback: type,
                        userMessage: messageData.userMessage || 'N/A (welcome message)',
                        aiResponse: messageData.aiResponse,
                        aiProvider: messageData.aiProvider,
                        aiModel: messageData.aiModel,
                        parkCode: formData.parkCode,
                        parkName: parkName,
                        responseTime: messageData.responseTime
                      });

                      console.log('📤 Submitting feedback to API:', {
                        conversationId: feedbackData.conversationId,
                        feedback: feedbackData.feedback,
                        provider: feedbackData.aiProvider
                      });

                      await feedbackService.submitFeedback(feedbackData);
                      
                      console.log('✅ Feedback submitted successfully!');
                      
                      // No toast - visual feedback (blue/red button) is enough
                    } catch (error) {
                      console.error('Error submitting feedback:', error);
                      // No toast - visual feedback (blue/red button) is enough
                    }
                  }}
                  initialFeedback={message.userFeedback}
                />
              ))}

              {isGenerating && <TypingIndicator 
                text={thinkingMessage}
              />}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

      {/* Conversion Message for Anonymous Users */}
      {isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)) && (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Ready to Continue Planning?
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                {isSessionRestored 
                  ? `You've already used your 3 free questions! Create an account for unlimited access, or come back in 48 hours for 3 fresh questions.`
                  : `You've used your 3 free questions! Create an account for unlimited access, or come back in 48 hours for 3 fresh questions.`
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleSignupFromChat}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Create Account
                </button>
                <button
                  onClick={handleLoginFromChat}
                  className="px-6 py-3 bg-white hover:bg-gray-50 text-blue-600 font-semibold rounded-xl border border-blue-200 transition-colors"
                >
                  Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Area - Responsive width */}
      <div className="sticky bottom-0 z-20 backdrop-blur-xl border-t chat-input-area"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 -1px 3px 0 rgba(0, 0, 0, 0.1), 0 -1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-5">
            {/* Quick Prompts - Only show for new users (not returning users with newchat, personalized, or park-specific chats) */}
            {messages.length === 1 && !isGenerating && !isPersonalized && !isNewChat && !(typeof window !== 'undefined' && window.location.search.includes('park=')) && (
              <div className="mb-4">
                <SuggestedPrompts
                  prompts={quickPrompts}
                  onSelect={(prompt) => handleSendMessage(prompt)}
                  title="Quick start"
                />
              </div>
            )}

            {/* Chat Input */}
            <ChatInput
              onSend={handleSendMessage}
              onAttach={(file) => showToast(`Attached: ${file.name}`, 'success')}
              onEmoji={() => showToast('Emoji picker coming soon', 'success')}
              disabled={isGenerating || (isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)))}
              placeholder={isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)) ? "Create an account to continue chatting..." : "Ask me about your trip..."}
            />
          </div>
        </div>


      {/* Park Input Modal */}
      {showParkInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowParkInputModal(false);
              setParkInput('');
            }}
          />
          
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 rounded-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  🏞️ Chat About Park
                </h2>
                <button
                  onClick={() => {
                    setShowParkInputModal(false);
                    setParkInput('');
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Which park would you like to chat about?
                </p>
                
                <input
                  type="text"
                  value={parkInput}
                  onChange={(e) => setParkInput(e.target.value)}
                  placeholder="Enter park name (e.g., Yellowstone, Yosemite, Grand Canyon...)"
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && parkInput.trim()) {
                      handleParkChat();
                    }
                  }}
                  autoFocus
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowParkInputModal(false);
                      setParkInput('');
                    }}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleParkChat}
                    disabled={!parkInput.trim()}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: parkInput.trim() ? 'var(--accent-green)' : 'var(--surface-hover)',
                      color: parkInput.trim() ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    Start Chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripPlannerChat;