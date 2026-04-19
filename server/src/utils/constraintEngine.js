/**
 * Constraint Engine — parses user constraints, performs pre-flight checks,
 * builds constraint blocks for AI prompts, and validates itinerary compliance.
 */

// ── Static Data ──────────────────────────────────────────────────────────────

/**
 * Crowd scores by park code × month (0-10, 0 = closed/empty, 10 = peak).
 * Source: 2025 NPS visitation data.
 */
const CROWD_SCORES = {
  acad: [0,0,0,1,4,8,10,10,8,7,1,0],
  arch: [2,2,7,8,10,10,9,8,9,7,4,2],
  badl: [0,0,1,1,4,9,10,8,5,2,1,0],
  bibe: [5,5,10,7,5,3,2,2,3,5,7,6],
  bisc: [7,8,10,9,10,8,9,7,7,6,7,8],
  blca: [2,1,2,3,7,9,9,10,9,5,3,1],
  brca: [1,1,3,6,9,10,9,8,10,7,2,1],
  cany: [1,1,6,9,10,8,6,5,8,8,4,2],
  care: [1,1,4,7,10,8,6,5,8,8,3,1],
  cave: [3,4,9,7,7,9,10,6,5,6,5,6],
  chis: [3,5,6,7,7,9,10,9,8,8,7,5],
  cong: [4,5,9,8,10,7,5,4,5,7,7,5],
  crla: [0,0,1,1,2,5,10,7,5,3,1,0],
  cuva: [3,3,5,7,8,9,10,9,8,8,4,3],
  deva: [5,7,10,9,7,5,6,5,6,6,7,7],
  drto: [8,8,9,9,10,10,9,8,7,6,7,8],
  ever: [9,9,10,9,6,6,6,6,4,4,6,8],
  gaar: [0,0,0,0,1,6,9,10,3,0,0,0],
  glac: [0,0,0,1,2,7,10,9,7,2,0,0],
  glba: [0,0,0,0,7,9,10,10,8,3,0,0],
  grca: [3,3,6,8,9,9,10,9,8,8,6,5],
  grte: [1,1,1,1,4,9,10,9,8,3,1,1],
  grba: [1,1,1,3,6,10,9,9,10,7,1,1],
  grsa: [1,1,2,3,7,10,9,7,5,4,1,1],
  grsm: [3,3,6,7,8,9,10,8,8,10,6,5],
  gumo: [3,4,10,8,6,4,4,3,4,7,6,6],
  hale: [7,8,9,9,10,10,10,8,9,9,8,10],
  havo: [9,8,8,7,7,9,10,9,8,8,9,10],
  hosp: [4,6,7,7,7,10,8,7,4,5,5,4],
  indu: [1,2,3,3,5,8,10,8,5,4,2,2],
  isro: [0,0,0,0,2,7,10,10,4,0,0,0],
  jotr: [6,7,10,9,6,4,3,3,4,5,7,8],
  katm: [0,0,0,0,0,3,10,7,4,0,0,0],
  kefj: [0,0,0,0,2,8,10,8,3,0,0,0],
  kica: [2,1,1,3,7,9,10,8,6,4,2,2],
  kova: [5,4,4,4,4,7,8,9,8,10,8,8],
  lacl: [0,0,0,0,1,8,10,9,4,0,0,0],
  lavo: [1,1,1,1,3,7,10,6,6,4,1,1],
  maca: [1,2,6,6,6,8,10,7,6,6,3,2],
  meve: [1,1,2,3,6,10,10,8,7,5,1,1],
  mora: [1,0,1,1,2,5,10,10,6,3,1,1],
  neri: [1,1,3,5,6,8,10,8,6,6,3,2],
  noca: [0,0,0,0,1,4,10,9,8,2,0,0],
  olym: [1,1,2,2,3,5,8,10,6,4,2,1],
  pefo: [3,3,7,7,9,10,9,7,6,8,4,4],
  pinn: [5,7,10,10,10,8,7,6,6,6,7,6],
  redw: [3,3,4,5,8,10,10,9,9,6,4,3],
  romo: [2,1,2,2,4,8,10,8,8,5,2,2],
  sagu: [7,8,10,7,4,3,2,2,3,4,5,6],
  sequ: [2,2,3,4,6,7,10,9,6,5,3,2],
  shen: [1,1,2,4,5,6,6,6,5,10,5,1],
  thro: [0,0,1,1,5,9,10,9,7,3,1,0],
  viis: [8,8,10,9,9,8,8,6,4,5,8,10],
  voya: [1,1,1,0,6,9,10,10,5,2,1,0],
  whsa: [4,4,10,8,7,6,7,5,5,6,5,6],
  wica: [1,1,2,3,5,8,10,8,6,2,1,1],
  wrst: [0,0,0,0,2,7,10,8,3,0,0,0],
  yell: [0,1,0,1,5,9,10,9,8,3,0,0],
  yose: [2,2,3,5,7,9,10,10,9,7,4,3],
  zion: [2,2,6,8,9,10,10,8,8,8,5,3],
};

/** Parks that require permits or timed-entry reservations */
const PERMIT_PARKS = {
  acad: 'Vehicle reservation May-Oct',
  arch: 'Timed-entry Apr-Oct',
  glac: 'Vehicle reservation Jun-Sep',
  grte: 'Jenny Lake limited Jul-Aug',
  hale: 'Sunrise reservation year-round',
  mora: 'Timed-entry Jul-Sep',
  romo: 'Timed-entry May-Oct',
  shen: 'Timed-entry May-Nov',
  yose: 'Timed-entry May-Sep',
  zion: 'Shuttle + timed-entry peak season',
};

/** Difficulty levels ordered from easiest to hardest */
const DIFFICULTY_ORDER = ['easy', 'moderate', 'hard', 'strenuous'];

/** Fitness level → max allowed difficulty */
const FITNESS_TO_MAX_DIFFICULTY = {
  easy: 'easy',
  beginner: 'easy',
  moderate: 'moderate',
  intermediate: 'moderate',
  hard: 'hard',
  advanced: 'hard',
  strenuous: 'strenuous',
  experienced: 'strenuous',
  expert: 'strenuous',
};

// ── parseConstraints ─────────────────────────────────────────────────────────

/**
 * Extract structured constraints from metadata.formData + user message fallback.
 */
function parseConstraints(metadata, userMessage) {
  const fd = metadata?.formData || {};
  const msg = userMessage || '';

  // Park code — from metadata or message
  const parkCode = fd.parkCode || metadata?.parkCode || null;

  // Dates
  let startDate = fd.startDate || fd.dates?.start || null;
  let endDate = fd.endDate || fd.dates?.end || null;
  let numDays = fd.numDays || fd.days || null;

  // Regex fallback for dates from message
  if (!startDate && !numDays) {
    const dayMatch = msg.match(/(\d+)\s*(?:day|night)/i);
    if (dayMatch) numDays = parseInt(dayMatch[1], 10);
  }

  if (startDate && endDate && !numDays) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!isNaN(s) && !isNaN(e)) {
      numDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }
  }

  // Group size
  let groupSize = fd.groupSize || fd.travelers || null;
  if (!groupSize) {
    const groupMatch = msg.match(/(\d+)\s*(?:people|person|adults?|of us|travelers?)/i);
    if (groupMatch) groupSize = parseInt(groupMatch[1], 10);
  }

  // Budget
  let budget = fd.budget || null;
  if (!budget) {
    const budgetMatch = msg.match(/(?:budget|spend)\s*(?:is|of|around|about)?\s*\$?([\d,]+)/i);
    if (budgetMatch) budget = budgetMatch[1].replace(/,/g, '');
  }

  // Fitness level
  let fitnessLevel = fd.fitnessLevel || fd.fitness || fd.difficulty || null;
  if (!fitnessLevel) {
    // Try structured format first: "fitness level: moderate"
    const fitMatch = msg.match(/(?:fitness|difficulty|experience)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|intermediate|advanced|hard|strenuous|experienced)/i);
    if (fitMatch) {
      fitnessLevel = fitMatch[1].toLowerCase();
    } else {
      // Fallback: natural phrasing like "beginner hiker", "I'm a beginner", "easy hiker"
      const naturalMatch = msg.match(/\b(beginner|novice|easy|moderate|intermediate|advanced|experienced|expert)\s*(?:hiker|climber|trekker|traveler|level)?\b/i);
      if (naturalMatch) fitnessLevel = naturalMatch[1].toLowerCase();
    }
  }
  if (fitnessLevel) {
    fitnessLevel = fitnessLevel.toLowerCase();
    // Normalize synonyms
    if (fitnessLevel === 'novice') fitnessLevel = 'beginner';
  }

  // Accommodation
  let accommodation = fd.accommodation || fd.lodging || null;
  if (!accommodation) {
    const accomMatch = msg.match(/(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb)/i);
    if (accomMatch) accommodation = accomMatch[1].toLowerCase();
  }

  // Interests
  let interests = fd.interests || [];
  if (typeof interests === 'string') interests = interests.split(',').map(s => s.trim());

  // Children
  let hasChildren = fd.hasChildren || fd.children || false;
  if (!hasChildren) {
    hasChildren = /\b(?:kids?|children|toddler|family|infant|baby)\b/i.test(msg);
  }

  const hasConstraints = !!(parkCode || numDays || groupSize || budget || fitnessLevel || accommodation || interests.length > 0 || hasChildren);

  return {
    parkCode,
    dates: { start: startDate, end: endDate, numDays },
    groupSize,
    budget,
    fitnessLevel,
    accommodation,
    interests,
    hasChildren,
    hasConstraints,
  };
}

// ── preflightCheck ───────────────────────────────────────────────────────────

/**
 * Static pre-flight checks before calling AI.
 * Returns { warnings: string[], blockers: string[] }
 */
function preflightCheck(constraints, parkCode) {
  const warnings = [];
  const blockers = [];
  const code = (parkCode || constraints.parkCode || '').toLowerCase();

  // Get travel month from dates
  let travelMonth = null;
  if (constraints.dates?.start) {
    const d = new Date(constraints.dates.start);
    if (!isNaN(d)) travelMonth = d.getMonth(); // 0-indexed
  }

  // Check crowd score → blocker if park is completely closed that month
  if (code && travelMonth !== null && CROWD_SCORES[code]) {
    const score = CROWD_SCORES[code][travelMonth];
    if (score === 0) {
      const monthName = new Date(2025, travelMonth).toLocaleString('en-US', { month: 'long' });
      blockers.push(`${code.toUpperCase()} has a crowd score of 0 in ${monthName} — the park is effectively closed or inaccessible. Choose different dates or a different park.`);
    } else if (score >= 9) {
      const monthName = new Date(2025, travelMonth).toLocaleString('en-US', { month: 'long' });
      warnings.push(`${monthName} is peak season (extremely crowded). Book reservations well in advance and arrive early.`);
    }
  }

  // Permit reminder
  if (code && PERMIT_PARKS[code]) {
    warnings.push(`Permit/reservation required: ${PERMIT_PARKS[code]}. Book on recreation.gov.`);
  }

  // Fitness contradictions
  if (constraints.fitnessLevel && constraints.interests.length > 0) {
    const fitLevel = constraints.fitnessLevel;
    const wantsStrenuous = constraints.interests.some(i => /strenuous|rock climbing|backpacking|scrambl/i.test(i));
    if ((fitLevel === 'easy' || fitLevel === 'beginner') && wantsStrenuous) {
      warnings.push(`Your fitness level is "${fitLevel}" but your interests include strenuous activities. The plan will prioritize safety over ambition.`);
    }
  }

  // Budget + accommodation tension
  if (constraints.budget && constraints.accommodation) {
    const budgetNum = parseInt(constraints.budget, 10);
    const isLuxury = /lodge|hotel|cabin|glamping|airbnb/i.test(constraints.accommodation);
    if (budgetNum && budgetNum < 200 && isLuxury) {
      warnings.push(`Budget ($${budgetNum}) may be tight for ${constraints.accommodation} accommodation. Consider camping as a backup.`);
    }
  }

  // Family + short trip warning
  if (constraints.hasChildren && constraints.dates?.numDays && constraints.dates.numDays <= 2) {
    warnings.push(`A ${constraints.dates.numDays}-day trip with children is tight. The plan will keep days shorter with fewer stops.`);
  }

  return { warnings, blockers };
}

// ── buildConstraintBlock ─────────────────────────────────────────────────────

/**
 * Builds a prompt injection block with explicit user constraints.
 */
function buildConstraintBlock(constraints) {
  if (!constraints.hasConstraints) return '';

  const lines = ['--- USER CONSTRAINTS (MUST RESPECT) ---'];

  if (constraints.dates?.numDays) {
    lines.push(`HARD RULE: Trip length = ${constraints.dates.numDays} day(s). Do NOT generate more days.`);
  }
  if (constraints.dates?.start) {
    lines.push(`Start date: ${constraints.dates.start}`);
  }
  if (constraints.dates?.end) {
    lines.push(`End date: ${constraints.dates.end}`);
  }
  if (constraints.groupSize) {
    lines.push(`Group size: ${constraints.groupSize} people`);
  }
  if (constraints.hasChildren) {
    lines.push(`HARD RULE: Family with children — max 4 stops per day, no strenuous trails, kid-friendly activities only.`);
  }
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    lines.push(`HARD RULE: Fitness level = "${constraints.fitnessLevel}". Maximum trail difficulty = "${maxDiff}". Do NOT include trails above this difficulty.`);
  }
  if (constraints.accommodation) {
    lines.push(`HARD RULE: Accommodation preference = "${constraints.accommodation}". Only suggest this type unless unavailable.`);
  }
  if (constraints.budget) {
    lines.push(`Budget: $${constraints.budget}`);
  }
  if (constraints.interests.length > 0) {
    lines.push(`Interests: ${constraints.interests.join(', ')}`);
  }

  lines.push('--- END USER CONSTRAINTS ---');
  return '\n\n' + lines.join('\n') + '\n';
}

// ── validateItineraryConstraints ─────────────────────────────────────────────

/**
 * Validates a parsed itinerary against user constraints.
 * Returns array of structured issues.
 */
function validateItineraryConstraints(itineraryData, constraints) {
  if (!itineraryData || !itineraryData.days || !constraints?.hasConstraints) return [];

  const issues = [];

  // 1. Day count check
  if (constraints.dates?.numDays) {
    const expected = constraints.dates.numDays;
    const actual = itineraryData.days.length;
    if (actual > expected) {
      issues.push({
        type: 'day_count',
        severity: 'feasibility',
        details: `Itinerary has ${actual} days but user requested ${expected}`,
        expected,
        actual,
      });
    }
  }

  // 2. Difficulty vs fitness
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);

    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      for (let si = 0; si < day.stops.length; si++) {
        const stop = day.stops[si];
        if (!stop.difficulty) continue;
        const stopIdx = DIFFICULTY_ORDER.indexOf(stop.difficulty.toLowerCase());
        if (stopIdx > maxIdx) {
          issues.push({
            type: 'difficulty',
            severity: 'fitness',
            details: `"${stop.name}" is ${stop.difficulty} but user fitness is "${constraints.fitnessLevel}" (max: ${maxDiff})`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
            stopDifficulty: stop.difficulty,
            maxAllowed: maxDiff,
          });
        }
      }
    }
  }

  // 3. Accommodation type
  if (constraints.accommodation) {
    const pref = constraints.accommodation.toLowerCase();
    const isCamping = /camping|tent|rv|car camping|backcountry/i.test(pref);
    const isLodging = /lodge|hotel|cabin|glamping|airbnb/i.test(pref);

    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      for (let si = 0; si < day.stops.length; si++) {
        const stop = day.stops[si];
        if (stop.type !== 'campground' && stop.type !== 'lodging') continue;

        const isCampStop = stop.type === 'campground';
        if (isCamping && !isCampStop) {
          issues.push({
            type: 'accommodation',
            severity: 'preference',
            details: `"${stop.name}" is lodging but user prefers ${pref}`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
          });
        } else if (isLodging && isCampStop) {
          issues.push({
            type: 'accommodation',
            severity: 'preference',
            details: `"${stop.name}" is camping but user prefers ${pref}`,
            dayIndex: di,
            stopIndex: si,
            stopName: stop.name,
          });
        }
      }
    }
  }

  // 4. Stop count for families
  if (constraints.hasChildren) {
    for (let di = 0; di < itineraryData.days.length; di++) {
      const day = itineraryData.days[di];
      if (!day.stops) continue;
      if (day.stops.length > 4) {
        issues.push({
          type: 'overloaded_day',
          severity: 'preference',
          details: `Day ${day.dayNumber || di + 1} has ${day.stops.length} stops but family trips should have max 4`,
          dayIndex: di,
          maxStops: 4,
        });
      }
    }
  }

  // 5. Schedule overflow (>14h active)
  for (let di = 0; di < itineraryData.days.length; di++) {
    const day = itineraryData.days[di];
    if (!day.stops || day.stops.length === 0) continue;

    let totalMinutes = 0;
    for (const stop of day.stops) {
      totalMinutes += (stop.duration || 0) + (stop.drivingTimeFromPreviousMin || 0);
    }

    if (totalMinutes > 14 * 60) {
      issues.push({
        type: 'schedule_overflow',
        severity: 'feasibility',
        details: `Day ${day.dayNumber || di + 1} has ${Math.round(totalMinutes / 60 * 10) / 10}h of activity — exceeds 14h max`,
        dayIndex: di,
        totalMinutes,
      });
    }
  }

  // 6. startTime overlap detection (basic: checks that stops are in chronological order)
  for (let di = 0; di < itineraryData.days.length; di++) {
    const day = itineraryData.days[di];
    if (!day.stops || day.stops.length < 2) continue;

    for (let si = 1; si < day.stops.length; si++) {
      const prev = day.stops[si - 1];
      const curr = day.stops[si];
      if (!prev.startTime || !curr.startTime) continue;

      const prevMinutes = parseTime(prev.startTime);
      const currMinutes = parseTime(curr.startTime);
      if (prevMinutes !== null && currMinutes !== null) {
        const prevEnd = prevMinutes + (prev.duration || 0) + (curr.drivingTimeFromPreviousMin || 0);
        if (currMinutes < prevEnd - 15) { // 15min tolerance
          issues.push({
            type: 'time_overlap',
            severity: 'feasibility',
            details: `Day ${day.dayNumber || di + 1}: "${curr.name}" starts at ${curr.startTime} but "${prev.name}" doesn't end until ~${minutesToTime(prevEnd)}`,
            dayIndex: di,
            stopIndex: si,
          });
        }
      }
    }
  }

  return issues;
}

// ── detectHypothetical ───────────────────────────────────────────────────────

/**
 * Detects if user message is a hypothetical/scenario question.
 */
function detectHypothetical(userMessage) {
  if (!userMessage) return { isHypothetical: false, scenarioDescription: null };

  const patterns = [
    /what if\b/i,
    /what would happen\b/i,
    /hypothetically\b/i,
    /imagine\b/i,
    /in a scenario\b/i,
    /if the road (?:was|were|is) closed/i,
    /if it (?:rains?|snows?|storms?)/i,
    /if we (?:can't|couldn't|cannot)/i,
    /plan B/i,
    /backup plan/i,
    /alternative.*if/i,
    /assuming\b.*(?:closed|unavailable|shut|blocked|can't access)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match) {
      return {
        isHypothetical: true,
        scenarioDescription: match[0],
      };
    }
  }

  return { isHypothetical: false, scenarioDescription: null };
}

// ── detectConflicts ──────────────────────────────────────────────────────────

/**
 * Detects contradictions between parsed constraints AND between constraints
 * and the user's message. Returns structured conflicts for prompt injection.
 */
function detectConflicts(constraints, userMessage) {
  const conflicts = [];
  const msg = (userMessage || '').toLowerCase();

  // 1. Fitness vs. requested difficulty
  if (constraints.fitnessLevel) {
    const maxDiff = FITNESS_TO_MAX_DIFFICULTY[constraints.fitnessLevel] || 'moderate';
    const maxIdx = DIFFICULTY_ORDER.indexOf(maxDiff);

    // Check if user message requests activities above their fitness level
    const wantsHard = /\b(?:challenging|strenuous|hardest|toughest|most difficult|extreme|intense|demanding|ambitious)\b/i.test(msg);
    const wantsSpecificHard = /\b(?:angels landing|half dome|highline trail|the narrows|chains|scramble|exposed|class \d)\b/i.test(msg);

    if ((wantsHard || wantsSpecificHard) && maxIdx <= 1) { // easy or moderate
      conflicts.push({
        type: 'fitness_vs_difficulty',
        constraintA: `Fitness level: ${constraints.fitnessLevel} (max difficulty: ${maxDiff})`,
        constraintB: `User requests: challenging/strenuous activities`,
        resolution: 'fitness',
        prompt: `The user identifies as "${constraints.fitnessLevel}" but is requesting challenging/strenuous activities. These are CONTRADICTORY constraints. You MUST:\n1. Name the conflict clearly: "Your fitness level (${constraints.fitnessLevel}) conflicts with requesting the most challenging hikes."\n2. Present TWO distinct options:\n   - **Option A (Safe — recommended):** A plan matching their fitness level with the most rewarding easy/moderate experiences\n   - **Option B (Ambitious — with warnings):** A plan with harder trails, but with EXPLICIT safety warnings, bail-out points, and fitness requirements for each trail\n3. Do NOT silently merge these into one plan. Do NOT include strenuous trails without flagging the risk.`
      });
    }
  }

  // 2. Easy/relaxing vs. adventurous
  const wantsEasy = /\b(?:easy|relaxing|chill|laid.?back|leisurely|gentle|casual)\b/i.test(msg);
  const wantsAdventure = /\b(?:adventurous|adventure|thrilling|exciting|adrenaline|extreme|push.*limit|maximize.*adventure)\b/i.test(msg);
  if (wantsEasy && wantsAdventure) {
    conflicts.push({
      type: 'easy_vs_adventure',
      constraintA: 'User wants: easy/relaxing',
      constraintB: 'User wants: adventurous/thrilling',
      resolution: 'present_options',
      prompt: `The user wants both "easy/relaxing" AND "adventurous/thrilling" — these pull in opposite directions. You MUST:\n1. Name the conflict: "Easy and adventurous are competing goals."\n2. Present TWO distinct plans:\n   - **Option A (Easy + Scenic):** Dramatic payoffs with minimal effort (viewpoints, short walks, scenic drives)\n   - **Option B (Adventure-Forward):** One big adventure day, then easy recovery\n3. Do NOT blend these into a generic middle-ground plan.`
    });
  }

  // 3. Budget vs. luxury accommodation
  if (constraints.budget && constraints.accommodation) {
    const budgetNum = parseInt(constraints.budget, 10);
    const isLuxury = /lodge|hotel|cabin|glamping|resort/i.test(constraints.accommodation);
    if (budgetNum && budgetNum < 150 && isLuxury) {
      conflicts.push({
        type: 'budget_vs_accommodation',
        constraintA: `Budget: $${constraints.budget}/day`,
        constraintB: `Accommodation: ${constraints.accommodation}`,
        resolution: 'present_options',
        prompt: `Budget ($${constraints.budget}) conflicts with ${constraints.accommodation} preference — most lodges/hotels in national parks cost $150+/night. Present TWO options: one with ${constraints.accommodation} that exceeds budget, one with camping/budget alternatives that fits.`
      });
    }
  }

  // 4. Short trip + too many parks
  const parkCount = (msg.match(/\b(?:and|,)\s*(?:then\s+)?(?:visit|go to|stop at|hit|see)\b/gi) || []).length;
  if (constraints.dates?.numDays && constraints.dates.numDays <= 3 && parkCount >= 2) {
    conflicts.push({
      type: 'time_vs_scope',
      constraintA: `Trip length: ${constraints.dates.numDays} days`,
      constraintB: `Multiple parks requested`,
      resolution: 'present_options',
      prompt: `${constraints.dates.numDays} days is tight for multiple parks. Present TWO options: one deep-dive into the primary park, one multi-park highlight reel with honest tradeoffs about drive time.`
    });
  }

  return conflicts;
}

// ── Intent Detection ─────────────────────────────────────────────────────────

/** Maps user archetypes to regex patterns and prompt adaptation blocks. */
const INTENT_ARCHETYPES = {
  photographer: {
    patterns: [/\bsunrise\b/i, /\bsunset\b/i, /\bgolden hour\b/i, /\bcamera\b/i, /\bphoto(?:s|graphy|graph)?\b/i, /\blandscape shots?\b/i, /\bcapture\b/i],
    prompt: `USER INTENT — PHOTOGRAPHER:
- Prioritize viewpoints, overlooks, and vistas with the best light conditions
- Suggest specific sunrise/sunset times and golden hour windows for each stop
- Recommend less-crowded viewpoints over tourist-heavy ones for cleaner shots
- Note any tripod restrictions or photography permits
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous sunrise hikes for a photographer with beginner fitness.`,
  },
  family: {
    patterns: [/\bkids?\b/i, /\bchildren\b/i, /\btoddler\b/i, /\bstroller\b/i, /\bfamily\b/i, /\binfant\b/i, /\bbaby\b/i],
    prompt: `USER INTENT — FAMILY:
- Max 4 stops per day — kids fatigue fast
- Prioritize easy trails, paved paths, and wheelchair/stroller-accessible routes
- Include stops with restrooms, picnic areas, and shade
- Suggest kid-friendly activities: ranger programs, junior ranger booklets, nature centers
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  adventurer: {
    patterns: [/\bchallenging\b/i, /\bstrenuous\b/i, /\bsummit\b/i, /\bbackpacking\b/i, /\bscrambl/i, /\bclass \d/i, /\bexposed\b/i, /\bpeak\s*bagg/i],
    prompt: `USER INTENT — ADVENTURER:
- Prioritize the hardest, most rewarding trails with significant elevation gain
- Include elevation profiles and technical difficulty details
- Suggest pre-dawn starts to maximize daylight on long routes
- Note bail-out points and emergency exit routes on exposed trails
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  relaxer: {
    patterns: [/\brelaxing\b/i, /\beasy\b/i, /\bchill\b/i, /\bscenic driv/i, /\bleisure/i, /\blaid.?back\b/i, /\bslow\s*pace/i],
    prompt: `USER INTENT — RELAXER:
- Max 3 stops per day — no rushing
- No early starts before 9 AM unless specifically requested
- Prioritize scenic drives, short walks, and viewpoint pull-offs
- Include rest/downtime between activities
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  wildlife: {
    patterns: [/\bwildlife\b/i, /\banimals?\b/i, /\bbirding\b/i, /\bbears?\b/i, /\belk\b/i, /\bbison\b/i, /\bwolf\b/i, /\bwhale\b/i],
    prompt: `USER INTENT — WILDLIFE:
- Prioritize dawn and dusk activity corridors for best wildlife sighting chances
- Recommend meadows, valleys, and water sources where animals congregate
- Include species-specific tips: what's active in the current season
- Note wildlife safety: bear spray, safe distances, food storage requirements
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
  history: {
    patterns: [/\bhistory\b/i, /\bruins\b/i, /\bcultur/i, /\bmuseum\b/i, /\bheritage\b/i, /\branger\s*program/i, /\bguided\s*tour/i, /\bhistoric/i],
    prompt: `USER INTENT — HISTORY/CULTURE:
- Prioritize ranger-led programs, guided tours, and interpretive trails
- Include visitor centers and museum stops with estimated time
- Suggest historical landmarks and cultural sites with context
- Note any timed or reservation-required ranger programs
IMPORTANT: User constraints (fitness level, day count, accommodation) ALWAYS override intent suggestions. Do not recommend strenuous hikes for a photographer with beginner fitness.`,
  },
};

/**
 * Detects user intent/archetype from message text and constraints.
 * Returns { primaryIntent, intents: [{type, confidence}], adaptations: string }
 */
function detectIntent(userMessage, constraints) {
  const msg = (userMessage || '').toLowerCase();
  const intents = [];

  for (const [type, archetype] of Object.entries(INTENT_ARCHETYPES)) {
    let matchCount = 0;
    for (const pattern of archetype.patterns) {
      if (pattern.test(msg)) matchCount++;
    }
    // Also check constraints.interests for implicit intents
    if (constraints?.interests?.length > 0) {
      for (const interest of constraints.interests) {
        const interestLower = interest.toLowerCase();
        for (const pattern of archetype.patterns) {
          if (pattern.test(interestLower)) {
            matchCount++;
            break; // count each interest once per archetype
          }
        }
      }
    }
    if (matchCount > 0) {
      const confidence = Math.min(1.0, matchCount / archetype.patterns.length * 2);
      intents.push({ type, confidence });
    }
  }

  // Sort by confidence descending
  intents.sort((a, b) => b.confidence - a.confidence);

  const primaryIntent = intents.length > 0 ? intents[0].type : null;

  // Build adaptations string from all intents with confidence >= 0.3
  const adaptations = intents
    .filter(i => i.confidence >= 0.3)
    .map(i => INTENT_ARCHETYPES[i.type].prompt)
    .join('\n\n');

  return { primaryIntent, intents, adaptations: adaptations || null };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  parseConstraints,
  preflightCheck,
  buildConstraintBlock,
  validateItineraryConstraints,
  detectHypothetical,
  detectConflicts,
  detectIntent,
  // Exported for testing
  CROWD_SCORES,
  PERMIT_PARKS,
  DIFFICULTY_ORDER,
  FITNESS_TO_MAX_DIFFICULTY,
};
