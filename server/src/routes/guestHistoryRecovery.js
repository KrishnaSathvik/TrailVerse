'use strict';
const express=require('express');
const AnonymousSession=require('../models/AnonymousSession');
const {resolveAnonymousRequestIdentity,isValidGuestSessionId}=require('../utils/anonymousIdGenerator');
const {historyHash,recoveryPrefix}=require('../utils/guestHistoryRecovery');
const router=express.Router();
router.post('/restore-guest-history',async(req,res)=>{
 try {
  const {anonymousId,messages,expectedHistoryHash}=req.body || {};
  if(!isValidGuestSessionId(anonymousId))return res.status(400).json({error:'invalid_session'});
  recoveryPrefix(messages, []); // Validate before creating or touching a session.
  const identity=resolveAnonymousRequestIdentity(req,anonymousId);
  if(identity.anonymousId!==anonymousId)return res.status(400).json({error:'invalid_session'});
  await AnonymousSession.findOrCreateSession(anonymousId,{...identity,userAgent:identity.userAgent || 'unknown'});
  const session=await AnonymousSession.findOne({anonymousId}).lean();
  if(session.isConverted || session.turns?.some(t=>t.status==='pending'))return res.status(409).json({error:'session_busy'});
  const current=historyHash(session.messages);
  if(session.historyRecoveryHash)return res.status(409).json({error:'history_already_recovered'});
  if(current!==expectedHistoryHash)return res.status(409).json({error:'history_changed'});
  const prefix=recoveryPrefix(messages,session.messages || []);
  if(!prefix.length)return res.json({messages:session.messages,historyHash:current});
  const updated=await AnonymousSession.findOneAndUpdate({_id:session._id,isConverted:false,historyRecoveryHash:{$exists:false},updatedAt:session.updatedAt,turns:{$not:{$elemMatch:{status:'pending'}}}},
   {$set:{messages:[...prefix,...session.messages],historyRecoveryHash:historyHash(prefix),lastActivity:new Date()}},{new:true});
  if(!updated)return res.status(409).json({error:'history_changed'});
  // No quota reset, imported completed turns, canonical plans, or memory writes.
  res.json({messages:updated.messages,historyHash:historyHash(updated.messages)});
 }catch(e){res.status(['invalid_history','history_conflict','incomplete_history'].includes(e.message)?400:500).json({error:['invalid_history','history_conflict','incomplete_history'].includes(e.message)?e.message:'history_recovery_failed'});}
});
module.exports=router;
