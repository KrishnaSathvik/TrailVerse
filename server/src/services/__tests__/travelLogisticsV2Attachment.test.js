'use strict';

const fs = require('fs');
const path = require('path');
const {
  executeTrailieV2Turn,
} = require('../trailieV2ExecutionService');
const {
  finalizeV2NonCompleteResponse,
} = require('../../routes/ai');

const ROMO = 'nps:park:romo';
const DINO = 'nps:park:dino';

function driveBundle() {
  return {
    requestId: 'turn-logistics-refuse',
    resolutions: [{
      requirementId: 'drive-leg',
      status: 'satisfied_fresh',
      evidenceIds: ['drive-evidence'],
    }],
    evidence: [{
      evidenceId: 'drive-evidence',
      entityId: DINO,
      topic: 'driving_time',
      evidenceType: 'fact',
      claim: {
        identity: 'romo-dino-drive',
        text: null,
        normalizedValue: {
          durationSeconds: 403 * 60,
          distanceMeters: 430000,
        },
        polarity: 'positive',
        subjectId: ROMO,
        objectId: DINO,
      },
      scope: {
        route: {
          originEntityId: ROMO,
          destinationEntityId: DINO,
          travelMode: 'driving',
        },
      },
      source: { provider: 'google_maps' },
    }],
    summary: {
      requirementCount: 1,
      satisfiedFresh: 1,
      satisfiedStaleSafe: 0,
    },
  };
}

describe('Trailie v2 travelLogistics attachment', () => {
  test('drive-cap refuse path attaches route logistics without a canonical plan', async () => {
    const buildLogistics = jest.fn(async ({ routeLegEvidence }) => ({
      schemaVersion: 1,
      transport: {
        routeLegsStatus: 'available',
        routeLegs: routeLegEvidence,
      },
      stays: {},
    }));
    const runModelRouting = jest.fn();
    const tripScope = {
      type: 'road_trip',
      maxDailyDriveMinutes: 240,
      routeLegs: [{
        fromEntityId: ROMO,
        toEntityId: DINO,
        fromDisplayName: 'Rocky Mountain National Park',
        toDisplayName: 'Dinosaur National Monument',
        status: 'requires_driving_evidence',
      }],
    };

    const result = await executeTrailieV2Turn({
      userMessage: 'Road trip from RMNP to Dinosaur, max four hours driving daily',
      planningState: {
        transportation: { mode: 'drive' },
        tripScope,
      },
      constraints: { tripScope, maxDailyDriveMinutes: 240 },
      resolvedContext: {
        resolvedEntities: [{
          entityId: ROMO,
          displayName: 'Rocky Mountain National Park',
          latitude: 40.34,
          longitude: -105.68,
        }],
      },
    }, {
      enabled: true,
      classifyIntent: () => ({
        primaryIntent: 'full_trip',
        verticals: ['parks'],
        depth: 'deep',
        freshness: 'live',
        confidence: 1,
        entities: [],
      }),
      planRequirements: () => [{
        requirementId: 'drive-leg',
        topic: 'driving_time',
        criticality: 'hard',
      }],
      resolveEvidence: async () => driveBundle(),
      buildTravelLogisticsForTurn: buildLogistics,
      runModelRouting,
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      newTurnId: () => 'turn-logistics-refuse',
    });

    expect(result.status).toBe('constraint_infeasible');
    expect(result.terminalReason).toBe('route_leg_exceeds_daily_drive_cap');
    expect(result.canonicalPlan).toBeNull();
    expect(result.travelLogistics).toMatchObject({
      transport: { routeLegsStatus: 'available' },
    });
    expect(result.travelLogistics.transport.routeLegs[0]).toMatchObject({
      fromEntityId: ROMO,
      toEntityId: DINO,
      durationSeconds: 403 * 60,
    });
    expect(buildLogistics).toHaveBeenCalledTimes(1);
    expect(runModelRouting).not.toHaveBeenCalled();
  });

  test('anonymous stream constraint-infeasible terminal forwards travelLogistics', () => {
    const responseFinalized = jest.fn();
    const travelLogistics = {
      schemaVersion: 1,
      transport: { routeLegsStatus: 'available', routeLegs: [] },
      stays: {},
    };

    finalizeV2NonCompleteResponse({
      transport: { responseFinalized },
      v2Result: { status: 'constraint_infeasible', travelLogistics },
      terminalPayload: {
        contentUnchanged: false,
        content: 'The route exceeds your daily driving cap.',
        provider: 'trailie-v2',
        anonymousId: 'anon-stream',
      },
    });

    expect(responseFinalized).toHaveBeenCalledWith(expect.objectContaining({
      anonymousId: 'anon-stream',
      travelLogistics,
    }));
  });

  test('anonymous chat constraint-infeasible terminal forwards travelLogistics', () => {
    const responseFinalized = jest.fn();
    const travelLogistics = {
      schemaVersion: 1,
      transport: { routeLegsStatus: 'available', routeLegs: [] },
      stays: {},
    };

    finalizeV2NonCompleteResponse({
      transport: { responseFinalized },
      v2Result: { status: 'constraint_infeasible', travelLogistics },
      terminalPayload: {
        content: 'The route exceeds your daily driving cap.',
        provider: 'trailie-v2',
        anonymousId: 'anon-chat',
      },
    });

    expect(responseFinalized).toHaveBeenCalledWith(expect.objectContaining({
      anonymousId: 'anon-chat',
      travelLogistics,
    }));
  });

  test('prepared-context bridge forwards planning state into v2 execution', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'trailieRouteBridge.js'),
      'utf8'
    );

    expect(source).toMatch(/planningState:\s*preparedContext\?\.planningState\s*\|\|\s*null/);
  });
});
