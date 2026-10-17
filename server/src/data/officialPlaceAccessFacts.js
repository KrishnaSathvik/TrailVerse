'use strict';

// Curated facility access facts. Trail accessibility is intentionally separate:
// an accessible restroom or visitor center does not certify a connecting hike.
// Source reviewed 2026-09-23; these are static suitability, not opening-status facts.
module.exports = Object.freeze({
  'nps:park:zion': {
    sourceUrl: 'https://www.nps.gov/zion/planyourvisit/accessibility.htm',
    reviewedAt: '2026-09-23',
    places: [
      { name: 'Zion Human History Museum Patio', category: 'viewpoint', sourceUrl: 'https://www.nps.gov/places/zion-human-history-museum.htm', accessibility: 'Wheelchair accessible viewing patio overlooking West Temple and the Towers of the Virgin. Use the museum parking approach.', limitation: 'The trail connector is not accessible.' },
      { name: 'Zion Canyon Visitor Center', category: 'visitor_center', accessibility: 'Wheelchair accessible facility with reserved parking and paved walkways.' },
      { name: 'Zion Human History Museum', category: 'museum', accessibility: 'Wheelchair accessible exhibits and park film, with a ramp to the building. Seasonal hours apply.' },
      { name: 'Human History Museum', category: 'museum', accessibility: 'Wheelchair accessible exhibits and park film, with a ramp to the building. Seasonal hours apply.' },
      { name: 'Zion Nature Center', category: 'visitor_center', accessibility: 'Wheelchair accessible exhibits and activities, with a ramp to the entrance. Seasonal hours apply.' },
      { name: 'Kolob Canyons Visitor Center', category: 'visitor_center', accessibility: 'Wheelchair accessible walkways, information desk, exhibits and restrooms.' },
      { name: 'Zion Lodge', category: 'lodging', accessibility: 'Wheelchair accessible dining room, auditorium and restrooms. Shuttle access restrictions still apply.' },
      { name: 'South Fork Picnic Area', category: 'picnic_area', accessibility: 'Wheelchair accessible parking and restroom, level compacted gravel picnic area with extended tables.' },
    ],
  },
});
