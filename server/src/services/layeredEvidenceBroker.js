'use strict';

const { buildEvidenceBundle } = require('../utils/evidenceBundle');
const { evaluateRequirementCoverage } = require('./evidenceCoverageEvaluator');
const { WEB_PROVIDER_IDS, planWebEvidenceFallbacks } = require('./webEvidencePolicyService');
const { pickOfficialFollowCandidate, pickOfficialFollowCandidates, pickOfficialFollowUrl } = require('./providers/webEvidenceProviderShared');

// P0-5 — topics whose value is a PARSED RULE from official prose. Discovery
// ranking cannot know which official page states the rule, so follow a small
// bounded set and let the deterministic extractor decide. Everything else
// keeps the single-follow behavior.
const MULTI_PAGE_FOLLOW_TOPICS = Object.freeze(new Set(['vehicle_restrictions']));
const MULTI_PAGE_FOLLOW_LIMIT = 3;

function withoutWebProviders(requirement) {
  return {
    ...requirement,
    preferredProviders: (requirement.preferredProviders || []).filter((id) => !WEB_PROVIDER_IDS.has(id)),
    allowedFallbackProviders: (requirement.allowedFallbackProviders || []).filter((id) => !WEB_PROVIDER_IDS.has(id)),
  };
}

function discoveryRequirement(requirement) {
  return {
    ...requirement,
    minimumAuthorityClass: 'reputable_web',
    acceptedSourceClasses: ['reputable_web'],
  };
}

function officialSourceUrl(evidence) {
  return pickOfficialFollowUrl([evidence]);
}

function attachSelectedEvidence(bundle) {
  const evidenceById = new Map((bundle?.evidence || []).map((item) => [item.evidenceId, item]));
  return (bundle?.resolutions || []).map((resolution) => ({
    ...resolution,
    selectedEvidence: (resolution.evidenceIds || []).map((id) => evidenceById.get(id)).filter(Boolean),
  }));
}

function rebuildBundle(bundle, requestId, createdAt) {
  const resolutions = attachSelectedEvidence(bundle);
  return buildEvidenceBundle({ requestId, createdAt, resolutions, candidates: bundle?.evidence || [] });
}

/**
 * §A — WAVE LABELLING.
 *
 * This resolver awaits up to three broker passes in series. Without a label on
 * each span the emitted timeline cannot show that serialisation, which is
 * exactly what the 2026-08-26 evidence audit needed and could not get.
 */
function waveSpan(beginSpan, wave) {
  if (typeof beginSpan !== 'function') return null;
  return (stage, meta) => beginSpan(stage, { ...(meta || {}), wave });
}

function createLayeredEvidenceResolver({ broker, now = () => new Date() } = {}) {
  if (!broker?.resolveEvidence) throw new TypeError('Layered evidence resolution requires a broker');
  return {
    async resolveEvidence({ requirements = [], requestId, signal = null, beginSpan = null } = {}) {
      const structuredBundle = await broker.resolveEvidence({
        requirements: requirements.map(withoutWebProviders),
        requestId: `${requestId}:structured`,
        signal,
        beginSpan: waveSpan(beginSpan, 'structured'),
      });
      const webPlanned = planWebEvidenceFallbacks({ requirements, structuredBundle });
      if (webPlanned.length === 0) return rebuildBundle(structuredBundle, requestId, now());

      const discoveryRequirements = webPlanned.map(discoveryRequirement);
      const discoveryBundle = await broker.resolveEvidence({
        requirements: discoveryRequirements,
        requestId: `${requestId}:web-discovery`,
        signal,
        beginSpan: waveSpan(beginSpan, 'web_discovery'),
      });
      const originalById = new Map(requirements.map((item) => [item.requirementId, item]));
      const structuredById = new Map(attachSelectedEvidence(structuredBundle).map((item) => [item.requirementId, item]));
      const discoveryEvidenceByRequirement = new Map(discoveryRequirements.map((item) => [
        item.requirementId,
        discoveryBundle.evidence.filter((candidate) => candidate.entityId === item.entity.entityId && candidate.topic === item.topic),
      ]));
      const finalById = new Map(structuredById);
      const officialRequirements = [];

      for (const planned of webPlanned) {
        const original = originalById.get(planned.requirementId);
        const candidates = discoveryEvidenceByRequirement.get(planned.requirementId) || [];
        const evaluated = evaluateRequirementCoverage(original, candidates, { now: now() });
        if (String(evaluated.status).startsWith('satisfied_')) finalById.set(original.requirementId, evaluated);
        const followable = candidates.filter((item) => {
          if (!['exact', 'partial'].includes(item?.quality?.scopeMatch)) return false;
          const url = String(item?.source?.url || '');
          const entityCode = String(original.entity?.entityId || '').replace(/^nps:park:/i, '').toLowerCase();
          const urlCode = (url.match(/nps\.gov\/([a-z0-9]{4})(?:\/|$)/i) || [])[1];
          return !entityCode || !urlCode || entityCode === urlCode.toLowerCase();
        });
        const follows = MULTI_PAGE_FOLLOW_TOPICS.has(original.topic)
          ? pickOfficialFollowCandidates(followable, MULTI_PAGE_FOLLOW_LIMIT)
          : [pickOfficialFollowCandidate(followable)].filter((item) => item?.sourceUrl);
        follows.forEach((officialFollow, followIndex) => {
          officialRequirements.push({
            ...original,
            // Each followed page is its own requirement contract; a shared id
            // with different webScopes trips the identity invariant. The
            // suffix is stripped when resolutions are folded back.
            requirementId: followIndex === 0
              ? original.requirementId
              : `${original.requirementId}:follow${followIndex + 1}`,
            preferredProviders: ['direct_official_page'], allowedFallbackProviders: [],
            webScope: {
              sourceUrl: officialFollow.sourceUrl,
              ...(officialFollow.officialRelationship
                ? { officialRelationship: officialFollow.officialRelationship }
                : {}),
            },
          });
        });
      }

      if (officialRequirements.length > 0) {
        const officialBundle = await broker.resolveEvidence({
          requirements: officialRequirements,
          requestId: `${requestId}:official-pages`,
          signal,
          beginSpan: waveSpan(beginSpan, 'official_pages'),
        });
        for (const resolution of attachSelectedEvidence(officialBundle)) {
          if (!String(resolution.status).startsWith('satisfied_')) continue;
          // Fold multi-page follows back onto their base requirement, merging
          // selected evidence so every followed page's candidates reach the
          // bundle — the parser, not page ordering, decides which one mattered.
          const baseId = resolution.requirementId.replace(/:follow\d+$/, '');
          const existing = finalById.get(baseId);
          if (existing && String(existing.status).startsWith('satisfied_')) {
            const merged = [...(existing.selectedEvidence || []), ...(resolution.selectedEvidence || [])];
            finalById.set(baseId, {
              ...existing,
              selectedEvidence: [...new Map(merged.map((item) => [item.evidenceId, item])).values()],
            });
          } else {
            finalById.set(baseId, { ...resolution, requirementId: baseId });
          }
        }
      }

      const resolutions = requirements.map((item) => finalById.get(item.requirementId));
      const selected = resolutions.flatMap((item) => item?.selectedEvidence || []);
      const unique = [...new Map(selected.map((item) => [item.evidenceId, item])).values()];
      return buildEvidenceBundle({ requestId, createdAt: now(), resolutions, candidates: unique });
    },
  };
}

module.exports = { attachSelectedEvidence, createLayeredEvidenceResolver, officialSourceUrl, withoutWebProviders };
