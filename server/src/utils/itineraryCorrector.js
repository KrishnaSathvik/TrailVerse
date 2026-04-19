/**
 * Itinerary Corrector — priority-ordered corrections with smart replacement,
 * empty-day protection, gap tracking, and plan scoring.
 * Fixes constraint violations: SAFETY → FEASIBILITY → FITNESS → PREFERENCE
 */

const { DIFFICULTY_ORDER, FITNESS_TO_MAX_DIFFICULTY, PERMIT_PARKS } = require('./constraintEngine');

// ── Haversine ────────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lon points in miles. */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Smart Replacement Helpers ────────────────────────────────────────────────

/**
 * Validates an alternative stop is reasonable for replacement.
 * Returns false if missing required fields or too far from the original stop.
 */
function validateAlternative(alt, removedStop) {
  if (!alt || !alt.name) return false;
  if (!alt.latitude || !alt.longitude) return false;
  if (!removedStop.latitude || !removedStop.longitude) return true; // can't check distance
  const dist = haversineDistance(removedStop.latitude, removedStop.longitude, alt.latitude, alt.longitude);
  return dist <= 30; // max 30 miles — unreasonable replacement beyond this
}

/**
 * Finds a suitable replacement from a stop's alternatives array.
 *
 * @param {object} removedStop - The stop being replaced
 * @param {object} constraints - Parsed constraints
 * @param {string} issueType - 'difficulty' | 'accommodation' | 'schedule_overflow'
 * @param {Set<string>} usedReplacements - Names already used as replacements
 * @returns {object|null} A valid alternative or null
 */
function findReplacement(removedStop, constraints, issueType, usedReplacements) {
  if (!removedStop.alternatives || !Array.isArray(removedStop.alternatives)) return null;

  for (const alt of removedStop.alternatives) {
    // Skip invalid alternatives
    if (!validateAlternative(alt, removedStop)) continue;
    // Skip already-used replacements (prevent duplicates across the entire run)
    if (usedReplacements.has(alt.name)) continue;

    if (issueType === 'difficulty') {
      // Filter by fitness-level max difficulty
      const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
      const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);
      const altIdx = DIFFICULTY_ORDER.indexOf((alt.difficulty || 'easy').toLowerCase());
      if (altIdx > maxIdx) continue; // alternative is still too hard
      return alt;
    }

    if (issueType === 'accommodation') {
      // Filter by matching accommodation type
      const pref = (constraints.accommodation || '').toLowerCase();
      const isCamping = /camping|tent|rv|car camping|backcountry/i.test(pref);
      const isLodging = /lodge|hotel|cabin|glamping|airbnb/i.test(pref);
      const altType = (alt.type || '').toLowerCase();
      if (isCamping && altType === 'campground') return alt;
      if (isLodging && altType === 'lodging') return alt;
      continue; // doesn't match preference
    }

    if (issueType === 'schedule_overflow') {
      // Filter by shorter duration
      if ((alt.duration || 0) < (removedStop.duration || 0)) return alt;
      continue;
    }

    // Default: return first valid alternative
    return alt;
  }

  return null;
}

// ── correctItinerary ─────────────────────────────────────────────────────────

/**
 * Apply priority-ordered corrections to an itinerary.
 *
 * @param {object} itinerary - Parsed itinerary data (with .days[])
 * @param {object} constraints - Parsed constraints from constraintEngine
 * @param {object[]} issues - Validated issues from validateItineraryConstraints
 * @param {string|null} npsFacts - Raw NPS facts string (for permit lookups)
 * @param {object} options - { isHypothetical: false, pass: 1 }
 * @returns {{ correctedItinerary, corrections: string[], tooAggressive: boolean, removedCount: number, originalCount: number, gaps: object[] }}
 */
function correctItinerary(itinerary, constraints, issues, npsFacts, options = {}) {
  const { isHypothetical = false, pass = 1 } = options;
  const corrections = [];
  const gaps = [];
  const usedReplacements = new Set();
  let tooAggressive = false;
  let removedCount = 0;

  // Deep clone to avoid mutating original
  const corrected = JSON.parse(JSON.stringify(itinerary));
  const original = JSON.parse(JSON.stringify(itinerary));

  // Count original stops
  const originalCount = corrected.days.reduce((sum, d) => sum + (d.stops?.length || 0), 0);

  // Group issues by severity for priority ordering
  const safetyIssues = issues.filter(i => i.severity === 'safety');
  const feasibilityIssues = issues.filter(i => i.severity === 'feasibility');
  const fitnessIssues = issues.filter(i => i.severity === 'fitness');
  const preferenceIssues = issues.filter(i => i.severity === 'preference');

  // ── 1. SAFETY: Flag permit stops (don't remove) ───────────────────────────
  if (!isHypothetical) {
    const parkCode = (constraints.parkCode || '').toLowerCase();
    if (parkCode && PERMIT_PARKS[parkCode]) {
      for (const day of corrected.days) {
        if (!day.stops) continue;
        for (const stop of day.stops) {
          if (stop.permitRequired) {
            const alreadyNoted = stop.note && /permit|reservation/i.test(stop.note);
            if (!alreadyNoted) {
              stop.note = (stop.note ? stop.note + ' ' : '') + `⚠️ Permit required: ${PERMIT_PARKS[parkCode]}`;
              corrections.push(`Added permit reminder to "${stop.name}"`);
            }
          }
        }
      }
    }
  }

  // ── 2. FEASIBILITY: Fix day count ─────────────────────────────────────────
  const dayCountIssues = feasibilityIssues.filter(i => i.type === 'day_count');
  for (const issue of dayCountIssues) {
    if (corrected.days.length > issue.expected) {
      const removed = corrected.days.splice(issue.expected);
      const removedStops = removed.reduce((sum, d) => sum + (d.stops?.length || 0), 0);
      removedCount += removedStops;
      corrections.push(`Trimmed from ${issue.actual} days to ${issue.expected} days (removed ${removedStops} stops)`);
    }
  }

  // ── 3. FITNESS: Replace or remove stops exceeding fitness level ────────────
  // (Run FITNESS before SCHEDULE_OVERFLOW so smart replacement can shorten the day
  //  and replacement stops are protected by _isReplacement flag)
  for (const issue of fitnessIssues) {
    if (issue.type !== 'difficulty') continue;
    const day = corrected.days[issue.dayIndex];
    if (!day || !day.stops) continue;

    // Find the stop by name (index may have shifted from prior removals)
    const idx = day.stops.findIndex(s => s.name === issue.stopName);
    if (idx === -1) continue;

    // Skip replacement stops (already placed) unless safety
    if (day.stops[idx]._isReplacement && issue.severity !== 'safety') continue;

    // Don't remove if it's the only stop
    if (day.stops.length <= 1) {
      // Downgrade difficulty instead of removing
      day.stops[idx].difficulty = issue.maxAllowed;
      day.stops[idx].note = (day.stops[idx].note ? day.stops[idx].note + ' ' : '') + `⚠️ Difficulty downgraded to ${issue.maxAllowed} for your fitness level`;
      corrections.push(`Downgraded "${issue.stopName}" difficulty to "${issue.maxAllowed}" (was ${issue.stopDifficulty})`);
      continue;
    }

    // Try smart replacement first
    const replacement = findReplacement(day.stops[idx], constraints, 'difficulty', usedReplacements);
    if (replacement) {
      // Replace in-place: keep scheduling fields from original
      const orig = day.stops[idx];
      day.stops[idx] = {
        id: orig.id,
        order: orig.order,
        startTime: orig.startTime,
        drivingTimeFromPreviousMin: orig.drivingTimeFromPreviousMin,
        name: replacement.name,
        type: replacement.type || orig.type,
        difficulty: replacement.difficulty || 'easy',
        duration: replacement.duration || orig.duration,
        latitude: replacement.latitude,
        longitude: replacement.longitude,
        note: replacement.note || '',
        why: `Replaced ${orig.name} to match your fitness level`,
        _isReplacement: true,
      };
      usedReplacements.add(replacement.name);
      corrections.push(`Replaced "${orig.name}" (${issue.stopDifficulty}) with "${replacement.name}" (${replacement.difficulty || 'easy'}) to match your ${constraints.fitnessLevel} fitness level`);
      continue;
    }

    // No replacement found — fall back to removal
    const removedStop = day.stops.splice(idx, 1)[0];
    removedCount++;
    corrections.push(`Removed "${issue.stopName}" (${issue.stopDifficulty}) — exceeds your ${constraints.fitnessLevel} fitness level`);

    // Track gap for regeneration
    gaps.push({
      dayIndex: issue.dayIndex,
      removedName: issue.stopName,
      reason: `difficulty (${issue.stopDifficulty} exceeds ${issue.maxAllowed})`,
      nearLat: removedStop.latitude,
      nearLon: removedStop.longitude,
    });

    // Empty day protection
    if (day.stops.length === 0) {
      day.stops = original.days[issue.dayIndex]?.stops ? JSON.parse(JSON.stringify(original.days[issue.dayIndex].stops)) : [];
      removedCount -= original.days[issue.dayIndex]?.stops?.length || 0;
      tooAggressive = true;
      corrections.push(`Day ${day.dayNumber || issue.dayIndex + 1} preserved — couldn't adjust without removing everything`);
    }
  }

  // ── 4. FEASIBILITY: Fix schedule overflow ─────────────────────────────────
  const overflowIssues = feasibilityIssues.filter(i => i.type === 'schedule_overflow');
  for (const issue of overflowIssues) {
    const day = corrected.days[issue.dayIndex];
    if (!day || !day.stops || day.stops.length <= 1) continue;

    const maxMinutes = 14 * 60;
    let currentMinutes = calcDayMinutes(day);

    // Remove stops in reverse priority: preference-violating first, then shortest, never first stop
    while (currentMinutes > maxMinutes && day.stops.length > 1) {
      const removeIdx = pickStopToRemove(day, constraints, issues);
      if (removeIdx === -1) break; // can't remove anything

      const stopToRemove = day.stops[removeIdx];

      // Skip replacement stops unless safety-critical
      if (stopToRemove._isReplacement) {
        break;
      }

      const removedStop = day.stops.splice(removeIdx, 1)[0];
      removedCount++;
      corrections.push(`Removed "${removedStop.name}" from Day ${day.dayNumber || issue.dayIndex + 1} to fit 14h schedule`);

      // Track gap for regeneration
      gaps.push({
        dayIndex: issue.dayIndex,
        removedName: removedStop.name,
        reason: 'schedule_overflow',
        nearLat: removedStop.latitude,
        nearLon: removedStop.longitude,
      });

      currentMinutes = calcDayMinutes(day);
    }

    // Empty day protection
    if (day.stops.length === 0) {
      day.stops = original.days[issue.dayIndex]?.stops ? JSON.parse(JSON.stringify(original.days[issue.dayIndex].stops)) : [];
      removedCount -= original.days[issue.dayIndex]?.stops?.length || 0;
      tooAggressive = true;
      corrections.push(`Day ${day.dayNumber || issue.dayIndex + 1} preserved — couldn't adjust without removing everything`);
    }
  }

  // ── 5. PREFERENCE: Fix accommodation ──────────────────────────────────────
  for (const issue of preferenceIssues) {
    if (issue.type !== 'accommodation') continue;
    const day = corrected.days[issue.dayIndex];
    if (!day || !day.stops) continue;

    const idx = day.stops.findIndex(s => s.name === issue.stopName);
    if (idx === -1) continue;

    // Skip replacement stops unless safety
    if (day.stops[idx]._isReplacement && issue.severity !== 'safety') continue;

    // Don't remove accommodation if it's the only stop
    if (day.stops.length <= 1) continue;

    // Try smart replacement first
    const replacement = findReplacement(day.stops[idx], constraints, 'accommodation', usedReplacements);
    if (replacement) {
      const orig = day.stops[idx];
      day.stops[idx] = {
        id: orig.id,
        order: orig.order,
        startTime: orig.startTime,
        drivingTimeFromPreviousMin: orig.drivingTimeFromPreviousMin,
        name: replacement.name,
        type: replacement.type || orig.type,
        difficulty: replacement.difficulty,
        duration: replacement.duration || orig.duration,
        latitude: replacement.latitude,
        longitude: replacement.longitude,
        note: replacement.note || '',
        why: `Replaced ${orig.name} to match your ${constraints.accommodation} preference`,
        _isReplacement: true,
      };
      usedReplacements.add(replacement.name);
      corrections.push(`Replaced "${orig.name}" with "${replacement.name}" to match your ${constraints.accommodation} preference`);
      continue;
    }

    // No replacement — fall back to removal
    const removedStop = day.stops.splice(idx, 1)[0];
    removedCount++;
    corrections.push(`Removed "${issue.stopName}" — doesn't match your ${constraints.accommodation} preference`);

    gaps.push({
      dayIndex: issue.dayIndex,
      removedName: issue.stopName,
      reason: `accommodation mismatch (wanted ${constraints.accommodation})`,
      nearLat: removedStop.latitude,
      nearLon: removedStop.longitude,
    });
  }

  // ── 6. PREFERENCE: Fix overloaded days ────────────────────────────────────
  for (const issue of preferenceIssues) {
    if (issue.type !== 'overloaded_day') continue;
    const day = corrected.days[issue.dayIndex];
    if (!day || !day.stops) continue;

    const maxStops = issue.maxStops || 4;
    while (day.stops.length > maxStops) {
      // Remove last non-essential stop (not first, not lodging/campground)
      let removeIdx = -1;
      for (let i = day.stops.length - 1; i > 0; i--) {
        if (day.stops[i].type !== 'campground' && day.stops[i].type !== 'lodging') {
          removeIdx = i;
          break;
        }
      }
      if (removeIdx === -1) break;

      const removedStop = day.stops.splice(removeIdx, 1)[0];
      removedCount++;
      corrections.push(`Removed "${removedStop.name}" from Day ${day.dayNumber || issue.dayIndex + 1} (family-friendly: max ${maxStops} stops)`);
    }
  }

  return {
    correctedItinerary: corrected,
    corrections,
    tooAggressive,
    removedCount,
    originalCount,
    gaps,
  };
}

/**
 * Compute confidence score based on corrections applied.
 */
function computeConfidence(corrections, removedCount, originalCount) {
  if (corrections.length === 0) return { level: 'high', score: 1.0 };

  const removalRatio = originalCount > 0 ? removedCount / originalCount : 0;

  if (removalRatio > 0.5 || corrections.length > 5) {
    return { level: 'low', score: 0.3 };
  }
  if (corrections.length > 2 || removalRatio > 0.25) {
    return { level: 'medium', score: 0.6 };
  }
  return { level: 'high', score: 0.9 };
}

// ── Plan Scoring ─────────────────────────────────────────────────────────────

/** Maps user interests to synonym lists for fuzzy matching. */
const INTEREST_SYNONYM_MAP = {
  photography: ['viewpoint', 'sunrise', 'sunset', 'overlook', 'vista', 'panoram'],
  hiking: ['trail', 'hike', 'trek', 'walk', 'path'],
  wildlife: ['meadow', 'valley', 'wildlife', 'animals', 'birding', 'elk', 'bear'],
  camping: ['campground', 'tent', 'backcountry', 'campsite'],
  history: ['museum', 'ruins', 'visitor center', 'ranger', 'cultural', 'historic'],
  'scenic-drives': ['drive', 'road', 'scenic', 'overlook', 'viewpoint'],
  stargazing: ['night', 'star', 'dark sky', 'astronomy'],
  fishing: ['lake', 'river', 'stream', 'fish', 'angling'],
  kayaking: ['water', 'lake', 'river', 'paddle', 'kayak', 'canoe'],
};

/**
 * Scores a generated itinerary across 5 dimensions.
 *
 * @param {object} itineraryData - Parsed itinerary data
 * @param {object} constraints - Parsed constraints
 * @returns {{ dimensions: {compliance, diversity, pacing, interestMatch, geoEfficiency}, overall: number, label: string }}
 */
function scoreItinerary(itineraryData, constraints) {
  if (!itineraryData || !itineraryData.days) {
    return { dimensions: { compliance: 1, diversity: 1, pacing: 1, interestMatch: 1, geoEfficiency: 1 }, overall: 1.0, label: 'Excellent' };
  }

  const allStops = itineraryData.days.flatMap(d => d.stops || []);
  if (allStops.length === 0) {
    return { dimensions: { compliance: 1, diversity: 1, pacing: 1, interestMatch: 1, geoEfficiency: 1 }, overall: 1.0, label: 'Excellent' };
  }

  // ── 1. Compliance (weight 0.25): % of stops passing constraint checks ──
  let compliance = 1.0;
  if (constraints?.hasConstraints) {
    let passing = 0;
    for (const stop of allStops) {
      let passes = true;

      // Check fitness
      if (constraints.fitnessLevel && stop.difficulty) {
        const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
        const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);
        const stopIdx = DIFFICULTY_ORDER.indexOf(stop.difficulty.toLowerCase());
        if (stopIdx > maxIdx) passes = false;
      }

      // Check accommodation
      if (constraints.accommodation && (stop.type === 'campground' || stop.type === 'lodging')) {
        const pref = constraints.accommodation.toLowerCase();
        const isCamping = /camping|tent|rv|car camping|backcountry/i.test(pref);
        const isLodging = /lodge|hotel|cabin|glamping|airbnb/i.test(pref);
        if (isCamping && stop.type === 'lodging') passes = false;
        if (isLodging && stop.type === 'campground') passes = false;
      }

      if (passes) passing++;
    }
    compliance = allStops.length > 0 ? passing / allStops.length : 1;
  }

  // ── 2. Diversity (weight 0.20): Shannon entropy of stop types ──
  const typeCounts = {};
  for (const stop of allStops) {
    const t = stop.type || 'custom';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const types = Object.values(typeCounts);
  const totalStops = allStops.length;
  let entropy = 0;
  for (const count of types) {
    const p = count / totalStops;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(Math.max(types.length, 1));
  const diversity = maxEntropy > 0 ? Math.min(1, entropy / maxEntropy) : 1;

  // ── 3. Pacing (weight 0.15): penalize days with <2 or >5 stops ──
  let pacingPenalty = 0;
  for (const day of itineraryData.days) {
    const stopCount = day.stops?.length || 0;
    if (stopCount < 2) pacingPenalty += 0.3;
    else if (stopCount > 5) pacingPenalty += 0.2 * (stopCount - 5);
  }
  const pacing = Math.max(0, 1 - pacingPenalty / Math.max(itineraryData.days.length, 1));

  // ── 4. Interest Match (weight 0.25): % of stops matching user interests ──
  let interestMatch = 1.0;
  if (constraints?.interests?.length > 0) {
    // Expand interests to synonym lists
    const keywords = [];
    for (const interest of constraints.interests) {
      const lower = interest.toLowerCase().trim();
      // Check synonym map
      if (INTEREST_SYNONYM_MAP[lower]) {
        keywords.push(...INTEREST_SYNONYM_MAP[lower]);
      } else {
        // Also check if the interest matches a synonym map key partially
        let found = false;
        for (const [key, synonyms] of Object.entries(INTEREST_SYNONYM_MAP)) {
          if (lower.includes(key) || key.includes(lower)) {
            keywords.push(...synonyms);
            found = true;
            break;
          }
        }
        if (!found) keywords.push(lower);
      }
    }

    let matchingStops = 0;
    for (const stop of allStops) {
      const searchText = `${stop.name || ''} ${stop.note || ''} ${stop.type || ''} ${stop.why || ''}`.toLowerCase();
      const matches = keywords.some(kw => searchText.includes(kw));
      if (matches) matchingStops++;
    }
    interestMatch = totalStops > 0 ? matchingStops / totalStops : 1;
  }

  // ── 5. Geo Efficiency (weight 0.15): penalize backtracking ──
  let geoEfficiency = 1.0;
  let totalBacktrack = 0;
  let segmentCount = 0;

  for (const day of itineraryData.days) {
    const geoStops = (day.stops || []).filter(s => s.latitude != null && s.longitude != null);
    if (geoStops.length < 3) continue;

    for (let i = 0; i < geoStops.length - 2; i++) {
      const a = geoStops[i];
      const b = geoStops[i + 1];
      const c = geoStops[i + 2];
      const distAB = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
      const distAC = haversineDistance(a.latitude, a.longitude, c.latitude, c.longitude);
      segmentCount++;
      if (distAC > 0 && distAB > 0 && distAC < distAB * 0.5 && distAB > 5) {
        totalBacktrack++;
      }
    }
  }
  if (segmentCount > 0) {
    geoEfficiency = Math.max(0, 1 - (totalBacktrack / segmentCount));
  }

  // ── Weighted average ──
  const overall = (
    compliance * 0.25 +
    diversity * 0.20 +
    pacing * 0.15 +
    interestMatch * 0.25 +
    geoEfficiency * 0.15
  );

  // Round to 2 decimals
  const round = v => Math.round(v * 100) / 100;

  let label;
  if (overall >= 0.85) label = 'Excellent';
  else if (overall >= 0.70) label = 'Good';
  else if (overall >= 0.50) label = 'Fair';
  else label = 'Needs Improvement';

  return {
    dimensions: {
      compliance: round(compliance),
      diversity: round(diversity),
      pacing: round(pacing),
      interestMatch: round(interestMatch),
      geoEfficiency: round(geoEfficiency),
    },
    overall: round(overall),
    label,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Calculate total active minutes for a day (excludes overnight stays) */
function calcDayMinutes(day) {
  if (!day.stops) return 0;
  return day.stops.reduce((sum, s) => {
    // Skip overnight stays — campgrounds/lodging aren't daytime activity
    if (s.type === 'campground' || s.type === 'lodging') return sum + (s.drivingTimeFromPreviousMin || 0);
    return sum + (s.duration || 0) + (s.drivingTimeFromPreviousMin || 0);
  }, 0);
}

/**
 * Pick the best stop index to remove from a day when trimming for schedule overflow.
 * Priority: preference-violating stops first, then shortest duration, never first stop.
 */
function pickStopToRemove(day, constraints, issues) {
  if (!day.stops || day.stops.length <= 1) return -1;

  // 1. First look for preference-violating stops (wrong accommodation type)
  if (constraints.accommodation) {
    const pref = constraints.accommodation.toLowerCase();
    const isCamping = /camping|tent|rv|car camping|backcountry/i.test(pref);
    const isLodging = /lodge|hotel|cabin|glamping|airbnb/i.test(pref);

    for (let i = day.stops.length - 1; i > 0; i--) {
      const s = day.stops[i];
      if (isCamping && s.type === 'lodging') return i;
      if (isLodging && s.type === 'campground') return i;
    }
  }

  // 2. Remove shortest-duration stop (skip index 0 — anchor)
  let shortestIdx = -1;
  let shortestDur = Infinity;
  for (let i = 1; i < day.stops.length; i++) {
    const dur = day.stops[i].duration || 0;
    if (dur < shortestDur) {
      shortestDur = dur;
      shortestIdx = i;
    }
  }
  return shortestIdx;
}

module.exports = { correctItinerary, computeConfidence, scoreItinerary };
