'use strict';

/**
 * Backward-compatible Subscriber status backfill.
 * Does not demote confirmed:true rows when confirmedAt is missing.
 * Does not invent confirmedAt from subscribedAt.
 */
async function migrateSubscriberStatus({ collection }) {
  const result = {
    subscribed: 0,
    pending: 0,
    alreadyMigrated: 0,
    demoted: 0,
    deleted: 0,
    confirmedAtBackfilled: 0,
  };

  const cursor = collection.find({});
  for await (const doc of cursor) {
    if (doc.status) {
      result.alreadyMigrated += 1;
      if (doc.status === 'subscribed') result.subscribed += 1;
      else if (doc.status === 'pending') result.pending += 1;
      continue;
    }

    const confirmed = doc.confirmed === true;
    const nextStatus = confirmed ? 'subscribed' : 'pending';
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: nextStatus,
          confirmed: confirmed,
        },
      }
    );
    if (nextStatus === 'subscribed') result.subscribed += 1;
    else result.pending += 1;
  }

  return result;
}

module.exports = { migrateSubscriberStatus };
