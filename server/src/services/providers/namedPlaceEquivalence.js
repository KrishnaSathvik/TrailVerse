'use strict';
const lexical = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/['’‘`]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const vague = name => /^(?:a|an|some|any)\s/i.test(name) || /\b(?:near|nearby|somewhere|nice|shorter|scenic area)\b/i.test(name);
const component = (place, type) => place.address_components?.find(c => c.types?.includes(type));
function trustedAnchors(provenance = {}) {
  return (provenance.destinationAnchors || []).filter(a => a.source === 'nps' && a.parkCode && a.name && a.sourceId === `nps:park:${a.parkCode}` && a.country === 'US');
}
function matchName(requested, candidate, anchors, { requireGeography = true } = {}) {
  const a = lexical(requested), b = lexical(candidate.name);
  if (!a || vague(requested)) return { type: 'none', anchor: null };
  if (a === b) return { type: requested === candidate.name ? 'exact' : 'normalized_exact', anchor: null };
  for (const anchor of anchors) {
    const full = lexical(anchor.name), short = lexical(anchor.shortName);
    // Only whole verified qualifiers at an edge, never arbitrary token deletion.
    const unqualified = value => {
      for (const qualifier of [full, short].filter(Boolean)) {
        if (value.startsWith(qualifier + ' ')) return value.slice(qualifier.length + 1);
        if (value.endsWith(' ' + qualifier)) return value.slice(0, -qualifier.length - 1);
      }
      return value;
    };
    const requestedBase = unqualified(a), candidateBase = unqualified(b);
    if (!requestedBase || requestedBase !== candidateBase || (requestedBase === a && candidateBase === b)) continue;
    const country = component(candidate, 'country')?.short_name;
    const state = component(candidate, 'administrative_area_level_1')?.short_name;
    const geography = candidate.officialParkCode === anchor.parkCode
      || (country === anchor.country && anchor.states?.includes(state));
    if (!requireGeography || geography) return { type: 'contextual_exact', anchor: anchor.sourceId };
  }
  return { type:'none', anchor:null };
}
module.exports = { lexical, vague, component, trustedAnchors, matchName };
