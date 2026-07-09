/**
 * Fast structured itinerary planner for MCP plan_trip.
 * Deterministic scheduling with optional short AI description polish.
 */
const npsService = require('./npsService');
const enhancedParkService = require('./enhancedParkService');
const curatedStops = require('../data/fastPlannerStops.json');
const { trailieLiteComplete } = require('./trailieLiteLlm');

const DEFAULT_UNVERIFIED = [
  'campground availability',
  'permit inventory',
  'real-time parking capacity',
];

const DIFFICULTY_ORDER = ['easy', 'moderate', 'challenging', 'strenuous'];
const AI_REFINE_TIMEOUT_MS = Number(process.env.PLAN_ITINERARY_AI_REFINE_MS || 8000);

function createPlanError(code, message, field = null, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.field = field;
  err.statusCode = 400;
  Object.assign(err, extra);
  return err;
}

function normalizePlanRequest(body = {}) {
  const metadata = body.metadata || {};
  const form = metadata.formData || {};
  const revisionRequest = extractRevisionRequest(body.messages);

  return {
    parkCode: (metadata.parkCode || form.parkCode || '').toLowerCase() || null,
    parkName: metadata.parkName || form.parkName || null,
    startDate: form.startDate || null,
    travelMonth: form.travelMonth || null,
    numberOfDays: Number(form.numDays || form.days || form.numberOfDays) || null,
    adults: Number(form.adults || form.groupSize) || 1,
    children: Number(form.children) || 0,
    interests: Array.isArray(form.interests) ? form.interests : [],
    maxHikeMiles: form.maxHikeMiles != null ? Number(form.maxHikeMiles) : null,
    difficulty: Array.isArray(form.difficulty)
      ? form.difficulty.map((d) => String(d).toLowerCase())
      : form.fitnessLevel
        ? [String(form.fitnessLevel).toLowerCase()]
        : [],
    lodgingArea: form.lodgingArea || null,
    sunrise: Boolean(form.sunrise),
    sunset: Boolean(form.sunset),
    relaxedAfternoon: Boolean(form.relaxedAfternoon),
    revisionRequest,
    messages: Array.isArray(body.messages) ? body.messages : [],
    priorItinerary: metadata.priorItinerary || form.lastItinerary || null,
  };
}

function extractRevisionRequest(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content) return null;
  const text = String(lastUser.content).trim();
  if (/relaxed afternoon|make day|revise|change day|keep the rest/i.test(text)) {
    return text;
  }
  return null;
}

function validatePlanRequest(request) {
  if (request.revisionRequest) {
    if (!request.priorItinerary?.days?.length) {
      throw createPlanError(
        'SESSION_EXPIRED',
        'No stored itinerary found for revision. Start a new plan first.',
        'session_id'
      );
    }
    return;
  }

  if (!request.parkCode && !request.parkName) {
    throw createPlanError(
      'MISSING_PARK',
      'Provide park_code or park_name to plan a new itinerary.',
      'park_code'
    );
  }
  if (!request.numberOfDays) {
    throw createPlanError(
      'MISSING_NUMBER_OF_DAYS',
      'number_of_days is required for a new itinerary (1–14).',
      'number_of_days'
    );
  }
  if (!request.startDate && !request.travelMonth) {
    throw createPlanError(
      'MISSING_TRAVEL_DATE',
      'Provide start_date (YYYY-MM-DD) or travel_month for seasonal planning.',
      'start_date'
    );
  }
}

function allowedDifficulty(stopDifficulty, allowed = []) {
  if (!allowed.length) return true;
  const stopIdx = DIFFICULTY_ORDER.indexOf(stopDifficulty || 'easy');
  const maxAllowed = Math.max(
    ...allowed.map((d) => DIFFICULTY_ORDER.indexOf(d)).filter((i) => i >= 0)
  );
  return stopIdx <= maxAllowed;
}

function filterCandidateStops(parkCode, request) {
  const pool = [...(curatedStops[parkCode] || [])];
  return pool.filter((stop) => {
    if (stop.type === 'trail') {
      if (request.maxHikeMiles != null && stop.distanceMiles > request.maxHikeMiles) {
        return false;
      }
      if (!allowedDifficulty(stop.difficulty, request.difficulty)) {
        return false;
      }
    }
    return true;
  });
}

function scoreStop(stop, request, usedNames) {
  if (usedNames.has(stop.name)) return -1;
  let score = 1;
  for (const interest of request.interests) {
    if ((stop.tags || []).includes(interest)) score += 2;
  }
  if (request.sunrise && (stop.tags || []).includes('sunrise')) score += 3;
  if (request.sunset && (stop.tags || []).includes('sunset')) score += 3;
  if (stop.type === 'trail') score += 1;
  return score;
}

function makeStop(stop, order, startTime, extra = {}) {
  return {
    id: `stop-${order}`,
    order,
    type: stop.type || 'custom',
    name: stop.name,
    note: stop.why || '',
    startTime,
    duration: stop.durationMin || 60,
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    difficulty: stop.difficulty || null,
    distanceMiles: stop.distanceMiles ?? null,
    elevationGainFeet: stop.elevationGainFt ?? null,
    parkingNote: extra.parkingNote || null,
    why: stop.why || null,
    drivingTimeFromPreviousMin: extra.drivingTimeFromPreviousMin ?? null,
  };
}

function pickStopsForDay(candidates, request, usedNames, dayIndex, totalDays, relaxedAfternoon) {
  const picks = [];
  const add = (stop, startTime, extra) => {
    if (!stop || usedNames.has(stop.name)) return;
    picks.push(makeStop(stop, picks.length + 1, startTime, extra));
    usedNames.add(stop.name);
  };

  const ranked = [...candidates]
    .map((stop) => ({ stop, score: scoreStop(stop, request, usedNames) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  const sunriseStop = ranked.find((x) => (x.stop.tags || []).includes('sunrise'))?.stop;
  const sunsetStop = ranked.find((x) => (x.stop.tags || []).includes('sunset'))?.stop;
  const trailStops = ranked.filter((x) => x.stop.type === 'trail').map((x) => x.stop);
  const scenicStop = ranked.find((x) => x.stop.type === 'landmark')?.stop;
  const visitorStop = ranked.find((x) => x.stop.type === 'visitor_center')?.stop;

  if (dayIndex === 0 && visitorStop) {
    add(visitorStop, '8:30 AM');
  }

  if (request.sunrise && dayIndex === 0 && sunriseStop) {
    add(sunriseStop, '6:15 AM', { parkingNote: 'Arrive early — popular sunrise pull-offs fill quickly.' });
  } else if (trailStops[0]) {
    add(trailStops[0], '8:30 AM');
  }

  add(
    {
      name: 'Lunch break',
      type: 'restaurant',
      durationMin: 60,
      why: request.lodgingArea
        ? `Meal near ${request.lodgingArea}.`
        : 'Built-in meal and rest block.',
    },
    '12:30 PM'
  );

  if (relaxedAfternoon) {
    add(
      {
        name: 'Relaxed afternoon',
        type: 'custom',
        durationMin: 150,
        why: 'Light afternoon with fewer stops — scenic driving or rest as you prefer.',
      },
      '2:00 PM'
    );
    if (scenicStop) add(scenicStop, '4:00 PM');
  } else if (trailStops[1]) {
    add(trailStops[1], '2:00 PM');
  } else if (scenicStop) {
    add(scenicStop, '2:30 PM');
  }

  if (request.sunset && sunsetStop) {
    add(sunsetStop, '6:45 PM', { parkingNote: 'Sunset timing varies — adjust on the day.' });
  }

  return picks;
}

function buildDeterministicItinerary({
  parkCode,
  parkName,
  request,
  alerts = [],
  weather = null,
  events = [],
}) {
  const usedNames = new Set();
  const candidates = filterCandidateStops(parkCode, request);
  if (!candidates.length) {
    throw createPlanError(
      'NO_SUITABLE_STOPS',
      `Could not build an itinerary for ${parkName || parkCode} with the given hike constraints.`,
      'max_hike_miles'
    );
  }

  const days = [];
  for (let i = 0; i < request.numberOfDays; i += 1) {
    const relaxed = request.relaxedAfternoon && (i === 1 || (request.numberOfDays === 1 && i === 0));
    const stops = pickStopsForDay(
      candidates,
      request,
      usedNames,
      i,
      request.numberOfDays,
      relaxed
    );
    const drivingMinutes = Math.max(30, stops.filter((s) => s.type === 'trail').length * 25);
    days.push({
      id: `day-${i + 1}`,
      dayNumber: i + 1,
      label: `Day ${i + 1}`,
      stops,
      estimatedDrivingMinutes: drivingMinutes,
      bufferMinutes: 60,
    });
  }

  const criticalNotices = alerts
    .slice(0, 4)
    .map((a) => a.title || a.description)
    .filter(Boolean);

  const unverified = [...DEFAULT_UNVERIFIED];
  if (!weather) unverified.push('weather forecast');
  if (!events.length) unverified.push('scheduled ranger programs');

  return {
    parkCode,
    parkName,
    days,
    criticalNotices,
    unverified,
    liveDataTimestamps: {
      weather: weather?.fetchedAt || null,
      alerts: alerts.length ? new Date().toISOString() : null,
      events: events.length ? new Date().toISOString() : null,
    },
  };
}

function applyRevision(priorItinerary, revisionRequest) {
  const itinerary = JSON.parse(JSON.stringify(priorItinerary));
  const dayMatch = revisionRequest.match(/day\s*(\d+)/i);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : 2;
  const day = itinerary.days.find((d) => d.dayNumber === dayNumber);
  if (!day) return itinerary;

  const keep = (day.stops || []).filter((s) => {
    const hour = parseHour(s.startTime);
    return hour != null && hour < 12;
  });
  keep.push({
    id: `stop-relaxed-${dayNumber}`,
    order: keep.length + 1,
    type: 'custom',
    name: 'Relaxed afternoon',
    note: 'Kept morning plans; afternoon left open per your revision request.',
    startTime: '1:30 PM',
    duration: 180,
    latitude: null,
    longitude: null,
    difficulty: null,
    drivingTimeFromPreviousMin: null,
  });
  const evening = (day.stops || []).filter((s) => {
    const hour = parseHour(s.startTime);
    return hour != null && hour >= 17;
  });
  day.stops = [...keep, ...evening].map((s, idx) => ({ ...s, order: idx + 1 }));
  day.bufferMinutes = 90;
  return itinerary;
}

function parseHour(startTime) {
  if (!startTime) return null;
  const match = String(startTime).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = (match[3] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour;
}

async function fetchPlannerData(parkCode, timing) {
  const stageStart = Date.now();
  let park = null;
  try {
    park = await npsService.getParkByCode(parkCode);
  } catch {
    park = null;
  }

  const results = await Promise.allSettled([
    Promise.resolve(park),
    npsService.getParkAlerts(parkCode),
    park ? enhancedParkService.getWeatherData(park) : Promise.resolve(null),
    npsService.getEventsByPark(parkCode),
  ]);
  timing.stages.dataFetchMs = Date.now() - stageStart;

  const [detailsRes, alertsRes, weatherRes, eventsRes] = results;
  const details = detailsRes.status === 'fulfilled' ? detailsRes.value : null;
  const alertsRaw = alertsRes.status === 'fulfilled' ? alertsRes.value : null;
  const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
  const eventsRaw = eventsRes.status === 'fulfilled' ? eventsRes.value : null;

  const parkName = details?.fullName || details?.name || parkCode.toUpperCase();
  const alerts = Array.isArray(alertsRaw?.data)
    ? alertsRaw.data
    : Array.isArray(alertsRaw)
      ? alertsRaw
      : [];
  const events = Array.isArray(eventsRaw?.data) ? eventsRaw.data : Array.isArray(eventsRaw) ? eventsRaw : [];

  return {
    parkName,
    alerts,
    weather: weather ? { ...weather, fetchedAt: new Date().toISOString() } : null,
    events,
  };
}

async function maybeRefineNarrative(itinerary, request, timing) {
  const stageStart = Date.now();
  const summary = itinerary.days
    .map((day) => `${day.label}: ${day.stops.map((s) => s.name).join(', ')}`)
    .join('\n');

  const refinePromise = trailieLiteComplete({
    system:
      'You are Trailie. Write a concise 120-word trip intro for a national park itinerary. Do not invent bookings, permits, or availability.',
    user: `Park: ${itinerary.parkName}\nTravelers: ${request.adults} adults\nDays: ${request.numberOfDays}\nPlan:\n${summary}`,
    maxTokens: 180,
  });

  let narrative = `**${request.numberOfDays}-day ${itinerary.parkName} plan** — built from live park data with your hike and photography constraints.`;
  try {
    const result = await Promise.race([
      refinePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), AI_REFINE_TIMEOUT_MS)),
    ]);
    if (result?.text) narrative = result.text;
    timing.stages.aiRefineMs = Date.now() - stageStart;
    timing.stages.aiRefineUsed = Boolean(result?.text);
  } catch {
    timing.stages.aiRefineMs = Date.now() - stageStart;
    timing.stages.aiRefineUsed = false;
  }
  return narrative;
}

function renderProse(itinerary, narrative) {
  const lines = [narrative, '', '**At a glance**', ''];
  for (const day of itinerary.days) {
    lines.push(`**${day.label}**`);
    for (const stop of day.stops) {
      lines.push(`- **${stop.name}**${stop.note ? ` — ${stop.note}` : ''}`);
    }
    lines.push('');
  }
  if (itinerary.criticalNotices?.length) {
    lines.push('**Critical notices**');
    for (const notice of itinerary.criticalNotices) lines.push(`- ${notice}`);
    lines.push('');
  }
  lines.push('**Unverified** — confirm before booking: ' + itinerary.unverified.join(', '));
  return lines.join('\n').trim();
}

async function resolveParkCode(request) {
  if (request.parkCode && /^[a-z0-9]{2,10}$/.test(request.parkCode)) {
    return request.parkCode;
  }
  throw createPlanError(
    'UNKNOWN_PARK',
    `Could not resolve park '${request.parkCode || request.parkName}' to a known NPS code.`,
    'park_code'
  );
}

async function executePlanItineraryRequest(req) {
  const timing = { startedAt: Date.now(), stages: {} };
  const body = req.body || {};
  const request = normalizePlanRequest(body);
  validatePlanRequest(request);

  if (request.revisionRequest) {
    const revised = applyRevision(request.priorItinerary, request.revisionRequest);
    const narrative = `Updated your plan: ${request.revisionRequest}`;
    timing.totalMs = Date.now() - timing.startedAt;
    return {
      content: renderProse(revised, narrative),
      itinerary: { parkCode: revised.parkCode, parkName: revised.parkName, days: revised.days },
      parkCode: revised.parkCode,
      parkName: revised.parkName,
      criticalNotices: revised.criticalNotices || [],
      unverified: revised.unverified || DEFAULT_UNVERIFIED,
      hasItinerary: true,
      plannerMode: 'revision',
      timing: req.query?.debug === '1' ? timing : undefined,
    };
  }

  const parkCode = await resolveParkCode(request);
  const { parkName, alerts, weather, events } = await fetchPlannerData(parkCode, timing);

  const buildStart = Date.now();
  const built = buildDeterministicItinerary({
    parkCode,
    parkName,
    request,
    alerts,
    weather,
    events,
  });
  timing.stages.deterministicBuildMs = Date.now() - buildStart;

  const narrative = await maybeRefineNarrative(built, request, timing);
  const content = renderProse(built, narrative);
  timing.totalMs = Date.now() - timing.startedAt;

  return {
    content,
    itinerary: {
      parkCode: built.parkCode,
      parkName: built.parkName,
      days: built.days,
    },
    parkCode: built.parkCode,
    parkName: built.parkName,
    criticalNotices: built.criticalNotices,
    unverified: built.unverified,
    liveDataTimestamps: built.liveDataTimestamps,
    hasItinerary: true,
    plannerMode: 'deterministic',
    timing: req.query?.debug === '1' ? timing : undefined,
  };
}

module.exports = {
  executePlanItineraryRequest,
  normalizePlanRequest,
  validatePlanRequest,
  buildDeterministicItinerary,
  applyRevision,
  filterCandidateStops,
  DEFAULT_UNVERIFIED,
};
