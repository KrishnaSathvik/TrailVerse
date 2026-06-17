/**
 * Shared park catalog search — used by GET /api/parks/search, Trailie chat, and voice.
 */
const { loadCanonicalParks } = require('../catalog/parkCatalog');
const { canonicalParkMatchesActivity } = require('../catalog/canonicalPark');
const { canonicalListToApiParks } = require('../adapters/npsParkAdapter');
const { filterParksBySearchQuery, applyPinnedParksToResults } = require('../utils/parkSearchQuery');
const { resolveSearchPinsFromQuery } = require('../utils/searchIntentPins');
const { logParkSearch } = require('./parkSearchAnalytics');

/**
 * @param {{
 *   q?: string,
 *   state?: string,
 *   activity?: string,
 *   limit?: number|string,
 *   req?: import('express').Request,
 *   source?: string,
 *   originCity?: { lat: number, lon: number, name?: string } | null,
 * }} options
 * @returns {Promise<{ parks: object[], count: number, searchId: string|null }>}
 */
async function executeParkSearch({ q, state, activity, limit, pinned, req, source, originCity = null }) {
  const catalog = await loadCanonicalParks({
    state: state ? String(state).toUpperCase() : undefined,
  });
  let parks = catalog;

  const query = q ? String(q).trim() : '';
  let pinnedCodes = pinned
    ? String(pinned)
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (query) {
    if (originCity) {
      parks = filterCatalogByOriginDistance(parks, originCity, query);
    }
    parks = filterParksBySearchQuery(parks, query);
    if (pinnedCodes.length === 0) {
      pinnedCodes = resolveSearchPinsFromQuery(query);
    }
    if (pinnedCodes.length > 0) {
      parks = applyPinnedParksToResults(parks, catalog, pinnedCodes, query);
    }
  }

  if (activity) {
    parks = parks.filter((park) =>
      canonicalParkMatchesActivity(park, activity)
    );
  }

  const count = parks.length;

  if (limit) {
    const n = parseInt(limit, 10);
    if (!Number.isNaN(n) && n > 0) {
      parks = parks.slice(0, n);
    }
  }

  let searchId = null;
  if (req && (query || activity || state)) {
    searchId = logParkSearch(req, {
      query: query || null,
      state: state ? String(state).toUpperCase() : null,
      activity: activity || null,
      parks,
      source,
    });
  }

  return {
    parks: canonicalListToApiParks(parks),
    count,
    searchId,
  };
}

const {
  buildDiscoveryQueryHints,
  getParkLogisticsNote,
  filterCatalogByOriginDistance,
} = require('../catalog/discoverySearchPolicy');

const DISCOVERY_ALIGNMENT_INSTRUCTION =
  'Lead with ONE clear top pick, then 2–3 alternates from the candidate list. Prioritize the highest-weight detected intent (e.g. cool summer + lakes → parks where you can actually get on the water, not just a scenic mountain drive). If your #1 has a Logistics note, say access reality in one sentence and name an easier-access alternative from the list. Skip weak fits silently — never name a park only to say "skip" it; only discuss parks you are recommending. When the user\'s origin city is known, recommend ONLY parks within realistic drive range from that city — never mention distant parks (e.g. Ohio or Virginia from Denver) even to dismiss them.';

const DISCOVERY_RESPONSE_FORMAT_BLOCK = `
--- DISCOVERY RESPONSE FORMAT ---
TRAILVERSE PARK CANDIDATES is your authoritative source for park picks on this question. Do NOT say you lack real-time data or ask the user to "check TrailVerse for live conditions" just because there is no LIVE TRAILVERSE DATA block — catalog discovery does not need per-park NPS feeds.
LENGTH: 300–480 words total (including the refinement close below).
STRUCTURE: No ## headers. Open with your #1 pick in 2–3 sentences. Then 2–3 alternates as short paragraphs OR one tight bullet list (max 4 parks named). Bold each park name on first mention.
TONE: Curated friend, not a ranked dump. Do not number parks 1–5 unless using a short bullet list for alternates only.
--- END DISCOVERY RESPONSE FORMAT ---
`;

const DISCOVERY_REFINEMENT_CLOSE_BLOCK = `
--- DISCOVERY REFINEMENT CLOSE (first discovery turn only) ---
After your park picks, end with a short block titled **To personalize this:** with 2–3 bullet questions. Ask only what you do NOT already know from USER CONTEXT or earlier messages in this thread:
- Where are you starting from? (city or region)
- How many days do you have?
- Road trip only, or okay flying?
Optionally ONE of: who's traveling (solo, couple, family with kids)?
One line under the bullets: explain that with those details you can reorder picks for drive time vs fly-in.
Do NOT use generic closers ("Want me to dig deeper?", "I can build a full plan!"). These logistics questions are allowed and expected on discovery turns.
Skip any bullet the user already answered in this conversation.
--- END DISCOVERY REFINEMENT CLOSE ---
`;

const DISCOVERY_REFINEMENT_FOLLOWUP_BLOCK = `
--- DISCOVERY REFINEMENT (follow-up turn) ---
The user is replying with trip logistics after your prior discovery answer. Read the FULL conversation: keep the original vibe (season, lakes, couples, cool weather, etc.) AND apply their new constraints (home base, days, fly/drive, group).
- Re-rank parks from TRAILVERSE PARK CANDIDATES and your prior reply — crown a new #1 that fits their location and trip length.
- State rough access: drive hours from their city OR "you'll want to fly to [airport]" when relevant.
- Drop parks that don't fit their days or fly preference; keep at most one stretch pick if you label it clearly.
- Do NOT re-ask the same logistics questions. Do NOT repeat the full national shortlist.
- LENGTH: 180–320 words. Decisive friend, not a re-run of turn one.
- Optional one-liner next step only if natural: offer a day-by-day plan for your new #1.
--- END DISCOVERY REFINEMENT ---
`;

/**
 * Prompt block for Trailie chat — ranked matches + intent weights from catalog search.
 * @param {object[]} parks API park objects with matchReason / matchedTraits
 * @param {{ label: string, weight: number }[]} [primaryIntents]
 * @param {string} [query]
 * @param {{ lat: number, lon: number, name?: string } | null} [originCity]
 * @returns {string}
 */
function formatRankedParksDiscoveryBlock(parks, primaryIntents = [], query = '', originCity = null) {
  if (!parks?.length) return '';

  const hints = buildDiscoveryQueryHints(query || '', parks);

  let block = '\n--- TRAILVERSE PARK CANDIDATES ---\n';
  block +=
    'TrailVerse ranked these parks for the user\'s question. ';
  if (originCity?.name && hints.maxDriveMiles) {
    block += `User is starting from ${originCity.name}. Every candidate below is within ~${hints.maxDriveMiles} miles / realistic drive range for this question. `;
    block +=
      'Do NOT mention parks outside this radius — especially not to say they are too far or to "skip" them. ';
  }
  block +=
    'Curate like a trip-planning friend: pick a clear #1, then 2–4 strong alternates from this list. ';
  block +=
    'You may reorder by fit and skip weak matches. Do not dump all candidates equally. ';
  block +=
    'Do not substitute unrelated parks from training data when good candidates exist here.\n';
  block +=
    'Do NOT mention parks the user did not ask about just to say "skip" them — only discuss parks you are recommending.\n';

  if (hints.nationalParksOnly) {
    block +=
      'USER ASKED FOR NATIONAL PARKS: every candidate below is a National Park designation — recommend only from this list.\n';
  }
  if (hints.coolSummer) {
    block +=
      'COOL SUMMER WEATHER: favor northern, high-elevation, and foggy-coast parks over hot desert destinations in peak summer.\n';
  }
  if (hints.lakesOrBeaches && hints.coolSummer) {
    block +=
      'LAKES OR BEACHES: prioritize parks where swimming, shoreline, or boat days are realistic — not only mountain scenic drives (e.g. Going-to-the-Sun is iconic but not a beach trip).\n';
  }
  if (hints.couplesOcean) {
    block +=
      'COUPLES + OCEAN: favor classic accessible coast parks (Acadia, Olympic, islands) for the lead pick; remote Alaska/Keys options are fine as stretch picks with logistics called out.\n';
  }
  if (hints.hasRemoteCandidates) {
    block +=
      'LOGISTICS: Candidates marked [Logistics] are worth mentioning but require flights, ferries, or multi-day access — always pair with an easier alternative when you lead with one.\n';
  }
  block += '\n';

  if (primaryIntents.length > 0) {
    block += 'Primary detected intents:\n';
    primaryIntents.forEach(({ label, weight }) => {
      block += `- ${label} (weight ${weight.toFixed(1)})\n`;
    });
    block += `\n${DISCOVERY_ALIGNMENT_INSTRUCTION}\n\n`;
  }

  block += 'Ranked candidates (best fit first — curate, do not read as a mandatory list):\n';
  parks.slice(0, 5).forEach((park, index) => {
    const name = park.fullName || park.name || 'Unknown';
    const states = park.states ? ` (${park.states})` : '';
    const code = park.parkCode ? ` [${park.parkCode}]` : '';
    const reason = park.matchReason || 'Matches the user\'s search.';
    const traits =
      Array.isArray(park.matchedTraits) && park.matchedTraits.length > 0
        ? park.matchedTraits.join(', ')
        : '';

    const logistics = getParkLogisticsNote(park.parkCode || park.code);
    const logisticsTag = logistics ? ' [Logistics]' : '';

    block += `${index + 1}. ${name}${states}${code}${logisticsTag}\n`;
    block += `   Why: ${reason}\n`;
    if (logistics) {
      block += `   Logistics: ${logistics}\n`;
    }
    if (traits) {
      block += `   Traits: ${traits}\n`;
    }
  });

  block += '--- END PARK CANDIDATES ---\n';
  return block;
}

/**
 * Concise voice tool response from search API results.
 * @param {object[]} parks
 * @param {number} totalCount
 * @returns {string}
 */
function formatVoiceSearchResult(parks, totalCount) {
  if (!parks?.length) {
    return 'No parks matched that search. Try different keywords or a state.';
  }

  const lines = [`Found ${totalCount} parks. Top picks:`];
  parks.slice(0, 5).forEach((park, index) => {
    const name = park.fullName || park.name;
    const states = park.states || '';
    const reason = park.matchReason;
    let line = `${index + 1}. ${name} (${states})`;
    if (reason) {
      line += `. Why: ${reason}`;
    }
    lines.push(line);
  });
  return lines.join('\n');
}

module.exports = {
  executeParkSearch,
  formatRankedParksDiscoveryBlock,
  formatVoiceSearchResult,
  DISCOVERY_ALIGNMENT_INSTRUCTION,
  DISCOVERY_RESPONSE_FORMAT_BLOCK,
  DISCOVERY_REFINEMENT_CLOSE_BLOCK,
  DISCOVERY_REFINEMENT_FOLLOWUP_BLOCK,
};
