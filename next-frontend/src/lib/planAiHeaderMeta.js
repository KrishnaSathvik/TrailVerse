import { truncatePlainText } from '@/utils/stripMarkdown';
import { MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE } from '@/lib/planAiWelcomeCopy';
import { intentPlanAiHeaderTitle } from '@/lib/intentPlanAi';

export const PLAN_AI_ENTRY = {
  GENERAL: 'general',
  PARK: 'park',
  COMPARE: 'compare',
  ROAD_TRIP: 'road_trip',
  INTENT: 'intent',
  PERSONALIZED: 'personalized',
  CHAT_HISTORY: 'chat_history',
};

export function shortParkLabel(fullName) {
  return (
    fullName
      ?.replace(/\s+National (Park|Monument|Historic Site|Preserve|Seashore|Recreation Area).*$/i, '')
      ?.trim() || fullName || ''
  );
}

function formatTripDates(formData) {
  if (!formData?.startDate) return null;
  const fmt = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  if (formData.endDate) return `${fmt(formData.startDate)} – ${fmt(formData.endDate)}`;
  return fmt(formData.startDate);
}

function buildDateSubtitle(formData, currentPlan) {
  const dates = formatTripDates(formData);
  const dayCount = currentPlan?.days?.length || 0;
  const parts = [];
  if (dates) parts.push(dates);
  if (dayCount > 0) parts.push(`${dayCount}-day plan`);
  else if (formData?.groupSize > 1) parts.push(`${formData.groupSize} travelers`);
  if (parts.length) return parts.join(' · ');
  return null;
}

/**
 * How the user entered Plan AI — from URL on navigation, not from chat content.
 */
export function resolvePlanAiEntryMode({
  searchParams,
  tripId = null,
  fromChatHistory = false,
} = {}) {
  if (!searchParams) return PLAN_AI_ENTRY.GENERAL;
  if (searchParams.has('personalized')) return PLAN_AI_ENTRY.PERSONALIZED;
  if (tripId && fromChatHistory) return PLAN_AI_ENTRY.CHAT_HISTORY;
  if (searchParams.get('from') === 'intent' && searchParams.get('intent')?.trim()) {
    return PLAN_AI_ENTRY.INTENT;
  }
  if (searchParams.get('suggest')?.trim()) return PLAN_AI_ENTRY.ROAD_TRIP;
  if (searchParams.get('park') && searchParams.get('name')) return PLAN_AI_ENTRY.PARK;
  if (searchParams.get('from') === 'compare') return PLAN_AI_ENTRY.PARK;
  return PLAN_AI_ENTRY.GENERAL;
}

/** Compare page → Plan my trip (single park) — park header, compare welcome copy. */
export function isFromComparePage(searchParams) {
  return searchParams?.get('from') === 'compare';
}

/**
 * Best park label for shell header — URL/prop first, then latest assistant turn.
 */
export function resolvePlanningParkName({ parkName = '', messages = [] } = {}) {
  const fromProp = parkName?.trim();
  if (fromProp) return fromProp;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const name = msg.parkName?.trim();
    if (name) return name;
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const names = messages[i].parkNames;
    if (Array.isArray(names) && names.length === 1 && names[0]?.trim()) {
      return names[0].trim();
    }
  }

  return '';
}

/**
 * Shell title/subtitle for Plan AI — entry source (sticky per session) + park from URL or chat.
 * Generation progress lives in the typing indicator, not the shell subtitle.
 */
export function derivePlanAiHeaderMeta({
  entryMode = PLAN_AI_ENTRY.GENERAL,
  sessionEntryMode = null,
  isPersonalized = false,
  parkName = '',
  suggestText = '',
  intentContext = null,
  formData = null,
  currentPlan = null,
  hasUserMessages = false,
  resolvedParkName = '',
}) {
  const activeEntry =
    sessionEntryMode && sessionEntryMode !== PLAN_AI_ENTRY.GENERAL
      ? sessionEntryMode
      : entryMode;

  const mode =
    isPersonalized || activeEntry === PLAN_AI_ENTRY.PERSONALIZED
      ? PLAN_AI_ENTRY.PERSONALIZED
      : activeEntry === PLAN_AI_ENTRY.COMPARE
        ? PLAN_AI_ENTRY.PARK
        : activeEntry;

  if (mode === PLAN_AI_ENTRY.PERSONALIZED) {
    return {
      title: 'My recommendations',
      subtitle: MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE,
      showSubHeader: true,
    };
  }

  const planningPark = resolvedParkName || parkName;
  const parkLabel = shortParkLabel(planningPark);
  const dateSubtitle = buildDateSubtitle(formData, currentPlan);

  switch (mode) {
    case PLAN_AI_ENTRY.PARK:
      return {
        title: parkLabel ? `Planning ${parkLabel}` : 'Planning',
        subtitle: dateSubtitle || null,
        showSubHeader: true,
      };

    case PLAN_AI_ENTRY.ROAD_TRIP: {
      const parksHint = suggestText ? truncatePlainText(suggestText, 72) : null;
      return {
        title: "Let's plan a road trip",
        subtitle: parksHint || dateSubtitle || null,
        showSubHeader: true,
      };
    }

    case PLAN_AI_ENTRY.INTENT: {
      const guideTitle = intentContext?.title
        ? intentPlanAiHeaderTitle(intentContext.title)
        : 'Trip planning';
      return {
        title: guideTitle,
        subtitle: intentContext?.title
          ? truncatePlainText(`From ${intentContext.title}`, 72)
          : 'From our park picks guide',
        showSubHeader: true,
      };
    }

    case PLAN_AI_ENTRY.CHAT_HISTORY:
      return {
        title: parkLabel ? `Planning ${parkLabel}` : 'Your trip',
        subtitle: dateSubtitle || null,
        showSubHeader: true,
      };

    case PLAN_AI_ENTRY.GENERAL:
    default: {
      if (hasUserMessages && parkLabel) {
        return {
          title: `Planning ${parkLabel}`,
          subtitle: dateSubtitle || null,
          showSubHeader: true,
        };
      }
      return {
        title: 'Outdoor trip planning',
        subtitle: dateSubtitle || null,
        showSubHeader: true,
      };
    }
  }
}
