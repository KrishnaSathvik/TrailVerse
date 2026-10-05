'use strict';

const mongoose = require('mongoose');
const User = require('../../models/User');
const Analytics = require('../../models/Analytics');
const AnonymousSession = require('../../models/AnonymousSession');
const BlogPost = require('../../models/BlogPost');
const Comment = require('../../models/Comment');
const Conversation = require('../../models/Conversation');
const DailyFeed = require('../../models/DailyFeed');
const Event = require('../../models/Event');
const Favorite = require('../../models/Favorite');
const Feedback = require('../../models/Feedback');
const ImageUpload = require('../../models/ImageUpload');
const NpsSnapshot = require('../../models/NpsSnapshot');
const ParkReview = require('../../models/ParkReview');
const Subscriber = require('../../models/Subscriber');
const Testimonial = require('../../models/Testimonial');
const TrailieProseRecoveryLease = require('../../models/TrailieProseRecoveryLease');
const TrailieAiTurn = require('../../models/TrailieAiTurn');
const TrailieTurnPersistence = require('../../models/TrailieTurnPersistence');
const TrailieReviewJob = require('../../models/TrailieReviewJob');
const TrailieReviewTelemetry = require('../../models/TrailieReviewTelemetry');
const TripPlan = require('../../models/TripPlan');
const UserPreferences = require('../../models/UserPreferences');
const VisitedPark = require('../../models/VisitedPark');
const AccountErasureJob = require('../../models/AccountErasureJob');
const { eraseAccountData } = require('../accountErasureService');
const { hashPrincipal } = require('../trailieTurnLedger');

const linkedModels = [
  Analytics,
  AnonymousSession,
  Comment,
  Conversation,
  DailyFeed,
  Favorite,
  Feedback,
  ImageUpload,
  ParkReview,
  Subscriber,
  Testimonial,
  TrailieProseRecoveryLease,
  TrailieAiTurn,
  TrailieTurnPersistence,
  TrailieReviewJob,
  TrailieReviewTelemetry,
  TripPlan,
  UserPreferences,
  VisitedPark,
];

async function raw(model, document) {
  await model.collection.insertOne(document);
}

describe('accountErasureService', () => {
  test('removes the complete user-owned graph, social references, and linked review payloads without touching public evidence', async () => {
    const user = await User.create({
      name: 'Erase Me',
      email: 'erase-me@example.com',
      password: 'password123',
    });
    const other = await User.create({
      name: 'Keep Me',
      email: 'keep-me@example.com',
      password: 'password123',
    });
    const userId = user._id;
    const otherId = other._id;
    const tripId = new mongoose.Types.ObjectId();
    const authoredCommentId = new mongoose.Types.ObjectId();

    await NpsSnapshot.create({
      key: 'public:yose:alerts',
      data: { alert: 'Public road status' },
      itemCount: 1,
    });

    await raw(TripPlan, {
      _id: tripId,
      userId,
      shareId: 'private-share-link',
      conversation: [{ role: 'assistant', content: 'private', responseId: 'response-owned' }],
      plan: { responseId: 'response-owned' },
    });
    await raw(Conversation, { userId, title: 'Private', messages: [] });
    await raw(UserPreferences, { user: userId });
    await raw(Favorite, { user: userId, parkCode: 'yose', parkName: 'Yosemite' });
    await raw(VisitedPark, { user: userId, parkCode: 'yose', parkName: 'Yosemite' });
    await raw(DailyFeed, { userId, date: '2026-08-09' });
    await raw(Feedback, {
      userId,
      conversationId: tripId,
      messageId: 'm1',
      feedback: 'up',
      userMessage: 'private question',
      aiResponse: 'private answer',
      aiProvider: 'claude',
    });
    await raw(ImageUpload, {
      userId,
      originalName: 'private.jpg',
      filename: 'missing-private.jpg',
      mimeType: 'image/jpeg',
      size: 1,
      url: '/uploads/general/missing-private.jpg',
    });
    await raw(Analytics, {
      eventType: 'ai_chat',
      eventCategory: 'user',
      userId,
      sessionId: 'private-session',
    });
    await raw(AnonymousSession, {
      anonymousId: 'converted-private-session',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      browserFingerprint: 'private',
      convertedUserId: userId,
    });
    await raw(TrailieProseRecoveryLease, {
      userId,
      tripId,
      responseId: 'response-owned',
      leaseToken: 'lease',
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await raw(TrailieAiTurn, {
      responseId: 'response-owned',
      responseVersion: 1,
      route: 'chat',
      userTier: 'authenticated',
      principalHash: hashPrincipal(userId),
      costStatus: 'cost_unknown',
      schemaVersion: 1,
      createdAt: new Date(),
    });
    await raw(TrailieTurnPersistence, {
      responseId: 'response-owned',
      attempted: true,
      status: 'created',
      observedAt: new Date(),
    });
    await raw(TrailieReviewJob, {
      jobId: 'review-owned',
      responseId: 'response-owned',
      responseVersion: 1,
      contentHash: 'content-hash',
      reviewerVersion: 'v1',
      idempotencyKey: 'review-owned-key',
      payload: { canonicalResponse: { content: 'private answer' } },
    });
    await raw(TrailieReviewTelemetry, {
      responseId: 'response-owned',
      responseVersion: 1,
      contentHash: 'content-hash',
      reviewerVersion: 'v1',
    });
    await raw(ParkReview, {
      parkCode: 'yose',
      userId,
      userName: 'Erase Me',
      rating: 5,
      title: 'Private review',
      comment: 'Private content',
      visitYear: 2026,
    });
    await raw(Testimonial, {
      user: userId,
      name: 'Erase Me',
      content: 'Private testimonial',
      rating: 5,
    });
    await raw(Subscriber, { email: user.email, confirmToken: 'c', unsubscribeToken: 'u' });

    const blog = await BlogPost.create({
      title: 'Public post',
      excerpt: 'Public excerpt',
      content: 'Public content',
      author: 'TrailVerse',
      likes: [userId, otherId],
      favorites: [userId, otherId],
    });
    await raw(Comment, {
      _id: authoredCommentId,
      blogPost: blog._id,
      user: userId,
      userName: 'Erase Me',
      content: 'Private comment',
    });
    await raw(Comment, {
      blogPost: blog._id,
      user: otherId,
      userName: 'Keep Me',
      content: 'Public survivor',
      parent: authoredCommentId,
      likes: [userId, otherId],
    });
    await Event.create({
      title: 'Public event',
      description: 'Public description',
      parkCode: 'yose',
      parkName: 'Yosemite',
      date: new Date('2026-09-01'),
      time: '10:00',
      category: 'guided-tour',
      capacity: 10,
      price: 'Free',
      registrations: [{ user: userId }, { user: otherId }],
    });
    await raw(ParkReview, {
      parkCode: 'zion',
      userId: otherId,
      userName: 'Keep Me',
      rating: 4,
      title: 'Public survivor',
      comment: 'Public content',
      visitYear: 2026,
      helpfulUsers: [userId, otherId],
    });
    await raw(Testimonial, {
      user: otherId,
      name: 'Keep Me',
      content: 'Public survivor',
      rating: 5,
      approvedBy: userId,
    });

    const result = await eraseAccountData({
      userId,
      actor: { type: 'self', id: userId },
    });

    expect(result.status).toBe('complete');
    expect(await User.findById(userId)).toBeNull();
    expect(await User.findById(otherId)).not.toBeNull();
    for (const model of linkedModels) {
      const rawText = JSON.stringify(await model.collection.find({}).toArray());
      expect(rawText).not.toContain(userId.toString());
      expect(rawText).not.toContain('private question');
      expect(rawText).not.toContain('private answer');
    }
    expect(await TrailieAiTurn.countDocuments({ principalHash: hashPrincipal(userId) })).toBe(0);
    expect(await TrailieTurnPersistence.countDocuments({ responseId: 'response-owned' })).toBe(0);

    const survivingBlog = await BlogPost.findById(blog._id).lean();
    expect(survivingBlog.likes.map(String)).toEqual([otherId.toString()]);
    expect(survivingBlog.favorites.map(String)).toEqual([otherId.toString()]);
    const survivingComment = await Comment.findOne({ user: otherId }).lean();
    expect(survivingComment.parent).toBeNull();
    expect(survivingComment.likes.map(String)).toEqual([otherId.toString()]);
    const survivingEvent = await Event.findOne().lean();
    expect(survivingEvent.registrations.map((entry) => String(entry.user))).toEqual([otherId.toString()]);

    expect(await NpsSnapshot.findOne({ key: 'public:yose:alerts' }).lean()).toMatchObject({
      data: { alert: 'Public road status' },
      itemCount: 1,
    });

    const audit = await AccountErasureJob.findOne({ erasureId: result.erasureId }).lean();
    expect(audit.status).toBe('complete');
    expect(audit.principalIdHash).toMatch(/^[a-f0-9]{64}$/);
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(userId.toString());
    expect(auditText).not.toContain(user.email);

    const retry = await eraseAccountData({ userId, actor: { type: 'self', id: userId } });
    expect(retry.status).toBe('complete');
  });

  test('does not delete the principal record or report completion when a required erasure operation fails', async () => {
    const user = await User.create({
      name: 'Retry Me',
      email: 'retry-me@example.com',
      password: 'password123',
    });

    await expect(eraseAccountData({
      userId: user._id,
      actor: { type: 'admin', id: new mongoose.Types.ObjectId() },
      overrides: {
        eraseRetainedAiLogs: async () => {
          throw Object.assign(new Error('log store unavailable'), { code: 'log_store_unavailable' });
        },
      },
    })).rejects.toMatchObject({ code: 'account_erasure_incomplete' });

    expect(await User.findById(user._id)).not.toBeNull();
    const audit = await AccountErasureJob.findOne({ status: 'failed' }).lean();
    expect(audit.collectionResults.some((entry) => entry.errorCode === 'log_store_unavailable')).toBe(true);
  });
});
