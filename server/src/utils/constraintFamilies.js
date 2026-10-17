'use strict';

/**
 * Semantic constraint/contingency families.
 *
 * Same architecture as the exposure family: a CONCEPT (effort, distance, pace,
 * drive minimization, photography, inaccessibility+alternative), not a pile of
 * demo phrases. Downstream layers consume these facts instead of re-scanning
 * overlapping regex authorities.
 */

const { normalizeUserText } = require('./lexicalNormalization');

const WORD_NUMBERS = Object.freeze({
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, twelve: 12,
});

function spanFor(text, regex) {
  const match = String(text || '').match(regex);
  return match ? match[0].trim().slice(0, 120) : null;
}

function parseCount(token) {
  const raw = String(token || '').toLowerCase();
  if (WORD_NUMBERS[raw] != null) return WORD_NUMBERS[raw];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function kmToMiles(km) {
  return Math.round(km * 0.621371);
}

const HIKE_WALK_TRAIL = /\b(?:hikes?|hiking|trails?|walks?|walking)\b/i;
const INTERROGATIVE =
  /\?\s*$|^\s*(?:is|are|was|were|do|does|did|can|could|should|would|will|what|when|where|which|who|why|how)\b/i;

const FITNESS_BOAST =
  /\b(?:i(?:'?m| am)|we(?:'?re| are))\s+(?:pretty\s+|quite\s+|very\s+)?(?:fit|in good shape|athletic|strong)\b/i;

const NAMED_HARD_QUESTION =
  /\b(?:is|are)\b.{0,48}\b(?:hike|trail|walk)\b.{0,48}\b(?:too )?(?:hard|strenuous|difficult|steep)\b/i;

function resolveHikingEffort(rawText) {
  const text = normalizeUserText(rawText);
  if (!text) return { value: null, span: null };
  if (FITNESS_BOAST.test(text) && !HIKE_WALK_TRAIL.test(text)) {
    return { value: null, span: null };
  }
  if (NAMED_HARD_QUESTION.test(text) || (INTERROGATIVE.test(text) && /\btoo hard\b/i.test(text))) {
    return { value: null, span: null };
  }

  const none = /\b(?:hate(?:s)? hiking|no hiking|without hiking|don'?t (?:really )?hike|doesn'?t (?:really )?hike|do not hike|not (?:a )?hikers?|isn'?t (?:a )?hiker|aren'?t hikers?|not into hiking|not much of a hiker)\b/i;
  if (none.test(text)) return { value: 'none', span: spanFor(text, none) };

  const easyToModerate =
    /\beasy[- ]to[- ]moderate\b|\bmoderate[- ]to[- ]easy\b/i;
  if (easyToModerate.test(text)) {
    return { value: 'easy-to-moderate', span: spanFor(text, easyToModerate) };
  }

  const moderateOk =
    /\bmoderate(?:\s+hiking|\s+hikes?|\s+trails?)?\s+(?:is\s+)?(?:okay|ok|fine|alright|good)\b|\bmoderate is okay\b|\b(?:okay|ok|fine) with moderate\b/i;
  if (moderateOk.test(text)) return { value: 'moderate', span: spanFor(text, moderateOk) };

  const easyOnly = new RegExp(
    String.raw`\b(?:easy(?:\s+(?:trails?|hikes?|walks?|walking|hiking))?(?:\s+only)?|keep(?:ing)? the hiking light|light hiking|stick to easy`
    + String.raw`|nothing (?:too )?(?:strenuous|intense|hard|difficult|extreme)|(?:not|isn't|aren't|not) up for anything (?:too )?(?:strenuous|intense|hard)`
    + String.raw`|no (?:strenuous|intense|hard|difficult) (?:hikes?|hiking|trails?)|avoid(?:ing)? (?:hard|difficult|strenuous) (?:hikes?|trails?)|no difficult trails?`
    + String.raw`|(?:hard|difficult|strenuous) trails? (?:are |is )?(?:off the table|out)`
    + String.raw`)\b`,
    'i',
  );
  if (easyOnly.test(text)) return { value: 'easy', span: spanFor(text, easyOnly) };

  return { value: null, span: null };
}

const DISTANCE_CAP = new RegExp(
  String.raw`\b(?:no (?:hike|walk|trail)s? (?:longer than|over)|keep (?:(?:each |every )?(?:hikes?|walks?|trails?|outing)s?|each outing) under|nothing over|anything over|can(?:not|'t) do more than|no more than|not more than|under|less than|max(?:imum)?(?: of)?|cap (?:each |every )?(?:hike|walk|outing) at)`
  + String.raw`[^.!?]{0,40}?`
  + String.raw`\b(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*`
  + String.raw`(miles?|mi\b|kilometers?|kilometres?|kms?)\b`,
  'i',
);

const DISTANCE_QUANTITY_THEN_MAX = new RegExp(
  String.raw`\b(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*`
  + String.raw`(miles?|mi\b|kilometers?|kilometres?|kms?)\s+max(?:imum)?\b`,
  'i',
);

const DISTANCE_CAP_REVERSED = new RegExp(
  String.raw`\b(?:hikes?|walks?|trails?|hiking)\b[^.!?]{0,24}\b(?:under|no more than|not more than|no longer than|less than|shorter than)\b[^.!?]{0,16}\b`
  + String.raw`(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*`
  + String.raw`(miles?|mi\b|kilometers?|kilometres?|kms?)\b`,
  'i',
);

const TIME_CAP = new RegExp(
  String.raw`\b(?:no (?:hike|walk)s? longer than|keep (?:hikes?|walks?) under|hikes? (?:under|no more than)|no walk over)\b[^.!?]{0,24}\b`
  + String.raw`(a|one|two|three|four|five|six|\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b`,
  'i',
);

function milesFromMatch(amountToken, unitToken) {
  const amount = parseCount(amountToken);
  if (amount == null) return null;
  const unit = String(unitToken || '').toLowerCase();
  if (unit.startsWith('km') || unit.startsWith('kilomet')) {
    const miles = kmToMiles(amount);
    return miles > 0 && miles <= 30 ? miles : null;
  }
  return amount > 0 && amount <= 30 ? amount : null;
}

function hasTripActivityContext(text) {
  return HIKE_WALK_TRAIL.test(text)
    || /\b(?:outing|outings|per hike|itinerary|trip|visit|days?|plan|weekend|getaway)\b/i.test(text)
    || /\b(?:which|better|compare|choose|versus|\bvs\.?)\b/i.test(text)
    || /\b(?:national park|at [A-Z][a-zA-Z]+|in [A-Z][a-zA-Z]+)\b/.test(text);
}

function hasRouteOrDestinationDistanceContext(text) {
  return /\b(?:hotel|lodge|lodging|motel|airbnb)\b/i.test(text)
    || /\b(?:miles|kilometers|kilometres|kms?|mi)\s+away\b/i.test(text)
    || /\b(?:is|are)\s+\d+(?:\.\d+)?\s*(?:miles?|kilometers?|kilometres?|kms?)\s+(?:from|away)\b/i.test(text)
    || /\bfrom\b.{0,40}\bto\b.{0,40}\b(?:miles?|kilometers?|kilometres?)\b/i.test(text)
    || /\b(?:driving distance|drive of|road is)\b/i.test(text);
}

function resolveHikingDistance(rawText) {
  const text = normalizeUserText(rawText);
  const empty = {
    maxWalkMilesPerSegment: null,
    maxWalkMinutesPerSegment: null,
    walkingTolerance: null,
    span: null,
  };
  if (!text) return empty;

  const time = text.match(TIME_CAP);
  if (time && HIKE_WALK_TRAIL.test(text)) {
    const amount = parseCount(time[1]);
    const unit = String(time[2] || '').toLowerCase();
    if (amount != null) {
      const minutes = unit.startsWith('hour') || unit.startsWith('hr') ? Math.round(amount * 60) : Math.round(amount);
      if (minutes > 0 && minutes <= 12 * 60) {
        return {
          ...empty,
          maxWalkMinutesPerSegment: minutes,
          span: time[0].trim().slice(0, 120),
        };
      }
    }
  }

  const walkMoreThan = text.match(
    /\b(?:can(?:not|'t)|could(?:n't)?)\b.{0,48}\bwalk\b.{0,48}\b(?:more than|over|farther than|further than)\b.{0,28}\b(?:about |around |roughly |~)?(a|one|\d+(?:\.\d+)?)\s*(miles?|mi\b|kilometers?|kilometres?|kms?)\b/i,
  );
  if (walkMoreThan) {
    const miles = milesFromMatch(walkMoreThan[1], walkMoreThan[2]);
    if (miles != null) {
      return {
        ...empty,
        maxWalkMilesPerSegment: miles,
        span: walkMoreThan[0].trim().slice(0, 120),
      };
    }
  }

  const cap = text.match(DISTANCE_CAP) || text.match(DISTANCE_CAP_REVERSED) || text.match(DISTANCE_QUANTITY_THEN_MAX);
  const activityCeiling = Boolean(
    cap
    && !hasRouteOrDestinationDistanceContext(text)
    && (HIKE_WALK_TRAIL.test(text) || /\bper hike\b/i.test(text) || /\boutings?\b/i.test(text) || hasTripActivityContext(text)),
  );
  if (activityCeiling) {
    const miles = milesFromMatch(cap[1], cap[2]);
    if (miles != null) {
      return {
        ...empty,
        maxWalkMilesPerSegment: miles,
        span: cap[0].trim().slice(0, 120),
      };
    }
  }

  const shortHikes = /\bshort hikes?\s+only\b|\bonly short hikes?\b|\beasy short hikes?\b/i;
  const shortWalks =
    /\b(?:keep|make|hold)\b[^.!?]{0,24}\b(?:walk(?:ing|s)?|on our feet)\b[^.!?]{0,24}\b(?:short|light|minimal)\b|\bshort walks?\b|\bminimal walking\b|\bkeep the walking light\b/i;
  if (shortHikes.test(text)) {
    return { ...empty, walkingTolerance: 'limited', span: spanFor(text, shortHikes) };
  }
  if (shortWalks.test(text)) {
    return { ...empty, walkingTolerance: 'limited', span: spanFor(text, shortWalks) };
  }

  return empty;
}

const QUICK_NON_PACE =
  /\bquick question\b|\bin a hurry\b|\ba quick (?:morning |afternoon |evening )?(?:hike|walk|stop|look)\b/i;

const RELAXED_PACE = new RegExp(
  String.raw`\b(?:relaxed|leisurely|unhurried|easygoing|easy[- ]going|laid[- ]back`
  + String.raw`|don'?t rush(?:\s+us)?|do not rush(?:\s+us)?|no rush|in no hurry`
  + String.raw`|not rushed|less rushed|slow(?:er)? (?:pace|trip|visit|days?)|tak(?:e|ing|es) it (?:easy|slow)|slow it down`
  + String.raw`|(?:make|keep)\s+(?:(?:our|my|the|this|that)\s+)?(?:trip|plan|itinerary|schedule|days?|pace)\s+(?:slower|less rushed|more relaxed)`
  + String.raw`|slow\s+(?:(?:our|my|the|this|that)\s+)?(?:trip|plan|itinerary|schedule|days?|pace)\s+down`
  + String.raw`|take\s+(?:(?:our|my|the|this|that)\s+)?(?:trip|plan|itinerary|days?)\s+(?:more )?slowly`
  + String.raw`|ease up\s+(?:on\s+)?(?:(?:our|my|the|this|that)\s+)?(?:trip|plan|itinerary|schedule|days?|pace)`
  + String.raw`|leave(?:\s+(?:lots of|plenty of|some|the))?\s+(?:downtime|free time|breathing room|unscheduled time|buffer)`
  + String.raw`|(?:plenty of|lots of|some)\s+(?:downtime|free time|breathing room|unscheduled time|buffer(?: time)?)`
  + String.raw`|(?:build in|include|want|need|keep)\s+(?:a |some |plenty of |lots of )?(?:downtime|free time|breathing room|unscheduled time|buffer(?: time)?)`
  + String.raw`|only a few things(?:\s+(?:each|per|a)\s+day)?|few things (?:each|per) day`
  + String.raw`|don'?t pack (?:it|the days?)|no packed days`
  + String.raw`)\b`,
  'i',
);

const INCIDENTAL_FREE_TIME =
  /\b(?:opening hours?|visitor center hours?|hours of operation|timed entry|free admission|if we have (?:some )?free time we could)\b/i;
const BUFFER_NON_PACE =
  /\bbuffer (?:parking|zone|state|overflow|strip|lot)\b/i;
const INCIDENTAL_SLOT_FREE_TIME =
  /\b(?:i|we) have (?:some )?free time (?:this |in the )?(?:afternoon|morning|evening|today|tonight)\b|\bfree time (?:this |in the )?(?:afternoon|morning|evening)\b/i;

const SLACK_NOUN_PACE = new RegExp(
  String.raw`\b(?:downtime|breathing room|buffer time|unscheduled time|free time`
  + String.raw`|room between (?:the )?(?:stops|activities|sights))`
  + String.raw`\b`,
  'i',
);

const PACKED_PACE =
  /\b(?:more\s+)?packed\b|\baggressive\b|\bfast pace\b|\bsee everything\b|\bcram (?:it|everything)\b/i;
const MODERATE_PACE = /\bmoderate\s+pace\b/i;

function resolvePace(rawText) {
  const text = normalizeUserText(rawText);
  if (!text) return { value: null, span: null };
  if (QUICK_NON_PACE.test(text) || INCIDENTAL_FREE_TIME.test(text) || BUFFER_NON_PACE.test(text)) {
    return { value: null, span: null };
  }
  if (INCIDENTAL_SLOT_FREE_TIME.test(text) && !SLACK_NOUN_PACE.test(text.replace(INCIDENTAL_SLOT_FREE_TIME, ' '))) {
    return { value: null, span: null };
  }
  if (/\bno packed (?:days?|itinerary|schedule)\b/i.test(text)) {
    return { value: 'relaxed', span: spanFor(text, /\bno packed (?:days?|itinerary|schedule)\b/i) };
  }
  if (PACKED_PACE.test(text)) return { value: 'packed', span: spanFor(text, PACKED_PACE) };
  if (MODERATE_PACE.test(text)) return { value: 'moderate', span: spanFor(text, MODERATE_PACE) };
  if (RELAXED_PACE.test(text)) return { value: 'relaxed', span: spanFor(text, RELAXED_PACE) };
  if (SLACK_NOUN_PACE.test(text) && !INCIDENTAL_SLOT_FREE_TIME.test(text)) {
    return { value: 'relaxed', span: spanFor(text, SLACK_NOUN_PACE) };
  }
  return { value: null, span: null };
}

const DRIVE_MINIMIZE = new RegExp(
  String.raw`\b(?:minimal(?:\s+amount of)? driving|not much driving|little driving|with little driving|without much driving|not too much driving|too much driving`
  + String.raw`|keep(?:\s+the)? drives? (?:short|light|down|minimal|reasonable|realistic|manageable)`
  + String.raw`|keep(?:\s+the)? driv(?:e|ing) (?:short|light|down|minimal|reasonable|realistic|manageable)`
  + String.raw`|don'?t make (?:us|me) drive all day|do not make (?:us|me) drive all day`
  + String.raw`|avoid backtracking|minimi[sz]e (?:the )?driv(?:e|ing)|reduce (?:the )?driv(?:e|ing)|less driving|limit driv(?:e|ing)|cut down (?:on )?driv(?:e|ing)`
  + String.raw`|shorter drives?|fewer drives?|hate driving|rather not .{0,40}(?:driv|in the car|behind the wheel)`
  + String.raw`|avoid[^.!?]{0,48}(?:long|lots of|a lot of|excessive) driv(?:e|ing)|avoid[^.!?]{0,48}(?:in the car|behind the wheel|drive time|the car)`
  + String.raw`)\b`,
  'i',
);

const DRIVE_QTY = String.raw`(a|one|two|three|four|five|six|\d+(?:\.\d+)?)`;
const DRIVE_UNIT = String.raw`(hours?|hrs?|minutes?|mins?)`;
const DRIVE_DAILY = String.raw`(?:per day|each day|every day|a day|\/\s*day|daily)`;
const DRIVE_CTX = String.raw`(?:driv(?:e|ing|es)|behind the wheel)`;

const DAILY_DRIVE_CEILING_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`\b(?:no more than|not more than|at most|under|keep(?:\s+the)?\s+driving under|max(?:imum)?(?: of)?|cap(?:\s+\w+){0,4}\s+at|limit(?:ed)?(?:\s+to)?|don't want|do not want)\b`
    + String.raw`[^.]{0,48}\b${DRIVE_QTY}\s*${DRIVE_UNIT}\b[^.]{0,48}\b(?:${DRIVE_CTX}|${DRIVE_DAILY})`,
    'i',
  ),
  new RegExp(
    String.raw`\b${DRIVE_QTY}\s*${DRIVE_UNIT}\s+(?:of\s+)?${DRIVE_CTX}[^.]{0,32}\b${DRIVE_DAILY}`,
    'i',
  ),
  new RegExp(
    String.raw`\b(?:daily\s+)?${DRIVE_CTX}\s+(?:limit|cap|max(?:imum)?)\s+(?:of\s+)?${DRIVE_QTY}\s*${DRIVE_UNIT}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${DRIVE_QTY}[- ]${DRIVE_UNIT}\s+(?:daily\s+)?${DRIVE_CTX}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${DRIVE_CTX}[^.]{0,40}\b${DRIVE_QTY}\s*${DRIVE_UNIT}\s*${DRIVE_DAILY}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${DRIVE_QTY}\s*${DRIVE_UNIT}\s*${DRIVE_DAILY}[^.]{0,40}\b${DRIVE_CTX}`,
    'i',
  ),
  new RegExp(
    String.raw`\bcap(?:\s+\w+){0,4}\s+at\s+${DRIVE_QTY}\s*${DRIVE_UNIT}[^.]{0,32}\b${DRIVE_CTX}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${DRIVE_CTX}[^.]{0,32}\b(?:cap(?:\s+\w+){0,3}\s+at|limit(?:ed)?(?:\s+to)?)\s+${DRIVE_QTY}\s*${DRIVE_UNIT}`,
    'i',
  ),
  new RegExp(
    String.raw`\bcap\s+${DRIVE_CTX}\s+at\s+${DRIVE_QTY}\s*${DRIVE_UNIT}`,
    'i',
  ),
]);

function firstDriveAmount(match) {
  if (!match) return null;
  for (let i = 1; i < match.length; i += 1) {
    if (match[i] != null && !/^(?:hours?|hrs?|minutes?|mins?)$/i.test(match[i])) return match[i];
  }
  return null;
}

function unitFromDriveMatch(match) {
  if (!match) return null;
  for (let i = 1; i < match.length; i += 1) {
    if (match[i] && /^(?:hours?|hrs?|minutes?|mins?)$/i.test(match[i])) return match[i];
  }
  if (/hour/i.test(match[0])) return 'hours';
  if (/min/i.test(match[0])) return 'minutes';
  return null;
}

function minutesFromQuantityAndUnit(amountToken, unitToken) {
  const n = parseCount(amountToken);
  if (n == null || n <= 0) return null;
  const unit = String(unitToken || '').toLowerCase();
  if (unit.startsWith('hour') || unit.startsWith('hr')) {
    return n > 0 && n <= 24 ? Math.round(n * 60) : null;
  }
  if (unit.startsWith('min')) {
    return n > 0 && n <= 24 * 60 ? Math.round(n) : null;
  }
  return null;
}

function resolveDrivingMinimization(rawText) {
  const text = normalizeUserText(rawText);
  const empty = { minimizeDriving: false, maxDailyDriveMinutes: null, span: null };
  if (!text) return empty;

  let maxDailyDriveMinutes = null;
  let numericSpan = null;
  for (const pattern of DAILY_DRIVE_CEILING_PATTERNS) {
    const ceiling = text.match(pattern);
    if (!ceiling) continue;
    const minutes = minutesFromQuantityAndUnit(firstDriveAmount(ceiling), unitFromDriveMatch(ceiling));
    if (minutes == null) continue;
    maxDailyDriveMinutes = minutes;
    numericSpan = ceiling[0].trim().slice(0, 120);
    break;
  }

  const minimizeDriving = DRIVE_MINIMIZE.test(text) || maxDailyDriveMinutes != null;
  return {
    minimizeDriving,
    maxDailyDriveMinutes,
    span: numericSpan || (minimizeDriving ? spanFor(text, DRIVE_MINIMIZE) : null),
  };
}

const PHOTO_INTEREST =
  /\b(?:photograph(?:y|s|ing)?|photos?|pictures?|taking pictures|take pictures|camera(?:s)?)\b/i;
const SUNRISE_PHOTO = /\b(?:sunrise|dawn|first light)\b[^.!?]{0,24}\b(?:photo|photograph|pictures?|camera)|\b(?:photo|photograph|pictures?)[^.!?]{0,24}\b(?:sunrise|dawn)\b|\bsunrise photography\b/i;
const SUNSET_PHOTO = /\b(?:sunset|dusk|evening glow)\b[^.!?]{0,24}\b(?:photo|photograph|pictures?|camera)|\b(?:photo|photograph|pictures?)[^.!?]{0,24}\b(?:sunset|dusk)\b|\bsunset photography\b/i;
const GOLDEN_PHOTO = /\bgolden[- ]hour\b[^.!?]{0,24}\b(?:photo|photograph|pictures?)|\b(?:photo|photograph|pictures?)[^.!?]{0,24}\bgolden[- ]hour\b|\bgolden[- ]hour photos?\b/i;

function resolvePhotography(rawText) {
  const text = normalizeUserText(rawText);
  const empty = { photography: false, photographyTiming: null, span: null };
  if (!text || !PHOTO_INTEREST.test(text)) return empty;
  let photographyTiming = null;
  if (GOLDEN_PHOTO.test(text)) photographyTiming = 'golden_hour';
  else if (SUNRISE_PHOTO.test(text)) photographyTiming = 'sunrise';
  else if (SUNSET_PHOTO.test(text)) photographyTiming = 'sunset';
  const clause = text.split(/[.!?;]|\bbut\b/).filter(part => PHOTO_INTEREST.test(part)).at(-1) || text;
  const rejected = /\b(?:not|no|never|avoid|dislike|hate|skip|don'?t|doesn'?t)\b/.test(clause);
  const asserted = !/\?|\b(?:maybe|might|what if|considering)\b/.test(text);
  return {
    asserted,
    rejectedTiming: rejected ? photographyTiming : null,
    photography: asserted && !rejected,

    photographyTiming: !asserted || rejected ? null : photographyTiming,
    span: spanFor(text, PHOTO_INTEREST),
  };
}

const AVAILABILITY_STATES = Object.freeze({
  UNAVAILABLE: 'unavailable',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  FULL: 'full',
  SOLD_OUT: 'sold_out',
  INACCESSIBLE: 'inaccessible',
  UNUSABLE: 'unusable',
  VISIBILITY_BLOCKED: 'visibility_blocked',
});

const TRAVEL_RESOURCE = new RegExp(
  String.raw`\b(?:access|entrances?|roads?|trailheads?|trails?|gates?|pass(?:es)?`
  + String.raw`|visitor centers?|centers?|reservations?`
  + String.raw`|parking(?: facility| facilities| lots?)?|lots?`
  + String.raw`|shuttles?|transit|bus(?:es)?|trams?`
  + String.raw`|ferries|ferrys?|boats?|boat (?:service|transportation|transport)|water taxis?`
  + String.raw`|service|viewpoints?|overlooks?|views?|marinas?|park)\b`,
  'i',
);

const TRANSIT_RESOURCE =
  /\b(?:shuttle|transit|ferry|ferries|boat|bus|tram|water taxi|service)\b/i;

const VISIBILITY_NEED = /\b(?:sunrise|sunset|golden[- ]hour|view|overlook|viewpoint|photography|photos?|stargaz)\b/i;
const VISIBILITY_BLOCKED =
  /\b(?:socked in|clouded out|fogged in|no visibility|visibility (?:is )?(?:blocked|gone|zero)|obscured|hidden by (?:the )?(?:low )?(?:cloud|clouds|fog|mist|weather))\b/i;

const NEGATIVE_AVAILABILITY = new RegExp(
  String.raw`\b(?:unavailable|inaccessible|closed|cancelled|canceled|suspended|halted`
  + String.raw`|cut off|unusable|sold out|out of service|taken out of service`
  + String.raw`|no longer in operation|can(?:not|'t) be used`
  + String.raw`|not (?:currently )?(?:running|operating)`
  + String.raw`|isn'?t (?:currently )?(?:running|operating)`
  + String.raw`|aren'?t (?:currently )?(?:running|operating)`
  + String.raw`|(?:is|are) not (?:currently )?(?:running|operating)`
  + String.raw`|won'?t be running|will not be running`
  + String.raw`|stopped (?:operating|running)`
  + String.raw`|(?:has|have|had) been (?:halted|suspended|cancelled|canceled|cut off|taken out of service|shut(?: down)?)`
  + String.raw`|(?:is|are|'s|'re) down|shut down`
  + String.raw`)\b`,
  'i',
);

const BLOCKED_STATE = /\bblocked\b(?!\s+out\b)/i;

const ALTERNATIVE_ASK = new RegExp(
  String.raw`\b(?:instead|fallback|fall[- ]?back|alternatives?`
  + String.raw`|backups?(?:\s+(?:plans?|options?))?`
  + String.raw`|plan b|plans? b`
  + String.raw`|another options?|other options?`
  + String.raw`|something else(?: to do)?`
  + String.raw`|what else (?:should|do|would|can) (?:i|we) do`
  + String.raw`|what (?:should|do|would) (?:i|we) do`
  + String.raw`|give (?:me|us) (?:a |an )?(?:fallback|backup|alternative)`
  + String.raw`|do instead)\b`,
  'i',
);

const SITUATION_QUESTION =
  /\bwhat(?:'?s| is) the parking situation\b|\bwhat(?:'?s| is) parking like\b|\bis (?:the |.{0,40})closed\b|\bhow(?:'?s| is) parking\b|\bis (?:the |.{0,40})(?:running|open|operating|available)\b|\bhas .{0,40}resumed\b/i;

function parkingLotUnavailable(text) {
  if (/\b(?:parking|lot)\s+(?:is\s+)?full\b|\blot fills?\b|\bparking fills?\b/i.test(text)) return true;
  const span = String(text || '').match(
    /\bparking\b[\s\S]{0,40}\b(?:fills?|full)\b|\b(?:fills?|full)\b[\s\S]{0,32}\b(?:parking|lot)\b/i,
  );
  if (!span) return false;
  const window = span[0].replace(/\bfull days?\b/gi, ' ');
  return /\b(?:parking|lot)\b/i.test(window) && /\b(?:fills?|full)\b/i.test(window);
}

function serviceIsDown(text) {
  return TRANSIT_RESOURCE.test(text) && (
    /\b(?:is|are|'s|'re)\s+down\b/i.test(text)
    || /\b(?:not running|out of service|isn'?t running|is not running)\b/i.test(text)
  );
}

function resourceDoesNotWork(text) {
  if (!/\b(?:doesn'?t|does not|won'?t|will not)\s+work(?:\s+out)?\b/i.test(text)) {
    return false;
  }
  return TRAVEL_RESOURCE.test(text);
}

function neutralizeNonOperationalLanguage(clause) {
  return String(clause || '')
    .replace(/\b(?:i|we)\s+stopped\s+at\b/gi, ' ')
    .replace(/\bstopped us\b/gi, ' ')
    .replace(/\bin our tracks\b/gi, ' ')
    .replace(/\bblocked out\b/gi, ' ')
    .replace(/\b(?:i|we)\s+suspended\s+(?:our|the|my)\s+(?:trip|plans?|visit)\b/gi, ' ');
}

function clausesOf(text) {
  return String(text || '')
    .split(/[.!?;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clauseHasNegativeAvailability(clause) {
  return NEGATIVE_AVAILABILITY.test(clause) || BLOCKED_STATE.test(clause) || VISIBILITY_BLOCKED.test(clause);
}

function classifyRelationalAvailability(clause) {
  if (!TRAVEL_RESOURCE.test(clause) || !clauseHasNegativeAvailability(clause)) return null;

  if (VISIBILITY_NEED.test(clause) && (
    VISIBILITY_BLOCKED.test(clause)
    || /\bunusable\b/i.test(clause)
    || /\b(?:is |are )?(?:cloudy|clouded out|socked in)\b/i.test(clause)
  )) {
    const unusable = /\bunusable\b|\bcloudy\b/i.test(clause);
    return {
      state: unusable ? AVAILABILITY_STATES.UNUSABLE : AVAILABILITY_STATES.VISIBILITY_BLOCKED,
      inaccessibility: 'visibility_fail',
    };
  }
  if (/\breservation/i.test(clause) && /\b(?:unavailable|full|sold out|can(?:not|'t) get)\b/i.test(clause)) {
    return { state: AVAILABILITY_STATES.SOLD_OUT, inaccessibility: 'reservation_unavailable' };
  }
  if (/\bsold out\b/i.test(clause)) {
    return { state: AVAILABILITY_STATES.SOLD_OUT, inaccessibility: 'reservation_unavailable' };
  }
  if (parkingLotUnavailable(clause)) {
    return { state: AVAILABILITY_STATES.FULL, inaccessibility: 'parking_full' };
  }
  if (/\b(?:cancelled|canceled)\b/i.test(clause)) {
    return {
      state: AVAILABILITY_STATES.CANCELLED,
      inaccessibility: TRANSIT_RESOURCE.test(clause) ? 'shuttle_fail' : 'access_unavailable',
    };
  }
  if (/\bclosed\b/i.test(clause)) {
    return { state: AVAILABILITY_STATES.CLOSED, inaccessibility: 'closed' };
  }
  if (/\binaccessible\b/i.test(clause) || BLOCKED_STATE.test(clause)) {
    return { state: AVAILABILITY_STATES.INACCESSIBLE, inaccessibility: 'access_unavailable' };
  }
  if (/\bunusable\b/i.test(clause)) {
    return { state: AVAILABILITY_STATES.UNUSABLE, inaccessibility: 'access_unavailable' };
  }
  if (TRANSIT_RESOURCE.test(clause) || serviceIsDown(clause)) {
    return { state: AVAILABILITY_STATES.UNAVAILABLE, inaccessibility: 'shuttle_fail' };
  }
  return { state: AVAILABILITY_STATES.UNAVAILABLE, inaccessibility: 'access_unavailable' };
}

function resolveRelationalAvailability(text) {
  for (const rawClause of clausesOf(text)) {
    const clause = neutralizeNonOperationalLanguage(rawClause);
    const hit = classifyRelationalAvailability(clause);
    if (hit) return hit;
  }
  return null;
}

function resolveAvailabilityState(rawText) {
  const text = normalizeUserText(rawText);
  const empty = { state: null, inaccessibility: null };
  if (!text) return empty;

  if (parkingLotUnavailable(text)) {
    return { state: AVAILABILITY_STATES.FULL, inaccessibility: 'parking_full' };
  }
  if (/\breservation/i.test(text) && /\b(?:unavailable|full|sold out|can(?:not|'t) get)\b/i.test(text)) {
    return { state: AVAILABILITY_STATES.SOLD_OUT, inaccessibility: 'reservation_unavailable' };
  }
  if (/\bsold out\b/i.test(text)) {
    return { state: AVAILABILITY_STATES.SOLD_OUT, inaccessibility: 'reservation_unavailable' };
  }

  const relational = resolveRelationalAvailability(text);
  if (relational) return relational;

  if (resourceDoesNotWork(text)) {
    const parkingScoped = /\b(?:parking|lot)\b/i.test(text) && !TRANSIT_RESOURCE.test(text);
    return {
      state: AVAILABILITY_STATES.UNAVAILABLE,
      inaccessibility: parkingScoped ? 'parking_full' : 'access_unavailable',
    };
  }
  if (VISIBILITY_BLOCKED.test(text) && VISIBILITY_NEED.test(text)) {
    return { state: AVAILABILITY_STATES.VISIBILITY_BLOCKED, inaccessibility: 'visibility_fail' };
  }
  if (/\b(?:cloudy|clouded out|socked in)\b.{0,32}\bunusable\b|\bunusable\b.{0,24}\b(?:cloudy|clouds)\b/i.test(text)
    && VISIBILITY_NEED.test(text)) {
    return { state: AVAILABILITY_STATES.UNUSABLE, inaccessibility: 'visibility_fail' };
  }
  if (/\b(?:sunrise|sunset|view|photography|photos?)\b.{0,24}\b(?:is |are )?(?:cloudy|unusable)\b/i.test(text)) {
    return { state: AVAILABILITY_STATES.UNUSABLE, inaccessibility: 'visibility_fail' };
  }
  if (/\b(?:rain|rains|raining|storms?)\b/i.test(text)) {
    return { state: AVAILABILITY_STATES.UNUSABLE, inaccessibility: 'weather_fail' };
  }
  if (
    /\bcan(?:not|'t) get in(?:to)?\b/i.test(text)
    || /\binaccessible\b/i.test(text)
    || /\bcan(?:not|'t) get there\b/i.test(text)
  ) {
    return { state: AVAILABILITY_STATES.INACCESSIBLE, inaccessibility: 'access_unavailable' };
  }
  if (/\bclosed\b/i.test(text) && /\bif\b/i.test(text)) {
    return { state: AVAILABILITY_STATES.CLOSED, inaccessibility: 'closed' };
  }
  if (/\bunusable\b/i.test(text) && TRAVEL_RESOURCE.test(text)) {
    return { state: AVAILABILITY_STATES.UNUSABLE, inaccessibility: 'access_unavailable' };
  }
  if (/\bunavailable\b/i.test(text) && TRAVEL_RESOURCE.test(text)) {
    return { state: AVAILABILITY_STATES.UNAVAILABLE, inaccessibility: 'access_unavailable' };
  }
  return empty;
}

function resolveAccessContingency(rawText) {
  const text = normalizeUserText(rawText);
  const empty = {
    isAccessContingency: false,
    inaccessibility: null,
    availabilityState: null,
    asksForAlternative: false,
    reasonCodes: [],
  };
  if (!text) return empty;

  if (SITUATION_QUESTION.test(text) && !ALTERNATIVE_ASK.test(text)) {
    return { ...empty, reasonCodes: ['access_status_question'] };
  }

  const asksForAlternative = ALTERNATIVE_ASK.test(text);
  const availability = resolveAvailabilityState(text);
  const inaccessibility = availability.inaccessibility || null;

  // A later backup-day request to BUILD is not this family.
  const backupDayProduce = /\b(?:plan|build|create)\s+(?:a |the )?(?:backup|fallback)\s+days?\b/i.test(text);

  const isAccessContingency = Boolean(inaccessibility && asksForAlternative && !backupDayProduce);
  return {
    isAccessContingency,
    inaccessibility: isAccessContingency ? inaccessibility : (asksForAlternative ? inaccessibility : null),
    availabilityState: isAccessContingency ? availability.state : (asksForAlternative ? availability.state : null),
    asksForAlternative,
    reasonCodes: isAccessContingency
      ? ['access_contingency', inaccessibility]
      : (inaccessibility && !asksForAlternative ? ['inaccessibility_without_alternative'] : []),
  };
}

function resolveConstraintFamilies(rawText) {
  const hiking = resolveHikingEffort(rawText);
  const distance = resolveHikingDistance(rawText);
  const pace = resolvePace(rawText);
  const driving = resolveDrivingMinimization(rawText);
  const photography = resolvePhotography(rawText);
  const contingency = resolveAccessContingency(rawText);
  return { hiking, distance, pace, driving, photography, contingency };
}

module.exports = {
  resolveConstraintFamilies,
  resolveHikingEffort,
  resolveHikingDistance,
  resolvePace,
  resolveDrivingMinimization,
  resolvePhotography,
  resolveAccessContingency,
  resolveAvailabilityState,
  AVAILABILITY_STATES,
  kmToMiles,
};
