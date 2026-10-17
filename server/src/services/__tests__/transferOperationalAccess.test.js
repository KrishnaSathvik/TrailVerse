'use strict';
const { resolveOperationalAccess, transferDates } = require('../../utils/transferOperationalAccess');
const { extractOperationalFacts } = require('../../utils/operationalFactExtraction');
const fact = (type, extra={}) => ({type, provenance:{authority:'official_owner',sourceUrl:'https://www.nps.gov/access'},...extra});
test('ordinary unrestricted road requires positive access authority, not car memory',()=>{
 expect(resolveOperationalAccess([[fact('private_vehicle_access_allowed')],[fact('private_vehicle_access_allowed')]]).status).toBe('allowed');
 expect(resolveOperationalAccess([[],[]]).status).toBe('unknown');
});
test('one endpoint permission cannot authorize an entire transfer',()=>expect(resolveOperationalAccess([[fact('private_vehicle_access_allowed')],[]]).status).toBe('unknown'));
test('required shuttle overrides a provider road route or a rental car',()=>expect(resolveOperationalAccess([[fact('shuttle_ticket_required')],[]])).toMatchObject({status:'required_alternative',requiredMode:'shuttle'}));
test('conflicting required alternatives fail closed',()=>expect(resolveOperationalAccess([[fact('transfer_mode_required',{requiredMode:'ferry'}),fact('transfer_mode_required',{requiredMode:'shuttle'})]])).toMatchObject({status:'restricted',reason:'conflicting_access_evidence'}));
test('later dates resolve a bounded requirement; dates outside its window do not',()=>{
 const groups=[[fact('transfer_mode_required',{requiredMode:'shuttle',validFrom:'2027-05-01',validTo:'2027-10-01'})]];
 expect(resolveOperationalAccess(groups).status).toBe('unknown');
 expect(resolveOperationalAccess(groups,transferDates({startDate:'2027-07-01',durationDays:3})).requiredMode).toBe('shuttle');
 expect(resolveOperationalAccess(groups,{startDate:'2027-12-01',endDate:'2027-12-03'}).status).toBe('unknown');
});
test('source-less or model authority cannot permit driving',()=>{
 expect(resolveOperationalAccess([[{type:'private_vehicle_access_allowed'}]]).status).toBe('unknown');
 expect(resolveOperationalAccess([[fact('private_vehicle_access_allowed',{provenance:{authority:'model',sourceUrl:'https://example.com'}})]])).toMatchObject({status:'unknown'});
});
test('official restriction beats explicit permission',()=>expect(resolveOperationalAccess([[fact('private_vehicle_access_allowed'),fact('private_vehicle_restricted')]])).toMatchObject({status:'restricted'}));
test('generic extraction distinguishes positive, negated and seasonal official access statements',()=>{
 const extract=description=>extractOperationalFacts({item:{id:'place',name:'Example',url:'https://www.nps.gov/place',description},parkCode:'test'});
 expect(extract('Private vehicles are not allowed.').some(f=>f.type==='private_vehicle_access_allowed')).toBe(false);
 expect(resolveOperationalAccess([extract('Private vehicles are allowed.')]).status).toBe('allowed');
 expect(resolveOperationalAccess([extract('Private vehicles are allowed when the shuttle is not operating.')]).status).toBe('unknown');
 expect(resolveOperationalAccess([extract('Ferry is required.')]).requiredMode).toBe('ferry');
});
