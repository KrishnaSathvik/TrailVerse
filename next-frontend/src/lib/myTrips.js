import { stripMarkdown, truncatePlainText } from '@/utils/stripMarkdown';

export const hasSavedItinerary = trip => Array.isArray(trip.plan?.days) && trip.plan.days.length > 0;
export const hasTripConversation = trip => Boolean(trip.conversationId || trip.conversation?.length || trip.messages?.length);
export const tripRecordId = trip => trip._id || trip.id;
export const tripWorkspaceHref = trip => `/plan-ai/${encodeURIComponent(tripRecordId(trip))}/plan`;
export const tripConversationHref = trip => `/plan-ai/${encodeURIComponent(tripRecordId(trip))}?chat=true`;

export function myTripTitle(trip) {
  if (trip.title && !['New Trip Plan', 'General Planning Session'].includes(trip.title)) return trip.title;
  const firstQuestion = (trip.conversation || trip.messages || []).find(message => message.role === 'user');
  return trip.parkName || truncatePlainText(firstQuestion?.content || '', 80) || 'Untitled conversation';
}

export function myTripPreview(trip) {
  const messages = trip.conversation || trip.messages || [];
  const lastMessage = [...messages].reverse().find(message => message.content && !message.hiddenFromUi);
  return truncatePlainText(trip.summary?.planPreview || lastMessage?.content || '', 140);
}

export function myTripDestination(trip) {
  return trip.plan?.destinations?.map(destination => destination?.name).filter(Boolean).join(' · ')
    || trip.parkName || trip.plan?.parkName || '';
}

export function selectMyTrips(trips, { kind = 'all', archived = false, search = '', sort = 'newest' } = {}) {
  const query = search.trim().toLowerCase();
  return trips.filter(trip => {
    if (!tripRecordId(trip) || ['deleted', 'temp'].includes(trip.status)) return false;
    if ((trip.status === 'archived') !== archived) return false;
    if (kind === 'saved' && !hasSavedItinerary(trip)) return false;
    if (kind === 'conversations' && hasSavedItinerary(trip)) return false;
    const searchable = [myTripTitle(trip), myTripDestination(trip), trip.parkCode, myTripPreview(trip), ...(trip.summary?.keyTopics || [])];
    return !query || stripMarkdown(searchable.filter(Boolean).join(' ')).toLowerCase().includes(query);
  }).sort((first, second) => {
    if (sort === 'park') return myTripDestination(first).localeCompare(myTripDestination(second));
    if (sort === 'messages') return (second.conversation?.length || second.summary?.totalMessages || 0) - (first.conversation?.length || first.summary?.totalMessages || 0);
    const firstTime = Date.parse(first.updatedAt || first.createdAt) || 0;
    const secondTime = Date.parse(second.updatedAt || second.createdAt) || 0;
    return sort === 'oldest' ? firstTime - secondTime : secondTime - firstTime;
  });
}
