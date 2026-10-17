'use strict';
const {activityDurationRange,supportedDurationMaximum}=require('../evidenceActivityDuration');
const {buildEvidenceBoundRepairCandidates}=require('../evidenceBoundRepairCandidates');
const {candidateCard}=require('../compactRepairContext');
test.each([['3-4 Hours',180,240],['30–120 Minutes',30,120],['1.5 hours',90,90],['2 to 3 hrs',120,180]])('source range %s survives compact catalog', (source,min,max)=>{
 expect(activityDurationRange(source)).toEqual({minMinutes:min,maxMinutes:max,sourceText:source});
 const bundle={evidence:[{evidenceId:'route',topic:'activities',claim:{normalizedValue:{name:'Example Route',type:'walk',duration:source}}}]};
 const c=buildEvidenceBoundRepairCandidates({bundle,candidatePlan:{days:[]}}).candidates[0];
 expect(c.maxDurationMinutes).toBe(max);expect(candidateCard(c,bundle).sourceDurationRanges[0].minMinutes).toBe(min);
});
test.each(['unknown','all day','9 am - 5 pm','4-3 hours','0 minutes','about 3 hours',null])('ambiguous duration %s remains unknown',source=>{
 expect(activityDurationRange(source)).toBeNull();expect(supportedDurationMaximum({duration:source})).toBeNull();
});
test('explicit evidence bound wins conservatively over a broader range',()=>expect(supportedDurationMaximum({duration:'1-4 Hours',maxVisitDurationMinutes:120})).toBe(120));

test.each(['1-2 Hours', '30–120 Minutes', '2 hrs'])('synthesis sees the same minute bound as validation: %s', duration => {
 const { modelEvidenceValue } = require('../modelEvidenceView');
 const value = { name: 'Walk', duration, sourceDetails: 'Private full passage' };
 expect(modelEvidenceValue(value)).toEqual({ name: 'Walk', duration, supportedDurationMaximumMinutes: 120 });
 expect(value.sourceDetails).toBeDefined();
});
