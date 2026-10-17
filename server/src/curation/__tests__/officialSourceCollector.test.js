'use strict';

/**
 * Phase 9C.1D.5C-E1 — curation collection tooling. Mocked HTTP only; the
 * automated suite never touches the network.
 */

const collector = require('../officialSourceCollector');
const {
  checkOfficialSource,
  proposeExperienceCandidate,
  proposeRelationshipCandidate,
  renderReviewDossier,
  normalizeForMatch,
} = collector;
const { promoteCuratedExperience } = require('../../utils/curatedExperienceRecords');
const { createCuratedOfficialEvidenceProvider } = require('../../services/providers/curatedOfficialEvidenceProvider');

const NOW = () => new Date('2026-09-15T12:00:00.000Z');
const PAGE_URL = 'https://www.nps.gov/synth/planyourvisit/ridge-trail.htm';
const HTML = `<!doctype html><html><head><title>Ridge Trail - Synthetic National Park (U.S. National Park Service)</title>
<script>var excerpt = "The Ridge Trail climbs past Upper Cascade.";</script></head>
<body><nav>Menu</nav><h1>Ridge Trail</h1>
<p>The Ridge&nbsp;Trail begins at the Ridge &amp; Canyon Trailhead and climbs to the overlook.</p>
<p>Hikers cross the Upper Cascade footbridge about one mile in &mdash; it&rsquo;s often wet.</p></body></html>`;

function client({ status = 200, finalUrl = PAGE_URL, html = HTML, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    async fetchPage(url) {
      calls.push(url);
      if (throws) throw new Error('network down');
      return { status, finalUrl, html };
    },
  };
}

const check = (over = {}, clientOver = {}) => {
  const c = client(clientOver);
  return checkOfficialSource({ url: PAGE_URL, excerpt: 'The Ridge Trail begins at the Ridge & Canyon Trailhead', client: c, now: NOW, ...over }).then((r) => ({ r, c }));
};

describe('URL / domain validation', () => {
  test('an official https nps.gov page passes and records 5C-B source + sourceCheck', async () => {
    const { r } = await check();
    expect(r.ok).toBe(true);
    expect(r.source).toEqual({
      url: PAGE_URL,
      title: 'Ridge Trail - Synthetic National Park (U.S. National Park Service)',
      publisher: 'National Park Service',
      excerpt: 'The Ridge Trail begins at the Ridge & Canyon Trailhead',
    });
    expect(r.sourceCheck).toEqual({ checkedAt: '2026-09-15T12:00:00.000Z', httpStatus: 200, finalUrl: PAGE_URL, excerptFound: true });
  });

  test.each([
    ['http', 'http://www.nps.gov/synth/x.htm', 'source_not_https'],
    ['secondary website', 'https://www.alltrails.com/trail/ridge', 'source_host_not_allowlisted'],
    ['lookalike host', 'https://nps.gov.evil.example/x', 'source_host_not_allowlisted'],
  ])('%s is rejected WITHOUT fetching', async (_label, url, issue) => {
    const { r, c } = await check({ url });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain(issue);
    expect(c.calls).toEqual([]);
  });

  test('publisher comes from the verified host, not the page', async () => {
    const { r } = await check({}, { html: HTML.replace('<title>', '<meta name="publisher" content="Totally Official"><title>') });
    expect(r.source.publisher).toBe('National Park Service');
  });
});

describe('redirects', () => {
  test('a redirect that stays on nps.gov records the final URL', async () => {
    const { r } = await check({}, { finalUrl: 'https://www.nps.gov/synth/planyourvisit/ridge-trail-new.htm' });
    expect(r.ok).toBe(true);
    expect(r.sourceCheck.finalUrl).toBe('https://www.nps.gov/synth/planyourvisit/ridge-trail-new.htm');
  });

  test('a redirect off the allowlist fails', async () => {
    const { r } = await check({}, { finalUrl: 'https://example.com/landing' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('source_final_url_not_allowlisted');
  });

  test('non-2xx and fetch failure fail mechanically', async () => {
    expect((await check({}, { status: 404 })).r.issues).toContain('source_not_reachable');
    expect((await check({}, { throws: true })).r.issues).toContain('source_fetch_failed');
  });
});

describe('excerpt verification', () => {
  test('entities, typographic punctuation and whitespace are folded before comparing', async () => {
    const { r } = await check({ excerpt: 'about one mile in — it’s often wet' });
    expect(r.sourceCheck.excerptFound).toBe(true);
  });

  test('text only present inside <script> is not on the page', async () => {
    const { r } = await check({ excerpt: 'The Ridge Trail climbs past Upper Cascade.' });
    expect(r.sourceCheck.excerptFound).toBe(false);
    expect(r.issues).toContain('excerpt_not_found_on_source');
  });

  test('a search-engine snippet the page does not contain cannot persist as supporting evidence', async () => {
    const snippet = 'Ridge Trail is part of the famous Canyon Loop and connects to Upper Cascade.';
    const { r } = await check({ excerpt: snippet });
    expect(r.sourceCheck.excerptFound).toBe(false);
    const proposal = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    expect(proposal.mechanicalIssues).toEqual(expect.arrayContaining(['excerpt_not_found_on_source', 'excerpt_not_verified_on_source']));
  });

  test('over-long excerpts are refused', async () => {
    expect((await check({ excerpt: 'x '.repeat(300) })).r.issues).toContain('excerpt_too_long');
  });

  test('normalizeForMatch is stable', () => {
    expect(normalizeForMatch('It&rsquo;s  A Test — Here')).toBe("it's a test - here");
  });
});

describe('candidates and hashes', () => {
  test('experience candidate uses the 5C-C id convention and a stable hash', async () => {
    const { r } = await check();
    const a = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    const b = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    expect(a.record.entityId).toBe('nps:park:synth:experience:ridge-trail');
    expect(a.status).toBe('PENDING_HUMAN_REVIEW');
    expect(a.mechanicalIssues).toEqual([]);
    expect(a.candidateHash).toBe(b.candidateHash);
  });

  test('a source change invalidates a prior hash, so a review of the old content no longer promotes', async () => {
    const { r } = await check();
    const original = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    const { r: changed } = await check({ excerpt: 'climbs to the overlook' });
    const updated = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: changed });
    expect(updated.candidateHash).not.toBe(original.candidateHash);
    const staleReview = {
      candidateHash: original.candidateHash, decision: 'approved', reviewMethod: 'human', reviewerId: 'maintainer:primary',
      reviewedAt: '2026-09-15T12:00:00.000Z', reviewAfter: '2027-09-15T12:00:00.000Z',
    };
    const out = promoteCuratedExperience({ record: updated.record, review: staleReview, trustedReviewerIds: ['maintainer:primary'], now: new Date('2026-09-15T13:00:00.000Z') });
    expect(out.ok).toBe(false);
    expect(out.reasons).toContain('review_hash_mismatch');
  });

  test('one source yields separate experience and relationship proposals with independent hashes', async () => {
    const { r } = await check();
    const experience = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    const relationship = proposeRelationshipCandidate({
      subjectEntityId: 'nps:park:synth:place:ridge-and-canyon-trailhead', relationship: 'access_point_for',
      objectEntityId: experience.record.entityId, contextEntityId: 'nps:park:synth', sourceResult: r,
    });
    expect(relationship.kind).toBe('relationship');
    expect(relationship.mechanicalIssues).toEqual([]);
    expect(relationship.candidateHash).not.toBe(experience.candidateHash);
  });
});

describe('no automatic approval and no authority before a human review', () => {
  test('the module exposes no review/approval producer', () => {
    const names = Object.keys(collector).join(' ');
    expect(names).not.toMatch(/approve|review(?!Dossier)|promote/i);
    expect(JSON.stringify(Object.keys(collector))).not.toMatch(/writeReview/);
  });

  test('proposals fed to the provider with no review emit nothing', async () => {
    const { r } = await check();
    const experience = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    const relationship = proposeRelationshipCandidate({
      subjectEntityId: 'nps:park:synth:place:ridge-and-canyon-trailhead', relationship: 'access_point_for',
      objectEntityId: experience.record.entityId, contextEntityId: 'nps:park:synth', sourceResult: r,
    });
    const provider = createCuratedOfficialEvidenceProvider({
      dataset: { experiences: [experience.record], candidates: [relationship.record], reviews: [] },
      trustedReviewerIds: ['maintainer:primary'], now: NOW,
    });
    expect(provider.evidenceFor('nps:park:synth')).toEqual([]);
    expect(provider.diagnostics()).toMatchObject({ experiences: { pending: 1 }, relationships: { pending: 1 } });
  });

  test('the dossier marks every proposal pending and is deterministic', async () => {
    const { r } = await check();
    const experience = proposeExperienceCandidate({ contextEntityId: 'nps:park:synth', canonicalName: 'Ridge Trail', category: 'trail', sourceResult: r });
    const entries = [
      { ...experience, proposedClaim: 'Ridge Trail exists as a distinct official experience.', assessment: 'Names the trail.', recommendation: 'APPROVE' },
      { kind: 'not_proposed', subject: 'Upper Cascade part_of Ridge Trail', explanation: 'No official text states containment.', sourcesExamined: [PAGE_URL] },
    ];
    const a = renderReviewDossier({ title: 'Synthetic dossier', generatedAt: '2026-09-15T12:00:00.000Z', entries });
    const b = renderReviewDossier({ title: 'Synthetic dossier', generatedAt: '2026-09-15T12:00:00.000Z', entries });
    expect(a).toBe(b);
    expect(a).toContain('## A. Experience — PENDING HUMAN REVIEW');
    expect(a).toContain('## B. NOT PROPOSED — Upper Cascade part_of Ridge Trail');
    expect(a).toContain(experience.candidateHash);
  });
});
