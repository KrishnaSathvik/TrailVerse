/**
 * Lookup table of ~120 major US cities with lat/lon coordinates.
 * Used to extract departure location from user messages like "weekend trip from Chicago".
 *
 * Multi-word cities are checked first (longest match wins).
 * When a city name is ambiguous (e.g., "Portland"), defaults to the larger metro.
 */

const CITIES = {
  // Northeast
  'new york':         { lat: 40.71, lon: -74.01, state: 'NY' },
  'nyc':              { lat: 40.71, lon: -74.01, state: 'NY' },
  'manhattan':        { lat: 40.78, lon: -73.97, state: 'NY' },
  'brooklyn':         { lat: 40.68, lon: -73.94, state: 'NY' },
  'boston':            { lat: 42.36, lon: -71.06, state: 'MA' },
  'philadelphia':     { lat: 39.95, lon: -75.17, state: 'PA' },
  'philly':           { lat: 39.95, lon: -75.17, state: 'PA' },
  'pittsburgh':       { lat: 40.44, lon: -80.00, state: 'PA' },
  'baltimore':        { lat: 39.29, lon: -76.61, state: 'MD' },
  'washington dc':    { lat: 38.91, lon: -77.04, state: 'DC' },
  'washington':       { lat: 38.91, lon: -77.04, state: 'DC' },
  'dc':               { lat: 38.91, lon: -77.04, state: 'DC' },
  'richmond':         { lat: 37.54, lon: -77.44, state: 'VA' },
  'virginia beach':   { lat: 36.85, lon: -75.98, state: 'VA' },
  'newark':           { lat: 40.74, lon: -74.17, state: 'NJ' },
  'hartford':         { lat: 41.76, lon: -72.68, state: 'CT' },
  'providence':       { lat: 41.82, lon: -71.41, state: 'RI' },
  'buffalo':          { lat: 42.89, lon: -78.88, state: 'NY' },
  'rochester':        { lat: 43.16, lon: -77.61, state: 'NY' },
  'syracuse':         { lat: 43.05, lon: -76.15, state: 'NY' },
  'albany':           { lat: 42.65, lon: -73.76, state: 'NY' },
  'portland':         { lat: 45.52, lon: -122.68, state: 'OR' }, // defaults to OR (larger metro)

  // Southeast
  'atlanta':          { lat: 33.75, lon: -84.39, state: 'GA' },
  'miami':            { lat: 25.76, lon: -80.19, state: 'FL' },
  'tampa':            { lat: 27.95, lon: -82.46, state: 'FL' },
  'orlando':          { lat: 28.54, lon: -81.38, state: 'FL' },
  'jacksonville':     { lat: 30.33, lon: -81.66, state: 'FL' },
  'charlotte':        { lat: 35.23, lon: -80.84, state: 'NC' },
  'raleigh':          { lat: 35.78, lon: -78.64, state: 'NC' },
  'durham':           { lat: 35.99, lon: -78.90, state: 'NC' },
  'charleston':       { lat: 32.78, lon: -79.93, state: 'SC' },
  'savannah':         { lat: 32.08, lon: -81.09, state: 'GA' },
  'nashville':        { lat: 36.16, lon: -86.78, state: 'TN' },
  'knoxville':        { lat: 35.96, lon: -83.92, state: 'TN' },
  'memphis':          { lat: 35.15, lon: -90.05, state: 'TN' },
  'louisville':       { lat: 38.25, lon: -85.76, state: 'KY' },
  'lexington':        { lat: 38.04, lon: -84.50, state: 'KY' },
  'new orleans':      { lat: 29.95, lon: -90.07, state: 'LA' },
  'birmingham':       { lat: 33.52, lon: -86.81, state: 'AL' },
  'huntsville':       { lat: 34.73, lon: -86.59, state: 'AL' },
  'columbia':         { lat: 34.00, lon: -81.03, state: 'SC' },

  // Midwest
  'chicago':          { lat: 41.88, lon: -87.63, state: 'IL' },
  'detroit':          { lat: 42.33, lon: -83.05, state: 'MI' },
  'minneapolis':      { lat: 44.98, lon: -93.27, state: 'MN' },
  'st paul':          { lat: 44.95, lon: -93.09, state: 'MN' },
  'twin cities':      { lat: 44.96, lon: -93.18, state: 'MN' },
  'milwaukee':        { lat: 43.04, lon: -87.91, state: 'WI' },
  'madison':          { lat: 43.07, lon: -89.40, state: 'WI' },
  'indianapolis':     { lat: 39.77, lon: -86.16, state: 'IN' },
  'columbus':         { lat: 39.96, lon: -82.99, state: 'OH' },
  'cleveland':        { lat: 41.50, lon: -81.69, state: 'OH' },
  'cincinnati':       { lat: 39.10, lon: -84.51, state: 'OH' },
  'st louis':         { lat: 38.63, lon: -90.20, state: 'MO' },
  'kansas city':      { lat: 39.10, lon: -94.58, state: 'MO' },
  'omaha':            { lat: 41.26, lon: -95.94, state: 'NE' },
  'des moines':       { lat: 41.59, lon: -93.62, state: 'IA' },
  'grand rapids':     { lat: 42.96, lon: -85.67, state: 'MI' },
  'ann arbor':        { lat: 42.28, lon: -83.74, state: 'MI' },
  'dayton':           { lat: 39.76, lon: -84.19, state: 'OH' },
  'fargo':            { lat: 46.88, lon: -96.79, state: 'ND' },
  'sioux falls':      { lat: 43.55, lon: -96.73, state: 'SD' },
  'wichita':          { lat: 37.69, lon: -97.34, state: 'KS' },

  // Mountain West
  'denver':           { lat: 39.74, lon: -104.99, state: 'CO' },
  'boulder':          { lat: 40.01, lon: -105.27, state: 'CO' },
  'colorado springs': { lat: 38.83, lon: -104.82, state: 'CO' },
  'salt lake city':   { lat: 40.76, lon: -111.89, state: 'UT' },
  'slc':              { lat: 40.76, lon: -111.89, state: 'UT' },
  'boise':            { lat: 43.62, lon: -116.21, state: 'ID' },
  'billings':         { lat: 45.78, lon: -108.50, state: 'MT' },
  'missoula':         { lat: 46.87, lon: -114.00, state: 'MT' },
  'bozeman':          { lat: 45.68, lon: -111.04, state: 'MT' },
  'cheyenne':         { lat: 41.14, lon: -104.82, state: 'WY' },
  'jackson':          { lat: 43.48, lon: -110.76, state: 'WY' },
  'reno':             { lat: 39.53, lon: -119.81, state: 'NV' },

  // Southwest
  'phoenix':          { lat: 33.45, lon: -112.07, state: 'AZ' },
  'scottsdale':       { lat: 33.49, lon: -111.93, state: 'AZ' },
  'tucson':           { lat: 32.22, lon: -110.97, state: 'AZ' },
  'flagstaff':        { lat: 35.20, lon: -111.65, state: 'AZ' },
  'albuquerque':      { lat: 35.08, lon: -106.65, state: 'NM' },
  'santa fe':         { lat: 35.69, lon: -105.94, state: 'NM' },
  'las vegas':        { lat: 36.17, lon: -115.14, state: 'NV' },
  'el paso':          { lat: 31.76, lon: -106.44, state: 'TX' },

  // Texas
  'dallas':           { lat: 32.78, lon: -96.80, state: 'TX' },
  'houston':          { lat: 29.76, lon: -95.37, state: 'TX' },
  'san antonio':      { lat: 29.42, lon: -98.49, state: 'TX' },
  'austin':           { lat: 30.27, lon: -97.74, state: 'TX' },
  'fort worth':       { lat: 32.75, lon: -97.33, state: 'TX' },
  'dfw':              { lat: 32.90, lon: -97.04, state: 'TX' },

  // Pacific
  'los angeles':      { lat: 34.05, lon: -118.24, state: 'CA' },
  'la':               { lat: 34.05, lon: -118.24, state: 'CA' },
  'san francisco':    { lat: 37.77, lon: -122.42, state: 'CA' },
  'sf':               { lat: 37.77, lon: -122.42, state: 'CA' },
  'san diego':        { lat: 32.72, lon: -117.16, state: 'CA' },
  'san jose':         { lat: 37.34, lon: -121.89, state: 'CA' },
  'sacramento':       { lat: 38.58, lon: -121.49, state: 'CA' },
  'fresno':           { lat: 36.74, lon: -119.77, state: 'CA' },
  'bakersfield':      { lat: 35.37, lon: -119.02, state: 'CA' },
  'seattle':          { lat: 47.61, lon: -122.33, state: 'WA' },
  'tacoma':           { lat: 47.25, lon: -122.44, state: 'WA' },
  'spokane':          { lat: 47.66, lon: -117.43, state: 'WA' },
  'eugene':           { lat: 44.05, lon: -123.09, state: 'OR' },
  'bend':             { lat: 44.06, lon: -121.31, state: 'OR' },
  'anchorage':        { lat: 61.22, lon: -149.90, state: 'AK' },
  'honolulu':         { lat: 21.31, lon: -157.86, state: 'HI' },

  // Oklahoma / Arkansas
  'oklahoma city':    { lat: 35.47, lon: -97.52, state: 'OK' },
  'tulsa':            { lat: 36.15, lon: -95.99, state: 'OK' },
  'little rock':      { lat: 34.75, lon: -92.29, state: 'AR' },
};

module.exports = { CITIES };
