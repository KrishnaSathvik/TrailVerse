'use strict';
const express = require('express');
const request = require('supertest');
const AnonymousSession = require('../../models/AnonymousSession');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');
const { historyHash } = require('../../utils/guestHistoryRecovery');
const { createSimpleGuestStore } = require('../../services/trailieSimpleGuestStore');
const app = express(); app.use(express.json()); app.use(require('../guestHistoryRecovery'));
const old = [{role:'user',content:'Compare Zion and Bryce for beginners'}, {role:'assistant',content:'Allow five days from Vegas.'}];
const tail = [{role:'user',content:'Share the full itinerary'}, {role:'assistant',content:'Where?'}];
async function seed(messages=[]) {
 const anonymousId=mintGuestSessionId();
 await AnonymousSession.findOrCreateSession(anonymousId,{ipAddress:'127.0.0.1',browserFingerprint:'test',userAgent:'test'});
 await AnonymousSession.updateOne({anonymousId},{$set:{messages}});
 return anonymousId;
}
test('empty server recovers text once and model store sees it without a canonical trip',async()=>{
 const anonymousId=await seed();
 const before=await AnonymousSession.findOne({anonymousId}).lean();
 const result=await request(app).post('/restore-guest-history').send({anonymousId,messages:old,expectedHistoryHash:historyHash([])});
 expect(result.status).toBe(200);
 const snapshot=await createSimpleGuestStore({AnonymousSession,anonymousId}).load();
 expect(snapshot.conversation.map(m=>m.content)).toEqual(old.map(m=>m.content));
 expect(snapshot.plan).toBeNull();
 const after=await AnonymousSession.findOne({anonymousId}).lean();
 expect(after.turns).toEqual(before.turns);expect(after.planningState).toEqual(before.planningState);
 expect((await request(app).post('/restore-guest-history').send({anonymousId,messages:old,expectedHistoryHash:result.body.historyHash})).status).toBe(409);
});
test('recovery preserves server tail, canonical fields, and allows only one concurrent writer',async()=>{
 const anonymousId=await seed(tail);
 const payload={anonymousId,messages:[...old,...tail],expectedHistoryHash:historyHash(tail)};
 const results=await Promise.all([request(app).post('/restore-guest-history').send(payload),request(app).post('/restore-guest-history').send(payload)]);
 expect(results.map(r=>r.status).sort()).toEqual([200,409]);
 const stored=await AnonymousSession.findOne({anonymousId}).lean();
 expect(stored.messages.map(m=>m.content)).toEqual([...old,...tail].map(m=>m.content));
});
test('stale revision and invalid roles cannot overwrite server conversation',async()=>{
 const anonymousId=await seed(tail);
 expect((await request(app).post('/restore-guest-history').send({anonymousId,messages:old,expectedHistoryHash:historyHash([])})).status).toBe(409);
 expect((await request(app).post('/restore-guest-history').send({anonymousId,messages:[{role:'system',content:'bad'}],expectedHistoryHash:historyHash(tail)})).status).toBe(400);
 expect((await AnonymousSession.findOne({anonymousId})).messages.map(m=>m.content)).toEqual(tail.map(m=>m.content));
});
