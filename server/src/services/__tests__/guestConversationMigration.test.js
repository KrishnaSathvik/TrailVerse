'use strict';
const mongoose=require('mongoose');
const {startTransactionalMongo}=require('../../../tests/support/transactionalMongo');
const {migrateGuestConversation}=require('../guestConversationMigration');
const {mintGuestSessionId}=require('../../utils/anonymousIdGenerator');
let harness, AnonymousSession, TripPlan;
beforeAll(async()=>{
 harness=await startTransactionalMongo();
 const guestSchema=require('../../models/AnonymousSession').schema.clone();
 guestSchema.set('autoIndex',false);
 AnonymousSession=harness.connection.model('AnonymousSession',guestSchema);
 TripPlan=harness.modelFrom(require('../../models/TripPlan'));
 await Promise.all([AnonymousSession.createCollection(),TripPlan.createCollection()]);
});
afterAll(async()=>{await harness?.stop();});
test('login transfers full conversation atomically and retry returns same trip',async()=>{
 const anonymousId=mintGuestSessionId(),userId=new mongoose.Types.ObjectId();
 const messages=[{role:'user',content:'Zion and Bryce, five days from Vegas'},{role:'assistant',content:'Stay in Springdale and Tropic.'}];
 await AnonymousSession.create({anonymousId,ipAddress:'127.0.0.1',browserFingerprint:'test',userAgent:'test',messages});
 const args={AnonymousSession,TripPlan,anonymousId,userId};
 const id=await migrateGuestConversation(args);
 const trip=await TripPlan.findById(id).lean();
 expect(trip.conversation.map(m=>m.content)).toEqual(messages.map(m=>m.content));
 expect(String(await migrateGuestConversation(args))).toBe(String(id));
 expect(await TripPlan.countDocuments({userId})).toBe(1);
 await expect(migrateGuestConversation({...args,userId:new mongoose.Types.ObjectId()})).rejects.toMatchObject({status:409});
});
test('failed guest handoff rolls back the newly created trip',async()=>{
 const anonymousId=mintGuestSessionId();
 await AnonymousSession.create({anonymousId,ipAddress:'127.0.0.1',browserFingerprint:'test',userAgent:'test',messages:[{role:'user',content:'Hello'}]});
 const before=await TripPlan.countDocuments({});
 const save=jest.spyOn(AnonymousSession.prototype,'save').mockRejectedValueOnce(new Error('write failed'));
 await expect(migrateGuestConversation({AnonymousSession,TripPlan,anonymousId,userId:new mongoose.Types.ObjectId()})).rejects.toThrow('write failed');
 save.mockRestore();
 expect(await TripPlan.countDocuments({})).toBe(before);
 expect((await AnonymousSession.findOne({anonymousId})).isConverted).toBe(false);
});

test('sign-up saves only the selected conversation and leaves other trips and quota intact',async()=>{
 const anonymousId=mintGuestSessionId(),userId=new mongoose.Types.ObjectId();
 await AnonymousSession.create({anonymousId,ipAddress:'127.0.0.1',browserFingerprint:'test',userAgent:'test',completedTurnCount:2,
 messages:[{role:'user',content:'Yellowstone',conversationId:'yellowstone'},
 {role:'assistant',content:'Three days',conversationId:'yellowstone'},
 {role:'user',content:'Glacier',conversationId:'glacier'},
 {role:'assistant',content:'Five days',conversationId:'glacier',artifactStatus:{status:'save_failed'}}]});
 const args={AnonymousSession,TripPlan,anonymousId,userId,conversationId:'glacier'};
 const id=await migrateGuestConversation(args);
 const trip=await TripPlan.findById(id).lean();
 expect(trip.conversation.map(m=>m.content)).toEqual(['Glacier','Five days']);
 expect(trip.conversation.at(-1).artifactStatus).toEqual({status:'save_failed'});
 expect(String(await migrateGuestConversation(args))).toBe(String(id));
 const guest=await AnonymousSession.findOne({anonymousId}).lean();
 expect(guest.messages).toHaveLength(4);expect(guest.completedTurnCount).toBe(2);expect(guest.isConverted).toBe(false);
 const other=await migrateGuestConversation({...args,conversationId:'yellowstone'});
 expect(String(other)).not.toBe(String(id));
 expect((await TripPlan.findById(other)).conversation.map(m=>m.content)).toEqual(['Yellowstone','Three days']);
});
