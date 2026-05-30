import { htmlToPlainText } from '@/utils/htmlUtils';
import { sanitizeNpsImageUrl } from '@/utils/webcamUtils';

export function getFacilityImage(facility) {
  const raw = facility?.images?.[0]?.url;
  const url = sanitizeNpsImageUrl(raw);
  if (!url) return null;
  return {
    url,
    alt: facility.images[0].altText || facility.placeName || facility.name || 'Amenity location',
  };
}

export function getFacilityExcerpt(facility, maxLen = 280) {
  const text = htmlToPlainText(facility?.description || '')?.trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** Build filter tabs for amenity types (Restroom, Trailhead, etc.). */
export function buildAmenityTabs(facilities, maxTabs = 12) {
  if (!Array.isArray(facilities) || facilities.length === 0) {
    return { tabs: [], topNames: [] };
  }

  const counts = new Map();
  for (const item of facilities) {
    const name = item.name?.trim() || 'Other';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const topNames = sorted.slice(0, maxTabs).map(([name]) => name);
  const topSet = new Set(topNames);
  const otherCount = sorted
    .filter(([name]) => !topSet.has(name))
    .reduce((sum, [, count]) => sum + count, 0);

  const tabs = [
    { id: 'All', name: 'All', count: facilities.length },
    ...topNames.map((name) => ({ id: name, name, count: counts.get(name) || 0 })),
  ];

  if (otherCount > 0) {
    tabs.push({ id: 'Other', name: 'Other', count: otherCount });
  }

  return { tabs, topNames };
}

export function filterFacilitiesByTab(facilities, tabId, topNames = []) {
  if (!Array.isArray(facilities)) return [];
  if (!tabId || tabId === 'All') return facilities;
  if (tabId === 'Other') {
    const topSet = new Set(topNames);
    return facilities.filter((item) => !topSet.has(item.name));
  }
  return facilities.filter((item) => item.name === tabId);
}
