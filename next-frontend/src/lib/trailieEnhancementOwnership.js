/**
 * Turn-scoped ownership for structured Trailie enhancements.
 *
 * Never render travelLogistics just because the payload exists somewhere
 * on the session, revision, or restored conversation.
 */

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^nps:park:/, '')
    .replace(/national park/g, '')
    .replace(/state park/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addToken(set, value) {
  const token = normalizeToken(value);
  if (token.length >= 3) set.add(token);
}

function tokensOverlap(left, right) {
  for (const a of left) {
    for (const b of right) {
      if (a === b || a.includes(b) || b.includes(a)) return true;
    }
  }
  return false;
}

export function collectResponseDestinationTokens(response = {}) {
  const tokens = new Set();
  addToken(tokens, response.canonicalPlan?.parkName);
  addToken(tokens, response.canonicalPlan?.parkCode);
  addToken(tokens, response.parkName);
  addToken(tokens, response.parkCode);
  for (const name of response.sources?.parkNames || []) addToken(tokens, name);
  for (const name of response.parkNames || []) addToken(tokens, name);
  return tokens;
}

export function collectLogisticsDestinationTokens(logistics = {}) {
  const tokens = new Set();
  const destination = logistics.destination || {};
  addToken(tokens, destination.parkName);
  addToken(tokens, destination.parkCode);
  addToken(tokens, destination.entityId);
  addToken(tokens, logistics.stays?.gateway?.areaLabel);
  for (const airport of logistics.transport?.airports || []) {
    addToken(tokens, airport?.groundTransfer?.destinationLabel);
  }
  for (const leg of logistics.transport?.routeLegs || []) {
    addToken(tokens, leg?.destinationLabel);
  }
  return tokens;
}

export function travelLogisticsBelongsToTurn(logistics, response = {}) {
  if (!logistics || typeof logistics !== 'object') return false;
  const responseTokens = collectResponseDestinationTokens(response);
  const logisticsTokens = collectLogisticsDestinationTokens(logistics);
  if (!responseTokens.size || !logisticsTokens.size) return false;
  return tokensOverlap(responseTokens, logisticsTokens);
}
