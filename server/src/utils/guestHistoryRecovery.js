'use strict';
const {createHash}=require('crypto');
const historyHash = messages => createHash('sha256').update(JSON.stringify((messages || []).map(m=>({role:m.role,content:m.content})))).digest('hex');
function recoveryPrefix(cached, server) {
  if (!Array.isArray(cached) || cached.length > 40 || !cached.length) throw Error('invalid_history');
  const text = cached.map((m,index)=>{
    if (!['user','assistant'].includes(m?.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length>12000) throw Error('invalid_history');
    if (index && cached[index-1]?.role === m.role) throw Error('invalid_history');
    return {role:m.role,content:m.content};
  });
  if (JSON.stringify(text).length>60000 || text[0].role!=='user') throw Error('invalid_history');
  // Only prepend a missing prefix; never overwrite any server-owned turn.
  const count=server.length;
  if (count && (text.length<count || historyHash(text.slice(-count))!==historyHash(server))) throw Error('history_conflict');
  const prefix=text.slice(0,text.length-count);
  if (prefix.length && prefix.at(-1).role!=='assistant') throw Error('incomplete_history');
  return prefix.map(m=>({...m,historyOrigin:'device_recovery',timestamp:new Date()}));
}
module.exports={historyHash,recoveryPrefix};
