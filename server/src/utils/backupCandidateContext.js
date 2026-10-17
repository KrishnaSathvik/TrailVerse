'use strict';

/**
 * Deterministic backup-candidate preparation from a Frozen EvidenceBundle.
 *
 * Preferred path:
 *   explicit contingency → evidence-backed independent candidates →
 *   canonical `alternatives` → model selects/narrates → strict validator
 *
 * Never invents place names. Never special-cases a park.
 */

const { resolveAccessContingency } = require('./constraintFamilies');

const BACKUP_REQUEST =
  /\b(backup|fall[- ]?back|if .{0,60}(?:doesn'?t|does not|won'?t|cannot|can'?t|fails?|doesn'?t work)|alternative plan|plan b|what if|another option|something else(?: to do)?)\b/i;

const CANONICAL_FIELD = 'alternatives';

function userRequestsBackupPlan(userPrompt = '') {
  const text = String(userPrompt || '');
  if (BACKUP_REQUEST.test(text)) return true;
  return resolveAccessContingency(text).asksForAlternative === true;
}

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBlockedAccessDependencies(prompt) {
  const text = String(prompt || '');
  const deps = [];
  // Prefer access/parking contingency phrasing. Do NOT treat the word "Pass"
  // inside place names like "Logan Pass" as the contingency keyword.
  const accessParking = text.match(
    /\bif\s+([A-Z][A-Za-z0-9'’\-\s]{2,40}?)\s+(?:access|parking)\b/i
  );
  if (accessParking?.[1]) {
    deps.push(accessParking[1].trim());
  } else {
    const other = text.match(
      /\bif\s+([A-Z][A-Za-z0-9'’\-\s]{2,40}?)\s+(?:road|entrance|shuttle)\b/i
    );
    if (other?.[1]) deps.push(other[1].trim());
  }
  return [...new Set(deps.map((d) => normName(d)).filter(Boolean))];
}

function isNamedActivityCandidate(candidate) {
  const quals = candidate?.claim?.qualifiers || [];
  if (quals.includes('named_activity_candidate') || quals.includes('named_place_candidate')) {
    return true;
  }
  return Boolean(candidate?.claim?.normalizedValue?.name);
}

function candidateHaystack(candidate) {
  const nv = candidate?.claim?.normalizedValue || {};
  return normName([
    nv.name,
    candidate?.claim?.text,
    candidate?.source?.title,
    Array.isArray(nv.activityTypes) ? nv.activityTypes.join(' ') : '',
  ].filter(Boolean).join(' '));
}

function dependsOnBlockedAccess(candidate, blockedDependencies) {
  if (!blockedDependencies.length) return false;
  const hay = candidateHaystack(candidate);
  return blockedDependencies.some((dep) => dep && hay.includes(dep));
}

function extractNamedActivityCandidates(bundle) {
  const rows = [];
  for (const candidate of bundle?.evidence || []) {
    if (candidate?.topic !== 'activities') continue;
    if (!isNamedActivityCandidate(candidate)) continue;
    const name = String(candidate?.claim?.normalizedValue?.name || '').trim();
    if (!name) continue;
    rows.push({
      name,
      evidenceId: candidate.evidenceId || null,
      activityTypes: Array.isArray(candidate?.claim?.normalizedValue?.activityTypes)
        ? candidate.claim.normalizedValue.activityTypes.map(String)
        : [],
      text: String(candidate?.claim?.text || ''),
    });
  }
  return rows;
}

/**
 * @returns {{
 *   required: boolean,
 *   canonicalField: 'alternatives',
 *   blockedDependencies: string[],
 *   candidates: Array<{name:string, evidenceId:string|null, activityTypes:string[], text:string}>,
 * }}
 */
function buildBackupCandidateContext({
  bundle = null,
  userPrompt = '',
  maxCandidates = 8,
} = {}) {
  const required = userRequestsBackupPlan(userPrompt);
  const blockedDependencies = required ? extractBlockedAccessDependencies(userPrompt) : [];
  if (!required) {
    return {
      required: false,
      canonicalField: CANONICAL_FIELD,
      blockedDependencies: [],
      candidates: [],
    };
  }

  const all = extractNamedActivityCandidates(bundle)
    .filter((row) => {
      const synthetic = {
        claim: {
          text: row.text,
          normalizedValue: { name: row.name, activityTypes: row.activityTypes },
        },
        source: { title: row.name },
      };
      return !dependsOnBlockedAccess(synthetic, blockedDependencies);
    });

  // Prefer distinct names; keep stable order from evidence.
  const seen = new Set();
  const candidates = [];
  const limit = Math.max(0, Math.floor(Number(maxCandidates) || 0)) || 8;
  for (const row of all) {
    const key = normName(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(row);
    if (candidates.length >= limit) break;
  }

  return {
    required: true,
    canonicalField: CANONICAL_FIELD,
    blockedDependencies,
    candidates,
  };
}

function formatBackupCandidatePromptBlock(context) {
  if (!context?.required) return '';
  const deps = (context.blockedDependencies || []).map((d) => `"${d}"`).join(', ') || '(named access/parking subject)';
  const lines = [
    'Explicit contingency/backup was requested.',
    `Blocked dependency subject(s): ${deps}.`,
    `Canonical structured field: \`${CANONICAL_FIELD}\` (plan-level and/or stop-level).`,
    'Populate that field with identifiable outdoor places/activities that remain usable if the blocked dependency fails.',
    'For a prose fallback (no itinerary requested): name one evidence-backed option, explain why it fits, give 1–3 concrete supported things to do when those facts exist, and state the condition for using it.',
    'Do not invent places. Do not use vague "check conditions" / "ask a ranger" wording as the backup.',
    'Do not reuse the blocked access path or identical primary stops as the only backup.',
  ];
  if ((context.candidates || []).length > 0) {
    lines.push('Evidence-backed independent backup candidates (choose from these; narrate why):');
    for (const candidate of context.candidates) {
      lines.push(`- ${candidate.name}`);
    }
  } else {
    lines.push(
      'No independent evidence-backed backup candidates are available in the Frozen EvidenceBundle. '
      + 'Do not invent a fallback place name.'
    );
  }
  return lines.join('\n');
}

function pushAlt(items, value, parent = null) {
  if (typeof value === 'string' && value.trim()) {
    items.push(parent ? { name: value.trim(), parent } : { name: value.trim() });
    return;
  }
  if (value && typeof value === 'object') {
    const name = String(value.name || value.title || value.place || '').trim();
    if (!name) return;
    items.push(parent ? { ...value, name, parent } : { ...value, name });
  }
}

/**
 * Normalize legacy backup shapes into canonical plan-level `alternatives`.
 * Mutates a deep copy — never the caller's object identity assumptions beyond return.
 */
function normalizeCanonicalBackup(itineraryData) {
  if (!itineraryData || typeof itineraryData !== 'object') return itineraryData;
  const next = JSON.parse(JSON.stringify(itineraryData));
  const collected = [];

  if (Array.isArray(next.alternatives)) {
    for (const alt of next.alternatives) pushAlt(collected, alt);
  }
  for (const key of ['backupOptions', 'fallback', 'fallbacks', 'contingency', 'contingencies']) {
    const value = next[key];
    if (Array.isArray(value)) {
      for (const alt of value) pushAlt(collected, alt);
    } else if (value) {
      pushAlt(collected, value);
    }
  }

  for (const day of next.days || []) {
    for (const stop of day?.stops || []) {
      if (Array.isArray(stop.alternatives)) {
        for (const alt of stop.alternatives) pushAlt(collected, alt, stop.name);
      }
      for (const key of ['backupOptions', 'fallback', 'fallbacks', 'contingency']) {
        const value = stop[key];
        if (Array.isArray(value)) {
          for (const alt of value) pushAlt(collected, alt, stop.name);
        } else if (value) {
          pushAlt(collected, value, stop.name);
        }
      }
    }
  }

  const seen = new Set();
  const merged = [];
  for (const alt of collected) {
    const key = normName(alt.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(alt);
  }
  next.alternatives = merged;
  return next;
}

function namesLooselyMatch(left, right) {
  const a = normName(left);
  const b = normName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function structuredBackupGroundedInEvidence(structuredAlternatives, evidenceCandidates) {
  if (!Array.isArray(evidenceCandidates) || evidenceCandidates.length === 0) return false;
  if (!Array.isArray(structuredAlternatives) || structuredAlternatives.length === 0) return false;
  return structuredAlternatives.some((alt) =>
    evidenceCandidates.some((candidate) => namesLooselyMatch(alt?.name, candidate?.name))
  );
}

module.exports = {
  CANONICAL_FIELD,
  userRequestsBackupPlan,
  extractBlockedAccessDependencies,
  buildBackupCandidateContext,
  formatBackupCandidatePromptBlock,
  normalizeCanonicalBackup,
  structuredBackupGroundedInEvidence,
  namesLooselyMatch,
};
