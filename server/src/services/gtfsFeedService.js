const unzipper = require('unzipper');
const { parse } = require('csv-parse/sync');

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_MAX = 80; // enough for multi-feed parks with headroom

function parseCsv(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });
}

function asDateYmd(dateStr) {
  // GTFS uses YYYYMMDD
  const s = String(dateStr || '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function utcTodayYmd() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function weekdayKeyUtc() {
  const day = new Date().getUTCDay(); // 0 Sun .. 6 Sat
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day];
}

function computeServiceToday({ calendarRows = [], calendarDateRows = [] }) {
  const todayYmd = utcTodayYmd();
  const wk = weekdayKeyUtc();

  const added = new Set();
  const removed = new Set();
  for (const r of calendarDateRows) {
    if (!r?.service_id || !r?.date || !r?.exception_type) continue;
    if (String(r.date).trim() !== todayYmd) continue;
    const type = String(r.exception_type).trim();
    if (type === '1') added.add(String(r.service_id));
    if (type === '2') removed.add(String(r.service_id));
  }

  let active = 0;
  for (const r of calendarRows) {
    const serviceId = String(r?.service_id || '').trim();
    if (!serviceId) continue;
    const start = asDateYmd(r.start_date);
    const end = asDateYmd(r.end_date);
    const today = asDateYmd(todayYmd);
    if (!today) continue;

    const inRange = (!start || start <= today) && (!end || end >= today);
    const weekdayOn = String(r?.[wk] || '').trim() === '1';

    let on = inRange && weekdayOn;
    if (removed.has(serviceId)) on = false;
    if (added.has(serviceId)) on = true;

    if (on) active += 1;
  }

  if (added.size > 0 && active === 0) {
    // Some feeds omit calendar.txt and only use calendar_dates.txt.
    active = added.size;
  }

  return {
    todayYmd,
    weekday: wk,
    activeServiceCount: active,
    hasService: active > 0,
  };
}

async function unzipGtfsZip(buffer) {
  const directory = await unzipper.Open.buffer(buffer);
  const files = new Map();

  for (const file of directory.files) {
    if (file.type !== 'File') continue;
    const name = String(file.path || '').split('/').pop();
    if (!name) continue;
    if (!name.toLowerCase().endsWith('.txt')) continue;
    const content = await file.buffer();
    files.set(name.toLowerCase(), content.toString('utf-8'));
  }

  return files;
}

function buildRouteStopSummary({ routesRows = [], tripsRows = [], stopTimesRows = [], stopsRows = [] }) {
  // Minimal: list routes + a few stop names found on a representative trip per route.
  const routesById = new Map(routesRows.map((r) => [String(r.route_id), r]));
  const stopsById = new Map(stopsRows.map((s) => [String(s.stop_id), s]));

  const tripsByRoute = new Map();
  for (const t of tripsRows) {
    const routeId = String(t?.route_id || '');
    const tripId = String(t?.trip_id || '');
    if (!routeId || !tripId) continue;
    if (!tripsByRoute.has(routeId)) tripsByRoute.set(routeId, []);
    tripsByRoute.get(routeId).push(t);
  }

  const stopTimesByTrip = new Map();
  for (const st of stopTimesRows) {
    const tripId = String(st?.trip_id || '');
    if (!tripId) continue;
    if (!stopTimesByTrip.has(tripId)) stopTimesByTrip.set(tripId, []);
    stopTimesByTrip.get(tripId).push(st);
  }
  for (const [tripId, arr] of stopTimesByTrip) {
    arr.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }

  const routes = [];
  for (const [routeId, route] of routesById) {
    const routeTrips = tripsByRoute.get(routeId) || [];
    const sampleTrip = routeTrips[0];
    const sampleStops = [];
    const allStops = [];
    const stopPoints = [];
    if (sampleTrip) {
      const times = stopTimesByTrip.get(String(sampleTrip.trip_id)) || [];
      let lastStopName = null;
      for (const entry of times) {
        const stop = stopsById.get(String(entry.stop_id));
        const stopName = stop?.stop_name ? String(stop.stop_name) : null;
        if (!stopName) continue;
        // Avoid duplicates when GTFS repeats same stop_id sequences.
        if (stopName === lastStopName) continue;
        lastStopName = stopName;
        allStops.push(stopName);
        stopPoints.push({ stopId: String(entry.stop_id || ''), stopName });
        if (sampleStops.length < 5) sampleStops.push(stopName);
      }
    }

    routes.push({
      routeId,
      shortName: route?.route_short_name || '',
      longName: route?.route_long_name || '',
      description: route?.route_desc || '',
      type: route?.route_type || '',
      url: route?.route_url || '',
      keyStops: sampleStops,
      stops: allStops,
      stopPoints,
      tripSampleCount: routeTrips.length,
    });
  }

  routes.sort((a, b) => (a.longName || a.shortName).localeCompare(b.longName || b.shortName));
  return { routes };
}

function parseGtfstimeToSeconds(value) {
  // HH:MM:SS (can be 24+ hours)
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}|\d{3,}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if ([h, mm, ss].some((n) => Number.isNaN(n))) return null;
  return h * 3600 + mm * 60 + ss;
}

function secondsSinceMidnightInTimeZone(timeZone) {
  // Use Intl to safely compute local time in the GTFS timezone.
  // This avoids guessing from server timezone.
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const h = Number(map.hour);
    const m = Number(map.minute);
    const s = Number(map.second);
    if ([h, m, s].some((n) => Number.isNaN(n))) return null;
    return h * 3600 + m * 60 + s;
  } catch {
    return null;
  }
}

function formatSecondsAsTime(seconds) {
  if (seconds == null) return null;
  const s = Math.max(0, Number(seconds));
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABEL = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function parseCatalogValidThrough(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUtcDateLabel(date) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function todayYmdInTimeZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const map = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
    );
    return `${map.year}${map.month}${map.day}`;
  } catch {
    return utcTodayYmd();
  }
}

function formatScheduleDateLabel(timeZone) {
  const tz = timeZone || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date());
  }
}

function formatMonthDayLabel(date, timeZone) {
  if (!date) return null;
  const tz = timeZone || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    }).format(date);
  } catch {
    return formatUtcDateLabel(date);
  }
}

function buildScheduleDateFields(agencyTimeZone) {
  const timeZone = agencyTimeZone || 'UTC';
  return {
    scheduleDateYmd: todayYmdInTimeZone(timeZone),
    scheduleDateLabel: formatScheduleDateLabel(timeZone),
  };
}

function hhmmToSeconds(hhmm) {
  const parts = String(hhmm || '').split(':').map((part) => Number(part));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 3600 + parts[1] * 60;
}

function formatTime12h(hhmm) {
  const seconds = hhmmToSeconds(hhmm);
  if (seconds == null) return null;
  const h24 = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatOperatingWeekdays(weekdays) {
  const active = WEEKDAY_ORDER.filter((day) => weekdays.includes(day));
  if (active.length === 0) return null;
  if (active.length === 7) return 'Daily';

  const groups = [];
  let start = 0;
  for (let i = 1; i <= active.length; i += 1) {
    const prevIdx = WEEKDAY_ORDER.indexOf(active[i - 1]);
    const currIdx = i < active.length ? WEEKDAY_ORDER.indexOf(active[i]) : -1;
    if (i < active.length && currIdx === prevIdx + 1) continue;
    const slice = active.slice(start, i);
    if (slice.length === 1) {
      groups.push(WEEKDAY_LABEL[slice[0]]);
    } else {
      groups.push(`${WEEKDAY_LABEL[slice[0]]}–${WEEKDAY_LABEL[slice[slice.length - 1]]}`);
    }
    start = i;
  }
  return groups.join(', ');
}

function computeSeasonFromCalendar(calendarRows = []) {
  let seasonStart = null;
  let seasonEnd = null;
  const operatingWeekdays = new Set();

  for (const row of calendarRows) {
    const start = asDateYmd(row.start_date);
    const end = asDateYmd(row.end_date);
    if (start && (!seasonStart || start < seasonStart)) seasonStart = start;
    if (end && (!seasonEnd || end > seasonEnd)) seasonEnd = end;
    for (const day of WEEKDAY_ORDER) {
      if (String(row?.[day] || '').trim() === '1') operatingWeekdays.add(day);
    }
  }

  return {
    seasonStart,
    seasonEnd,
    operatingWeekdays: [...operatingWeekdays],
  };
}

function formatHeadwayMinutes(medianMinutes) {
  const m = Number(medianMinutes);
  if (!m || m < 5 || m > 240) return null;
  const rounded = Math.round(m / 5) * 5;
  if (rounded < 60) return `About every ${rounded} min`;
  const hours = Math.round(rounded / 60);
  return hours === 1 ? 'About every hour' : `About every ${hours} hours`;
}

function computeFrequencyLabelFromDepartures(departureSecondsList = []) {
  if (!Array.isArray(departureSecondsList) || departureSecondsList.length < 3) return null;
  const sorted = [...departureSecondsList].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gapMinutes = (sorted[i] - sorted[i - 1]) / 60;
    if (gapMinutes >= 5 && gapMinutes <= 180) gaps.push(gapMinutes);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return formatHeadwayMinutes(median);
}

function computeFeedFrequencyLabel(routes = []) {
  const medians = [];
  for (const route of routes) {
    const label = route?.frequencyLabel;
    if (!label) continue;
    const match = label.match(/every (\d+) min/i);
    if (match) medians.push(Number(match[1]));
  }
  if (medians.length === 0) {
    const labels = [...new Set(routes.map((r) => r.frequencyLabel).filter(Boolean))];
    return labels.length === 1 ? labels[0] : null;
  }
  medians.sort((a, b) => a - b);
  const min = medians[0];
  const max = medians[medians.length - 1];
  if (min === max) return formatHeadwayMinutes(min);
  return `About every ${min}–${max} min`;
}

function computeTodayServiceWindow(routes = []) {
  let firstSeconds = null;
  let lastSeconds = null;

  for (const route of routes) {
    const schedule = route?.todaySchedule;
    if (!schedule) continue;
    const first = hhmmToSeconds(schedule.firstDeparture);
    const last = hhmmToSeconds(schedule.lastDeparture);
    if (first != null && (firstSeconds == null || first < firstSeconds)) firstSeconds = first;
    if (last != null && (lastSeconds == null || last > lastSeconds)) lastSeconds = last;
  }

  if (firstSeconds == null && lastSeconds == null) return null;

  return {
    firstDeparture: formatSecondsAsTime(firstSeconds),
    lastDeparture: formatSecondsAsTime(lastSeconds),
    firstDeparture12h: formatTime12h(formatSecondsAsTime(firstSeconds)),
    lastDeparture12h: formatTime12h(formatSecondsAsTime(lastSeconds)),
  };
}

function computeTransitOperating({ serviceToday, agencyTimeZone, routes = [], season, validThrough, notes }) {
  const seasonInfo = season || { seasonStart: null, seasonEnd: null, operatingWeekdays: [] };
  const today = asDateYmd(utcTodayYmd());
  const todayWindow = computeTodayServiceWindow(routes);
  const operatingDaysLabel = formatOperatingWeekdays(seasonInfo.operatingWeekdays);
  const hasActiveServiceToday = Boolean(serviceToday?.hasService);

  // NPS catalog "Valid Through" is when the GTFS zip was published, not the last operating day.
  const catalogEnd = parseCatalogValidThrough(validThrough);
  const catalogExpired = Boolean(catalogEnd && today && today > catalogEnd);
  const gtfsSeasonEnd = seasonInfo.seasonEnd;
  const notesText = String(notes || '').trim();
  const notesSayEnded = /concluded|ended|closed|not operating|suspended|off season/i.test(notesText);
  const daysPastGtfsSeasonEnd = gtfsSeasonEnd && today
    ? Math.floor((today.getTime() - gtfsSeasonEnd.getTime()) / 86400000)
    : null;

  let seasonStatus = 'unknown';
  if (seasonInfo.seasonStart && today && today < seasonInfo.seasonStart) {
    seasonStatus = 'not_started';
  } else if (gtfsSeasonEnd && today && today > gtfsSeasonEnd && !hasActiveServiceToday) {
    seasonStatus = 'ended';
  } else if (gtfsSeasonEnd && today && today <= gtfsSeasonEnd) {
    seasonStatus = 'in_season';
  } else if (seasonInfo.seasonStart || gtfsSeasonEnd) {
    seasonStatus = 'in_season';
  }

  let serviceStatus = 'unknown';
  if (catalogExpired && !hasActiveServiceToday) {
    // Expired GTFS file — do not claim "season ended" (ROMO/STLI often still run per NPS).
    serviceStatus = 'schedule_unavailable';
  } else if (seasonStatus === 'ended' && !hasActiveServiceToday && (notesSayEnded || (daysPastGtfsSeasonEnd != null && daysPastGtfsSeasonEnd > 21))) {
    serviceStatus = 'season_ended';
  } else if (seasonStatus === 'not_started') {
    serviceStatus = 'season_not_started';
  } else if (!hasActiveServiceToday) {
    serviceStatus = 'not_running_today';
  } else if (todayWindow) {
    serviceStatus = 'running_today';
  } else {
    serviceStatus = 'scheduled_check_nps';
  }

  const seasonStartLabel = formatUtcDateLabel(seasonInfo.seasonStart);
  const seasonEndLabel = formatUtcDateLabel(gtfsSeasonEnd) || null;
  const gtfsDataThroughLabel = validThrough || null;
  const endedLabel = seasonEndLabel || gtfsDataThroughLabel || null;

  let headline = 'Shuttle schedule varies';
  let detail = null;

  const frequencyLabel = computeFeedFrequencyLabel(routes);
  const scheduleDate = buildScheduleDateFields(agencyTimeZone);

  if (serviceStatus === 'schedule_unavailable') {
    headline = 'Check NPS for current hours';
    detail = 'Schedule data may be outdated in our app. Confirm hours on the official NPS page.';
  } else if (serviceStatus === 'season_ended') {
    headline = 'Season ended';
    detail = endedLabel
      ? `Service ended ${endedLabel}. Check NPS for next season.`
      : 'This shuttle system is not running for the season.';
  } else if (serviceStatus === 'season_not_started') {
    headline = 'Season not started';
    detail = seasonStartLabel ? `Service expected to begin ${seasonStartLabel}.` : 'Service has not started for the season yet.';
  } else if (serviceStatus === 'not_running_today') {
    headline = 'Not running today';
    const weekday = serviceToday?.weekday
      ? `${serviceToday.weekday.slice(0, 1).toUpperCase()}${serviceToday.weekday.slice(1)}`
      : 'Today';
    detail = operatingDaysLabel
      ? `${weekday} is outside scheduled service (${operatingDaysLabel}).`
      : `${weekday} has no scheduled shuttle service.`;
  } else if (serviceStatus === 'running_today' && todayWindow) {
    headline = 'Running today';
    detail = todayWindow.firstDeparture12h === todayWindow.lastDeparture12h
      ? `Today's service: ${todayWindow.firstDeparture12h}`
      : `Today's service: ${todayWindow.firstDeparture12h} – ${todayWindow.lastDeparture12h}`;
    if (operatingDaysLabel && operatingDaysLabel !== 'Daily') {
      detail = `${detail} · ${operatingDaysLabel}`;
    }
  } else {
    headline = serviceToday?.hasService ? 'Scheduled today' : 'Not running today';
    detail = operatingDaysLabel
      ? `Typical service days: ${operatingDaysLabel}. Confirm times on NPS.`
      : 'Confirm operating hours on the official NPS page.';
  }

  return {
    timeZone: agencyTimeZone || null,
    seasonStatus,
    serviceStatus,
    seasonStartLabel,
    seasonEndLabel,
    gtfsDataThroughLabel,
    catalogValidThrough: validThrough || null,
    catalogExpired,
    operatingDaysLabel,
    todayWindow,
    frequencyLabel,
    scheduleDateYmd: scheduleDate.scheduleDateYmd,
    scheduleDateLabel: scheduleDate.scheduleDateLabel,
    headline,
    detail,
    is24x7: false,
  };
}

function computeActiveServiceIds({ calendarRows = [], calendarDateRows = [] }) {
  const todayYmd = utcTodayYmd();
  const wk = weekdayKeyUtc();

  const added = new Set();
  const removed = new Set();
  for (const r of calendarDateRows) {
    if (!r?.service_id || !r?.date || !r?.exception_type) continue;
    if (String(r.date).trim() !== todayYmd) continue;
    const type = String(r.exception_type).trim();
    if (type === '1') added.add(String(r.service_id));
    if (type === '2') removed.add(String(r.service_id));
  }

  const active = new Set();
  const today = asDateYmd(todayYmd);
  for (const r of calendarRows) {
    const serviceId = String(r?.service_id || '').trim();
    if (!serviceId) continue;
    const start = asDateYmd(r.start_date);
    const end = asDateYmd(r.end_date);
    if (!today) continue;

    const inRange = (!start || start <= today) && (!end || end >= today);
    const weekdayOn = String(r?.[wk] || '').trim() === '1';

    let on = inRange && weekdayOn;
    if (removed.has(serviceId)) on = false;
    if (added.has(serviceId)) on = true;

    if (on) active.add(serviceId);
  }

  if (active.size === 0 && added.size > 0) {
    for (const id of added) active.add(id);
  }

  return { todayYmd, weekday: wk, activeServiceIds: active };
}

/** Some NPS GTFS feeds use a calendar service_id that has no trips; trips use other ids. */
function resolveActiveServiceIdsForTrips({ calendarRows = [], calendarDateRows = [], tripsRows = [] }) {
  const base = computeActiveServiceIds({ calendarRows, calendarDateRows });
  const tripServiceIds = new Set(
    tripsRows.map((t) => String(t?.service_id || '').trim()).filter(Boolean)
  );
  if (tripServiceIds.size === 0) return base;

  const matched = new Set();
  for (const id of base.activeServiceIds) {
    if (tripServiceIds.has(id)) matched.add(id);
  }

  if (matched.size === 0 && base.activeServiceIds.size > 0) {
    for (const id of tripServiceIds) matched.add(id);
  }

  return { ...base, activeServiceIds: matched };
}

function computeNextDeparture({
  agencyTimeZone,
  stopsRows = [],
  tripsRows = [],
  stopTimesRows = [],
  calendarRows = [],
  calendarDateRows = [],
  routesRows = [],
}) {
  const timeZone = agencyTimeZone || 'UTC';
  const nowSeconds = secondsSinceMidnightInTimeZone(timeZone);
  if (nowSeconds == null) return null;

  const { activeServiceIds } = resolveActiveServiceIdsForTrips({
    calendarRows,
    calendarDateRows,
    tripsRows,
  });
  if (activeServiceIds.size === 0) return null;

  const stopNameById = new Map(stopsRows.map((s) => [String(s.stop_id), String(s.stop_name || '')]));
  const routeById = new Map(routesRows.map((r) => [String(r.route_id), r]));

  const tripById = new Map();
  for (const t of tripsRows) {
    const tripId = String(t?.trip_id || '');
    const serviceId = String(t?.service_id || '');
    if (!tripId || !serviceId) continue;
    if (!activeServiceIds.has(serviceId)) continue;
    tripById.set(tripId, t);
  }
  if (tripById.size === 0) return null;

  let best = null; // { depSeconds, trip, stopId }
  for (const st of stopTimesRows) {
    const tripId = String(st?.trip_id || '');
    const trip = tripById.get(tripId);
    if (!trip) continue;

    const depSeconds = parseGtfstimeToSeconds(st.departure_time);
    if (depSeconds == null) continue;
    if (depSeconds < nowSeconds) continue;

    if (!best || depSeconds < best.depSeconds) {
      best = { depSeconds, trip, stopId: String(st.stop_id || '') };
    }
  }

  if (!best) return null;

  const route = routeById.get(String(best.trip.route_id || ''));
  const routeName = route?.route_long_name || route?.route_short_name || '';
  const stopName = stopNameById.get(best.stopId) || '';

  return {
    timeZone,
    departureSeconds: best.depSeconds,
    departureTime: formatSecondsAsTime(best.depSeconds),
    routeId: String(best.trip.route_id || ''),
    routeName,
    stopId: best.stopId,
    stopName,
  };
}

function computeNextDepartureByRoute({
  agencyTimeZone,
  stopsRows = [],
  tripsRows = [],
  stopTimesRows = [],
  calendarRows = [],
  calendarDateRows = [],
  routesRows = [],
}) {
  const timeZone = agencyTimeZone || 'UTC';
  const nowSeconds = secondsSinceMidnightInTimeZone(timeZone);
  if (nowSeconds == null) return new Map();

  const { activeServiceIds } = resolveActiveServiceIdsForTrips({
    calendarRows,
    calendarDateRows,
    tripsRows,
  });
  if (activeServiceIds.size === 0) return new Map();

  const stopNameById = new Map(stopsRows.map((s) => [String(s.stop_id), String(s.stop_name || '')]));
  const routeById = new Map(routesRows.map((r) => [String(r.route_id), r]));

  // Keep only trips active today
  const tripById = new Map();
  for (const t of tripsRows) {
    const tripId = String(t?.trip_id || '');
    const serviceId = String(t?.service_id || '');
    if (!tripId || !serviceId) continue;
    if (!activeServiceIds.has(serviceId)) continue;
    tripById.set(tripId, t);
  }
  if (tripById.size === 0) return new Map();

  // Find the first stop_time per trip (start stop)
  const firstStopTimeByTrip = new Map(); // tripId -> { depSeconds, stopId }
  for (const st of stopTimesRows) {
    const tripId = String(st?.trip_id || '');
    if (!tripById.has(tripId)) continue;
    const seq = Number(st?.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const depSeconds = parseGtfstimeToSeconds(st.departure_time);
    if (depSeconds == null) continue;

    const existing = firstStopTimeByTrip.get(tripId);
    if (!existing || seq < existing.seq) {
      firstStopTimeByTrip.set(tripId, { seq, depSeconds, stopId: String(st.stop_id || '') });
    }
  }

  // Next upcoming departure + first/last departure today per route
  const bestByRoute = new Map(); // routeId -> { depSeconds, stopId }
  const todayRangeByRoute = new Map(); // routeId -> { firstSeconds, lastSeconds }
  const departuresByRoute = new Map(); // routeId -> number[]

  for (const [tripId, fst] of firstStopTimeByTrip) {
    const trip = tripById.get(tripId);
    const routeId = String(trip?.route_id || '');
    if (!routeId) continue;

    if (!departuresByRoute.has(routeId)) departuresByRoute.set(routeId, []);
    departuresByRoute.get(routeId).push(fst.depSeconds);

    const range = todayRangeByRoute.get(routeId) || {
      firstSeconds: fst.depSeconds,
      lastSeconds: fst.depSeconds,
    };
    if (fst.depSeconds < range.firstSeconds) range.firstSeconds = fst.depSeconds;
    if (fst.depSeconds > range.lastSeconds) range.lastSeconds = fst.depSeconds;
    todayRangeByRoute.set(routeId, range);

    if (fst.depSeconds < nowSeconds) continue;
    const best = bestByRoute.get(routeId);
    if (!best || fst.depSeconds < best.depSeconds) {
      bestByRoute.set(routeId, { depSeconds: fst.depSeconds, stopId: fst.stopId });
    }
  }

  const result = new Map();
  for (const [routeId, range] of todayRangeByRoute) {
    const route = routeById.get(routeId);
    const routeName = route?.route_long_name || route?.route_short_name || '';
    const info = {
      routeId,
      routeName,
      timeZone,
      frequencyLabel: computeFrequencyLabelFromDepartures(departuresByRoute.get(routeId) || []),
      todaySchedule: {
        firstDeparture: formatSecondsAsTime(range.firstSeconds),
        lastDeparture: formatSecondsAsTime(range.lastSeconds),
      },
    };

    const best = bestByRoute.get(routeId);
    if (best) {
      info.nextDeparture = {
        timeZone,
        departureTime: formatSecondsAsTime(best.depSeconds),
        departureSeconds: best.depSeconds,
        routeId,
        routeName,
        stopId: best.stopId,
        stopName: stopNameById.get(best.stopId) || '',
      };
    }

    result.set(routeId, info);
  }

  return result;
}

class GtfsFeedService {
  constructor({ ttlMs = DEFAULT_TTL_MS, max = DEFAULT_MAX } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this._cache = new Map(); // key: gtfsUrl -> { ts, value }
    this._inFlight = new Map(); // key: gtfsUrl -> Promise
  }

  _getFresh(gtfsUrl) {
    const entry = this._cache.get(gtfsUrl);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) return null;
    return entry.value;
  }

  _evictIfNeeded() {
    if (this._cache.size <= this.max) return;
    const sorted = [...this._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const excess = this._cache.size - this.max;
    for (let i = 0; i < excess; i++) this._cache.delete(sorted[i][0]);
  }

  async getParsedFeed(gtfsUrl) {
    const url = String(gtfsUrl || '').trim();
    if (!url) throw new Error('gtfsUrl is required');

    const cached = this._getFresh(url);
    if (cached) return { ...cached, cached: true };

    if (this._inFlight.has(url)) return this._inFlight.get(url);

    const promise = (async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'TrailVerse/1.0 (+https://www.nationalparksexplorerusa.com)',
          Accept: 'application/zip,application/octet-stream,*/*',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Failed to fetch GTFS zip: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      const files = await unzipGtfsZip(buffer);

      const routesText = files.get('routes.txt') || '';
      const stopsText = files.get('stops.txt') || '';
      const tripsText = files.get('trips.txt') || '';
      const stopTimesText = files.get('stop_times.txt') || '';
      const calendarText = files.get('calendar.txt') || '';
      const calendarDatesText = files.get('calendar_dates.txt') || '';
      const agencyText = files.get('agency.txt') || '';

      const routesRows = routesText ? parseCsv(routesText) : [];
      const stopsRows = stopsText ? parseCsv(stopsText) : [];
      const tripsRows = tripsText ? parseCsv(tripsText) : [];
      const stopTimesRows = stopTimesText ? parseCsv(stopTimesText) : [];
      const calendarRows = calendarText ? parseCsv(calendarText) : [];
      const calendarDateRows = calendarDatesText ? parseCsv(calendarDatesText) : [];
      const agencyRows = agencyText ? parseCsv(agencyText) : [];
      const agencyTimeZone = agencyRows?.[0]?.agency_timezone || null;

      const serviceToday = computeServiceToday({ calendarRows, calendarDateRows });
      const routeStopSummary = buildRouteStopSummary({ routesRows, tripsRows, stopTimesRows, stopsRows });
      const nextDeparture = computeNextDeparture({
        agencyTimeZone,
        stopsRows,
        tripsRows,
        stopTimesRows,
        calendarRows,
        calendarDateRows,
        routesRows,
      });
      const nextDepartureByRoute = computeNextDepartureByRoute({
        agencyTimeZone,
        stopsRows,
        tripsRows,
        stopTimesRows,
        calendarRows,
        calendarDateRows,
        routesRows,
      });
      for (const r of routeStopSummary.routes) {
        const departureInfo = nextDepartureByRoute.get(r.routeId);
        if (!departureInfo) continue;
        if (departureInfo.nextDeparture) r.nextDeparture = departureInfo.nextDeparture;
        if (departureInfo.todaySchedule) r.todaySchedule = departureInfo.todaySchedule;
        if (departureInfo.frequencyLabel) r.frequencyLabel = departureInfo.frequencyLabel;
      }

      const season = computeSeasonFromCalendar(calendarRows);

      const value = {
        gtfsUrl: url,
        parsedAt: new Date().toISOString(),
        agencyTimeZone,
        serviceToday,
        season,
        nextDeparture,
        summary: {
          routes: routeStopSummary.routes,
          counts: {
            routes: routesRows.length,
            stops: stopsRows.length,
            trips: tripsRows.length,
            stopTimes: stopTimesRows.length,
          },
        },
        cached: false,
      };

      this._cache.set(url, { ts: Date.now(), value });
      this._evictIfNeeded();

      return value;
    })();

    this._inFlight.set(url, promise);
    try {
      return await promise;
    } finally {
      this._inFlight.delete(url);
    }
  }
}

module.exports = new GtfsFeedService();
module.exports.computeTransitOperating = computeTransitOperating;
module.exports.buildScheduleDateFields = buildScheduleDateFields;
module.exports.formatMonthDayLabel = formatMonthDayLabel;
