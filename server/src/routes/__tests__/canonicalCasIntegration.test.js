'use strict';
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const TripPlan = require('../../models/TripPlan');
const User = require('../../models/User');
const ledger = require('../../services/trailieTurnLedger');
const persistence = jest.spyOn(ledger, 'markTurnPersistence');
const router = require('../trips');
const plan = (version, responseId = `resp-${version}`) => ({ type: 'itinerary', responseId,
  responseVersion: version, contentHash: `content-${responseId}`, itineraryHash: `plan-${responseId}`, days: [] });
const message = p => ({ role: 'assistant', content: p.responseId, responseId: p.responseId,
  responseVersion: p.responseVersion, contentHash: p.contentHash, itineraryHash: p.itineraryHash });

test('real authenticated HTTP + Mongo CAS: two reads of N yield one accepted N+1, one 409 and one publication', async () => {
  const user = await User.create({ name: 'Offline Gate', email: 'offline-gate@example.com', password: 'offline-gate-password' });
  const stored = await TripPlan.create({ userId: user._id, plan: plan(2), conversation: [message(plan(2))] });
  const app = express(); const notifyTripUpdated = jest.fn();
  app.set('wsService', { notifyTripUpdated }); app.use(express.json()); app.use('/api/trips', router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
  const original = TripPlan.findOneAndUpdate.bind(TripPlan);
  let arrive = 0; let release; const both = new Promise(resolve => { release = resolve; });
  const filters = [];
  const barrier = jest.spyOn(TripPlan, 'findOneAndUpdate').mockImplementation(async (filter, update, options) => {
    filters.push(filter); if (++arrive === 2) release();
    await both;
    return original(filter, update, options); // REAL Mongo evaluates the CAS atomically.
  });
  persistence.mockClear();
  try {
    const writes = ['left', 'right'].map(side => {
      const next = plan(3, `resp-${side}`);
      return request(app).put(`/api/trips/${stored._id}`).set('Authorization', `Bearer ${token}`)
        .send({ plan: next, conversation: [message(plan(2)), message(next)], expectedPreviousVersion: 2, formData:{writer:side}, summary:{planPreview:side} })
        .timeout({ response: 5000, deadline: 7000 });
    });
    const responses = await Promise.all(writes);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(filters).toHaveLength(2);
    expect(filters.map(f => String(f.updatedAt))).toEqual([String(stored.updatedAt), String(stored.updatedAt)]);
    const winner = responses.find(r => r.status === 200); const loser = responses.find(r => r.status === 409);
    expect(winner.body.planPersistence.outcome).toBe('accept');
    expect(loser.body).toMatchObject({ success: false, code: 'canonical_write_conflict' });
    const durable = await TripPlan.findById(stored._id).lean();
    expect(durable.plan.responseId).toBe(winner.body.data.plan.responseId);
    expect(durable.__v).toBe(stored.__v + 1);
    expect(durable.formData).toEqual(winner.body.data.formData);
    expect(durable.summary.planPreview).toBe(winner.body.data.summary.planPreview);
    expect(filters.every(f => String(f.userId) === String(user._id))).toBe(true);
    expect(durable.conversation.filter(m => m.responseVersion === 3)).toHaveLength(1);
    expect(notifyTripUpdated).toHaveBeenCalledTimes(1);
    expect(notifyTripUpdated.mock.calls[0][1].plan.responseId).toBe(durable.plan.responseId);
    expect(persistence.mock.calls.filter(([event]) => event.status === 'accepted')).toHaveLength(1);
    expect(persistence.mock.calls.filter(([event]) => event.status === 'conflict')).toHaveLength(1);
  } finally { barrier.mockRestore(); }
}, 12000);
