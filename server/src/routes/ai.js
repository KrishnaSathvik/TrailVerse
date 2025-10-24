const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkTokenLimit, trackTokenUsage, getTokenUsage } = require('../middleware/tokenLimits');
const { fetchRelevantFacts } = require('../services/factsService');
const { getAIAnalytics, getLearningInsights } = require('../controllers/aiAnalyticsController');
const AnonymousSession = require('../models/AnonymousSession');
const { generateAnonymousIdFromRequest } = require('../utils/anonymousIdGenerator');

// Initialize AI clients
let anthropic = null;
let openai = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
} catch (error) {
  console.warn('Claude SDK not available:', error.message);
}

try {
  if (process.env.OPENAI_API_KEY) {
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (error) {
  console.warn('OpenAI SDK not available:', error.message);
}

// Chat endpoint
router.post('/chat', protect, checkTokenLimit, trackTokenUsage, async (req, res) => {
  try {
    console.log('[AI] Chat request received:', { 
      provider: req.body.provider, 
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    const { 
      messages = [], 
      provider = 'claude', 
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 2000,
      systemPrompt,
      metadata = {} // { parkCode, parkName, lat, lon, userId }
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Filter out system messages from the messages array (Claude API doesn't allow them)
    const filteredMessages = messages.filter(m => m.role !== 'system');
    
    // Extract the last user message for fact fetching
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Fetch relevant facts based on user message and metadata
    let weatherFacts = null;
    let npsFacts = null;
    
    try {
      const factsResult = await fetchRelevantFacts({
        userMessage: lastUserMessage,
        parkCode: metadata.parkCode,
        lat: metadata.lat,
        lon: metadata.lon,
        parkName: metadata.parkName
      });
      weatherFacts = factsResult.weatherFacts;
      npsFacts = factsResult.npsFacts;
      console.log('[AI] Facts fetched:', { hasWeather: !!weatherFacts, hasNPS: !!npsFacts });
    } catch (factsError) {
      console.error('[AI] Facts fetching error:', factsError.message);
      // Continue without facts if fetching fails
    }

    // Build enhanced system prompt with facts
    let enhancedSystemPrompt = systemPrompt || 'You are a helpful travel assistant.';
    
    if (npsFacts) {
      enhancedSystemPrompt += `\n\nNPS FACTS for ${metadata.parkName || 'this park'}:\n${npsFacts}\n\nUse these in answers. Do not invent closures or permits.`;
    }
    if (weatherFacts) {
      enhancedSystemPrompt += `\n\nLIVE WEATHER FACTS for ${metadata.parkName || 'this park'}:\n${weatherFacts}\nDo not guess weather beyond these facts.`;
    }

    // Use the filtered conversation messages without system role messages
    const augmentedMessages = filteredMessages;
    
    console.log('[AI] Augmented messages:', { 
      hasSystemFacts: !!(npsFacts || weatherFacts),
      totalMessageCount: augmentedMessages.length,
      provider 
    });

    let response;

    if (provider === 'claude') {
      // Claude API
      if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
      }

      // Try models in order of preference
      const modelsToTry = [
        'claude-sonnet-4-5-20250929',  // Claude Sonnet 4.5 (latest)
        'claude-3-5-sonnet-20241022',  // Claude 3.5 Sonnet (stable)
        'claude-3-5-sonnet-20240620',  // Claude 3.5 Sonnet (earlier version)
        'claude-3-opus-20240229'       // Claude 3 Opus (most capable)
      ];

      let lastError = null;
      let successfulModel = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[Chat] Trying Claude model: ${model}`);
          
          const claudeResponse = await anthropic.messages.create({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: maxTokens,
            temperature: temperature,
            system: enhancedSystemPrompt,
            messages: augmentedMessages,
          });

          response = {
            content: claudeResponse.content[0].text,
            provider: 'claude',
            model: model,
            usage: {
              inputTokens: claudeResponse.usage.input_tokens,
              outputTokens: claudeResponse.usage.output_tokens,
            }
          };

          successfulModel = model;
          console.log(`[Chat] Success with Claude model: ${model}`);
          break; // Success, exit loop

        } catch (error) {
          lastError = error;
          console.log(`[Chat] Model ${model} failed: ${error.message}`);
          
          // Check if it's a model not found error
          if (error.message && error.message.includes('model')) {
            console.log(`[Chat] Model ${model} not available, trying next...`);
            continue; // Try next model
          }
          
          // For other errors, throw immediately
          throw error;
        }
      }

      if (!response) {
        console.error('[Chat] All Claude models failed');
        return res.status(400).json({ 
          error: 'No Claude models available with your API key',
          details: lastError?.message || 'Unknown error',
          availableModels: modelsToTry
        });
      }

    } else if (provider === 'openai') {
      // OpenAI API
      if (!openai) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }

      const openaiMessages = augmentedMessages.map(m => ({ role: m.role, content: m.content }));

      const openaiResponse = await openai.chat.completions.create({
        model: model || 'gpt-4',
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-4',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    res.json({ data: response });

  } catch (error) {
    console.error('AI API Error:', error);
    
    // Check if it's a model-related error
    if (error.message && (error.message.includes('model') || error.message.includes('not found'))) {
      return res.status(400).json({ 
        error: 'Invalid or unavailable model',
        details: error.message,
        suggestion: 'Try using the /api/ai/test-models endpoint to see available models'
      });
    }
    
    // Check if it's an authentication error
    if (error.status === 401 || error.message.includes('authentication')) {
      return res.status(401).json({ 
        error: 'API key authentication failed',
        details: 'Please check your API key configuration'
      });
    }
    
    // Check if it's a rate limit error
    if (error.status === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: error.message,
        suggestion: 'Please wait a moment before trying again'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get AI response',
      details: error.message,
      errorType: error.type || 'unknown'
    });
  }
});

// Anonymous chat endpoint (no auth required)
router.post('/chat-anonymous', async (req, res) => {
  try {
    console.log('[AI] Anonymous chat request received:', { 
      provider: req.body.provider, 
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    // Generate anonymous ID from request
    const { anonymousId, ipAddress, userAgent, browserFingerprint } = generateAnonymousIdFromRequest(req);

    const { 
      messages = [], 
      provider = 'claude', 
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 2000,
      systemPrompt,
      metadata = {} // { parkCode, parkName, lat, lon }
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Find or create anonymous session
    const sessionData = {
      ipAddress,
      userAgent,
      browserFingerprint,
      parkName: metadata.parkName || 'General Planning',
      parkCode: metadata.parkCode,
      formData: metadata.formData || {}
    };

    let session = await AnonymousSession.findOrCreateSession(anonymousId, sessionData);

    // Add user message to session first
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await session.addMessage({
        role: 'user',
        content: lastUserMessage.content,
        timestamp: new Date()
      });
    }

    // Check if user can send more messages BEFORE processing the AI request
    if (!session.canSendMessage()) {
      // User has exceeded message limit, return conversion message
      const lastUserMessageContent = lastUserMessage?.content || '';
      
      const conversionMessage = {
        role: 'assistant',
        content: `Hey traveler! 👋

Thanks for your follow-up question about "${lastUserMessageContent}". I'd love to help you plan more amazing adventures, but as an unauthenticated user, you can only ask 3 questions.

You have two options to continue:

🚀 **Create an Account (Recommended)**
• Ask unlimited questions
• Save your trip plans
• Access your conversation history
• Get personalized recommendations

⏰ **Wait 48 Hours (Free)**
• Get 3 fresh questions automatically
• No account required
• Completely free
• Session resets automatically

Ready to continue planning? 🚀`,
        timestamp: new Date(),
        isConversionMessage: true
      };

      const userMessageCount = session.messages.filter(msg => msg.role === 'user').length;
      
      return res.json({ 
        data: {
          content: conversionMessage.content,
          provider: 'system',
          model: 'conversion',
          isConversionMessage: true,
          anonymousId: session.anonymousId,
          messageCount: userMessageCount,
          canSendMore: false
        }
      });
    }

    // Filter out system messages from the messages array (Claude API doesn't allow them)
    const filteredMessages = messages.filter(m => m.role !== 'system');
    
    // Extract the last user message for fact fetching
    const lastUserMessageContent = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Fetch relevant facts based on user message and metadata
    let weatherFacts = null;
    let npsFacts = null;
    
    try {
      const factsResult = await fetchRelevantFacts({
        userMessage: lastUserMessageContent,
        parkCode: metadata.parkCode,
        lat: metadata.lat,
        lon: metadata.lon,
        parkName: metadata.parkName
      });
      weatherFacts = factsResult.weatherFacts;
      npsFacts = factsResult.npsFacts;
      console.log('[AI] Facts fetched for anonymous user:', { hasWeather: !!weatherFacts, hasNPS: !!npsFacts });
    } catch (factsError) {
      console.error('[AI] Facts fetching error for anonymous user:', factsError.message);
      // Continue without facts if fetching fails
    }

    // Build enhanced system prompt with facts
    let enhancedSystemPrompt = systemPrompt || 'You are a helpful travel assistant.';
    
    if (npsFacts) {
      enhancedSystemPrompt += `\n\nNPS FACTS for ${metadata.parkName || 'this park'}:\n${npsFacts}\n\nUse these in answers. Do not invent closures or permits.`;
    }
    if (weatherFacts) {
      enhancedSystemPrompt += `\n\nLIVE WEATHER FACTS for ${metadata.parkName || 'this park'}:\n${weatherFacts}\nDo not guess weather beyond these facts.`;
    }

    // Use the filtered conversation messages without system role messages
    const augmentedMessages = filteredMessages;
    
    console.log('[AI] Augmented messages for anonymous user:', { 
      hasSystemFacts: !!(npsFacts || weatherFacts),
      totalMessageCount: augmentedMessages.length,
      provider,
      messageCount: session.messageCount
    });

    let response;

    if (provider === 'claude') {
      // Claude API
      if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
      }

      // Try models in order of preference
      const modelsToTry = [
        'claude-sonnet-4-5-20250929',  // Claude Sonnet 4.5 (latest)
        'claude-3-5-sonnet-20241022',  // Claude 3.5 Sonnet (stable)
        'claude-3-5-sonnet-20240620',  // Claude 3.5 Sonnet (earlier version)
        'claude-3-opus-20240229'       // Claude 3 Opus (most capable)
      ];

      let lastError = null;
      let successfulModel = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[Chat] Trying Claude model for anonymous user: ${model}`);
          
          const claudeResponse = await anthropic.messages.create({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: maxTokens,
            temperature: temperature,
            system: enhancedSystemPrompt,
            messages: augmentedMessages,
          });

          response = {
            content: claudeResponse.content[0].text,
            provider: 'claude',
            model: model,
            usage: {
              inputTokens: claudeResponse.usage.input_tokens,
              outputTokens: claudeResponse.usage.output_tokens,
            }
          };

          successfulModel = model;
          console.log(`[Chat] Success with Claude model for anonymous user: ${model}`);
          break; // Success, exit loop

        } catch (error) {
          lastError = error;
          console.log(`[Chat] Model ${model} failed for anonymous user: ${error.message}`);
          
          // Check if it's a model not found error
          if (error.message && error.message.includes('model')) {
            console.log(`[Chat] Model ${model} not available for anonymous user, trying next...`);
            continue; // Try next model
          }
          
          // For other errors, throw immediately
          throw error;
        }
      }

      if (!response) {
        console.error('[Chat] All Claude models failed for anonymous user');
        return res.status(400).json({ 
          error: 'No Claude models available with your API key',
          details: lastError?.message || 'Unknown error',
          availableModels: modelsToTry
        });
      }

    } else if (provider === 'openai') {
      // OpenAI API
      if (!openai) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }

      const openaiMessages = augmentedMessages.map(m => ({ role: m.role, content: m.content }));

      const openaiResponse = await openai.chat.completions.create({
        model: model || 'gpt-4',
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-4',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    // Add AI response to session
    await session.addMessage({
      role: 'assistant',
      content: response.content,
      provider: response.provider,
      model: response.model,
      responseTime: Date.now() - session.lastActivity
    });

    const userMessageCount = session.messages.filter(msg => msg.role === 'user').length;
    
    res.json({ 
      data: {
        content: response.content,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        anonymousId: session.anonymousId,
        messageCount: userMessageCount,
        canSendMore: session.canSendMessage()
      }
    });

  } catch (error) {
    console.error('Anonymous AI API Error:', error);
    
    // Check if it's a model-related error
    if (error.message && (error.message.includes('model') || error.message.includes('not found'))) {
      return res.status(400).json({ 
        error: 'Invalid or unavailable model',
        details: error.message,
        suggestion: 'Try using the /api/ai/test-models endpoint to see available models'
      });
    }
    
    // Check if it's an authentication error
    if (error.status === 401 || error.message.includes('authentication')) {
      return res.status(401).json({ 
        error: 'API key authentication failed',
        details: 'Please check your API key configuration'
      });
    }
    
    // Check if it's a rate limit error
    if (error.status === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: error.message,
        suggestion: 'Please wait a moment before trying again'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get AI response',
      details: error.message,
      errorType: error.type || 'unknown'
    });
  }
});

// Get anonymous session status
router.get('/session-status/:anonymousId', async (req, res) => {
  try {
    const session = await AnonymousSession.findOne({ 
      anonymousId: req.params.anonymousId 
    });
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        canSendMore: false,
        messageCount: 0
      });
    }
    
    const userMessageCount = session.messages.filter(msg => msg.role === 'user').length;
    
    res.json({
      canSendMore: session.canSendMessage(),
      messageCount: userMessageCount,
      isConverted: session.isConverted,
      lastActivity: session.lastActivity,
      parkName: session.parkName
    });
  } catch (error) {
    console.error('Error checking session status:', error);
    res.status(500).json({ 
      error: 'Failed to check session status',
      canSendMore: false,
      messageCount: 0
    });
  }
});

// Get available providers (anonymous version)
router.get('/providers-anonymous', (req, res) => {
  const providers = [];

  if (anthropic && process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: 'claude',
      name: 'Claude',
      model: 'Sonnet 4.5',
      description: 'Anthropic Claude - Best for detailed planning (with fallback to 3.5 Sonnet)',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'ChatGPT',
      model: 'GPT-4',
      description: 'OpenAI GPT-4 - Fast and versatile',
      available: true
    });
  }

  if (providers.length === 0) {
    return res.status(503).json({ 
      error: 'No AI providers configured',
      providers: []
    });
  }

  res.json({ providers });
});

// Get available providers (authenticated version)
router.get('/providers', protect, (req, res) => {
  const providers = [];

  if (anthropic && process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: 'claude',
      name: 'Claude',
      model: 'Sonnet 4.5',
      description: 'Anthropic Claude - Best for detailed planning (with fallback to 3.5 Sonnet)',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'ChatGPT',
      model: 'GPT-4',
      description: 'OpenAI GPT-4 - Fast and versatile',
      available: true
    });
  }

  if (providers.length === 0) {
    return res.status(503).json({ 
      error: 'No AI providers configured',
      providers: []
    });
  }

  res.json({ providers });
});

// Test Claude models endpoint
router.get('/test-models', protect, async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'Claude not configured' });
  }

  const modelsToTest = [
    'claude-sonnet-4-5-20250929',  // Claude Sonnet 4.5 (latest)
    'claude-3-5-sonnet-20241022',  // Claude 3.5 Sonnet (stable)
    'claude-3-5-sonnet-20240620',  // Claude 3.5 Sonnet (earlier version)
    'claude-3-opus-20240229',      // Claude 3 Opus (most capable)
    'claude-3-sonnet-20240229',    // Claude 3 Sonnet
    'claude-3-haiku-20240307'      // Claude 3 Haiku (fastest)
  ];

  const results = [];

  for (const model of modelsToTest) {
    try {
      console.log(`Testing model: ${model}`);
      
      await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      
      results.push({ model, available: true, error: null });
      console.log(`✓ ${model} - Available`);
      
    } catch (error) {
      results.push({ 
        model, 
        available: false, 
        error: error.message,
        errorType: error.type || 'unknown'
      });
      console.log(`✗ ${model} - Not available: ${error.message}`);
    }
  }

  const availableModels = results.filter(r => r.available).map(r => r.model);
  const unavailableModels = results.filter(r => !r.available);

  res.json({ 
    results,
    summary: {
      total: results.length,
      available: availableModels.length,
      unavailable: unavailableModels.length,
      availableModels,
      unavailableModels: unavailableModels.map(r => ({ model: r.model, error: r.error }))
    }
  });
});

// Get token usage information
router.get('/token-usage', protect, getTokenUsage);

// AI Analytics routes
router.get('/analytics', protect, getAIAnalytics);
router.get('/learning-insights', protect, getLearningInsights);

module.exports = router;