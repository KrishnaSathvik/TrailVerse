import { getApiBaseUrl } from '@/lib/apiBase';

/** Full US state/territory slug → NPS two-letter code. */
export const STATE_MAP = {
  alabama: { name: 'Alabama', code: 'AL' },
  alaska: { name: 'Alaska', code: 'AK' },
  arizona: { name: 'Arizona', code: 'AZ' },
  arkansas: { name: 'Arkansas', code: 'AR' },
  california: { name: 'California', code: 'CA' },
  colorado: { name: 'Colorado', code: 'CO' },
  connecticut: { name: 'Connecticut', code: 'CT' },
  delaware: { name: 'Delaware', code: 'DE' },
  'district-of-columbia': { name: 'District of Columbia', code: 'DC' },
  florida: { name: 'Florida', code: 'FL' },
  georgia: { name: 'Georgia', code: 'GA' },
  hawaii: { name: 'Hawaii', code: 'HI' },
  idaho: { name: 'Idaho', code: 'ID' },
  illinois: { name: 'Illinois', code: 'IL' },
  indiana: { name: 'Indiana', code: 'IN' },
  iowa: { name: 'Iowa', code: 'IA' },
  kansas: { name: 'Kansas', code: 'KS' },
  kentucky: { name: 'Kentucky', code: 'KY' },
  louisiana: { name: 'Louisiana', code: 'LA' },
  maine: { name: 'Maine', code: 'ME' },
  maryland: { name: 'Maryland', code: 'MD' },
  massachusetts: { name: 'Massachusetts', code: 'MA' },
  michigan: { name: 'Michigan', code: 'MI' },
  minnesota: { name: 'Minnesota', code: 'MN' },
  mississippi: { name: 'Mississippi', code: 'MS' },
  missouri: { name: 'Missouri', code: 'MO' },
  montana: { name: 'Montana', code: 'MT' },
  nebraska: { name: 'Nebraska', code: 'NE' },
  nevada: { name: 'Nevada', code: 'NV' },
  'new-hampshire': { name: 'New Hampshire', code: 'NH' },
  'new-jersey': { name: 'New Jersey', code: 'NJ' },
  'new-mexico': { name: 'New Mexico', code: 'NM' },
  'new-york': { name: 'New York', code: 'NY' },
  'north-carolina': { name: 'North Carolina', code: 'NC' },
  'north-dakota': { name: 'North Dakota', code: 'ND' },
  ohio: { name: 'Ohio', code: 'OH' },
  oklahoma: { name: 'Oklahoma', code: 'OK' },
  oregon: { name: 'Oregon', code: 'OR' },
  pennsylvania: { name: 'Pennsylvania', code: 'PA' },
  'rhode-island': { name: 'Rhode Island', code: 'RI' },
  'south-carolina': { name: 'South Carolina', code: 'SC' },
  'south-dakota': { name: 'South Dakota', code: 'SD' },
  tennessee: { name: 'Tennessee', code: 'TN' },
  texas: { name: 'Texas', code: 'TX' },
  utah: { name: 'Utah', code: 'UT' },
  vermont: { name: 'Vermont', code: 'VT' },
  virginia: { name: 'Virginia', code: 'VA' },
  washington: { name: 'Washington', code: 'WA' },
  'west-virginia': { name: 'West Virginia', code: 'WV' },
  wisconsin: { name: 'Wisconsin', code: 'WI' },
  wyoming: { name: 'Wyoming', code: 'WY' },
  'american-samoa': { name: 'American Samoa', code: 'AS' },
  guam: { name: 'Guam', code: 'GU' },
  'puerto-rico': { name: 'Puerto Rico', code: 'PR' },
  'virgin-islands': { name: 'Virgin Islands', code: 'VI' },
};

const STATE_FIELDS = 'parkCode,fullName,states,images,designation,description';

export function getStateHub(slug) {
  if (!slug) return null;
  const key = String(slug).toLowerCase();
  return Object.hasOwn(STATE_MAP, key) ? STATE_MAP[key] : null;
}

/**
 * Fetch a cacheable compact directory and filter by exact NPS state code. Never throws.
 * `ok: false` means the API failed — callers must not treat that as a 404.
 */
export async function fetchParksForState(stateAbbr) {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/parks?all=true&fields=${STATE_FIELDS}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return { ok: false, parks: [] };
    const json = await res.json();
    if (!Array.isArray(json?.data)) return { ok: false, parks: [] };
    // The production API ignores the state query parameter. Share one cache entry
    // below Next's 2 MB limit, then filter locally (including multi-state sites).
    const code = String(stateAbbr).trim().toUpperCase();
    const parks = json.data.filter(park =>
      String(park.states || '').split(',').some(state => state.trim().toUpperCase() === code)
    );
    return { ok: true, parks };
  } catch {
    return { ok: false, parks: [] };
  }
}
