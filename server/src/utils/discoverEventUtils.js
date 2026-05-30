const { stripHtml } = require('./discoverUtils');

function parseEventDate(event) {
  const raw = event.date || event.dates?.[0] || event.datestart;
  if (!raw) return null;
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatEventTime(event) {
  if (typeof event.times === 'string' && event.times.trim()) return event.times;
  if (Array.isArray(event.times) && event.times.length > 0) {
    const timeObj = event.times[0];
    if (timeObj?.timestart && timeObj?.timeend) return `${timeObj.timestart} - ${timeObj.timeend}`;
    if (timeObj?.timestart) return timeObj.timestart;
  }
  if (event.times && typeof event.times === 'object' && !Array.isArray(event.times)) {
    if (event.times.timestart && event.times.timeend) {
      return `${event.times.timestart} - ${event.times.timeend}`;
    }
    if (event.times.timestart) return event.times.timestart;
  }
  if (event.timeinfo?.trim()) return event.timeinfo.trim();
  if (event.isallday === 'true' || event.isallday === true) return 'All day';
  return 'Time TBD';
}

function inferEventCategory(event) {
  const typesText = Array.isArray(event.types)
    ? event.types.map((type) => String(type).toLowerCase()).join(' ')
    : '';
  const categoryText = String(event.category || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  const description = String(event.description || '').toLowerCase();
  const text = `${categoryText} ${typesText} ${title} ${description}`;

  if (text.includes('ranger') || text.includes('ranger program') || text.includes('ranger talk')) {
    return 'ranger-programs';
  }
  if (text.includes('workshop') || text.includes('class') || text.includes('photography')) {
    return 'workshops';
  }
  if (text.includes('festival') || text.includes('celebration')) return 'festivals';
  if (text.includes('tour') || text.includes('guided') || text.includes('walk') || text.includes('hike')) {
    return 'guided-tours';
  }
  if (text.includes('volunteer') || text.includes('cleanup')) return 'volunteer';
  if (text.includes('lecture') || text.includes('talk') || text.includes('presentation')) return 'lectures';
  if (text.includes('family') || text.includes('kids')) return 'family-programs';
  if (text.includes('cultural') || text.includes('heritage')) return 'cultural';
  return 'special-events';
}

function resolveParkCode(event, parkByCode) {
  const fromSite = (event.sitecode || event.parkCode || '').toLowerCase();
  if (fromSite && parkByCode.has(fromSite)) return fromSite;
  const name = (event.parkfullname || event.parkName || '').toLowerCase();
  if (!name) return fromSite || null;
  for (const [code, park] of parkByCode.entries()) {
    if (park.fullName?.toLowerCase() === name) return code;
  }
  return fromSite || null;
}

function normalizeDiscoverEvents(rawEvents = [], allParks = [], limit = 12) {
  const parkByCode = new Map(
    (allParks || []).map((park) => [park.parkCode?.toLowerCase(), park]).filter(([code]) => code)
  );

  const seen = new Set();
  const normalized = [];

  for (const event of rawEvents) {
    const id = event.id || event.eventid;
    const key = id || `${event.title}-${event.sitecode}-${event.date}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const parkCode = resolveParkCode(event, parkByCode);
    const matchedPark = parkCode ? parkByCode.get(parkCode) : null;
    const parkName =
      event.parkfullname ||
      event.parkName ||
      matchedPark?.fullName ||
      event.location ||
      'National Park Service';

    const date = parseEventDate(event);
    normalized.push({
      id: id || key,
      eventid: event.eventid || id,
      title: event.title || 'Untitled Event',
      description: stripHtml(event.description || ''),
      parkCode,
      parkName,
      category: inferEventCategory(event),
      date,
      time: formatEventTime(event),
      location: event.location || parkName || 'Location TBD',
      isFree: event.isfree === 'true' || event.isfree === true || !event.feeinfo,
      price:
        event.feeinfo && String(event.feeinfo).trim() !== '' ? String(event.feeinfo).trim() : 'Free',
      detailsUrl: event.infourl || `https://www.nps.gov/planyourvisit/event-details.htm?id=${id || event.eventid}`
    });
  }

  normalized.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return normalized.slice(0, limit);
}

function sampleParkCodesForEvents(parkCodes, maxSamples = 30) {
  const unique = [...new Set((parkCodes || []).map((c) => c?.toLowerCase()).filter(Boolean))];
  if (unique.length <= maxSamples) return unique;

  const picked = new Set();
  const step = Math.max(1, Math.floor(unique.length / maxSamples));
  for (let i = 0; i < unique.length && picked.size < maxSamples; i += step) {
    picked.add(unique[i]);
  }
  unique.slice(0, 12).forEach((code) => picked.add(code));
  return Array.from(picked).slice(0, maxSamples);
}

module.exports = {
  normalizeDiscoverEvents,
  sampleParkCodesForEvents,
  inferEventCategory,
  parseEventDate,
  formatEventTime
};
