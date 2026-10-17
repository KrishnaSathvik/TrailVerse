const Analytics = require('../models/Analytics');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const DestinationPick = require('../models/DestinationPick');
const TripPlan = require('../models/TripPlan');

function utcDayBounds(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, periodKey: start.toISOString().slice(0, 10) };
}

function utcMonthBounds(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const periodKey = start.toISOString().slice(0, 7);
  return { start, end, periodKey };
}

function uniqueCount(ids) {
  return new Set(ids.filter(Boolean)).size;
}

async function collectProductCounts({ start, end, isBot }) {
  const match = {
    timestamp: { $gte: start, $lt: end },
    isBot: isBot ? true : { $ne: true },
  };

  const [
    pageViews,
    sessions,
    parkViewers,
    mapUsers,
    compareUsers,
    trailieUsers,
    voiceUsers,
    signups,
    crowdCalendarUsers,
    whereNextEvents,
  ] = await Promise.all([
    Analytics.countDocuments({ ...match, eventType: 'page_view' }),
    Analytics.distinct('sessionId', match),
    Analytics.distinct('sessionId', { ...match, eventType: 'park_view' }),
    Analytics.distinct('sessionId', { ...match, 'metadata.action': 'map_view' }),
    Analytics.distinct('sessionId', { ...match, 'metadata.action': 'compare_view' }),
    Analytics.distinct('sessionId', {
      ...match,
      $or: [
        { eventType: 'ai_chat' },
        { 'metadata.action': 'trailie_session_start' },
        { 'metadata.action': 'plan_ai_session_start' },
      ],
    }),
    Analytics.distinct('sessionId', { ...match, 'metadata.action': 'voice_session_start' }),
    Analytics.countDocuments({ ...match, eventType: 'user_signup' }),
    Analytics.distinct('sessionId', {
      ...match,
      $or: [
        { eventType: 'crowd_calendar_view' },
        { 'metadata.action': 'crowd_calendar_view' },
      ],
    }),
    Analytics.countDocuments({
      ...match,
      eventType: 'user_action',
      'metadata.action': { $in: ['where_next_destination_selected', 'where_next_pick'] },
    }),
  ]);

  return {
    pageViews,
    sessions: uniqueCount(sessions),
    parkViewers: uniqueCount(parkViewers),
    mapUsers: uniqueCount(mapUsers),
    compareUsers: uniqueCount(compareUsers),
    trailieUsers: uniqueCount(trailieUsers),
    voiceUsers: uniqueCount(voiceUsers),
    signups,
    crowdCalendarUsers: uniqueCount(crowdCalendarUsers),
    whereNextSubmissions: whereNextEvents,
  };
}

async function countTripAuthors({ start, end }) {
  const authors = await TripPlan.distinct('userId', {
    createdAt: { $gte: start, $lt: end },
  });
  return uniqueCount(authors);
}

async function countWhereNextPicks({ start, end }) {
  return DestinationPick.countDocuments({
    updatedAt: { $gte: start, $lt: end },
  });
}

async function upsertSnapshot({ grain, periodKey, periodStart, periodEnd, human, bots, totals }) {
  return AnalyticsSnapshot.findOneAndUpdate(
    { grain, periodKey },
    { grain, periodKey, periodStart, periodEnd, human, bots, totals },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function buildSnapshotForRange({ grain, start, end, periodKey }) {
  const [human, bots, events, tripPlanAuthors, whereNextDocs] = await Promise.all([
    collectProductCounts({ start, end, isBot: false }),
    collectProductCounts({ start, end, isBot: true }),
    Analytics.countDocuments({ timestamp: { $gte: start, $lt: end } }),
    countTripAuthors({ start, end }),
    countWhereNextPicks({ start, end }),
  ]);

  human.tripPlanAuthors = tripPlanAuthors;
  human.whereNextSubmissions = Math.max(human.whereNextSubmissions, whereNextDocs);

  return upsertSnapshot({
    grain,
    periodKey,
    periodStart: start,
    periodEnd: end,
    human,
    bots: { sessions: bots.sessions, pageViews: bots.pageViews },
    totals: { events },
  });
}

async function rollupDay(date = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  const { start, end, periodKey } = utcDayBounds(date);
  return buildSnapshotForRange({ grain: 'day', start, end, periodKey });
}

async function rollupMonth(date = new Date()) {
  const { start, end, periodKey } = utcMonthBounds(date);
  return buildSnapshotForRange({ grain: 'month', start, end, periodKey });
}

async function listSnapshots({ grain = 'day', limit = 90 } = {}) {
  return AnalyticsSnapshot.find({ grain }).sort({ periodKey: -1 }).limit(limit).lean();
}

module.exports = {
  utcDayBounds,
  utcMonthBounds,
  collectProductCounts,
  rollupDay,
  rollupMonth,
  listSnapshots,
};
