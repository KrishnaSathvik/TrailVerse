import {describe,it,expect} from 'vitest';
import {hasDeviceOnlyHistory,conversationSendBlocked} from '../conversationContinuity';
const history=[{role:'user',content:'Compare Zion and Bryce'},{role:'assistant',content:'Here is the comparison'}];
describe('authoritative conversation continuity',()=>{
 it('detects a visible cache against an empty server without requiring a trip',()=>expect(hasDeviceOnlyHistory(history,[])).toBe(true));
 it('server history wins over an older cached prefix',()=>expect(hasDeviceOnlyHistory(history,[...history,{role:'user',content:'make it five days'}])).toBe(false));
 it('mismatched conversations require reconciliation',()=>expect(hasDeviceOnlyHistory(history,[{role:'user',content:'Yellowstone'}])).toBe(true));
 it.each(['pending','error'])('blocks sending while restoration is %s',restoreStatus=>expect(conversationSendBlocked({restoreStatus})).toBe(true));
 it('blocks until recovery is explicitly resolved',()=>expect(conversationSendBlocked({restoreStatus:'empty',recoveryPending:{}})).toBe(true));
 it('allows a reconciled conversation',()=>expect(conversationSendBlocked({restoreStatus:'restored'})).toBe(false));
});
