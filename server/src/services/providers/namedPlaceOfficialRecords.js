'use strict';
// Reuse the NPS service's structured evidence corpus. A thing-to-do title is
// not a place; only /places records with their own identity and coordinates qualify.
function createOfficialRecordsLookup({ service = () => require('../npsService').getNpsService() } = {}) {
  const pending = new Map();
  return async (anchors, {signal} = {}) => {
    const rows = [];
    await Promise.all(anchors.map(async anchor => {
      // Coalesce independent stop lookups for the same park in this research wave.
      const cacheKey = `${anchor.parkCode}:${anchor.sourceId}`;
      let entry = pending.get(cacheKey);
      if (!entry || entry.expires <= Date.now()) {
        const promise = service().getParkPlacesEvidence(anchor.parkCode,{signal});
        entry = {promise,expires:Date.now()+30000};pending.set(cacheKey,entry);
        promise.catch(()=>pending.delete(cacheKey));
        if (pending.size>32) pending.delete(pending.keys().next().value);
      }
      const result = await entry.promise;
      for (const p of result.data?.places || []) {
        if (!p.id || !p.title || !/^https:\/\/(?:www\.)?nps\.gov\//i.test(p.url || '') || p.latitude == null || p.latitude === '' || p.longitude == null || p.longitude === '') continue;
        rows.push({name:p.title,place_id:`nps:place:${p.id}`,types:['point_of_interest'],
          officialParkCode:anchor.parkCode,officialUrl:p.url,observedAt:result.observedAt,
          address_components:[{short_name:'US',types:['country']},...(anchor.states?.length===1?[{short_name:anchor.states[0],types:['administrative_area_level_1']}]:[])],
          formatted_address:anchor.states?.join(', ') || '',geometry:{location:{lat:Number(p.latitude),lng:Number(p.longitude)}}});
      }
    }));
    return rows;
  };
}
module.exports={createOfficialRecordsLookup};
