/**
 * Follow-up user message when accepting the discovery → itinerary CTA.
 * Wording avoids forcing immediate JSON generation — server uses dayByDayPlanIntake metadata.
 */
export function buildDayByDayPlanFollowUp({ parkName, parkNames } = {}) {
  const parks = [parkName, ...(parkNames || [])].filter(Boolean);
  const unique = [...new Set(parks)];
  const primary = unique[0];

  if (primary) {
    return `I'd like a day-by-day plan for ${primary} based on your recommendations. Ask me anything you still need before building the full itinerary.`;
  }

  return "I'd like a day-by-day plan for your top pick. Ask me anything you still need before building the full itinerary.";
}
