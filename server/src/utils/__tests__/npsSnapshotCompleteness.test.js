'use strict';

const {
  isSnapshotIngestionComplete,
  selectNamedActivitiesSources,
  snapshotCompletenessFields,
} = require('../npsSnapshotCompleteness');

describe('Fix Pass #3E snapshot completeness contract', () => {
  test('CASE A: complete snapshot with reconciled totals', () => {
    expect(isSnapshotIngestionComplete({
      reportedTotal: 20,
      recordsFetched: 20,
      paginationComplete: true,
      generationComplete: true,
    })).toBe(true);
  });

  test('CASE B: incomplete when fetched < reported', () => {
    expect(isSnapshotIngestionComplete({
      reportedTotal: 20,
      recordsFetched: 2,
      paginationComplete: false,
    })).toBe(false);
    expect(isSnapshotIngestionComplete({
      reportedTotal: 20,
      recordsFetched: 2,
      paginationComplete: true, // flag lies; totals win
    })).toBe(false);
  });

  test('CASE C: genuinely small complete snapshot remains usable', () => {
    expect(isSnapshotIngestionComplete({
      reportedTotal: 2,
      recordsFetched: 2,
      paginationComplete: true,
      generationComplete: true,
    })).toBe(true);
  });

  test('CASE D: generation incomplete / unknown legacy → not complete', () => {
    expect(isSnapshotIngestionComplete({
      reportedTotal: 20,
      recordsFetched: 20,
      paginationComplete: true,
      generationComplete: false,
    })).toBe(false);
    expect(isSnapshotIngestionComplete({})).toBe(false);
    expect(isSnapshotIngestionComplete(null)).toBe(false);
    expect(isSnapshotIngestionComplete({
      itemCount: 500,
      fetchedAt: new Date(),
    })).toBe(false);
  });

  test('source selection uses completeness, not candidate counts', () => {
    const complete = selectNamedActivitiesSources({
      activitiesMeta: { reportedTotal: 2, recordsFetched: 2, paginationComplete: true },
      placesMeta: { reportedTotal: 2, recordsFetched: 2, paginationComplete: true },
    });
    expect(complete).toMatchObject({
      useBulkActivities: true,
      useBulkPlaces: true,
      activitiesReason: 'snapshot_hit_complete',
      placesReason: 'snapshot_hit_complete',
    });

    const incomplete = selectNamedActivitiesSources({
      activitiesMeta: { reportedTotal: 20, recordsFetched: 2, paginationComplete: false },
      placesMeta: { reportedTotal: 20, recordsFetched: 2, paginationComplete: false },
    });
    expect(incomplete).toMatchObject({
      useBulkActivities: false,
      useBulkPlaces: false,
      activitiesReason: 'snapshot_incomplete',
      placesReason: 'snapshot_incomplete',
    });
  });

  test('snapshotCompletenessFields normalizes legacy docs', () => {
    expect(snapshotCompletenessFields({ data: [] })).toMatchObject({
      paginationComplete: false,
      generationComplete: false,
    });
  });
});
