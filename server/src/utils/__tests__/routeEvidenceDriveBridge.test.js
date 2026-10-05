'use strict';

/**
 * Offline matrix — Maps evidence → canonical drive-cap consumption.
 * No network / providers / models.
 */

const {
  buildRouteLegCapInfeasibleMessage,
  detectRouteEvidenceProseConflict,
  enrichItineraryWithRouteEvidence,
  evaluateRouteLegsAgainstDailyDriveCap,
  extractDrivingLegsFromEvidenceBundle,
} = require('../routeEvidenceDriveBridge');
const {
  validateMaxDailyDrive,
  validateRouteLegCoverage,
  validateDayDriveActivityFeasibility,
  validateRoadTripContract,
  collectDayDriveMinutes,
} = require('../roadTripValidators');
const { validateItineraryConstraints } = require('../constraintEngine');

const DENVER = 'place:city:denver';
const ROMO = 'nps:park:romo';
const DINO = 'nps:park:dino';
const FG = 'place:known:flaming-gorge';
const ORIGIN_A = 'place:city:a';
const DEST_B = 'nps:park:b';
const DEST_C = 'nps:park:c';

function evidenceLeg(from, to, durationSeconds) {
  return {
    topic: 'driving_time',
    claim: {
      polarity: 'positive',
      subjectId: from,
      objectId: to,
      normalizedValue: { durationSeconds, distanceMeters: 1000 },
    },
    scope: {
      route: {
        originEntityId: from,
        destinationEntityId: to,
      },
    },
  };
}

function bundle(legs) {
  return { evidence: legs.map((l) => evidenceLeg(l.from, l.to, l.seconds)) };
}

function tripScope(legs, { max = 240, type = 'road_trip' } = {}) {
  return {
    type,
    maxDailyDriveMinutes: max,
    origin: { entityId: legs[0]?.from, displayName: 'Origin' },
    destinations: legs.map((l, i) => ({
      entityId: l.to,
      displayName: `Dest ${i + 1}`,
      order: i,
    })),
    routeLegs: legs.map((l) => ({
      fromEntityId: l.from,
      toEntityId: l.to,
      fromDisplayName: l.from,
      toDisplayName: l.to,
      status: 'requires_driving_evidence',
    })),
  };
}

function stop(entityId, extras = {}) {
  return {
    name: entityId,
    entityId,
    destinationEntityId: entityId,
    duration: extras.duration ?? 60,
    drivingTimeFromPreviousMin: extras.drivingTimeFromPreviousMin ?? null,
  };
}

describe('routeEvidenceDriveBridge — offline Cases A–L + Case 7 replay', () => {
  test('CASE A — single leg under cap allowed', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 220 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    expect(evaluateRouteLegsAgainstDailyDriveCap({
      tripScope: scope,
      drivingLegs: legs,
      maxDailyDriveMinutes: 240,
    })).toHaveLength(0);

    const plan = {
      days: [{
        dayNumber: 1,
        stops: [stop(DEST_B, { drivingTimeFromPreviousMin: null })],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBe(220);
    expect(validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope)).toHaveLength(0);
  });

  test('CASE B — single leg over cap → max_daily_drive_exceeded', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 260 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    const intrinsic = evaluateRouteLegsAgainstDailyDriveCap({
      tripScope: scope,
      drivingLegs: legs,
      maxDailyDriveMinutes: 240,
    });
    expect(intrinsic.some((i) => i.reasonCode === 'route_leg_exceeds_daily_drive_cap')).toBe(true);

    const plan = {
      days: [{ dayNumber: 1, stops: [stop(DEST_B)] }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    const issues = validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope);
    expect(issues.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(true);
    expect(issues[0].driveMinutes).toBe(260);
  });

  test('CASE C — Case 7 RMNP→Dinosaur 403 vs 240', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ROMO, to: DINO, seconds: 403 * 60 }])
    );
    const scope = tripScope([{ from: ROMO, to: DINO }], { max: 240 });
    const issues = evaluateRouteLegsAgainstDailyDriveCap({
      tripScope: scope,
      drivingLegs: legs,
      maxDailyDriveMinutes: 240,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].driveMinutes).toBe(403);
    expect(buildRouteLegCapInfeasibleMessage(issues, scope)).toMatch(/4(?:\.0)?-hour|daily driving limit/i);
  });

  test('CASE D — multiple legs same day sum to violation', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(bundle([
      { from: ORIGIN_A, to: DEST_B, seconds: 150 * 60 },
      { from: DEST_B, to: DEST_C, seconds: 120 * 60 },
    ]));
    const scope = tripScope([
      { from: ORIGIN_A, to: DEST_B },
      { from: DEST_B, to: DEST_C },
    ], { max: 240 });
    const plan = {
      days: [{
        dayNumber: 1,
        stops: [stop(DEST_B), stop(DEST_C)],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(collectDayDriveMinutes(bridged.itineraryData.days[0])).toBe(270);
    const issues = validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope);
    expect(issues.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(true);
  });

  test('CASE E — two legs on different days: no drive-cap violation', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(bundle([
      { from: ORIGIN_A, to: DEST_B, seconds: 150 * 60 },
      { from: DEST_B, to: DEST_C, seconds: 120 * 60 },
    ]));
    const scope = tripScope([
      { from: ORIGIN_A, to: DEST_B },
      { from: DEST_B, to: DEST_C },
    ], { max: 240 });
    const plan = {
      days: [
        { dayNumber: 1, stops: [stop(DEST_B)] },
        { dayNumber: 2, stops: [stop(DEST_C)] },
      ],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(collectDayDriveMinutes(bridged.itineraryData.days[0])).toBe(150);
    expect(collectDayDriveMinutes(bridged.itineraryData.days[1])).toBe(120);
    expect(validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope)).toHaveLength(0);
  });

  test('CASE F — drive + activity overflow global ceiling', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 220 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 500 });
    const plan = {
      days: [{
        dayNumber: 1,
        bufferMinutes: 60,
        stops: [
          stop(DEST_B, { duration: 5 * 60 }),
          { name: 'hike', entityId: DEST_B, duration: 8 * 60, drivingTimeFromPreviousMin: null },
        ],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    const issues = validateDayDriveActivityFeasibility(bridged.itineraryData);
    expect(issues.some((i) => i.reasonCode === 'drive_activity_day_overflow')).toBe(true);
    // Same canonical drive feeds constraintEngine schedule overflow.
    const viaEngine = validateItineraryConstraints(bridged.itineraryData, {
      hasConstraints: true,
      tripScope: bridged.tripScope,
      maxDailyDriveMinutes: 500,
    }, { drivingEvidenceLegs: legs });
    expect(viaEngine.some((i) => i.reasonCode === 'drive_activity_day_overflow')).toBe(true);
  });

  test('CASE G — no model drive stop; Maps still visible to validator', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 260 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    // Destination change only — no explicit "drive" stop type.
    const plan = {
      days: [{
        dayNumber: 1,
        destinationEntityId: DEST_B,
        stops: [{
          name: 'Afternoon at B',
          type: 'activity',
          entityId: DEST_B,
          duration: 120,
          drivingTimeFromPreviousMin: null,
        }],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBe(260);
    expect(
      validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope)
        .some((i) => i.reasonCode === 'max_daily_drive_exceeded')
    ).toBe(true);
  });

  test('CASE H — Maps overrides contradictory model duration', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 260 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    const plan = {
      days: [{
        dayNumber: 1,
        stops: [stop(DEST_B, { drivingTimeFromPreviousMin: 120 })],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBe(260);
    expect(
      validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope)
        .some((i) => i.reasonCode === 'max_daily_drive_exceeded')
    ).toBe(true);
  });

  test('CASE I — missing Maps remains fail-closed', () => {
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    const issues = validateRouteLegCoverage(scope, { drivingEvidenceLegs: [] });
    expect(issues.some((i) => i.reasonCode === 'missing_route_evidence')).toBe(true);
    const plan = { days: [{ dayNumber: 1, stops: [stop(DEST_B)] }] };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      evidenceBundle: { evidence: [] },
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBeNull();
  });

  test('CASE J — wrong route evidence must not satisfy needed leg', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(
      bundle([{ from: ORIGIN_A, to: DEST_C, seconds: 100 * 60 }])
    );
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    expect(validateRouteLegCoverage(scope, { drivingEvidenceLegs: legs })
      .some((i) => i.reasonCode === 'missing_route_evidence')).toBe(true);
    const plan = { days: [{ dayNumber: 1, stops: [stop(DEST_B)] }] };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBeNull();
  });

  test('CASE K — cache isolation by origin+destination', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(bundle([
      { from: ORIGIN_A, to: DEST_B, seconds: 100 * 60 },
      { from: DEST_C, to: DEST_B, seconds: 300 * 60 },
    ]));
    const byAB = legs.find((l) => l.fromEntityId === ORIGIN_A && l.toEntityId === DEST_B);
    const byCB = legs.find((l) => l.fromEntityId === DEST_C && l.toEntityId === DEST_B);
    expect(byAB.durationMinutes).toBe(100);
    expect(byCB.durationMinutes).toBe(300);

    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    const plan = { days: [{ dayNumber: 1, stops: [stop(DEST_B)] }] };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBe(100);
  });

  test('CASE L — loop return leg counts toward return day', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(bundle([
      { from: ORIGIN_A, to: DEST_B, seconds: 60 * 60 },
      { from: DEST_B, to: DEST_C, seconds: 60 * 60 },
      { from: DEST_C, to: ORIGIN_A, seconds: 250 * 60 },
    ]));
    const scope = {
      ...tripScope([
        { from: ORIGIN_A, to: DEST_B },
        { from: DEST_B, to: DEST_C },
        { from: DEST_C, to: ORIGIN_A },
      ], { max: 240 }),
      routeShape: 'loop',
    };
    const plan = {
      days: [
        { dayNumber: 1, stops: [stop(DEST_B)] },
        { dayNumber: 2, stops: [stop(DEST_C)] },
        { dayNumber: 3, stops: [stop(ORIGIN_A)] },
      ],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: scope,
      drivingLegs: legs,
    });
    expect(collectDayDriveMinutes(bridged.itineraryData.days[2])).toBe(250);
    expect(
      validateMaxDailyDrive(bridged.itineraryData, bridged.tripScope)
        .some((i) => i.reasonCode === 'max_daily_drive_exceeded' && i.dayIndex === 2)
    ).toBe(true);
  });

  test('Phase 9C.1B — a single-destination itinerary with NO route evidence at all strips a model-authored drive minute instead of leaving it unverified', () => {
    // Before this fix, the `byKey.size === 0` branch returned the plan
    // completely untouched — a model-authored drivingTimeFromPreviousMin
    // would silently survive as if it were verified. It never was.
    const plan = { days: [{ dayNumber: 1, stops: [stop(DEST_B, { drivingTimeFromPreviousMin: 45 })] }] };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: plan,
      tripScope: null,
      evidenceBundle: { evidence: [] },
    });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBeNull();
  });

  test('Phase 9C.1B — an unrelated stop elsewhere in the SAME plan (no evidence for it) is also stripped, even when other stops have verified evidence', () => {
    const legs = extractDrivingLegsFromEvidenceBundle(bundle([{ from: ORIGIN_A, to: DEST_B, seconds: 100 * 60 }]));
    const scope = tripScope([{ from: ORIGIN_A, to: DEST_B }], { max: 240 });
    const plan = {
      days: [{
        dayNumber: 1,
        stops: [
          stop(DEST_B), // gets the verified inbound leg
          stop(DEST_B, { drivingTimeFromPreviousMin: 999 }), // same entity, no leg — must be stripped
        ],
      }],
    };
    const bridged = enrichItineraryWithRouteEvidence({ itineraryData: plan, tripScope: scope, drivingLegs: legs });
    expect(bridged.itineraryData.days[0].stops[0].drivingTimeFromPreviousMin).toBe(100);
    expect(bridged.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();
  });

  test('CASE 7 static replay — Denver→RMNP→Dino→FG; 403 > 240 hard conflict', () => {
    const evidence = bundle([
      { from: DENVER, to: ROMO, seconds: 106 * 60 },
      { from: ROMO, to: DINO, seconds: 403 * 60 },
      { from: DINO, to: FG, seconds: 166 * 60 },
    ]);
    const legs = extractDrivingLegsFromEvidenceBundle(evidence);
    expect(legs).toHaveLength(3);
    expect(legs.find((l) => l.fromEntityId === ROMO && l.toEntityId === DINO).durationMinutes).toBe(403);

    const scope = tripScope([
      { from: DENVER, to: ROMO },
      { from: ROMO, to: DINO },
      { from: DINO, to: FG },
    ], { max: 240 });

    const preGen = evaluateRouteLegsAgainstDailyDriveCap({
      tripScope: scope,
      drivingLegs: legs,
      maxDailyDriveMinutes: 240,
    });
    expect(preGen.some((i) => i.reasonCode === 'route_leg_exceeds_daily_drive_cap')).toBe(true);
    expect(preGen[0].driveMinutes).toBe(403);

    // Even if GPT emitted a transfer day with null drives, enrichment + validators fail.
    const gptPlan = {
      days: [
        { dayNumber: 1, stops: [stop(ROMO)] },
        { dayNumber: 2, stops: [stop(DINO, { duration: 240, drivingTimeFromPreviousMin: null })] },
        { dayNumber: 3, stops: [stop(FG)] },
      ],
    };
    const bridged = enrichItineraryWithRouteEvidence({
      itineraryData: gptPlan,
      tripScope: scope,
      evidenceBundle: evidence,
    });
    expect(bridged.itineraryData.days[1].stops[0].drivingTimeFromPreviousMin).toBe(403);
    const contractIssues = validateRoadTripContract(bridged.itineraryData, bridged.tripScope, {
      drivingEvidenceLegs: legs,
      constraints: { maxDailyDriveMinutes: 240 },
    });
    expect(contractIssues.some((i) =>
      i.reasonCode === 'route_leg_exceeds_daily_drive_cap'
      || i.reasonCode === 'max_daily_drive_exceeded'
    )).toBe(true);

    // Prose consistency: cannot claim route timing unavailable when Maps exists.
    const badProse =
      'Day 2 transfer: supplied evidence does not establish a route-specific driving time.';
    expect(detectRouteEvidenceProseConflict(badProse, evidence))
      .toEqual(['route_evidence_prose_conflict']);
    expect(detectRouteEvidenceProseConflict('Drive is about 6.7 hours per Maps.', evidence))
      .toEqual([]);
  });
});
