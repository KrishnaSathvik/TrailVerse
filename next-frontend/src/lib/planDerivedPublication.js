/**
 * Atomic revision publication for plan-derived surfaces.
 *
 * After a mutation, a surface may show the new plan hash or a pending state.
 * It must never present an older hash as current.
 *
 *   current  — artifact.planHash === planHash (or no plan hash to bind to)
 *   pending  — plan exists, artifact not ready for that hash yet
 *   stale    — artifact is stamped for a different plan (never shown)
 *   absent   — no plan hash and no artifact
 */

export function selectCurrentDerived(artifact, planHash) {
  if (!planHash || typeof planHash !== 'string') {
    if (artifact == null) {
      return Object.freeze({ status: 'absent', value: null });
    }
    return Object.freeze({ status: 'current', value: artifact });
  }

  if (artifact == null) {
    return Object.freeze({ status: 'pending', value: null });
  }

  const artifactHash = artifact?.planHash;
  if (!artifactHash || typeof artifactHash !== 'string') {
    // Not stamped for this revision — do not publish as current.
    return Object.freeze({ status: 'pending', value: null });
  }

  if (artifactHash === planHash) {
    return Object.freeze({ status: 'current', value: artifact });
  }

  return Object.freeze({ status: 'stale', value: null });
}

export function currentDerivedValue(artifact, planHash) {
  return selectCurrentDerived(artifact, planHash).value;
}

/**
 * Publish every derived surface against one plan hash.
 * Values are either current for that hash, or null (pending/stale/absent).
 */
export function publishDerivedSurfaces({
  planHash = null,
  travelLogistics = null,
  warnings = null,
  route = null,
  answer = null,
} = {}) {
  const logistics = selectCurrentDerived(travelLogistics, planHash);
  const warningSurface = selectCurrentDerived(warnings, planHash);
  const routeSurface = selectCurrentDerived(route, planHash);
  const answerSurface = selectCurrentDerived(answer, planHash);
  return Object.freeze({
    planHash: planHash || null,
    travelLogistics: logistics.value,
    travelLogisticsStatus: logistics.status,
    warnings: warningSurface.value,
    warningsStatus: warningSurface.status,
    route: routeSurface.value,
    routeStatus: routeSurface.status,
    answer: answerSurface.value,
    answerStatus: answerSurface.status,
  });
}
