import { selectTravelerOwnedFormData } from '@/lib/formDataProvenance';

/**
 * P0-4 — the Quick Fill summary message speaks AS the traveler ("Here are my
 * trip details: …"), so it may only state fields the traveler touched. An
 * untouched wizard default is not the traveler's statement. Legacy form data
 * without a provenance map (explicitly submitted historical state) keeps its
 * full behavior.
 */
export function buildQuickFillSummaryParts(data, parkFullName = null) {
  const owned = selectTravelerOwnedFormData(data) || {};
  const parts = [];
  if (parkFullName && owned.parkCode) parts.push(`**Destination:** ${parkFullName}`);
  if (owned.startDate && owned.endDate) parts.push(`**Dates:** ${owned.startDate} to ${owned.endDate}`);
  if (owned.groupSize) parts.push(`**Group size:** ${owned.groupSize}`);
  if (owned.interests?.length) parts.push(`**Interests:** ${owned.interests.join(', ')}`);
  if (owned.budget) parts.push(`**Budget:** ${owned.budget}`);
  if (owned.fitnessLevel) parts.push(`**Fitness level:** ${owned.fitnessLevel}`);
  if (owned.accommodation) parts.push(`**Accommodation:** ${owned.accommodation}`);
  return parts;
}
