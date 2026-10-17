'use strict';

function validateOvernightLimit(plan, lodging = {}) {
  const limit = lodging.maxHotelChanges;
  if (!Number.isInteger(limit) || limit < 0 || !plan?.days?.length) return [];
  const nights = plan.days.slice(0, -1);
  if (plan.days.at(-1).overnightLocation) nights.push(plan.days.at(-1));
  const bases = nights.map(day => String(day.overnightLocation || '').trim().toLowerCase().replace(/\s+/g, ' '));
  if (bases.some(base => !base)) return ['overnight_bases_incomplete'];
  const changes = bases.reduce((count, base, index) => count + (index > 0 && base !== bases[index - 1] ? 1 : 0), 0);
  return changes > limit ? ['hotel_change_limit_exceeded'] : [];
}

function resourceUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function evidenceUrls(value, urls = new Set()) {
  if (!value || typeof value !== 'object') return urls;
  for (const [key, child] of Object.entries(value)) {
    if (/url$/i.test(key) && typeof child === 'string') {
      const url = resourceUrl(child);
      if (url) urls.add(url);
    } else if (child && typeof child === 'object' && key !== 'sourceDetails') evidenceUrls(child, urls);
  }
  return urls;
}

function validateGuidanceLinks(sections = [], evidence = [], priorSections = []) {
  const urls = evidenceUrls(evidence);
  for (const section of sections) {
    if (priorSections.some(prior => JSON.stringify(prior) === JSON.stringify(section))) continue;
    const markdown = String(section.markdown || '');
    const links = [...markdown.matchAll(/\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(match => match[1]);
    links.push(...[...markdown.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)].map(match => match[1]));
    links.push(...[...markdown.matchAll(/<((?:https?:\/\/)[^\s<>]+)>/gi)].map(match => match[1]));
    for (const link of links) if (!resourceUrl(link) || !urls.has(resourceUrl(link))) return ['guidance_link_unsupported'];
  }
  return [];
}

// Booking-help replies are conversational, so they do not pass the mutation
// guard. Remove unsupported hyperlinks without another model round.
function stripUnverifiedLinks(markdown, evidence = [], priorSections = []) {
  const urls = evidenceUrls(evidence);
  for (const section of priorSections) {
    for (const match of String(section.markdown || '').matchAll(/\[[^\]]*\]\(\s*<?([^\s)>]+)>?\s*\)/g)) {
      const url = resourceUrl(match[1]); if (url) urls.add(url);
    }
  }
  const supported = href => urls.has(resourceUrl(href));
  return String(markdown || '')
    .replace(/\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g,
      (match, label, href) => supported(href) ? match : `${label} (link not confirmed)`)
    .replace(/^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?.*$/gm, (match, href) => supported(href) ? match : '')
    .replace(/<((?:https?:\/\/)[^\s<>]+)>/gi, (match, href) => supported(href) ? match : '(link not confirmed)')
    .replace(/https?:\/\/[^\s<>\)\]\"]+/gi, href => {
      const clean = href.replace(/[.,;!]+$/, '');
      return supported(clean) ? href : '(link not confirmed)';
    });
}

const ALERTS_LABEL = /\b(alerts?|closures?|conditions)\b/i;
const NPS_PARK_HOME = /^https:\/\/www\.nps\.gov\/([a-z]{4})\/(?:index\.htm)?$/i;

// A park homepage is not an alerts page. Point an alerts-labelled link at a
// returned alerts/conditions page for the same park, otherwise label it as
// what it is. Deterministic: no repair round.
function normalizeGuidanceLinkLabels(sections = [], evidence = [], priorSections = []) {
  const urls = [...evidenceUrls(evidence)];
  return sections.map(section => {
    if (!section?.markdown || priorSections.some(prior => JSON.stringify(prior) === JSON.stringify(section))) return section;
    const markdown = String(section.markdown).replace(/\[([^\]]*)\]\(\s*<?([^\s)>]+)>?\s*\)/g, (match, label, href) => {
      const park = resourceUrl(href)?.match(NPS_PARK_HOME)?.[1]?.toLowerCase();
      if (!park || !ALERTS_LABEL.test(label)) return match;
      const alerts = urls.find(url => new RegExp(`^https://www\\.nps\\.gov/${park}/.*(alerts|conditions)`, 'i').test(url));
      return alerts ? `[${label}](${alerts})` : `[the official NPS park page](${href})`;
    });
    return markdown === section.markdown ? section : { ...section, markdown };
  });
}

module.exports = { stripUnverifiedLinks, validateOvernightLimit, validateGuidanceLinks, normalizeGuidanceLinkLabels };
