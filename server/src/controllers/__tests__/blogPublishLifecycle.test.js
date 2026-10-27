'use strict';

/**
 * Admin blog lifecycle regressions: create → autosave → publish → edit →
 * unpublish → re-publish → schedule. Guards publishedAt (first publication
 * only), contentUpdatedAt (public editorial revisions only) and the
 * once-per-post notification rule (09-blog-publish-workflow).
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../services/resendEmailService', () => ({
  sendBlogNotification: jest.fn().mockResolvedValue(undefined),
}));

const BlogPost = require('../../models/BlogPost');
const blogController = require('../blogController');
const schedulerService = require('../../services/schedulerService');
const { blogDateModified } = require('../../utils/blogDates');

const ORIGINAL_PUBLISHED_AT = new Date('2026-06-01T15:00:00.000Z');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/blogs', blogController.createPost);
  app.post('/api/blogs/publish-scheduled', blogController.publishScheduledPosts);
  app.put('/api/blogs/:id', blogController.updatePost);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message })); // eslint-disable-line no-unused-vars
  return app;
}

// Mirrors BlogPostForm buildPayload() (author placeholder, derived readTime, nulls).
function formPayload(overrides = {}) {
  return {
    title: 'Chiricahua Visitor Guide',
    slug: 'chiricahua-visitor-guide',
    excerpt: 'Hoodoos, sky islands and the Echo Canyon loop.',
    metaDescription: null,
    seoNoindex: false,
    content: '<p>Echo Canyon is the classic loop.</p>',
    category: 'national-parks',
    tags: ['chiricahua', 'arizona'],
    featuredImage: null,
    featured: false,
    author: 'Admin',
    readTime: 1,
    seoSchema: null,
    scheduledAt: null,
    ...overrides,
  };
}

// Mirrors lib/blogAutosave toAutosavePayload(): lifecycle fields stripped.
function autosavePayload(overrides = {}) {
  const payload = formPayload(overrides);
  delete payload.status;
  delete payload.scheduledAt;
  delete payload.publishedAt;
  return payload;
}

async function reload(id) {
  return BlogPost.findById(id).lean();
}

async function seedLivePost(overrides = {}) {
  return BlogPost.create({
    ...formPayload(),
    status: 'published',
    publishedAt: ORIGINAL_PUBLISHED_AT,
    notificationSentAt: ORIGINAL_PUBLISHED_AT,
    ...overrides,
  });
}

function notificationClaims(spy) {
  return spy.mock.calls.filter(([filter]) => filter && filter.notificationSentAt === null).length;
}

describe('admin blog publish lifecycle', () => {
  const app = buildApp();
  let updateOneSpy;

  beforeEach(() => {
    updateOneSpy = jest.spyOn(BlogPost, 'updateOne');
  });

  afterEach(() => {
    updateOneSpy.mockRestore();
  });

  test('new draft: create + server autosave stays draft with no publish date', async () => {
    const created = await request(app).post('/api/blogs').send({ ...formPayload(), status: 'draft' }).expect(201);
    const id = created.body.data._id;

    await request(app).put(`/api/blogs/${id}`)
      .send(autosavePayload({ content: '<p>Echo Canyon, then Heart of Rocks.</p>' }))
      .expect(200);

    const stored = await reload(id);
    expect(stored.status).toBe('draft');
    expect(stored.publishedAt).toBeNull();
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.content).toContain('Heart of Rocks');
  });

  test('publish sets publishedAt once; contentUpdatedAt stays null', async () => {
    const draft = await BlogPost.create({ ...formPayload(), status: 'draft', notificationSentAt: new Date() });
    const before = Date.now();

    await request(app).put(`/api/blogs/${draft._id}`).send({ ...formPayload(), status: 'published' }).expect(200);

    const stored = await reload(draft._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.lastPublicEditorialHash).toEqual(expect.any(String));
  });

  test('autosave payload on a published post cannot change status or publishedAt', async () => {
    const post = await seedLivePost();

    // Even if a stale client autosaves to the server, lifecycle is untouched.
    await request(app).put(`/api/blogs/${post._id}`).send(autosavePayload()).expect(200);

    const stored = await reload(post._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
  });

  test('explicit Update of a live post sets contentUpdatedAt and keeps publishedAt + status', async () => {
    const post = await seedLivePost();
    const before = Date.now();

    await request(app).put(`/api/blogs/${post._id}`)
      .send({ ...formPayload({ content: '<p>Echo Canyon reopened after the fire.</p>' }), status: 'published' })
      .expect(200);

    const stored = await reload(post._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(stored.contentUpdatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(blogDateModified(stored).getTime()).toBe(stored.contentUpdatedAt.getTime());
  });

  test('no-op Update of a live post does not set contentUpdatedAt', async () => {
    const post = await seedLivePost();

    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'published' }).expect(200);

    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
  });

  test('client-sent publishedAt is ignored (Publish now / stale clients)', async () => {
    const post = await seedLivePost();
    await request(app).put(`/api/blogs/${post._id}`)
      .send({ status: 'published', publishedAt: '2030-01-01T00:00:00.000Z' })
      .expect(200);
    expect((await reload(post._id)).publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
  });

  test('unpublish then re-publish unchanged keeps original publishedAt, no new date, no resend', async () => {
    const post = await seedLivePost();

    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'draft' }).expect(200);
    const offline = await reload(post._id);
    expect(offline.status).toBe('draft');
    expect(offline.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());

    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'published' }).expect(200);
    const stored = await reload(post._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.notificationSentAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(notificationClaims(updateOneSpy)).toBe(0);
  });

  test('draft edits while unpublished do not set contentUpdatedAt; re-publishing the revision does', async () => {
    const post = await seedLivePost();
    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'draft' }).expect(200);

    // Revise while offline (manual draft save + server autosave).
    await request(app).put(`/api/blogs/${post._id}`)
      .send({ ...formPayload({ title: 'Chiricahua National Park Visitor Guide' }), status: 'draft' })
      .expect(200);
    await request(app).put(`/api/blogs/${post._id}`)
      .send(autosavePayload({ title: 'Chiricahua National Park Visitor Guide', content: '<p>New loop notes.</p>' }))
      .expect(200);
    const offline = await reload(post._id);
    expect(offline.status).toBe('draft');
    expect(offline.contentUpdatedAt).toBeNull();

    const before = Date.now();
    // Re-publish with no further change in this request: revision still goes live.
    await request(app).put(`/api/blogs/${post._id}`).send({ status: 'published' }).expect(200);
    const stored = await reload(post._id);
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(stored.contentUpdatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(notificationClaims(updateOneSpy)).toBe(0);
  });

  test('legacy live post without a stored fingerprint: unpublish, edit, re-publish bumps contentUpdatedAt', async () => {
    const post = await seedLivePost();
    await BlogPost.collection.updateOne({ _id: post._id }, { $set: { lastPublicEditorialHash: null } });

    await request(app).put(`/api/blogs/${post._id}`).send({ status: 'draft' }).expect(200);
    await request(app).put(`/api/blogs/${post._id}`).send({ excerpt: 'Revised while offline.' }).expect(200);
    expect((await reload(post._id)).contentUpdatedAt).toBeNull();

    await request(app).put(`/api/blogs/${post._id}`).send({ status: 'published' }).expect(200);
    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeInstanceOf(Date);
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
  });

  test('scheduled post: autosave keeps schedule; scheduler publishes once with a first publish date', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const created = await request(app).post('/api/blogs')
      .send({ ...formPayload(), status: 'scheduled', scheduledAt: future })
      .expect(201);
    const id = created.body.data._id;
    expect(created.body.data.status).toBe('scheduled');
    expect(created.body.data.publishedAt).toBeNull();

    await request(app).put(`/api/blogs/${id}`).send(autosavePayload({ content: '<p>Scheduled edit.</p>' })).expect(200);
    let stored = await reload(id);
    expect(stored.status).toBe('scheduled');
    expect(stored.scheduledAt.toISOString()).toBe(future);
    expect(stored.contentUpdatedAt).toBeNull();

    // Make it due, then run the background scheduler job.
    await BlogPost.collection.updateOne({ _id: stored._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
    const before = Date.now();
    const result = await schedulerService.publishScheduledPosts();
    expect(result.success).toBe(true);

    stored = await reload(id);
    expect(stored.status).toBe('published');
    expect(stored.scheduledAt).toBeNull();
    expect(stored.publishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.contentUpdatedAt).toBeNull();
  });

  test('re-scheduling a previously published post keeps its original publishedAt through the admin publish-scheduled route', async () => {
    const post = await seedLivePost();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'scheduled', scheduledAt: future }).expect(200);
    let stored = await reload(post._id);
    expect(stored.status).toBe('scheduled');
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());

    await BlogPost.collection.updateOne({ _id: post._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
    await request(app).post('/api/blogs/publish-scheduled').expect(200);

    stored = await reload(post._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt.toISOString()).toBe(ORIGINAL_PUBLISHED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
    expect(notificationClaims(updateOneSpy)).toBe(0);
  });

  test('saving a scheduled post as a plain draft clears the stale schedule', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const post = await BlogPost.create({ ...formPayload(), status: 'scheduled', scheduledAt: future });

    await request(app).put(`/api/blogs/${post._id}`).send({ ...formPayload(), status: 'draft', scheduledAt: null }).expect(200);

    const stored = await reload(post._id);
    expect(stored.status).toBe('draft');
    expect(stored.scheduledAt).toBeNull();
  });

  test('first publish of a never-notified post claims the notification exactly once', async () => {
    const draft = await BlogPost.create({ ...formPayload(), status: 'draft' });

    await request(app).put(`/api/blogs/${draft._id}`).send({ status: 'published' }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await request(app).put(`/api/blogs/${draft._id}`).send({ status: 'draft' }).expect(200);
    await request(app).put(`/api/blogs/${draft._id}`).send({ status: 'published' }).expect(200);
    // Let the fire-and-forget notification claim settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = await reload(draft._id);
    expect(stored.notificationSentAt).toBeInstanceOf(Date);
    expect(notificationClaims(updateOneSpy)).toBe(1);
  });
});
