'use strict';

/**
 * Stage 14.7F5 §10 — cache-policy EVIDENCE for the public share route.
 *
 * This stage does not change production cache policy. It records what the
 * application actually sends today, so the canary stage can decide from measured
 * behaviour rather than from assumption.
 *
 * The risk being measured: a share link fetched at revision 1 (itinerary only,
 * `notesStatus: not_available`) and then again after revision 2 lands. If any
 * intermediary is permitted to cache the first response, a recipient can be
 * served a permanently note-less trip.
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

const TripPlan = require('../../models/TripPlan');
const User = require('../../models/User');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/trips', require('../trips'));
app.use(require('../../middleware/errorHandler'));

const R = 'resp-cache-A';
const IH = 'itinerary-hash-cache';

const plan = (over = {}) => ({
  type: 'itinerary', version: 1, createdFrom: 'ai',
  parkName: 'Yosemite National Park', parkCode: 'yose',
  days: [{ day: 1, stops: [{ name: 'Tunnel View' }] }],
  responseId: R, responseVersion: 1, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready', itineraryHash: IH, contentHash: null,
  ...over,
});

const EVIDENCE = {};

afterAll(() => {
  try {
    const dir = path.resolve(__dirname, '../../../../artifacts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'trailie-stage14_7F5-shared-cache-policy.json'),
      `${JSON.stringify(EVIDENCE, null, 2)}\n`
    );
  } catch { /* reporting convenience only */ }
});

async function seedShared(terminal = false, shareScope = 'plan_plus_explanation') {
  const user = await User.create({
    name: 'Cache Prover',
    email: `cache-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'password123',
  });
  const trip = await TripPlan.create({
    userId: user._id,
    title: 'Cache fixture',
    shareId: `share-cache-${Math.random().toString(16).slice(2)}`,
    shareScope,
    conversation: [
      { id: 0, role: 'user', content: 'One day' },
      terminal
        ? { id: 1, role: 'assistant', content: 'Notes.', responseId: R, responseVersion: 1, responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: IH, contentHash: 'ch2' }
        : { id: 1, role: 'assistant', content: '', responseId: R, responseVersion: 1, responseRevision: 1, lifecycleStatus: 'itinerary_ready', itineraryHash: IH },
    ],
    plan: terminal ? plan({ responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch2' }) : plan(),
  });
  return trip;
}

describe('Stage 14.7F7 §1/§2 — no-store on the public share route', () => {
  test('revision 1, revision 2 and a missing share all carry no-store', async () => {
    const rev1 = await seedShared(false);
    const rev2 = await seedShared(true);

    const r1 = await request(app).get(`/api/trips/shared/${rev1.shareId}`);
    const r2 = await request(app).get(`/api/trips/shared/${rev2.shareId}`);
    const missing = await request(app).get('/api/trips/shared/does-not-exist');

    EVIDENCE.route = 'GET /api/trips/shared/:shareId';
    EVIDENCE.middlewarePlacement =
      "router.use('/shared/:shareId', ...) in server/src/routes/trips.js — before the handler and before router.use(protect)";
    EVIDENCE.revision1CacheControl = r1.headers['cache-control'];
    EVIDENCE.revision2CacheControl = r2.headers['cache-control'];
    EVIDENCE.missingShareCacheControl = missing.headers['cache-control'];
    EVIDENCE.vary = r1.headers.vary ?? null;
    EVIDENCE.revision1Etag = r1.headers.etag ?? null;
    EVIDENCE.revision2Etag = r2.headers.etag ?? null;

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(missing.status).toBe(404);
    for (const value of [
      EVIDENCE.revision1CacheControl,
      EVIDENCE.revision2CacheControl,
      EVIDENCE.missingShareCacheControl,
    ]) {
      expect(value).toBe('no-store');
    }
  });

  test('no conflicting storage directive is present', async () => {
    const trip = await seedShared(false);
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    const cc = res.headers['cache-control'];
    expect(cc).not.toMatch(/\bpublic\b/);
    expect(cc).not.toMatch(/s-maxage/);
    expect(cc).not.toMatch(/immutable/);
    // Only `max-age=0` would be acceptable; any positive max-age is not.
    const maxAge = /max-age=(\d+)/.exec(cc);
    if (maxAge) expect(Number(maxAge[1])).toBe(0);
  });

  test.each([
    ['plan_only', 'plan_only'],
    ['plan_plus_explanation', 'plan_plus_explanation'],
  ])('%s shares carry no-store too', async (_label, scope) => {
    const trip = await seedShared(true, scope);
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    expect(res.headers['cache-control']).toBe('no-store');
    // Scope semantics unchanged by the header.
    const hasProse = JSON.stringify(res.body).includes('Notes.');
    expect(hasProse).toBe(scope === 'plan_plus_explanation');
  });

  test('ETags are NOT disabled globally — the route still emits one', async () => {
    const trip = await seedShared(false);
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    expect(res.headers.etag).toBeDefined();
  });

  /**
   * The staleness case the policy exists for: a client holding revision 1's
   * ETag must receive the revision-2 body, not a 304.
   */
  test('revision 1 and revision 2 have different ETags, and a stale ETag is not honoured', async () => {
    const trip = await seedShared(false);
    const before = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    const rev1Etag = before.headers.etag;

    await TripPlan.updateOne(
      { _id: trip._id },
      {
        $set: {
          plan: plan({ responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch2' }),
          conversation: [
            { id: 0, role: 'user', content: 'One day' },
            { id: 1, role: 'assistant', content: 'Notes.', responseId: R, responseVersion: 1, responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: IH, contentHash: 'ch2' },
          ],
        },
      }
    );

    const stale = await request(app)
      .get(`/api/trips/shared/${trip.shareId}`)
      .set('If-None-Match', rev1Etag);

    expect(stale.status).toBe(200);
    expect(JSON.stringify(stale.body)).toContain('Notes.');
    expect(stale.headers.etag).not.toBe(rev1Etag);
    expect(stale.headers['cache-control']).toBe('no-store');

    // Revalidating with the CURRENT etag may 304 or 200, but the policy holds.
    const current = await request(app)
      .get(`/api/trips/shared/${trip.shareId}`)
      .set('If-None-Match', stale.headers.etag);
    expect([200, 304]).toContain(current.status);
    expect(current.headers['cache-control']).toBe('no-store');

    EVIDENCE.staleEtagHonoured = false;
    EVIDENCE.currentEtagRevalidationStatus = current.status;
    EVIDENCE.applicationSharedCachePolicySafe = true;
    // §3 — deployed verification is a separate, later concern.
    EVIDENCE.deployedSharedCachePolicyVerified = false;
    // eslint-disable-next-line no-console
    console.log('SHARED CACHE EVIDENCE', JSON.stringify(EVIDENCE, null, 2));
  });
});

describe('§10 — observed cache headers on GET /api/trips/shared/:shareId', () => {
  test('records the exact application-set caching headers', async () => {
    const trip = await seedShared(false);
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);

    EVIDENCE.route = 'GET /api/trips/shared/:shareId';
    EVIDENCE.controller = 'server/src/routes/trips.js — inline handler, mounted before router.use(protect)';
    EVIDENCE.httpStatus = res.status;
    EVIDENCE.cacheControl = res.headers['cache-control'] ?? null;
    EVIDENCE.vary = res.headers.vary ?? null;
    EVIDENCE.etag = res.headers.etag ?? null;
    EVIDENCE.pragma = res.headers.pragma ?? null;
    EVIDENCE.expires = res.headers.expires ?? null;
    EVIDENCE.surrogateControl = res.headers['surrogate-control'] ?? null;

    // eslint-disable-next-line no-console
    console.log('SHARED CACHE EVIDENCE', JSON.stringify(EVIDENCE, null, 2));
    expect(res.status).toBe(200);
  });

  test('the application now sets an explicit Cache-Control on the share route', async () => {
    const trip = await seedShared(false);
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    expect(res.headers['cache-control']).toBe('no-store');
    EVIDENCE.applicationSetsCacheControl = true;
  });

  test('Express serves a weak ETag, so an intermediary has a revalidation handle', async () => {
    const trip = await seedShared(false);
    const first = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    expect(first.headers.etag).toBeDefined();

    const revalidated = await request(app)
      .get(`/api/trips/shared/${trip.shareId}`)
      .set('If-None-Match', first.headers.etag);
    EVIDENCE.etagRevalidationStatus = revalidated.status;
    expect([200, 304]).toContain(revalidated.status);
  });

  /**
   * The staleness question, answered with data rather than argument.
   */
  test('the revision-1 and revision-2 share bodies differ AND get different ETags', async () => {
    const rev1 = await seedShared(false);
    const before = await request(app).get(`/api/trips/shared/${rev1.shareId}`);

    // Advance the SAME share to revision 2.
    await TripPlan.updateOne(
      { _id: rev1._id },
      {
        $set: {
          plan: plan({ responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch2' }),
          conversation: [
            { id: 0, role: 'user', content: 'One day' },
            { id: 1, role: 'assistant', content: 'Notes.', responseId: R, responseVersion: 1, responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: IH, contentHash: 'ch2' },
          ],
        },
      }
    );
    const after = await request(app).get(`/api/trips/shared/${rev1.shareId}`);

    // Tool-first rev1 is settled complete; rev2 still changes body + ETag.
    expect(before.body.data.notesStatus).toBe('complete');
    expect(JSON.stringify(before.body)).not.toContain('Notes.');
    expect(JSON.stringify(after.body)).toContain('Notes.');
    expect(after.headers.etag).not.toBe(before.headers.etag);

    EVIDENCE.revision1NotesStatus = before.body.data.notesStatus;
    EVIDENCE.etagChangesAcrossRevisions = after.headers.etag !== before.headers.etag;
    EVIDENCE.staleRiskWithoutExplicitPolicy =
      'An intermediary that heuristically caches a 200 with no Cache-Control may keep serving the '
      + 'revision-1 body after revision 2 lands. The ETag changes, so a revalidating cache is safe; '
      + 'a heuristically-caching one is not.';
    EVIDENCE.recommendation = 'APPLIED in Stage 14.7F7 §1 — Cache-Control: no-store.';
  });
});
