// NPS GTFS feed coverage (as of 2026-05 dataset)
// Used to conditionally show the Transit tab without an eager network request.
export const PARK_CODES_WITH_GTFS = new Set([
  'acad',
  'alca',
  'band',
  'boha',
  'brca',
  'calo',
  'dena',
  'depo',
  'drto',
  'foma',
  'fosu',
  'glac',
  'grca',
  'guis',
  'hafe',
  'romo',
  'seki',
  'stli',
  'yose',
  'zion',
]);

export function parkHasGtfs(parkCode) {
  return PARK_CODES_WITH_GTFS.has(String(parkCode || '').toLowerCase());
}
