'use strict';

/**
 * Fix Pass #3E — NPS bulk snapshot ingestion completeness.
 *
 * Completeness is about SOURCE INGESTION guarantees (pagination / totals),
 * not destination popularity or candidate counts.
 */

const NPS_SNAPSHOT_SCHEMA_VERSION = 'nps-snapshot-v1';

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null|undefined} meta
 * @returns {boolean}
 */
function isSnapshotIngestionComplete(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.paginationComplete !== true) return false;
  if (meta.generationComplete === false) return false;

  const reportedTotal = finiteNumber(meta.reportedTotal);
  const recordsFetched = finiteNumber(meta.recordsFetched);
  if (reportedTotal != null && recordsFetched != null) {
    return recordsFetched >= reportedTotal;
  }
  // Explicit paginationComplete without totals is accepted (short-page completion).
  return true;
}

/**
 * Decide bulk vs direct for named activities evidence.
 * Unknown/legacy snapshots (no completeness fields) → incomplete → direct.
 *
 * @returns {{
 *   useBulkActivities: boolean,
 *   useBulkPlaces: boolean,
 *   activitiesReason: string,
 *   placesReason: string,
 * }}
 */
function selectNamedActivitiesSources({ activitiesMeta = null, placesMeta = null } = {}) {
  const activitiesComplete = isSnapshotIngestionComplete(activitiesMeta);
  const placesComplete = isSnapshotIngestionComplete(placesMeta);
  return {
    useBulkActivities: activitiesComplete,
    useBulkPlaces: placesComplete,
    activitiesReason: activitiesComplete ? 'snapshot_hit_complete' : 'snapshot_incomplete',
    placesReason: placesComplete ? 'snapshot_hit_complete' : 'snapshot_incomplete',
  };
}

/**
 * Normalize snapshot document / load result into completeness fields.
 */
function snapshotCompletenessFields(snapshot = {}) {
  return {
    schemaVersion: snapshot.schemaVersion || null,
    reportedTotal: finiteNumber(snapshot.reportedTotal),
    recordsFetched: finiteNumber(snapshot.recordsFetched),
    pageCountFetched: finiteNumber(snapshot.pageCountFetched),
    paginationComplete: snapshot.paginationComplete === true,
    generationComplete: snapshot.generationComplete !== false && snapshot.paginationComplete === true
      ? true
      : snapshot.generationComplete === true,
  };
}

module.exports = {
  NPS_SNAPSHOT_SCHEMA_VERSION,
  isSnapshotIngestionComplete,
  selectNamedActivitiesSources,
  snapshotCompletenessFields,
  finiteNumber,
};
