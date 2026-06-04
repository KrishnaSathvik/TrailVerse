/**
 * NPS alerts API uses varied category strings (e.g. "Park Closure", not "Closure").
 */

function isClosureCategory(category = '') {
  const c = String(category).toLowerCase();
  return c === 'closure' || c.includes('closure');
}

function isCautionCategory(category = '') {
  const c = String(category).toLowerCase();
  return c === 'caution' || c.includes('caution');
}

function isInformationCategory(category = '') {
  const c = String(category).toLowerCase();
  return c === 'information' || c.includes('information');
}

/** Alerts that mention roads, passes, or operational access. */
function isRoadRelatedAlert(alert, userMessage = '') {
  const text = `${alert?.title || ''} ${alert?.description || ''}`.toLowerCase();
  if (/\b(road|highway|pass|route|detour|construction|hiker\/biker|bicycl)/i.test(text)) {
    return true;
  }
  if (userMessage && /\b(going[- ]?to[- ]?the[- ]?sun|gtsr|sun road|trail ridge|teton pass)/i.test(userMessage)) {
    const focus = userMessage.toLowerCase();
    if (focus.includes('going') && /sun|gtsr/.test(text)) return true;
    if (focus.includes('trail ridge') && /trail ridge|rocky mountain/i.test(text)) return true;
  }
  return false;
}

function formatAlertLine(alert) {
  const title = (alert.title || 'Alert').trim();
  const desc = (alert.description || '').trim().replace(/\s+/g, ' ');
  if (!desc) return `- ${title}`;
  return `- ${title}: ${desc.slice(0, 280)}${desc.length > 280 ? '…' : ''}`;
}

module.exports = {
  isClosureCategory,
  isCautionCategory,
  isInformationCategory,
  isRoadRelatedAlert,
  formatAlertLine,
};
