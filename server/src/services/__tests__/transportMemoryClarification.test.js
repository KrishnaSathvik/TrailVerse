'use strict';
const { PROPOSE_TOOL, validateSimpleMutation } = require('../trailieSimpleGuard');
const { createResponsesRequest } = require('../responsesAdapter');
const { buildOpenAIRequest } = require('../providers/openaiResponsesAdapter');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');
test('Sol receives the transportation clarification in its actual tool parameters', () => {
  const body = buildOpenAIRequest(createResponsesRequest({provider:'openai',model:'gpt-6.1-sol',input:[{role:'user',content:'Plan a trip'}],maxOutputTokens:1000,reasoning:{effort:'low'},tools:[PROPOSE_TOOL]}));
  const text = body.tools[0].parameters.properties.memory_updates.items.properties.value.description;
  expect(text).toContain('transportation.mode accepts only drive or fly');
  expect(text).toContain('A traveler may fly and rent a car');
  expect(text).toContain('A rental car alone does not establish how the traveler reaches the destination');
  expect(text).toContain('Omit unsupported or unknown values');
});
test.each([
 ['We will fly and rent a car.', {mode:'fly',rentalCar:true}],
 ['We will drive our own car.', {mode:'drive'}],
 ['We have a rental car.', {rentalCar:true}],
])('unchanged contract accepts verified fields: %s', async (message,value) => {
 const updates=[{field:'transportation',value,sourceQuote:message}];
 const {receipt}=await stubMemoryVerifier()({message,updates});
 const result=validateSimpleMutation({message,memoryAuthority:receipt,proposal:{response:'Noted.',memory_updates:updates}});
 expect(result.ok).toBe(true);expect(result.planningState.transportation).toMatchObject(value);
 if(!value.mode)expect(result.planningState.transportation.mode).toBeUndefined();
});
test('unsupported rental claim remains rejected', async()=>{
 const message='Maybe we will rent a car.',updates=[{field:'transportation',value:{rentalCar:true},sourceQuote:message}];
 const {receipt}=await stubMemoryVerifier('hypothetical')({message,updates});
 const result=validateSimpleMutation({message,memoryAuthority:receipt,proposal:{response:'Noted.',memory_updates:updates}});
 expect(result.ok).toBe(false);expect(result.planningState.transportation?.rentalCar).not.toBe(true);
});
test('rental car remains invalid as mode even with semantic support',async()=>{
 const message='We have a rental car.',updates=[{field:'transportation',value:{mode:'rental car',rentalCar:true},sourceQuote:message}];
 const {receipt}=await stubMemoryVerifier()({message,updates});
 expect(validateSimpleMutation({message,memoryAuthority:receipt,proposal:{response:'Noted.',memory_updates:updates}}).issues).toContain('transport_memory_invalid');
});
