#!/usr/bin/env node
'use strict';

/**
 * Phase 9C.1D.5C-E1 — build a human-review dossier from a request file.
 *
 *   node scripts/curation/build-official-source-dossier.js <request.json> <outDir>
 *
 * request.json:
 *   {
 *     "title": "...",
 *     "contextEntityId": "nps:park:<code>",
 *     "targets": [
 *       { "kind": "experience", "canonicalName", "category", "activityTypes"?, "url", "excerpt",
 *         "proposedClaim", "assessment", "recommendation" },
 *       { "kind": "relationship", "subjectEntityId", "relationship", "objectEntityId", "url", "excerpt",
 *         "proposedClaim", "assessment", "recommendation" },
 *       { "kind": "not_proposed", "subject", "explanation", "sourcesExamined": [] }
 *     ]
 *   }
 *
 * Relationship endpoints may reference an experience in the same request as
 * `experience:<canonicalName>`; it is expanded to that candidate's entity id.
 *
 * Writes <outDir>/dossier.md and <outDir>/pending-candidates.json (experiences +
 * relationship candidates in the curated data format, PLUS their hashes). It
 * never writes a review, and never writes into server/src/data.
 */

const fs = require('fs');
const path = require('path');
const {
  createHttpPageClient,
  checkOfficialSource,
  proposeExperienceCandidate,
  proposeRelationshipCandidate,
  renderReviewDossier,
} = require('../../src/curation/officialSourceCollector');

async function main() {
  const [requestPath, outDir] = process.argv.slice(2);
  if (!requestPath || !outDir) {
    console.error('usage: build-official-source-dossier.js <request.json> <outDir>');
    process.exit(2);
  }
  const resolvedOut = path.resolve(outDir);
  if (resolvedOut.includes(`${path.sep}src${path.sep}data`)) {
    console.error('refusing to write curation output into server/src/data');
    process.exit(2);
  }
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const client = createHttpPageClient();
  const generatedAt = new Date().toISOString();
  const checks = new Map(); // one fetch per (url, excerpt)
  const entries = [];
  const experienceIds = new Map();

  const sourceFor = async (url, excerpt) => {
    const key = `${url}\n${excerpt}`;
    if (!checks.has(key)) checks.set(key, await checkOfficialSource({ url, excerpt, client, now: () => new Date(generatedAt) }));
    return checks.get(key);
  };
  const expand = (id) => (String(id).startsWith('experience:') ? experienceIds.get(String(id).slice('experience:'.length)) || id : id);

  for (const target of request.targets || []) {
    if (target.kind === 'not_proposed') { entries.push(target); continue; }
    const sourceResult = await sourceFor(target.url, target.excerpt);
    const proposal = target.kind === 'experience'
      ? proposeExperienceCandidate({
        contextEntityId: request.contextEntityId, canonicalName: target.canonicalName,
        category: target.category, activityTypes: target.activityTypes, sourceResult,
      })
      : proposeRelationshipCandidate({
        subjectEntityId: expand(target.subjectEntityId), relationship: target.relationship,
        objectEntityId: expand(target.objectEntityId), contextEntityId: request.contextEntityId, sourceResult,
      });
    if (target.kind === 'experience') experienceIds.set(target.canonicalName, proposal.record.entityId);
    entries.push({ ...proposal, proposedClaim: target.proposedClaim, assessment: target.assessment, recommendation: target.recommendation });
  }

  fs.mkdirSync(resolvedOut, { recursive: true });
  fs.writeFileSync(path.join(resolvedOut, 'dossier.md'), renderReviewDossier({ title: request.title, generatedAt, entries }));
  const pending = {
    schemaVersion: 1,
    status: 'PENDING_HUMAN_REVIEW',
    generatedAt,
    experiences: entries.filter((e) => e.kind === 'experience').map((e) => ({ candidateHash: e.candidateHash, mechanicalIssues: e.mechanicalIssues, record: e.record })),
    candidates: entries.filter((e) => e.kind === 'relationship').map((e) => ({ candidateHash: e.candidateHash, mechanicalIssues: e.mechanicalIssues, record: e.record })),
  };
  fs.writeFileSync(path.join(resolvedOut, 'pending-candidates.json'), `${JSON.stringify(pending, null, 2)}\n`);
  const summary = entries.map((e, i) => `${String.fromCharCode(65 + i)} ${e.kind}${e.candidateHash ? ` ${e.candidateHash} issues=${(e.mechanicalIssues || []).join('|') || 'none'}` : ''}`);
  console.log(summary.join('\n'));
}

main().catch((error) => {
  console.error('dossier build failed:', error.message);
  process.exit(1);
});
