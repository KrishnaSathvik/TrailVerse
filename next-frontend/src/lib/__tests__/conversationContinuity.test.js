import {describe,it,expect} from 'vitest';
import {hasDeviceOnlyHistory,conversationSendBlocked} from '../conversationContinuity';
const history=[{role:'user',content:'Compare Zion and Bryce'},{role:'assistant',content:'Here is the comparison'}];
describe('authoritative conversation continuity',()=>{
 it('detects a visible cache against an empty server without requiring a trip',()=>expect(hasDeviceOnlyHistory(history,[])).toBe(true));
 it('server history wins over an older cached prefix',()=>expect(hasDeviceOnlyHistory(history,[...history,{role:'user',content:'make it five days'}])).toBe(false));
 it('mismatched conversations require reconciliation',()=>expect(hasDeviceOnlyHistory(history,[{role:'user',content:'Yellowstone'}])).toBe(true));
 it.each(['pending','error'])('blocks sending while restoration is %s',restoreStatus=>expect(conversationSendBlocked({restoreStatus})).toBe(true));
 it('allows chatting while a stale cache is available for optional recovery',()=>expect(conversationSendBlocked({restoreStatus:'empty',recoveryPending:{blocking:false}})).toBe(false));
 it('blocks a real reconciliation conflict',()=>expect(conversationSendBlocked({restoreStatus:'restored',recoveryPending:{blocking:true}})).toBe(true));
 it('allows a reconciled conversation',()=>expect(conversationSendBlocked({restoreStatus:'restored'})).toBe(false));
});

import { deviceOnlyMessages, guestCacheScope, completedRecoveryHistory, canRestoreHistoryPrefix, localRecoveryHistory, preserveRecoverySet, acknowledgeRecoverySet, shouldOfferRecovery } from '../conversationContinuity';
describe('recovery false-positive regressions', () => {
 it('does not mark a matching tail missing after an unmatched prefix', () => {
   const old = [{role:'user',content:'Old question'},{role:'assistant',content:'Old answer'}];
   expect(deviceOnlyMessages([...old, ...history], history)).toEqual(old);
   expect(canRestoreHistoryPrefix([...old, ...history], history)).toBe(true);
 });
 it('keeps repeated message multiplicity and changed wording as genuine mismatches', () => {
   expect(deviceOnlyMessages([...history, ...history], history)).toEqual(history);
   expect(hasDeviceOnlyHistory(history, [{...history[0]}, {...history[1], content:'Different answer'}])).toBe(true);
 });
 it('ignores metadata differences on a normal reload', () => {
   expect(hasDeviceOnlyHistory(history.map(m=>({...m,id:'local',timestamp:new Date()})), history.map(m=>({...m,_id:'server'})))).toBe(false);
 });
 it('never offers a restore for conflicting or reordered saved history', () => {
   expect(canRestoreHistoryPrefix(history, [{role:'user',content:'Another chat'}])).toBe(false);
   expect(canRestoreHistoryPrefix(history, history)).toBe(false);
   expect(canRestoreHistoryPrefix([history[0]], [])).toBe(false);
 });
 it.each([
   [{currentTripId:'account-trip',messages:history}, 'account_chat'],
   [{guestSessionId:'other',messages:history}, 'different_session'],
   [{guestSessionId:'guest',guestConversationId:'other-chat',messages:history}, 'different_conversation'],
   [{messages:history.map(m=>({...m,conversationId:'other-chat'}))}, 'different_conversation'],
   [{guestSessionId:'guest',guestConversationId:null,messages:history}, 'matching_or_legacy'],
   [{messages:history}, 'matching_or_legacy'],
 ])('checks cache ownership conservatively: %s', (cache, expected) => {
   expect(guestCacheScope(cache,{anonymousId:'guest'})).toBe(expected);
 });
 it('does not silently ignore an unowned legacy cache with real missing messages', () => {
   expect(guestCacheScope({messages:history}, {anonymousId:'guest'})).toBe('matching_or_legacy');
   expect(hasDeviceOnlyHistory(completedRecoveryHistory(history), [])).toBe(true);
 });
 it('does not mistake failed, pending, streaming, or UI-only rows for completed history', () => {
   const cache = [{role:'assistant',content:'Welcome'}, ...history,
     {role:'user',content:'Pending',isPending:true}, {role:'assistant',content:'Partial',isStreaming:true},
     {role:'user',content:'Failed',guestTurnFailed:true}, {role:'assistant',content:'Error',guestTurnFailed:true},
     {role:'assistant',content:'Sign up',isConversionMessage:true}];
   expect(completedRecoveryHistory(cache)).toEqual(history);
   expect(hasDeviceOnlyHistory(completedRecoveryHistory(cache), history)).toBe(false);
 });
});


describe('quiet recovery archive contract', () => {
 it('archives text without changing server authority and keeps exact-set acknowledgements across reloads', () => {
   localStorage.clear();
   const key = 'recovery:test';
   expect(preserveRecoverySet(localStorage, key, 'set-a', history)).toBe(false);
   acknowledgeRecoverySet(localStorage, key, 'set-a');
   expect(preserveRecoverySet(localStorage, key, 'set-a', history)).toBe(true);
   expect(shouldOfferRecovery(history, true)).toBe(false);
   expect(preserveRecoverySet(localStorage, key, 'set-b', [...history])).toBe(false);
   expect(JSON.parse(localStorage.getItem(`${key}:sets`))[0].messages).toEqual(history);
 });
 it('only offers unsaved visible user text, not assistant-only or hidden kickoff text', () => {
   expect(shouldOfferRecovery([history[1]])).toBe(false);
   expect(shouldOfferRecovery([{...history[0],hiddenFromUi:true},history[1]])).toBe(false);
   expect(shouldOfferRecovery(history)).toBe(true);
 });
 it('still blocks active writes and unconfirmed server status', () => {
   expect(conversationSendBlocked({recovering:true,restoreStatus:'restored'})).toBe(true);
   expect(conversationSendBlocked({generating:true,restoreStatus:'restored'})).toBe(true);
   expect(conversationSendBlocked({restoreStatus:'error'})).toBe(true);
 });
});

it('preserves an unsaved user draft as backup text without offering an unsafe incomplete restore', () => {
 const draft = {role:'user',content:'Please keep this unsaved question',guestTurnFailed:true};
 const local = localRecoveryHistory([draft]);
 expect(local).toEqual([draft]);
 expect(shouldOfferRecovery(local)).toBe(true);
 expect(canRestoreHistoryPrefix(local,[])).toBe(false);
});
