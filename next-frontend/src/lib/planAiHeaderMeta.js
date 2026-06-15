import { truncatePlainText } from '@/utils/stripMarkdown';
import { MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE } from '@/lib/planAiWelcomeCopy';

export const PLAN_AI_ENTRY = {
  GENERAL: 'general',
  PARK: 'park',
  COMPARE: 'compare',
  ROAD_TRIP: 'road_trip',
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

function buildDateSubtitle(formData, currentPlan, isGenerating) {
  const dates = formatTripDates(formData);
  const dayCount = currentPlan?.days?.length || 0;
  const parts = [];
  if (dates) parts.push(dates);
  if (dayCount > 0) parts.push(`${dayCount}-day plan`);
  else if (formData?.groupSize > 1) parts.push(`${formData.groupSize} travelers`);
  if (parts.length) return parts.join(' · ');
  if (isGenerating) return 'Trailie is planning…';
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
  if (searchParams.get('suggest')?.trim()) return PLAN_AI_ENTRY.ROAD_TRIP;
  if (searchParams.get('from') === 'compare') return PLAN_AI_ENTRY.COMPARE;
  if (searchParams.get('park') && searchParams.get('name')) return PLAN_AI_ENTRY.PARK;
  return PLAN_AI_ENTRY.GENERAL;
}

/**
 * Shell title/subtitle for Plan AI — driven by entry source, not assistant reply text.
 */
export function derivePlanAiHeaderMeta({
  entryMode = PLAN_AI_ENTRY.GENERAL,
  isPersonalized = false,
  parkName = '',
  suggestText = '',
  formData = null,
  currentPlan = null,
  isGenerating = false,
  hasUserMessages = false,
}) {
  const mode =
    isPersonalized || entryMode === PLAN_AI_ENTRY.PERSONALIZED
      ? PLAN_AI_ENTRY.PERSONALIZED
      : entryMode;

  if (mode === PLAN_AI_ENTRY.PERSONALIZED) {
    return {
      title: 'My recommendations',
      subtitle: MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE,
      showSubHeader: true,
    };
  }

  const parkLabel = shortParkLabel(parkName);
  const dateSubtitle = buildDateSubtitle(formData, currentPlan, isGenerating);

  switch (mode) {
    case PLAN_AI_ENTRY.PARK:
      return {
        title: parkLabel ? `Planning ${parkLabel}` : 'Planning',
        subtitle:
          dateSubtitle ||
          (isGenerating ? 'Trailie is planning…' : 'Live NPS data when this park is in focus'),
        showSubHeader: true,
      };

    case PLAN_AI_ENTRY.COMPARE:
      return {
        title: 'Compare and plan trip',
        subtitle:
          parkLabel ||
          dateSubtitle ||
          (isGenerating ? 'Trailie is planning…' : null),
        showSubHeader: true,
      };

    case PLAN_AI_ENTRY.ROAD_TRIP: {
      const parksHint = suggestText ? truncatePlainText(suggestText, 72) : null;
      return {
        title: "Let's plan a road trip",
        subtitle: isGenerating ? 'Trailie is planning…' : parksHint,
        showSubHeader: true,
      };
    }

    case PLAN_AI_ENTRY.CHAT_HISTORY:
      return {
        title: parkLabel ? `Planning ${parkLabel}` : 'Your trip',
        subtitle: dateSubtitle || (isGenerating ? 'Trailie is planning…' : null),
        showSubHeader: true,
      };

    case PLAN_AI_ENTRY.GENERAL:
    default: {
      if (parkLabel && hasUserMessages && formData?.parkCode) {
        return {
          title: `Planning ${parkLabel}`,
          subtitle:
            dateSubtitle ||
            (isGenerating ? 'Trailie is planning…' : 'Live NPS data when this park is in focus'),
          showSubHeader: true,
        };
      }
      return {
        title: 'General planning',
        subtitle: isGenerating ? 'Trailie is planning…' : null,
        showSubHeader: true,
      };
    }
  }
}
