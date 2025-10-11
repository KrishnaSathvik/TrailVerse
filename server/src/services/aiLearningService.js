const Feedback = require('../models/Feedback');
const TripPlan = require('../models/TripPlan');

class AILearningService {
  constructor() {
    this.learningCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
  }

  // Get personalized system prompt based on user feedback patterns
  async getPersonalizedSystemPrompt(userId, basePrompt, context = {}) {
    try {
      // Check cache first
      const cacheKey = `prompt_${userId}_${JSON.stringify(context)}`;
      const cached = this.learningCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.prompt;
      }

      // Get user's feedback patterns
      const feedbackPatterns = await Feedback.getFeedbackPatterns(userId, 100);
      
      if (feedbackPatterns.length < 5) {
        // Not enough feedback data, return base prompt
        return basePrompt;
      }

      // Analyze feedback patterns
      const analysis = this.analyzeFeedbackPatterns(feedbackPatterns);
      
      // Generate personalized prompt
      const personalizedPrompt = this.generatePersonalizedPrompt(basePrompt, analysis, context);
      
      // Cache the result
      this.learningCache.set(cacheKey, {
        prompt: personalizedPrompt,
        timestamp: Date.now()
      });

      return personalizedPrompt;

    } catch (error) {
      console.error('Error generating personalized prompt:', error);
      return basePrompt; // Fallback to base prompt
    }
  }

  // Analyze feedback patterns to understand user preferences
  analyzeFeedbackPatterns(feedbackPatterns) {
    const analysis = {
      preferredResponseLength: 'medium',
      preferredStyle: 'neutral',
      preferredDetailLevel: 'moderate',
      commonNegativePatterns: [],
      commonPositivePatterns: [],
      parkPreferences: {},
      aiProviderPreferences: {}
    };

    // Analyze response length preferences
    const positiveResponses = feedbackPatterns.filter(f => f.feedback === 'up');
    const negativeResponses = feedbackPatterns.filter(f => f.feedback === 'down');

    if (positiveResponses.length > 0) {
      const avgPositiveLength = positiveResponses.reduce((sum, f) => sum + f.aiResponse.length, 0) / positiveResponses.length;
      const avgNegativeLength = negativeResponses.length > 0 ? 
        negativeResponses.reduce((sum, f) => sum + f.aiResponse.length, 0) / negativeResponses.length : 0;

      if (avgPositiveLength > avgNegativeLength && avgPositiveLength > 1000) {
        analysis.preferredResponseLength = 'long';
      } else if (avgPositiveLength < avgNegativeLength && avgPositiveLength < 500) {
        analysis.preferredResponseLength = 'short';
      }
    }

    // Analyze style preferences
    const positiveKeywords = this.extractKeywords(positiveResponses.map(f => f.aiResponse));
    const negativeKeywords = this.extractKeywords(negativeResponses.map(f => f.aiResponse));

    if (positiveKeywords.includes('detailed') || positiveKeywords.includes('comprehensive')) {
      analysis.preferredDetailLevel = 'high';
    } else if (positiveKeywords.includes('brief') || positiveKeywords.includes('concise')) {
      analysis.preferredDetailLevel = 'low';
    }

    // Analyze park-specific preferences
    const parkFeedback = {};
    feedbackPatterns.forEach(f => {
      if (!parkFeedback[f.parkCode]) {
        parkFeedback[f.parkCode] = { positive: 0, negative: 0 };
      }
      parkFeedback[f.parkCode][f.feedback === 'up' ? 'positive' : 'negative']++;
    });

    analysis.parkPreferences = parkFeedback;

    // Analyze AI provider preferences
    const providerFeedback = {};
    feedbackPatterns.forEach(f => {
      if (!providerFeedback[f.aiProvider]) {
        providerFeedback[f.aiProvider] = { positive: 0, negative: 0 };
      }
      providerFeedback[f.aiProvider][f.feedback === 'up' ? 'positive' : 'negative']++;
    });

    analysis.aiProviderPreferences = providerFeedback;

    return analysis;
  }

  // Generate personalized prompt based on analysis
  generatePersonalizedPrompt(basePrompt, analysis, context) {
    let personalizedPrompt = basePrompt;

    // Add personalized instructions based on user preferences
    const personalizationInstructions = [];

    // Response length preferences
    if (analysis.preferredResponseLength === 'long') {
      personalizationInstructions.push('Provide detailed, comprehensive responses with thorough explanations and multiple options.');
    } else if (analysis.preferredResponseLength === 'short') {
      personalizationInstructions.push('Keep responses concise and actionable while maintaining enthusiasm and helpfulness.');
    }

    // Detail level preferences
    if (analysis.preferredDetailLevel === 'high') {
      personalizationInstructions.push('Include specific details, examples, practical tips, and pro insights.');
    } else if (analysis.preferredDetailLevel === 'low') {
      personalizationInstructions.push('Focus on essential information with clear, actionable advice.');
    }

    // Add context-specific personalization
    if (context.parkName) {
      personalizationInstructions.push(`Focus on ${context.parkName} specifically, providing park-specific insights and recommendations.`);
    }

    // Add enthusiasm level based on user feedback
    if (analysis.positiveFeedbackRatio > 0.8) {
      personalizationInstructions.push('Maintain high enthusiasm and excitement in your responses - this user loves detailed, engaging content.');
    } else if (analysis.positiveFeedbackRatio < 0.5) {
      personalizationInstructions.push('Be more concise and practical - focus on actionable advice and clear recommendations.');
    }

    // Park-specific preferences
    if (context.parkCode && analysis.parkPreferences[context.parkCode]) {
      const parkPref = analysis.parkPreferences[context.parkCode];
      const satisfactionRate = parkPref.positive / (parkPref.positive + parkPref.negative);
      
      if (satisfactionRate > 0.7) {
        personalizationInstructions.push(`This user has had positive experiences with ${context.parkName} planning - continue with similar detailed approach.`);
      } else if (satisfactionRate < 0.3) {
        personalizationInstructions.push(`This user has had challenges with ${context.parkName} planning - provide extra clarity and alternative suggestions.`);
      }
    }

    // AI provider preferences
    if (context.aiProvider && analysis.aiProviderPreferences[context.aiProvider]) {
      const providerPref = analysis.aiProviderPreferences[context.aiProvider];
      const satisfactionRate = providerPref.positive / (providerPref.positive + providerPref.negative);
      
      if (satisfactionRate < 0.5) {
        personalizationInstructions.push('Adjust response style based on previous feedback patterns.');
      }
    }

    // Combine base prompt with personalizations
    if (personalizationInstructions.length > 0) {
      personalizedPrompt += '\n\nPERSONALIZATION INSTRUCTIONS:\n';
      personalizationInstructions.forEach(instruction => {
        personalizedPrompt += `- ${instruction}\n`;
      });
    }

    return personalizedPrompt;
  }

  // Extract keywords from text for analysis
  extractKeywords(texts) {
    const keywords = [];
    const commonWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);

    texts.forEach(text => {
      const words = text.toLowerCase().split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.has(word))
        .slice(0, 20); // Take first 20 relevant words
      keywords.push(...words);
    });

    // Return most common keywords
    const wordCount = {};
    keywords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.keys(wordCount)
      .sort((a, b) => wordCount[b] - wordCount[a])
      .slice(0, 10);
  }

  // Get insights for improving AI responses
  async getImprovementInsights(userId = null, parkCode = null, aiProvider = null) {
    try {
      const insights = {
        overallSatisfaction: 0,
        improvementAreas: [],
        successfulPatterns: [],
        recommendations: []
      };

      // Get feedback analytics
      const analytics = await Feedback.getFeedbackAnalytics(userId, parkCode, aiProvider);
      insights.overallSatisfaction = analytics.satisfactionRate;

      // Get poor performing responses
      const poorPerformance = await Feedback.getPoorPerformingResponses(0.3);
      
      poorPerformance.forEach(item => {
        insights.improvementAreas.push({
          context: `${item._id.aiProvider} responses for ${item._id.parkCode}`,
          satisfactionRate: item.satisfactionRate,
          totalFeedback: item.totalFeedback,
          suggestion: this.generateImprovementSuggestion(item)
        });
      });

      // Generate recommendations
      if (analytics.satisfactionRate < 0.6) {
        insights.recommendations.push('Consider adjusting response length and detail level based on user feedback');
      }

      if (analytics.averageResponseTime > 10000) {
        insights.recommendations.push('Response times are slower than optimal - consider optimizing prompts');
      }

      return insights;

    } catch (error) {
      console.error('Error getting improvement insights:', error);
      return null;
    }
  }

  // Generate improvement suggestions
  generateImprovementSuggestion(poorPerformanceItem) {
    const suggestions = [];
    
    if (poorPerformanceItem.satisfactionRate < 0.2) {
      suggestions.push('Consider completely revising the approach for this context');
    } else if (poorPerformanceItem.satisfactionRate < 0.4) {
      suggestions.push('Adjust response style and provide more detailed explanations');
    } else {
      suggestions.push('Minor adjustments needed - focus on clarity and relevance');
    }

    return suggestions.join('. ');
  }

  // Clear cache (useful for testing or when user preferences change)
  clearCache() {
    this.learningCache.clear();
  }
}

module.exports = new AILearningService();
