'use strict';
const { NPSService } = require('../npsService');
const { createOfficialRecordsLookup } = require('../providers/namedPlaceOfficialRecords');

function service() {
 const instance = Object.create(NPSService.prototype);
 instance._loadBulkSnapshotWithCompleteness = jest.fn(async () => null);
 instance._getParkEvidenceListPaginated = jest.fn(async () => ({data:[{id:'place'}],isComplete:true,observedAt:'2026-10-09T12:00:00Z'}));
 return instance;
}
test('identity evidence fetches only places and retains the caller cancellation signal', async () => {
 const nps=service(), signal=new AbortController().signal;
 const result=await nps.getParkPlacesEvidence('yell',{signal});
 expect(nps._loadBulkSnapshotWithCompleteness).toHaveBeenCalledTimes(1);
 expect(nps._loadBulkSnapshotWithCompleteness).toHaveBeenCalledWith('bulk-places');
 expect(nps._getParkEvidenceListPaginated).toHaveBeenCalledWith('/places','yell',{signal,pageSize:500});
 expect(result).toMatchObject({data:{places:[{id:'place'}]},isComplete:true,source:'direct_fallback'});
});
test('a larger identity page still paginates and proves completeness', async () => {
 const nps=service();
 nps._getParkEvidenceListPaginated=NPSService.prototype._getParkEvidenceListPaginated;
 nps.api={get:jest.fn().mockResolvedValueOnce({data:{total:'501',data:Array.from({length:500},(_,i)=>({id:String(i)}))}}).mockResolvedValueOnce({data:{total:'501',data:[{id:'500'}]}})};
 const result=await nps.getParkPlacesEvidence('yell');
 expect(result.data.places).toHaveLength(501);
 expect(result.isComplete).toBe(true);
 expect(nps.api.get.mock.calls.map(([,args])=>args.params.start)).toEqual([0,500]);
});
test('independent park corpora start concurrently and their owned places remain attributable', async () => {
 const resolves=[];
 const getParkPlacesEvidence=jest.fn(code=>new Promise(resolve=>resolves.push(()=>resolve({observedAt:'2026-10-09T12:00:00Z',data:{places:[{id:code,title:code,url:`https://www.nps.gov/places/${code}.htm`,latitude:'40',longitude:'-110'}]}}))));
 const lookup=createOfficialRecordsLookup({service:()=>({getParkPlacesEvidence})});
 const pending=lookup([{parkCode:'yell',sourceId:'nps:park:yell'},{parkCode:'glac',sourceId:'nps:park:glac'}]);
 expect(getParkPlacesEvidence).toHaveBeenCalledTimes(2);
 resolves.forEach(resolve=>resolve());
 const rows=await pending;
 expect(rows.map(row=>row.officialParkCode).sort()).toEqual(['glac','yell']);
});
