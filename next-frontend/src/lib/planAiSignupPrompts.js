/** Context-specific signup copy for anonymous Trailie users. */

export const SIGNUP_PROMPT_REASONS = {
  MESSAGE_LIMIT: 'message-limit',
  SAVE_ITINERARY: 'save-itinerary',
  SAVE_CHAT: 'save-chat',
  OPEN_TRIP: 'open-trip',
  LIMIT_WITH_TRIP: 'limit-with-trip',
  LIMIT_WITHOUT_TRIP: 'limit-without-trip',
};

const DEFAULT_BENEFITS = [
  'Keep planning with Trailie',
  'Save trips and chat history',
  'Share plans with travel companions',
  'Export itineraries as PDF',
  'Drag-and-drop itinerary builder',
  'Access from any device',
];

const PROMPTS = {
  // Trip-aware gates. Chosen from canonical trip state, never from reply prose.
  [SIGNUP_PROMPT_REASONS.OPEN_TRIP]: {
    badge: 'Your trip',
    title: 'Your trip is ready',
    subtitle: 'Create a free account or sign in to open the full itinerary, map and keep planning.',
    primaryCta: 'Create free account',
    secondaryCta: 'Sign in',
    loginCta: 'Sign in and open trip',
  },
  [SIGNUP_PROMPT_REASONS.LIMIT_WITH_TRIP]: {
    badge: 'Your trip',
    title: 'Your trip is ready',
    subtitle: 'Create a free account or sign in to keep this conversation, open your itinerary and map, and continue planning.',
    primaryCta: 'Create free account',
    secondaryCta: 'Sign in',
    loginCta: 'Sign in and keep planning',
  },
  [SIGNUP_PROMPT_REASONS.LIMIT_WITHOUT_TRIP]: {
    badge: 'Keep planning',
    title: 'Keep planning with Trailie',
    subtitle: 'Create a free account to continue this conversation.',
    primaryCta: 'Create free account',
    secondaryCta: 'Sign in',
    loginCta: 'Sign in and continue',
  },
  [SIGNUP_PROMPT_REASONS.MESSAGE_LIMIT]: {
    badge: 'Continue planning',
    title: "You've Used Your 5 Free Messages",
    subtitle: 'Create a free account to keep the conversation going:',
    benefits: [
      'Keep chatting with Trailie beyond the free guest messages',
      'Save this chat and continue where you left off',
      'Share your plan with travel companions',
      'Export itineraries as PDF',
      'Drag-and-drop itinerary builder',
    ],
    primaryCta: 'Create Free Account',
    secondaryCta: 'Sign In',
  },
  [SIGNUP_PROMPT_REASONS.SAVE_ITINERARY]: {
    badge: 'Save trip',
    title: (ctx) => (ctx.parkName ? `Save Your ${ctx.parkName} Plan` : 'Save This Trip Plan'),
    subtitle: 'Sign up free to share this plan with your group and export a PDF:',
    benefits: [
      'Share a read-only link with travel companions',
      'Export your itinerary as PDF',
      'Save this trip permanently',
      'Edit days in the drag-and-drop plan builder',
      'Keep planning future trips with Trailie',
    ],
    primaryCta: 'Create Free Account',
    secondaryCta: 'Sign In',
    inlineTitle: 'Love this plan? Save it to your account.',
    inlineSubtitle:
      'Sign up free to share this plan with your group, export a PDF, and keep planning with Trailie.',
    inlineCta: 'Save Trip Free',
  },
  [SIGNUP_PROMPT_REASONS.SAVE_CHAT]: {
    badge: 'Save chat',
    title: 'Save This Conversation',
    subtitle: 'Create a free account so you never lose this planning session:',
    benefits: [
      'Save this chat permanently',
      'Keep planning with Trailie',
      'Build structured itineraries over multiple sessions',
      'Share and export when your plan is ready',
      'Save parks, track visits & write reviews',
    ],
    primaryCta: 'Create Free Account',
    secondaryCta: 'Sign In',
    inlineTitle: 'Want to keep this chat?',
    inlineSubtitle: 'Sign up free to save this conversation and keep planning with Trailie.',
    inlineCta: 'Save Chat Free',
  },
};

/**
 * @param {string} reason - SIGNUP_PROMPT_REASONS value
 * @param {{ parkName?: string }} [context]
 */
export function getSignupPrompt(reason, context = {}) {
  const base = PROMPTS[reason] || PROMPTS[SIGNUP_PROMPT_REASONS.SAVE_CHAT];
  const title = typeof base.title === 'function' ? base.title(context) : base.title;

  return {
    ...base,
    title,
    benefits: base.benefits || DEFAULT_BENEFITS,
  };
}

/** Pick signup prompt from chat state (inline banner + Save Trip modal). */
export function getSignupPromptReason(messages = []) {
  return getSavePromptReasonFromMessages(messages);
}

/** Pick save-itinerary vs save-chat from the latest assistant message. */
export function getSavePromptReasonFromMessages(messages = []) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isConversionMessage);
  if (!lastAssistant) return SIGNUP_PROMPT_REASONS.SAVE_CHAT;

  const content = lastAssistant.content || '';
  const looksLikePlan =
    lastAssistant.hasItinerary ||
    /(^|\n)\s*(Day\s*\d+[:\-\s]|Itinerary|5-Day Plan|Logistics Summary)/i.test(content);

  return looksLikePlan ? SIGNUP_PROMPT_REASONS.SAVE_ITINERARY : SIGNUP_PROMPT_REASONS.SAVE_CHAT;
}
