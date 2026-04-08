const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkTokenLimit, trackTokenUsage, getTokenUsage } = require('../middleware/tokenLimits');
const { fetchRelevantFacts } = require('../services/factsService');
const { extractParkFromMessage } = require('../utils/parkExtractor');
const { getAIAnalytics, getLearningInsights } = require('../controllers/aiAnalyticsController');
const AnonymousSession = require('../models/AnonymousSession');
const { generateAnonymousIdFromRequest } = require('../utils/anonymousIdGenerator');
const { extractItineraryJSON } = require('../utils/extractItineraryJSON');

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

// Helper: parse request body and prepare messages, facts, and system prompt
async function prepareChatContext(body, logPrefix = '[AI]') {
  let {
    messages = [],
    provider = 'claude',
    model,
    temperature = 0.4,
    top_p = 0.9,
    maxTokens = 8000,
    systemPrompt,
    metadata = {} // { parkCode, parkName, lat, lon, userId }
  } = body;

  if (!messages || !Array.isArray(messages)) {
    throw Object.assign(new Error('Messages array is required'), { statusCode: 400 });
  }

  // Smart context management — trim long conversations
  const MAX_CONTEXT_MESSAGES = 20;
  if (messages.length > MAX_CONTEXT_MESSAGES) {
    const systemMsg = messages.find(m => m.role === 'system');
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-15);
    const olderMessages = messages.filter(m => m.role !== 'system').slice(0, -15);
    const summaryText = `[Previous conversation summary: The user and AI discussed ${olderMessages.length} earlier messages about trip planning. Key topics covered include the initial trip setup and early recommendations.]`;

    messages = [
      ...(systemMsg ? [systemMsg] : []),
      { role: 'system', content: summaryText },
      ...recentMessages
    ];
  }

  // Filter out system messages from the messages array (Claude API doesn't allow them)
  const filteredMessages = messages.filter(m => m.role !== 'system');

  // Extract the last user message for fact fetching
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Auto-extract park from user message if not provided in metadata
  let resolvedMetadata = { ...metadata };
  if (!resolvedMetadata.parkCode && lastUserMessage) {
    const extracted = extractParkFromMessage(lastUserMessage);
    if (extracted) {
      resolvedMetadata.parkCode = extracted.parkCode;
      resolvedMetadata.parkName = resolvedMetadata.parkName || extracted.parkName;
      resolvedMetadata.lat = resolvedMetadata.lat || extracted.lat;
      resolvedMetadata.lon = resolvedMetadata.lon || extracted.lon;
      console.log(`${logPrefix} Park auto-extracted from message: ${extracted.parkName} (${extracted.parkCode})`);
    }
  }

  // Fetch relevant facts based on user message and resolved metadata
  let weatherFacts = null;
  let npsFacts = null;
  let webSearchFacts = null;

  try {
    const factsResult = await fetchRelevantFacts({
      userMessage: lastUserMessage,
      parkCode: resolvedMetadata.parkCode,
      lat: resolvedMetadata.lat,
      lon: resolvedMetadata.lon,
      parkName: resolvedMetadata.parkName
    });
    weatherFacts = factsResult.weatherFacts;
    npsFacts = factsResult.npsFacts;
    webSearchFacts = factsResult.webSearchFacts;
    console.log(`${logPrefix} Facts fetched:`, { hasWeather: !!weatherFacts, hasNPS: !!npsFacts, hasWebSearch: !!webSearchFacts });
  } catch (factsError) {
    console.error(`${logPrefix} Facts fetching error:`, factsError.message);
  }

  // Build enhanced system prompt with facts
  let enhancedSystemPrompt = systemPrompt || 'You are a helpful travel assistant.';

  if (npsFacts || weatherFacts || webSearchFacts) {
    const parkLabel = resolvedMetadata.parkName || 'this park';
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    enhancedSystemPrompt += `\n\n--- LIVE TRAILVERSE DATA: ${parkLabel.toUpperCase()} ---`;
    enhancedSystemPrompt += `\nData current as of ${today}. Reference this data in your response.`;
    enhancedSystemPrompt += `\nWhen citing alerts or conditions, say "as of today" or "current NPS data shows".`;
    enhancedSystemPrompt += `\nDo NOT invent closures, permits, or conditions not listed here.\n\n`;

    if (npsFacts) {
      enhancedSystemPrompt += npsFacts + '\n\n';
    }
    if (weatherFacts) {
      enhancedSystemPrompt += weatherFacts + '\n\n';
    }
    if (webSearchFacts) {
      enhancedSystemPrompt += webSearchFacts + '\n';
    }

    enhancedSystemPrompt += `--- END LIVE DATA ---\n`;
  }

  const augmentedMessages = filteredMessages;

  console.log(`${logPrefix} Augmented messages:`, {
    hasSystemFacts: !!(npsFacts || weatherFacts),
    totalMessageCount: augmentedMessages.length,
    provider
  });

  return { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, metadata, npsFacts, weatherFacts, webSearchFacts, resolvedMetadata };
}

// Chat endpoint — no token limit for logged-in users, trackTokenUsage kept for analytics
router.post('/chat', protect, trackTokenUsage, async (req, res) => {
  try {
    console.log('[AI] Chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    const { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, npsFacts, weatherFacts, resolvedMetadata } = await prepareChatContext(req.body);

    let response;

    if (provider === 'claude') {
      // Claude API
      if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
      }

      // Try models in order of preference
      const modelsToTry = [
        'claude-sonnet-4-6',           // Claude Sonnet 4.6 (latest, fast)
        'claude-haiku-4-5-20251001',   // Claude Haiku 4.5 (budget fallback)
      ];

      let lastError = null;
      let successfulModel = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[Chat] Trying Claude model: ${model}`);

          const claudeResponse = await anthropic.messages.create({
            model: model || 'claude-sonnet-4-6',
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
          console.error(`[Chat] Model ${model} failed:`, {
            message: error.message,
            status: error.status,
            statusCode: error.statusCode,
            type: error.type,
            errorType: error.error?.type,
            code: error.code
          });
          
          // Check if it's a model not found error (404) or not_found_error type
          // Check multiple possible error locations (Anthropic SDK may structure errors differently)
          const errorBody = error.error || error.response?.data || error.body || {};
          const is404Error = error.status === 404 || error.statusCode === 404 || 
                           error.response?.status === 404;
          const isNotFoundError = error.error?.type === 'not_found_error' || 
                                 error.type === 'not_found_error' ||
                                 errorBody.type === 'not_found_error' ||
                                 errorBody.error?.type === 'not_found_error';
          const isModelError = (error.message && (
            error.message.includes('model') || 
            error.message.includes('not found') ||
            error.message.includes('not_found')
          )) || (errorBody.error?.message && errorBody.error.message.includes('model'));
          
          const isAuthError = error.status === 401 || error.statusCode === 401 || 
                             error.status === 403 || error.statusCode === 403;
          
          // If it's a 404 or not_found_error, try next model
          if (is404Error || isNotFoundError || isModelError) {
            console.log(`[Chat] Model ${model} not available (404/not_found), trying next...`);
            continue; // Try next model
          }
          
          // For auth errors on first model, try next model (might be API key issue with specific model)
          if (isAuthError && modelsToTry.indexOf(model) === 0) {
            console.log(`[Chat] Authentication error with ${model}, trying next model...`);
            continue;
          }
          
          // For other errors, throw immediately (network errors, rate limits, etc.)
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
        model: model || 'gpt-4.1',
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-4.1',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    // Extract and strip itinerary JSON from response
    const { cleanContent, itineraryData } = extractItineraryJSON(response.content);
    response.content = cleanContent;
    response.hasItinerary = !!itineraryData;

    if (itineraryData) {
      const tripId = req.body.tripId || req.body.conversationId || req.body.metadata?.tripId;
      if (tripId) {
        try {
          const TripPlan = require('../models/TripPlan');
          await TripPlan.findByIdAndUpdate(tripId, {
            plan: {
              type: 'itinerary',
              version: 1,
              generatedAt: new Date().toISOString(),
              createdFrom: 'ai',
              parkName: req.body.metadata?.parkName || null,
              parkCode: req.body.metadata?.parkCode || null,
              ...itineraryData
            }
          });
          console.log(`[AI] Itinerary saved to TripPlan ${tripId}`);
        } catch (saveErr) {
          console.error('[AI] Failed to save itinerary:', saveErr.message);
          // Non-fatal — conversation still works without plan save
        }
      }
    }

    res.json({ data: { ...response, hasLiveData: !!(npsFacts || weatherFacts), parkName: resolvedMetadata.parkName || null } });

  } catch (error) {
    // Log detailed error information
    console.error('AI API Error:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      type: error.type,
      code: error.code,
      response: error.response?.data,
      provider: req.body.provider || 'unknown',
      userId: req.user?.id || 'anonymous'
    });
    
    // Check if it's a model-related error
    if (error.message && (error.message.includes('model') || error.message.includes('not found') || error.message.includes('not_found'))) {
      return res.status(400).json({ 
        error: 'Invalid or unavailable model',
        details: error.message,
        suggestion: 'Try using the /api/ai/test-models endpoint to see available models'
      });
    }
    
    // Check if it's an authentication error
    if (error.status === 401 || error.statusCode === 401 || error.message.includes('authentication') || error.message.includes('Invalid API key')) {
      return res.status(401).json({ 
        error: 'API key authentication failed',
        details: error.message || 'Please check your API key configuration',
        suggestion: 'Verify your API keys are correctly set in environment variables'
      });
    }
    
    // Check if it's a rate limit error
    if (error.status === 429 || error.statusCode === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: error.message,
        suggestion: 'Please wait a moment before trying again'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get AI response',
      details: error.message || 'Unknown error occurred',
      errorType: error.type || 'unknown',
      suggestion: 'Please try again in a moment or switch providers'
    });
  }
});

// Streaming chat endpoint — SSE for authenticated users
router.post('/chat-stream', protect, trackTokenUsage, async (req, res) => {
  try {
    console.log('[AI] Stream chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    const { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, npsFacts, weatherFacts, webSearchFacts, resolvedMetadata } = await prepareChatContext(req.body, '[AI Stream]');

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send thinking event so frontend can show what data sources are being used
    const dataSources = [];
    if (npsFacts) dataSources.push('nps');
    if (weatherFacts) dataSources.push('weather');
    if (webSearchFacts) dataSources.push('web');
    res.write(`data: ${JSON.stringify({ type: 'thinking', sources: dataSources, parkName: resolvedMetadata.parkName || null })}\n\n`);

    try {
      if (provider === 'claude') {
        if (!anthropic) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Claude API key not configured' })}\n\n`);
          return res.end();
        }

        const stream = await anthropic.messages.create({
          model: model || 'claude-sonnet-4-6',
          max_tokens: maxTokens,
          temperature: temperature,
          system: enhancedSystemPrompt,
          messages: augmentedMessages,
          stream: true
        });

        let fullContent = '';
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullContent += chunk.delta.text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.delta.text })}\n\n`);
          }
          if (chunk.type === 'message_stop') {
            const { cleanContent, itineraryData } = extractItineraryJSON(fullContent);
            res.write(`data: ${JSON.stringify({ type: 'done', content: cleanContent, provider: 'claude', model: model || 'claude-sonnet-4-6', hasLiveData: !!(npsFacts || weatherFacts || webSearchFacts), hasWebSearch: !!webSearchFacts, parkName: resolvedMetadata.parkName || null, hasItinerary: !!itineraryData })}\n\n`);

            if (itineraryData) {
              const tripId = req.body.tripId || req.body.conversationId || req.body.metadata?.tripId;
              if (tripId) {
                try {
                  const TripPlan = require('../models/TripPlan');
                  await TripPlan.findByIdAndUpdate(tripId, {
                    plan: {
                      type: 'itinerary',
                      version: 1,
                      generatedAt: new Date().toISOString(),
                      createdFrom: 'ai',
                      parkName: req.body.metadata?.parkName || null,
                      parkCode: req.body.metadata?.parkCode || null,
                      ...itineraryData
                    }
                  });
                  console.log(`[AI] Itinerary saved to TripPlan ${tripId}`);
                } catch (saveErr) {
                  console.error('[AI] Failed to save itinerary:', saveErr.message);
                  // Non-fatal — conversation still saved by autoSaveConversation
                }
              }
            }
          }
        }
      } else if (provider === 'openai') {
        if (!openai) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'OpenAI API key not configured' })}\n\n`);
          return res.end();
        }

        const openaiMessages = augmentedMessages.map(m => ({ role: m.role, content: m.content }));

        const stream = await openai.chat.completions.create({
          model: model || 'gpt-4.1',
          messages: [{ role: 'system', content: enhancedSystemPrompt }, ...openaiMessages],
          temperature: temperature,
          max_tokens: maxTokens,
          stream: true
        });

        let fullContent = '';
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullContent += text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
          }
        }
        const { cleanContent: openaiCleanContent, itineraryData: openaiItineraryData } = extractItineraryJSON(fullContent);
        res.write(`data: ${JSON.stringify({ type: 'done', content: openaiCleanContent, provider: 'openai', model: model || 'gpt-4.1', hasLiveData: !!(npsFacts || weatherFacts || webSearchFacts), hasWebSearch: !!webSearchFacts, parkName: resolvedMetadata.parkName || null, hasItinerary: !!openaiItineraryData })}\n\n`);

        if (openaiItineraryData) {
          const tripId = req.body.tripId || req.body.conversationId || req.body.metadata?.tripId;
          if (tripId) {
            try {
              const TripPlan = require('../models/TripPlan');
              await TripPlan.findByIdAndUpdate(tripId, {
                plan: {
                  type: 'itinerary',
                  version: 1,
                  generatedAt: new Date().toISOString(),
                  createdFrom: 'ai',
                  parkName: req.body.metadata?.parkName || null,
                  parkCode: req.body.metadata?.parkCode || null,
                  ...openaiItineraryData
                }
              });
              console.log(`[AI] Itinerary saved to TripPlan ${tripId}`);
            } catch (saveErr) {
              console.error('[AI] Failed to save itinerary:', saveErr.message);
            }
          }
        }
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid provider. Use "claude" or "openai"' })}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error('[AI Stream] Streaming error:', error.message);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  } catch (error) {
    // prepareChatContext validation error (headers not yet sent)
    console.error('[AI Stream] Setup error:', error.message);
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to start AI stream', details: error.message });
  }
});

// Anonymous chat endpoint (no auth required)
router.post('/chat-anonymous', async (req, res) => {
  try {
    console.log('[AI] Anonymous chat request received:', { 
      provider: req.body.provider, 
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata,
      hasClientAnonymousId: !!req.body.anonymousId
    });

    const { 
      messages = [], 
      provider = 'claude', 
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 8000,
      systemPrompt,
      metadata = {}, // { parkCode, parkName, lat, lon }
      anonymousId: clientAnonymousId // Use client-provided anonymousId if available
    } = req.body;

    // Use client-provided anonymousId if available, otherwise generate new one
    // This ensures session persistence across requests
    let anonymousId;
    let ipAddress, userAgent, browserFingerprint;
    
    if (clientAnonymousId) {
      // Client provided an anonymousId - use it and get IP/UA for session data
      anonymousId = clientAnonymousId;
      const requestData = generateAnonymousIdFromRequest(req);
      ipAddress = requestData.ipAddress;
      userAgent = requestData.userAgent;
      browserFingerprint = requestData.browserFingerprint;
      console.log('[AI] Using client-provided anonymousId:', anonymousId);
    } else {
      // No client anonymousId - generate new one (first request)
      const requestData = generateAnonymousIdFromRequest(req);
      anonymousId = requestData.anonymousId;
      ipAddress = requestData.ipAddress;
      userAgent = requestData.userAgent;
      browserFingerprint = requestData.browserFingerprint;
      console.log('[AI] Generated new anonymousId:', anonymousId);
    }

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
      // Save the session after adding message to ensure message count is updated
      session = await session.addMessage({
        role: 'user',
        content: lastUserMessage.content,
        timestamp: new Date()
      });
      // Reload session from database to get updated message count
      session = await AnonymousSession.findOne({ anonymousId });
    }

    // Check if user can send more messages BEFORE processing the AI request
    if (!session.canSendMessage()) {
      // User has exceeded message limit, return conversion message
      const lastUserMessageContent = lastUserMessage?.content || '';
      
      const conversionMessage = {
        role: 'assistant',
        content: `Hey traveler! 👋

Thanks for your follow-up message about "${lastUserMessageContent}". I'd love to help you plan more amazing adventures, but as an unauthenticated user, you can only send 5 messages.

You have two options to continue:

🚀 **Create an Account (Recommended)**
• Send unlimited messages
• Save your trip plans
• Access your conversation history
• Get personalized recommendations

⏰ **Wait 48 Hours (Free)**
• Get 5 fresh messages automatically
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

    // Auto-extract park from user message if not provided in metadata
    let resolvedMetadata = { ...metadata };
    if (!resolvedMetadata.parkCode && lastUserMessageContent) {
      const extracted = extractParkFromMessage(lastUserMessageContent);
      if (extracted) {
        resolvedMetadata.parkCode = extracted.parkCode;
        resolvedMetadata.parkName = resolvedMetadata.parkName || extracted.parkName;
        resolvedMetadata.lat = resolvedMetadata.lat || extracted.lat;
        resolvedMetadata.lon = resolvedMetadata.lon || extracted.lon;
        console.log(`[AI] Park auto-extracted from anonymous message: ${extracted.parkName} (${extracted.parkCode})`);
      }
    }

    // Fetch relevant facts based on user message and resolved metadata
    let weatherFacts = null;
    let npsFacts = null;

    try {
      const factsResult = await fetchRelevantFacts({
        userMessage: lastUserMessageContent,
        parkCode: resolvedMetadata.parkCode,
        lat: resolvedMetadata.lat,
        lon: resolvedMetadata.lon,
        parkName: resolvedMetadata.parkName
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

    if (npsFacts || weatherFacts) {
      const parkLabel = resolvedMetadata.parkName || 'this park';
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      enhancedSystemPrompt += `\n\n--- LIVE TRAILVERSE DATA: ${parkLabel.toUpperCase()} ---`;
      enhancedSystemPrompt += `\nData current as of ${today}. Reference this data in your response.`;
      enhancedSystemPrompt += `\nWhen citing alerts or conditions, say "as of today" or "current NPS data shows".`;
      enhancedSystemPrompt += `\nDo NOT invent closures, permits, or conditions not listed here.\n\n`;

      if (npsFacts) {
        enhancedSystemPrompt += npsFacts + '\n\n';
      }
      if (weatherFacts) {
        enhancedSystemPrompt += weatherFacts + '\n';
      }

      enhancedSystemPrompt += `--- END LIVE DATA ---\n`;
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
        'claude-sonnet-4-6',           // Claude Sonnet 4.6 (latest, fast)
        'claude-haiku-4-5-20251001',   // Claude Haiku 4.5 (budget fallback)
      ];

      let lastError = null;
      let successfulModel = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[Chat] Trying Claude model for anonymous user: ${model}`);

          const claudeResponse = await anthropic.messages.create({
            model: model || 'claude-sonnet-4-6',
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
          console.error(`[Chat] Model ${model} failed for anonymous user:`, {
            message: error.message,
            status: error.status,
            statusCode: error.statusCode,
            type: error.type,
            errorType: error.error?.type,
            code: error.code
          });
          
          // Check if it's a model not found error (404) or not_found_error type
          // Check multiple possible error locations (Anthropic SDK may structure errors differently)
          const errorBody = error.error || error.response?.data || error.body || {};
          const is404Error = error.status === 404 || error.statusCode === 404 || 
                           error.response?.status === 404;
          const isNotFoundError = error.error?.type === 'not_found_error' || 
                                 error.type === 'not_found_error' ||
                                 errorBody.type === 'not_found_error' ||
                                 errorBody.error?.type === 'not_found_error';
          const isModelError = (error.message && (
            error.message.includes('model') || 
            error.message.includes('not found') ||
            error.message.includes('not_found')
          )) || (errorBody.error?.message && errorBody.error.message.includes('model'));
          
          const isAuthError = error.status === 401 || error.statusCode === 401 || 
                             error.status === 403 || error.statusCode === 403;
          
          // If it's a 404 or not_found_error, try next model
          if (is404Error || isNotFoundError || isModelError) {
            console.log(`[Chat] Model ${model} not available (404/not_found) for anonymous user, trying next...`);
            continue; // Try next model
          }
          
          // For auth errors on first model, try next model (might be API key issue with specific model)
          if (isAuthError && modelsToTry.indexOf(model) === 0) {
            console.log(`[Chat] Authentication error with ${model} for anonymous user, trying next model...`);
            continue;
          }
          
          // For other errors, throw immediately (network errors, rate limits, etc.)
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
        model: model || 'gpt-4.1',
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-4.1',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    // Extract and strip itinerary JSON from response (strip but do NOT save for anonymous)
    const { cleanContent: anonCleanContent, itineraryData: anonItineraryData } = extractItineraryJSON(response.content);
    response.content = anonCleanContent;

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
        canSendMore: session.canSendMessage(),
        hasLiveData: !!(npsFacts || weatherFacts),
        parkName: resolvedMetadata.parkName || null,
        hasItinerary: !!anonItineraryData
      }
    });

  } catch (error) {
    // Log detailed error information
    console.error('Anonymous AI API Error:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      type: error.type,
      code: error.code,
      response: error.response?.data,
      provider: req.body.provider || 'unknown',
      anonymousId: anonymousId || 'unknown'
    });
    
    // Check if it's a model-related error
    if (error.message && (error.message.includes('model') || error.message.includes('not found') || error.message.includes('not_found'))) {
      return res.status(400).json({ 
        error: 'Invalid or unavailable model',
        details: error.message,
        suggestion: 'Try using the /api/ai/test-models endpoint to see available models'
      });
    }
    
    // Check if it's an authentication error
    if (error.status === 401 || error.statusCode === 401 || error.message.includes('authentication') || error.message.includes('Invalid API key')) {
      return res.status(401).json({ 
        error: 'API key authentication failed',
        details: error.message || 'Please check your API key configuration',
        suggestion: 'Verify your API keys are correctly set in environment variables'
      });
    }
    
    // Check if it's a rate limit error
    if (error.status === 429 || error.statusCode === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: error.message,
        suggestion: 'Please wait a moment before trying again'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get AI response',
      details: error.message || 'Unknown error occurred',
      errorType: error.type || 'unknown',
      suggestion: 'Please try again in a moment or switch providers'
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
      name: 'The Local',
      model: 'Claude Sonnet 4.6',
      description: 'Quick insider tips, opinionated picks, casual travel buddy',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'The Planner',
      model: 'GPT-4.1',
      description: 'Detailed itineraries, full logistics, comprehensive plans',
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
      name: 'The Local',
      model: 'Claude Sonnet 4.6',
      description: 'Quick insider tips, opinionated picks, casual travel buddy',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'The Planner',
      model: 'GPT-4.1',
      description: 'Detailed itineraries, full logistics, comprehensive plans',
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
    'claude-sonnet-4-6',           // Claude Sonnet 4.6 (latest)
    'claude-haiku-4-5-20251001',   // Claude Haiku 4.5 (budget)
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