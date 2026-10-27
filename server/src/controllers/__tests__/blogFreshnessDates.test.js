'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../services/resendEmailService', () => ({
  sendBlogNotification: jest.fn().mockResolvedValue(undefined),
}));

const BlogPost = require('../../models/BlogPost');
const blogController = require('../blogController');
const { applyViewTargets } = require('../../../scripts/bump-recent-blog-views');
const { blogDateModified } = require('../../utils/blogDates');

const PUBLISHED_AT = new Date('2026-06-01T15:00:00.000Z');
const TEST_USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const ORIGINAL_UPDATED_AT = new Date('2026-06-02T15:00:00.000Z');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/blogs/:slug/view', blogController.trackView);
  app.put('/api/blogs/:id', blogController.updatePost);
  // Reactions require an ObjectId principal (anonymous req.ip cannot cast).
  const asUser = (req, _res, next) => { req.user = { id: TEST_USER_ID }; next(); };
  app.post('/api/blogs/:id/like', asUser, blogController.toggleLike);
  app.post('/api/blogs/:id/favorite', asUser, blogController.toggleFavorite);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message })); // eslint-disable-line no-unused-vars
  return app;
}

async function seedPublishedPost(overrides = {}) {
  const post = await BlogPost.create({
    title: 'Glacier 2026 Visitor Guide',
    slug: 'glacier-2026-visitor-guide',
    excerpt: 'Everything you need for Glacier in 2026.',
    content: 'Going-to-the-Sun Road opens in late June.',
    author: 'Krishna',
    category: 'national-parks',
    tags: ['glacier', 'montana'],
    status: 'published',
    publishedAt: PUBLISHED_AT,
    notificationSentAt: PUBLISHED_AT,
    views: 10,
    ...overrides,
  });
  // Pin updatedAt to a known past value (raw driver write, bypassing timestamps).
  await BlogPost.collection.updateOne(
    { _id: post._id },
    { $set: { updatedAt: ORIGINAL_UPDATED_AT } }
  );
  return post;
}

async function reload(id) {
  return BlogPost.findById(id).lean();
}

describe('blog freshness dates', () => {
  const app = buildApp();

  test('new posts start with contentUpdatedAt = null', async () => {
    const post = await seedPublishedPost();
    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(blogDateModified(stored).toISOString()).toBe(PUBLISHED_AT.toISOString());
  });

  test('trackView increments views without touching updatedAt or contentUpdatedAt', async () => {
    const post = await seedPublishedPost();

    const first = await request(app).post(`/api/blogs/${post.slug}/view`);
    const second = await request(app).post(`/api/blogs/${post.slug}/view`);

    expect(first.status).toBe(200);
    expect(second.body.data.views).toBe(12);
    const stored = await reload(post._id);
    expect(stored.views).toBe(12);
    expect(stored.updatedAt.toISOString()).toBe(ORIGINAL_UPDATED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.publishedAt.toISOString()).toBe(PUBLISHED_AT.toISOString());
  });

  test('bump-recent-blog-views writes views without touching updatedAt or contentUpdatedAt', async () => {
    const post = await seedPublishedPost();

    const result = await applyViewTargets([{ _id: post._id, target: 750 }]);

    expect(result.modifiedCount).toBe(1);
    const stored = await reload(post._id);
    expect(stored.views).toBe(750);
    expect(stored.updatedAt.toISOString()).toBe(ORIGINAL_UPDATED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
  });

  test('likes and favorites do not touch updatedAt or contentUpdatedAt', async () => {
    const post = await seedPublishedPost();

    await request(app).post(`/api/blogs/${post._id}/like`).expect(200);
    await request(app).post(`/api/blogs/${post._id}/favorite`).expect(200);

    const stored = await reload(post._id);
    expect(stored.likes).toHaveLength(1);
    expect(stored.favorites).toHaveLength(1);
    expect(stored.updatedAt.toISOString()).toBe(ORIGINAL_UPDATED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
  });

  test('editorial admin update sets contentUpdatedAt and keeps publishedAt', async () => {
    const post = await seedPublishedPost();
    const before = Date.now();

    const res = await request(app)
      .put(`/api/blogs/${post._id}`)
      .send({ content: 'Going-to-the-Sun Road opens in early July this year.', status: 'published' });

    expect(res.status).toBe(200);
    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeInstanceOf(Date);
    expect(stored.contentUpdatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.publishedAt.toISOString()).toBe(PUBLISHED_AT.toISOString());
    expect(stored.slug).toBe(post.slug);
    expect(blogDateModified(stored).getTime()).toBe(stored.contentUpdatedAt.getTime());
  });

  test.each([
    ['title', { title: 'Glacier 2026: The Complete Visitor Guide' }],
    ['excerpt', { excerpt: 'A new excerpt.' }],
    ['featuredImage', { featuredImage: 'https://example.com/glacier.jpg' }],
    ['category', { category: 'park-guides' }],
    ['tags', { tags: ['glacier', 'montana', 'shuttles'] }],
    ['metaDescription', { metaDescription: 'Plan Glacier in 2026.' }],
    ['seoSchema', { seoSchema: '{"@type":"FAQPage"}' }],
  ])('editorial field %s advances contentUpdatedAt', async (_field, body) => {
    const post = await seedPublishedPost();
    await request(app).put(`/api/blogs/${post._id}`).send(body).expect(200);
    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeInstanceOf(Date);
  });

  test('non-editorial and no-op admin updates do not set contentUpdatedAt', async () => {
    const post = await seedPublishedPost({ category: 'National Parks' });

    // Featured toggle, seoNoindex, author placeholder, readTime: operational.
    await request(app)
      .put(`/api/blogs/${post._id}`)
      .send({ featured: true, seoNoindex: false, author: 'Admin', readTime: 7, status: 'published' })
      .expect(200);
    // No-op save: same values, re-trimmed whitespace, legacy category normalized.
    await request(app)
      .put(`/api/blogs/${post._id}`)
      .send({
        title: '  Glacier 2026 Visitor Guide  ',
        excerpt: 'Everything you need for Glacier in 2026.',
        content: 'Going-to-the-Sun Road opens in late June.\n',
        category: 'national-parks',
        tags: ['glacier', 'montana'],
        featuredImage: null,
        metaDescription: null,
        seoSchema: null,
        status: 'published',
      })
      .expect(200);

    const stored = await reload(post._id);
    expect(stored.featured).toBe(true);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.publishedAt.toISOString()).toBe(PUBLISHED_AT.toISOString());
  });

  test('clients cannot set contentUpdatedAt or updatedAt directly', async () => {
    const post = await seedPublishedPost();
    await request(app)
      .put(`/api/blogs/${post._id}`)
      .send({ featured: true, contentUpdatedAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' })
      .expect(200);
    const stored = await reload(post._id);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(stored.updatedAt.getFullYear()).not.toBe(2030);
  });

  test('edits while still a draft do not set contentUpdatedAt; publishing does not either', async () => {
    const draft = await BlogPost.create({
      title: 'Draft astro guide',
      excerpt: 'Draft excerpt',
      content: 'Draft content',
      author: 'Krishna',
      status: 'draft',
      notificationSentAt: new Date(),
    });

    await request(app).put(`/api/blogs/${draft._id}`).send({ content: 'Revised draft content' }).expect(200);
    await request(app).put(`/api/blogs/${draft._id}`).send({ status: 'published' }).expect(200);

    const stored = await reload(draft._id);
    expect(stored.status).toBe('published');
    expect(stored.publishedAt).toBeInstanceOf(Date);
    expect(stored.contentUpdatedAt).toBeNull();
    expect(blogDateModified(stored).getTime()).toBe(stored.publishedAt.getTime());
  });

  test('notification bookkeeping does not touch updatedAt or contentUpdatedAt', async () => {
    const post = await seedPublishedPost({ notificationSentAt: null });
    await blogController.sendBlogNotifications(await BlogPost.findById(post._id));
    const stored = await reload(post._id);
    expect(stored.notificationSentAt).toBeInstanceOf(Date);
    expect(stored.updatedAt.toISOString()).toBe(ORIGINAL_UPDATED_AT.toISOString());
    expect(stored.contentUpdatedAt).toBeNull();
  });

  test('getPostBySlug serializes contentUpdatedAt', async () => {
    const post = await seedPublishedPost();
    await request(app).put(`/api/blogs/${post._id}`).send({ title: 'Updated title' }).expect(200);

    const readApp = express();
    readApp.get('/api/blogs/:slug', blogController.getPostBySlug);
    readApp.get('/api/blogs', blogController.getAllPosts);
    const single = await request(readApp).get(`/api/blogs/${post.slug}`).expect(200);
    const list = await request(readApp).get('/api/blogs?status=published').expect(200);

    expect(typeof single.body.data.contentUpdatedAt).toBe('string');
    expect(typeof list.body.data[0].contentUpdatedAt).toBe('string');
  });
});

describe('blogDateModified', () => {
  test('falls back to publishedAt and ignores updatedAt', () => {
    expect(
      blogDateModified({ publishedAt: PUBLISHED_AT, updatedAt: new Date('2026-10-25'), contentUpdatedAt: null })
        .toISOString()
    ).toBe(PUBLISHED_AT.toISOString());
  });

  test('ignores contentUpdatedAt earlier than publishedAt or invalid', () => {
    expect(blogDateModified({ publishedAt: PUBLISHED_AT, contentUpdatedAt: '2026-01-01' }).toISOString())
      .toBe(PUBLISHED_AT.toISOString());
    expect(blogDateModified({ publishedAt: PUBLISHED_AT, contentUpdatedAt: 'nope' }).toISOString())
      .toBe(PUBLISHED_AT.toISOString());
    expect(blogDateModified({})).toBeNull();
  });
});
