/**
 * P0-4 (audit 2026-08-31) — UI default ≠ traveler preference.
 *
 * Quick Fill and chat form state initialize with values (groupSize, a
 * 'moderate' budget tier, 'camping') that used to enter the model context as
 * traveler statements — Trailie argued about a "$3 total budget" and called
 * the traveler "solo" though they said neither. Only values the traveler
 * typed, selected, or confirmed may travel as constraints.
 *
 * Provenance is explicit, never inferred from values: a form created by the
 * UI carries a `fieldProvenance` map, empty until the traveler touches a
 * field; deliberately choosing a value that equals the default keeps it.
 * Form data WITHOUT a provenance map (saved trips, restored sessions,
 * server echoes — all products of an explicit submission) passes through
 * unchanged.
 */

const USER = 'user';

/** A fresh form: all values are defaults, nothing is traveler-owned. */
export function createUntouchedFormData(defaults = {}) {
  return { ...defaults, fieldProvenance: {} };
}

/** Applies a patch AND marks every patched field as traveler-owned. */
export function touchFormField(formData = {}, patch = {}) {
  const provenance = { ...(formData.fieldProvenance || {}) };
  for (const key of Object.keys(patch)) provenance[key] = USER;
  return { ...formData, ...patch, fieldProvenance: provenance };
}

export function getTouchedFields(formData) {
  const provenance = formData?.fieldProvenance;
  if (!provenance) return [];
  return Object.keys(provenance).filter((key) => provenance[key] === USER);
}

/**
 * The view of the form that may reach the model: traveler-owned fields only.
 * Keeps the provenance map so round-trips (session restore, saved trips)
 * stay provenance-aware. Legacy objects without a map pass through as-is.
 */
export function selectTravelerOwnedFormData(formData) {
  if (formData == null) return formData;
  const provenance = formData.fieldProvenance;
  if (!provenance) return formData;

  const owned = { fieldProvenance: { ...provenance } };
  for (const key of Object.keys(provenance)) {
    if (provenance[key] === USER && key in formData) {
      owned[key] = formData[key];
    }
  }
  return owned;
}
