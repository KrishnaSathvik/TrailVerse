/**
 * Major US commercial airports for Trailie driving-time injection (park access).
 * IATA code → { name, lat, lon }
 */
const AIRPORTS = {
  ATL: { name: 'Atlanta Hartsfield-Jackson (ATL)', lat: 33.6407, lon: -84.4277 },
  LAX: { name: 'Los Angeles Intl (LAX)', lat: 33.9416, lon: -118.4085 },
  ORD: { name: 'Chicago O\'Hare (ORD)', lat: 41.9742, lon: -87.9073 },
  DFW: { name: 'Dallas/Fort Worth (DFW)', lat: 32.8998, lon: -97.0403 },
  DEN: { name: 'Denver Intl (DEN)', lat: 39.8561, lon: -104.6737 },
  JFK: { name: 'New York JFK (JFK)', lat: 40.6413, lon: -73.7781 },
  SFO: { name: 'San Francisco Intl (SFO)', lat: 37.6213, lon: -122.379 },
  SEA: { name: 'Seattle-Tacoma (SEA)', lat: 47.4502, lon: -122.3088 },
  LAS: { name: 'Las Vegas Harry Reid (LAS)', lat: 36.084, lon: -115.1537 },
  MCO: { name: 'Orlando Intl (MCO)', lat: 28.4312, lon: -81.3081 },
  MIA: { name: 'Miami Intl (MIA)', lat: 25.7959, lon: -80.287 },
  PHX: { name: 'Phoenix Sky Harbor (PHX)', lat: 33.4373, lon: -112.0078 },
  IAH: { name: 'Houston George Bush (IAH)', lat: 29.9902, lon: -95.3368 },
  BOS: { name: 'Boston Logan (BOS)', lat: 42.3656, lon: -71.0096 },
  MSP: { name: 'Minneapolis-St Paul (MSP)', lat: 44.8848, lon: -93.2223 },
  DTW: { name: 'Detroit Metro (DTW)', lat: 42.2162, lon: -83.3554 },
  PHL: { name: 'Philadelphia Intl (PHL)', lat: 39.8744, lon: -75.2424 },
  SLC: { name: 'Salt Lake City Intl (SLC)', lat: 40.7884, lon: -111.9778 },
  SAN: { name: 'San Diego Intl (SAN)', lat: 32.7338, lon: -117.1933 },
  BWI: { name: 'Baltimore/Washington (BWI)', lat: 39.1774, lon: -76.6684 },
  DCA: { name: 'Washington Reagan (DCA)', lat: 38.8512, lon: -77.0402 },
  IAD: { name: 'Washington Dulles (IAD)', lat: 38.9531, lon: -77.4565 },
  PDX: { name: 'Portland Intl (PDX)', lat: 45.5898, lon: -122.5951 },
  STL: { name: 'St Louis Lambert (STL)', lat: 38.7487, lon: -90.37 },
  BNA: { name: 'Nashville Intl (BNA)', lat: 36.1263, lon: -86.6774 },
  AUS: { name: 'Austin-Bergstrom (AUS)', lat: 30.1975, lon: -97.6664 },
  MSY: { name: 'New Orleans Louis Armstrong (MSY)', lat: 29.9934, lon: -90.258 },
  SJC: { name: 'San Jose Intl (SJC)', lat: 37.3639, lon: -121.9289 },
  OAK: { name: 'Oakland Intl (OAK)', lat: 37.7126, lon: -122.2197 },
  SMF: { name: 'Sacramento Intl (SMF)', lat: 38.6954, lon: -121.5908 },
  RNO: { name: 'Reno-Tahoe Intl (RNO)', lat: 39.4991, lon: -119.7681 },
  BOI: { name: 'Boise Airport (BOI)', lat: 43.5644, lon: -116.2228 },
  ABQ: { name: 'Albuquerque Intl (ABQ)', lat: 35.0402, lon: -106.6091 },
  TUS: { name: 'Tucson Intl (TUS)', lat: 32.1161, lon: -110.941 },
  ELP: { name: 'El Paso Intl (ELP)', lat: 31.8073, lon: -106.3776 },
  OKC: { name: 'Oklahoma City Will Rogers (OKC)', lat: 35.3931, lon: -97.6007 },
  MCI: { name: 'Kansas City Intl (MCI)', lat: 39.2976, lon: -94.7139 },
  IND: { name: 'Indianapolis Intl (IND)', lat: 39.7173, lon: -86.2944 },
  CLE: { name: 'Cleveland Hopkins (CLE)', lat: 41.4117, lon: -81.8498 },
  PIT: { name: 'Pittsburgh Intl (PIT)', lat: 40.4915, lon: -80.2329 },
  RDU: { name: 'Raleigh-Durham (RDU)', lat: 35.8776, lon: -78.7875 },
  CLT: { name: 'Charlotte Douglas (CLT)', lat: 35.214, lon: -80.9431 },
  JAX: { name: 'Jacksonville Intl (JAX)', lat: 30.4941, lon: -81.6879 },
  TPA: { name: 'Tampa Intl (TPA)', lat: 27.9755, lon: -82.5332 },
  FLL: { name: 'Fort Lauderdale (FLL)', lat: 26.0726, lon: -80.1527 },
  ANC: { name: 'Anchorage Ted Stevens (ANC)', lat: 61.1744, lon: -149.9963 },
  FAI: { name: 'Fairbanks Intl (FAI)', lat: 64.8151, lon: -147.8563 },
  JNU: { name: 'Juneau Intl (JNU)', lat: 58.3549, lon: -134.5763 },
  HNL: { name: 'Honolulu Daniel K. Inouye (HNL)', lat: 21.3187, lon: -157.9225 },
  OGG: { name: 'Kahului Maui (OGG)', lat: 20.8986, lon: -156.4305 },
  KOA: { name: 'Kona Ellison Onizuka (KOA)', lat: 19.7388, lon: -156.0456 },
  ITO: { name: 'Hilo Intl (ITO)', lat: 19.7214, lon: -155.0485 },
  BZN: { name: 'Bozeman Yellowstone (BZN)', lat: 45.7775, lon: -111.1527 },
  JAC: { name: 'Jackson Hole (JAC)', lat: 43.6073, lon: -110.7377 },
  GEG: { name: 'Spokane Intl (GEG)', lat: 47.6199, lon: -117.5338 },
  BIL: { name: 'Billings Logan (BIL)', lat: 45.8077, lon: -108.5429 },
  GJT: { name: 'Grand Junction (GJT)', lat: 39.1224, lon: -108.5267 },
  CPR: { name: 'Casper/Natrona County (CPR)', lat: 42.908, lon: -106.4644 },
  FLG: { name: 'Flagstaff Pulliam (FLG)', lat: 35.1385, lon: -111.6712 },
  CDC: { name: 'Cedar City Regional (CDC)', lat: 37.701, lon: -113.099 },
};

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestAirports(lat, lon, count = 2) {
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return [];

  return Object.entries(AIRPORTS)
    .map(([code, airport]) => ({
      code,
      name: airport.name,
      lat: airport.lat,
      lon: airport.lon,
      distMi: Math.round(haversineMi(lat, lon, airport.lat, airport.lon)),
    }))
    .sort((a, b) => a.distMi - b.distMi)
    .slice(0, count);
}

function getAirportByCode(code) {
  const upper = String(code || '').toUpperCase();
  const airport = AIRPORTS[upper];
  if (!airport) return null;
  return { code: upper, name: airport.name, lat: airport.lat, lon: airport.lon };
}

module.exports = {
  AIRPORTS,
  getNearestAirports,
  getAirportByCode,
  haversineMi,
};
