'use strict';

const RESOURCE_KINDS = ['hotel', 'campground', 'permit', 'shuttle', 'rental_car', 'restaurant', 'attraction', 'tour'];
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contains = (text, value) => Boolean(normalized(value)) && ` ${normalized(text)} `.includes(` ${normalized(value)} `);
function resourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !url.hostname.includes('.') || /^(?:\d|\[)/.test(url.hostname)
      || /\.(?:local|localhost|internal)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function validResourceRequest(value) {
  return value && RESOURCE_KINDS.includes(value.kind)
    && ['name', 'destination'].every(key => typeof value[key] === 'string' && value[key].trim().length >= 2 && value[key].length <= 200);
}
function resourceQuery(resource) {
  if (!validResourceRequest(resource)) return null;
  return `"${resource.name.replace(/["\r\n]/g, ' ')}" "${resource.destination.replace(/["\r\n]/g, ' ')}" ${resource.kind.replace('_', ' ')} official reservations booking${resource.facilityId ? ' site:recreation.gov' : ''}`;
}
// Ranking chooses which bounded pages to inspect, never which pages to trust.
// A property-like hostname is only a priority signal, not verified ownership.
function selectResourceUrls(results, resource, limit = 2) {
  const candidates = results.map((result, index) => ({ result, index, url: resourceUrl(result.url) })).filter(item => item.url);
  if (resource.kind === 'hotel') {
    const nameWords = normalized(resource.name).split(' ').filter(word => !['the', 'hotel', 'hotels', 'inn', 'lodge', 'resort', 'and', 'suites'].includes(word));
    for (const item of candidates) {
      const titleMatch = contains(item.result.title, resource.name);
      const host = new URL(item.url).hostname.replace(/^www\./, '').split('.').slice(0, -1).join('').replace(/-/g, '');
      const propertyHost = nameWords.length > 0 && nameWords.join('').length >= 5 && [nameWords.join(''), normalized(resource.name).replace(/ /g, '')].includes(host);
      item.score = (titleMatch ? 40 : 0) + (titleMatch && propertyHost ? 100 : 0)
        + (contains(`${item.result.title || ''} ${item.result.content || ''}`, resource.destination) ? 20 : 0);
    }
    candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  }
  return [...new Set(candidates.map(item => item.result.url))].slice(0, limit);
}

// Search metadata alone is not verification. Require successful page extraction,
// exact resource name in the page/title and exact destination in the page body.
// This binds a resource page, never inventory, rates, or geographic coordinates.
function verifiedResourcePage(result, resource) {
  const url = resourceUrl(result.url);
  if (!url || result.extracted !== true || !result._extractedText || !validResourceRequest(resource)) return null;
  const text = result._extractedText;
  if (/\b(?:404 not found|page not found|resource not found|access denied|verify you are human)\b/i.test(text)) return null;
  if (!contains(text, resource.name) || !contains(text, resource.destination)
    || !contains(result.title || text, resource.name)) return null;
  const parsed = new URL(url);
  if (resource.facilityId) {
    if (!['recreation.gov', 'www.recreation.gov'].includes(parsed.hostname)) return null;
    // Inspect an independently discovered URL; never manufacture one from an ID.
    const id = String(resource.facilityId).replace(/^ridb:facility:/, '');
    if (!parsed.pathname.split('/').includes(id)) return null;
    if (resource.kind === 'campground' && !parsed.pathname.startsWith('/camping/campgrounds/')) return null;
    if (resource.kind === 'permit' && !parsed.pathname.startsWith('/permits/')) return null;
  }
  const booking = Boolean(resource.facilityId) || (/\b(book|reserve|reservation|reservations|tickets)\b/i.test(text)
    && /(?:book|reserv|ticket)/i.test(`${parsed.pathname} ${result.title || ''}`));
  return { resourceName: resource.name, destination: resource.destination, resourceKind: resource.kind,
    facilityId: resource.facilityId || null, listingUrl: url, reservationUrl: booking ? url : null,
    linkKind: booking ? 'reservation' : 'listing', verification: 'extracted_exact_resource_page',
    currentAvailability: null, price: null, availabilityDates: null };
}
module.exports = { RESOURCE_KINDS, normalized, resourceUrl, validResourceRequest, resourceQuery, verifiedResourcePage, selectResourceUrls };
