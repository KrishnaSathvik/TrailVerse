'use strict';
const {lexical}=require('./namedPlaceEquivalence');
const RELATIONSHIPS=new Set(['trailhead_for','access_point_for','loop_for','overlook_for','entrance_for']);
// Adapter-owned structured relationships only. Names, proximity and search order
// cannot create this assertion. Current NPS/Google lookup records normally have
// no such relationship; they remain exact identities or separate alternatives.
function supportedExperienceAnchor(name, place, anchors=[]) {
  if(!place.officialParkCode || !anchors.some(a=>a.parkCode===place.officialParkCode)
    || !String(place.place_id).startsWith('nps:place:')) return null;
  const relations=(place.experienceRelations||[]).filter(r=>r.experience?.id?.startsWith('nps:experience:')
    && lexical(r.experience.name)===lexical(name) && r.anchorId===place.place_id
    && r.sourceRecordId===place.place_id && r.sourceUrl===place.officialUrl
    && /^https:\/\/(?:www\.)?nps\.gov\/places\//i.test(r.sourceUrl||'') && RELATIONSHIPS.has(r.relationship));
  if(relations.length!==1)return null;
  const r=relations[0];
  return {experience:{id:r.experience.id,name:r.experience.name},mapAnchor:{canonicalPlaceId:place.place_id,name:place.name,relationship:r.relationship,sourceRecordId:r.sourceRecordId,sourceUrl:r.sourceUrl}};
}
module.exports={supportedExperienceAnchor};
