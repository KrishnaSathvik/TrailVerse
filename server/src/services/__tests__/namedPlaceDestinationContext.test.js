'use strict';
jest.mock('../npsService',()=>({getNpsService:()=>({getCachedParks:()=>[
 {fullName:'Zion National Park',designation:'National Park',parkCode:'zion',states:'UT',latitude:'37.3',longitude:'-113'},
 {fullName:'Bryce Canyon National Park',designation:'National Park',parkCode:'brca',states:'UT',latitude:'37.6',longitude:'-112.2'}
]})}));
const {createSimpleTravelTools}=require('../trailieTravelData');
test('composite destination obtains structured anchors without becoming administrative geography',async()=>{
 const dispatchEphemeral=jest.fn(async()=>({status:'no_result',normalizedCandidates:[]}));
 const tools=createSimpleTravelTools({broker:{dispatchEphemeral}});
 await tools.execute('read_travel',{destination:'Zion and Bryce Canyon via Las Vegas',question:'Plan a visit',topics:['activities'],places:['Springdale']},{requestId:'anchors',userMessage:'Plan a visit'});
 const request=dispatchEphemeral.mock.calls.map(c=>c[0].requirement).find(r=>r.preferredProviders.includes('named_place'));
 expect(request.queryProvenance.contextualRegions).toEqual([]);
 expect(request.queryProvenance.destinationAnchors.map(a=>a.sourceId)).toEqual(['nps:park:zion','nps:park:brca']);
 expect(request.queryProvenance.destinationAnchors.every(a=>a.states[0]==='UT')).toBe(true);
});

test('both catalog destinations resolve by their official short names without external place lookup', async () => {
 const dispatchEphemeral = jest.fn(async () => ({ status: 'no_result', normalizedCandidates: [] }));
 const tools = createSimpleTravelTools({ broker: { dispatchEphemeral } });
 const result = await tools.execute('read_travel', { destination: 'Zion and Bryce Canyon', question: 'Two bases',
   topics: ['activities'], places: ['Zion', 'Bryce Canyon'] }, { requestId: 'two-catalog-bases', userMessage: 'Zion and Bryce Canyon' });
 expect(result.namedPlaceResolutions.map(row => row.status)).toEqual(['resolved', 'resolved']);
 expect(result.namedPlaceResolutions.map(row => row.canonicalPlaceId)).toEqual(['nps:park:zion', 'nps:park:brca']);
 expect(result.evidence.filter(row => row.topic === 'destination_identity')).toHaveLength(2);
 expect(dispatchEphemeral.mock.calls.some(([call]) => call.requirement.preferredProviders.includes('named_place'))).toBe(false);
});
