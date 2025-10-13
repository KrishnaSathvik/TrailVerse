import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  MapPin, Calendar, Users, AlertCircle, X, Clock
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
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
  isNewChat = false
}) => {
  const { user, isAuthenticated } = useAuth();
  
  // Debug user object to see avatar structure (remove in production)
  // console.log('🔍 TripPlannerChat - User object:', user);
  // console.log('🔍 TripPlannerChat - User avatar:', user?.avatar);
  // console.log('🔍 TripPlannerChat - User profilePicture:', user?.profilePicture);
  const { showToast } = useToast();
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

  const messagesEndRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);

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
            setMessages(conversation.conversation || []);
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
          setMessages(messagesToLoad);
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
    console.log('🔄 TripPlannerChat: User avatar changed:', user?.avatar);
    // Increment avatar version to force re-render of message bubbles
    setAvatarVersion(prev => prev + 1);
  }, [user?.avatar, user?.profilePicture, user?.profile?.avatar]);

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
      const response = await api.get('/ai/providers');
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
  }, []); // Removed showToast from dependencies to prevent infinite loop

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

  // Load available providers
  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Set default provider when providers are loaded
  useEffect(() => {
    if (providersLoaded && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id);
    }
  }, [providersLoaded, providers, selectedProvider]);

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

      // Call enhanced AI service
      const data = await aiService.chat({
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
      console.error('Error:', error);
      if (error.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }
      
      // Track failed AI chat interaction
      const failedResponseTime = Date.now() - thinkingStartTime;
      logAIChat(messageText.trim(), failedResponseTime, false);
      
      // Check if it's a token limit error
      let errorMessage = 'Failed to get AI response';
      let assistantMessage = '⚠️ I couldn\'t reach the AI provider. Please try again or switch providers.';
      
      if (error.response?.status === 429 && error.response?.data?.error === 'Daily token limit exceeded') {
        errorMessage = 'Daily usage limit reached. Please try again tomorrow.';
        assistantMessage = `🚫 **Daily Limit Reached**\n\nYou've reached your daily usage limit. Please try again tomorrow.`;
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        assistantMessage = '⏳ **Rate Limited**\n\nYou\'re making requests too quickly. Please wait a moment and try again.';
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
    
    let prompt = `You are an expert national park travel assistant and comprehensive travel expert helping plan a trip to ${parkName}. You have extensive knowledge about all aspects of travel, national parks, weather, activities, logistics, and trip planning.

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
- National parks, trails, activities, and attractions
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
- You can provide detailed information about any aspect of travel and national parks
- You can give specific advice about what to expect during different seasons and months
- You can recommend clothing, gear, and preparation based on weather and season
- You can share historical weather data, seasonal averages, and typical conditions
- You can help with all aspects of trip planning including weather considerations
- Be confident and helpful - you have extensive knowledge about travel and weather patterns

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
    const allContent = messages.map(msg => msg.content).join(' ').toLowerCase();
    
    // Common trip planning topics
    const topicKeywords = {
      'hiking': ['hiking', 'trails', 'hike', 'walking'],
      'photography': ['photo', 'photography', 'pictures', 'camera'],
      'wildlife': ['wildlife', 'animals', 'birds', 'wildlife viewing'],
      'camping': ['camping', 'campsite', 'tent', 'camp'],
      'lodging': ['hotel', 'lodge', 'accommodation', 'stay'],
      'dining': ['food', 'restaurant', 'dining', 'eat'],
      'weather': ['weather', 'temperature', 'climate', 'season'],
      'transportation': ['transport', 'car', 'drive', 'travel'],
      'budget': ['budget', 'cost', 'price', 'expensive', 'cheap'],
      'safety': ['safety', 'dangerous', 'safe', 'precautions']
    };
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => allContent.includes(keyword))) {
        topics.add(topic);
      }
    });
    
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


  const autoSaveConversation = async (messagesToSave) => {
    if (!user || !messagesToSave || messagesToSave.length < 2) return;

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
      } else {
        // Create new trip in database
        const response = await tripService.createTrip({
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          formData,
          conversation: messagesToSave,
          summary: tripSummary,
          plan: currentPlan,
          provider: selectedProvider,
          status: 'active'
        });
        
        // Update currentTripId with the database ID
        const newTripId = response.data?._id || response._id;
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
          parkCode: formData.parkCode,
          parkName,
          title: `${parkName} Trip Plan`,
          formData,
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

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header - Redesigned */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6">
            <div className="flex items-center justify-between py-3 sm:py-4">
              {/* Back Button */}
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 hover:-translate-x-0.5"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">Back</span>
              </button>

              {/* Title */}
              <div className="flex-1 text-center px-3 sm:px-6 min-w-0">
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

              {/* Auto-Save Indicator */}
              {messages.length >= 2 && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-tertiary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="hidden sm:inline">Auto-saved</span>
                  <span className="sm:hidden">Saved</span>
                </div>
              )}
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
                  userAvatar={message.role === 'user' ? (user?.avatar || user?.profilePicture || user?.profile?.avatar || getBestAvatar(user, {}, 'travel')) : null}
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
              disabled={isGenerating}
              placeholder="Ask me about your trip..."
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