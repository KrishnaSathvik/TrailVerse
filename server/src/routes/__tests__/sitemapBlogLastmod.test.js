'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../services/npsService', () => ({
  getNpsService: () => ({
    getAllParks: jest.fn().mockResolvedValue([
      { parkCode: 'glac', designation: 'National Park', fullName: 'Glacier National Park', images: [] },
    ]),
  }),
}));

const BlogPost = require('../../models/BlogPost');
const sitemapRouter = require('../sitemap');

describe('server sitemap.xml lastmod', () => {
  test('blog lastmod uses contentUpdatedAt || publishedAt; static hubs have no request-time lastmod', async () => {
    const edited = await BlogPost.create({
      title: 'Edited', slug: 'edited', excerpt: 'e', content: 'c', author: 'Krishna',
      status: 'published', publishedAt: new Date('2026-06-01T12:00:00Z'),
      contentUpdatedAt: new Date('2026-07-04T12:00:00Z'),
    });
    const untouched = await BlogPost.create({
      title: 'Untouched', slug: 'untouched', excerpt: 'e', content: 'c', author: 'Krishna',
      status: 'published', publishedAt: new Date('2026-05-10T12:00:00Z'),
    });
    // Simulate polluted updatedAt from historical view increments.
    await BlogPost.collection.updateMany({}, { $set: { updatedAt: new Date('2026-10-25T00:00:00Z') } });
    expect(edited && untouched).toBeTruthy();

    const app = express();
    app.use('/', sitemapRouter);
    const res = await request(app).get('/sitemap.xml').expect(200);
    const xml = res.text;

    expect(xml).toMatch(/<loc>[^<]*\/blog\/edited<\/loc>\s*<lastmod>2026-07-04<\/lastmod>/);
    expect(xml).toMatch(/<loc>[^<]*\/blog\/untouched<\/loc>\s*<lastmod>2026-05-10<\/lastmod>/);
    expect(xml).toMatch(/<loc>[^<]*\/blog<\/loc>\s*<lastmod>2026-07-04<\/lastmod>/);
    expect(xml).not.toContain('2026-10-25');
    expect(xml).toMatch(/<loc>[^<]*\.com\/<\/loc>\s*<changefreq>/);
    expect(xml).toMatch(/<loc>[^<]*\/parks\/glac<\/loc>\s*<changefreq>/);
    expect(xml).not.toContain('__BLOG_HUB_LASTMOD__');
  });
});
