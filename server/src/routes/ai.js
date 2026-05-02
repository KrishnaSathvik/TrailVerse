const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkTokenLimit, trackTokenUsage, getTokenUsage } = require('../middleware/tokenLimits');
const { fetchRelevantFacts, fetchNPSFacts, needsWebSearch, isTravelRelated, extractUserCity, getCandidateParks, formatCandidateParksBlock } = require('../services/factsService');
const { formatFeeFreeBlock } = require('../services/feeFreeDaysService');
const { extractParkFromMessage, extractAllParksFromMessage } = require('../utils/parkExtractor');
const { getAIAnalytics, getLearningInsights } = require('../controllers/aiAnalyticsController');
const AnonymousSession = require('../models/AnonymousSession');
const Favorite = require('../models/Favorite');
const VisitedPark = require('../models/VisitedPark');
const { generateAnonymousIdFromRequest } = require('../utils/anonymousIdGenerator');
const { extractItineraryJSON, validateItineraryFeasibility } = require('../utils/extractItineraryJSON');
const { parseConstraints, preflightCheck, buildConstraintBlock, validateItineraryConstraints, detectHypothetical, detectConflicts, detectIntent } = require('../utils/constraintEngine');
const { correctItinerary, computeConfidence, scoreItinerary } = require('../utils/itineraryCorrector');
const { logAIRequest, extractParksMentioned } = require('../utils/aiLogger');
const crypto = require('crypto');
const claudeService = require('../services/claudeService');
const openaiService = require('../services/openaiService');
const npsService = require('../services/npsService');

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

// Helper: fetch relevant blog posts for park context
async function fetchBlogContext(parkNames) {
  try {
    const BlogPost = require('../models/BlogPost');
    const searchQuery = parkNames.join(' ');
    const posts = await BlogPost.find(
      { status: 'published', $text: { $search: searchQuery } },
      { title: 1, excerpt: 1, slug: 1, score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(3)
      .lean();

    if (!posts.length) return null;

    let block = '\n\n--- TRAILVERSE BLOG KNOWLEDGE ---';
    block += '\nThe following excerpts are from published TrailVerse blog posts. Use this information to enrich your answers.';
    block += '\nDo NOT link to, mention, or reference these blog posts in your response. Users can find them on the site. Just use the knowledge.\n';
    for (const post of posts) {
      block += `\n• "${post.title}" — ${post.excerpt}`;
    }
    return block;
  } catch (err) {
    console.error('[BlogContext] Error fetching blog posts:', err.message);
    return null;
  }
}

// Helper: fetch images for multiple parks with smart distribution (always 4 total)
// 1 park → 4 images, 2 parks → 2 each, 3 parks → 2+1+1, 4+ parks → 1 each
async function fetchMultiParkImages(parks, logPrefix = '[AI]') {
  if (!parks || parks.length === 0) return [];

  // Calculate distribution: always 4 images total
  const total = 4;
  const parkCount = parks.length;
  const distribution = [];

  if (parkCount === 1) {
    distribution.push(total);
  } else if (parkCount === 2) {
    distribution.push(2, 2);
  } else if (parkCount === 3) {
    distribution.push(2, 1, 1);
  } else {
    // 4+ parks: 1 each, max 4 parks
    for (let i = 0; i < Math.min(parkCount, total); i++) {
      distribution.push(1);
    }
  }

  const allImages = [];
  const parksToFetch = parks.slice(0, distribution.length);

  await Promise.all(parksToFetch.map(async (park, idx) => {
    const count = distribution[idx];
    try {
      let images = await npsService.getParkImages(park.parkCode);
      if (!images || images.length === 0) {
        images = await npsService.getParkGalleryPhotos(park.parkCode);
      }
      if (images && images.length > 0) {
        const selected = images.slice(0, count).map(img => ({
          url: img.url,
          altText: img.altText || img.title,
          title: img.title,
          parkCode: park.parkCode,
          parkName: park.parkName
        }));
        allImages.push({ idx, images: selected });
      }
    } catch (err) {
      console.error(`${logPrefix} Image fetch error for ${park.parkCode}:`, err.message);
    }
  }));

  // Sort by original order and flatten
  allImages.sort((a, b) => a.idx - b.idx);
  const result = allImages.flatMap(item => item.images);
  console.log(`${logPrefix} Multi-park images: ${result.length} total for ${parksToFetch.map(p => p.parkCode).join(', ')}`);
  return result;
}

// Helper: auto-route provider based on last user message content
function autoRouteProvider(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const planningPattern = /\b(plan|itinerary|schedule|day.by.day|morning.*afternoon|hour.by.hour|logistics|detailed\s+(trip|plan|itinerary)|build\s+(me\s+)?(a\s+)?(trip|plan|itinerary))\b/i;
  return planningPattern.test(lastUserMsg) ? 'openai' : 'claude';
}

// Helper: parse request body and prepare messages, facts, and system prompt
async function prepareChatContext(body, logPrefix = '[AI]') {
  let {
    messages = [],
    provider = 'auto',
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

  // Auto-route provider if not explicitly set
  if (!provider || provider === 'auto') {
    provider = autoRouteProvider(messages);
    console.log(`${logPrefix} Auto-routed to provider: ${provider}`);
  }

  // Smart context management — trim long conversations with structured summary
  const MAX_CONTEXT_MESSAGES = 20;
  if (messages.length > MAX_CONTEXT_MESSAGES) {
    const systemMsg = messages.find(m => m.role === 'system');
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-15);
    const olderMessages = messages.filter(m => m.role !== 'system').slice(0, -15);

    // Extract key decisions from USER messages only — including assistant
    // messages causes a self-reinforcing hallucination loop where the model's
    // own suggestions (e.g., "for 1 person", "budget $200/day") get extracted
    // as user-stated facts and fed back as grounded context on later turns.
    const olderUserText = olderMessages.filter(m => m.role === 'user').map(m => m.content).join(' ');
    const summaryParts = ['[CONVERSATION CONTEXT — extracted from earlier messages]'];

    // Extract park name
    const parkMatch = olderUserText.match(/(?:going to|visiting|trip to|plan for|heading to|explore)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+National\s+Park)?)/);
    if (parkMatch) summaryParts.push(`Park: ${parkMatch[1]}`);

    // Extract dates
    const dateMatch = olderUserText.match(/(?:from|between|starting|arriving|dates?:?\s*)(\w+ \d{1,2}(?:\s*[-–to]+\s*\w+ \d{1,2})?(?:,?\s*\d{4})?)/i);
    if (dateMatch) summaryParts.push(`Dates: ${dateMatch[1]}`);

    // Extract group size
    const groupMatch = olderUserText.match(/(\d+)\s*(?:people|person|adults?|of us|travelers?|in (?:our|the) group)/i);
    if (groupMatch) summaryParts.push(`Group size: ${groupMatch[1]}`);

    // Extract budget
    const budgetMatch = olderUserText.match(/(?:budget|spend|spending|afford)\s*(?:is|of|around|about)?\s*\$?([\d,]+(?:\s*[-–to]+\s*\$?[\d,]+)?)/i);
    if (budgetMatch) summaryParts.push(`Budget: $${budgetMatch[1]}`);

    // Extract interests/activities
    const interestPatterns = /(hiking|camping|photography|wildlife|stargazing|fishing|kayaking|rock climbing|backpacking|scenic drives?|waterfalls?|sunrise|sunset|family.friendly|kid.friendly|accessible|easy trails?|moderate|challenging|strenuous)/gi;
    const interests = [...new Set((olderUserText.match(interestPatterns) || []).map(i => i.toLowerCase()))];
    if (interests.length > 0) summaryParts.push(`Interests: ${interests.slice(0, 8).join(', ')}`);

    // Extract fitness/difficulty preference
    const fitnessMatch = olderUserText.match(/(?:fitness|difficulty|experience|skill)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|advanced|experienced|hard|strenuous)/i);
    if (fitnessMatch) summaryParts.push(`Fitness level: ${fitnessMatch[1]}`);

    // Extract accommodation preference
    const accomMatch = olderUserText.match(/(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb)/i);
    if (accomMatch) summaryParts.push(`Accommodation: ${accomMatch[1]}`);

    // Capture what was suggested and accepted/rejected
    const aiMessages = olderMessages.filter(m => m.role === 'assistant').map(m => m.content);
    const userMessages = olderMessages.filter(m => m.role === 'user').map(m => m.content);
    const rejections = userMessages.filter(m => /(skip|don't|no|remove|instead|change|replace|not interested|too)/i.test(m));
    if (rejections.length > 0) {
      summaryParts.push(`User adjustments: ${rejections.slice(-3).map(r => r.substring(0, 80)).join('; ')}`);
    }

    summaryParts.push(`[${olderMessages.length} earlier messages summarized above — ${recentMessages.length} recent messages follow]`);

    messages = [
      ...(systemMsg ? [systemMsg] : []),
      { role: 'system', content: summaryParts.join('\n') },
      ...recentMessages
    ];
  }

  // Filter out system messages from the messages array (Claude API doesn't allow them)
  const filteredMessages = messages.filter(m => m.role !== 'system');

  // Extract the last user message for fact fetching
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Auto-extract ALL parks from user message
  let resolvedMetadata = { ...metadata };
  let allExtractedParks = [];

  if (!resolvedMetadata.parkCode && lastUserMessage) {
    allExtractedParks = extractAllParksFromMessage(lastUserMessage);
    if (allExtractedParks.length > 0) {
      // Use first park for primary metadata (weather coordinates, etc.)
      resolvedMetadata.parkCode = allExtractedParks[0].parkCode;
      resolvedMetadata.parkName = resolvedMetadata.parkName || allExtractedParks[0].parkName;
      resolvedMetadata.lat = resolvedMetadata.lat || allExtractedParks[0].lat;
      resolvedMetadata.lon = resolvedMetadata.lon || allExtractedParks[0].lon;
      console.log(`${logPrefix} Parks extracted from message: ${allExtractedParks.map(p => `${p.parkName} (${p.parkCode})`).join(', ')}`);
    }
  } else if (resolvedMetadata.parkCode) {
    // Single park from metadata
    allExtractedParks = [{ parkCode: resolvedMetadata.parkCode, parkName: resolvedMetadata.parkName || '', lat: resolvedMetadata.lat, lon: resolvedMetadata.lon }];
  }

  // Store all park names for frontend display
  const parkNames = allExtractedParks.map(p => p.parkName).filter(Boolean);

  // Fetch relevant facts based on user message and resolved metadata
  let weatherFacts = null;
  let npsFacts = null;
  let webSearchFacts = null;
  let feeFreeFacts = null;

  try {
    // Fetch weather + web search using primary park
    const factsResult = await fetchRelevantFacts({
      userMessage: lastUserMessage,
      parkCode: resolvedMetadata.parkCode,
      lat: resolvedMetadata.lat,
      lon: resolvedMetadata.lon,
      parkName: resolvedMetadata.parkName
    });
    weatherFacts = factsResult.weatherFacts;
    webSearchFacts = factsResult.webSearchFacts;
    feeFreeFacts = factsResult.feeFreeFacts;

    // Fetch NPS facts for ALL mentioned parks in parallel
    if (allExtractedParks.length > 1) {
      const allNpsResults = await Promise.all(
        allExtractedParks.map(p => fetchNPSFacts({ parkCode: p.parkCode }).catch(() => null))
      );
      const labeledFacts = allExtractedParks
        .map((p, i) => allNpsResults[i] ? `[${p.parkName}]\n${allNpsResults[i]}` : null)
        .filter(Boolean);
      npsFacts = labeledFacts.join('\n\n');
    } else {
      npsFacts = factsResult.npsFacts;
    }

    console.log(`${logPrefix} Facts fetched:`, { hasWeather: !!weatherFacts, hasNPS: !!npsFacts, hasWebSearch: !!webSearchFacts, hasFeeFree: !!feeFreeFacts, parks: parkNames });
  } catch (factsError) {
    console.error(`${logPrefix} Facts fetching error:`, factsError.message);
  }

  // Fetch park images (only once per chat, distributed across all mentioned parks)
  // The frontend appends "(Photos shown to user: ...)" to assistant messages,
  // so we can check conversation history to avoid sending images again.
  let parkImages = [];
  const alreadyShownImages = messages.some(m =>
    m.role === 'assistant' && m.content?.includes('(Photos shown to user:')
  );
  if (allExtractedParks.length > 0 && !alreadyShownImages) {
    parkImages = await fetchMultiParkImages(allExtractedParks, logPrefix);
  } else if (alreadyShownImages) {
    console.log(`${logPrefix} Skipping park images — already shown in this conversation`);
  }

  // Logging-related variables hoisted for return
  let userCity = null;
  let candidateParksBlock = false;

  // Build enhanced system prompt with facts
  // Use the full persona prompt from the appropriate service when no custom prompt is provided
  const defaultPrompt = provider === 'openai'
    ? openaiService.systemPrompt
    : claudeService.defaultSystemPrompt;
  let enhancedSystemPrompt = systemPrompt || defaultPrompt;

  // Fee-free block hoisted to top of assembled prompt — models attend most to
  // the start and end of long prompts (lost-in-the-middle effect). Placing this
  // before live data / candidate parks ensures it doesn't get buried.
  if (feeFreeFacts) {
    enhancedSystemPrompt += formatFeeFreeBlock(feeFreeFacts);
  }

  if (npsFacts || weatherFacts || webSearchFacts) {
    const parkLabel = parkNames.length > 1 ? parkNames.join(', ') : (resolvedMetadata.parkName || 'this park');
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Build data availability manifest so the model knows what's present and what's missing
    const available = [];
    const missing = [];
    if (npsFacts) available.push('NPS alerts/closures/permits/campgrounds'); else if (resolvedMetadata.parkCode) missing.push('NPS park data (API unavailable)');
    if (weatherFacts) available.push('weather forecast'); else if (resolvedMetadata.lat) missing.push('weather forecast');
    if (webSearchFacts) available.push('live web search'); else missing.push('web search');

    enhancedSystemPrompt += `\n\n--- LIVE TRAILVERSE DATA: ${parkLabel.toUpperCase()} ---`;
    enhancedSystemPrompt += `\nThis is AUTHORITATIVE real-time data as of ${today}. This OVERRIDES your training data where they conflict.`;
    enhancedSystemPrompt += `\nDATA AVAILABLE: ${available.join(', ')}`;
    if (missing.length > 0) {
      enhancedSystemPrompt += `\nDATA MISSING: ${missing.join(', ')} — for missing categories, qualify your knowledge as "typically" or "generally" and direct users to nps.gov.`;
    }
    enhancedSystemPrompt += `\nYou MUST use this data as your primary source. Weave live facts naturally into your answer — don't use robotic prefixes like "📍 Current NPS data shows...". Just state the fact directly (e.g., "The Narrows is closed right now due to cyanobacteria" or "No timed entry required this year"). Users trust you; you don't need to label your source every time.`;
    enhancedSystemPrompt += `\nDo NOT invent closures, permits, or conditions not listed here. If something is NOT in this data, say "check nps.gov for the latest."\n\n`;

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
  } else if (resolvedMetadata.parkCode) {
    // Park was detected but ALL data failed — warn the model so it doesn't silently hallucinate
    const parkLabel = resolvedMetadata.parkName || resolvedMetadata.parkCode;
    enhancedSystemPrompt += `\n\n--- DATA NOTICE ---`;
    enhancedSystemPrompt += `\nLive data for ${parkLabel} is COMPLETELY UNAVAILABLE right now (APIs may be down).`;
    enhancedSystemPrompt += `\nDATA AVAILABLE: none`;
    enhancedSystemPrompt += `\nDATA MISSING: NPS alerts/closures/permits, weather forecast, web search`;
    enhancedSystemPrompt += `\nYou MUST tell the user: "I don't have real-time data for ${parkLabel} right now — my suggestions are based on general knowledge. Verify current conditions, closures, and permits at nps.gov before your trip."`;
    enhancedSystemPrompt += `\nDo NOT present training-data knowledge as current facts. Qualify everything as "typically" or "generally."`;
    enhancedSystemPrompt += `\n--- END NOTICE ---\n`;
  } else if (!resolvedMetadata.parkCode) {
    // No park detected at all — no live data available
    enhancedSystemPrompt += `\n\n--- NO PARK DETECTED ---`;
    enhancedSystemPrompt += `\nNo specific park was identified in the user's message, so you have NO live data.`;
    enhancedSystemPrompt += `\nDo NOT generate a detailed itinerary for a vague request. NEVER output an [ITINERARY_JSON] block without a specific park. Instead:`;
    enhancedSystemPrompt += `\n- If the user's question is answerable without park-specific data (e.g., "what parks have the best stargazing?"), answer it using your training knowledge and the crowd calendar data.`;
    enhancedSystemPrompt += `\n- If the user needs a trip plan, ask which park they're considering — or suggest 2-3 specific parks based on what they described.`;
    enhancedSystemPrompt += `\n- Qualify all answers as general knowledge: "Generally..." / "Most years..."`;
    enhancedSystemPrompt += `\n--- END NOTICE ---\n`;

    // Inject candidate parks list so the model has real NPS data to recommend from
    try {
      userCity = extractUserCity(lastUserMessage);
      const candidateResult = await getCandidateParks(userCity);
      const candidateBlock = formatCandidateParksBlock(candidateResult);
      candidateParksBlock = !!candidateBlock;
      if (candidateBlock) {
        enhancedSystemPrompt += candidateBlock;
        console.log(`${logPrefix} Candidate parks injected:`, { userCity: userCity?.name || 'none', tiered: !!candidateResult.userCity });
      }
    } catch (candidateErr) {
      console.error(`${logPrefix} Candidate parks error:`, candidateErr.message);
    }
  }

  // Inject relevant blog posts when a park is detected
  if (allExtractedParks.length > 0) {
    const parkNamesForBlog = allExtractedParks.map(p => p.parkName).filter(Boolean);
    const blogContext = await fetchBlogContext(parkNamesForBlog);
    if (blogContext) {
      enhancedSystemPrompt += blogContext;
      console.log(`${logPrefix} Blog context found for: ${parkNamesForBlog.join(', ')}`);
    }
  }

  // Track whether a park was detected for downstream itinerary gating
  const noParkDetected = !resolvedMetadata.parkCode;

  const augmentedMessages = filteredMessages;

  console.log(`${logPrefix} Augmented messages:`, {
    hasSystemFacts: !!(npsFacts || weatherFacts || webSearchFacts),
    totalMessageCount: augmentedMessages.length,
    provider,
    parks: parkNames
  });

  // ── Constraint Engine: parse, preflight, inject ──
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const constraints = parseConstraints(metadata, lastMsg);
  const preflightResult = preflightCheck(constraints, resolvedMetadata.parkCode);
  const hypothetical = detectHypothetical(lastMsg);

  // Inject constraint block into system prompt
  if (constraints.hasConstraints) {
    const constraintBlock = buildConstraintBlock(constraints);
    enhancedSystemPrompt += constraintBlock;
    console.log(`${logPrefix} Constraints injected:`, { fitnessLevel: constraints.fitnessLevel, numDays: constraints.dates?.numDays, hasChildren: constraints.hasChildren, accommodation: constraints.accommodation });
  }

  // Inject preflight warnings into system prompt
  if (preflightResult.warnings.length > 0) {
    enhancedSystemPrompt += `\n\n--- PRE-FLIGHT WARNINGS ---\n${preflightResult.warnings.map(w => `- ${w}`).join('\n')}\nAddress these proactively in your response.\n--- END WARNINGS ---\n`;
    console.log(`${logPrefix} Preflight warnings:`, preflightResult.warnings);
  }

  // Detect and inject conflicts
  const conflicts = detectConflicts(constraints, lastMsg);
  if (conflicts.length > 0) {
    enhancedSystemPrompt += `\n\n--- CONSTRAINT CONFLICTS DETECTED ---\nThe user's request contains CONTRADICTORY constraints. You MUST address each conflict — do NOT silently merge them into a generic plan.\n`;
    for (const conflict of conflicts) {
      enhancedSystemPrompt += `\nCONFLICT: ${conflict.constraintA} vs. ${conflict.constraintB}\n${conflict.prompt}\n`;
    }
    enhancedSystemPrompt += `\n--- END CONFLICTS ---\n`;
    console.log(`${logPrefix} Conflicts detected:`, conflicts.map(c => c.type));
  }

  // Detect and inject user intent
  const intent = detectIntent(lastMsg, constraints);
  if (intent.adaptations) {
    enhancedSystemPrompt += `\n\n--- USER INTENT DETECTED ---\n${intent.adaptations}\n--- END USER INTENT ---\n`;
    console.log(`${logPrefix} Intent detected:`, { primary: intent.primaryIntent, intents: intent.intents.map(i => `${i.type}(${i.confidence.toFixed(2)})`) });
  }

  // Inject hypothetical/scenario mode
  if (hypothetical.isHypothetical) {
    enhancedSystemPrompt += `\n\n--- SCENARIO MODE ACTIVE ---
The user is asking a hypothetical/what-if question ("${hypothetical.scenarioDescription}").

CRITICAL ISOLATION RULES — follow these exactly:
1. The user's scenario assumptions OVERRIDE all real-world data above. If the scenario says "canyon is closed", it IS closed for this plan — even if live NPS data says otherwise.
2. Do NOT include any live data citations in your scenario plan. The live data block above is REFERENCE ONLY — do not surface it to the user.
3. Structure your response as a SINGLE scenario plan under the user's assumed conditions. Do NOT show a "real conditions" section followed by a "scenario" section — that causes confusion. Just plan for the scenario.
4. If the scenario makes certain permits/reservations irrelevant (e.g., area is closed), do NOT mention them.
5. You may briefly note at the END: "Note: This plan assumes [scenario condition]. Check nps.gov for current real-world conditions." — ONE sentence, nothing more.
6. Do NOT pad with unrelated real-world details, closure lists, or weather data that contradicts the scenario.
--- END SCENARIO MODE ---\n`;
    console.log(`${logPrefix} Hypothetical detected:`, hypothetical.scenarioDescription);
  }

  // Final reinforcement: if this looks like a planning request, remind the AI to include JSON
  const planningPatterns = /\b(plan|itinerary|schedule|trip|day-by-day|multi-day|\d+[\s-]day)\b/i;
  if (planningPatterns.test(lastMsg)) {
    enhancedSystemPrompt += `\n\n--- CRITICAL REMINDER ---\nThis is a planning request. You MUST include the [ITINERARY_JSON] block at the end of your response with the structured itinerary data. Even if there are conflicts or warnings, include your recommended safe plan in the JSON block. Do NOT skip the JSON block for planning requests.\n--- END REMINDER ---\n`;
  }

  // Bookend: repeat fee-free reminder at the end of the prompt (models attend
  // most to the start and end — the full block is at the top, this short nudge
  // ensures it isn't lost in the middle of long prompts)
  if (feeFreeFacts && feeFreeFacts.hasOverlap) {
    const dayNames = feeFreeFacts.days.map(d => d.label).join(', ');
    enhancedSystemPrompt += `\n\n⚠️ REMINDER: The user's trip overlaps fee-free entrance day(s): ${dayNames}. You MUST mention this in your first paragraph.\n`;
  }

  // Prevent AI from leaking internal JSON mechanism to the user
  enhancedSystemPrompt += `\n\n--- OUTPUT RULES ---\nThe [ITINERARY_JSON] block is an internal data format automatically extracted from your response. NEVER mention JSON, code blocks, data formats, or offer to "regenerate the JSON" or "output the updated JSON" in your user-facing text. Speak naturally about the itinerary as a travel plan. If the user has an existing itinerary and asks for modifications, describe the specific changes in plain language — do not regenerate the entire plan unless they explicitly ask for a full replan.\n--- END OUTPUT RULES ---\n`;

  return { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, metadata, npsFacts, weatherFacts, webSearchFacts, feeFreeFacts, userCity, candidateParksBlock, resolvedMetadata, parkNames, noParkDetected, constraints, preflightResult, hypothetical, conflicts, intent, parkImages, alreadyShownImages, lastMsg };
}

// Helper: build user context block for personalized AI responses
// Uses explicit Known/Unknown framing to prevent the model from
// hallucinating ungrounded user attributes (e.g., "solo traveler").
async function buildUserContext(user) {
  if (!user || !user.id) return '';

  try {
    const firstName = user.firstName || (user.name ? user.name.split(' ')[0] : null);
    if (!firstName) return '';

    const [favorites, visitedParks] = await Promise.all([
      Favorite.find({ user: user.id }).sort({ createdAt: -1 }).limit(10).select('parkName visitStatus rating').lean(),
      VisitedPark.find({ user: user.id }).sort({ visitDate: -1 }).limit(10).select('parkName visitDate rating').lean()
    ]);

    const parts = [`\n\n--- USER CONTEXT ---`];
    parts.push(`Known facts about this user (from their profile and confirmed history):`);
    parts.push(`- Name: ${firstName}`);

    if (favorites.length > 0) {
      const favNames = favorites.map(f => f.parkName);
      parts.push(`- Favorite parks: ${favNames.join(', ')}`);
    }

    if (visitedParks.length > 0) {
      const visitedEntries = visitedParks.map(v => {
        if (v.visitDate) {
          const date = new Date(v.visitDate);
          const month = date.toLocaleString('en-US', { month: 'short' });
          const year = date.getFullYear();
          return `${v.parkName} (${month} ${year})`;
        }
        return v.parkName;
      });
      parts.push(`- Visited parks: ${visitedEntries.join(', ')}`);
    }

    parts.push(``);
    parts.push(`Unknown (DO NOT ASSUME OR INFER):`);
    parts.push(`- Group size and composition (solo, couple, family, group)`);
    parts.push(`- Travel style or pace preference`);
    parts.push(`- Budget`);
    parts.push(`- Fitness level`);
    parts.push(`- Home location`);
    parts.push(``);
    parts.push(`If your recommendation depends on an unknown attribute, ask one clarifying question instead of assuming.`);
    parts.push(`NEVER say "your profile says...", "based on your travel style...", or "as a solo traveler..." for any unknown attribute.`);
    parts.push(`Only reference Known facts listed above.`);
    parts.push(`Address the user by their first name in your first response.`);
    parts.push(`--- END USER CONTEXT ---`);

    return parts.join('\n');
  } catch (err) {
    console.error('[AI] Error building user context:', err.message);
    return '';
  }
}

// Helper: fuzzy-match an alert line against the AI response
function alertMentioned(alertText, responseLower) {
  const keywords = alertText.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !['the', 'and', 'for', 'are', 'has', 'been', 'this', 'that', 'with', 'from', 'may', 'can', 'will', 'not'].includes(w));
  const matchThreshold = Math.min(2, keywords.length);
  const matchCount = keywords.filter(kw => responseLower.includes(kw)).length;
  return matchCount >= matchThreshold;
}

// Helper: extract lines from a labeled NPS section
function extractNPSSection(npsFacts, sectionPattern) {
  const match = npsFacts.match(sectionPattern);
  if (!match) return [];
  return match[1].split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
}

// Helper: post-response validation — checks if AI addressed critical NPS constraints
function validateCriticalAlerts(responseContent, npsFacts) {
  if (!npsFacts || !responseContent) return null;

  const responseLower = responseContent.toLowerCase();
  const warnings = [];

  // 1. Active closures
  const closures = extractNPSSection(npsFacts, /⚠️ ACTIVE CLOSURES:\n([\s\S]*?)(?:\n\n|$)/);
  const missedClosures = closures.filter(c => !alertMentioned(c, responseLower));
  if (missedClosures.length > 0) {
    warnings.push({ label: 'Active closures', items: missedClosures });
  }

  // 2. Cautions (hazards, flash floods, wildlife warnings)
  const cautions = extractNPSSection(npsFacts, /Cautions:\n([\s\S]*?)(?:\n\n|$)/);
  const missedCautions = cautions.filter(c => !alertMentioned(c, responseLower));
  if (missedCautions.length > 0) {
    warnings.push({ label: 'Safety cautions', items: missedCautions });
  }

  // 3. Permits & reservations — check each permit by name, not just generic mention
  const permitMatch = npsFacts.match(/Permits & Reservations Required[^:]*:\n([\s\S]*?)(?:\n\n|$)/);
  if (permitMatch) {
    const permitLines = permitMatch[1].split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
    // Extract permit names (text before the type bracket or URL)
    const permits = permitLines.map(line => {
      const nameMatch = line.match(/^([^[\]:]+?)(?:\s*\[|\s*:)/);
      return nameMatch ? nameMatch[1].trim() : line.split(':')[0].trim();
    }).filter(Boolean);

    const missedPermits = permits.filter(name => !alertMentioned(name, responseLower));
    if (missedPermits.length > 0) {
      // Format with original lines for context (URLs, types)
      const missedWithContext = missedPermits.map(name => {
        const original = permitLines.find(l => l.toLowerCase().includes(name.toLowerCase()));
        return original || name;
      });
      warnings.push({ label: 'Permits/reservations required (not addressed by name)', items: missedWithContext });
    } else if (permits.length > 0) {
      // Permits were mentioned, but check for vague/generic references
      const hasSpecificPermit = permits.some(name => {
        const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        return nameWords.some(w => responseLower.includes(w));
      });
      const onlyGeneric = !hasSpecificPermit && /permit|reservation/i.test(responseContent);
      if (onlyGeneric) {
        warnings.push({ label: 'Permits mentioned generically (specify which permits)', items: permitLines.slice(0, 3) });
      }
    }
  }

  if (warnings.length === 0) return null;

  // Build warning block
  let result = '\n\n---\n📍 **Important — the following were not addressed above:**';
  for (const w of warnings) {
    result += `\n**${w.label}:**`;
    result += w.items.map(item => `\n- ${item}`).join('');
  }
  result += '\n\n_Verify at [nps.gov](https://www.nps.gov) before your trip._';
  return result;
}

// Chat endpoint — no token limit for logged-in users, trackTokenUsage kept for analytics
router.post('/chat', protect, trackTokenUsage, async (req, res) => {
  const requestStartTime = Date.now();
  try {
    console.log('[AI] Chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    let { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, npsFacts, weatherFacts, webSearchFacts, feeFreeFacts, userCity, candidateParksBlock, resolvedMetadata, noParkDetected, constraints, preflightResult, hypothetical, conflicts, intent, parkImages, alreadyShownImages, lastMsg } = await prepareChatContext(req.body);

    // Pre-flight BLOCKER — stop before calling AI
    if (preflightResult.blockers.length > 0) {
      const blockerMsg = preflightResult.blockers.map(b => `- ${b}`).join('\n');
      return res.json({ data: { content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`, provider: 'system' } });
    }

    // Inject user context for personalized responses
    const userContext = await buildUserContext(req.user);
    if (userContext) {
      enhancedSystemPrompt += userContext;
    }

    let response;

    // Fallback: resolve 'auto' or unknown providers to claude
    if (provider !== 'claude' && provider !== 'openai') {
      provider = anthropic ? 'claude' : 'openai';
    }

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
        model: model || 'gpt-5.4-mini',
        messages: [{ role: 'system', content: enhancedSystemPrompt }, ...openaiMessages],
        max_completion_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    // ── Conflict compliance guard: if conflicts detected, verify AI presented options ──
    const hasConflicts = conflicts.length > 0;
    if (hasConflicts && !req._hasConflictRetried) {
      const hasOptions = /\*\*\s*option\s*[ab12]/i.test(response.content) || /\boption\s*[ab12]\s*[:\-—]/i.test(response.content);
      if (!hasOptions) {
        req._hasConflictRetried = true;
        console.log('[AI] Conflict compliance failed — AI merged instead of presenting options. Regenerating.');
        const conflictRetryPrompt = enhancedSystemPrompt + `\n\n--- CONFLICT COMPLIANCE FAILURE ---\nYour previous response MERGED contradictory constraints into a single plan. This is WRONG.\nYou MUST present EXACTLY TWO clearly labeled options: **Option A** and **Option B**.\nDo NOT blend them. Present them as separate, complete plans.\n--- END FAILURE NOTICE ---`;

        try {
          let retryContent;
          if (provider === 'claude' && anthropic) {
            const retryResult = await anthropic.messages.create({
              model: model || 'claude-sonnet-4-6', max_tokens: maxTokens, temperature: temperature,
              system: conflictRetryPrompt, messages: augmentedMessages,
            });
            retryContent = retryResult.content[0].text;
          } else if (provider === 'openai' && openai) {
            const openaiMsgs = augmentedMessages.map(m => ({ role: m.role, content: m.content }));
            const retryResult = await openai.chat.completions.create({
              model: model || 'gpt-5.4-mini', messages: [{ role: 'system', content: conflictRetryPrompt }, ...openaiMsgs],
              max_completion_tokens: maxTokens, temperature: temperature,
            });
            retryContent = retryResult.choices[0].message.content;
          }
          if (retryContent && /\*\*\s*option\s*[ab12]/i.test(retryContent)) {
            response.content = retryContent;
            console.log('[AI] Conflict retry succeeded — options presented');
          }
        } catch (retryErr) {
          console.error('[AI] Conflict retry failed:', retryErr.message);
        }
      }
    }

    // Extract and strip itinerary JSON from response
    let { cleanContent, itineraryData } = extractItineraryJSON(response.content);

    // Fallback: if this looks like a planning response but no JSON block, extract it
    if (!itineraryData && /\b(plan|itinerary|trip)\b/i.test(lastMsg) && /day\s*[1-9]|day\s*one|day\s*two|morning.*afternoon|## .*day\b/i.test(cleanContent)) {
      try {
        console.log('[AI] Planning response missing JSON block — running fallback extraction');
        const extractionPrompt = `Extract the structured itinerary from this trip plan text. Return ONLY a valid JSON object (no markdown, no explanation) in this format:
{"days":[{"id":"day-1","dayNumber":1,"label":"Day 1 — label","stops":[{"id":"s1-1","order":0,"type":"trail|landmark|campground|visitor_center|restaurant|lodging|custom","name":"Stop Name","note":"brief note","startTime":"08:00","duration":60,"latitude":0.0,"longitude":0.0,"difficulty":"easy|moderate|strenuous","why":"why this stop fits","drivingTimeFromPreviousMin":0}]}]}

Include latitude/longitude (estimate if needed), duration in minutes, and difficulty for trails. Here is the plan text:

${cleanContent.substring(0, 6000)}`;

        const claudeService = require('../services/claudeService');
        const extractedJSON = await claudeService.chat([{ role: 'user', content: extractionPrompt }], 'You are a JSON extraction tool. Return only valid JSON, no markdown or explanation.');
        // Try to parse — the response should be pure JSON
        const jsonMatch = extractedJSON.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
            itineraryData = parsed;
            console.log(`[AI] Fallback extraction successful: ${parsed.days.length} days, ${parsed.days.reduce((s, d) => s + (d.stops?.length || 0), 0)} stops`);
          }
        }
      } catch (extractErr) {
        console.log('[AI] Fallback extraction failed:', extractErr.message);
        // Non-fatal — continue without itinerary. Track for monitoring.
      }
    }

    // Hard gate: strip itinerary if no park was detected (model shouldn't have generated one)
    if (noParkDetected && itineraryData) {
      console.log('[AI] Itinerary stripped — no park was detected in the request');
      itineraryData = null;
      cleanContent += '\n\n---\n📍 **To get a detailed itinerary, please specify which national park you\'re planning to visit.** I can then pull live NPS data and build a day-by-day plan.';
    }

    // ── Post-response: Validate + Correct + Loop + Confidence ──
    // Skip correction when response presents dual options (conflict mode) — only correct if single plan
    const isConflictResponse = hasConflicts && /\*\*\s*option\s*[ab12]/i.test(cleanContent);

    const alertWarning = validateCriticalAlerts(cleanContent, npsFacts);
    let constraintIssues = (itineraryData && !isConflictResponse) ? validateItineraryConstraints(itineraryData, constraints) : [];
    let feasibilityIssues = itineraryData ? validateItineraryFeasibility(itineraryData) : [];

    let correctionSummary = '';
    let confidence = { level: 'high', score: 1.0 };
    let needsRegeneration = false;
    let allGaps = [];

    if (itineraryData && constraintIssues.length > 0) {
      let currentItinerary = itineraryData;
      let allCorrections = [];
      let totalRemoved = 0;
      const originalCount = itineraryData.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

      for (let pass = 1; pass <= 2; pass++) {
        const issues = pass === 1
          ? constraintIssues
          : validateItineraryConstraints(currentItinerary, constraints);

        if (issues.length === 0) break;

        const result = correctItinerary(currentItinerary, constraints, issues, npsFacts, {
          isHypothetical: hypothetical?.isHypothetical || false,
          pass
        });

        currentItinerary = result.correctedItinerary;
        allCorrections.push(...result.corrections);
        totalRemoved += result.removedCount;
        if (result.gaps) allGaps.push(...result.gaps);

        if (result.tooAggressive && pass === 1) {
          needsRegeneration = true;
          break;
        }
      }

      itineraryData = currentItinerary;
      confidence = computeConfidence(allCorrections, totalRemoved, originalCount);

      if (allCorrections.length > 0) {
        correctionSummary = `\n\n---\n📍 **Adjusted to fit your constraints:**\n${allCorrections.map(c => `- ${c}`).join('\n')}`;
        console.log('[AI] Corrections applied:', allCorrections);
      }

      // Post-correction feasibility re-check
      const postIssues = validateItineraryFeasibility(currentItinerary);
      if (postIssues.length > 0) {
        correctionSummary += `\n\n⏱️ **After adjustment:**\n${postIssues.map(w => `- ${w}`).join('\n')}`;
      }
    }

    // REGENERATION FALLBACK — when correction was too aggressive (non-streaming only)
    if (needsRegeneration && !req._hasRegenerated) {
      req._hasRegenerated = true;
      const constraintFailures = constraintIssues.map(i => i.details).join('; ');
      let regenPrompt = enhancedSystemPrompt + `\n\n--- REGENERATION NOTICE ---\nYour previous plan violated these constraints: ${constraintFailures}\nThis is your SECOND attempt. Follow the USER CONSTRAINTS block EXACTLY. Do not include stops that violate fitness level, day count, or accommodation preferences.\n`;
      // Include specific gap replacements needed
      if (allGaps.length > 0) {
        regenPrompt += `\nSPECIFIC REPLACEMENTS NEEDED:\n`;
        for (const gap of allGaps) {
          regenPrompt += `- Day ${gap.dayIndex + 1}: "${gap.removedName}" removed (${gap.reason}). Replace with a constraint-compliant activity${gap.nearLat ? ` near [${gap.nearLat}, ${gap.nearLon}]` : ''}.\n`;
        }
      }
      regenPrompt += `--- END NOTICE ---`;

      try {
        console.log('[AI] Regenerating — correction was too aggressive');
        let regenResponse;
        if (provider === 'claude' && anthropic) {
          const regenResult = await anthropic.messages.create({
            model: model || 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            temperature: temperature,
            system: regenPrompt,
            messages: augmentedMessages,
          });
          regenResponse = regenResult.content[0].text;
        } else if (provider === 'openai' && openai) {
          const openaiMessages = augmentedMessages.map(m => ({ role: m.role, content: m.content }));
          const regenResult = await openai.chat.completions.create({
            model: model || 'gpt-5.4-mini',
            messages: [{ role: 'system', content: regenPrompt }, ...openaiMessages],
            max_completion_tokens: maxTokens,
            temperature: temperature,
          });
          regenResponse = regenResult.choices[0].message.content;
        }

        if (regenResponse) {
          const regen = extractItineraryJSON(regenResponse);
          if (regen.itineraryData) {
            const regenIssues = validateItineraryConstraints(regen.itineraryData, constraints);
            if (regenIssues.length < constraintIssues.length) {
              // Regeneration was cleaner — use it
              cleanContent = regen.cleanContent;
              itineraryData = regen.itineraryData;
              correctionSummary = '';
              confidence = { level: 'medium', score: 0.7 };
              constraintIssues = regenIssues;
              feasibilityIssues = validateItineraryFeasibility(itineraryData);
              console.log('[AI] Regeneration succeeded — cleaner plan');
            }
          }
        }
      } catch (regenErr) {
        console.error('[AI] Regeneration failed:', regenErr.message);
        // Fall through with corrected plan + low confidence
      }
    }

    // Append warnings + corrections
    if (alertWarning) cleanContent += alertWarning;
    if (correctionSummary) {
      cleanContent += correctionSummary;
    } else if (feasibilityIssues.length > 0) {
      cleanContent += `\n\n---\n⏱️ **Schedule feasibility notice:**\n${feasibilityIssues.map(w => `- ${w}`).join('\n')}\n_Consider adjusting your itinerary for a more realistic pace._`;
    }

    // Confidence indicator
    if (confidence.level !== 'high') {
      cleanContent += `\n\n${confidence.level === 'low' ? '⚠️' : 'ℹ️'} **Plan confidence: ${confidence.level}** — ${confidence.level === 'low' ? 'This plan needed significant changes. Consider adjusting your preferences or ask me to regenerate.' : 'Minor adjustments were made to match your constraints.'}`;
    }

    response.content = cleanContent;
    response.hasItinerary = !!itineraryData;
    response.itineraryData = itineraryData || null;

    // Score the itinerary
    let planScore = null;
    if (itineraryData) planScore = scoreItinerary(itineraryData, constraints);

    // Save CORRECTED itinerary to DB
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
          console.log(`[AI] Corrected itinerary saved to TripPlan ${tripId}`);
        } catch (saveErr) {
          console.error('[AI] Failed to save itinerary:', saveErr.message);
        }
      }
    }

    // Post-fetch: if no images were pre-fetched and none shown before, extract parks from AI response
    if (parkImages.length === 0 && !alreadyShownImages && response.content) {
      const responseParks = extractAllParksFromMessage(response.content);
      if (responseParks.length > 0) {
        parkImages = await fetchMultiParkImages(responseParks, '[AI Post]');
      }
    }

    // Structured logging — fire and forget
    const requestEndTime = Date.now();
    const parksMentioned = await extractParksMentioned(response.content || '');
    logAIRequest({
      endpoint: 'chat',
      userId: req.user?.id || null,
      provider: response.provider,
      model: response.model,
      durationMs: requestEndTime - requestStartTime,
      promptHash: crypto.createHash('sha256').update(enhancedSystemPrompt).digest('hex').slice(0, 12),
      blocks: {
        npsFacts: !!npsFacts,
        weatherFacts: !!weatherFacts,
        webSearch: !!webSearchFacts,
        feeFree: !!(feeFreeFacts && feeFreeFacts.hasOverlap),
        candidateParks: !!candidateParksBlock,
        constraints: constraints.hasConstraints,
        preflight: { blockers: preflightResult.blockers.length, warnings: preflightResult.warnings.length },
        conflicts: conflicts.length,
        hypothetical: hypothetical.isHypothetical,
        intent: intent?.primaryIntent || null,
        userContext: !!req.user,
      },
      park: resolvedMetadata.parkCode ? { code: resolvedMetadata.parkCode, name: resolvedMetadata.parkName } : null,
      cityDetected: userCity?.name || null,
      messageCount: augmentedMessages.length,
      promptTokenEstimate: Math.round(enhancedSystemPrompt.length / 4),
      tokens: response.usage || null,
      response: {
        length: response.content?.length || 0,
        hasItinerary: !!itineraryData,
        mentionsFeeFree: /fee.free|free\s+entrance/i.test(response.content || ''),
        parksMentioned,
      },
      error: null,
    });

    res.json({ data: { ...response, hasLiveData: !!(npsFacts || weatherFacts), parkName: resolvedMetadata.parkName || null, confidence, planScore, intent: intent?.primaryIntent || null, parkImages: parkImages || [] } });

  } catch (error) {
    // Structured error logging
    logAIRequest({
      endpoint: 'chat',
      userId: req.user?.id || null,
      provider: req.body.provider || 'unknown',
      model: req.body.model || null,
      durationMs: Date.now() - requestStartTime,
      error: error.message,
    });

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

    let { provider, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, npsFacts, weatherFacts, webSearchFacts, resolvedMetadata, parkNames, noParkDetected, constraints, preflightResult, hypothetical, intent, parkImages, alreadyShownImages, lastMsg } = await prepareChatContext(req.body, '[AI Stream]');

    // Pre-flight BLOCKER — stop before SSE
    if (preflightResult.blockers.length > 0) {
      const blockerMsg = preflightResult.blockers.map(b => `- ${b}`).join('\n');
      return res.json({ data: { content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`, provider: 'system' } });
    }

    // Inject user context for personalized responses
    const userContext = await buildUserContext(req.user);
    if (userContext) {
      enhancedSystemPrompt += userContext;
    }

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
    res.write(`data: ${JSON.stringify({ type: 'thinking', sources: dataSources, parkName: resolvedMetadata.parkName || null, parkNames: parkNames || [] })}\n\n`);

    // Fallback: resolve 'auto' or unknown providers to claude
    if (provider !== 'claude' && provider !== 'openai') {
      provider = anthropic ? 'claude' : 'openai';
    }

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
        let doneEventSent = false;
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullContent += chunk.delta.text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.delta.text })}\n\n`);
          }
          if (chunk.type === 'message_stop') {
            console.log('[AI Stream] message_stop received, fullContent length:', fullContent.length);
            doneEventSent = true;
            let { cleanContent, itineraryData } = extractItineraryJSON(fullContent);

            // Fallback: if this looks like a planning response but no JSON block, extract it
            if (!itineraryData && /\b(plan|itinerary|trip)\b/i.test(lastMsg) && /day\s*[1-9]|day\s*one|day\s*two|morning.*afternoon|## .*day\b/i.test(cleanContent)) {
              try {
                console.log('[AI Stream] Planning response missing JSON block — running fallback extraction');
                const extractionPrompt = `Extract the structured itinerary from this trip plan text. Return ONLY a valid JSON object (no markdown, no explanation) in this format:
{"days":[{"id":"day-1","dayNumber":1,"label":"Day 1 — label","stops":[{"id":"s1-1","order":0,"type":"trail|landmark|campground|visitor_center|restaurant|lodging|custom","name":"Stop Name","note":"brief note","startTime":"08:00","duration":60,"latitude":0.0,"longitude":0.0,"difficulty":"easy|moderate|strenuous","why":"why this stop fits","drivingTimeFromPreviousMin":0}]}]}

Include latitude/longitude (estimate if needed), duration in minutes, and difficulty for trails. Here is the plan text:

${cleanContent.substring(0, 6000)}`;

                const extractedJSON = await claudeService.chat([{ role: 'user', content: extractionPrompt }], 'You are a JSON extraction tool. Return only valid JSON, no markdown or explanation.');
                const jsonMatch = extractedJSON.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
                    itineraryData = parsed;
                    console.log(`[AI Stream] Fallback extraction successful: ${parsed.days.length} days, ${parsed.days.reduce((s, d) => s + (d.stops?.length || 0), 0)} stops`);
                  }
                }
              } catch (extractErr) {
                console.log('[AI Stream] Fallback extraction failed:', extractErr.message);
              }
            }

            // Hard gate: strip itinerary if no park was detected
            if (noParkDetected && itineraryData) {
              console.log('[AI Stream] Itinerary stripped — no park was detected');
              itineraryData = null;
              const gateNotice = '\n\n---\n📍 **To get a detailed itinerary, please specify which national park you\'re planning to visit.** I can then pull live NPS data and build a day-by-day plan.';
              cleanContent += gateNotice;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: gateNotice })}\n\n`);
            }

            // ── Validate + Correct + Confidence (no regeneration for streaming) ──
            let validatedContent = cleanContent;
            const alertWarning = validateCriticalAlerts(cleanContent, npsFacts);
            let constraintIssues = itineraryData ? validateItineraryConstraints(itineraryData, constraints) : [];
            let feasibilityIssues = itineraryData ? validateItineraryFeasibility(itineraryData) : [];

            let correctionSummary = '';
            let confidence = { level: 'high', score: 1.0 };

            if (itineraryData && constraintIssues.length > 0) {
              let currentItinerary = itineraryData;
              let allCorrections = [];
              let totalRemoved = 0;
              const originalCount = itineraryData.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

              for (let pass = 1; pass <= 2; pass++) {
                const issues = pass === 1 ? constraintIssues : validateItineraryConstraints(currentItinerary, constraints);
                if (issues.length === 0) break;

                const result = correctItinerary(currentItinerary, constraints, issues, npsFacts, {
                  isHypothetical: hypothetical?.isHypothetical || false,
                  pass
                });

                currentItinerary = result.correctedItinerary;
                allCorrections.push(...result.corrections);
                totalRemoved += result.removedCount;

                if (result.tooAggressive) break;
              }

              itineraryData = currentItinerary;
              confidence = computeConfidence(allCorrections, totalRemoved, originalCount);

              if (allCorrections.length > 0) {
                correctionSummary = `\n\n---\n📍 **Adjusted to fit your constraints:**\n${allCorrections.map(c => `- ${c}`).join('\n')}`;
                console.log('[AI Stream] Corrections applied:', allCorrections);
              }

              const postIssues = validateItineraryFeasibility(currentItinerary);
              if (postIssues.length > 0) {
                correctionSummary += `\n\n⏱️ **After adjustment:**\n${postIssues.map(w => `- ${w}`).join('\n')}`;
              }
            }

            // Append warnings + corrections
            if (alertWarning) {
              validatedContent += alertWarning;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: alertWarning })}\n\n`);
            }

            if (correctionSummary) {
              validatedContent += correctionSummary;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: correctionSummary })}\n\n`);
            } else if (feasibilityIssues.length > 0) {
              const feasibilityNote = `\n\n---\n⏱️ **Schedule feasibility notice:**\n${feasibilityIssues.map(w => `- ${w}`).join('\n')}\n_Consider adjusting your itinerary for a more realistic pace._`;
              validatedContent += feasibilityNote;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: feasibilityNote })}\n\n`);
            }

            if (confidence.level !== 'high') {
              const confNote = `\n\n${confidence.level === 'low' ? '⚠️' : 'ℹ️'} **Plan confidence: ${confidence.level}** — ${confidence.level === 'low' ? 'This plan needed significant changes. Consider adjusting your preferences or ask me to regenerate.' : 'Minor adjustments were made to match your constraints.'}`;
              validatedContent += confNote;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: confNote })}\n\n`);
            }

            // Score the itinerary
            let planScore = null;
            if (itineraryData) planScore = scoreItinerary(itineraryData, constraints);

            // Post-fetch: if no images were pre-fetched and none shown before, extract parks from AI response
            if (parkImages.length === 0 && !alreadyShownImages && validatedContent) {
              const responseParks = extractAllParksFromMessage(validatedContent);
              if (responseParks.length > 0) {
                parkImages = await fetchMultiParkImages(responseParks, '[AI Stream Post]');
              }
            }

            console.log('[AI Stream] Sending done event:', { hasItinerary: !!itineraryData, itineraryDays: itineraryData?.days?.length || 0, contentLen: validatedContent?.length || 0 });
            res.write(`data: ${JSON.stringify({ type: 'done', content: validatedContent, provider: 'claude', model: model || 'claude-sonnet-4-6', hasLiveData: !!(npsFacts || weatherFacts || webSearchFacts), hasWebSearch: !!webSearchFacts, parkName: resolvedMetadata.parkName || null, parkNames: parkNames || [], hasItinerary: !!itineraryData, itineraryData: itineraryData || null, confidence, planScore, intent: intent?.primaryIntent || null, parkImages: parkImages || [] })}\n\n`);

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
                  console.log(`[AI Stream] Corrected itinerary saved to TripPlan ${tripId}`);
                } catch (saveErr) {
                  console.error('[AI Stream] Failed to save itinerary:', saveErr.message);
                }
              }
            }
          }
        }

        // Fallback: if message_stop was never emitted, process after loop ends
        if (!doneEventSent && fullContent) {
          console.log('[AI Stream] message_stop not received — processing after loop');
          let { cleanContent, itineraryData } = extractItineraryJSON(fullContent);

          // Fallback itinerary extraction
          if (!itineraryData && /\b(plan|itinerary|trip)\b/i.test(lastMsg) && /day\s*[1-9]|day\s*one|day\s*two|morning.*afternoon|## .*day\b/i.test(cleanContent)) {
            try {
              console.log('[AI Stream] Planning response missing JSON block — running fallback extraction');
              const extractionPrompt = `Extract the structured itinerary from this trip plan text. Return ONLY a valid JSON object (no markdown, no explanation) in this format:
{"days":[{"id":"day-1","dayNumber":1,"label":"Day 1 — label","stops":[{"id":"s1-1","order":0,"type":"trail|landmark|campground|visitor_center|restaurant|lodging|custom","name":"Stop Name","note":"brief note","startTime":"08:00","duration":60,"latitude":0.0,"longitude":0.0,"difficulty":"easy|moderate|strenuous","why":"why this stop fits","drivingTimeFromPreviousMin":0}]}]}

Include latitude/longitude (estimate if needed), duration in minutes, and difficulty for trails. Here is the plan text:

${cleanContent.substring(0, 6000)}`;

              const extractedJSON = await claudeService.chat([{ role: 'user', content: extractionPrompt }], 'You are a JSON extraction tool. Return only valid JSON, no markdown or explanation.');
              const jsonMatch = extractedJSON.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
                  itineraryData = parsed;
                  console.log(`[AI Stream] Fallback extraction successful: ${parsed.days.length} days, ${parsed.days.reduce((s, d) => s + (d.stops?.length || 0), 0)} stops`);
                }
              }
            } catch (extractErr) {
              console.log('[AI Stream] Fallback extraction failed:', extractErr.message);
            }
          }

          let validatedContent = cleanContent;
          let confidence = { level: 'high', score: 1.0 };
          let planScore = null;
          if (itineraryData) planScore = scoreItinerary(itineraryData, constraints);

          // Post-fetch images if needed
          if (parkImages.length === 0 && !alreadyShownImages && validatedContent) {
            const responseParks = extractAllParksFromMessage(validatedContent);
            if (responseParks.length > 0) {
              parkImages = await fetchMultiParkImages(responseParks, '[AI Stream Post]');
            }
          }

          res.write(`data: ${JSON.stringify({ type: 'done', content: validatedContent, provider: 'claude', model: model || 'claude-sonnet-4-6', hasLiveData: !!(npsFacts || weatherFacts || webSearchFacts), hasWebSearch: !!webSearchFacts, parkName: resolvedMetadata.parkName || null, parkNames: parkNames || [], hasItinerary: !!itineraryData, itineraryData: itineraryData || null, confidence, planScore, intent: intent?.primaryIntent || null, parkImages: parkImages || [] })}\n\n`);

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
                console.log(`[AI Stream] Corrected itinerary saved to TripPlan ${tripId}`);
              } catch (saveErr) {
                console.error('[AI Stream] Failed to save itinerary:', saveErr.message);
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
          model: model || 'gpt-5.4-mini',
          messages: [{ role: 'system', content: enhancedSystemPrompt }, ...openaiMessages],
          temperature: temperature,
          max_completion_tokens: maxTokens,
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
        let { cleanContent: openaiCleanContent, itineraryData: openaiItineraryData } = extractItineraryJSON(fullContent);

        // Hard gate: strip itinerary if no park was detected
        if (noParkDetected && openaiItineraryData) {
          console.log('[AI Stream] Itinerary stripped — no park was detected (OpenAI)');
          openaiItineraryData = null;
          const gateNotice = '\n\n---\n📍 **To get a detailed itinerary, please specify which national park you\'re planning to visit.** I can then pull live NPS data and build a day-by-day plan.';
          openaiCleanContent += gateNotice;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: gateNotice })}\n\n`);
        }

        // ── Validate + Correct + Confidence (no regeneration for streaming) ──
        let openaiValidatedContent = openaiCleanContent;
        const openaiAlertWarning = validateCriticalAlerts(openaiCleanContent, npsFacts);
        let openaiConstraintIssues = openaiItineraryData ? validateItineraryConstraints(openaiItineraryData, constraints) : [];
        let openaiFeaIssues = openaiItineraryData ? validateItineraryFeasibility(openaiItineraryData) : [];

        let openaiCorrectionSummary = '';
        let openaiConfidence = { level: 'high', score: 1.0 };

        if (openaiItineraryData && openaiConstraintIssues.length > 0) {
          let currentItinerary = openaiItineraryData;
          let allCorrections = [];
          let totalRemoved = 0;
          const originalCount = openaiItineraryData.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

          for (let pass = 1; pass <= 2; pass++) {
            const issues = pass === 1 ? openaiConstraintIssues : validateItineraryConstraints(currentItinerary, constraints);
            if (issues.length === 0) break;

            const result = correctItinerary(currentItinerary, constraints, issues, npsFacts, {
              isHypothetical: hypothetical?.isHypothetical || false,
              pass
            });

            currentItinerary = result.correctedItinerary;
            allCorrections.push(...result.corrections);
            totalRemoved += result.removedCount;

            if (result.tooAggressive) break;
          }

          openaiItineraryData = currentItinerary;
          openaiConfidence = computeConfidence(allCorrections, totalRemoved, originalCount);

          if (allCorrections.length > 0) {
            openaiCorrectionSummary = `\n\n---\n📍 **Adjusted to fit your constraints:**\n${allCorrections.map(c => `- ${c}`).join('\n')}`;
            console.log('[AI Stream] OpenAI corrections applied:', allCorrections);
          }

          const postIssues = validateItineraryFeasibility(currentItinerary);
          if (postIssues.length > 0) {
            openaiCorrectionSummary += `\n\n⏱️ **After adjustment:**\n${postIssues.map(w => `- ${w}`).join('\n')}`;
          }
        }

        // Append warnings + corrections
        if (openaiAlertWarning) {
          openaiValidatedContent += openaiAlertWarning;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: openaiAlertWarning })}\n\n`);
        }

        if (openaiCorrectionSummary) {
          openaiValidatedContent += openaiCorrectionSummary;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: openaiCorrectionSummary })}\n\n`);
        } else if (openaiFeaIssues.length > 0) {
          const openaiFeaNote = `\n\n---\n⏱️ **Schedule feasibility notice:**\n${openaiFeaIssues.map(w => `- ${w}`).join('\n')}\n_Consider adjusting your itinerary for a more realistic pace._`;
          openaiValidatedContent += openaiFeaNote;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: openaiFeaNote })}\n\n`);
        }

        if (openaiConfidence.level !== 'high') {
          const confNote = `\n\n${openaiConfidence.level === 'low' ? '⚠️' : 'ℹ️'} **Plan confidence: ${openaiConfidence.level}** — ${openaiConfidence.level === 'low' ? 'This plan needed significant changes. Consider adjusting your preferences or ask me to regenerate.' : 'Minor adjustments were made to match your constraints.'}`;
          openaiValidatedContent += confNote;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: confNote })}\n\n`);
        }

        // Score the itinerary
        let openaiPlanScore = null;
        if (openaiItineraryData) openaiPlanScore = scoreItinerary(openaiItineraryData, constraints);

        // Post-fetch: if no images were pre-fetched and none shown before, extract parks from AI response
        if (parkImages.length === 0 && !alreadyShownImages && openaiValidatedContent) {
          const responseParks = extractAllParksFromMessage(openaiValidatedContent);
          if (responseParks.length > 0) {
            parkImages = await fetchMultiParkImages(responseParks, '[AI Stream OpenAI Post]');
          }
        }

        res.write(`data: ${JSON.stringify({ type: 'done', content: openaiValidatedContent, provider: 'openai', model: model || 'gpt-5.4-mini', hasLiveData: !!(npsFacts || weatherFacts || webSearchFacts), hasWebSearch: !!webSearchFacts, parkName: resolvedMetadata.parkName || null, parkNames: parkNames || [], hasItinerary: !!openaiItineraryData, itineraryData: openaiItineraryData || null, confidence: openaiConfidence, planScore: openaiPlanScore, intent: intent?.primaryIntent || null, parkImages: parkImages || [] })}\n\n`);

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
              console.log(`[AI Stream] OpenAI corrected itinerary saved to TripPlan ${tripId}`);
            } catch (saveErr) {
              console.error('[AI Stream] Failed to save itinerary:', saveErr.message);
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
  let anonymousId; // Declared outside try so catch block can access it
  const requestStartTime = Date.now();
  try {
    console.log('[AI] Anonymous chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata,
      hasClientAnonymousId: !!req.body.anonymousId
    });

    let {
      messages = [],
      provider = 'auto',
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 8000,
      systemPrompt,
      metadata = {}, // { parkCode, parkName, lat, lon }
      anonymousId: clientAnonymousId // Use client-provided anonymousId if available
    } = req.body;

    // Auto-route provider if not explicitly set
    if (!provider || provider === 'auto') {
      provider = autoRouteProvider(messages);
      console.log(`[AI] Anonymous auto-routed to provider: ${provider}`);
    }

    // Use client-provided anonymousId if available, otherwise generate new one
    // This ensures session persistence across requests
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

    // Auto-extract ALL parks from user message
    let resolvedMetadata = { ...metadata };
    let anonExtractedParks = [];

    if (!resolvedMetadata.parkCode && lastUserMessageContent) {
      anonExtractedParks = extractAllParksFromMessage(lastUserMessageContent);
      if (anonExtractedParks.length > 0) {
        resolvedMetadata.parkCode = anonExtractedParks[0].parkCode;
        resolvedMetadata.parkName = resolvedMetadata.parkName || anonExtractedParks[0].parkName;
        resolvedMetadata.lat = resolvedMetadata.lat || anonExtractedParks[0].lat;
        resolvedMetadata.lon = resolvedMetadata.lon || anonExtractedParks[0].lon;
        console.log(`[AI] Parks extracted from anonymous message: ${anonExtractedParks.map(p => `${p.parkName} (${p.parkCode})`).join(', ')}`);
      }
    } else if (resolvedMetadata.parkCode) {
      // If parkCode is provided but parkName is missing, try extracting from the message
      if (!resolvedMetadata.parkName && lastUserMessageContent) {
        const fromMsg = extractAllParksFromMessage(lastUserMessageContent);
        const match = fromMsg.find(p => p.parkCode === resolvedMetadata.parkCode);
        if (match) {
          resolvedMetadata.parkName = match.parkName;
          resolvedMetadata.lat = resolvedMetadata.lat || match.lat;
          resolvedMetadata.lon = resolvedMetadata.lon || match.lon;
        }
      }
      anonExtractedParks = [{ parkCode: resolvedMetadata.parkCode, parkName: resolvedMetadata.parkName || '', lat: resolvedMetadata.lat, lon: resolvedMetadata.lon }];
    }

    const anonParkNames = anonExtractedParks.map(p => p.parkName).filter(Boolean);

    // Logging-related variables hoisted for structured logging
    let anonUserCity = null;
    let anonCandidateParksBlock = false;

    // Fetch relevant facts (web search skipped for anonymous users via isAnonymous flag)
    let weatherFacts = null;
    let npsFacts = null;
    let feeFreeFacts = null;

    try {
      const factsResult = await fetchRelevantFacts({
        userMessage: lastUserMessageContent,
        parkCode: resolvedMetadata.parkCode,
        lat: resolvedMetadata.lat,
        lon: resolvedMetadata.lon,
        parkName: resolvedMetadata.parkName,
        isAnonymous: true
      });
      weatherFacts = factsResult.weatherFacts;
      feeFreeFacts = factsResult.feeFreeFacts;

      // Fetch NPS facts for ALL mentioned parks in parallel
      if (anonExtractedParks.length > 1) {
        const allNpsResults = await Promise.all(
          anonExtractedParks.map(p => fetchNPSFacts({ parkCode: p.parkCode }).catch(() => null))
        );
        const labeledFacts = anonExtractedParks
          .map((p, i) => allNpsResults[i] ? `[${p.parkName}]\n${allNpsResults[i]}` : null)
          .filter(Boolean);
        npsFacts = labeledFacts.join('\n\n');
      } else {
        npsFacts = factsResult.npsFacts;
      }

      console.log('[AI] Facts fetched for anonymous user:', { hasWeather: !!weatherFacts, hasNPS: !!npsFacts, hasFeeFree: !!feeFreeFacts, parks: anonParkNames });
    } catch (factsError) {
      console.error('[AI] Facts fetching error for anonymous user:', factsError.message);
    }

    // Fetch park images for anonymous users (only once per chat, distributed across parks)
    let parkImages = [];
    const anonAlreadyShownImages = messages.some(m =>
      m.role === 'assistant' && m.content?.includes('(Photos shown to user:')
    );
    if (anonExtractedParks.length > 0 && !anonAlreadyShownImages) {
      parkImages = await fetchMultiParkImages(anonExtractedParks, '[AI Anon]');
    } else if (anonAlreadyShownImages) {
      console.log('[AI] Skipping park images — already shown in this conversation');
    }

    // Build enhanced system prompt with facts
    // Use the full persona prompt from the appropriate service when no custom prompt is provided
    const defaultPrompt = provider === 'openai'
      ? openaiService.systemPrompt
      : claudeService.defaultSystemPrompt;
    let enhancedSystemPrompt = systemPrompt || defaultPrompt;

    // Fee-free block hoisted to top (same as authenticated endpoint)
    if (feeFreeFacts) {
      enhancedSystemPrompt += formatFeeFreeBlock(feeFreeFacts);
    }

    if (npsFacts || weatherFacts) {
      const parkLabel = anonParkNames.length > 1 ? anonParkNames.join(', ') : (resolvedMetadata.parkName || 'this park');
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Build data availability manifest
      const available = [];
      const missing = [];
      if (npsFacts) available.push('NPS alerts/closures/permits/campgrounds'); else if (resolvedMetadata.parkCode) missing.push('NPS park data (API unavailable)');
      if (weatherFacts) available.push('weather forecast'); else if (resolvedMetadata.lat) missing.push('weather forecast');
      missing.push('web search (requires sign-up)');

      enhancedSystemPrompt += `\n\n--- LIVE TRAILVERSE DATA: ${parkLabel.toUpperCase()} ---`;
      enhancedSystemPrompt += `\nThis is AUTHORITATIVE real-time data as of ${today}. This OVERRIDES your training data where they conflict.`;
      enhancedSystemPrompt += `\nDATA AVAILABLE: ${available.join(', ')}`;
      if (missing.length > 0) {
        enhancedSystemPrompt += `\nDATA MISSING: ${missing.join(', ')} — for missing categories, qualify your knowledge as "typically" or "generally" and direct users to nps.gov.`;
      }
      enhancedSystemPrompt += `\nYou MUST use this data as your primary source. Weave live facts naturally into your answer — don't use robotic prefixes like "📍 Current NPS data shows...". Just state the fact directly (e.g., "The Narrows is closed right now due to cyanobacteria" or "No timed entry required this year"). Users trust you; you don't need to label your source every time.`;
      enhancedSystemPrompt += `\nDo NOT invent closures, permits, or conditions not listed here. If something is NOT in this data, say "check nps.gov for the latest."\n\n`;

      if (npsFacts) {
        enhancedSystemPrompt += npsFacts + '\n\n';
      }
      if (weatherFacts) {
        enhancedSystemPrompt += weatherFacts + '\n';
      }

      enhancedSystemPrompt += `--- END LIVE DATA ---\n`;
    } else if (resolvedMetadata.parkCode) {
      // Park was detected but ALL data failed — warn the model
      const parkLabel = resolvedMetadata.parkName || resolvedMetadata.parkCode;
      enhancedSystemPrompt += `\n\n--- DATA NOTICE ---`;
      enhancedSystemPrompt += `\nLive data for ${parkLabel} is COMPLETELY UNAVAILABLE right now (APIs may be down).`;
      enhancedSystemPrompt += `\nDATA AVAILABLE: none`;
      enhancedSystemPrompt += `\nDATA MISSING: NPS alerts/closures/permits, weather forecast, web search`;
      enhancedSystemPrompt += `\nYou MUST tell the user: "I don't have real-time data for ${parkLabel} right now — my suggestions are based on general knowledge. Verify current conditions, closures, and permits at nps.gov before your trip."`;
      enhancedSystemPrompt += `\nDo NOT present training-data knowledge as current facts. Qualify everything as "typically" or "generally."`;
      enhancedSystemPrompt += `\n--- END NOTICE ---\n`;
    } else if (!resolvedMetadata.parkCode) {
      // No park detected at all — no live data available
      enhancedSystemPrompt += `\n\n--- NO PARK DETECTED ---`;
      enhancedSystemPrompt += `\nNo specific park was identified in the user's message, so you have NO live data.`;
      enhancedSystemPrompt += `\nDo NOT generate a detailed itinerary for a vague request. NEVER output an [ITINERARY_JSON] block without a specific park. Instead:`;
      enhancedSystemPrompt += `\n- If the user's question is answerable without park-specific data, answer using your training knowledge and the crowd calendar data.`;
      enhancedSystemPrompt += `\n- If the user needs a trip plan, ask which park they're considering — or suggest 2-3 specific parks based on what they described.`;
      enhancedSystemPrompt += `\n- Qualify all answers as general knowledge: "Generally..." / "Most years..."`;
      enhancedSystemPrompt += `\n--- END NOTICE ---\n`;

      // Inject candidate parks list so the model has real NPS data to recommend from
      try {
        anonUserCity = extractUserCity(lastUserMessageContent);
        const candidateResult = await getCandidateParks(anonUserCity);
        const candidateBlock = formatCandidateParksBlock(candidateResult);
        anonCandidateParksBlock = !!candidateBlock;
        if (candidateBlock) {
          enhancedSystemPrompt += candidateBlock;
          console.log(`[AI Anon] Candidate parks injected:`, { userCity: anonUserCity?.name || 'none', tiered: !!candidateResult.userCity });
        }
      } catch (candidateErr) {
        console.error(`[AI Anon] Candidate parks error:`, candidateErr.message);
      }
    }

    // Inject relevant blog posts when a park is detected
    if (anonExtractedParks.length > 0) {
      const parkNamesForBlog = anonExtractedParks.map(p => p.parkName).filter(Boolean);
      const blogContext = await fetchBlogContext(parkNamesForBlog);
      if (blogContext) {
        enhancedSystemPrompt += blogContext;
        console.log(`[AI Anon] Blog context found for: ${parkNamesForBlog.join(', ')}`);
      }
    }

    const anonNoParkDetected = !resolvedMetadata.parkCode;

    // ── Constraint Engine: parse, preflight, inject ──
    const anonConstraints = parseConstraints(metadata, lastUserMessageContent);
    const anonPreflightResult = preflightCheck(anonConstraints, resolvedMetadata.parkCode);
    const anonHypothetical = detectHypothetical(lastUserMessageContent);

    // Pre-flight BLOCKER
    if (anonPreflightResult.blockers.length > 0) {
      const blockerMsg = anonPreflightResult.blockers.map(b => `- ${b}`).join('\n');
      return res.json({ data: { content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`, provider: 'system', anonymousId: session.anonymousId, messageCount: session.messages.filter(m => m.role === 'user').length, canSendMore: session.canSendMessage() } });
    }

    // Inject constraint block
    if (anonConstraints.hasConstraints) {
      enhancedSystemPrompt += buildConstraintBlock(anonConstraints);
    }
    if (anonPreflightResult.warnings.length > 0) {
      enhancedSystemPrompt += `\n\n--- PRE-FLIGHT WARNINGS ---\n${anonPreflightResult.warnings.map(w => `- ${w}`).join('\n')}\nAddress these proactively in your response.\n--- END WARNINGS ---\n`;
    }

    // Detect and inject conflicts
    const anonConflicts = detectConflicts(anonConstraints, lastUserMessageContent);
    if (anonConflicts.length > 0) {
      enhancedSystemPrompt += `\n\n--- CONSTRAINT CONFLICTS DETECTED ---\nThe user's request contains CONTRADICTORY constraints. You MUST address each conflict — do NOT silently merge them into a generic plan.\n`;
      for (const conflict of anonConflicts) {
        enhancedSystemPrompt += `\nCONFLICT: ${conflict.constraintA} vs. ${conflict.constraintB}\n${conflict.prompt}\n`;
      }
      enhancedSystemPrompt += `\n--- END CONFLICTS ---\n`;
    }

    // Detect and inject user intent
    const anonIntent = detectIntent(lastUserMessageContent, anonConstraints);
    if (anonIntent.adaptations) {
      enhancedSystemPrompt += `\n\n--- USER INTENT DETECTED ---\n${anonIntent.adaptations}\n--- END USER INTENT ---\n`;
    }

    if (anonHypothetical.isHypothetical) {
      enhancedSystemPrompt += `\n\n--- SCENARIO MODE ACTIVE ---
The user is asking a hypothetical/what-if question ("${anonHypothetical.scenarioDescription}").

CRITICAL ISOLATION RULES — follow these exactly:
1. The user's scenario assumptions OVERRIDE all real-world data above. If the scenario says "canyon is closed", it IS closed for this plan — even if live NPS data says otherwise.
2. Do NOT include any live data citations in your scenario plan. The live data block above is REFERENCE ONLY — do not surface it to the user.
3. Structure your response as a SINGLE scenario plan under the user's assumed conditions. Do NOT show a "real conditions" section followed by a "scenario" section — that causes confusion. Just plan for the scenario.
4. If the scenario makes certain permits/reservations irrelevant (e.g., area is closed), do NOT mention them.
5. You may briefly note at the END: "Note: This plan assumes [scenario condition]. Check nps.gov for current real-world conditions." — ONE sentence, nothing more.
6. Do NOT pad with unrelated real-world details, closure lists, or weather data that contradicts the scenario.
--- END SCENARIO MODE ---\n`;
    }

    // Bookend: repeat fee-free reminder at end of prompt (same as authenticated)
    if (feeFreeFacts && feeFreeFacts.hasOverlap) {
      const dayNames = feeFreeFacts.days.map(d => d.label).join(', ');
      enhancedSystemPrompt += `\n\n⚠️ REMINDER: The user's trip overlaps fee-free entrance day(s): ${dayNames}. You MUST mention this in your first paragraph.\n`;
    }

    // Prevent AI from leaking internal JSON mechanism to the user
    enhancedSystemPrompt += `\n\n--- OUTPUT RULES ---\nThe [ITINERARY_JSON] block is an internal data format automatically extracted from your response. NEVER mention JSON, code blocks, data formats, or offer to "regenerate the JSON" or "output the updated JSON" in your user-facing text. Speak naturally about the itinerary as a travel plan.\n--- END OUTPUT RULES ---\n`;

    // Use the filtered conversation messages without system role messages
    const augmentedMessages = filteredMessages;

    console.log('[AI] Augmented messages for anonymous user:', {
      hasSystemFacts: !!(npsFacts || weatherFacts),
      totalMessageCount: augmentedMessages.length,
      provider,
      messageCount: session.messageCount,
      hasConstraints: anonConstraints.hasConstraints
    });

    let response;

    // Fallback: resolve 'auto' or unknown providers to claude
    if (provider !== 'claude' && provider !== 'openai') {
      provider = anthropic ? 'claude' : 'openai';
    }

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
        model: model || 'gpt-5.4-mini',
        messages: [{ role: 'system', content: enhancedSystemPrompt }, ...openaiMessages],
        max_completion_tokens: maxTokens,
        temperature: temperature,
        top_p: top_p,
      });

      response = {
        content: openaiResponse.choices[0].message.content,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        usage: {
          inputTokens: openaiResponse.usage.prompt_tokens,
          outputTokens: openaiResponse.usage.completion_tokens,
        }
      };

    } else {
      return res.status(400).json({ error: 'Invalid provider. Use "claude" or "openai"' });
    }

    // Extract and strip itinerary JSON from response (strip but do NOT save for anonymous)
    let { cleanContent: anonCleanContent, itineraryData: anonItineraryData } = extractItineraryJSON(response.content);

    // Fallback: if this looks like a planning response but no JSON block, extract it
    if (!anonItineraryData && /\b(plan|itinerary|trip)\b/i.test(lastUserMessageContent) && /day\s*[1-9]|day\s*one|day\s*two|morning.*afternoon|## .*day\b/i.test(anonCleanContent)) {
      try {
        console.log('[AI] Anonymous planning response missing JSON block — running fallback extraction');
        const extractionPrompt = `Extract the structured itinerary from this trip plan text. Return ONLY a valid JSON object (no markdown, no explanation) in this format:
{"days":[{"id":"day-1","dayNumber":1,"label":"Day 1 — label","stops":[{"id":"s1-1","order":0,"type":"trail|landmark|campground|visitor_center|restaurant|lodging|custom","name":"Stop Name","note":"brief note","startTime":"08:00","duration":60,"latitude":0.0,"longitude":0.0,"difficulty":"easy|moderate|strenuous","why":"why this stop fits","drivingTimeFromPreviousMin":0}]}]}

Include latitude/longitude (estimate if needed), duration in minutes, and difficulty for trails. Here is the plan text:

${anonCleanContent.substring(0, 6000)}`;

        const claudeService = require('../services/claudeService');
        const extractedJSON = await claudeService.chat([{ role: 'user', content: extractionPrompt }], 'You are a JSON extraction tool. Return only valid JSON, no markdown or explanation.');
        const jsonMatch = extractedJSON.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
            anonItineraryData = parsed;
            console.log(`[AI] Anonymous fallback extraction successful: ${parsed.days.length} days, ${parsed.days.reduce((s, d) => s + (d.stops?.length || 0), 0)} stops`);
          }
        }
      } catch (extractErr) {
        console.log('[AI] Anonymous fallback extraction failed:', extractErr.message);
      }
    }

    // Hard gate: strip itinerary if no park was detected
    if (anonNoParkDetected && anonItineraryData) {
      console.log('[AI] Itinerary stripped from anonymous response — no park detected');
      anonItineraryData = null;
      anonCleanContent += '\n\n---\n📍 **To get a detailed itinerary, please specify which national park you\'re planning to visit.** I can then pull live NPS data and build a day-by-day plan.';
    }

    // ── Validate + Correct + Confidence (anonymous — no regeneration) ──
    const anonAlertWarning = validateCriticalAlerts(anonCleanContent, npsFacts);
    let anonConstraintIssues = anonItineraryData ? validateItineraryConstraints(anonItineraryData, anonConstraints) : [];
    let anonFeasibilityIssues = anonItineraryData ? validateItineraryFeasibility(anonItineraryData) : [];

    let anonCorrectionSummary = '';
    let anonConfidence = { level: 'high', score: 1.0 };

    if (anonItineraryData && anonConstraintIssues.length > 0) {
      let currentItinerary = anonItineraryData;
      let allCorrections = [];
      let totalRemoved = 0;
      const originalCount = anonItineraryData.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

      for (let pass = 1; pass <= 2; pass++) {
        const issues = pass === 1 ? anonConstraintIssues : validateItineraryConstraints(currentItinerary, anonConstraints);
        if (issues.length === 0) break;

        const result = correctItinerary(currentItinerary, anonConstraints, issues, npsFacts, {
          isHypothetical: anonHypothetical?.isHypothetical || false,
          pass
        });

        currentItinerary = result.correctedItinerary;
        allCorrections.push(...result.corrections);
        totalRemoved += result.removedCount;

        if (result.tooAggressive) break;
      }

      anonItineraryData = currentItinerary;
      anonConfidence = computeConfidence(allCorrections, totalRemoved, originalCount);

      if (allCorrections.length > 0) {
        anonCorrectionSummary = `\n\n---\n📍 **Adjusted to fit your constraints:**\n${allCorrections.map(c => `- ${c}`).join('\n')}`;
        console.log('[AI] Anonymous corrections applied:', allCorrections);
      }

      const postIssues = validateItineraryFeasibility(currentItinerary);
      if (postIssues.length > 0) {
        anonCorrectionSummary += `\n\n⏱️ **After adjustment:**\n${postIssues.map(w => `- ${w}`).join('\n')}`;
      }
    }

    // Append warnings + corrections
    if (anonAlertWarning) anonCleanContent += anonAlertWarning;
    if (anonCorrectionSummary) {
      anonCleanContent += anonCorrectionSummary;
    } else if (anonFeasibilityIssues.length > 0) {
      anonCleanContent += `\n\n---\n⏱️ **Schedule feasibility notice:**\n${anonFeasibilityIssues.map(w => `- ${w}`).join('\n')}\n_Consider adjusting your itinerary for a more realistic pace._`;
    }

    if (anonConfidence.level !== 'high') {
      anonCleanContent += `\n\n${anonConfidence.level === 'low' ? '⚠️' : 'ℹ️'} **Plan confidence: ${anonConfidence.level}** — ${anonConfidence.level === 'low' ? 'This plan needed significant changes. Consider adjusting your preferences or ask me to regenerate.' : 'Minor adjustments were made to match your constraints.'}`;
    }

    response.content = anonCleanContent;

    // Add web search conversion message for anonymous users when their question would benefit from live search
    if (needsWebSearch(lastUserMessageContent) && isTravelRelated(lastUserMessageContent)) {
      response.content += '\n\n---\n\n🔍 **Want live search results?** Sign up free to unlock real-time hotel prices, restaurant ratings, and live web search powered answers in your trip plans.';
    }

    // Score the itinerary
    let anonPlanScore = null;
    if (anonItineraryData) anonPlanScore = scoreItinerary(anonItineraryData, anonConstraints);

    // Add AI response to session
    await session.addMessage({
      role: 'assistant',
      content: response.content,
      provider: response.provider,
      model: response.model,
      responseTime: Date.now() - session.lastActivity
    });

    const userMessageCount = session.messages.filter(msg => msg.role === 'user').length;

    // Post-fetch: if no images were pre-fetched and none shown before, extract parks from AI response
    if (parkImages.length === 0 && !anonAlreadyShownImages && response.content) {
      const responseParks = extractAllParksFromMessage(response.content);
      if (responseParks.length > 0) {
        parkImages = await fetchMultiParkImages(responseParks, '[AI Anon Post]');
      }
    }

    // Structured logging — fire and forget
    const anonRequestEndTime = Date.now();
    const anonParksMentioned = await extractParksMentioned(response.content || '');
    logAIRequest({
      endpoint: 'chat-anonymous',
      userId: null,
      provider: response.provider,
      model: response.model,
      durationMs: anonRequestEndTime - requestStartTime,
      promptHash: crypto.createHash('sha256').update(enhancedSystemPrompt).digest('hex').slice(0, 12),
      blocks: {
        npsFacts: !!npsFacts,
        weatherFacts: !!weatherFacts,
        webSearch: false,
        feeFree: !!(feeFreeFacts && feeFreeFacts.hasOverlap),
        candidateParks: anonCandidateParksBlock,
        constraints: anonConstraints.hasConstraints,
        preflight: { blockers: anonPreflightResult.blockers.length, warnings: anonPreflightResult.warnings.length },
        conflicts: anonConflicts.length,
        hypothetical: anonHypothetical.isHypothetical,
        intent: anonIntent?.primaryIntent || null,
        userContext: false,
      },
      park: resolvedMetadata.parkCode ? { code: resolvedMetadata.parkCode, name: resolvedMetadata.parkName } : null,
      cityDetected: anonUserCity?.name || null,
      messageCount: augmentedMessages.length,
      promptTokenEstimate: Math.round(enhancedSystemPrompt.length / 4),
      tokens: response.usage || null,
      response: {
        length: response.content?.length || 0,
        hasItinerary: !!anonItineraryData,
        mentionsFeeFree: /fee.free|free\s+entrance/i.test(response.content || ''),
        parksMentioned: anonParksMentioned,
      },
      error: null,
    });

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
        hasItinerary: !!anonItineraryData,
        itinerary: anonItineraryData || null,
        confidence: anonConfidence,
        planScore: anonPlanScore,
        intent: anonIntent?.primaryIntent || null,
        parkImages: parkImages || []
      }
    });

  } catch (error) {
    // Structured error logging
    logAIRequest({
      endpoint: 'chat-anonymous',
      userId: null,
      provider: req.body.provider || 'unknown',
      model: req.body.model || null,
      durationMs: Date.now() - requestStartTime,
      error: error.message,
    });

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
      name: 'Trailie',
      model: 'Claude Sonnet 4.6',
      description: 'Opinionated picks & insider tips',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'Trailie',
      model: 'GPT-5.4 Mini',
      description: 'Structured plans with times & logistics',
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
      name: 'Trailie',
      model: 'Claude Sonnet 4.6',
      description: 'Opinionated picks & insider tips',
      available: true
    });
  }

  if (openai && process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'Trailie',
      model: 'GPT-5.4 Mini',
      description: 'Structured plans with times & logistics',
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