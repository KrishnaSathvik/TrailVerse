import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Save, ArrowLeft, 
  MapPin, Calendar, Users, AlertCircle, History, X, Clock, Trash2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { tripHistoryService } from '../../services/tripHistoryService';
import aiService from '../../services/aiService';
import api from '../../services/api';
import { logAIChat } from '../../utils/analytics';
import ChatInput from '../ai-chat/ChatInput';
import MessageBubble from '../ai-chat/MessageBubble';
import SuggestedPrompts from '../ai-chat/SuggestedPrompts';
import TypingIndicator from '../ai-chat/TypingIndicator';
import ProviderSelector from './ProviderSelector';


const TripPlannerChat = ({ formData, onBack, parkName, existingTripId = null }) => {
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [currentTripId, setCurrentTripId] = useState(existingTripId);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const abortControllerRef = useRef(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('Thinking...');
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [, setIsRestoredSession] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check if this is a restored session
  useEffect(() => {
    const savedState = localStorage.getItem('planai-chat-state');
    if (savedState) {
      setIsRestoredSession(true);
      // Session restoration runs silently in background - no toast notification
    }
    
    // Load only manually saved trip history for the user
    if (user) {
      const history = tripHistoryService.getTripHistory(user.id);
      setTripHistory(history);
    }
  }, [user]); // Removed showToast from dependencies to prevent infinite loop

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

  const loadExistingTrip = useCallback((tripId) => {
    const trip = tripHistoryService.getTrip(tripId);
    if (trip) {
      setMessages(trip.messages);
      setCurrentPlan(trip.plan);
      setHasShownWelcome(true);
      if (trip.provider) {
        setSelectedProvider(trip.provider);
      }
      // Trip loading runs silently in background - no toast notification
    }
  }, []); // Removed showToast from dependencies to prevent infinite loop

  const getUserContextMessage = () => {
    if (!user) return '';
    
    const context = tripHistoryService.getAIContext(user.id);
    
    if (context.totalTrips === 0) {
      return `🌟 This is your first trip with TrailVerse! I'm excited to help you plan it.`;
    }

    let contextMsg = `📚 **Based on your ${context.totalTrips} previous ${context.totalTrips === 1 ? 'trip' : 'trips'}:**\n`;
    
    if (context.favoriteParks.length > 0) {
      contextMsg += `- You've enjoyed: ${context.favoriteParks.join(', ')}\n`;
    }
    
    if (context.topInterests.length > 0) {
      contextMsg += `- Your interests: ${context.topInterests.slice(0, 3).join(', ')}\n`;
    }

    return contextMsg;
  };

  const calculateDays = () => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const ms = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  };

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

  const showWelcomeMessage = useCallback(() => {
    const userName = user?.name || user?.firstName || 'there';
    const days = calculateDays();
    
    // Check if this is coming from park details page (has park context)
    const isFromParkDetails =
      typeof window !== 'undefined' && window.location.search.includes('park=');
    
    const welcomeMessage = {
      id: Date.now(),
      role: 'assistant',
      content: isFromParkDetails 
        ? `# 👋 Welcome ${userName}!

I see you're interested in planning a trip to **${parkName}**! I'm your AI travel assistant, and I'm excited to help you create an amazing itinerary for this beautiful national park.

## 📍 About ${parkName}

**${parkName}** is one of America's most stunning national parks, offering incredible natural beauty and unforgettable experiences.

---

${getUserContextMessage()}

## 💬 Let's plan your perfect trip!

To give you the best recommendations, I'd love to know more about your trip:

**🗓️ When are you planning to visit?**
- What dates are you thinking?

**👥 Who's coming along?**
- How many people in your group?
- What's your fitness level?

**🎯 What interests you most?**
- Hiking, photography, wildlife watching, camping, scenic drives, or something else?

**💰 What's your budget range?**
- Budget-friendly, moderate, or luxury?

**🏕️ Where would you like to stay?**
- Camping, lodges, or nearby hotels?

## 🚀 Quick Start Options:

You can either:
1. **Tell me about your trip** - Share your dates, group size, and interests
2. **Ask specific questions** - Like "What are the best trails?" or "When's the best time to visit?"
3. **Get general info** - Learn about the park's highlights and activities

What would you like to know about ${parkName}?`
        : `# 👋 Welcome ${userName}!

I'm your AI travel assistant, and I'm here to help you plan an amazing trip to **${parkName}**.

## 📋 Here's what I know about your trip:

**📅 Travel Dates**
- Start: ${new Date(formData.startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- End: ${new Date(formData.endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- Duration: **${days} days**

**👥 Group Details**
- Group Size: **${formData.groupSize}** ${formData.groupSize === 1 ? 'person' : 'people'}
- Fitness Level: **${formData.fitnessLevel.charAt(0).toUpperCase() + formData.fitnessLevel.slice(1)}**

**💰 Budget & Accommodation**
- Budget: **${formData.budget.charAt(0).toUpperCase() + formData.budget.slice(1)}**
- Accommodation: **${formData.accommodation === 'camping' ? 'Camping' : 'Lodging'}**

**🎯 Your Interests**
${formData.interests.map(i => `- ${i.charAt(0).toUpperCase() + i.slice(1).replace('-', ' ')}`).join('\n')}

---

${getUserContextMessage()}

## 💬 What would you like to know?

I can help you with:
- 🗓️ Creating a detailed day-by-day itinerary
- 🎒 Packing list recommendations
- 💰 Budget breakdown and tips
- 🌤️ Weather information and best times
- 📸 Photography spots and tips
- 🥾 Trail recommendations
- 🍴 Dining options
- 🚗 Transportation and logistics

Just ask me anything!`,
      timestamp: new Date()
    };

    setMessages([welcomeMessage]);
    setHasShownWelcome(true);
  }, [user, parkName, formData.startDate, formData.endDate, formData.groupSize, formData.fitnessLevel, formData.budget, formData.accommodation, formData.interests]);

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
    if (providersLoaded) {
      if (existingTripId) {
        loadExistingTrip(existingTripId);
      } else {
        showWelcomeMessage();
      }
    }
  }, [providersLoaded, existingTripId, loadExistingTrip, showWelcomeMessage]);

  const handleSendMessage = async (messageText) => {
    if (!messageText.trim() || isGenerating) return;

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
      const userContext = user ? tripHistoryService.getAIContext(user.id) : null;
      
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
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        provider: data.provider,
        model: data.model
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Track AI chat interaction
      const responseTime = Date.now() - thinkingStartTime;
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
      const responseTime = Date.now() - thinkingStartTime;
      logAIChat(messageText.trim(), responseTime, false);
      
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

  const saveTripHistory = (messagesToSave) => {
    if (!user) return;

    // Create trip summary instead of storing full conversation
    const tripSummary = createTripSummary(messagesToSave);

    // Only save when user explicitly clicks Save button
    if (currentTripId) {
      tripHistoryService.updateTrip(currentTripId, {
        summary: tripSummary,
        plan: currentPlan,
        provider: selectedProvider,
        conversationId: currentTripId // Keep reference to full conversation
      });
    } else {
      const trip = tripHistoryService.saveTrip(user.id, {
        parkName,
        parkCode: formData.parkCode,
        formData,
        summary: tripSummary,
        plan: currentPlan,
        provider: selectedProvider,
        conversationId: currentTripId // Keep reference to full conversation
      });
      setCurrentTripId(trip.id);
    }
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      showToast('Please sign in to save plans', 'error');
      return;
    }
    
    if (messages.length === 0) {
      showToast('No conversation to save yet', 'error');
      return;
    }
    
    saveTripHistory(messages);
    showToast('Trip saved to your profile!', 'success');
  };





  const handleLoadTrip = (tripId) => {
    const trip = tripHistoryService.getTrip(tripId);
    if (trip) {
      setMessages(trip.messages || []);
      setCurrentPlan(trip.plan);
      setCurrentTripId(tripId);
      setShowHistory(false);
      // Trip loading runs silently in background - no toast notification
    }
  };

  const handleDeleteTrip = (tripId) => {
    tripHistoryService.deleteTrip(tripId);
    setTripHistory(prev => prev.filter(trip => trip.id !== tripId));
    showToast('Trip deleted successfully', 'success');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // Different quick prompts based on context
  const quickPrompts = window.location.search.includes('park=') 
    ? [
        "🗓️ When's the best time to visit this park?",
        "🥾 What are the must-see trails and attractions?",
        "📸 Show me the best photography spots",
        "🌤️ Tell me about the weather and seasons",
        "🏕️ What are the camping and lodging options?"
      ]
    : [
        "🗓️ Create a detailed day-by-day itinerary",
        "🎒 What should I pack for this trip?",
        "📸 Show me the best photography spots",
        "💰 What's the estimated budget breakdown?",
        "🌤️ Tell me about the weather and best times to visit"
      ];

  // Show provider selection before chat
  if (!hasShownWelcome && providers.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl p-8 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium transition mb-6"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <h2 className="text-3xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Choose Your AI Assistant
            </h2>
            <p className="text-lg mb-8"
              style={{ color: 'var(--text-secondary)' }}
            >
              Select which AI model you&apos;d like to help plan your trip
            </p>

            <ProviderSelector
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              providers={providers}
            />

            <button
              onClick={showWelcomeMessage}
              className="w-full py-4 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold transition text-lg"
            >
              Start Planning →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show error if no providers
  if (providersLoaded && providers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-md w-full mx-auto px-4">
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
              className="px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold transition"
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
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl border-b"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium transition"
              style={{
                backgroundColor: 'var(--surface-hover)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="flex items-center gap-2">
              {/* Status indicators removed - functionality runs in background */}
              <button
                onClick={() => setShowHistory(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          </div>

          {/* Trip Info Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{parkName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{calculateDays()} days</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{formData.groupSize} {formData.groupSize === 1 ? 'person' : 'people'}</span>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={selectedProvider}
                onChange={(e) => {
                  const newProvider = e.target.value;
                  // Abort any in-flight call
                  abortControllerRef.current?.abort();
                  setSelectedProvider(newProvider);
                  const providerName = providers.find(p => p.id === newProvider)?.name || newProvider;
                  showToast(`Switched to ${providerName}`, 'success');
                }}
                className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-semibold border-none outline-none cursor-pointer"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id} className="text-black">
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message.content}
                isUser={message.role === 'user'}
                timestamp={message.timestamp}
                onCopy={(content) => {
                  navigator.clipboard.writeText(content);
                  showToast('Copied to clipboard!', 'success');
                }}
                onFeedback={(type) => {
                  showToast(
                    type === 'up' ? 'Thanks for your feedback!' : 'We\'ll improve!',
                    'success'
                  );
                }}
              />
            ))}

            {isGenerating && <TypingIndicator 
              text={thinkingMessage}
            />}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 backdrop-blur-xl border-t"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Quick Prompts */}
          {hasShownWelcome && messages.length === 1 && !isGenerating && (
            <SuggestedPrompts
              prompts={quickPrompts}
              onSelect={(prompt) => handleSendMessage(prompt)}
              title="Quick start"
            />
          )}

          {/* Chat Input */}
          <ChatInput
            onSend={handleSendMessage}
            onAttach={(file) => showToast(`Attached: ${file.name}`, 'success')}
            onEmoji={() => showToast('Emoji picker coming soon', 'success')}
            disabled={isGenerating}
            placeholder="Ask me anything about your trip..."
          />
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          />
          
          {/* Sidebar */}
          <div className="w-96 max-w-[90vw] h-full overflow-y-auto"
            style={{
              backgroundColor: 'var(--surface)',
              borderLeftWidth: '1px',
              borderLeftColor: 'var(--border)'
            }}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Trip History
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* History List */}
              {tripHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    No trip history yet. Start planning your first trip!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tripHistory.map((trip) => (
                    <div
                      key={trip.id}
                      className="p-4 rounded-xl border cursor-pointer hover:shadow-md transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderColor: 'var(--border)'
                      }}
                      onClick={() => handleLoadTrip(trip.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1 truncate" style={{ color: 'var(--text-primary)' }}>
                            {trip.parkName}
                          </h3>
                          <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <Calendar className="h-3 w-3" />
                            <span>{trip.formData.startDate} - {trip.formData.endDate}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <Users className="h-3 w-3" />
                            <span>{trip.formData.groupSize} {trip.formData.groupSize === 1 ? 'person' : 'people'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(trip.updatedAt)}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrip(trip.id);
                          }}
                          className="p-1 rounded hover:bg-red-100 transition"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripPlannerChat;