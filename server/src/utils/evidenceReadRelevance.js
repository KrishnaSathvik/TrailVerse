'use strict';

/**
 * Ordering of ONE provider read's rows before the per-read evidence budget cuts
 * them. Retrieval relevance only: it never adds rows, never fetches, never
 * changes a row, and never decides what the traveler meant. Signals come from
 * the model's structured read_travel request (named places, structured
 * constraints) and from structured source facts; free-text overlap only breaks
 * ties, so a traveler asking for easy walks still receives low-exposure trails
 * and access restrictions that share no words with the request.
 *
 * Without the ordering, rows were kept in provider order and the budget kept
 * roughly the first three official activities of a park (diagnosis 2026-10-12).
 */

const { classifyExposureEligibility, ELIGIBILITY } = require('./hardConstraintEligibility');

const DIFFICULTY_ORDER = ['easy', 'moderate', 'hard', 'strenuous'];
const FITNESS_MAX = { beginner: 'easy', easy: 'easy', intermediate: 'moderate', moderate: 'moderate',
  advanced: 'hard', hard: 'hard', experienced: 'strenuous', expert: 'strenuous', strenuous: 'strenuous' };
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'when', 'what', 'days',
  'day', 'trip', 'plan', 'park', 'national', 'our', 'you', 'can', 'are', 'not', 'any', 'all', 'one', 'two',
  'three', 'four', 'five', 'per', 'via', 'near', 'avoid', 'want', 'like']);

const nameKey = (value) => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’]/g, "'").trim().toLowerCase();

function tokens(text) {
  return new Set(nameKey(text).split(/[^a-z0-9']+/)
    .map((token) => token.replace(/'/g, ''))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    .map((token) => token.replace(/(?:ing|s)$/, '')));
}

function hardRestrictions(constraints) {
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  const avoidExposure = c.avoidExposure === true || c.preferences?.avoidExposure === true;
  const level = String(c.fitnessLevel || c.preferences?.fitnessLevel || '').toLowerCase();
  return { avoidExposure, maxDifficulty: FITNESS_MAX[level] || null };
}

function scoreRow(row, { requested, restrictions, queryTokens }) {
  const value = row?.claim?.normalizedValue || {};
  const name = nameKey(value.name);
  let score = 0;
  // The model explicitly asked to resolve this place: its official record is
  // the identity and suitability evidence the plan will be validated against.
  if (name && requested.has(name)) score += 100;
  if (restrictions.avoidExposure) {
    const eligibility = classifyExposureEligibility(value.exposureLevel);
    if (eligibility === ELIGIBILITY.COMPATIBLE) score += 25;
    else if (eligibility === ELIGIBILITY.INCOMPATIBLE) score -= 15;
  }
  if (restrictions.maxDifficulty && DIFFICULTY_ORDER.includes(value.difficulty)) {
    score += DIFFICULTY_ORDER.indexOf(value.difficulty) <= DIFFICULTY_ORDER.indexOf(restrictions.maxDifficulty) ? 15 : -10;
  }
  // Official access, permit, vehicle and closure facts are what keep a plan
  // honest; they survive even when they share no words with the request.
  if (Array.isArray(value.operationalFacts) && value.operationalFacts.length) score += 20;
  if (['closed', 'unavailable'].includes(value.closureStatus) || ['closed', 'unavailable'].includes(value.availabilityStatus)) score += 20;
  if (value.exposureLevel != null || value.difficulty != null || Number(value.walkingDistanceMiles) > 0) score += 5;
  if (queryTokens.size) {
    const hay = tokens(`${value.name || ''} ${(value.activityTypes || []).join(' ')} ${row?.claim?.text || ''}`);
    let overlap = 0;
    for (const token of queryTokens) if (hay.has(token)) overlap += 1;
    score += Math.min(10, overlap * 2);
  }
  return score;
}

/**
 * @param {object[]} rows materialized evidence rows from one provider read
 * @param {{ query?: string, places?: string[], constraints?: object }} relevance
 * @returns {object[]} the same rows, most relevant first (stable for ties)
 */
function orderEvidenceForRead(rows, relevance = {}) {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];
  const context = {
    requested: new Set((Array.isArray(relevance.places) ? relevance.places : []).map(nameKey).filter(Boolean)),
    restrictions: hardRestrictions(relevance.constraints),
    queryTokens: tokens(relevance.query || ''),
  };
  return rows
    .map((row, index) => ({ row, index, score: scoreRow(row, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ row }) => row);
}

module.exports = { orderEvidenceForRead, nameKey };
