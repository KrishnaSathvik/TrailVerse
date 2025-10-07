import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Download, Save, ArrowLeft, 
  MapPin, Calendar, Users, AlertCircle, History, X, Clock, Trash2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { tripHistoryService } from '../../services/tripHistoryService';
import api from '../../services/api';
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
  const [selectedProvider, setSelectedProvider] = useState('claude');
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('Thinking...');
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [isRestoredSession, setIsRestoredSession] = useState(false);
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

  // Check if this is a restored session and load trip history
  useEffect(() => {
    const savedState = localStorage.getItem('planai-chat-state');
    if (savedState) {
      setIsRestoredSession(true);
      // Session restoration runs silently in background - no toast notification
    }
    
    // Load trip history for the user
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
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  const showWelcomeMessage = useCallback(() => {
    const userName = user?.firstName || 'there';
    const days = calculateDays();
    
    const welcomeMessage = {
      id: Date.now(),
      role: 'assistant',
      content: `# 👋 Welcome ${userName}!

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

      conversationHistory.push({
        role: 'user',
        content: messageText.trim()
      });

      // Call backend API
      const response = await api.post('/ai/chat', {
        messages: conversationHistory,
        provider: selectedProvider,
        systemPrompt,
        maxTokens: 4000
      });

      const data = response.data;

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
      
      // Check if response contains a complete trip plan
      if (data.content.includes('Day 1') || data.content.includes('# Itinerary')) {
        setCurrentPlan({
          parkName,
          content: data.content,
          formData
        });
      }

      // Auto-save to trip history
      if (user) {
        saveTripHistory([...messages, userMessage, assistantMessage]);
      }

      setIsGenerating(false);
      setThinkingStartTime(null);

    } catch (error) {
      console.error('Error:', error);
      showToast(error.message || 'Failed to get AI response', 'error');
      
      // Remove the user message since we couldn't get a response
      setMessages(prev => prev.slice(0, -1));
      setIsGenerating(false);
      setThinkingStartTime(null);
    }
  };

  const buildSystemPrompt = (userContext) => {
    const days = calculateDays();
    
    let prompt = `You are an expert national park travel assistant helping plan a trip to ${parkName}.

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

    prompt += `\n\nINSTRUCTIONS:
- Be conversational and helpful
- Use the user's preferences from their history when relevant
- Create detailed, specific itineraries when asked
- Format responses with perfect markdown structure for maximum readability
- Use proper heading hierarchy (# ## ###)
- Use bullet points (-) for lists with relevant emoji icons (e.g., 🏔️ for hiking, 📸 for photography)
- Use checkmarks (✔) for essential items or completed tasks
- Use warning symbols (⚠) for important cautions
- Use bold text (**text**) for key information
- Use italics (*text*) for emphasis
- Include relevant emojis in your responses for better visual appeal
- Be practical and realistic
- Ask clarifying questions if needed
- Remember context from the conversation
- Provide specific times, locations, and activities
- Include practical tips and warnings
- Consider the group size and fitness level in all recommendations
- Structure information logically with clear sections
- Use visual separators (---) between major sections
- Make responses scannable and easy to read`;

    return prompt;
  };

  const saveTripHistory = (messagesToSave) => {
    if (!user) return;

    if (currentTripId) {
      tripHistoryService.updateTrip(currentTripId, {
        messages: messagesToSave,
        plan: currentPlan,
        provider: selectedProvider
      });
    } else {
      const trip = tripHistoryService.saveTrip(user.id, {
        parkName,
        parkCode: formData.parkCode,
        formData,
        messages: messagesToSave,
        plan: currentPlan,
        provider: selectedProvider
      });
      setCurrentTripId(trip.id);
    }
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      showToast('Please sign in to save plans', 'error');
      return;
    }
    
    saveTripHistory(messages);
    showToast('Trip saved successfully!', 'success');
  };

  const handleExport = () => {
    if (messages.length === 0) {
      showToast('No conversation to export yet', 'error');
      return;
    }
    
    const exportData = {
      parkName,
      formData,
      messages,
      plan: currentPlan,
      provider: selectedProvider,
      exportedAt: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `trip-${parkName.replace(/\s+/g, '-')}-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast('Trip exported successfully!', 'success');
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

  const quickPrompts = [
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
              Select which AI model you'd like to help plan your trip
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
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium transition"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
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