'use strict';

/**
 * PHASE 9C.1D.5C-E1 — OFFICIAL-SOURCE CURATION COLLECTION.
 *
 * Mechanics and proposals only. This module can:
 *   - fetch an official page (allowlisted https host, redirects followed and
 *     re-checked) and record `source` + `sourceCheck` in the 5C-B shape,
 *   - verify a proposed excerpt VERBATIM against the fetched page text,
 *   - build pending curated-experience and relationship candidates and their hashes,
 *   - render a human-review dossier.
 *
 * It cannot approve anything: there is deliberately no function here that
 * produces a review record. Semantic authority requires an explicit human
 * decision by a server-trusted reviewer (5C-B/5C-C), written separately.
 *
 * Search results never become evidence. An excerpt is persisted only when it is
 * found in the fetched official page itself; a snippet copied from a search
 * result that the page does not contain fails `excerptFound`, and a candidate
 * carrying it fails validation.
 */

const crypto = require('crypto');
const { DEFAULT_OFFICIAL_SOURCE_HOSTS, candidateHash, validateRelationshipCandidate } = require('../utils/experienceRelationships');
const { experienceHash, validateCuratedExperience } = require('../utils/curatedExperienceRecords');

/** Publisher is derived from the verified final host, never read from the page. */
const HOST_PUBLISHERS = Object.freeze({ 'nps.gov': 'National Park Service' });
const EXCERPT_MAX_CHARS = 400;

const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', mdash: '-', ndash: '-', hellip: '...', eacute: 'é',
});

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** The comparison form: entities decoded, typographic quotes/dashes folded, whitespace collapsed, lowercased. */
function normalizeForMatch(text) {
  return decodeEntities(text)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTitle(html) {
  const found = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return found ? htmlToText(found[1]) || null : null;
}

function officialHostOf(hostname, officialHosts) {
  const host = String(hostname || '').toLowerCase();
  return (officialHosts || []).find((allowed) => host === allowed || host.endsWith(`.${allowed}`)) || null;
}

function parseUrl(value) {
  try { return new URL(String(value || '')); } catch (_) { return null; }
}

/** Real HTTP client: full body (no truncation), redirects followed, final URL reported. */
function createHttpPageClient({ timeoutMs = 10000, maxBytes = 2000000 } = {}) {
  return {
    async fetchPage(url) {
      const axios = require('axios');
      const response = await axios.get(url, {
        timeout: timeoutMs,
        maxContentLength: maxBytes,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
        headers: { 'User-Agent': 'TrailVerse-curation/1.0 (official-source verification)' },
      });
      return {
        status: response.status,
        finalUrl: response.request?.res?.responseUrl || url,
        html: String(response.data || ''),
      };
    },
  };
}

/**
 * Fetch an official page and verify an excerpt against it.
 *
 * @returns {Promise<{ok:boolean, issues:string[], source, sourceCheck, pageTextSha256:string|null}>}
 */
async function checkOfficialSource({
  url, excerpt, client, officialHosts = DEFAULT_OFFICIAL_SOURCE_HOSTS, now = () => new Date(),
} = {}) {
  const issues = [];
  const requested = parseUrl(url);
  const cleanExcerpt = String(excerpt || '').replace(/\s+/g, ' ').trim();
  if (!requested || requested.protocol !== 'https:') issues.push('source_not_https');
  else if (!officialHostOf(requested.hostname, officialHosts)) issues.push('source_host_not_allowlisted');
  if (!cleanExcerpt) issues.push('missing_excerpt');
  if (cleanExcerpt.length > EXCERPT_MAX_CHARS) issues.push('excerpt_too_long');
  // Never fetch a page that could not become evidence anyway.
  if (issues.includes('source_not_https') || issues.includes('source_host_not_allowlisted')) {
    return { ok: false, issues, source: null, sourceCheck: null, pageTextSha256: null };
  }

  const checkedAt = now().toISOString();
  let page;
  try {
    page = await client.fetchPage(requested.toString());
  } catch (_error) {
    return {
      ok: false,
      issues: [...issues, 'source_fetch_failed'],
      source: null,
      sourceCheck: { checkedAt, httpStatus: 0, finalUrl: null, excerptFound: false },
      pageTextSha256: null,
    };
  }

  const finalUrl = parseUrl(page?.finalUrl) || requested;
  const finalHost = finalUrl.protocol === 'https:' ? officialHostOf(finalUrl.hostname, officialHosts) : null;
  if (!finalHost) issues.push('source_final_url_not_allowlisted');
  const status = Number(page?.status) || 0;
  if (!(status >= 200 && status < 300)) issues.push('source_not_reachable');

  const html = String(page?.html || '');
  const text = htmlToText(html);
  const title = pageTitle(html);
  if (!title) issues.push('missing_source_title');
  const excerptFound = Boolean(cleanExcerpt) && normalizeForMatch(text).includes(normalizeForMatch(cleanExcerpt));
  if (!excerptFound) issues.push('excerpt_not_found_on_source');

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    source: {
      url: requested.toString(),
      title,
      publisher: finalHost ? HOST_PUBLISHERS[finalHost] || null : null,
      excerpt: cleanExcerpt,
    },
    sourceCheck: { checkedAt, httpStatus: status, finalUrl: finalUrl.toString(), excerptFound },
    pageTextSha256: text ? crypto.createHash('sha256').update(text).digest('hex') : null,
  };
}

const slugify = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Pending curated-experience candidate. Never approved here. */
function proposeExperienceCandidate({
  contextEntityId, canonicalName, category, activityTypes = undefined, slug = null, sourceResult,
} = {}) {
  const record = {
    entityId: `${String(contextEntityId || '').toLowerCase()}:experience:${slug || slugify(canonicalName)}`,
    contextEntityId: String(contextEntityId || '').toLowerCase(),
    canonicalName,
    category,
    ...(activityTypes ? { activityTypes } : {}),
    source: sourceResult?.source || null,
    sourceCheck: sourceResult?.sourceCheck || null,
  };
  const validation = validateCuratedExperience(record);
  return {
    kind: 'experience',
    status: 'PENDING_HUMAN_REVIEW',
    record,
    candidateHash: experienceHash(record),
    mechanicalIssues: [...new Set([...(sourceResult?.issues || []), ...validation.reasons])],
  };
}

/** Pending typed relationship candidate. Never approved here. */
function proposeRelationshipCandidate({
  subjectEntityId, relationship, objectEntityId, contextEntityId, sourceResult, proposedBy = { kind: 'agent', id: 'agent:curation-assistant' },
} = {}) {
  const candidate = {
    subjectEntityId,
    relationship,
    objectEntityId,
    contextEntityId,
    source: sourceResult?.source || null,
    sourceCheck: sourceResult?.sourceCheck || null,
    proposedBy,
  };
  const validation = validateRelationshipCandidate(candidate);
  return {
    kind: 'relationship',
    status: 'PENDING_HUMAN_REVIEW',
    record: candidate,
    candidateHash: candidateHash(candidate),
    mechanicalIssues: [...new Set([...(sourceResult?.issues || []), ...validation.reasons])],
  };
}

const mark = (ok) => (ok ? '✓' : '✗');

/** Deterministic markdown dossier. Every proposal is PENDING HUMAN REVIEW. */
function renderReviewDossier({ title, generatedAt, entries = [] } = {}) {
  const lines = [`# ${title}`, '', `Generated: ${generatedAt}`, '',
    'Every candidate below is **PENDING HUMAN REVIEW**. Nothing here is authoritative until `maintainer:primary` approves a specific candidate hash.',
    ''];
  entries.forEach((entry, index) => {
    const label = String.fromCharCode(65 + index);
    if (entry.kind === 'not_proposed') {
      lines.push(`## ${label}. NOT PROPOSED — ${entry.subject}`, '', entry.explanation, '');
      if ((entry.sourcesExamined || []).length) {
        lines.push('Official sources examined:', ...entry.sourcesExamined.map((u) => `- ${u}`), '');
      }
      return;
    }
    const r = entry.record;
    const src = r.source || {};
    const sc = r.sourceCheck || {};
    const url = parseUrl(src.url);
    lines.push(`## ${label}. ${entry.kind === 'experience' ? 'Experience' : 'Relationship'} — PENDING HUMAN REVIEW`, '');
    if (entry.kind === 'experience') {
      lines.push(`- Canonical name: **${r.canonicalName}**`, `- Entity id: \`${r.entityId}\``, `- Category: ${r.category}`);
    } else {
      lines.push(`- Claim: \`${r.subjectEntityId}\` **${r.relationship}** \`${r.objectEntityId}\``);
    }
    lines.push(
      `- Proposed claim: ${entry.proposedClaim}`,
      `- Official source: ${src.url || '—'}`,
      `- Page title: ${src.title || '—'}`,
      `- Publisher: ${src.publisher || '—'}`,
      `- Supporting excerpt (verbatim from the fetched page): "${src.excerpt || ''}"`,
      `- Source checks: ${mark(url?.protocol === 'https:')} https · ${mark(Boolean(src.publisher))} official host · ${mark(sc.httpStatus >= 200 && sc.httpStatus < 300)} HTTP ${sc.httpStatus ?? '—'} · ${mark(sc.excerptFound === true)} excerpt present · final URL ${sc.finalUrl || '—'} · checked ${sc.checkedAt || '—'}`,
      `- Mechanical issues: ${entry.mechanicalIssues.length ? entry.mechanicalIssues.join(', ') : 'none'}`,
      `- Candidate hash: \`${entry.candidateHash}\``,
      '',
      `**What the source does / does not support:** ${entry.assessment}`,
      '',
      `Agent recommendation: ${entry.recommendation}`,
      '',
    );
  });
  return `${lines.join('\n')}\n`;
}

module.exports = {
  HOST_PUBLISHERS,
  normalizeForMatch,
  htmlToText,
  createHttpPageClient,
  checkOfficialSource,
  proposeExperienceCandidate,
  proposeRelationshipCandidate,
  renderReviewDossier,
};
