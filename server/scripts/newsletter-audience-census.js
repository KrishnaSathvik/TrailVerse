/**
 * Read-only production newsletter audience census.
 *
 * Usage (from server/):
 *   node scripts/newsletter-audience-census.js
 *
 * Prints counts only. Never prints emails or other PII.
 * Never writes, updates, or deletes Mongo documents.
 */
'use strict';

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

function normalizeEmail(value) {
  return String(value || '').toLowerCase().trim();
}

function assertNoPii(obj) {
  const dumped = JSON.stringify(obj);
  if (dumped.includes('@')) {
    throw new Error('Refusing to print output that looks like it contains an email');
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.startsWith('mongodb')) {
    throw new Error('MONGODB_URI is missing or invalid');
  }

  await mongoose.connect(uri, { readPreference: 'secondaryPreferred' });
  const db = mongoose.connection.db;

  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .sort();

  if (!collections.includes('subscribers') || !collections.includes('users')) {
    throw new Error(
      `Expected collections subscribers + users. Found: ${collections.join(', ')}`
    );
  }

  const subscribers = db.collection('subscribers');
  const users = db.collection('users');

  const totalSubscribers = await subscribers.countDocuments();
  const confirmedByFlag = await subscribers.countDocuments({ confirmed: true });
  const unconfirmedByFlag = await subscribers.countDocuments({
    $or: [{ confirmed: false }, { confirmed: { $exists: false } }, { confirmed: null }],
  });
  const confirmedByDate = await subscribers.countDocuments({ confirmedAt: { $ne: null } });
  const unconfirmedByDate = await subscribers.countDocuments({
    $or: [{ confirmedAt: null }, { confirmedAt: { $exists: false } }],
  });
  const confirmedFlagNoDate = await subscribers.countDocuments({
    confirmed: true,
    $or: [{ confirmedAt: null }, { confirmedAt: { $exists: false } }],
  });
  const confirmedDateNoFlag = await subscribers.countDocuments({
    confirmedAt: { $ne: null },
    $or: [{ confirmed: false }, { confirmed: { $exists: false } }, { confirmed: null }],
  });

  const sourceBreakdown = await subscribers
    .aggregate([
      { $match: { confirmed: true } },
      {
        $group: {
          _id: { $ifNull: ['$source', '(missing)'] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();

  const ageBreakdown = await subscribers
    .aggregate([
      { $match: { confirmed: true } },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      { $eq: ['$subscribedAt', null] },
                      { $eq: [{ $type: '$subscribedAt' }, 'missing'] },
                    ],
                  },
                  then: '(missing subscribedAt)',
                },
                {
                  case: {
                    $gte: [
                      '$subscribedAt',
                      { $dateSubtract: { startDate: '$$NOW', unit: 'day', amount: 30 } },
                    ],
                  },
                  then: '0-30 days',
                },
                {
                  case: {
                    $gte: [
                      '$subscribedAt',
                      { $dateSubtract: { startDate: '$$NOW', unit: 'day', amount: 90 } },
                    ],
                  },
                  then: '31-90 days',
                },
                {
                  case: {
                    $gte: [
                      '$subscribedAt',
                      { $dateSubtract: { startDate: '$$NOW', unit: 'day', amount: 365 } },
                    ],
                  },
                  then: '91-365 days',
                },
              ],
              default: '>365 days',
            },
          },
        },
      },
      { $group: { _id: '$bucket', count: { $sum: 1 } } },
    ])
    .toArray();

  const userBlastQuery = {
    $or: [
      { emailNotifications: true },
      { 'emailNotifications.blogNotifications': true },
    ],
  };

  const statusBreakdown = await subscribers
    .aggregate([
      {
        $group: {
          _id: { $ifNull: ['$status', '(missing)'] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const statusMap = {};
  for (const row of statusBreakdown) {
    statusMap[String(row._id)] = row.count;
  }

  const subscribedStatus = await subscribers.countDocuments({ status: 'subscribed' });
  const pendingStatus = await subscribers.countDocuments({ status: 'pending' });
  const unsubscribedStatus = await subscribers.countDocuments({ status: 'unsubscribed' });
  const suppressedStatus = await subscribers.countDocuments({ status: 'suppressed' });
  const totalUsers = await users.countDocuments();
  const usersNestedTrue = await users.countDocuments({
    'emailNotifications.blogNotifications': true,
  });
  const usersBooleanTrue = await users.countDocuments({ emailNotifications: true });
  const usersBlastEnabled = await users.countDocuments(userBlastQuery);
  const usersNestedFalse = await users.countDocuments({
    'emailNotifications.blogNotifications': false,
  });
  const usersMissingPref = await users.countDocuments({
    emailNotifications: { $exists: false },
  });

  const confirmedEmails = new Set();
  let confirmedMissingEmail = 0;
  const confirmedCursor = subscribers.find(
    { confirmed: true },
    { projection: { email: 1, _id: 0 } }
  );
  for await (const doc of confirmedCursor) {
    const email = normalizeEmail(doc.email);
    if (!email) {
      confirmedMissingEmail += 1;
      continue;
    }
    confirmedEmails.add(email);
  }

  const userBlastEmails = new Set();
  let usersMissingEmail = 0;
  const userCursor = users.find(userBlastQuery, { projection: { email: 1, _id: 0 } });
  for await (const doc of userCursor) {
    const email = normalizeEmail(doc.email);
    if (!email) {
      usersMissingEmail += 1;
      continue;
    }
    userBlastEmails.add(email);
  }

  let overlap = 0;
  for (const email of confirmedEmails) {
    if (userBlastEmails.has(email)) overlap += 1;
  }

  const uniqueBlast = new Set([...confirmedEmails, ...userBlastEmails]);

  const sourceMap = {};
  for (const row of sourceBreakdown) {
    sourceMap[String(row._id)] = row.count;
  }
  const ageMap = {
    '0-30 days': 0,
    '31-90 days': 0,
    '91-365 days': 0,
    '>365 days': 0,
    '(missing subscribedAt)': 0,
  };
  for (const row of ageBreakdown) {
    ageMap[String(row._id)] = row.count;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    database: db.databaseName,
    collectionsConfirmed: { subscribers: true, users: true },
    subscribers: {
      totalDocs: totalSubscribers,
      confirmedTrue: confirmedByFlag,
      unconfirmedNotTrue: unconfirmedByFlag,
      confirmedAtSet: confirmedByDate,
      confirmedAtMissing: unconfirmedByDate,
      confirmedTrueButNoConfirmedAt: confirmedFlagNoDate,
      confirmedAtSetButNotTrue: confirmedDateNoFlag,
      confirmedMissingEmail: confirmedMissingEmail,
      uniqueConfirmedEmails: confirmedEmails.size,
      source: sourceMap,
      ageBySubscribedAt: ageMap,
      status: statusMap,
      subscribedStatus,
      pendingStatus,
      unsubscribedStatus,
      suppressedStatus,
    },
    users: {
      totalDocs: totalUsers,
      nestedBlogNotificationsTrue: usersNestedTrue,
      emailNotificationsBooleanTrue: usersBooleanTrue,
      blastQueryMatch: usersBlastEnabled,
      nestedBlogNotificationsFalse: usersNestedFalse,
      missingEmailNotifications: usersMissingPref,
      blastMissingEmail: usersMissingEmail,
      uniqueBlastEmails: userBlastEmails.size,
    },
    overlap: {
      userBlastIntersectConfirmedSubscriber: overlap,
    },
    audiences: {
      uniqueCurrentBlogBlastAudience: userBlastEmails.size,
      uniqueCurrentMixedBlastAudience: uniqueBlast.size,
      legitimateWhereNextSeedList: confirmedEmails.size,
      extraUsersOnlyInBlast: userBlastEmails.size - overlap,
    },
  };

  assertNoPii(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch((err) => {
    console.error(err.message || String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
