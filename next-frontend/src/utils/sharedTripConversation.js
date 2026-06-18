import parkSlugsData from '@/data/park-slugs.json';
import { parkToSlug, slugToParkCode } from '@/utils/parkSlug';
import { filterParkChatImages } from '@/utils/parkChatImages';

const GENERIC_TRIP_PARK_NAMES = new Set([
  'general planning',
  'general planning session',
  'national park',
  'new trip plan',
]);

function isGenericTripParkName(name) {
  if (!name?.trim()) return true;
  return GENERIC_TRIP_PARK_NAMES.has(name.trim().toLowerCase());
}

function lookupParkByLabel(label) {
  if (!label?.trim()) return null;

  const trimmed = label.trim();
  const slugCandidates = [
    trimmed,
    `${trimmed} National Park`,
    `${trimmed} National Park and Preserve`,
  ];

  for (const candidate of slugCandidates) {
    const slug = parkToSlug(candidate);
    const parkCode = slugToParkCode(slug);
    if (!parkCode) continue;
    const record = parkSlugsData.find((park) => park.parkCode === parkCode);
    return {
      name: record?.fullName || candidate,
      href: `/parks/${slug}`,
      parkCode,
      shortLabel: trimmed,
    };
  }

  const lower = trimmed.toLowerCase();
  const match =
    parkSlugsData.find(
      (park) =>
        park.fullName.toLowerCase().includes(lower) &&
        /national park/i.test(park.designation || park.fullName)
    ) || parkSlugsData.find((park) => park.fullName.toLowerCase().includes(lower));

  if (!match) return null;

  const slug = parkToSlug(match.fullName);
  if (!slugToParkCode(slug)) return null;

  return {
    name: match.fullName,
    href: `/parks/${slug}`,
    parkCode: match.parkCode,
    shortLabel: trimmed,
  };
}

/** Resolve a real park page for shared trips saved under generic titles like "General Planning". */
export function resolveSharedTripParkLink(trip) {
  const parkCode = trip?.formData?.parkCode?.toLowerCase?.();
  if (parkCode) {
    const record = parkSlugsData.find((park) => park.parkCode === parkCode);
    if (record) {
      const slug = parkToSlug(record.fullName);
      if (slugToParkCode(slug)) {
        return {
          name: record.fullName,
          href: `/parks/${slug}`,
          parkCode,
          shortLabel: record.fullName.replace(/\s+National Park.*$/i, '').trim(),
        };
      }
    }
  }

  for (const msg of [...(trip?.conversation || [])].reverse()) {
    const labels = msg.parkNames?.length ? msg.parkNames : msg.parkName ? [msg.parkName] : [];
    for (const label of labels) {
      const link = lookupParkByLabel(label);
      if (link) return link;
    }
  }

  if (!isGenericTripParkName(trip?.parkName)) {
    return lookupParkByLabel(trip.parkName);
  }

  return null;
}

export function resolveSharedTripHeadline(trip, featuredPark) {
  const title = trip?.title?.trim();
  if (title && !/^general planning session$/i.test(title)) {
    return title;
  }
  if (featuredPark?.shortLabel) {
    return `${featuredPark.shortLabel} Trip Plan`;
  }
  return title || 'Shared Trip Plan';
}

/** Last assistant reply looks cut off before Trailie’s usual wrap-up sections. */
export function sharedTripConversationMayBeIncomplete(conversation = []) {
  const lastAssistant = [...conversation].reverse().find((msg) => msg.role === 'assistant');
  if (!lastAssistant?.content) return false;
  if (lastAssistant.isStreaming || lastAssistant.isFinalizing) return true;

  const text = lastAssistant.content;
  const hasDayPlan = /##\s*Day\s+\d+/i.test(text);
  const hasWrapUp = /(Don't Forget|##\s*Costs|Best base|Enjoy your trip|Safe travels)/i.test(text);
  return hasDayPlan && !hasWrapUp && text.length > 1200;
}

export function resolveSharedByLabel(sharedBy) {
  if (!sharedBy) return 'A TrailVerse traveler';
  return sharedBy.firstName || sharedBy.name?.split(/\s+/)[0] || sharedBy.name || 'A TrailVerse traveler';
}

export { filterParkChatImages };
