'use strict';

const DestinationPick = require('../models/DestinationPick');
const { TRAVEL_WINDOWS } = DestinationPick;
const { executeParkSearch } = require('./parkSearchService');
const { loadCanonicalParks } = require('../catalog/parkCatalog');
const { canonicalToApiPark } = require('../adapters/npsParkAdapter');
const {
  normalizeQuery,
  silentMatchFromSearchHits,
  toMatchPayload,
} = require('./whereNextMatchService');
const {
  volumeTier,
  publicLeadersAllowed,
  countsAllowed,
} = require('./whereNextStatsService');

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function assertSessionId(sessionId) {
  const value = String(sessionId || '').trim();
  if (!SESSION_ID_RE.test(value)) {
    const err = new Error('Valid sessionId is required');
    err.statusCode = 400;
    throw err;
  }
  return value;
}

async function resolveExplicitParkCode(parkCode) {
  const code = String(parkCode || '').trim().toLowerCase();
  if (!code || code.length < 3 || code.length > 10) return null;
  const catalog = await loadCanonicalParks();
  const park = catalog.find((item) => String(item.id || '').toLowerCase() === code);
  return park ? canonicalToApiPark(park) : null;
}

async function matchTypedText(rawInput) {
  const { parks } = await executeParkSearch({
    q: rawInput,
    limit: 8,
    source: 'where-next-match',
  });
  return silentMatchFromSearchHits(parks, rawInput);
}

function serializePick(doc) {
  if (!doc) return null;
  const parkCode = doc.parkCode || null;
  return {
    sessionId: doc.sessionId,
    displayName: doc.canonicalName || doc.rawInput,
    rawInput: doc.rawInput,
    parkCode,
    canonicalType: doc.canonicalType || null,
    canonicalName: doc.canonicalName || null,
    travelWindow: doc.travelWindow || null,
    matched: Boolean(parkCode),
    source: doc.source || null,
    updatedAt: doc.updatedAt,
  };
}

async function buildStats({ parkCode } = {}) {
  const totalActive = await DestinationPick.countDocuments();
  const tier = volumeTier(totalActive);
  const code = parkCode ? String(parkCode).toLowerCase() : null;
  const destinationCount = code
    ? await DestinationPick.countDocuments({ parkCode: code })
    : 0;

  let weeklyRank = null;
  let leaders = [];

  if (publicLeadersAllowed(tier)) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grouped = await DestinationPick.aggregate([
      {
        $match: {
          parkCode: { $nin: [null, ''] },
          updatedAt: { $gte: weekAgo },
        },
      },
      {
        $group: {
          _id: '$parkCode',
          count: { $sum: 1 },
          canonicalName: { $first: '$canonicalName' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const showCounts = countsAllowed(tier);
    leaders = grouped.map((row, index) => {
      const leader = {
        rank: index + 1,
        parkCode: row._id,
        name: row.canonicalName,
      };
      if (showCounts) leader.count = row.count;
      return leader;
    });

    if (code) {
      const idx = leaders.findIndex((row) => row.parkCode === code);
      weeklyRank = idx >= 0 ? idx + 1 : null;
    }
  }

  return {
    volumeTier: tier,
    totalActive,
    destinationCount,
    weeklyRank,
    leaders,
  };
}

async function upsertPick({
  sessionId,
  rawInput,
  parkCode: explicitParkCode,
  source,
  userId,
}) {
  const sid = assertSessionId(sessionId);
  const raw = String(rawInput || '').trim();
  if (raw.length < 1 || raw.length > 120) {
    const err = new Error('Destination is required');
    err.statusCode = 400;
    throw err;
  }

  const previous = await DestinationPick.findOne({ sessionId: sid });

  let match;
  if (explicitParkCode) {
    const park = await resolveExplicitParkCode(explicitParkCode);
    match = toMatchPayload(park);
    if (park) match.canonicalName = park.fullName || park.name || match.canonicalName;
  } else {
    match = toMatchPayload(await matchTypedText(raw));
  }

  const next = {
    sessionId: sid,
    rawInput: raw,
    normalizedText: normalizeQuery(raw),
    source: source ? String(source).slice(0, 64) : previous?.source || null,
    userId: userId || previous?.userId || null,
  };

  const changed = Boolean(
    previous
    && (
      previous.normalizedText !== next.normalizedText
      || (previous.parkCode || null) !== (match.parkCode || null)
    )
  );

  const $set = {
    ...next,
    travelWindow: changed ? null : previous?.travelWindow || null,
  };
  const $unset = {};
  if (match.parkCode) {
    $set.parkCode = match.parkCode;
    $set.canonicalType = match.canonicalType;
    $set.canonicalName = match.canonicalName;
  } else {
    $unset.parkCode = 1;
    $unset.canonicalType = 1;
    $unset.canonicalName = 1;
  }

  const pick = await DestinationPick.findOneAndUpdate(
    { sessionId: sid },
    Object.keys($unset).length ? { $set, $unset } : { $set },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const stats = await buildStats({ parkCode: pick.parkCode });
  return { pick: serializePick(pick), stats, changed };
}

async function setTravelWindow({ sessionId, travelWindow }) {
  const sid = assertSessionId(sessionId);
  let window = travelWindow == null || travelWindow === '' ? null : String(travelWindow);
  if (window && !TRAVEL_WINDOWS.includes(window)) {
    const err = new Error('Invalid travel window');
    err.statusCode = 400;
    throw err;
  }

  const pick = await DestinationPick.findOneAndUpdate(
    { sessionId: sid },
    { $set: { travelWindow: window } },
    { new: true }
  );
  if (!pick) {
    const err = new Error('No destination pick for this session');
    err.statusCode = 404;
    throw err;
  }
  const stats = await buildStats({ parkCode: pick.parkCode });
  return { pick: serializePick(pick), stats };
}

async function getMe(sessionId) {
  const sid = assertSessionId(sessionId);
  const pick = await DestinationPick.findOne({ sessionId: sid });
  const stats = await buildStats({ parkCode: pick?.parkCode });
  return { pick: serializePick(pick), stats };
}

async function getPublicStats() {
  return buildStats({});
}

module.exports = {
  SESSION_ID_RE,
  serializePick,
  buildStats,
  upsertPick,
  setTravelWindow,
  getMe,
  getPublicStats,
  resolveExplicitParkCode,
};
