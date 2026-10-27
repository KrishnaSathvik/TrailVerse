'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const AccountErasureJob = require('../models/AccountErasureJob');
const Analytics = require('../models/Analytics');
const AnonymousSession = require('../models/AnonymousSession');
const BlogPost = require('../models/BlogPost');
const Comment = require('../models/Comment');
const Conversation = require('../models/Conversation');
const DailyFeed = require('../models/DailyFeed');
const Event = require('../models/Event');
const Favorite = require('../models/Favorite');
const Feedback = require('../models/Feedback');
const ImageUpload = require('../models/ImageUpload');
const ParkReview = require('../models/ParkReview');
const Subscriber = require('../models/Subscriber');
const Testimonial = require('../models/Testimonial');
const TrailieProseRecoveryLease = require('../models/TrailieProseRecoveryLease');
const TrailieAiTurn = require('../models/TrailieAiTurn');
const TrailieTurnPersistence = require('../models/TrailieTurnPersistence');
const TrailieReviewJob = require('../models/TrailieReviewJob');
const TrailieReviewTelemetry = require('../models/TrailieReviewTelemetry');
const TripPlan = require('../models/TripPlan');
const User = require('../models/User');
const UserPreferences = require('../models/UserPreferences');
const VisitedPark = require('../models/VisitedPark');
const { redactAIRequestsForUser } = require('../utils/aiLogger');
const { getUploadsDir } = require('../utils/uploads');
const { hashPrincipal } = require('./trailieTurnLedger');

const AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

class AccountErasureError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'AccountErasureError';
    this.code = 'account_erasure_incomplete';
  }
}

function auditHash(value) {
  const secret = process.env.ACCOUNT_ERASURE_AUDIT_SALT || process.env.JWT_SECRET;
  if (!secret) throw new Error('account_erasure_audit_salt_missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function counts(result = {}) {
  return {
    matched: Number(result.matchedCount ?? result.deletedCount ?? 0),
    deleted: Number(result.deletedCount ?? 0),
    anonymized: Number(result.modifiedCount ?? 0),
  };
}

function controlledUploadPath(uploadUrl, filename) {
  const uploadsDir = getUploadsDir();
  let relative = null;
  if (typeof uploadUrl === 'string' && uploadUrl.startsWith('/uploads/')) {
    relative = uploadUrl.slice('/uploads/'.length);
  } else if (filename && !path.isAbsolute(filename)) {
    relative = filename;
  }
  if (!relative) return null;
  const resolved = path.resolve(uploadsDir, relative);
  if (resolved !== uploadsDir && !resolved.startsWith(`${uploadsDir}${path.sep}`)) {
    throw Object.assign(new Error('upload_path_outside_controlled_root'), {
      code: 'upload_path_outside_controlled_root',
    });
  }
  return resolved;
}

async function removeFileIfControlled(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function eraseUploadFiles(userId) {
  const uploads = await ImageUpload.find({ userId }).select('url thumbnailUrl filename').lean();
  for (const upload of uploads) {
    const imagePath = controlledUploadPath(upload.url, upload.filename);
    const thumbnailPath = controlledUploadPath(upload.thumbnailUrl, null);
    await removeFileIfControlled(imagePath);
    await removeFileIfControlled(thumbnailPath);
  }
  return { matchedCount: uploads.length, modifiedCount: uploads.length };
}

function uniqueStrings(values) {
  return [...new Set(values.flat().filter(Boolean).map(String))];
}

async function responseIdsForUser(userId) {
  const [conversationIds, planIds, leaseIds] = await Promise.all([
    TripPlan.distinct('conversation.responseId', { userId }),
    TripPlan.distinct('plan.responseId', { userId }),
    TrailieProseRecoveryLease.distinct('responseId', { userId }),
  ]);
  return uniqueStrings([conversationIds, planIds, leaseIds]);
}

async function createAudit({ userId, actor }) {
  const now = new Date();
  return AccountErasureJob.create({
    erasureId: crypto.randomUUID(),
    principalIdHash: auditHash(userId),
    requestedByHash: actor?.id ? auditHash(actor.id) : null,
    requestType: actor?.type || 'system',
    requestedAt: now,
    status: 'running',
    attempts: 1,
    auditExpiresAt: new Date(now.getTime() + AUDIT_RETENTION_MS),
  });
}

async function eraseAccountData({ userId, actor = { type: 'system' }, overrides = {} } = {}) {
  if (!userId) throw new TypeError('userId is required');
  const audit = await createAudit({ userId, actor });
  const collectionResults = [];
  const eraseRetainedAiLogs = overrides.eraseRetainedAiLogs || redactAIRequestsForUser;

  const record = async (collection, action, operation) => {
    try {
      const result = counts(await operation());
      collectionResults.push({ collection, action, ...result, errorCode: null });
      return result;
    } catch (error) {
      collectionResults.push({
        collection,
        action,
        matched: 0,
        deleted: 0,
        anonymized: 0,
        errorCode: error.code || 'account_erasure_operation_failed',
      });
      throw error;
    }
  };

  try {
    const principal = await User.findById(userId).select('email').lean();
    const responseIds = await responseIdsForUser(userId);
    const authoredCommentIds = await Comment.distinct('_id', { user: userId });

    await record('ai_request_log', 'delete', () => eraseRetainedAiLogs(String(userId)));
    await record('image_upload_files', 'delete', () => eraseUploadFiles(userId));

    if (responseIds.length) {
      await record('trailie_review_jobs', 'delete', () =>
        TrailieReviewJob.deleteMany({ responseId: { $in: responseIds } })
      );
      await record('trailie_review_telemetry', 'delete', () =>
        TrailieReviewTelemetry.deleteMany({ responseId: { $in: responseIds } })
      );
      await record('trailie_turn_persistence', 'delete', () =>
        TrailieTurnPersistence.deleteMany({ responseId: { $in: responseIds } })
      );
    }

    const directDeletes = [
      ['analytics', Analytics, { userId }],
      ['anonymous_sessions', AnonymousSession, { convertedUserId: userId }],
      ['conversations', Conversation, { userId }],
      ['daily_feeds', DailyFeed, { userId }],
      ['favorites', Favorite, { user: userId }],
      ['feedback', Feedback, { userId }],
      ['image_uploads', ImageUpload, { userId }],
      ['park_reviews', ParkReview, { userId }],
      ['testimonials', Testimonial, { user: userId }],
      ['trailie_prose_recovery_leases', TrailieProseRecoveryLease, { userId }],
      ['trailie_ai_turns', TrailieAiTurn, { principalHash: hashPrincipal(userId) }],
      ['trip_plans', TripPlan, { userId }],
      ['user_preferences', UserPreferences, { user: userId }],
      ['visited_parks', VisitedPark, { user: userId }],
    ];
    for (const [name, model, query] of directDeletes) {
      await record(name, 'delete', () => model.deleteMany(query));
    }

    if (authoredCommentIds.length) {
      await record('comment_replies', 'anonymize_reference', () =>
        Comment.updateMany({ parent: { $in: authoredCommentIds } }, { $set: { parent: null } })
      );
    }
    await record('comments', 'delete', () => Comment.deleteMany({ user: userId }));
    await record('comment_likes', 'anonymize_reference', () =>
      Comment.updateMany({ likes: userId }, { $pull: { likes: userId } })
    );
    await record('blog_reactions', 'anonymize_reference', () =>
      BlogPost.updateMany(
        { $or: [{ likes: userId }, { favorites: userId }] },
        { $pull: { likes: userId, favorites: userId } },
        // Reaction cleanup is operational; it must not refresh blog freshness dates.
        { timestamps: false }
      )
    );
    await record('event_registrations', 'anonymize_reference', () =>
      Event.updateMany({ 'registrations.user': userId }, { $pull: { registrations: { user: userId } } })
    );
    await record('park_review_votes', 'anonymize_reference', () =>
      ParkReview.updateMany({ helpfulUsers: userId }, { $pull: { helpfulUsers: userId } })
    );
    await record('testimonial_approvals', 'anonymize_reference', () =>
      Testimonial.updateMany({ approvedBy: userId }, { $set: { approvedBy: null } })
    );

    if (principal?.email) {
      await record('subscribers', 'delete', () => Subscriber.deleteMany({ email: principal.email }));
    }

    await record('users', 'delete', () => User.deleteOne({ _id: userId }));

    audit.status = 'complete';
    audit.collectionResults = collectionResults;
    audit.completedAt = new Date();
    await audit.save();
    return { erasureId: audit.erasureId, status: audit.status, collectionResults };
  } catch (error) {
    audit.status = 'failed';
    audit.collectionResults = collectionResults;
    audit.completedAt = new Date();
    await audit.save();
    throw new AccountErasureError('Account erasure did not complete', error);
  }
}

module.exports = {
  AccountErasureError,
  auditHash,
  eraseAccountData,
};
